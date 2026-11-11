#!/usr/bin/env python3
"""Yggdrasil - servidor local.

Serve o painel em http://localhost:8090 e guarda tudo em dados.json (na mesma pasta):
  GET/PUT /api/dados   links, grupos, eventos, tarefas, notas e ajustes (do perfil escolhido)
  /api/perfis          perfis (cada pessoa com seus dados, email e PIN opcional)
  GET     /api/ics     eventos de uma agenda externa (link .ics, ex.: Outlook ou Google)

A cada salvamento o arquivo anterior vira dados.bak.json, e uma cópia do dia
fica em backups/ (guarda os últimos 14 dias).

Só usa a biblioteca padrão do Python (3.9+), nada para instalar.
Uso:  python3 servidor.py           (só sobe o servidor)
      python3 servidor.py --abrir   (sobe e abre o navegador)
"""

import ipaddress
import hashlib
import hmac
import json
import secrets
import os
import re
import shutil
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import date, datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

import email_outlook as outlook
import resumo_ia

try:
    from zoneinfo import ZoneInfo
except ImportError:  # Python antigo: só fusos com offset fixo
    ZoneInfo = None

PASTA = os.path.dirname(os.path.abspath(__file__))
PASTA_REAL = os.path.realpath(PASTA)
DADOS = os.path.join(PASTA, "dados.json")
BACKUP = os.path.join(PASTA, "dados.bak.json")
PASTA_BACKUPS = os.path.join(PASTA, "backups")
PORTA = int(os.environ.get("YGG_PORTA", "8090"))
CACHE_SEGUNDOS = 10 * 60
MAX_CORPO = 20 * 1024 * 1024

_cache = {"quando": 0, "url": None, "texto": None}
_trava = threading.Lock()

# ===================== LEITURA DO .ICS =====================

def desdobrar_linhas(texto):
    """Junta as linhas quebradas do iCalendar (continuação começa com espaço)."""
    linhas = []
    for linha in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if linha[:1] in (" ", "\t") and linhas:
            linhas[-1] += linha[1:]
        elif linha:
            linhas.append(linha)
    return linhas


def separar(linha):
    """'DTSTART;TZID=X:2026...' -> ('DTSTART', {'TZID': 'X'}, '2026...')"""
    cabeca, _, valor = linha.partition(":")
    partes = cabeca.split(";")
    params = {}
    for p in partes[1:]:
        k, _, v = p.partition("=")
        params[k.upper()] = v.strip('"')
    return partes[0].upper(), params, valor


def texto_ics(valor):
    return valor.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def ler_calendario(texto):
    """Devolve (eventos, fusos). Cada evento é um dict com as propriedades cruas."""
    eventos, fusos = [], {}
    pilha, atual, fuso_atual, sub_fuso = [], None, None, None
    for linha in desdobrar_linhas(texto):
        nome, params, valor = separar(linha)
        if nome == "BEGIN":
            pilha.append(valor.upper())
            if valor.upper() == "VEVENT":
                atual = {"EXDATE": []}
            elif valor.upper() == "VTIMEZONE":
                fuso_atual = {"id": None, "STANDARD": None, "DAYLIGHT": None}
            elif valor.upper() in ("STANDARD", "DAYLIGHT") and fuso_atual is not None:
                sub_fuso = valor.upper()
            continue
        if nome == "END":
            fim = pilha.pop() if pilha else None
            if fim == "VEVENT" and atual is not None:
                eventos.append(atual)
                atual = None
            elif fim == "VTIMEZONE" and fuso_atual and fuso_atual["id"]:
                fusos[fuso_atual["id"]] = fuso_atual
                fuso_atual = None
            elif fim in ("STANDARD", "DAYLIGHT"):
                sub_fuso = None
            continue
        if atual is not None and pilha and pilha[-1] == "VEVENT":
            if nome == "EXDATE":
                atual["EXDATE"].extend((params, v) for v in valor.split(","))
            else:
                atual[nome] = (params, valor)
        elif fuso_atual is not None:
            if nome == "TZID":
                fuso_atual["id"] = valor
            elif nome == "TZOFFSETTO" and sub_fuso:
                fuso_atual[sub_fuso] = valor
    return eventos, fusos


def offset_para_tz(texto):
    m = re.match(r"([+-])(\d{2})(\d{2})", texto or "")
    if not m:
        return None
    minutos = int(m.group(2)) * 60 + int(m.group(3))
    return timezone(timedelta(minutes=minutos if m.group(1) == "+" else -minutos))


def achar_fuso(tzid, fusos):
    """IANA (ex.: America/Sao_Paulo) via zoneinfo; nomes do Windows via VTIMEZONE do próprio arquivo."""
    if not tzid:
        return None
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tzid)
        except Exception:
            pass
    info = fusos.get(tzid)
    if info:
        return offset_para_tz(info["STANDARD"] or info["DAYLIGHT"])
    return None


def ler_data(params, valor, fusos):
    """Devolve (datetime com fuso, dia_inteiro)."""
    valor = valor.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", valor):
        d = datetime.strptime(valor[:8], "%Y%m%d")
        return d.replace(tzinfo=LOCAL), True
    utc = valor.endswith("Z")
    d = datetime.strptime(valor.rstrip("Z")[:15], "%Y%m%dT%H%M%S")
    if utc:
        return d.replace(tzinfo=timezone.utc), False
    tz = achar_fuso(params.get("TZID"), fusos) or LOCAL
    return d.replace(tzinfo=tz), False


LOCAL = datetime.now().astimezone().tzinfo

DIAS_SEMANA = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def somar_meses(d, meses):
    m = d.month - 1 + meses
    ano, mes = d.year + m // 12, m % 12 + 1
    try:
        return d.replace(year=ano, month=mes)
    except ValueError:  # dia 31 em mês curto: pula
        return None


def repeticoes(inicio, regra, limite):
    """Expande as RRULEs mais comuns (diária, semanal com BYDAY, mensal, anual)."""
    r = dict(p.split("=", 1) for p in regra.split(";") if "=" in p)
    freq = r.get("FREQ", "").upper()
    intervalo = int(r.get("INTERVAL", "1") or 1)
    contagem = int(r["COUNT"]) if "COUNT" in r else None
    ate = None
    if "UNTIL" in r:
        u = r["UNTIL"]
        if len(u) == 8:
            ate = datetime.strptime(u, "%Y%m%d").replace(tzinfo=inicio.tzinfo) + timedelta(days=1)
        else:
            ate = datetime.strptime(u.rstrip("Z")[:15], "%Y%m%dT%H%M%S").replace(
                tzinfo=timezone.utc if u.endswith("Z") else inicio.tzinfo)
    dias = [DIAS_SEMANA[d[-2:]] for d in r.get("BYDAY", "").split(",") if d[-2:] in DIAS_SEMANA]

    gerados = 0
    passo = 0
    while passo < 5000:
        if freq == "DAILY":
            candidatos = [inicio + timedelta(days=passo * intervalo)]
        elif freq == "WEEKLY":
            base = inicio + timedelta(weeks=passo * intervalo)
            if dias:
                seg = base - timedelta(days=base.weekday())
                candidatos = sorted(seg + timedelta(days=d) for d in dias)
                candidatos = [c for c in candidatos if c >= inicio]
            else:
                candidatos = [base]
        elif freq == "MONTHLY":
            c = somar_meses(inicio, passo * intervalo)
            candidatos = [c] if c else []
        elif freq == "YEARLY":
            c = somar_meses(inicio, passo * intervalo * 12)
            candidatos = [c] if c else []
        else:
            yield inicio
            return
        for c in candidatos:
            if (ate and c > ate) or (contagem is not None and gerados >= contagem) or c > limite:
                return
            gerados += 1
            yield c
        passo += 1



def eventos_no_periodo(texto, agora, limite):
    """Todas as ocorrências que encostam no intervalo [agora, limite]."""
    eventos, fusos = ler_calendario(texto)
    resultado = []
    # Ocorrências editadas de eventos recorrentes (RECURRENCE-ID) substituem a original
    substituidas = set()
    for ev in eventos:
        if "RECURRENCE-ID" in ev and "UID" in ev:
            p, v = ev["RECURRENCE-ID"]
            substituidas.add((ev["UID"][1], ler_data(p, v, fusos)[0]))

    for ev in eventos:
        if "DTSTART" not in ev:
            continue
        if ev.get("STATUS", ({}, ""))[1].upper() == "CANCELLED":
            continue
        inicio, dia_inteiro = ler_data(*ev["DTSTART"], fusos)
        if "DTEND" in ev:
            fim = ler_data(*ev["DTEND"], fusos)[0]
        elif "DURATION" in ev:
            m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", ev["DURATION"][1])
            dd, hh, mm = (int(x) if x else 0 for x in m.groups()) if m else (0, 0, 0)
            fim = inicio + timedelta(days=dd, hours=hh, minutes=mm)
        else:
            fim = inicio + (timedelta(days=1) if dia_inteiro else timedelta(0))
        duracao = fim - inicio
        excluidas = {ler_data(p, v, fusos)[0] for p, v in ev["EXDATE"]}
        uid = ev.get("UID", ({}, ""))[1]

        if "RRULE" in ev and "RECURRENCE-ID" not in ev:
            ocorrencias = repeticoes(inicio, ev["RRULE"][1], limite)
        else:
            ocorrencias = [inicio]

        for oc in ocorrencias:
            if oc in excluidas or ("RRULE" in ev and (uid, oc) in substituidas):
                continue
            if oc + duracao <= agora or oc >= limite:
                continue
            resultado.append({
                "titulo": texto_ics(ev.get("SUMMARY", ({}, "(sem título)"))[1]) or "(sem título)",
                "local": texto_ics(ev.get("LOCATION", ({}, ""))[1]),
                # dia inteiro vai só com a data, para não depender de fuso
                "inicio": oc.date().isoformat() if dia_inteiro else oc.isoformat(),
                "fim": (oc + duracao).date().isoformat() if dia_inteiro else (oc + duracao).isoformat(),
                "diaInteiro": dia_inteiro,
            })

    resultado.sort(key=lambda e: e["inicio"])
    return resultado


# ===================== NOTIFICAÇÕES (app Android) =====================
# O app do celular pergunta /api/notificacoes a cada ~15 min e decide sozinho o que avisar.

def _dia_js(d):
    return (d.weekday() + 1) % 7  # domingo = 0, como no navegador


def ocorre_local(ev, d):
    """Mesma regra do ocorre() do app.js."""
    di = d.isoformat()
    data = ev.get("data") or ""
    if not data or di < data or (ev.get("ate") and di > ev["ate"]) or di in (ev.get("excecoes") or []):
        return False
    try:
        ini = date.fromisoformat(data)
    except ValueError:
        return False
    regra = ev.get("repetir") or "nao"
    if regra == "diario":
        return True
    if regra == "semanal":
        return _dia_js(d) in (ev.get("dias") or [_dia_js(ini)])
    if regra == "mensal":
        return d.day == ini.day
    if regra == "anual":
        return d.day == ini.day and d.month == ini.month
    return di == data


_ics_notif = {}  # url -> (quando, eventos)


def proximos_eventos(dados, horas=36):
    agora = datetime.now(LOCAL)
    limite = agora + timedelta(hours=horas)
    r = []
    for i in range(3):
        d = (agora + timedelta(days=i)).date()
        for ev in dados.get("eventos") or []:
            hora = ev.get("hora") or ""
            if not re.fullmatch(r"\d{2}:\d{2}", hora) or not ocorre_local(ev, d):
                continue
            ini = datetime(d.year, d.month, d.day, int(hora[:2]), int(hora[3:]), tzinfo=LOCAL)
            if agora <= ini <= limite:
                r.append({"chave": f"{ev.get('id')}|{d.isoformat()}|{hora}", "titulo": ev.get("titulo") or "(sem título)",
                          "local": ev.get("local") or "", "inicio": int(ini.timestamp() * 1000)})
    url = ((dados.get("ajustes") or {}).get("icsUrl") or "").strip()
    if url:
        try:
            guardado = _ics_notif.get(url)
            if not guardado or time.time() - guardado[0] > 25 * 60:
                guardado = (time.time(), eventos_no_periodo(baixar_ics(url), agora, limite))
                _ics_notif[url] = guardado
            for e in guardado[1]:
                if e.get("diaInteiro"):
                    continue
                ini = datetime.fromisoformat(e["inicio"])
                if agora <= ini <= limite:
                    r.append({"chave": f"ics|{e['titulo']}|{e['inicio']}", "titulo": e["titulo"], "local": e.get("local") or "",
                              "inicio": int(ini.timestamp() * 1000)})
        except Exception:
            pass  # agenda externa fora do ar: só os eventos locais
    r.sort(key=lambda e: e["inicio"])
    return r[:30]


CONFIG_SERVIDOR = os.path.join(PASTA, "servidor-config.json")


def rede_ligada():
    """Outros aparelhos da rede (celular etc.) só entram se isso estiver ligado.
    Padrão: desligado (só este PC). Liga em Ajustes > Endereços, ou com YGG_REDE=1."""
    if os.environ.get("YGG_SO_LOCAL") == "1":
        return False
    if os.environ.get("YGG_REDE") == "1":
        return True
    try:
        with open(CONFIG_SERVIDOR, encoding="utf-8") as f:
            return json.load(f).get("rede") is True
    except (OSError, ValueError):
        return False


def salvar_rede(ligada):
    try:
        with open(CONFIG_SERVIDOR, encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    cfg["rede"] = bool(ligada)
    gravar_json(CONFIG_SERVIDOR, cfg)


def porta_aberta(host, porta):
    try:
        socket.create_connection((host, porta), 0.4).close()
        return True
    except OSError:
        return False


def info_rede():
    """Endereços para abrir o Yggdrasil neste PC e em outros aparelhos."""
    ip = ip_da_rede()
    return {"ip": ip, "porta": PORTA, "rede": rede_ligada(), "redeAoIniciar": REDE_AO_INICIAR}


# ===================== PERFIS =====================
# perfis.json guarda a lista de perfis. O perfil "principal" usa o dados.json de
# sempre; os outros usam perfis/<id>.json. PIN guardado só como hash (PBKDF2).

PERFIS = os.path.join(PASTA, "perfis.json")
PASTA_PERFIS = os.path.join(PASTA, "perfis")
CORES = ("c1", "c2", "c3", "c4", "c5", "c6")
_erros_pin = {}  # perfil -> (tentativas erradas, bloqueado até)
_pins_ok = set()


def gravar_json(caminho, dados):
    temporario = caminho + ".tmp"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(temporario, caminho)


def ler_perfis():
    try:
        with open(PERFIS, encoding="utf-8") as f:
            lista = json.load(f).get("perfis") or []
        if any(p.get("id") == "principal" for p in lista):
            return lista
    except (FileNotFoundError, ValueError):
        pass
    nome = ((ler_dados("principal") or {}).get("perfil") or {}).get("nome") or "Eu"
    return [{"id": "principal", "nome": nome, "cor": "c1", "pin": None}]


def salvar_perfis(lista):
    with _trava:
        gravar_json(PERFIS, {"perfis": lista})


def achar_perfil(id_perfil):
    return next((p for p in ler_perfis() if p.get("id") == id_perfil), None)


def perfil_publico(p):
    return {"id": p["id"], "nome": p.get("nome", ""), "cor": p.get("cor", "c1"),
            "temPin": bool(p.get("pin")), "principal": p["id"] == "principal"}


def hash_pin(pin, sal=None):
    sal = sal or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), bytes.fromhex(sal), 200_000).hex()
    return {"sal": sal, "hash": h}


def pin_confere(perfil, pin):
    guardado = perfil.get("pin")
    if not guardado:
        return True
    tentativas, ate = _erros_pin.get(perfil["id"], (0, 0))
    if time.time() < ate:
        return False
    if not isinstance(pin, str):
        return False
    # PIN já conferido antes (evita refazer o PBKDF2 a cada pedido)
    memo = (perfil["id"], guardado["hash"], hashlib.sha256((guardado["sal"] + pin).encode()).hexdigest())
    if memo in _pins_ok:
        return True
    ok = hmac.compare_digest(hash_pin(pin, guardado["sal"])["hash"], guardado["hash"])
    if ok:
        _pins_ok.add(memo)
    if ok:
        _erros_pin.pop(perfil["id"], None)
    else:
        tentativas += 1
        # A partir do 5º erro seguido, cada erro faz esperar: 30 s, 1 min, 2 min... (até 1 h)
        espera = min(3600, 30 * 2 ** (tentativas - 5)) if tentativas >= 5 else 0
        _erros_pin[perfil["id"]] = (tentativas, time.time() + espera)
    return ok


def validar_pin_novo(pin):
    if not isinstance(pin, str) or not pin.isdigit() or not 6 <= len(pin) <= 8:
        raise ValueError("O PIN precisa ter de 6 a 8 números")


def perfis_configurados():
    """False na primeira vez que o Yggdrasil abre (ainda não há perfil criado)."""
    return os.path.exists(PERFIS)


def erro_publico(erro):
    """Mensagem que pode ir para o navegador. Erros nossos (ValueError, RuntimeError e erros de conta)
    já vêm com texto pensado para a pessoa; o resto vai só para o terminal."""
    if isinstance(erro, (ValueError, RuntimeError)) or type(erro).__name__ == "ErroConta":
        return str(erro)[:300]
    import traceback
    traceback.print_exception(type(erro), erro, erro.__traceback__)
    return "Algo deu errado. Os detalhes estão no terminal do Yggdrasil."


# ===================== DADOS =====================

def arquivo_dados(perfil):
    if perfil == "principal":
        return DADOS
    return os.path.join(PASTA_PERFIS, f"{perfil}.json")


def ler_dados(perfil="principal"):
    try:
        with open(arquivo_dados(perfil), encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def salvar_dados(dados, perfil="principal"):
    with _trava:
        caminho = arquivo_dados(perfil)
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        if os.path.exists(caminho):
            if perfil == "principal":
                shutil.copyfile(caminho, BACKUP)
            pasta_bkp = PASTA_BACKUPS if perfil == "principal" else os.path.join(PASTA_BACKUPS, perfil)
            os.makedirs(pasta_bkp, exist_ok=True)
            hoje = os.path.join(pasta_bkp, date.today().isoformat() + ".json")
            if not os.path.exists(hoje):
                shutil.copyfile(caminho, hoje)
                antigos = sorted(n for n in os.listdir(pasta_bkp) if n.endswith(".json"))
                for nome in antigos[:-14]:
                    os.remove(os.path.join(pasta_bkp, nome))
        gravar_json(caminho, dados)


def verificar_url_externa(url):
    """A agenda externa só pode vir da internet: http/https, nunca arquivo local nem endereço interno."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("A agenda externa precisa ser um endereço http:// ou https://")
    try:
        enderecos = {i[4][0] for i in socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80))}
    except OSError:
        raise ValueError("Não achei esse endereço")
    for e in enderecos:
        ip = ipaddress.ip_address(e.split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("A agenda externa não pode apontar para um endereço interno")


def baixar_ics(url):
    if _cache["url"] == url and time.time() - _cache["quando"] < CACHE_SEGUNDOS:
        return _cache["texto"]
    url = re.sub(r"^webcal://", "https://", url, flags=re.I)
    verificar_url_externa(url)
    req = urllib.request.Request(url, headers={"User-Agent": "Yggdrasil/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        texto = resp.read().decode("utf-8", errors="replace")
    _cache.update(quando=time.time(), url=url, texto=texto)
    return texto


def ler_dia(texto):
    return datetime.strptime(texto.strip()[:10], "%Y-%m-%d").replace(tzinfo=LOCAL)


def nome_local(nome):
    """True para localhost, os nomes .local do Yggdrasil ou IP da rede local
    (192.168.x.x, 10.x.x.x, 172.16-31.x.x). Outros nomes são recusados (proteção contra DNS rebinding)."""
    nome = (nome or "").strip().lower().strip("[]")
    if nome in ("localhost", "yggdrasil.local", "yggdrasil.localhost"):
        return True
    try:
        ip = ipaddress.ip_address(nome)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private


def ip_da_rede():
    """IP deste computador na rede local (None se não achar)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # não envia nada, só descobre qual interface seria usada
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


# Arquivos da pasta que o navegador nunca recebe pelo caminho comum
PRIVADOS = {"/servidor-config.json", "/servidor-config.json.tmp", "/dados.json", "/dados.bak.json", "/dados.json.tmp", "/email-config.json", "/ia-config.json", "/ia-config.json.tmp", "/perfis.json", "/perfis.json.tmp"}


class Handler(SimpleHTTPRequestHandler):
    # ---- proteção: só responde para localhost, e escrita só vem da própria página ----
    # ---- proteção: só responde para localhost/rede local, e escrita só vem da própria página ----
    def host_ok(self):
        # Rede desligada: só este PC (mesmo que o servidor tenha subido com a rede ligada)
        if not self.do_proprio_pc() and not rede_ligada():
            return False
        host = (self.headers.get("Host") or "").lower()
        nome, _, porta = host.rpartition(":")
        return porta == str(PORTA) and nome_local(nome)

    def escrita_ok(self):
        if self.headers.get("X-Yggdrasil") != "1":
            return False
        origem = self.headers.get("Origin")
        if origem is None:
            return True
        p = urlparse(origem)
        try:
            porta = p.port
        except ValueError:
            return False
        return p.scheme == "http" and porta == PORTA and nome_local(p.hostname)

    def perfil_pedido(self):
        """Perfil do pedido (cabeçalho X-Yggdrasil-Perfil), já com o PIN conferido.
        Devolve o dict do perfil, ou None se o perfil não existe ou o PIN está errado."""
        id_perfil = self.headers.get("X-Yggdrasil-Perfil") or "principal"
        perfil = achar_perfil(id_perfil)
        if not perfil:
            return None
        if perfil.get("pin") and not pin_confere(perfil, self.headers.get("X-Yggdrasil-Pin")):
            return None
        if not perfil.get("pin") and not self.do_proprio_pc():
            return None  # pela rede, só perfil com PIN
        return perfil

    def ler_corpo(self, limite=20000):
        tamanho = min(int(self.headers.get("Content-Length") or 0), limite)
        return json.loads(self.rfile.read(tamanho) or b"{}") if tamanho else {}

    def do_proprio_pc(self):
        """Pedido feito neste computador (não de outro aparelho da rede)."""
        try:
            origem = self.client_address[0]
            # Pedido que passou pelo roteador.py (porta 80): ele diz de qual aparelho veio
            if ipaddress.ip_address(origem).is_loopback and self.headers.get("X-Yggdrasil-Cliente"):
                origem = self.headers["X-Yggdrasil-Cliente"]
            return ipaddress.ip_address(origem).is_loopback
        except ValueError:
            return False

    def email_liberado(self, perfil):
        # Pela rede, o email só abre em perfil com PIN (ou com "rede": true no email-config.json)
        if self.do_proprio_pc() or perfil.get("pin"):
            return True
        try:
            with open(os.path.join(PASTA, "email-config.json"), encoding="utf-8") as f:
                return json.load(f).get("rede") is True
        except (OSError, ValueError):
            return False

    def caminho(self):
        return unquote(self.path.split("?")[0])

    def privado(self):
        """Arquivos que nunca saem pelo caminho comum. Confere o arquivo de verdade que seria servido
        (depois de resolver ./, ../, %2e e links), não só o texto do endereço."""
        c = self.caminho().lower()
        if c in PRIVADOS or c.startswith(("/backups", "/perfis/", "/email-token", "/email-contas", "/resumos")):
            return True
        if c.startswith("/api/"):
            return False
        try:
            real = os.path.realpath(self.translate_path(self.path))
        except (OSError, ValueError):
            return True
        if real == PASTA_REAL:
            return False
        if not real.startswith(PASTA_REAL + os.sep):
            return True
        rel = "/" + os.path.relpath(real, PASTA_REAL).replace(os.sep, "/").lower()
        return (rel in PRIVADOS or rel.endswith(".tmp")
                or rel.startswith(("/backups", "/perfis", "/email-token", "/email-contas", "/resumos", "/__pycache__"))
                or any(parte.startswith(".") for parte in rel.split("/")[1:]))

    def list_directory(self, path):
        # Nunca lista o conteúdo das pastas
        self.send_error(404)
        return None

    def do_GET(self):
        if not self.host_ok():
            return self.json(403, {"erro": "host nao permitido"})
        if self.privado():
            return self.send_error(404)
        c = self.caminho()
        if c == "/api/perfis":
            return self.json(200, {"perfis": [perfil_publico(p) for p in ler_perfis()],
                                   "configurar": not perfis_configurados(), "local": self.do_proprio_pc()})
        if c.startswith("/api/"):
            perfil = self.perfil_pedido()
            if perfil is None:
                return self.json(401, {"erro": "perfil-ou-pin"})
            if c == "/api/dados":
                return self.json(200, {"dados": ler_dados(perfil["id"])})
            if c == "/api/ics":
                return self.ics(perfil["id"])
            if c == "/api/notificacoes":
                return self.notificacoes(perfil)
            if c == "/api/rede":
                return self.json(200, info_rede())
            if c == "/api/ia":
                if not self.email_liberado(perfil):
                    return self.json(403, {"erro": "email-so-local"})
                return self.json(200, {"config": resumo_ia.config_publica(), "resumo": resumo_ia.ultimo_para_mostrar(perfil["id"]),
                                       "falha": resumo_ia.falha(perfil["id"]), "podeConfigurar": perfil["id"] == "principal"})
            if c.startswith("/api/email/"):
                if not self.email_liberado(perfil):
                    return self.json(403, {"erro": "email-so-local"})
                return self.email_get(c, perfil["id"])
            return self.json(404, {"erro": "nao encontrado"})
        if c == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_HEAD(self):
        if not self.host_ok() or self.privado():
            return self.send_error(404)
        return super().do_HEAD()

    def do_PUT(self):
        if not self.host_ok() or not self.escrita_ok():
            return self.json(403, {"erro": "nao permitido"})
        if self.caminho() != "/api/dados":
            return self.json(404, {"erro": "nao encontrado"})
        perfil = self.perfil_pedido()
        if perfil is None:
            return self.json(401, {"erro": "perfil-ou-pin"})
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
            if not 0 < tamanho <= MAX_CORPO:
                return self.json(413, {"erro": "tamanho invalido"})
            dados = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            if not isinstance(dados, dict) or "links" not in dados:
                return self.json(400, {"erro": "formato invalido"})
            salvar_dados(dados, perfil["id"])
            return self.json(200, {"ok": True})
        except (ValueError, UnicodeDecodeError):
            return self.json(400, {"erro": "json invalido"})
        except OSError as erro:
            return self.json(500, {"erro": erro_publico(erro)})

    def do_POST(self):
        if not self.host_ok() or not self.escrita_ok():
            return self.json(403, {"erro": "nao permitido"})
        c = self.caminho()
        if c == "/api/perfis/entrar":
            try:
                dados = self.ler_corpo()
            except ValueError:
                return self.json(400, {"erro": "json invalido"})
            perfil = achar_perfil(str(dados.get("id") or ""))
            if not perfil:
                return self.json(404, {"erro": "perfil nao existe"})
            if not perfil.get("pin") and not self.do_proprio_pc():
                return self.json(401, {"erro": "pin-obrigatorio"})
            if not pin_confere(perfil, dados.get("pin")):
                espera = _erros_pin.get(perfil["id"], (0, 0))[1] - time.time()
                return self.json(401, {"erro": "pin-errado", "espera": max(0, round(espera))})
            return self.json(200, {"perfil": perfil_publico(perfil)})
        if c == "/api/perfis/criar":
            # Primeira vez: quem instalou cria o próprio perfil, só no próprio PC
            if perfis_configurados():
                return self.json(409, {"erro": "O perfil principal já foi criado"})
            if not self.do_proprio_pc():
                return self.json(403, {"erro": "Crie o primeiro perfil no próprio PC"})
            try:
                dados = self.ler_corpo()
                nome = str(dados.get("nome") or "").strip()[:30]
                if not nome:
                    raise ValueError("Falta o nome")
                novo = {"id": "principal", "nome": nome, "cor": dados.get("cor") if dados.get("cor") in CORES else "c1", "pin": None}
                if dados.get("pin"):
                    validar_pin_novo(str(dados["pin"]))
                    novo["pin"] = hash_pin(str(dados["pin"]))
            except ValueError as erro:
                return self.json(400, {"erro": str(erro)})
            salvar_perfis([novo])
            return self.json(200, {"perfil": perfil_publico(novo)})
        perfil = self.perfil_pedido()
        if perfil is None:
            return self.json(401, {"erro": "perfil-ou-pin"})
        if c == "/api/rede":
            # Só no próprio PC e no perfil principal
            if not self.do_proprio_pc() or perfil["id"] != "principal":
                return self.json(403, {"erro": "Só dá para mudar isso no próprio PC, no perfil principal"})
            try:
                ligar = bool(self.ler_corpo().get("ligada"))
                sem_pin = [p["nome"] for p in ler_perfis() if not p.get("pin")]
                if ligar and sem_pin:
                    return self.json(400, {"erro": "Antes de ligar a rede, coloque PIN em todos os perfis (Ajustes › Perfis). Falta em: " + ", ".join(sem_pin)})
                salvar_rede(ligar)
            except ValueError:
                return self.json(400, {"erro": "json invalido"})
            return self.json(200, info_rede())
        if c.startswith("/api/perfis/"):
            return self.gerenciar_perfis(c, perfil)
        if c.startswith(("/api/email/", "/api/ia/")) and not self.email_liberado(perfil):
            return self.json(403, {"erro": "email-so-local"})
        pid = perfil["id"]
        if c == "/api/ia/config":
            if pid != "principal":
                return self.json(403, {"erro": "Só o perfil principal muda a chave da IA"})
            try:
                return self.json(200, {"config": resumo_ia.salvar_config(self.ler_corpo(4000))})
            except ValueError as erro:
                return self.json(400, {"erro": str(erro)})
        if c == "/api/ia/gerar":
            try:
                return self.json(200, {"resumo": resumo_ia.gerar(pid, bool(self.ler_corpo(4000).get("parcial")))})
            except outlook.SemLogin:
                return self.json(401, {"erro": "Nenhuma conta de email conectada"})
            except Exception as erro:
                return self.json(502, {"erro": erro_publico(erro)})
        try:
            if c == "/api/email/login":
                cfg = outlook.config()
                if not cfg:
                    return self.json(400, {"erro": "sem-client-id"})
                outlook.iniciar_login(pid, cfg, self.ler_corpo(4000).get("conta"))
                return self.json(200, outlook.conta(pid))
            if c == "/api/email/adicionar":
                try:
                    nova = outlook.adicionar_imap(pid, self.ler_corpo(4000))
                except ValueError as erro:
                    return self.json(400, {"erro": str(erro)})
                r = outlook.conta(pid)
                r["nova"] = nova
                return self.json(200, r)
            if c == "/api/email/cancelar":
                outlook.cancelar_login(pid)
                return self.json(200, outlook.conta(pid))
            if c == "/api/email/sair":
                dados = self.ler_corpo(4000)
                outlook.sair(pid, str(dados["conta"]))
                return self.json(200, outlook.conta(pid))
            if c in ("/api/email/acao", "/api/email/marcar"):
                dados = self.ler_corpo(4000)
                qual = dados.get("acao") or ("lido" if dados.get("lido") else "naolido")
                outlook.acao(pid, str(dados["conta"]), str(dados["id"]), str(qual))
                return self.json(200, {"ok": True})
            if c == "/api/email/enviar":
                dados = self.ler_corpo(5 * 1024 * 1024)
                outlook.enviar(pid, str(dados["conta"]), dados)
                return self.json(200, {"ok": True})
        except outlook.SemLogin:
            return self.json(401, {"erro": "sem-login"})
        except (ValueError, KeyError) as erro:
            return self.json(400, {"erro": str(erro)})
        except Exception as erro:
            return self.json(502, {"erro": erro_publico(erro)})
        return self.json(404, {"erro": "nao encontrado"})

    def gerenciar_perfis(self, c, perfil):
        """novo / editar / apagar. O principal gerencia todos; cada um edita o próprio."""
        try:
            dados = self.ler_corpo()
            lista = ler_perfis()
            principal = perfil["id"] == "principal"
            if c == "/api/perfis/novo":
                if not principal:
                    return self.json(403, {"erro": "Só o perfil principal cria perfis"})
                nome = str(dados.get("nome") or "").strip()[:30]
                if not nome:
                    raise ValueError("Falta o nome")
                novo = {"id": secrets.token_hex(4), "nome": nome, "cor": dados.get("cor") if dados.get("cor") in CORES else "c2", "pin": None}
                if dados.get("pin"):
                    validar_pin_novo(dados["pin"])
                    novo["pin"] = hash_pin(dados["pin"])
                elif rede_ligada():
                    raise ValueError("Com a rede ligada, todo perfil precisa de PIN")
                lista.append(novo)
                salvar_perfis(lista)
                return self.json(200, {"perfil": perfil_publico(novo)})
            alvo = next((p for p in lista if p["id"] == dados.get("id")), None)
            if not alvo:
                return self.json(404, {"erro": "perfil nao existe"})
            if not principal and alvo["id"] != perfil["id"]:
                return self.json(403, {"erro": "Você só pode mudar o seu perfil"})
            if c == "/api/perfis/editar":
                if "nome" in dados:
                    nome = str(dados.get("nome") or "").strip()[:30]
                    if nome:
                        alvo["nome"] = nome
                if dados.get("cor") in CORES:
                    alvo["cor"] = dados["cor"]
                if "pin" in dados:
                    if dados["pin"]:
                        validar_pin_novo(dados["pin"])
                        alvo["pin"] = hash_pin(dados["pin"])
                    elif rede_ligada():
                        raise ValueError("Com a rede ligada, todo perfil precisa de PIN. Desligue a rede antes de tirar o PIN.")
                    else:
                        alvo["pin"] = None
                salvar_perfis(lista)
                return self.json(200, {"perfil": perfil_publico(alvo)})
            if c == "/api/perfis/apagar":
                if not principal or alvo["id"] == "principal":
                    return self.json(403, {"erro": "Esse perfil não pode ser apagado"})
                lista.remove(alvo)
                salvar_perfis(lista)
                # Os dados não somem: vão para backups/apagados/
                arq = arquivo_dados(alvo["id"])
                if os.path.exists(arq):
                    destino = os.path.join(PASTA_BACKUPS, "apagados")
                    os.makedirs(destino, exist_ok=True)
                    os.replace(arq, os.path.join(destino, f"{alvo['id']}-{alvo['nome']}-{date.today().isoformat()}.json"))
                outlook.sair(alvo["id"])
                return self.json(200, {"ok": True})
        except ValueError as erro:
            return self.json(400, {"erro": str(erro)})
        return self.json(404, {"erro": "nao encontrado"})

    def email_get(self, c, pid):
        params = parse_qs(urlparse(self.path).query)
        try:
            if c == "/api/email/conta":
                return self.json(200, outlook.conta(pid))
            if c == "/api/email/caixa":
                pasta = params.get("pasta", ["entrada"])[0]
                quantos = max(1, min(int(params.get("n", ["30"])[0]), 50))
                return self.json(200, outlook.caixa(pid, pasta, quantos, params.get("naolidos", ["0"])[0] == "1",
                                                    params.get("conta", [""])[0] or None))
            if c == "/api/email/hoje":
                desde = params["desde"][0]
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", desde):
                    raise ValueError("data invalida")
                return self.json(200, outlook.hoje(pid, desde))
            if c == "/api/email/msg":
                return self.json(200, outlook.mensagem(pid, params["conta"][0], params["id"][0]))
            if c == "/api/email/anexo":
                nome, dados = outlook.anexo(pid, params["conta"][0], params["msg"][0], params["id"][0])
                self.send_response(200)
                # Sempre baixa (nunca abre como página do Yggdrasil)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(nome, safe=""))
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Security-Policy", "sandbox")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)
                return
        except outlook.SemLogin:
            return self.json(401, {"erro": "sem-login"})
        except (ValueError, KeyError) as erro:
            return self.json(400, {"erro": str(erro)})
        except Exception as erro:
            return self.json(502, {"erro": erro_publico(erro)})
        return self.json(404, {"erro": "nao encontrado"})

    def notificacoes(self, perfil):
        pid = perfil["id"]
        dados = ler_dados(pid) or {}
        r = {"agora": int(time.time() * 1000), "perfil": perfil.get("nome") or pid,
             "avisoMin": int((dados.get("ajustes") or {}).get("avisoMin") or 10),
             "eventos": proximos_eventos(dados), "emails": None, "emailErro": "", "compilado": None}
        if not self.email_liberado(perfil):
            r["emailErro"] = "email-so-local"
            return self.json(200, r)
        try:
            cx = outlook.caixa(pid, "entrada", 15, True)
            r["emails"] = [{"chave": f"{m.get('conta')}|{m.get('id')}", "de": (m.get("de") or {}).get("nome") or (m.get("de") or {}).get("email") or "",
                            "assunto": m.get("assunto") or "", "previa": (m.get("previa") or "")[:140], "data": m.get("data") or ""}
                           for m in cx.get("emails") or [] if not m.get("lido")]
            r["naoLidos"] = cx.get("naoLidos", 0)
        except outlook.SemLogin:
            r["emailErro"] = "sem-login"
        except Exception as erro:
            r["emailErro"] = erro_publico(erro)[:200]
        try:
            res = resumo_ia.ultimo_para_mostrar(pid)
            if res and not res.get("parcial"):
                try:
                    fim = datetime.fromisoformat(res["fim"])
                    titulo = f"Compilado das {fim:%H}h" + (f"{fim:%M}" if fim.minute else "")
                except (KeyError, ValueError):
                    titulo = "Compilado das newsletters"
                r["compilado"] = {"chave": res.get("gerado") or "", "manchete": res.get("manchete") or "", "titulo": titulo,
                                  "noticias": sum(len(t.get("itens") or []) for t in res.get("temas") or [])}
        except Exception:
            pass
        return self.json(200, r)

    def ics(self, pid):
        dados = ler_dados(pid) or {}
        url = ((dados.get("ajustes") or {}).get("icsUrl") or "").strip()
        if not url:
            return self.json(200, {"configurado": False, "eventos": []})
        params = parse_qs(urlparse(self.path).query)
        try:
            ini = ler_dia(params["inicio"][0])
            fim = ler_dia(params["fim"][0])
            if not timedelta(0) < fim - ini <= timedelta(days=120):
                raise ValueError
        except (KeyError, ValueError):
            return self.json(400, {"erro": "periodo invalido", "eventos": []})
        try:
            eventos = eventos_no_periodo(baixar_ics(url), ini, fim)
            return self.json(200, {"configurado": True, "eventos": eventos})
        except Exception as erro:
            return self.json(502, {"configurado": True, "erro": erro_publico(erro), "eventos": []})

    def end_headers(self):
        # Sempre confere com o servidor: depois de atualizar os arquivos, o navegador não mostra versão velha
        if not any(b"Cache-Control" in h for h in getattr(self, "_headers_buffer", [])):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def json(self, status, dados):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def log_message(self, formato, *args):
        pass  # terminal limpo


REDE_AO_INICIAR = False


def main(abrir=False):
    endereco = f"http://localhost:{PORTA}/"
    try:
        # Padrão: só este PC (127.0.0.1). Com a rede ligada (Ajustes > Endereços, ou YGG_REDE=1),
        # 0.0.0.0 = aceita conexões de outros aparelhos da rede (celular etc.).
        global REDE_AO_INICIAR
        REDE_AO_INICIAR = rede_ligada()
        interface = "0.0.0.0" if REDE_AO_INICIAR else "127.0.0.1"
        servidor = ThreadingHTTPServer((interface, PORTA), partial(Handler, directory=PASTA))
    except OSError:
        print(f"A porta {PORTA} já está em uso: o Yggdrasil (ou outro programa) já está rodando.")
        if abrir:
            webbrowser.open(endereco)
        else:
            print(f"Abra {endereco} no navegador.")
        return
    if abrir:
        threading.Timer(0.6, webbrowser.open, [endereco]).start()
    resumo_ia.agendador(lambda: [p["id"] for p in ler_perfis()])
    print(f"Yggdrasil rodando em {endereco}")
    ip = ip_da_rede() if REDE_AO_INICIAR else None
    if ip:
        print(f"Na rede: http://{ip}:{PORTA}/")
    else:
        print("Só neste PC. Para abrir no celular, ligue a rede em Ajustes > Endereços.")
    print(f"Dados em: {DADOS}")
    print("Feche esta janela (ou Ctrl+C) para parar.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main(abrir="--abrir" in sys.argv)

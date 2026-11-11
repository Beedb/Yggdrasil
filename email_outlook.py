"""Yggdrasil - email do Outlook (Microsoft Graph), várias contas por perfil.

Usa o "client_id" do app que você registrou no Microsoft Entra, lido de
email-config.json nesta pasta (veja o README.md):
    {"client_id": "...", "tenant": "common"}
Cada perfil pode ligar quantas contas quiser. Os logins ficam em
email-contas/<perfil>/<conta>.json. Não compartilhe essa pasta.
Só usa a biblioteca padrão do Python.
"""

import base64
import html
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import email_imap

PASTA = os.path.dirname(os.path.abspath(__file__))
PASTA_CONTAS = os.path.join(PASTA, "email-contas")
CONFIG = os.path.join(PASTA, "email-config.json")
GRAPH = "https://graph.microsoft.com/v1.0"
# Ler, organizar e enviar. openid/email só para saber o endereço da conta.
ESCOPO = "openid profile email offline_access User.Read Mail.ReadWrite Mail.Send"
# Logins feitos antes das várias contas (só liam): renovam com o escopo antigo
ESCOPO_ANTIGO = "offline_access Mail.ReadWrite"
MAX_ANEXOS = 3 * 1024 * 1024   # limite do Outlook para anexo enviado assim

_trava = threading.Lock()
_logins = {}   # perfil -> estado do login em andamento
_caches = {}   # (perfil, conta) -> {chave: (quando, resultado)}


class SemLogin(Exception):
    pass


def _login(perfil):
    return _logins.setdefault(perfil, {"estado": "", "codigo": "", "url": "", "erro": "", "device": ""})


def _cache(perfil, conta):
    return _caches.setdefault((perfil, conta), {})


def _limpar_cache(perfil, conta=None):
    for chave in list(_caches):
        if chave[0] == perfil and (conta is None or chave[1] == conta):
            _caches[chave].clear()


def _id_seguro(texto):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(texto or ""))[:40]


# ---------------- config e arquivos ----------------

def config():
    """Config do app registrado no Microsoft Entra (email-config.json)."""
    try:
        with open(CONFIG, encoding="utf-8") as f:
            cfg = json.load(f)
        if (cfg.get("client_id") or "").strip():
            return cfg
    except (FileNotFoundError, ValueError, OSError):
        pass
    return {}


def url_login(cfg, final):
    tenant = (cfg.get("tenant") or "common").strip()
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{final}"


def post_form(url, dados):
    req = urllib.request.Request(url, data=urlencode(dados).encode(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as erro:
        try:
            return json.loads(erro.read() or b"{}")
        except ValueError:
            return {"error": f"http_{erro.code}"}


def _pasta_perfil(perfil):
    return os.path.join(PASTA_CONTAS, _id_seguro(perfil or "principal") or "principal")


def _arquivo_conta(perfil, conta):
    return os.path.join(_pasta_perfil(perfil), _id_seguro(conta) + ".json")


def _gravar(caminho, dados):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f)
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, caminho)


def _migrar(perfil):
    """Login antigo (email-token.json / email-token-<perfil>.json) vira uma conta."""
    nome = "email-token.json" if perfil in (None, "", "principal") else f"email-token-{perfil}.json"
    antigo = os.path.join(PASTA, nome)
    if not os.path.exists(antigo):
        return
    try:
        with open(antigo, encoding="utf-8") as f:
            tok = json.load(f)
        tok.setdefault("escopo", ESCOPO_ANTIGO)
        _gravar(_arquivo_conta(perfil, "c" + secrets.token_hex(3)), tok)
        os.remove(antigo)
    except (OSError, ValueError):
        pass


def ler_conta(perfil, conta):
    try:
        with open(_arquivo_conta(perfil, conta), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return None


def ids_contas(perfil):
    _migrar(perfil)
    try:
        nomes = sorted(os.listdir(_pasta_perfil(perfil)))
    except FileNotFoundError:
        return []
    contas = []
    for n in nomes:
        if n.endswith(".json"):
            tok = ler_conta(perfil, n[:-5])
            if tok:
                contas.append((tok.get("criado", 0), n[:-5]))
    return [c for _, c in sorted(contas)]


def _ler_jwt(token):
    try:
        parte = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4)))
    except (IndexError, ValueError, AttributeError):
        return {}


def salvar_token(perfil, conta, resposta, antigo=None):
    antigo = antigo or {}
    dados = dict(antigo)
    dados.update({
        "access_token": resposta["access_token"],
        "refresh_token": resposta.get("refresh_token") or antigo.get("refresh_token", ""),
        "expira": time.time() + int(resposta.get("expires_in", 3600)) - 120,
    })
    dados.pop("invalido", None)
    if resposta.get("scope"):
        dados["escopo"] = ESCOPO if "Mail.Send" in resposta["scope"] else (antigo.get("escopo") or ESCOPO_ANTIGO)
    _gravar(_arquivo_conta(perfil, conta), dados)
    return dados


def apagar_conta(perfil, conta):
    try:
        os.remove(_arquivo_conta(perfil, conta))
    except FileNotFoundError:
        pass
    _limpar_cache(perfil, conta)


def token_acesso(perfil, conta, cfg, forcar=False):
    with _trava:
        tok = ler_conta(perfil, conta)
        if not tok or tok.get("invalido"):
            raise SemLogin()
        if not forcar and tok.get("expira", 0) > time.time():
            return tok["access_token"]
        r = post_form(url_login(cfg, "token"), {
            "client_id": cfg["client_id"], "grant_type": "refresh_token",
            "refresh_token": tok.get("refresh_token", ""), "scope": tok.get("escopo") or ESCOPO_ANTIGO,
        })
        if "access_token" in r:
            r.setdefault("scope", tok.get("escopo") or ESCOPO_ANTIGO)
            return salvar_token(perfil, conta, r, tok)["access_token"]
        if r.get("error") in ("invalid_grant", "interaction_required", "invalid_client", "unauthorized_client"):
            # Não apaga: a conta continua na lista pedindo "entrar de novo"
            tok["invalido"] = True
            _gravar(_arquivo_conta(perfil, conta), tok)
            raise SemLogin()
        raise RuntimeError(r.get("error_description") or r.get("error") or "falha ao renovar o login")


def graph(perfil, conta, cfg, metodo, caminho, corpo=None, tentativa=0, cabecalhos=None, bruto=False):
    url = caminho if caminho.startswith("http") else GRAPH + caminho
    h = {"Authorization": "Bearer " + token_acesso(perfil, conta, cfg, forcar=tentativa > 0), "Content-Type": "application/json"}
    h.update(cabecalhos or {})
    req = urllib.request.Request(url, method=metodo, headers=h,
                                 data=json.dumps(corpo).encode("utf-8") if corpo is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            texto = resp.read()
            if bruto:
                return texto, resp.headers.get("Content-Type") or "application/octet-stream"
            return json.loads(texto) if texto else {}
    except urllib.error.HTTPError as erro:
        if erro.code == 401 and tentativa == 0:
            return graph(perfil, conta, cfg, metodo, caminho, corpo, 1, cabecalhos, bruto)
        try:
            msg = json.loads(erro.read())["error"]["message"]
        except Exception:
            msg = f"HTTP {erro.code}"
        if erro.code == 403 and metodo != "GET":
            msg = "Esta conta só tem permissão de leitura. Use \"entrar de novo\" nela para liberar."
        raise RuntimeError(msg)


def _cfg():
    cfg = config()
    if not cfg:
        raise SemLogin()
    return cfg


# ---------------- login (código do dispositivo) ----------------

def iniciar_login(perfil, cfg, alvo=None):
    """alvo: conta que está entrando de novo (para liberar o envio ou depois de expirar)."""
    r = post_form(url_login(cfg, "devicecode"), {"client_id": cfg["client_id"], "scope": ESCOPO})
    if "device_code" not in r:
        raise RuntimeError(r.get("error_description") or r.get("error") or "falha ao iniciar o login")
    _login(perfil).update(estado="aguardando", codigo=r["user_code"], url=r["verification_uri"], erro="", device=r["device_code"], alvo=_id_seguro(alvo) if alvo else "")
    threading.Thread(target=esperar_login, args=(perfil, cfg, r), daemon=True).start()


def cancelar_login(perfil):
    _login(perfil).update(estado="", codigo="", url="", erro="", device="")


def _quem(t, perfil, conta):
    """Endereço e nome da conta: do id_token, ou do /me."""
    info = _ler_jwt(t.get("id_token", ""))
    email = info.get("email") or info.get("preferred_username") or ""
    nome = info.get("name") or ""
    if not email:
        try:
            eu = graph(perfil, conta, config(), "GET", "/me?$select=mail,userPrincipalName,displayName")
            email = eu.get("mail") or eu.get("userPrincipalName") or ""
            nome = nome or eu.get("displayName") or ""
        except Exception:
            pass
    return email, nome


def esperar_login(perfil, cfg, r):
    estado = _login(perfil)
    intervalo = int(r.get("interval", 5))
    fim = time.time() + int(r.get("expires_in", 900))
    while time.time() < fim:
        time.sleep(intervalo)
        if estado["device"] != r["device_code"]:
            return
        t = post_form(url_login(cfg, "token"), {
            "client_id": cfg["client_id"], "device_code": r["device_code"],
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        })
        if "access_token" in t:
            t.setdefault("scope", ESCOPO)
            nova = "c" + secrets.token_hex(3)
            with _trava:
                salvar_token(perfil, nova, t, {"criado": time.time()})
            email, nome = _quem(t, perfil, nova)
            # Mesma conta entrando de novo: substitui a antiga (mantém o id e a cor)
            final = nova
            alvo = estado.get("alvo") or ""
            tok_alvo = ler_conta(perfil, alvo) if alvo else None
            if tok_alvo and (not tok_alvo.get("email") or not email or tok_alvo["email"].lower() == email.lower()):
                final = alvo
            for outra in ids_contas(perfil):
                tok = ler_conta(perfil, outra) or {}
                if final != nova:
                    break
                if outra != nova and email and (tok.get("email") or "").lower() == email.lower():
                    final = outra
                    break
            with _trava:
                dados = ler_conta(perfil, nova)
                dados.update(email=email, nome=nome)
                if final != nova:
                    dados["criado"] = (ler_conta(perfil, final) or {}).get("criado", dados["criado"])
                    os.remove(_arquivo_conta(perfil, nova))
                _gravar(_arquivo_conta(perfil, final), dados)
            _limpar_cache(perfil)
            estado.update(estado="conectado", codigo="", device="", ultima=final)
            return
        erro = t.get("error")
        if erro == "authorization_pending":
            continue
        if erro == "slow_down":
            intervalo += 5
            continue
        estado.update(estado="erro", erro=t.get("error_description") or erro or "login recusado", device="")
        return
    if estado["device"] == r["device_code"]:
        estado.update(estado="expirado", device="")


def sair(perfil, conta=None):
    """Tira uma conta (ou todas, sem `conta`)."""
    if conta is None:
        cancelar_login(perfil)
        for c in ids_contas(perfil):
            apagar_conta(perfil, c)
        return
    apagar_conta(perfil, conta)


def _descobrir_email(perfil, conta, tok):
    """Contas migradas não sabem o próprio endereço: pergunta uma vez."""
    if tok.get("email") or tok.get("invalido") or tok.get("semNome"):
        return tok
    try:
        eu = graph(perfil, conta, config(), "GET", "/me?$select=mail,userPrincipalName,displayName")
        tok["email"] = eu.get("mail") or eu.get("userPrincipalName") or ""
        tok["nome"] = eu.get("displayName") or ""
    except SemLogin:
        return ler_conta(perfil, conta) or tok
    except Exception:
        tok["semNome"] = True
    with _trava:
        atual = ler_conta(perfil, conta)
        if atual:
            atual.update({k: tok[k] for k in ("email", "nome", "semNome") if k in tok})
            _gravar(_arquivo_conta(perfil, conta), atual)
    return tok


def eh_imap(tok):
    return (tok or {}).get("tipo") == "imap"


def conta(perfil):
    cfg = config()
    estado = _login(perfil)
    contas = []
    for c in ids_contas(perfil):
        tok = ler_conta(perfil, c) or {}
        if eh_imap(tok):
            contas.append({"id": c, "email": tok.get("usuario", ""), "nome": tok.get("nome") or "", "tipo": "imap",
                           "provedor": tok.get("provedorNome") or "IMAP", "podeEnviar": True, "expirou": bool(tok.get("invalido"))})
            continue
        if not cfg:
            continue
        tok = _descobrir_email(perfil, c, tok)
        contas.append({
            "id": c, "tipo": "outlook", "provedor": "Outlook",
            "email": tok.get("email") or "",
            "nome": tok.get("nome") or "",
            "podeEnviar": "Mail.Send" in (tok.get("escopo") or ""),
            "expirou": bool(tok.get("invalido")),
        })
    return {
        "disponivel": True,
        "outlook": bool(cfg),
        "conectado": any(not c["expirou"] for c in contas),
        "contas": contas,
        "provedores": {k: {"nome": v["nome"], "ajuda": v["ajuda"]} for k, v in email_imap.PROVEDORES.items()},
        "dominios": email_imap.DOMINIOS,
        "login": {k: estado.get(k, "") for k in ("estado", "codigo", "url", "erro", "ultima")},
    }


def adicionar_imap(perfil, dados):
    """Liga uma conta IMAP (Gmail, Yahoo...) depois de testar o login."""
    endereco = str(dados.get("email") or "").strip()
    senha = re.sub(r"\s+", "", str(dados.get("senha") or "")) if dados.get("provedor") in ("gmail", "yahoo", "icloud", "aol") else str(dados.get("senha") or "").strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", endereco):
        raise ValueError("Endereço de email inválido")
    if not senha:
        raise ValueError("Falta a senha de app")
    prov = email_imap.PROVEDORES.get(dados.get("provedor") or "")
    if prov:
        tok = {"imap": prov["imap"], "imap_porta": 993, "smtp": prov["smtp"], "smtp_porta": prov["smtp_porta"], "provedorNome": prov["nome"]}
    else:
        imap_h, smtp_h = str(dados.get("imap") or "").strip(), str(dados.get("smtp") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9.-]{3,100}", imap_h) or not re.fullmatch(r"[A-Za-z0-9.-]{3,100}", smtp_h):
            raise ValueError("Preencha os servidores IMAP e SMTP")
        tok = {"imap": imap_h, "imap_porta": int(dados.get("imap_porta") or 993), "smtp": smtp_h,
               "smtp_porta": int(dados.get("smtp_porta") or 465), "provedorNome": imap_h.split(".")[-2].title() if re.search(r"[a-z]", imap_h, re.I) and "." in imap_h else "IMAP"}
    tok.update(tipo="imap", usuario=endereco, senha=senha, nome=str(dados.get("nome") or "").strip()[:60], criado=time.time())
    try:
        email_imap.testar(tok)
    except email_imap.ErroConta as erro:
        raise ValueError(str(erro)[0].upper() + str(erro)[1:])
    # Mesma conta de novo: troca a senha e mantém o id
    final = "c" + secrets.token_hex(3)
    for c in ids_contas(perfil):
        antigo = ler_conta(perfil, c) or {}
        if eh_imap(antigo) and antigo.get("usuario", "").lower() == endereco.lower():
            final, tok["criado"] = c, antigo.get("criado", tok["criado"])
            break
    with _trava:
        _gravar(_arquivo_conta(perfil, final), tok)
    _limpar_cache(perfil)
    return final


def _imap_ou_none(perfil, c):
    tok = ler_conta(perfil, c)
    if eh_imap(tok):
        if tok.get("invalido"):
            raise SemLogin()
        return tok
    return None


def _erro_imap(perfil, c, erro):
    """Senha recusada: marca a conta para pedir a senha de novo."""
    if "recusou" in str(erro):
        with _trava:
            tok = ler_conta(perfil, c)
            if tok:
                tok["invalido"] = True
                _gravar(_arquivo_conta(perfil, c), tok)
        raise SemLogin()
    raise RuntimeError(str(erro))


def _como_graph(r):
    """Email do IMAP no formato que o resto do código usa (o do Outlook)."""
    return {
        "id": r["id"], "subject": r["assunto"],
        "from": {"emailAddress": {"name": r["de"]["nome"], "address": r["de"]["email"]}},
        "receivedDateTime": r["data"], "isRead": r["lido"], "bodyPreview": r["previa"],
        "hasAttachments": r["anexos"], "importance": "high" if r["importante"] else "normal",
        "flag": {"flagStatus": "flagged" if r["marcado"] else "notFlagged"},
        "inferenceClassification": "other" if r.get("lista") else "focused",
    }


# ---------------- ler ----------------

def _pessoa(p):
    e = (p or {}).get("emailAddress") or {}
    return {"nome": e.get("name") or e.get("address") or "", "email": e.get("address") or ""}


PASTAS = {"entrada": "inbox", "enviados": "sentitems", "arquivo": "archive", "lixeira": "deleteditems", "spam": "junkemail"}


def _caixa_uma(perfil, c, cfg, pasta, quantos, so_nao_lidos):
    chave = (pasta, quantos, so_nao_lidos)
    guardado = _cache(perfil, c).get(chave)
    if guardado and time.time() - guardado[0] < 45:
        return guardado[1]
    tok = _imap_ou_none(perfil, c)
    if tok:
        try:
            r = email_imap.caixa_uma(tok, c, pasta, quantos, so_nao_lidos)
        except email_imap.ErroConta as erro:
            _erro_imap(perfil, c, erro)
        _cache(perfil, c)[chave] = (time.time(), r)
        return r
    if not cfg:
        raise SemLogin()
    params = {
        "$select": "id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,hasAttachments,importance,webLink,flag",
        "$orderby": "receivedDateTime desc", "$top": str(quantos),
    }
    if so_nao_lidos:
        params["$filter"] = "isRead eq false"
    pasta_graph = PASTAS.get(pasta, "inbox")
    dados = graph(perfil, c, cfg, "GET", f"/me/mailFolders/{pasta_graph}/messages?" + urlencode(params))
    info = graph(perfil, c, cfg, "GET", "/me/mailFolders/inbox?$select=unreadItemCount")
    r = {
        "naoLidos": info.get("unreadItemCount", 0),
        "emails": [{
            "id": m["id"],
            "conta": c,
            "assunto": m.get("subject") or "(sem assunto)",
            "de": _pessoa(m.get("from")),
            "para": [_pessoa(p) for p in m.get("toRecipients") or []],
            "data": m.get("receivedDateTime"),
            "lido": bool(m.get("isRead")),
            "previa": (m.get("bodyPreview") or "")[:220],
            "anexos": bool(m.get("hasAttachments")),
            "importante": m.get("importance") == "high",
            "marcado": ((m.get("flag") or {}).get("flagStatus") == "flagged"),
            "link": m.get("webLink") or "",
        } for m in dados.get("value", [])],
    }
    _cache(perfil, c)[chave] = (time.time(), r)
    return r


def caixa(perfil, pasta="entrada", quantos=30, so_nao_lidos=False, so_conta=None):
    """Todas as contas juntas (ou só uma), do mais novo para o mais velho."""
    cfg = config()
    contas = [c for c in ids_contas(perfil) if not (ler_conta(perfil, c) or {}).get("invalido")]
    if so_conta:
        contas = [c for c in contas if c == so_conta]
    if not contas:
        raise SemLogin()

    def uma(c):
        try:
            return c, _caixa_uma(perfil, c, cfg, pasta, quantos, so_nao_lidos), ""
        except SemLogin:
            return c, None, "precisa entrar de novo"
        except Exception as erro:
            return c, None, str(erro)

    with ThreadPoolExecutor(max_workers=min(4, len(contas))) as ex:
        resultados = list(ex.map(uma, contas))
    emails = [m for _, r, _ in resultados if r for m in r["emails"]]
    emails.sort(key=lambda m: m.get("data") or "", reverse=True)
    return {
        "naoLidos": sum(r["naoLidos"] for _, r, _ in resultados if r),
        "contas": [{"id": c, "naoLidos": r["naoLidos"] if r else 0, "erro": e} for c, r, e in resultados],
        "emails": emails[:quantos * (1 if so_conta else 2)],
    }


def _msg_url(id_msg, resto=""):
    return f"/me/messages/{quote(id_msg, safe='')}{resto}"


def mensagem(perfil, c, id_msg):
    tok = _imap_ou_none(perfil, c)
    if tok:
        try:
            r = email_imap.mensagem(tok, c, id_msg)
        except email_imap.ErroConta as erro:
            _erro_imap(perfil, c, erro)
        _limpar_cache(perfil, c)
        return r
    cfg = _cfg()
    m = graph(perfil, c, cfg, "GET", _msg_url(id_msg, "?" + urlencode({
        "$select": "id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,isRead,webLink,hasAttachments,flag,parentFolderId",
    })), cabecalhos={"Prefer": 'outlook.body-content-type="html"'})
    corpo = m.get("body") or {}
    html_corpo = (corpo.get("content") or "") if corpo.get("contentType") == "html" else ""
    anexos = []
    if m.get("hasAttachments") or "cid:" in html_corpo:
        try:
            a = graph(perfil, c, cfg, "GET", _msg_url(id_msg, "/attachments?$select=id,name,size,isInline,contentType"))
            embutidas = 0
            for x in a.get("value", []):
                if x.get("isInline") and "cid:" in html_corpo and embutidas + x.get("size", 0) < 2_000_000:
                    # Imagem colada no corpo (cid:): vira data: para aparecer aqui
                    try:
                        cheio = graph(perfil, c, cfg, "GET", _msg_url(id_msg, f"/attachments/{quote(x['id'], safe='')}"))
                        cid = (cheio.get("contentId") or "").strip("<>")
                        tipo = cheio.get("contentType") or "image/png"
                        if cid and cheio.get("contentBytes") and tipo.startswith("image/"):
                            html_corpo = html_corpo.replace(f"cid:{cid}", f"data:{tipo};base64,{cheio['contentBytes']}")
                            embutidas += x.get("size", 0)
                            continue
                    except RuntimeError:
                        pass
                if not x.get("isInline"):
                    anexos.append({"id": x.get("id"), "nome": x.get("name"), "tamanho": x.get("size", 0), "tipo": x.get("contentType") or ""})
        except RuntimeError:
            pass
    if not m.get("isRead"):
        try:
            graph(perfil, c, cfg, "PATCH", _msg_url(id_msg), {"isRead": True})
            _limpar_cache(perfil, c)
        except RuntimeError:
            pass
    return {
        "id": m["id"],
        "conta": c,
        "assunto": m.get("subject") or "(sem assunto)",
        "de": _pessoa(m.get("from")),
        "para": [_pessoa(p) for p in m.get("toRecipients") or []],
        "cc": [_pessoa(p) for p in m.get("ccRecipients") or []],
        "data": m.get("receivedDateTime"),
        "html": html_corpo,
        "texto": (corpo.get("content") or "") if corpo.get("contentType") != "html" else "",
        "anexos": anexos,
        "marcado": ((m.get("flag") or {}).get("flagStatus") == "flagged"),
        "link": m.get("webLink") or "",
    }


def anexo(perfil, c, id_msg, id_anexo):
    """Bytes do anexo, para baixar."""
    tok = _imap_ou_none(perfil, c)
    if tok:
        try:
            return email_imap.anexo(tok, id_msg, id_anexo)
        except email_imap.ErroConta as erro:
            _erro_imap(perfil, c, erro)
    cfg = _cfg()
    info = graph(perfil, c, cfg, "GET", _msg_url(id_msg, f"/attachments/{quote(id_anexo, safe='')}?$select=name,size"))
    dados, _ = graph(perfil, c, cfg, "GET", _msg_url(id_msg, f"/attachments/{quote(id_anexo, safe='')}/$value"), bruto=True)
    return info.get("name") or "anexo", dados


# ---------------- organizar ----------------

def acao(perfil, c, id_msg, qual):
    tok = _imap_ou_none(perfil, c)
    if tok:
        try:
            email_imap.acao(tok, id_msg, qual)
        except email_imap.ErroConta as erro:
            _erro_imap(perfil, c, erro)
        _limpar_cache(perfil, c)
        return
    cfg = _cfg()
    if qual in ("lido", "naolido"):
        graph(perfil, c, cfg, "PATCH", _msg_url(id_msg), {"isRead": qual == "lido"})
    elif qual in ("marcar", "desmarcar"):
        graph(perfil, c, cfg, "PATCH", _msg_url(id_msg), {"flag": {"flagStatus": "flagged" if qual == "marcar" else "notFlagged"}})
    elif qual in ("arquivar", "lixeira", "entrada", "spam"):
        destino = {"arquivar": "archive", "lixeira": "deleteditems", "entrada": "inbox", "spam": "junkemail"}[qual]
        graph(perfil, c, cfg, "POST", _msg_url(id_msg, "/move"), {"destinationId": destino})
    elif qual == "apagar":
        # Já na lixeira: apaga de vez (o Outlook ainda guarda em "Itens recuperáveis")
        graph(perfil, c, cfg, "DELETE", _msg_url(id_msg))
    else:
        raise ValueError("ação desconhecida")
    _limpar_cache(perfil, c)


# ---------------- enviar ----------------

def _destinos(lista):
    if isinstance(lista, str):
        lista = re.split(r"[,;\s]+", lista)
    saida = []
    for e in lista or []:
        e = str(e).strip()
        if not e:
            continue
        if not re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+", e):
            raise ValueError(f"Endereço inválido: {e}")
        saida.append({"emailAddress": {"address": e}})
    return saida


def _texto_html(texto):
    return "<div style=\"font-family:Calibri,Arial,sans-serif;font-size:11pt\">" + \
        html.escape(texto or "").replace("\r\n", "\n").replace("\n", "<br>") + "</div>"


def _anexos(lista):
    saida, total = [], 0
    for a in lista or []:
        conteudo = str(a.get("base64") or "")
        total += len(conteudo) * 3 // 4
        if total > MAX_ANEXOS:
            raise ValueError("Os anexos passam de 3 MB. Para arquivos maiores, use o Outlook.")
        base64.b64decode(conteudo, validate=True)
        saida.append({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": str(a.get("nome") or "anexo")[:200],
            "contentType": str(a.get("tipo") or "application/octet-stream")[:100],
            "contentBytes": conteudo,
        })
    return saida


def enviar(perfil, c, dados):
    """modo: novo | responder | responderTodos | encaminhar"""
    tok = _imap_ou_none(perfil, c)
    if tok:
        enderecos = lambda l: [d["emailAddress"]["address"] for d in _destinos(l)]
        anexos = [{"nome": a["name"], "tipo": a["contentType"], "bytes": base64.b64decode(a["contentBytes"])} for a in _anexos(dados.get("anexos"))]
        if (dados.get("modo") or "novo") in ("novo", "encaminhar") and not _destinos(dados.get("para")):
            raise ValueError("Falta para quem enviar")
        try:
            email_imap.enviar(tok, dados, enderecos(dados.get("para")), enderecos(dados.get("cc")), enderecos(dados.get("cco")), anexos)
        except email_imap.ErroConta as erro:
            _erro_imap(perfil, c, erro)
        _limpar_cache(perfil, c)
        return
    cfg = _cfg()
    modo = dados.get("modo") or "novo"
    para, cc, cco = _destinos(dados.get("para")), _destinos(dados.get("cc")), _destinos(dados.get("cco"))
    anexos = _anexos(dados.get("anexos"))
    texto = str(dados.get("texto") or "")
    if modo == "novo":
        if not para:
            raise ValueError("Falta para quem enviar")
        msg = {
            "subject": str(dados.get("assunto") or "")[:300],
            "body": {"contentType": "HTML", "content": _texto_html(texto)},
            "toRecipients": para, "ccRecipients": cc, "bccRecipients": cco,
        }
        if anexos:
            msg["attachments"] = anexos
        graph(perfil, c, cfg, "POST", "/me/sendMail", {"message": msg, "saveToSentItems": True})
    else:
        id_msg = str(dados.get("id") or "")
        if not id_msg:
            raise ValueError("Falta o email original")
        if modo == "encaminhar" and not para:
            raise ValueError("Falta para quem encaminhar")
        criar = {"responder": "createReply", "responderTodos": "createReplyAll", "encaminhar": "createForward"}[modo]
        # Rascunho com o email original citado embaixo; depois anexos e envio
        rasc = graph(perfil, c, cfg, "POST", _msg_url(id_msg, "/" + criar), {})
        mudar = {}
        corpo_original = ((rasc.get("body") or {}).get("content") or "")
        mudar["body"] = {"contentType": "HTML", "content": _juntar_resposta(texto, corpo_original)}
        if para:
            mudar["toRecipients"] = (rasc.get("toRecipients") or []) + para if modo != "encaminhar" else para
        if cc:
            mudar["ccRecipients"] = (rasc.get("ccRecipients") or []) + cc
        if cco:
            mudar["bccRecipients"] = cco
        try:
            graph(perfil, c, cfg, "PATCH", _msg_url(rasc["id"]), mudar)
            for a in anexos:
                graph(perfil, c, cfg, "POST", _msg_url(rasc["id"], "/attachments"), a)
            graph(perfil, c, cfg, "POST", _msg_url(rasc["id"], "/send"))
        except Exception:
            try:
                graph(perfil, c, cfg, "DELETE", _msg_url(rasc["id"]))
            except Exception:
                pass
            raise
    _limpar_cache(perfil, c)


def _juntar_resposta(texto, corpo_original):
    novo = _texto_html(texto)
    m = re.search(r"<body[^>]*>", corpo_original, re.I)
    if m:
        return corpo_original[:m.end()] + novo + "<br>" + corpo_original[m.end():]
    return novo + "<br>" + corpo_original


# ---------------- resumo do dia ----------------

_AUTOMATICO = re.compile(r"no-?reply|nao-?responda|naoresponda|newsletter|news@|noticias|marketing|promo|info@|contato@|notifica|mailer|digest|updates?@|bounce", re.I)


def hoje(perfil, desde):
    """Emails recebidos desde `desde` (ISO em UTC, meia-noite local), todas as contas."""
    cfg = config()
    contas = [c for c in ids_contas(perfil) if not (ler_conta(perfil, c) or {}).get("invalido")]
    if not contas:
        raise SemLogin()

    def uma(c):
        chave = ("hoje", desde)
        guardado = _cache(perfil, c).get(chave)
        if guardado and time.time() - guardado[0] < 60:
            return guardado[1]
        params = {
            "$select": "id,subject,from,receivedDateTime,isRead,bodyPreview,hasAttachments,importance,flag,inferenceClassification",
            "$filter": f"receivedDateTime ge {desde}",
            "$orderby": "receivedDateTime desc", "$top": "100",
        }
        try:
            tok = _imap_ou_none(perfil, c)
            if tok:
                inicio = datetime.strptime(desde, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                try:
                    r = ([_como_graph(x) for x in email_imap.recebidos(tok, c, inicio, limite=100)], "")
                except email_imap.ErroConta as erro:
                    _erro_imap(perfil, c, erro)
            elif not cfg:
                raise SemLogin()
            else:
                dados = graph(perfil, c, cfg, "GET", "/me/mailFolders/inbox/messages?" + urlencode(params))
                r = (dados.get("value", []), "")
        except SemLogin:
            r = ([], "precisa entrar de novo")
        except Exception as erro:
            r = ([], str(erro))
        if not r[1]:
            _cache(perfil, c)[chave] = (time.time(), r)
        return r

    with ThreadPoolExecutor(max_workers=min(4, len(contas))) as ex:
        resultados = dict(zip(contas, ex.map(uma, contas)))

    emails, remetentes = [], {}
    for c, (lista, _) in resultados.items():
        for m in lista:
            de = _pessoa(m.get("from"))
            auto = m.get("inferenceClassification") == "other" or bool(_AUTOMATICO.search(de["email"]))
            item = {
                "id": m["id"], "conta": c,
                "assunto": m.get("subject") or "(sem assunto)",
                "de": de, "data": m.get("receivedDateTime"),
                "lido": bool(m.get("isRead")),
                "previa": (m.get("bodyPreview") or "")[:160],
                "anexos": bool(m.get("hasAttachments")),
                "importante": m.get("importance") == "high",
                "marcado": ((m.get("flag") or {}).get("flagStatus") == "flagged"),
                "automatico": auto,
            }
            emails.append(item)
            chave = (de["email"] or de["nome"]).lower()
            r = remetentes.setdefault(chave, {"nome": de["nome"] or de["email"], "email": de["email"], "n": 0, "naoLidos": 0, "automatico": auto})
            r["n"] += 1
            r["naoLidos"] += 0 if item["lido"] else 1
    emails.sort(key=lambda m: m["data"] or "", reverse=True)
    pessoas = [m for m in emails if not m["automatico"]]
    destaques = [m for m in emails if m["importante"] or m["marcado"]] + [m for m in pessoas if not m["lido"] and not (m["importante"] or m["marcado"])]
    return {
        "total": len(emails),
        "naoLidos": sum(1 for m in emails if not m["lido"]),
        "pessoas": len(pessoas),
        "automaticos": len(emails) - len(pessoas),
        "anexos": sum(1 for m in emails if m["anexos"]),
        "importantes": sum(1 for m in emails if m["importante"] or m["marcado"]),
        "destaques": destaques[:8],
        "pessoasLista": pessoas[:12],
        "remetentes": sorted(remetentes.values(), key=lambda r: (-r["n"], r["nome"].lower()))[:8],
        "contas": [{"id": c, "n": len(l), "erro": e} for c, (l, e) in resultados.items()],
    }

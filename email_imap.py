"""Yggdrasil - contas de email por IMAP/SMTP (Gmail, Yahoo, iCloud, UOL, BOL...).

Usa "senha de app" do provedor (não a senha normal). Os dados ficam no mesmo
lugar das contas do Outlook: email-contas/<perfil>/<conta>.json, com
"tipo": "imap". Só usa a biblioteca padrão do Python.
"""

import base64
import email
import email.policy
import email.utils
import html as html_lib
import imaplib
import re
import smtplib
import socket
import ssl
import threading
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html.parser import HTMLParser

PROVEDORES = {
    "gmail":  {"nome": "Gmail",  "imap": "imap.gmail.com",     "smtp": "smtp.gmail.com",      "smtp_porta": 465,
               "ajuda": "https://myaccount.google.com/apppasswords"},
    "yahoo":  {"nome": "Yahoo",  "imap": "imap.mail.yahoo.com", "smtp": "smtp.mail.yahoo.com", "smtp_porta": 465,
               "ajuda": "https://login.yahoo.com/account/security/app-passwords"},
    "icloud": {"nome": "iCloud", "imap": "imap.mail.me.com",    "smtp": "smtp.mail.me.com",    "smtp_porta": 587,
               "ajuda": "https://account.apple.com/account/manage"},
    "uol":    {"nome": "UOL",    "imap": "imap.uol.com.br",     "smtp": "smtps.uol.com.br",    "smtp_porta": 465,
               "ajuda": "https://email.uol.com.br/"},
    "bol":    {"nome": "BOL",    "imap": "imap.bol.com.br",     "smtp": "smtps.bol.com.br",    "smtp_porta": 587,
               "ajuda": "https://email.bol.uol.com.br/"},
    "terra":  {"nome": "Terra",  "imap": "imap.terra.com.br",   "smtp": "smtp.terra.com.br",   "smtp_porta": 587,
               "ajuda": "https://mail.terra.com.br/"},
    "zoho":   {"nome": "Zoho",   "imap": "imap.zoho.com",       "smtp": "smtp.zoho.com",       "smtp_porta": 465,
               "ajuda": "https://accounts.zoho.com/home#security/app_password"},
    "aol":    {"nome": "AOL",    "imap": "imap.aol.com",        "smtp": "smtp.aol.com",        "smtp_porta": 465,
               "ajuda": "https://login.aol.com/account/security"},
    "gmx":    {"nome": "GMX",    "imap": "imap.gmx.com",        "smtp": "mail.gmx.com",        "smtp_porta": 587,
               "ajuda": "https://www.gmx.com/"},
}
# Endereço -> provedor, para escolher sozinho
DOMINIOS = {
    "gmail.com": "gmail", "googlemail.com": "gmail",
    "yahoo.com": "yahoo", "yahoo.com.br": "yahoo", "ymail.com": "yahoo", "rocketmail.com": "yahoo",
    "icloud.com": "icloud", "me.com": "icloud", "mac.com": "icloud",
    "uol.com.br": "uol", "bol.com.br": "bol", "terra.com.br": "terra",
    "zoho.com": "zoho", "zohomail.com": "zoho", "aol.com": "aol", "gmx.com": "gmx", "gmx.net": "gmx",
}

TIMEOUT = 25
_pastas = {}     # (usuario, host) -> {"entrada": "INBOX", "enviados": ..., ...}
_msgs = {}       # (usuario, host, pasta, uidvalidity, uid) -> resumo do email (não muda)
_travas = {}


class ErroConta(Exception):
    pass


def _trava(tok):
    return _travas.setdefault((tok["usuario"], tok["imap"]), threading.Lock())


# ---------------- conexão ----------------

def _contexto():
    return ssl.create_default_context()


def conectar(tok):
    try:
        im = imaplib.IMAP4_SSL(tok["imap"], int(tok.get("imap_porta") or 993), ssl_context=_contexto(), timeout=TIMEOUT)
    except (OSError, socket.timeout) as erro:
        raise ErroConta(f"não consegui falar com {tok['imap']} ({erro})")
    try:
        im.login(tok["usuario"], tok["senha"])
    except imaplib.IMAP4.error as erro:
        try:
            im.logout()
        except Exception:
            pass
        texto = erro.args[0].decode(errors="replace") if erro.args and isinstance(erro.args[0], bytes) else str(erro)
        raise ErroConta("o provedor recusou o login: confira o endereço e a senha de app" + (f" ({texto[:120]})" if texto else ""))
    return im


def _smtp(tok):
    host, porta = tok["smtp"], int(tok.get("smtp_porta") or 465)
    try:
        if porta not in (25, 587, 2525):   # 465 e outras: TLS direto; 587: STARTTLS
            s = smtplib.SMTP_SSL(host, porta, context=_contexto(), timeout=TIMEOUT)
        else:
            s = smtplib.SMTP(host, porta, timeout=TIMEOUT)
            s.starttls(context=_contexto())
        s.login(tok["usuario"], tok["senha"])
        return s
    except smtplib.SMTPAuthenticationError:
        raise ErroConta("o servidor de envio recusou a senha de app")
    except (OSError, smtplib.SMTPException) as erro:
        raise ErroConta(f"não consegui falar com {host} ({erro})")


def testar(tok):
    """Confere IMAP e SMTP antes de salvar a conta."""
    im = conectar(tok)
    try:
        pastas(im, tok)
    finally:
        _sair(im)
    s = _smtp(tok)
    try:
        s.quit()
    except Exception:
        pass


def _sair(im):
    try:
        im.logout()
    except Exception:
        pass


def _q(nome):
    return '"' + nome.replace("\\", "\\\\").replace('"', '\\"') + '"'


# ---------------- pastas ----------------

_LISTA = re.compile(r'\((?P<flags>[^)]*)\) (?P<sep>"(?:[^"\\]|\\.)*"|NIL) (?P<nome>.+)$')
_NOMES = {
    "enviados": ["Sent", "Sent Items", "Sent Messages", "Enviados", "Itens Enviados", "INBOX.Sent", "INBOX.Enviados"],
    "lixeira": ["Trash", "Lixeira", "Deleted", "Deleted Items", "Deleted Messages", "INBOX.Trash", "INBOX.Lixeira"],
    "spam": ["Junk", "Spam", "Bulk Mail", "Lixo Eletrônico", "INBOX.Junk", "INBOX.Spam"],
    "arquivo": ["Archive", "Arquivo", "Arquivos", "INBOX.Archive"],
}
_ESPECIAIS = {"\\sent": "enviados", "\\trash": "lixeira", "\\junk": "spam", "\\archive": "arquivo"}


def pastas(im, tok):
    chave = (tok["usuario"], tok["imap"])
    if chave in _pastas:
        return _pastas[chave]
    typ, linhas = im.list()
    achadas, nomes = {"entrada": "INBOX"}, []
    todos = None
    for linha in linhas or []:
        if not isinstance(linha, bytes):
            continue
        m = _LISTA.match(linha.decode("utf-8", errors="replace"))
        if not m:
            continue
        nome = m.group("nome").strip()
        if nome.startswith('"'):
            nome = nome[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        nomes.append(nome)
        flags = m.group("flags").lower().split()
        for f in flags:
            if f in _ESPECIAIS and _ESPECIAIS[f] not in achadas:
                achadas[_ESPECIAIS[f]] = nome
            if f == "\\all":
                todos = nome
    for chave_p, candidatos in _NOMES.items():
        if chave_p not in achadas:
            for n in candidatos:
                achado = next((x for x in nomes if x.lower() == n.lower()), None)
                if achado:
                    achadas[chave_p] = achado
                    break
    # Gmail: arquivar = tirar da entrada; a mensagem fica em "Todos os e-mails"
    if "arquivo" not in achadas and todos:
        achadas["arquivo"] = todos
    _pastas[chave] = achadas
    return achadas


def _selecionar(im, nome, so_ler=True):
    typ, dados = im.select(_q(nome), readonly=so_ler)
    if typ != "OK":
        raise ErroConta(f"pasta {nome} não existe")
    uidv = ""
    try:
        r = im.response("UIDVALIDITY")[1]
        uidv = r[0].decode() if r and r[0] else ""
    except Exception:
        pass
    return uidv


# ---------------- ids ----------------

def fazer_id(pasta, uid):
    return "i" + base64.urlsafe_b64encode(f"{pasta}\x00{uid}".encode("utf-8")).decode().rstrip("=")


def ler_id(id_msg):
    try:
        bruto = base64.urlsafe_b64decode(id_msg[1:] + "=" * (-len(id_msg[1:]) % 4)).decode("utf-8")
        pasta, uid = bruto.split("\x00")
        if not uid.isdigit():
            raise ValueError
        return pasta, uid
    except Exception:
        raise ValueError("id de email inválido")


# ---------------- ler mensagens ----------------

class _SoTexto(HTMLParser):
    def __init__(self):
        super().__init__()
        self.partes, self._pula = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head", "title"):
            self._pula += 1
        elif tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3", "h4", "table"):
            self.partes.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head", "title"):
            self._pula = max(0, self._pula - 1)

    def handle_data(self, data):
        if not self._pula:
            self.partes.append(data)


def html_para_texto(h):
    p = _SoTexto()
    try:
        p.feed(h)
        p.close()
    except Exception:
        return re.sub(r"<[^>]+>", " ", h)
    texto = "".join(p.partes)
    texto = re.sub(r"[ \t\xa0‌​]+", " ", texto)
    return re.sub(r"\n\s*\n+", "\n\n", texto).strip()


def _pessoa_de(valor):
    try:
        nome, end = email.utils.parseaddr(str(valor or ""))
        return {"nome": nome or end, "email": end}
    except Exception:
        return {"nome": str(valor or ""), "email": ""}


def _pessoas(valor):
    try:
        return [{"nome": n or e, "email": e} for n, e in email.utils.getaddresses([str(valor or "")]) if e]
    except Exception:
        return []


def _data_iso(msg, interna=None):
    d = interna
    if d is None:
        try:
            d = email.utils.parsedate_to_datetime(str(msg.get("Date") or ""))
        except Exception:
            d = None
    if not d:
        return ""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _corpos(msg):
    """(html, texto) do email."""
    html_c, texto_c = "", ""
    try:
        parte = msg.get_body(preferencelist=("html",))
        if parte is not None:
            html_c = parte.get_content()
    except Exception:
        pass
    try:
        parte = msg.get_body(preferencelist=("plain",))
        if parte is not None:
            texto_c = parte.get_content()
    except Exception:
        pass
    return html_c, texto_c


def _anexos(msg):
    """Lista de (indice, parte) dos anexos de verdade (com nome, não imagem do corpo)."""
    saida = []
    for i, parte in enumerate(msg.walk()):
        if parte.is_multipart():
            continue
        nome = parte.get_filename()
        disp = (parte.get_content_disposition() or "").lower()
        if nome and (disp == "attachment" or not parte.get("Content-ID")):
            saida.append((i, parte))
    return saida


def _resumo(msg, flags, pasta, uid, conta, interna=None):
    html_c, texto_c = _corpos(msg)
    previa = texto_c or html_para_texto(html_c)
    previa = re.sub(r"\s+", " ", previa).strip()[:220]
    prioridade = str(msg.get("X-Priority") or "")[:1]
    return {
        "id": fazer_id(pasta, uid),
        "conta": conta,
        "assunto": str(msg.get("Subject") or "").strip() or "(sem assunto)",
        "de": _pessoa_de(msg.get("From")),
        "para": _pessoas(msg.get("To")),
        "data": _data_iso(msg, interna),
        "lido": "\\Seen" in flags,
        "previa": previa,
        "anexos": bool(_anexos(msg)),
        "importante": prioridade in ("1", "2") or str(msg.get("Importance") or "").lower() == "high",
        "marcado": "\\Flagged" in flags,
        "link": "",
        "lista": bool(msg.get("List-Unsubscribe") or msg.get("List-Id")),
    }


_META = re.compile(rb"UID (\d+)|FLAGS \(([^)]*)\)|INTERNALDATE \"([^\"]+)\"")


def _buscar(im, uids, partes):
    """UID FETCH; devolve {uid: (flags, internaldate, bytes)}."""
    saida = {}
    if not uids:
        return saida
    typ, dados = im.uid("FETCH", ",".join(uids), f"(UID FLAGS INTERNALDATE {partes})")
    for item in dados or []:
        if not isinstance(item, tuple):
            continue
        meta, corpo = item[0], item[1]
        uid, flags, interna = None, "", None
        for m in _META.finditer(meta):
            if m.group(1):
                uid = m.group(1).decode()
            elif m.group(2) is not None:
                flags = m.group(2).decode(errors="replace")
            elif m.group(3):
                try:
                    interna = datetime.strptime(m.group(3).decode(), "%d-%b-%Y %H:%M:%S %z")
                except ValueError:
                    interna = None
        if uid:
            saida[uid] = (flags, interna, corpo)
    # FLAGS às vezes vem depois do corpo (em outra linha)
    if any(not v[0] for v in saida.values()):
        for item in dados or []:
            linha = item if isinstance(item, bytes) else b""
            m_uid = re.search(rb"UID (\d+)", linha)
            m_fl = re.search(rb"FLAGS \(([^)]*)\)", linha)
            if m_uid and m_fl and m_uid.group(1).decode() in saida:
                u = m_uid.group(1).decode()
                saida[u] = (m_fl.group(1).decode(errors="replace"),) + saida[u][1:]
    return saida


def caixa_uma(tok, conta, pasta_ygg, quantos, so_nao_lidos):
    im = conectar(tok)
    try:
        mapa = pastas(im, tok)
        nome = mapa.get(pasta_ygg)
        if not nome:
            return {"naoLidos": _nao_lidos(im), "emails": []}
        uidv = _selecionar(im, nome)
        typ, dados = im.uid("SEARCH", None, "UNSEEN" if so_nao_lidos else "ALL")
        uids = (dados[0] or b"").decode().split()[-quantos:] if dados else []
        novos = [u for u in uids if (tok["usuario"], tok["imap"], nome, uidv, u) not in _msgs]
        if novos:
            for u, (flags, interna, corpo) in _buscar(im, novos, "BODY.PEEK[]").items():
                msg = email.message_from_bytes(corpo or b"", policy=email.policy.default)
                _msgs[(tok["usuario"], tok["imap"], nome, uidv, u)] = _resumo(msg, flags, nome, u, conta, interna)
        # flags mudam (lido, sinalizado): busca de novo, é leve
        flags_atuais = {}
        if uids:
            typ, fl = im.uid("FETCH", ",".join(uids), "(UID FLAGS)")
            for linha in fl or []:
                linha = linha if isinstance(linha, bytes) else (linha[0] if isinstance(linha, tuple) else b"")
                m_uid = re.search(rb"UID (\d+)", linha)
                m_fl = re.search(rb"FLAGS \(([^)]*)\)", linha)
                if m_uid and m_fl:
                    flags_atuais[m_uid.group(1).decode()] = m_fl.group(1).decode(errors="replace")
        emails = []
        for u in reversed(uids):
            r = _msgs.get((tok["usuario"], tok["imap"], nome, uidv, u))
            if not r:
                continue
            r = dict(r)
            if u in flags_atuais:
                r["lido"] = "\\Seen" in flags_atuais[u]
                r["marcado"] = "\\Flagged" in flags_atuais[u]
            emails.append(r)
        if len(_msgs) > 3000:
            for k in list(_msgs)[:1000]:
                _msgs.pop(k, None)
        return {"naoLidos": _nao_lidos(im), "emails": emails}
    finally:
        _sair(im)


def _nao_lidos(im):
    try:
        typ, dados = im.status("INBOX", "(UNSEEN)")
        return int(re.search(rb"UNSEEN (\d+)", dados[0]).group(1))
    except Exception:
        return 0


def _abrir_bruto(im, id_msg):
    pasta, uid = ler_id(id_msg)
    _selecionar(im, pasta, so_ler=False)
    r = _buscar(im, [uid], "BODY.PEEK[]")
    if uid not in r:
        raise ErroConta("esse email não existe mais (foi movido ou apagado)")
    flags, interna, corpo = r[uid]
    return pasta, uid, flags, interna, email.message_from_bytes(corpo or b"", policy=email.policy.default)


def mensagem(tok, conta, id_msg):
    im = conectar(tok)
    try:
        pasta, uid, flags, interna, msg = _abrir_bruto(im, id_msg)
        html_c, texto_c = _corpos(msg)
        # Imagens coladas no corpo (cid:) viram data:
        if html_c and "cid:" in html_c:
            total = 0
            for parte in msg.walk():
                cid = (parte.get("Content-ID") or "").strip("<> ")
                if cid and parte.get_content_maintype() == "image":
                    dados = parte.get_payload(decode=True) or b""
                    total += len(dados)
                    if total > 3_000_000:
                        break
                    html_c = html_c.replace(f"cid:{cid}", f"data:{parte.get_content_type()};base64,{base64.b64encode(dados).decode()}")
        if "\\Seen" not in flags:
            im.uid("STORE", uid, "+FLAGS", "(\\Seen)")
        return {
            "id": id_msg, "conta": conta,
            "assunto": str(msg.get("Subject") or "").strip() or "(sem assunto)",
            "de": _pessoa_de(msg.get("From")),
            "para": _pessoas(msg.get("To")),
            "cc": _pessoas(msg.get("Cc")),
            "data": _data_iso(msg, interna),
            "html": html_c,
            "texto": "" if html_c else texto_c,
            "anexos": [{"id": str(i), "nome": p.get_filename(), "tamanho": len(p.get_payload(decode=True) or b""), "tipo": p.get_content_type()} for i, p in _anexos(msg)],
            "marcado": "\\Flagged" in flags,
            "link": "",
        }
    finally:
        _sair(im)


def anexo(tok, id_msg, id_anexo):
    im = conectar(tok)
    try:
        _, _, _, _, msg = _abrir_bruto(im, id_msg)
        for i, parte in _anexos(msg):
            if str(i) == str(id_anexo):
                return parte.get_filename() or "anexo", parte.get_payload(decode=True) or b""
        raise ErroConta("anexo não encontrado")
    finally:
        _sair(im)


# ---------------- organizar ----------------

def acao(tok, id_msg, qual):
    im = conectar(tok)
    try:
        pasta, uid = ler_id(id_msg)
        _selecionar(im, pasta, so_ler=False)
        if qual in ("lido", "naolido"):
            im.uid("STORE", uid, "+FLAGS" if qual == "lido" else "-FLAGS", "(\\Seen)")
        elif qual in ("marcar", "desmarcar"):
            im.uid("STORE", uid, "+FLAGS" if qual == "marcar" else "-FLAGS", "(\\Flagged)")
        elif qual in ("arquivar", "lixeira", "entrada", "spam"):
            mapa = pastas(im, tok)
            destino = mapa.get({"arquivar": "arquivo", "lixeira": "lixeira", "entrada": "entrada", "spam": "spam"}[qual])
            if not destino:
                raise ErroConta("essa conta não tem pasta para isso")
            _mover(im, uid, destino)
        elif qual == "apagar":
            im.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
            _expurgar(im, uid)
        else:
            raise ValueError("ação desconhecida")
    finally:
        _sair(im)


def _caps(im):
    return [(c.decode() if isinstance(c, bytes) else str(c)).upper() for c in (im.capabilities or ())]


def _mover(im, uid, destino):
    if "MOVE" in _caps(im):
        typ, _ = im.uid("MOVE", uid, _q(destino))
        if typ == "OK":
            return
    typ, _ = im.uid("COPY", uid, _q(destino))
    if typ != "OK":
        raise ErroConta("não consegui mover o email")
    im.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
    _expurgar(im, uid)


def _expurgar(im, uid):
    try:
        if "UIDPLUS" in _caps(im):
            im.uid("EXPUNGE", uid)
            return
    except Exception:
        pass
    im.expunge()


# ---------------- enviar ----------------

def _html_texto(texto):
    return "<div style=\"font-family:Arial,sans-serif;font-size:11pt\">" + html_lib.escape(texto or "").replace("\r\n", "\n").replace("\n", "<br>") + "</div>"


def enviar(tok, dados, para, cc, cco, anexos):
    """para/cc/cco: listas de endereços. anexos: [{nome, tipo, bytes}]"""
    modo = dados.get("modo") or "novo"
    texto = str(dados.get("texto") or "")
    eu = tok["usuario"].lower()
    original = None
    im = None
    try:
        if modo != "novo":
            im = conectar(tok)
            _, _, _, _, original = _abrir_bruto(im, str(dados.get("id") or ""))
        msg = EmailMessage()
        msg["From"] = email.utils.formataddr((tok.get("nome") or "", tok["usuario"]))
        assunto = str(dados.get("assunto") or "")
        corpo_html, corpo_txt = _html_texto(texto), texto
        if original is not None:
            assunto_orig = str(original.get("Subject") or "")
            prefixo = "Enc: " if modo == "encaminhar" else "Re: "
            assunto = assunto_orig if re.match(r"(?i)^(re|enc|fwd?|res)\s*:", assunto_orig) and prefixo == "Re: " else prefixo + assunto_orig
            de_orig = str(original.get("From") or "")
            quando = str(original.get("Date") or "")
            h_orig, t_orig = _corpos(original)
            cabec = f"Em {quando}, {de_orig} escreveu:" if modo != "encaminhar" else \
                f"---------- Mensagem encaminhada ----------<br>De: {html_lib.escape(de_orig)}<br>Data: {html_lib.escape(quando)}<br>Assunto: {html_lib.escape(assunto_orig)}"
            citado = h_orig or ("<pre style=\"white-space:pre-wrap\">" + html_lib.escape(t_orig) + "</pre>")
            if modo == "encaminhar":
                corpo_html += f"<br><div>{cabec}</div><br>{citado}"
            else:
                corpo_html += f"<br><div>{html_lib.escape(cabec)}</div><blockquote style=\"margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex\">{citado}</blockquote>"
            corpo_txt += f"\n\n{cabec if modo != 'encaminhar' else '---------- Mensagem encaminhada ----------'}\n" + "\n".join("> " + l for l in (t_orig or html_para_texto(h_orig)).splitlines())
            if modo in ("responder", "responderTodos"):
                resposta_para = _pessoas(original.get("Reply-To")) or _pessoas(original.get("From"))
                base = [p["email"] for p in resposta_para]
                if modo == "responderTodos":
                    base += [p["email"] for p in _pessoas(original.get("To")) + _pessoas(original.get("Cc"))]
                para = [e for e in dict.fromkeys(base + para) if e.lower() != eu]
                mid = str(original.get("Message-ID") or "").strip()
                if mid:
                    msg["In-Reply-To"] = mid
                    msg["References"] = (str(original.get("References") or "") + " " + mid).strip()
        if not para:
            raise ValueError("Falta para quem enviar")
        msg["To"] = ", ".join(para)
        if cc:
            msg["Cc"] = ", ".join(cc)
        msg["Subject"] = assunto
        msg["Date"] = email.utils.formatdate(localtime=True)
        msg["Message-ID"] = email.utils.make_msgid(domain=tok["usuario"].split("@")[-1])
        msg.set_content(corpo_txt)
        msg.add_alternative(f"<html><body>{corpo_html}</body></html>", subtype="html")
        if modo == "encaminhar" and original is not None:
            for _, parte in _anexos(original):
                tipo = parte.get_content_type().split("/", 1)
                msg.add_attachment(parte.get_payload(decode=True) or b"", maintype=tipo[0], subtype=tipo[1] if len(tipo) > 1 else "octet-stream", filename=parte.get_filename())
        for a in anexos:
            tipo = (a.get("tipo") or "application/octet-stream").split("/", 1)
            msg.add_attachment(a["bytes"], maintype=tipo[0], subtype=tipo[1] if len(tipo) > 1 else "octet-stream", filename=a.get("nome") or "anexo")
        s = _smtp(tok)
        try:
            s.send_message(msg, to_addrs=para + cc + cco)
        finally:
            try:
                s.quit()
            except Exception:
                pass
        # O Gmail guarda o enviado sozinho; os outros, a gente guarda em "Enviados"
        if "gmail" not in tok["smtp"]:
            try:
                im = im or conectar(tok)
                destino = pastas(im, tok).get("enviados")
                if destino:
                    im.append(_q(destino), "(\\Seen)", imaplib.Time2Internaldate(time.time()), msg.as_bytes())
            except Exception:
                pass
        if original is not None and modo != "encaminhar":
            try:
                pasta, uid = ler_id(str(dados.get("id")))
                _selecionar(im, pasta, so_ler=False)
                im.uid("STORE", uid, "+FLAGS", "(\\Answered)")
            except Exception:
                pass
    finally:
        if im is not None:
            _sair(im)


# ---------------- resumo / compilado ----------------

def recebidos(tok, conta, desde, ate=None, com_texto=False, limite=200):
    """Emails da entrada recebidos entre `desde` e `ate` (datetime com fuso)."""
    im = conectar(tok)
    try:
        uidv = _selecionar(im, "INBOX")
        dia = (desde - timedelta(days=1)).strftime("%d-%b-%Y")
        typ, dados = im.uid("SEARCH", None, f"SINCE {dia}")
        uids = (dados[0] or b"").decode().split()[-limite:] if dados else []
        saida = []
        for u, (flags, interna, corpo) in _buscar(im, uids, "BODY.PEEK[]").items():
            msg = email.message_from_bytes(corpo or b"", policy=email.policy.default)
            quando = interna
            if quando is None:
                try:
                    quando = email.utils.parsedate_to_datetime(str(msg.get("Date")))
                except Exception:
                    continue
            if quando < desde or (ate and quando >= ate):
                continue
            r = _resumo(msg, flags, "INBOX", u, conta, interna)
            if com_texto:
                h, t = _corpos(msg)
                r["texto"] = t if len(t or "") > 200 or not h else html_para_texto(h)
            saida.append(r)
        saida.sort(key=lambda m: m["data"], reverse=True)
        return saida
    finally:
        _sair(im)

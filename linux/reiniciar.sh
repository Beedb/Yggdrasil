#!/usr/bin/env bash
# Sobe (ou reinicia) o Yggdrasil em segundo plano, sem terminal.
# Útil para iniciar junto com o sistema. Log em /tmp/yggdrasil-$USER.log
YGG="$(cd "$(dirname "$0")/.." && pwd)"
LOG="/tmp/yggdrasil-$(id -un).log"

for pid in $(pgrep -u "$(id -u)" -f "python3.*servidor.py"); do
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$YGG" ] && kill "$pid" 2>/dev/null
done
sleep 1
( cd "$YGG" && setsid nohup python3 -u servidor.py > "$LOG" 2>&1 < /dev/null & )
sleep 2
if (exec 3<>"/dev/tcp/127.0.0.1/${YGG_PORTA:-8090}") 2>/dev/null; then MSG="Yggdrasil rodando em http://localhost:${YGG_PORTA:-8090}"; else MSG="O Yggdrasil não subiu: veja $LOG"; fi
echo "$MSG"
command -v notify-send >/dev/null && notify-send "Yggdrasil" "$MSG" 2>/dev/null
exit 0

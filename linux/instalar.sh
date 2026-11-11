#!/usr/bin/env bash
# ===== YGGDRASIL · INSTALADOR PARA LINUX =====
# Cria o atalho "Yggdrasil" no menu de aplicativos. Não precisa de sudo.
#
#   bash linux/instalar.sh                  cria o atalho
#   bash linux/instalar.sh --iniciar-junto  e também sobe o Yggdrasil sozinho ao entrar no sistema
#   bash linux/instalar.sh --desinstalar    tira os atalhos (seus dados continuam na pasta)
#
# Se mudar a pasta do Yggdrasil de lugar, rode de novo.
set -e
YGG="$(cd "$(dirname "$0")/.." && pwd)"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
AUTO="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"

if [ "$1" = "--desinstalar" ]; then
    rm -f "$APPS/yggdrasil.desktop" "$AUTO/yggdrasil.desktop"
    update-desktop-database "$APPS" >/dev/null 2>&1 || true
    echo "Atalhos removidos. A pasta $YGG (com os seus dados) não foi apagada."
    exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "Falta o Python 3. Instale e rode este instalador de novo:"
    echo "  Ubuntu, Mint, Zorin, Debian:  sudo apt install python3"
    echo "  Fedora:                       sudo dnf install python3"
    echo "  Arch:                         sudo pacman -S python"
    exit 1
fi
if ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
    echo "O Yggdrasil precisa do Python 3.9 ou mais novo. Você tem: $(python3 --version)"
    exit 1
fi

chmod +x "$YGG/linux/"*.sh
mkdir -p "$APPS"
cat > "$APPS/yggdrasil.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Yggdrasil
Comment=Links, agenda, tarefas, notas e email (abre em http://localhost:8090)
Exec=bash "$YGG/linux/rodar.sh"
Path=$YGG
Icon=$YGG/assets/yggdrasil.svg
Terminal=true
Categories=Office;Utility;
Keywords=links;agenda;tarefas;email;painel;
DESKTOP
chmod +x "$APPS/yggdrasil.desktop"
update-desktop-database "$APPS" >/dev/null 2>&1 || true
echo "Pronto! Procure \"Yggdrasil\" no menu de aplicativos."
echo "Ele abre um terminal com o servidor e o painel no navegador. Fechar o terminal para o Yggdrasil."

if [ "$1" = "--iniciar-junto" ]; then
    mkdir -p "$AUTO"
    cat > "$AUTO/yggdrasil.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Yggdrasil (servidor)
Exec=bash "$YGG/linux/reiniciar.sh"
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
    echo "O Yggdrasil vai subir sozinho (sem janela) quando você entrar no sistema."
    echo "Aí é só abrir http://localhost:8090 no navegador."
fi

#!/usr/bin/env bash
# Sobe o Yggdrasil e abre no navegador. Feche o terminal (ou Ctrl+C) para parar.
cd "$(dirname "$0")/.." || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "Falta o Python 3 (ex.: sudo apt install python3)."
    read -r -p "Aperte Enter para fechar."
    exit 1
fi
python3 servidor.py --abrir
echo
read -r -p "O Yggdrasil parou. Aperte Enter para fechar."

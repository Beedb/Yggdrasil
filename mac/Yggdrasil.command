#!/usr/bin/env bash
# Duplo clique no Finder para abrir o Yggdrasil (na primeira vez: botão direito > Abrir).
# Feche a janela do Terminal para parar.
cd "$(dirname "$0")/.." || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "Falta o Python 3. Instale em https://www.python.org/downloads/macos/ e abra de novo."
    open "https://www.python.org/downloads/macos/"
    read -r -p "Aperte Enter para fechar."
    exit 1
fi
python3 servidor.py --abrir

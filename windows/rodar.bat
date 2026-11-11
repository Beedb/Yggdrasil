@echo off
chcp 65001 >nul
title Yggdrasil
REM Sobe o Yggdrasil e abre no navegador. Feche esta janela para parar.
cd /d "%~dp0.."
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
    python -c "import sys" >nul 2>nul && set "PY=python"
)
if not defined PY (
    echo Falta o Python. Rode windows\instalar.bat ou instale em https://www.python.org/downloads/
    pause
    exit /b 1
)
%PY% servidor.py --abrir
pause

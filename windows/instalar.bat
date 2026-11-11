@echo off
REM Duplo clique para instalar o Yggdrasil (cria os atalhos). Nao precisa ser administrador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1" %*
pause

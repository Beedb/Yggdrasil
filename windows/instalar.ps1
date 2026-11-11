# ===== YGGDRASIL · INSTALADOR PARA WINDOWS =====
# Rode pelo instalar.bat (duplo clique). Cria atalhos na Área de Trabalho e no Menu Iniciar.
# Não precisa ser administrador e não mexe em nada fora da sua conta.
param([switch]$desinstalar)
$ErrorActionPreference = 'Stop'
$ygg = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Yggdrasil.lnk'
$auto = Join-Path ([Environment]::GetFolderPath('Startup')) 'Yggdrasil.lnk'
$area = Join-Path $desktop 'Yggdrasil.lnk'

if ($desinstalar) {
    Remove-Item $area, $menu, $auto -ErrorAction SilentlyContinue
    Write-Host "Atalhos removidos. A pasta $ygg (com os seus dados) nao foi apagada."
    exit 0
}

Write-Host '== Yggdrasil =='
function Testar-Python($exe, $extra) {
    try {
        $saida = & $exe @extra -c "import sys; print(sys.version_info >= (3, 9)); print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $saida -and $saida[0] -eq 'True') { return $saida[1] }
    } catch {}
    return $null
}
function Achar-Python {
    $p = Testar-Python 'py' @('-3')
    if (-not $p) { $p = Testar-Python 'python' @() }
    return $p
}
$py = Achar-Python
if (-not $py) {
    Write-Host 'Nao achei o Python 3.9 ou mais novo.'
    $r = Read-Host 'Instalar o Python agora pelo winget? (s/n)'
    if ($r -match '^[sS]') {
        winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $py = Achar-Python
    }
    if (-not $py) {
        Write-Host 'Instale o Python em https://www.python.org/downloads/ (marque "Add python.exe to PATH") e rode o instalar.bat de novo.'
        Start-Process 'https://www.python.org/downloads/'
        exit 1
    }
}
Write-Host "Python: $py"

$icone = Join-Path $ygg 'assets\yggdrasil.ico'
foreach ($destino in @($area, $menu)) {
    $l = $shell.CreateShortcut($destino)
    $l.TargetPath = Join-Path $ygg 'windows\rodar.bat'
    $l.WorkingDirectory = $ygg
    $l.IconLocation = $icone
    $l.Description = 'Yggdrasil: links, agenda, tarefas, notas e email'
    $l.Save()
}
Write-Host 'Atalhos criados na Area de Trabalho e no Menu Iniciar.'

$r = Read-Host 'Iniciar o Yggdrasil sozinho (sem janela) quando o Windows ligar? (s/n)'
if ($r -match '^[sS]') {
    $pyw = Join-Path (Split-Path $py) 'pythonw.exe'
    if (-not (Test-Path $pyw)) { $pyw = $py }
    $l = $shell.CreateShortcut($auto)
    $l.TargetPath = $pyw
    $l.Arguments = '"' + (Join-Path $ygg 'servidor.py') + '"'
    $l.WorkingDirectory = $ygg
    $l.IconLocation = $icone
    $l.WindowStyle = 7
    $l.Save()
    Write-Host 'Pronto: ao ligar o PC, e so abrir http://localhost:8090 no navegador.'
}
Write-Host ''
Write-Host 'Tudo certo! Abra o Yggdrasil pelo atalho. Ele abre uma janela preta (o servidor) e o painel no navegador.'
Write-Host 'Para desinstalar os atalhos: windows\instalar.bat -desinstalar'

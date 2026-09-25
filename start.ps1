[CmdletBinding()]
param([string]$EnvFile = '.env', [switch]$NoBrowser, [switch]$CheckOnly, [switch]$SmokeTest)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$frontendDir = Join-Path $projectRoot 'frontend'
$logDir = Join-Path $projectRoot '.local\logs'
$services = @()
$originalEnv = @{}
$exitCode = 0

function Set-LaunchEnv([string]$Name, [string]$Value) {
    if (-not $originalEnv.ContainsKey($Name)) {
        $originalEnv[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Assert-FreePort([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Server.ExclusiveAddressUse = $true
    try { $listener.Start() }
    catch { throw "Port $Port is occupied. Stop the existing service or change .env. No existing process was stopped." }
    finally { $listener.Stop() }
}

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Executable" }
}

function Start-ServiceProcess([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$Directory) {
    # Start-Process joins ArgumentList. Quote paths to support project directories with spaces.
    $quoted = @($Arguments | ForEach-Object { '"' + $_ + '"' })
    Start-Process -FilePath $Executable -ArgumentList $quoted -WorkingDirectory $Directory `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir "$Name.log") `
        -RedirectStandardError (Join-Path $logDir "$Name.err.log")
}

function Stop-OwnedProcessTree([int]$ProcessId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-OwnedProcessTree ([int]$child.ProcessId) }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Assert-ServicesRunning {
    foreach ($service in $services) {
        $service.Refresh()
        if ($service.HasExited) { throw "A service exited unexpectedly. See logs in $logDir" }
    }
}

function Wait-Http([string]$Url, [switch]$Backend) {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $deadline) {
        Assert-ServicesRunning
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                if (-not $Backend -or ($response.Content | ConvertFrom-Json).status -eq 'ok') { return }
            }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "HTTP readiness check timed out: $Url. See logs in $logDir"
}

Push-Location -LiteralPath $projectRoot
try {
    if (-not [IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $projectRoot $EnvFile }
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        if ($EnvFile -eq (Join-Path $projectRoot '.env')) {
            Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $EnvFile
            throw 'Created .env from .env.example. Configure local PostgreSQL and storage, then run start.bat again.'
        }
        throw 'The specified environment file does not exist.'
    }
    foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
        $entry = $line.Trim()
        if (-not $entry -or $entry.StartsWith('#')) { continue }
        if ($entry -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { throw 'Invalid environment file entry.' }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-LaunchEnv $name $value
    }
    $backendPort = 8002
    $frontendPort = 5174
    if ($env:BACKEND_PORT) { $backendPort = [int]$env:BACKEND_PORT }
    if ($env:FRONTEND_PORT) { $frontendPort = [int]$env:FRONTEND_PORT }
    foreach ($port in @($backendPort, $frontendPort)) {
        if ($port -lt 1 -or $port -gt 65535) { throw 'Ports must be between 1 and 65535.' }
        Assert-FreePort $port
    }
    if ($backendPort -eq $frontendPort) { throw 'Frontend and backend ports must differ.' }
    $backendUrl = "http://127.0.0.1:$backendPort"
    $frontendUrl = "http://127.0.0.1:$frontendPort"
    Set-LaunchEnv 'VITE_API_URL' "$backendUrl/api/v1"
    Set-LaunchEnv 'CORS_ORIGINS' "$frontendUrl,http://localhost:$frontendPort"
    Set-LaunchEnv 'PYTHONUNBUFFERED' '1'
    if (-not $env:DATABASE_URL) { throw 'Set DATABASE_URL in .env to your local PostgreSQL database.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeCheck = 'const [a,b]=process.versions.node.split(String.fromCharCode(46)).map(Number); process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)'
    Invoke-Checked $node @('-e', $nodeCheck)
    $python = Join-Path $backendDir '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        if ($CheckOnly) { throw 'Backend virtual environment missing. Run start.bat to create it.' }
        Write-Host '[1/4] Creating Python virtual environment (Python 3.11+ required)...'
        $py = (Get-Command py.exe -ErrorAction Stop).Source
        Invoke-Checked $py @('-3', '-m', 'venv', (Join-Path $backendDir '.venv'))
    }
    Invoke-Checked $python @('-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)')
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    if (-not $CheckOnly) {
        Write-Host '[1/4] Checking backend dependencies...'
        $requirements = Join-Path $backendDir 'requirements.txt'
        $stamp = Join-Path $backendDir '.venv\.requirements.stamp'
        $hash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
        if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) {
            Invoke-Checked $python @('-m', 'pip', 'install', '-r', $requirements)
            Set-Content -LiteralPath $stamp -Value $hash -Encoding ASCII
        }
        Write-Host '[2/4] Checking frontend dependencies...'
        $stamp = Join-Path $frontendDir 'node_modules\.dependencies.stamp'
        $hash = ((Get-FileHash -LiteralPath (Join-Path $frontendDir 'package-lock.json')).Hash + (Get-FileHash -LiteralPath (Join-Path $frontendDir 'package.json')).Hash)
        if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) {
            Push-Location -LiteralPath $frontendDir
            try { Invoke-Checked $npm @('ci', '--no-audit', '--no-fund') }
            finally { Pop-Location }
            Set-Content -LiteralPath $stamp -Value $hash -Encoding ASCII
        }
    }
    Write-Host '[3/4] Checking local database...'
    $dbCheck = @'
import os, sys
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
try:
    url = make_url(os.environ['DATABASE_URL'])
    if url.get_backend_name() != 'sqlite' and url.host not in ('localhost', '127.0.0.1', '::1'):
        print('Local launcher requires a local database host. Check DATABASE_URL.')
        sys.exit(1)
    kwargs = {'connect_timeout': 5} if url.get_backend_name() == 'postgresql' else {}
    engine = create_engine(url, connect_args=kwargs)
    with engine.connect() as connection:
        connection.execute(text('SELECT 1'))
    engine.dispose()
except Exception as error:
    print('Database connection failed (' + type(error).__name__ + '). Check PostgreSQL, database, role and password in .env.')
    sys.exit(1)
'@
    Push-Location -LiteralPath $backendDir
    try {
        Invoke-Checked $python @('-c', $dbCheck)
        if (-not $CheckOnly) {
            Invoke-Checked $python @('-m', 'alembic', 'upgrade', 'head')
            if ($env:SEED_DEMO_DATA -eq 'true') { Invoke-Checked $python @('-m', 'app.db.seed') }
        }
    } finally { Pop-Location }
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        Write-Warning 'FFmpeg is not installed. Recording conversion requires FFmpeg on PATH.'
    }
    $vite = Join-Path $frontendDir 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $vite)) { throw 'Frontend dependencies missing. Run start.bat to install them.' }
    if ($CheckOnly) {
        Write-Host 'Configuration, runtimes, ports and database checks passed. No services started.' -ForegroundColor Green
    } else {
        Write-Host '[4/4] Starting backend and frontend...'
        $services += Start-ServiceProcess 'backend' $python @('-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', "$backendPort") $backendDir
        $services += Start-ServiceProcess 'frontend' $node @($vite, '--host', '127.0.0.1', '--port', "$frontendPort", '--strictPort') $frontendDir
        Wait-Http "$backendUrl/health" -Backend
        Wait-Http $frontendUrl
        Write-Host "Ready: $frontendUrl" -ForegroundColor Green
        Write-Host "API docs: $backendUrl/docs"
        Write-Host "Logs: $logDir"
        if (-not $SmokeTest) {
            if (-not $NoBrowser) { Start-Process $frontendUrl }
            Write-Host 'Keep this window open. Press Enter or Ctrl+C here to stop BOTH services.'
            while ($true) {
                Assert-ServicesRunning
                if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq [ConsoleKey]::Enter) { break }
                Start-Sleep -Milliseconds 300
            }
        } else { Write-Host 'Smoke test passed. Stopping both services.' }
    }
} catch {
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
} finally {
    foreach ($service in $services) {
        $service.Refresh()
        if (-not $service.HasExited) { Stop-OwnedProcessTree $service.Id }
        $service.Dispose()
    }
    foreach ($name in $originalEnv.Keys) { [Environment]::SetEnvironmentVariable($name, $originalEnv[$name], 'Process') }
    Pop-Location
}
exit $exitCode

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

function Get-ConfiguredPort([string]$name, [int]$fallback) {
    $envPath = Join-Path $projectRoot ".env"
    if (Test-Path -LiteralPath $envPath) {
        $match = Select-String -Path $envPath -Pattern "^$name\s*=\s*(\d+)" | Select-Object -First 1
        if ($match -and $match.Matches[0].Groups[1].Value) {
            return [int]$match.Matches[0].Groups[1].Value
        }
    }
    return $fallback
}

function Wait-ForDocker {
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    }
    throw "Docker Desktop did not become ready within 120 seconds."
}

Write-Host "Speaking Lab"
Write-Host "Project root: $projectRoot"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker was not found. Install Docker Desktop first."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path -LiteralPath $dockerDesktop) {
        Write-Host "Starting Docker Desktop..."
        Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
    } else {
        throw "Docker Desktop is not running and its executable was not found."
    }
    Wait-ForDocker
}

Write-Host "Building and starting services..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed to start."
}

$backendPort = Get-ConfiguredPort "BACKEND_PORT" 8000
$frontendPort = Get-ConfiguredPort "FRONTEND_PORT" 5173
$healthUrl = "http://localhost:$backendPort/health"
$ready = $false

Write-Host "Waiting for backend health check: $healthUrl"
for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
        $health = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 3
        if ($health.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # The container may need a few seconds before the API is ready.
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host "Backend health check timed out. Recent logs:" -ForegroundColor Red
    docker compose logs --no-color --tail 40 backend
    throw "Service startup timed out."
}

$frontendUrl = "http://localhost:$frontendPort"
Write-Host "Services are ready: $frontendUrl" -ForegroundColor Green
Write-Host "API docs: http://localhost:$backendPort/docs"
Start-Process $frontendUrl

Read-Host "Press Enter to close this window (services keep running)"


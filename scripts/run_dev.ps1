$root = Split-Path -Parent $PSScriptRoot
$engineDir = Join-Path $root "engine"
$appDir = Join-Path $root "app"
$py = Join-Path $engineDir ".venv\python.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   UAV SMART TRAINING - KHOI DONG HE THONG MO PHONG 3D    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Kiem tra va khoi dong Backend
$backendReady = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1 -ErrorAction Stop
    if ($res.status -eq "ok") { $backendReady = $true }
} catch {}

if (-not $backendReady) {
    Write-Host "[1/2] Dang bat UAV Backend (Port 8000)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$engineDir'; & '$py' -m uvicorn server.app:app --host 127.0.0.1 --port 8000"
    for ($i = 0; $i -lt 50; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1 -ErrorAction Stop
            if ($res.status -eq "ok") { $backendReady = $true; break }
        } catch {}
    }
}

if ($backendReady) {
    Write-Host " -> Backend OK (Port 8000)" -ForegroundColor Green
} else {
    Write-Host " -> Canh bao: Backend chua phan hoi tai 127.0.0.1:8000" -ForegroundColor Red
}

# 2. Kiem tra va khoi dong Frontend
$frontendReady = $false
try {
    $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($res.StatusCode -eq 200) { $frontendReady = $true }
} catch {}

if (-not $frontendReady) {
    Write-Host "[2/2] Dang bat Giao dien 3D Vite (Port 5173)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$appDir'; npm.cmd run dev"
    for ($i = 0; $i -lt 50; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($res.StatusCode -eq 200) { $frontendReady = $true; break }
        } catch {}
    }
}

if ($frontendReady) {
    Write-Host " -> Giao dien 3D OK (Port 5173)" -ForegroundColor Green
} else {
    Write-Host " -> Canh bao: Frontend chua phan hoi tai 127.0.0.1:5173" -ForegroundColor Red
}

# 3. Mo trinh duyet khi ca hai da san sang
Start-Process "http://localhost:5173"
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "He thong da san sang tai: http://localhost:5173" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

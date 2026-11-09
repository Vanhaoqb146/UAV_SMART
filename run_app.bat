@echo off
title UAV Smart Training Launcher
echo ========================================================
echo    UAV SMART TRAINING - HE THONG HUAN LUYEN UAV 3D
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/3] Khoi dong Backend FastAPI (Port 8000)...
start "UAV Backend (Port 8000)" cmd /k "cd /d "%~dp0engine" && .venv\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8000"

echo [2/3] Khoi dong Giao dien 3D Vite (Port 5173)...
start "UAV Frontend 3D (Port 5173)" cmd /k "cd /d "%~dp0app" && npm.cmd run dev"

echo [3/3] Dang cho he thong san sang...
timeout /t 4 /nobreak >nul

echo Mo trinh duyet tai http://localhost:5173 ...
start http://localhost:5173

echo.
echo ========================================================
echo He thong da khoi dong thanh cong!
echo Backend:   http://127.0.0.1:8000
echo Giao dien: http://localhost:5173
echo ========================================================
echo Nhan phim bat ky de dong cua so launcher nay (hai cua so server van chay).
pause >nul

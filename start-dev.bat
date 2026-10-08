@echo off
echo ========================================================
echo  Starting Marg Dhristhi Traffic Management System
echo ========================================================

echo [1/2] Starting Backend (FastAPI / Uvicorn on port 8000)...
start "Marg Dhristhi - Backend API" cmd /k "cd /d "%~dp0" && .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul

echo [2/2] Starting Frontend (Next.js on port 3000)...
start "Marg Dhristhi - Frontend UI" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================================
echo  System started!
echo  - Frontend: http://localhost:3000
echo  - Backend:  http://127.0.0.1:8000
echo  - API Docs: http://127.0.0.1:8000/docs
echo ========================================================

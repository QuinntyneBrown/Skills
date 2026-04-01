@echo off
title Skills Platform - Dev Server
cd /d "%~dp0"

echo ============================================
echo   Skills Platform - Local Development
echo ============================================
echo.

:: Load .env into environment
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
)

:: Start backend
echo [1/3] Starting backend on http://localhost:3000 ...
start "Skills API" cmd /c "cd /d "%~dp0" && npx ts-node-dev --respawn --transpile-only src/server.ts"

:: Wait for backend to be ready
echo       Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3000/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo       Backend ready.
echo.

:: Start frontend
echo [2/3] Starting frontend on http://localhost:5173 ...
start "Skills Web" cmd /c "cd /d "%~dp0web" && npx vite --open=false"

:: Wait for frontend to be ready
echo       Waiting for frontend...
:wait_frontend
timeout /t 1 /nobreak >nul
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 goto wait_frontend
echo       Frontend ready.
echo.

:: Open browser
echo [3/3] Opening Chrome...
start "" "chrome" "http://localhost:5173"

echo.
echo ============================================
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:5173
echo   Health:   http://localhost:3000/health
echo ============================================
echo.
echo Press any key to stop all servers...
pause >nul

:: Cleanup
echo Shutting down...
taskkill /fi "windowtitle eq Skills API" /f >nul 2>&1
taskkill /fi "windowtitle eq Skills Web" /f >nul 2>&1
echo Done.

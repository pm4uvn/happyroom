@echo off
setlocal
title HAPPYROOM - stop
cd /d "%~dp0"

echo [i] Stopping the web app (port 3000) and game server (port 2567) ...
for %%P in (3000 2567) do (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    taskkill /PID %%p /T /F >nul 2>nul
  )
)

echo [i] Stopping PostgreSQL and Redis (data is kept) ...
docker compose stop

echo [OK] HAPPYROOM stopped.
pause
endlocal

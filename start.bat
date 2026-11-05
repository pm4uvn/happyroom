@echo off
setlocal EnableExtensions
title HAPPYROOM - start
cd /d "%~dp0"

echo.
echo  ==========================================
echo    HAPPYROOM - Celebrate Together. Anywhere.
echo  ==========================================
echo.

rem ---------------------------------------------------------------
rem 1. Check required tools
rem ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed. Install Node.js 24 LTS from https://nodejs.org
  goto :fail
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [i] pnpm not found - installing pnpm 10.34.9 ...
  call npm i -g pnpm@10.34.9
  if errorlevel 1 goto :fail
)
where docker >nul 2>nul
if errorlevel 1 (
  echo [X] Docker is not installed. Install Docker Desktop from https://www.docker.com
  goto :fail
)

rem ---------------------------------------------------------------
rem 2. Make sure Docker Desktop is running (start it if needed)
rem ---------------------------------------------------------------
docker info >nul 2>nul
if not errorlevel 1 goto :docker_ready
echo [i] Starting Docker Desktop ...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
) else (
  echo [X] Docker Desktop is not running. Please start it manually, then run this file again.
  goto :fail
)
set /a tries=0
:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>nul
if not errorlevel 1 goto :docker_ready
set /a tries+=1
if %tries% geq 60 (
  echo [X] Docker did not start within 3 minutes.
  goto :fail
)
goto :wait_docker
:docker_ready
echo [OK] Docker is running.

rem ---------------------------------------------------------------
rem 3. Environment file + shared signing key (generated once, never printed)
rem ---------------------------------------------------------------
if not exist ".env" copy /y ".env.example" ".env" >nul && echo [OK] Created .env
powershell -NoProfile -Command "$p='.env'; $c=Get-Content $p -Raw; if ($c -notmatch '(?m)^JOIN_GRANT_SIGNING_KEY=.{32,}') { $b=New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $k=[Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_'); if ($c -match '(?m)^JOIN_GRANT_SIGNING_KEY=.*$') { $c=[regex]::Replace($c,'(?m)^JOIN_GRANT_SIGNING_KEY=.*$','JOIN_GRANT_SIGNING_KEY='+$k) } else { $c=$c.TrimEnd()+[Environment]::NewLine+'JOIN_GRANT_SIGNING_KEY='+$k+[Environment]::NewLine }; [IO.File]::WriteAllText((Resolve-Path $p),$c); Write-Host '[OK] Generated JOIN_GRANT_SIGNING_KEY in .env' }"
if errorlevel 1 goto :fail

rem ---------------------------------------------------------------
rem 4. Dependencies (first run only)
rem ---------------------------------------------------------------
if not exist "node_modules" (
  echo [i] Installing dependencies - first run, this takes a few minutes ...
  call pnpm install
  if errorlevel 1 goto :fail
)

rem ---------------------------------------------------------------
rem 5. Database + Redis, migrations and seed data (safe to re-run)
rem ---------------------------------------------------------------
echo [i] Starting PostgreSQL and Redis ...
docker compose up -d --wait postgres redis
if errorlevel 1 goto :fail
echo [i] Applying database migrations ...
call pnpm db:seed
if errorlevel 1 goto :fail

rem ---------------------------------------------------------------
rem 6. Build shared packages, then start the game server and the web app
rem ---------------------------------------------------------------
echo [i] Building shared packages ...
call pnpm --filter @happyroom/shared --filter @happyroom/game-core build
if errorlevel 1 goto :fail

echo [i] Stopping any previous HAPPYROOM servers on ports 3000 and 2567 ...
for %%P in (3000 2567) do (
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
    taskkill /PID %%p /T /F >nul 2>nul
  )
)

echo [i] Starting the multiplayer game server in a new window ...
start "HAPPYROOM game server - close this window to stop" /d "%~dp0apps\game-server" cmd /k pnpm dev

echo [i] Starting the web app in a new window ...
start "HAPPYROOM web - close this window to stop" /d "%~dp0apps\web" cmd /k pnpm dev

echo [i] Waiting for the game server (http://localhost:2567) and web app (http://localhost:3000) ...
powershell -NoProfile -Command "$urls='http://localhost:2567/health','http://localhost:3000/api/health'; foreach($u in $urls){ $ok=$false; for($i=0;$i -lt 90;$i++){ try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $u | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 2 } }; if(-not $ok){ Write-Host ('[!] No answer from ' + $u); exit 1 } }"
if errorlevel 1 (
  echo [!] A server did not answer yet. Check the two HAPPYROOM windows for errors.
  goto :end
)

start "" http://localhost:3000
echo.
echo [OK] HAPPYROOM is running at http://localhost:3000
echo      Create a room, then open the invite link in another browser (or a private window)
echo      to join as a second guest.
echo      To stop: run stop.bat
goto :end

:fail
echo.
echo [X] Start failed. See the messages above.
:end
echo.
pause
endlocal

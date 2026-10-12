@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22.13 or later is required. Install Node.js LTS from https://nodejs.org/
 pause
 exit /b 1
)
echo Icebreaker operator: http://127.0.0.1:8090/operator.html
echo Parent tracker:      http://127.0.0.1:8090/live.html
echo League website:      http://127.0.0.1:8090/league.html
echo Keep this window open while testing. Press Ctrl+C to stop.
start "" "http://127.0.0.1:8090/operator.html"
start "" "http://127.0.0.1:8090/live.html"
start "" "http://127.0.0.1:8090/league.html"
node server\rink-server.js
pause

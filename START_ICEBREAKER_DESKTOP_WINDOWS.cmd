@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-timekeeper-desktop.ps1"
if errorlevel 1 (
  echo Desktop startup failed. See the message above.
  pause
)

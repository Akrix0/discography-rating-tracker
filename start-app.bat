@echo off
title Discography & Rating Tracker - Multi-Artist Edition
cd /d "%~dp0"

if not exist "node_modules" (
  echo [1/2] Vstanovlennya zalezhnostey npm...
  call npm install
)

echo [2/2] Zapusk lokalnogo servera ta frontend...
echo Vidkryyte http://localhost:5173 u brauzeri.
start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"
call npm run dev
pause

@echo off
title Kios Berkat Indah
cd /d "%~dp0"

if not exist "node_modules" (
    echo.
    echo ===============================================
    echo  Menginstall dependencies...
    echo ===============================================
    call npm install
)

echo.
echo ===============================================
echo  Membangun CSS...
echo ===============================================
call npm run build:css

echo.
echo ===============================================
echo  Menjalankan server...
echo ===============================================
echo  Buka http://localhost:3000 di browser
echo  Tekan Ctrl+C untuk stop
echo ===============================================
echo.
node server.js
pause

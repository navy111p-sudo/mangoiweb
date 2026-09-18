@echo off
cd /d "%~dp0"
echo ============================================
echo   MANGO-AI deploy start (deploy.ps1)
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy.ps1"
echo.
echo ============================================
echo   deploy done - check test.mangoi.co.kr/admin.html
echo ============================================
pause

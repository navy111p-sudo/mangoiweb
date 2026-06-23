@echo off
chcp 65001 >nul
echo ============================================
echo  AI Ops Assistant - Attendance Deeplink Check
echo ============================================
node "%~dp0tests\check-attendance-deeplink.js"
echo.
pause

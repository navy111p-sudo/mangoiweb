@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Mangoi site auto-check (tests/check-site.js)
echo ============================================
echo.
node tests\check-site.js
set RESULT=%ERRORLEVEL%
echo.
if "%RESULT%"=="0" (
  echo [OK] All checks passed. Safe to run deploy.bat
) else (
  echo [STOP] Some checks FAILED. Fix them before deploying.
)
echo.
pause

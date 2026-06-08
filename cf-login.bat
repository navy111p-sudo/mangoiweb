@echo off
cd /d "%~dp0cloudflare-deploy"
echo.
echo ==========================================================
echo   Cloudflare login - browser will open in a moment.
echo   Log in to Cloudflare and click "Allow".
echo ==========================================================
echo.
call npx --yes wrangler@latest login
echo.
echo ==========================================================
echo   Done. Close this window, then run deploy.bat again.
echo ==========================================================
echo.
pause

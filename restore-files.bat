@echo off
cd /d "%~dp0"
echo ============================================
echo  Restore files lost to git index corruption
echo ============================================
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock"
echo [1] staging all working-tree files...
git add -A
echo [2] committing...
git commit -m "restore: recover tracked files lost to index corruption + mic selector + deploy lockfix"
echo [3] pushing to GitHub...
git push origin main
echo.
echo [4] tracked file count now:
git ls-files | find /c /v ""
echo.
git status -sb
echo.
echo Done. Tracked count should be ~157 and status clean.
echo Press any key to close.
pause >nul

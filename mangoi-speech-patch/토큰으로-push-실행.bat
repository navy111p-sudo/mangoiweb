@echo off
chcp 65001 >nul
REM ============================================================
REM  push-with-token.ps1 더블클릭 런처
REM  - 실행 정책 우회 + UTF-8 콘솔
REM  - 같은 폴더의 push-with-token.ps1 자동 실행
REM ============================================================

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\push-with-token.ps1"
pause

@echo off
REM Mangoi PowerShell deploy launcher
REM 더블클릭 시 deploy.ps1 을 ExecutionPolicy Bypass 로 실행
chcp 65001 > nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"

@echo off
REM webrtc-unified-platform - safe deploy (double-click to run)
REM staging first -> confirm -> production. Stops on build error.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-safe.ps1"
pause

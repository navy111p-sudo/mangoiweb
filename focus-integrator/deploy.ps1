# ==============================================================
#  메인 통합 시스템 — GitHub push (→ Cloudflare Pages 자동 배포)
#  Windows PowerShell 용 스크립트
#
#  사용법:
#    powershell -ExecutionPolicy Bypass -File deploy.ps1 https://github.com/<USER>/<REPO>.git
# ==============================================================
param(
    [string]$RemoteUrl = "https://github.com/navy111p-sudo/webrtc-client-app.git"
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "▶ Remote : $RemoteUrl" -ForegroundColor Cyan

# 파이썬 계산 로직 사전 검증 (선택)
if (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "▶ 로컬 계산 테스트..." -ForegroundColor Cyan
    try { python main_system.py } catch { }
    Write-Host ""
}

# git repo 초기화 (이미 있으면 재사용)
if (-not (Test-Path ".git")) {
    git init -b main
}

# 아이덴티티 기본값
if (-not (git config user.email)) { git config user.email "navy111p@gmail.com" }
if (-not (git config user.name))  { git config user.name  "Jeong Wooyoung" }

git add .
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "ℹ️  변경 사항 없음 — 커밋 건너뜀" -ForegroundColor Yellow
} else {
    git commit -m "feat: 메인 통합 시스템 + Cloudflare Pages 배포 구조"
}

# 원격 설정 / 업데이트
try   { git remote get-url origin | Out-Null; git remote set-url origin $RemoteUrl }
catch { git remote add origin $RemoteUrl }

Write-Host "▶ push → $RemoteUrl (main)" -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "✅ 완료. Cloudflare Pages 가 이 저장소에 연결되어 있다면 자동 배포가 시작됩니다." -ForegroundColor Green
Write-Host "   최초 1회: Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git"

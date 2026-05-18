# Phase 39 — 교재 파일 라이브러리 + 망고아이 비디오 배포
# 사용법: Windows PowerShell 에서 .\deploy-phase39.ps1 실행
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()

$ROOT = $PSScriptRoot
if (-not $ROOT) { $ROOT = (Get-Location).Path }
Set-Location $ROOT

Write-Host "=========================================="
Write-Host " Phase 39 Deploy"
Write-Host " Textbook File Library + Mango-i Videos"
Write-Host "=========================================="

# 0) Cowork 세션이 남긴 잠금 파일 정리
if (Test-Path ".git\index.lock") {
  Write-Host "[step] Removing .git\index.lock"
  Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
}

# 1) Cowork 가 미리 만든 Phase 39 커밋이 이미 origin/main 보다 앞서있는지 확인
Write-Host "[step] git log (latest 3 commits)"
git log --oneline -3

# 2) 혹시 워킹트리에 미반영 변경이 남아있으면 reset (Cowork 가 이미 같은 커밋을 만듦)
$dirty = (git status --porcelain) | Where-Object { $_ -match '^\s*MM' }
if ($dirty) {
  Write-Host "[step] working tree dirty — git checkout HEAD -- (Cowork commit already at HEAD)"
  git checkout HEAD -- cloudflare-deploy/public/admin.html cloudflare-deploy/public/index.html cloudflare-deploy/schema.sql cloudflare-deploy/src/api-mango.ts cloudflare-deploy/src/index.ts
}

# 3) GitHub 푸시
Write-Host "[step] git push origin main"
git push origin main

# 4) Cloudflare Worker 배포 (메모리 함정 회피: --config 명시)
Write-Host "[step] wrangler deploy"
Set-Location "$ROOT\cloudflare-deploy"
npx wrangler deploy --config wrangler.toml

Write-Host ""
Write-Host "=========================================="
Write-Host " Phase 39 deploy complete"
Write-Host "=========================================="
Write-Host " URL    : https://webrtc-unified-platform.navy111p.workers.dev/"
Write-Host " Admin  : https://webrtc-unified-platform.navy111p.workers.dev/admin"
Write-Host "          --> 교재 콘텐츠 관리"
Write-Host "             --> 교재 파일 라이브러리 (PDF/JPG/PNG)"
Write-Host "             --> 망고아이 비디오 관리 (YouTube)"

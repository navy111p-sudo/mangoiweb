#requires -Version 5.1
<#
  YouTube 버튼 자동 재생 패치 → GitHub 푸시 + Cloudflare Workers 배포
  반드시 BOM 포함 UTF-8 로 저장됩니다 (Windows PowerShell 5 한글 호환).

  실행 방법:
    1) PowerShell 을 "C:\Users\Admin\Desktop\mangoi_develop2-main\mangoiweb(last)" 에서 연다
    2) Set-ExecutionPolicy -Scope Process Bypass
    3) .\deploy-youtube-fix.ps1
#>

$ErrorActionPreference = 'Stop'
$root = "C:\Users\Admin\Desktop\mangoi_develop2-main\mangoiweb(last)"
Set-Location $root

Write-Host ""
Write-Host "================ 1/3  GitHub 푸시 ================" -ForegroundColor Cyan
git status --short
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "git push 실패 - GitHub 자격증명을 확인하세요." -ForegroundColor Red
    exit 1
}
Write-Host "GitHub 푸시 완료" -ForegroundColor Green

Write-Host ""
Write-Host "================ 2/3  Cloudflare Workers 배포 ================" -ForegroundColor Cyan
Set-Location (Join-Path $root 'cloudflare-deploy')
# memory: 부모 폴더 wrangler.jsonc 가 잘못 잡히는 사고 방지 - 반드시 --config 명시
npx wrangler deploy --config wrangler.toml
if ($LASTEXITCODE -ne 0) {
    Write-Host "wrangler deploy 실패" -ForegroundColor Red
    exit 1
}
Write-Host "Cloudflare 배포 완료" -ForegroundColor Green

Write-Host ""
Write-Host "================ 3/3  완료 ================" -ForegroundColor Cyan
Write-Host "확인 URL: https://webrtc-unified-platform-prod.navy111p.workers.dev" -ForegroundColor Yellow
Write-Host "또는    : https://webrtc-unified-platform.navy111p.workers.dev"   -ForegroundColor Yellow
Write-Host ""
Write-Host "테스트:" -ForegroundColor Cyan
Write-Host "  1) 위 URL 접속 -> 수업방 입장 -> 동영상 탭 클릭"
Write-Host "  2) [▶ YouTube] 버튼 클릭"
Write-Host "  3) 검색창에 'www.youtube.com' 자동 입력 + 칠판에 미니 YouTube 패널 자동 표시 + 추천 영상 자동 재생 확인"

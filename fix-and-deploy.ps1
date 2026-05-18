#requires -Version 5.1
<#
  검은 화면 안내(placeholder) 패치 + git index 복구 + GitHub 푸시 + Cloudflare 배포
  BOM 포함 UTF-8 (Windows PowerShell 5 한글 호환)
  실행:
    PowerShell 에서:
      cd "C:\Users\Admin\Desktop\mangoi_develop2-main\mangoiweb(last)"
      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\fix-and-deploy.ps1
#>

$ErrorActionPreference = 'Continue'
$root = "C:\Users\Admin\Desktop\mangoi_develop2-main\mangoiweb(last)"
Set-Location $root

# 🩹 stale git lock 정리
@('index.lock', 'HEAD.lock') | ForEach-Object {
    $p = Join-Path $root ".git\$_"
    if (Test-Path $p) {
        try { Remove-Item $p -Force -ErrorAction Stop; Write-Host "[정리] $p" -ForegroundColor Gray } catch {}
    }
}

# 🩺 git index 복구 (샌드박스가 만든 corrupt index 처리)
Write-Host ""
Write-Host "================ 0/3  git index 점검 ================" -ForegroundColor Cyan
$indexCheck = git status --short 2>&1
if ($indexCheck -match 'index file corrupt' -or $indexCheck -match 'index uses .* extension') {
    Write-Host "git index 손상 감지 - 재구축 시도" -ForegroundColor Yellow
    Remove-Item (Join-Path $root '.git\index') -Force -ErrorAction SilentlyContinue
    git read-tree HEAD 2>&1 | Out-Null
    git update-index --refresh 2>&1 | Out-Null
    Write-Host "git index 재구축 완료" -ForegroundColor Green
}

Write-Host ""
Write-Host "================ 1/3  GitHub 푸시 ================" -ForegroundColor Cyan
git status --short
git add cloudflare-deploy/public/index.html 2>&1 | Out-Null
$staged = git diff --cached --name-only
if ($staged) {
    git commit -m "feat: 본인 영상 검은 화면 - 명확한 오류 안내 placeholder + 카메라 재시도 버튼

getUserMedia 실패(권한 거부 / 다른 앱 카메라 점유 / 케이블 분리 등) 시
검은 비디오 박스 대신 명확한 안내 표시:
- 카메라 트랙 0개: '카메라가 꺼져 있어요' + 안내
- getUserMedia 실패 후 오디오만 성공: '카메라를 사용할 수 없어요' + 사유
- 완전 실패: '카메라/마이크 모두 사용 불가' + OS 권한 안내
- 각 케이스마다 [🔄 카메라 다시 시도] 버튼 - 클릭 시 acquireLocalMedia 재시도
  + 성공 시 모든 PeerConnection 의 비디오 sender 트랙도 자동 replaceTrack"
} else {
    Write-Host "변경사항 없음 - 기존 커밋만 푸시" -ForegroundColor Gray
}
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "git push 실패 - GitHub 자격증명 확인 필요" -ForegroundColor Red
    exit 1
}
Write-Host "GitHub 푸시 완료" -ForegroundColor Green

Write-Host ""
Write-Host "================ 2/3  Cloudflare 배포 ================" -ForegroundColor Cyan
Set-Location (Join-Path $root 'cloudflare-deploy')
npx wrangler deploy --config wrangler.toml
if ($LASTEXITCODE -ne 0) { Write-Host "wrangler deploy 실패" -ForegroundColor Red; exit 1 }
Write-Host "Cloudflare 배포 완료" -ForegroundColor Green

Write-Host ""
Write-Host "================ 3/3  테스트 가이드 ================" -ForegroundColor Cyan
Write-Host "확인: https://webrtc-unified-platform-prod.navy111p.workers.dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "[검은 화면 재현 → 안내 표시 확인]" -ForegroundColor Cyan
Write-Host "  1) 다른 앱(Zoom/Teams)으로 카메라 점유 상태에서 입장"
Write-Host "     → 검은 화면 대신 '⚠️ 카메라를 사용할 수 없어요' 표시"
Write-Host "  2) [🔄 카메라 다시 시도] 클릭 → 점유 해제 후 정상 동작"
Write-Host "  3) Chrome 주소창 카메라 권한 거부 후 입장"
Write-Host "     → '📷 카메라가 꺼져 있어요' 표시"

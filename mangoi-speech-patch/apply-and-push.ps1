# =============================================================
#  mangoi_Speech repo 자동 패치 + GitHub push (PowerShell)
# -------------------------------------------------------------
#  실행: PowerShell 우클릭 → "PowerShell로 실행"
#  또는 같은 폴더에서 우클릭 → "여기서 PowerShell 열기" 후
#       .\apply-and-push.ps1
# =============================================================

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
chcp 65001 | Out-Null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " 🇨🇳 mangoi_Speech : Chinese coach card 패치" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$PatchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir  = Join-Path $PatchDir 'mangoi_Speech'
$PatchSrc = Join-Path $PatchDir 'category-ui.js'

# 1) 사전 체크
Write-Host "[STEP 1/6] 사전 체크..." -ForegroundColor Yellow
if (-not (Test-Path $PatchSrc)) {
    Write-Host "  ❌ 패치 파일 없음: $PatchSrc" -ForegroundColor Red
    pause; exit 1
}
try {
    $gitVer = git --version 2>&1
    Write-Host "  ✅ git OK: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ❌ git 명령을 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "     설치: https://git-scm.com" -ForegroundColor Yellow
    Write-Host "     설치 후 PowerShell 재시작 필요" -ForegroundColor Yellow
    pause; exit 1
}

# 2) 기존 clone 삭제
if (Test-Path $RepoDir) {
    Write-Host "[STEP 2/6] 기존 clone 폴더 삭제 중..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $RepoDir
}

# 3) clone
Write-Host "[STEP 3/6] navy111p-sudo/mangoi_Speech clone 중..." -ForegroundColor Yellow
& git clone https://github.com/navy111p-sudo/mangoi_Speech.git $RepoDir 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ git clone 실패" -ForegroundColor Red
    pause; exit 1
}

# 4) 패치 복사
Write-Host "[STEP 4/6] category-ui.js 패치 복사..." -ForegroundColor Yellow
Copy-Item -Force $PatchSrc (Join-Path $RepoDir 'js\category-ui.js')

# 5) commit + push
Write-Host "[STEP 5/6] git add + commit + push..." -ForegroundColor Yellow
Push-Location $RepoDir
try {
    & git add 'js/category-ui.js' 2>&1 | Out-Host
    & git -c user.email='navy111p@gmail.com' -c user.name='navy111p-sudo' commit -m "feat: 🇨🇳 중국어 카드 추가 (Phonics/BTS/SIU 옆) - speech-coach-cn.html 로 이동" 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ⚠️ commit 변경사항 없음 (이미 동일한 내용일 수 있음)" -ForegroundColor Yellow
    } else {
        & git push origin main 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "  ❌ git push 실패!" -ForegroundColor Red
            Write-Host "  원인: GitHub 인증 미완료" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "  해결책 1 — Git Credential Manager (가장 쉬움):" -ForegroundColor Cyan
            Write-Host "    git config --global credential.helper manager" -ForegroundColor White
            Write-Host "    그 다음 git push 시 브라우저 GitHub 로그인 팝업이 뜸" -ForegroundColor White
            Write-Host ""
            Write-Host "  해결책 2 — Personal Access Token (PAT):" -ForegroundColor Cyan
            Write-Host "    https://github.com/settings/tokens 에서 토큰 발급" -ForegroundColor White
            Write-Host "    push 시 username=navy111p-sudo, password=토큰 입력" -ForegroundColor White
            Write-Host ""
            Write-Host "  해결책 3 — 그냥 웹에서 편집 (가장 빠름):" -ForegroundColor Cyan
            Write-Host "    같은 폴더 '1-가장-쉬운-방법-GitHub-웹-편집.md' 참고" -ForegroundColor White
            pause; exit 1
        }
    }
} finally {
    Pop-Location
}

# 6) 완료
Write-Host ""
Write-Host "[STEP 6/6] ✅ 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Pages 자동 빌드 1~2분 후 확인:" -ForegroundColor White
Write-Host "  https://mangoi-speech.pages.dev/practice" -ForegroundColor Yellow
Write-Host "  '🇨🇳 中文 (Lv 1~20)' 카드가 Phonics/BTS/SIU 옆에 보임" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 정리
Remove-Item -Recurse -Force $RepoDir -ErrorAction SilentlyContinue

Write-Host "아무 키나 누르면 종료..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

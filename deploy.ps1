# ============================================================
# Mangoi 강제 재배포 v3 — HTML hash 강제 변경 모드
# ============================================================
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Continue'

function Write-Header { param([string]$Text, [string]$Color = 'Cyan')
    Write-Host ""; Write-Host ("=" * 60) -ForegroundColor $Color
    Write-Host $Text -ForegroundColor $Color
    Write-Host ("=" * 60) -ForegroundColor $Color
}
function Write-Step { param([string]$Step, [string]$Text)
    Write-Host ""; Write-Host "[$Step] " -ForegroundColor Yellow -NoNewline
    Write-Host $Text -ForegroundColor White
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Header "Mangoi 강제 재배포 v3 — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# [1] git lock — stale lock 전부 정리 (index/HEAD/maintenance/config/packed-refs + refs/**)
Write-Step "1/7" "git 잠금(stale lock) 제거"
$gitDir = Join-Path $scriptDir ".git"
$lockTargets = @(
    (Join-Path $gitDir "index.lock"),
    (Join-Path $gitDir "HEAD.lock"),
    (Join-Path $gitDir "objects\maintenance.lock"),
    (Join-Path $gitDir "config.lock"),
    (Join-Path $gitDir "packed-refs.lock")
)
Get-ChildItem -Path (Join-Path $gitDir "refs") -Recurse -Filter "*.lock" -ErrorAction SilentlyContinue | ForEach-Object { $lockTargets += $_.FullName }
foreach ($lf in $lockTargets) {
    if (Test-Path $lf) { Remove-Item $lf -Force -ErrorAction SilentlyContinue; Write-Host "  제거: $($lf -replace [regex]::Escape($scriptDir),'.')" -ForegroundColor Gray }
}
Write-Host "  완료" -ForegroundColor Green

# [2] .wrangler 캐시 삭제
Write-Step "2/7" ".wrangler 캐시 강제 삭제"
$wc = Join-Path $scriptDir "cloudflare-deploy\.wrangler"
if (Test-Path $wc) { Remove-Item $wc -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host "  완료" -ForegroundColor Green

# [3] BUILD_STAMP 갱신
Write-Step "3/7" "wrangler.toml BUILD_STAMP 갱신"
$tomlPath = Join-Path $scriptDir "cloudflare-deploy\wrangler.toml"
if (Test-Path $tomlPath) {
    $stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'
    $c = Get-Content $tomlPath -Raw -Encoding UTF8
    $c = $c -replace 'BUILD_STAMP\s*=\s*"[^"]*"', "BUILD_STAMP = ""$stamp"""
    Set-Content -Path $tomlPath -Value $c -Encoding UTF8 -NoNewline
    Write-Host "  -> $stamp" -ForegroundColor Green
}

# [4] HTML hash 강제 변경 — 모든 .html 파일에 timestamp 주석 삽입/갱신
Write-Step "4/7" "HTML hash 강제 변경 (wrangler가 무조건 새 파일 인식하도록)"
$buildTs = Get-Date -Format 'yyyyMMddHHmmss'
$htmlFiles = Get-ChildItem "cloudflare-deploy\public\*.html" -ErrorAction SilentlyContinue
foreach ($f in $htmlFiles) {
    try {
        $content = Get-Content $f.FullName -Raw -Encoding UTF8
        $newComment = "<!-- BUILD:$buildTs -->"
        if ($content -match '<!-- BUILD:\d+ -->') {
            $content = $content -replace '<!-- BUILD:\d+ -->', $newComment
        } else {
            $content = $content -replace '</body>', "$newComment`n</body>"
        }
        [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  [+] $($f.Name) -> BUILD:$buildTs" -ForegroundColor Gray
    } catch {
        Write-Host "  [!] $($f.Name) 실패: $_" -ForegroundColor Yellow
    }
}

# [5] git
Write-Step "5/7" "git commit + push"
git config user.email "navy111p@gmail.com" 2>&1 | Out-Null
git config user.name  "navy111p-sudo" 2>&1 | Out-Null
git add cloudflare-deploy/public/ cloudflare-deploy/src/ cloudflare-deploy/wrangler.toml cloudflare-deploy/schema.sql cloudflare-deploy/migration-attendance-checkin.sql cloudflare-deploy/tsconfig.testbuild.json test-harness/ .gitignore deploy.ps1 2>&1 | Out-Null
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (build $buildTs)" 2>&1 | Out-Null
git push origin main 2>&1 | Out-Null
Write-Host "  완료" -ForegroundColor Green

# [6] Cloudflare deploy
Write-Step "6/7" "Cloudflare Workers 배포"
# 비대화형 모드 — wrangler 최신 버전의 "skills 설치?" 등 프롬프트로 멈추지 않게
$env:CI = "true"
$env:WRANGLER_SEND_METRICS = "false"
Push-Location cloudflare-deploy
try {
    & npx --yes wrangler@latest deploy --config wrangler.toml 2>&1 | ForEach-Object {
        $line = $_
        if     ($line -match 'Uploaded webrtc-unified-platform') { Write-Host $line -ForegroundColor Green }
        elseif ($line -match 'Found \d+|Uploaded \d+|Success!') { Write-Host $line -ForegroundColor Cyan }
        elseif ($line -match 'ERROR|error|failed')              { Write-Host $line -ForegroundColor Red }
        elseif ($line -match 'WARNING|warning')                 { Write-Host $line -ForegroundColor Yellow }
        else { Write-Host $line -ForegroundColor Gray }
    }
    $deployExit = $LASTEXITCODE
} finally { Pop-Location }

# [7] 결과
Write-Step "7/7" "결과 + 휴대폰 안내"
if ($deployExit -eq 0) { Write-Host "  배포 성공!" -ForegroundColor Green }
else { Write-Host "  wrangler 종료 코드 $deployExit (cron 에러면 무시)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "===== 휴대폰에서 반드시 할 것 =====" -ForegroundColor Yellow
Write-Host "1. 브라우저 설정 -> 사이트 데이터 -> mango-i.com 데이터 완전 삭제" -ForegroundColor White
Write-Host "2. 또는 시크릿/InPrivate 모드로 접속 (가장 확실)" -ForegroundColor White
Write-Host "3. PWA 앱으로 설치되어 있으면 홈 화면에서 길게 눌러 앱 제거" -ForegroundColor White
Write-Host ""
Write-Host "아무 키나 누르면 닫힙니다..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

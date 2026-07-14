# ============================================================
# Mangoi 강제 재배포 v3 — HTML hash 강제 변경 모드
#   v3.1 (2026-07-14): 배포 전 안전 게이트(tsc+스모크) 추가 — REFACTOR_PLAN 5단계
#   급할 때 게이트 우회: powershell -File deploy.ps1 -SkipSmoke
# ============================================================
param([switch]$SkipSmoke)
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

# [0] 배포 전 안전 게이트 — 실패하면 파일 하나 안 건드리고 여기서 중단 (REFACTOR_PLAN 5단계)
#   ① tsc 컴파일: 새 코드가 깨졌으면 배포 금지
#   ② 라이브 스모크 15종: 현재 운영이 이미 비정상이면(깨진 위에 덮어쓰기 방지) 배포 금지
if (-not $SkipSmoke) {
    Write-Step "0/7" "배포 전 게이트: tsc 컴파일 + 라이브 스모크 (우회: -SkipSmoke)"
    Push-Location (Join-Path $scriptDir "cloudflare-deploy")
    try {
        $tscOut = & npx --yes tsc --noEmit 2>&1
        $tscExit = $LASTEXITCODE
    } finally { Pop-Location }
    if ($tscExit -ne 0) {
        $tscOut | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host "  [X] tsc 컴파일 실패 — 배포 중단. 코드를 고친 뒤 다시 실행하세요." -ForegroundColor Red
        exit 1
    }
    Write-Host "  tsc 통과" -ForegroundColor Green
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "cloudflare-deploy\scripts\smoke-test.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [X] 라이브 스모크 실패 — 현재 운영 서버가 이미 비정상입니다. 원인 확인 전 배포 중단." -ForegroundColor Red
        Write-Host "      (지금 상태 그대로 급히 배포해야 하면: powershell -File deploy.ps1 -SkipSmoke)" -ForegroundColor Yellow
        exit 1
    }
}

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

# [3b] Service Worker(sw.js) 캐시 버전 자동 증가
#   - PWA 서비스워커가 JS/CSS/이미지를 cache-first 로 제공하므로,
#     CACHE_NAME 이 안 바뀌면 배포해도 브라우저가 옛 버전을 계속 보여줌.
#   - 매 배포마다 버전을 빌드 타임스탬프로 교체 -> activate 시 옛 캐시 전부 삭제 -> 즉시 새 버전 전파.
Write-Step "3b/7" "sw.js 서비스워커 캐시 버전 갱신"
$swPath = Join-Path $scriptDir "cloudflare-deploy\public\sw.js"
if (Test-Path $swPath) {
    $swVer = "mangoi-$(Get-Date -Format 'yyyyMMddHHmmss')-fresh"
    $swc = Get-Content $swPath -Raw -Encoding UTF8
    $swc = $swc -replace "const CACHE_NAME\s*=\s*'[^']*';",   "const CACHE_NAME = '$swVer';"
    $swc = $swc -replace "const RUNTIME_CACHE\s*=\s*'[^']*';", "const RUNTIME_CACHE = '$swVer-rt';"
    [System.IO.File]::WriteAllText($swPath, $swc, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  -> CACHE_NAME = $swVer" -ForegroundColor Green
} else {
    Write-Host "  [!] sw.js 없음 — 건너뜀" -ForegroundColor Yellow
}

# [4] HTML hash 강제 변경 — 모든 .html 파일에 timestamp 주석 삽입/갱신
Write-Step "4/7" "HTML hash 강제 변경 (wrangler가 무조건 새 파일 인식하도록)"
$buildTs = Get-Date -Format 'yyyyMMddHHmmss'
$htmlFiles = Get-ChildItem "cloudflare-deploy\public\*.html" -ErrorAction SilentlyContinue
foreach ($f in $htmlFiles) {
    try {
        $content = Get-Content $f.FullName -Raw -Encoding UTF8
        $newComment = "<!-- BUILD:$buildTs -->"
        # 🛡️ (2026-07-14) BUILD 마커는 '자기 줄에 홀로 있는' 것만 갱신한다.
        #   과거 버그: '</body>' 를 무조건 치환 → document.write/html+= JS 문자열 안의
        #   </body> 에도 주입돼 작은따옴표 문자열이 개행으로 깨짐(관리자 3화면 장애).
        #   이제 (a) 줄 홀로 BUILD 주석만 갱신, (b) 없으면 '마지막' </body> 앞 한 줄로만 삽입.
        if ($content -match '(?m)^\s*<!-- BUILD:\d+ -->\s*$') {
            $content = $content -replace '(?m)^(\s*)<!-- BUILD:\d+ -->\s*$', "`$1$newComment"
        } else {
            # 마지막 </body> 앞에만 삽입 (문자열 내부 </body> 는 뒤에 또 </body> 가 있으므로 제외)
            $content = $content -replace '(?s)</body>(?![\s\S]*</body>)', "$newComment`n</body>"
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
git add cloudflare-deploy/public/ cloudflare-deploy/src/ cloudflare-deploy/scripts/ cloudflare-deploy/wrangler.toml cloudflare-deploy/schema.sql cloudflare-deploy/migration-attendance-checkin.sql cloudflare-deploy/tsconfig.testbuild.json test-harness/ .gitignore deploy.ps1 2>&1 | Out-Null
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (build $buildTs)" 2>&1 | Out-Null
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!] git push origin main 실패 (exit $LASTEXITCODE) — 원격이 앞서거나 인증 문제일 수 있음." -ForegroundColor Red
    Write-Host "      수동 확인: git pull --no-rebase origin main  후  git push origin main" -ForegroundColor Yellow
} else {
    Write-Host "  push 완료" -ForegroundColor Green
}

# [6] Cloudflare deploy — 기본(webrtc-unified-platform) + 프로덕션(webrtc-unified-platform-prod) 둘 다
# 주의: 실제 운영 도메인이 '-prod' 라서, 프로덕션 env 까지 배포해야 변경이 사용자 화면에 반영됨.
Write-Step "6/7" "Cloudflare Workers 배포 (기본 + 프로덕션 -prod)"
# 비대화형 모드 — wrangler 최신 버전의 "skills 설치?" 등 프롬프트로 멈추지 않게
$env:CI = "true"
$env:WRANGLER_SEND_METRICS = "false"
Push-Location cloudflare-deploy
try {
    function Invoke-WranglerDeploy {
        param([string]$Label, [string[]]$Extra)
        Write-Host ""; Write-Host "  >>> $Label 배포 중..." -ForegroundColor Cyan
        & npx --yes wrangler@latest deploy --config wrangler.toml @Extra 2>&1 | ForEach-Object {
            $line = $_
            if     ($line -match 'Uploaded webrtc-unified-platform') { Write-Host $line -ForegroundColor Green }
            elseif ($line -match 'Found \d+|Uploaded \d+|Success!') { Write-Host $line -ForegroundColor Cyan }
            elseif ($line -match 'ERROR|error|failed')              { Write-Host $line -ForegroundColor Red }
            elseif ($line -match 'WARNING|warning')                 { Write-Host $line -ForegroundColor Yellow }
            else { Write-Host $line -ForegroundColor Gray }
        }
        return $LASTEXITCODE
    }
    $exitMain = Invoke-WranglerDeploy -Label "기본(webrtc-unified-platform)" -Extra @()
    $exitProd = Invoke-WranglerDeploy -Label "프로덕션(webrtc-unified-platform-prod)" -Extra @('--env','production')
    if ($exitMain -ne 0) { $deployExit = $exitMain } else { $deployExit = $exitProd }
} finally { Pop-Location }

# [6b] 배포 후 스모크 재검증 — 방금 나간 코드가 실서버에서 정상인지 즉시 확인
$postSmokeFailed = $false
if (-not $SkipSmoke) {
    Write-Step "6b/7" "배포 후 스모크 재검증 (15종)"
    Start-Sleep -Seconds 5   # 엣지 전파 잠깐 대기
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir "cloudflare-deploy\scripts\smoke-test.ps1")
    if ($LASTEXITCODE -ne 0) {
        $postSmokeFailed = $true
        Write-Host ""; Write-Host ("!" * 60) -ForegroundColor Red
        Write-Host "  [X] 배포 후 스모크 실패 — 방금 배포가 기능을 깨뜨렸을 수 있습니다!" -ForegroundColor Red
        Write-Host "  롤백: cd cloudflare-deploy; npx wrangler rollback  (프로덕션은 --env production)" -ForegroundColor Yellow
        Write-Host ("!" * 60) -ForegroundColor Red
    }
}

# [7] 결과
Write-Step "7/7" "결과 + 휴대폰 안내"
if ($deployExit -eq 0 -and -not $postSmokeFailed) { Write-Host "  배포 성공!" -ForegroundColor Green }
elseif ($postSmokeFailed) { Write-Host "  배포는 됐지만 스모크 실패 — 위 경고를 확인하세요!" -ForegroundColor Red }
else { Write-Host "  wrangler 종료 코드 $deployExit (cron 에러면 무시)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "===== 휴대폰에서 반드시 할 것 =====" -ForegroundColor Yellow
Write-Host "1. 브라우저 설정 -> 사이트 데이터 -> mango-i.com 데이터 완전 삭제" -ForegroundColor White
Write-Host "2. 또는 시크릿/InPrivate 모드로 접속 (가장 확실)" -ForegroundColor White
Write-Host "3. PWA 앱으로 설치되어 있으면 홈 화면에서 길게 눌러 앱 제거" -ForegroundColor White
Write-Host ""
# 대화형(더블클릭) 실행에서만 키 대기 — 자동화/리다이렉트 환경에선 건너뜀(멈춤 방지)
if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Write-Host "아무 키나 누르면 닫힙니다..." -ForegroundColor Gray
    try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch {}
}

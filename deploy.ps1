# ============================================================
# Mangoi 강제 재배포 v3 — HTML hash 강제 변경 모드
#   v3.1 (2026-07-14): 배포 전 안전 게이트(tsc+스모크) 추가 — REFACTOR_PLAN 5단계
#   v3.2 (2026-08-12): [0b] 라이브 되감김 게이트 추가
#       이 스크립트는 로컬 public 폴더를 통째로 올린다. 그 사이 남이 배포한 것이
#       내 폴더에 없으면 라이브에서 조용히 사라진다 — 하루에 세 번 겪고 넣었다.
#   v3.3 (2026-09-01): [0c] 수업 시간대 배포 보류 게이트 추가
#       배포하면 화상수업 DO 가 재시작되어 진행 중인 «모든» 수업이 끊긴다.
#       실측: 21:43:57 배포 8초 뒤 class-1070, 37초 뒤 class-1078 강사가 동시에 끊겼다.
#   급할 때 게이트 우회: powershell -File deploy.ps1 -SkipSmoke
#   되감김 게이트만 우회:  powershell -File deploy.ps1 -SkipLiveDrift
#   수업 시간대에도 지금:  powershell -File deploy.ps1 -ForceNow
#     ⚠️ -SkipSmoke 는 되감김·수업시간 게이트를 끄지 않는다. 급할수록 크게 터진다.
# ============================================================
param([switch]$SkipSmoke, [switch]$SkipLiveDrift, [switch]$ForceNow)
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

# [0a] 인라인 JS 문법 게이트 — 이것만은 -SkipSmoke 로도 못 건너뛴다.
#   2026-07-23 22:10 배포: 폰트 일괄치환이 JS 문자열 안 CSS 를 건드려 문자열이 끊겼고
#   index.html 인라인 script 10블록이 통째로 SyntaxError → 수업 입장 함수가 아예 정의되지
#   않아 전 사용자가 수업에 못 들어갔다. 그런데 tsc(.ts만) · 스모크(HTTP 200만) ·
#   하니스를 전부 통과했다. 검사 자체는 changes_qa_harness 안에 있었지만 그 하니스가
#   git 상태에 의존한다는 이유로 run.mjs 의 GATE_EXCLUDE 에 올라가 게이트에서 빠져 있었다.
#   => '러너에서 제외되면 조용히 뚫린다'가 이번 사고의 진짜 원인이므로, 러너와 무관하게
#      여기서 한 번 더 못을 박는다. 네트워크·git·DB 무관한 결정론적 검사라 몇 초면 끝난다.
Write-Step "0a/7" "인라인 JS 문법 게이트 (HTML <script> + .js 전수) — 건너뛸 수 없음"
& node (Join-Path $scriptDir "test-harness\inline_js_syntax_harness.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [X] 인라인 JS 문법 오류 — 배포 중단." -ForegroundColor Red
    Write-Host "      이대로 올리면 해당 script 블록이 브라우저에서 통째로 실행되지 않습니다." -ForegroundColor Red
    Write-Host "      블록 안 함수가 전부 정의되지 않아 화면 기능이 통째로 죽습니다." -ForegroundColor Red
    Write-Host "      HTML 을 일괄치환(폰트/색/클래스명/i18n)했다면 그 치환이 원인일 가능성이 높습니다." -ForegroundColor Yellow
    exit 1
}
Write-Host "  인라인 JS 문법 통과" -ForegroundColor Green

# ============================================================================
# [0b] 라이브 되감김 게이트 — "내 배포가 남의 작업을 지우는가"
# ----------------------------------------------------------------------------
#   왜 필요한가 (2026-08-12 하루에 세 번 겪었다):
#     이 스크립트는 로컬 cloudflare-deploy/public 폴더를 **통째로** 올린다.
#     그래서 그 사이 누가 main 에 머지하고 Actions 로 배포했으면, 그 결과물이
#     내 로컬 폴더에 없다는 이유만으로 **라이브에서 조용히 사라진다.**
#     실제 사고: 05:43 Actions 배포(PR #72·#78 — 녹화 동의)가 06:18 로컬 배포에
#     통째로 덮였다. 아무 에러도 안 났고, 몇 시간 뒤 "동의가 0행" 으로만 드러났다.
#     반대 방향도 같은 날 있었다 — main 머지가 로컬 배포분을 지웠다.
#
#   무엇을 보는가:
#     라이브 index.html 에는 있는데 내 로컬 index.html 에는 없는 줄.
#     그런 줄이 있으면 = 내가 지금 올리면 그게 사라진다 = 멈춘다.
#     (BUILD 스탬프 줄은 매 배포마다 바뀌므로 비교에서 뺀다)
#
#   왜 workers.dev 원본을 보는가:
#     커스텀 도메인(test.mangoi.co.kr)은 엣지가 "/" 를 쿼리 무시하고 HIT 로 굳혀
#     옛 HTML 을 내주는 일이 있다. 원본은 그 영향을 안 받는다.
#
#   우회: powershell -File deploy.ps1 -SkipLiveDrift
#     ⚠️ -SkipSmoke 로는 안 꺼진다. 이 게이트가 막는 것은 "느린 배포" 가 아니라
#        "남의 작업 소실" 이고, 그건 급할수록 더 크게 터진다.
# ============================================================================
if (-not $SkipLiveDrift) {
    Write-Step "0b/7" "라이브 되감김 게이트: 라이브에만 있는 줄이 없는지 (우회: -SkipLiveDrift)"
    $liveUrl = "https://webrtc-unified-platform-prod.navy111p.workers.dev/?nocache=$([DateTime]::UtcNow.Ticks)"
    $localIndex = Join-Path $scriptDir "cloudflare-deploy\public\index.html"
    $liveHtml = $null
    try {
        $resp = Invoke-WebRequest -Uri $liveUrl -UseBasicParsing -TimeoutSec 30 -Headers @{ 'Cache-Control' = 'no-cache' }
        # ⚠️ .Content 를 그대로 쓰면 안 된다 — PS 5.1 이 응답을 Latin-1 로 디코딩해
        #    한글이 들어간 줄이 전부 «다른 줄» 로 보인다. 처음 만들 때 이걸로 오탐 3,456줄이
        #    나왔다(=모든 배포가 막힌다). 바이트로 받아 UTF-8 로 직접 읽는다.
        $liveHtml = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    } catch {
        $liveHtml = $null
        $fetchErr = $_.Exception.Message
    }

    if ([string]::IsNullOrWhiteSpace($liveHtml)) {
        Write-Host "  [X] 라이브를 못 읽었습니다 — 배포 중단." -ForegroundColor Red
        Write-Host "      $fetchErr" -ForegroundColor DarkGray
        Write-Host "      라이브 상태를 모르는 채로 폴더를 통째로 덮으면, 남이 방금 배포한 것이" -ForegroundColor Yellow
        Write-Host "      조용히 사라져도 아무도 못 알아챕니다(오늘 실제로 그렇게 잃었습니다)." -ForegroundColor Yellow
        Write-Host "      네트워크 문제가 확실하다면: powershell -File deploy.ps1 -SkipLiveDrift" -ForegroundColor Cyan
        exit 1
    }
    elseif (-not (Test-Path $localIndex)) {
        Write-Host "  [!] 로컬 index.html 이 없어 비교를 건너뜁니다" -ForegroundColor Yellow
    }
    else {
        $norm = {
            param($text)
            ($text -split "`r?`n") |
                Where-Object { $_ -notmatch 'BUILD:' } |
                ForEach-Object { $_.Trim() } |
                Where-Object { $_ -ne '' }
        }
        $liveLines  = & $norm $liveHtml
        $localLines = & $norm (Get-Content $localIndex -Raw -Encoding UTF8)
        $localSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$localLines)
        $onlyLive = @($liveLines | Where-Object { -not $localSet.Contains($_) } | Select-Object -Unique)

        if ($onlyLive.Count -gt 0) {
            Write-Host ""
            Write-Host "  [X] 라이브에만 있는 줄이 $($onlyLive.Count)개 — 배포 중단." -ForegroundColor Red
            Write-Host "      지금 올리면 아래가 라이브에서 사라집니다:" -ForegroundColor Red
            $onlyLive | Select-Object -First 15 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkYellow }
            if ($onlyLive.Count -gt 15) { Write-Host "        ... 외 $($onlyLive.Count - 15)줄" -ForegroundColor DarkYellow }
            Write-Host ""
            Write-Host "      대개 원인은 하나입니다 — 그 사이 누가 main 에 머지했고" -ForegroundColor Yellow
            Write-Host "      Actions 가 배포했는데, 내 로컬 폴더가 그걸 모릅니다." -ForegroundColor Yellow
            Write-Host "      해결: git fetch origin; git merge origin/main   후 다시 배포" -ForegroundColor Cyan
            Write-Host "      (되돌리는 게 맞다고 판단했다면: -SkipLiveDrift)" -ForegroundColor DarkGray
            exit 1
        }
        Write-Host "  라이브에만 있는 줄 없음 — 지워질 것이 없습니다" -ForegroundColor Green
    }

    # 참고용(중단하지 않음): 내 트리가 origin/main 보다 뒤처져 있는가.
    #   뒤처졌다고 항상 사고는 아니다(핫픽스는 일부러 앞설 수 있다). 다만 모르고 있는 것과
    #   알고 하는 것은 다르므로 숫자만 보여 준다.
    try {
        & git fetch origin main --quiet 2>$null
        $behind = (& git rev-list --count HEAD..origin/main 2>$null)
        if ($behind -and [int]$behind -gt 0) {
            Write-Host "  [!] 내 트리가 origin/main 보다 $behind 커밋 뒤처져 있습니다 (참고)" -ForegroundColor Yellow
        }
    } catch { Write-Host "  (git 비교 생략)" -ForegroundColor DarkGray }
}

# ============================================================================
# [0c] 수업 시간대 배포 보류 게이트 — "지금 올리면 수업이 끊긴다"
# ----------------------------------------------------------------------------
#   왜 필요한가 (2026-09-01):
#     배포하면 화상수업 Durable Object(VideoCallRoom)가 재시작되어 **진행 중인
#     «모든» 수업의 WebSocket 이 끊긴다.** 그날 19:33~22:06 에만 운영 워커가 22번
#     재배포됐고, 21:43:57 배포 8초 뒤 class-1070 강사, 37초 뒤 class-1078 강사
#     (김선우 학생 수업)가 동시에 끊겼다. class-996 은 강사가 10분 사이 네 번 끊겨
#     녹화가 4:03 / 3:18 / 0:18 로 토막났다.
#     사람에게는 「인터넷이 나쁘다」로만 보인다 — 에러가 안 나기 때문이다.
#
#   ⛔ 판정을 여기에 PowerShell 로 다시 적지 않는다. 정본은
#      .github\scripts\class-window.mjs 하나이고, CI(deploy.yml)도 그것을 부른다.
#      같은 판정이 두 곳에 있으면 한쪽만 고쳐진다 — 이 저장소가 반복해 밟은 함정이다.
#      종료코드: 0 = 배포해도 됨 · 2 = 수업 시간대 · 그 외 = 판정 실패
#
#   ⚠️ CI 와 다르게 «보류하고 나중에» 가 없다. 여기서는 사람이 서 있으므로 멈추고
#      알려 주는 것이 맞다. 창이 끝난 뒤 다시 돌리거나 -ForceNow 로 넘긴다.
#
#   우회: powershell -File deploy.ps1 -ForceNow
#     ⚠️ -SkipSmoke 로는 안 꺼진다. 이 게이트가 막는 것은 "느린 배포" 가 아니라
#        "지금 수업 중인 학생·강사의 연결" 이다.
# ============================================================================
if (-not $ForceNow) {
    Write-Step "0c/7" "수업 시간대 배포 보류 게이트 (우회: -ForceNow)"
    & node (Join-Path $scriptDir ".github\scripts\class-window.mjs") --exit-on-hold
    $cwCode = $LASTEXITCODE
    if ($cwCode -eq 2) {
        Write-Host ""
        Write-Host "  [X] 지금은 수업 시간대입니다 — 배포 중단." -ForegroundColor Red
        Write-Host "      지금 올리면 진행 중인 모든 수업의 화상 연결이 한 번에 끊깁니다." -ForegroundColor Red
        Write-Host "      (2026-09-01 실측: 배포 8~37초 뒤 서로 다른 두 방의 강사가 동시에 끊김)" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "      · 수업이 끝난 뒤(01:20 KST 이후) 다시 실행하세요." -ForegroundColor Yellow
        Write-Host "      · 지금 꼭 나가야 하면:  powershell -File deploy.ps1 -ForceNow" -ForegroundColor Yellow
        Write-Host "      · 급하지 않으면 main 에 push 만 해 두세요 — CI 가 01:30 KST 에 몰아서 배포합니다." -ForegroundColor Yellow
        exit 1
    }
    if ($cwCode -ne 0) {
        # 판정 자체가 실패했다(파일 없음·깨짐). 여기서 통과시키면 게이트가 «있는 척» 만 한다.
        #   node 가 아예 안 도는 경우는 위 [0a] 에서 이미 멈췄으므로, 여기 오면 이 파일 문제다.
        Write-Host ""
        Write-Host "  [X] 수업 시간대 판정에 실패했습니다 (종료코드 $cwCode) — 배포 중단." -ForegroundColor Red
        Write-Host "      .github\scripts\class-window.mjs 가 있는지 확인하세요." -ForegroundColor Yellow
        Write-Host "      확인이 어려우면:  powershell -File deploy.ps1 -ForceNow" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  수업 시간대 아님 — 배포 진행" -ForegroundColor Green
} else {
    Write-Step "0c/7" "수업 시간대 게이트 건너뜀 (-ForceNow)"
    Write-Host "  [!] 수업 중이면 진행 중인 모든 수업의 화상 연결이 끊깁니다." -ForegroundColor Yellow
}

# [0] 배포 전 안전 게이트 — 실패하면 파일 하나 안 건드리고 여기서 중단 (REFACTOR_PLAN 5단계)
#   ① tsc 컴파일: 새 코드가 깨졌으면 배포 금지
#   ② 라이브 스모크 15종: 현재 운영이 이미 비정상이면(깨진 위에 덮어쓰기 방지) 배포 금지
if (-not $SkipSmoke) {
    Write-Step "0/7" "배포 전 게이트: tsc 컴파일 + 라이브 스모크 15종 + 회귀 하니스 fast (우회: -SkipSmoke)"
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
    # ③ 회귀 하니스(fast) — 소스/fetch 하니스 전체 실행(puppeteer E2E 제외, ~25초). 실제 결함이면 배포 중단.
    Write-Host "  라이브 스모크 통과 — 회귀 하니스(fast) 실행..." -ForegroundColor Green
    & node (Join-Path $scriptDir "test-harness\run.mjs") --fast
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [X] 회귀 하니스 실패 — 실제 코드 결함 가능. 배포 중단 (우회: -SkipSmoke)." -ForegroundColor Red
        exit 1
    }
    Write-Host "  회귀 하니스 통과" -ForegroundColor Green
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

# [4b] 주입 후 재검사 — [0a] 는 '주입 전' 상태를 봤다.
#   [3b] sw.js 캐시버전 치환과 [4] HTML 53개 BUILD 스탬프 주입은 [0a] 검사 '뒤에' 파일을 고친다.
#   즉 주입 자체가 JS 를 깨뜨리면 [0a] 로는 절대 못 잡고 그대로 배포된다.
#   실제 전력: 2026-07-14 BUILD 마커 주입이 '</body>' 를 무조건 치환해 JS 문자열 안까지
#   건드려 관리자 3개 화면이 죽었다. 그래서 '배포 직전 상태'를 한 번 더 검사한다.
#   git commit 前에 둔다 — 깨진 파일은 커밋도 하지 않는다.
Write-Step "4b/7" "주입 후 인라인 JS 문법 재검사 (BUILD 스탬프/sw.js 가 파일을 고친 뒤 상태)"
& node (Join-Path $scriptDir "test-harness\inline_js_syntax_harness.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  [X] BUILD 스탬프 / sw.js 주입이 JS 를 깨뜨렸습니다 — 배포 중단." -ForegroundColor Red
    Write-Host "      [0a] 는 통과했는데 여기서 걸렸다면 원인은 주입 로직입니다." -ForegroundColor Yellow
    Write-Host "      deploy.ps1 의 [3b] sw.js 치환 / [4] BUILD 마커 삽입을 확인하세요." -ForegroundColor Yellow
    Write-Host "      (커밋 전이라 git 은 깨끗합니다. 파일 원복: git checkout -- cloudflare-deploy/public)" -ForegroundColor Yellow
    exit 1
}
Write-Host "  주입 후 재검사 통과" -ForegroundColor Green

# [5] git
Write-Step "5/7" "git commit + push"
git config user.email "navy111p@gmail.com" 2>&1 | Out-Null
git config user.name  "navy111p-sudo" 2>&1 | Out-Null

# 🔍 (2026-07-31) 배포 전 가시성 — 여러 세션이 같은 작업폴더를 공유하는 구조라(워크트리 없이
#   이 폴더에서 바로 작업하는 세션도 있음), 아래 스테이징 경로에 이번 작업과 무관한 다른 세션의
#   미완성 변경이 섞여 있어도 예전엔 아무 표시 없이 그대로 커밋+배포됐다(실제로 겪음: 학생게임
#   HTML 하나가 다른 세션이 편집 중이던 애니메이션 값과 충돌). git add 전에 무엇이 커밋될지
#   전부 나열해 사람이 훑어보고 이상하면 Ctrl+C 로 끊을 기회를 준다.
$stagePaths = @(
    'cloudflare-deploy/public/', 'cloudflare-deploy/src/', 'cloudflare-deploy/scripts/',
    'cloudflare-deploy/wrangler.toml', 'cloudflare-deploy/schema.sql',
    'cloudflare-deploy/migration-attendance-checkin.sql', 'cloudflare-deploy/tsconfig.testbuild.json',
    'test-harness/', '.github/workflows/', '.gitignore', 'deploy.ps1'
)
Write-Host ""
Write-Host "  이번 배포 커밋에 포함될 변경 파일:" -ForegroundColor Yellow
$dirtyFiles = git status --porcelain -- $stagePaths
if ($dirtyFiles) { $dirtyFiles | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray } }
else { Write-Host "    (BUILD 스탬프/캐시버전 갱신만 — 그 외 변경 없음)" -ForegroundColor Gray }
Write-Host "  ⚠ 위 목록에 이번 작업과 무관한 파일이 보이면 Ctrl+C 로 중단하고 확인하세요." -ForegroundColor Yellow
Write-Host ""

# .github/workflows/ 포함 — GitHub Actions 자동배포 경로에도 게이트가 걸려 있어서,
# 워크플로 변경이 커밋에서 빠지면 그 경로만 무방비로 남는다.
git add $stagePaths 2>&1 | Out-Null
git commit -m "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (build $buildTs)" 2>&1 | Out-Null

# 🔀 (2026-07-31) push 대상 — 예전엔 무조건 origin/main 이었는데, 이 저장소는 실제로 다들
#   main 이 아니라 기능 브랜치에서 배포를 돌린다(main 자체는 별도 워크트리에 체크아웃돼 있어
#   이 스크립트가 있는 위치에서 갱신할 방법이 없다). 그 결과 매 배포마다 non-fast-forward 로
#   push 만 실패하고(라이브 배포엔 지장 없었지만) GitHub 은 계속 안 갱신되는 게 반복됐다.
#   → 하드코딩 대신 '지금 실제로 체크아웃된 브랜치'로 push한다.
$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -eq 'HEAD') {
    Write-Host "  [!] detached HEAD 상태라 push 를 건너뜁니다 — 브랜치를 만들어 수동으로 push 하세요." -ForegroundColor Yellow
} else {
    git push origin "HEAD:$currentBranch"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [!] git push origin $currentBranch 실패 (exit $LASTEXITCODE) — 원격이 앞서거나 인증 문제일 수 있음." -ForegroundColor Red
        Write-Host "      수동 확인: git pull --no-rebase origin $currentBranch  후  git push origin $currentBranch" -ForegroundColor Yellow
    } else {
        Write-Host "  push 완료 ($currentBranch)" -ForegroundColor Green
    }
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

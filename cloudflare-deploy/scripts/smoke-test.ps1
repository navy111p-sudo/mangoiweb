# ═══════════════════════════════════════════════════════════════════════
# smoke-test.ps1 — 배포 후 핵심 API 회귀 스모크 테스트 (REFACTOR_PLAN 5단계)
#   실서버(test.mangoi.co.kr)의 핵심 엔드포인트 13종이 "기대한 상태코드 +
#   기대한 응답 형태"를 주는지 확인한다. 보안 게이트(401)가 살아있는지도
#   함께 검사하므로, 200이 아니라 401/400 이 '정답'인 항목이 있다.
#   사용: powershell -NoProfile -File scripts\smoke-test.ps1 [-BaseUrl https://...]
#   종료코드: 0=전체통과, 1=실패있음 (deploy.ps1 이 경고 표시용으로 사용)
#   ⚠ 부작용 없는 호출만 사용할 것 (쓰기 API는 존재하지 않는 계정/무효 입력만)
# ═══════════════════════════════════════════════════════════════════════
param(
    [string]$BaseUrl = "https://test.mangoi.co.kr"
)

$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MangoiSmokeTest/1.0 Chrome/126"
$script:passed = 0
$script:failed = 0
$script:failures = @()

# HttpClient 사용 이유(PS5.1): ① 4xx/5xx 에서 예외를 안 던져 본문 검사가 단순
#   ② 서버가 gzip 응답이라 AutomaticDecompression 없이는 4xx 본문이 깨져 읽힘
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(20)
$client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0")
$client.DefaultRequestHeaders.Add("X-Smoke-Test", "mangoi")

function Invoke-Api {
    param([string]$Method, [string]$Url, [string]$JsonBody)
    try {
        if ($Method -eq "POST") {
            $content = New-Object System.Net.Http.StringContent($JsonBody, [System.Text.Encoding]::UTF8, "application/json")
            $resp = $client.PostAsync($Url, $content).Result
        } else {
            $resp = $client.GetAsync($Url).Result
        }
        $body = $resp.Content.ReadAsStringAsync().Result
        return @{ Status = [int]$resp.StatusCode; Body = [string]$body }
    } catch {
        return @{ Status = -1; Body = [string]$_.Exception.Message }
    }
}

function Test-Api {
    param([string]$Name, [string]$Method, [string]$Path, [int]$ExpectStatus, [string]$BodyPattern, [string]$JsonBody)
    $res = Invoke-Api -Method $Method -Url ($BaseUrl + $Path) -JsonBody $JsonBody
    $ok = ($res.Status -eq $ExpectStatus)
    if ($ok -and $BodyPattern) { $ok = ($res.Body -match $BodyPattern) }
    if ($ok) {
        $script:passed++
        Write-Host ("  OK   {0}" -f $Name) -ForegroundColor Green
    } else {
        $script:failed++
        $snippet = $res.Body
        if ($snippet.Length -gt 120) { $snippet = $snippet.Substring(0, 120) }
        $msg = ("  FAIL {0}  (기대 {1}/{2} <- 실제 {3}) {4}" -f $Name, $ExpectStatus, $BodyPattern, $res.Status, $snippet)
        $script:failures += $msg
        Write-Host $msg -ForegroundColor Red
    }
}

Write-Host "── API 스모크 테스트: $BaseUrl ──" -ForegroundColor Cyan

# 1) 홈 HTML 서빙 + 빌드 스탬프 주입 확인
Test-Api "홈 index.html 서빙"        GET  "/"  200 "BUILD:"

# 2~6) 게임/학습 도메인 (api-games.ts 분리분 — 리팩토링 회귀 감시)
Test-Api "단어장 게임 대시보드"      GET  "/api/vocab/stats?uid=student"        200 '"ok":true'
Test-Api "주간 단어왕 랭킹"          GET  "/api/vocab/leaderboard?uid=student"  200 '"ok":true'
Test-Api "단어장 목록 IDOR 가드"     GET  "/api/vocab/list?uid=student"         401 'auth_required'
Test-Api "복습퀴즈 목록"             GET  "/api/review-quiz/list?uid=student"   200 '"ok":true'
Test-Api "복습퀴즈 자동매칭"         POST "/api/review-quiz/auto"               200 '"ok":true' '{"uid":"student"}'

# 7~10) 보안 게이트 생존 확인 (401 이 정답 — 200 이 나오면 보안 회귀!)
Test-Api "admin API default-deny"    GET  "/api/admin/students"                 401 'auth_required'
Test-Api "포인트 잔액 IDOR 가드"     GET  "/api/points/balance?uid=student"     401 'auth_required'
Test-Api "스트릭 IDOR 가드"          GET  "/api/streak/status?uid=student"      401 'auth_required'
Test-Api "배지 목록 인증 가드"       GET  "/api/badges/list?uid=student"        401 'auth_required'

# 11~13) 핵심 비즈니스 라우트 생존 (팝업/로그인/수업세션)
Test-Api "홈 팝업 조회"              GET  "/api/popups?page=home"               200 '"ok":true'
Test-Api "로그인 라우트+DB 생존"     POST "/api/student/login"                  404 'user_not_found' '{"user_id":"__smoke_no_such__","password":"x"}'
Test-Api "오늘 수업세션 게이트"      GET  "/api/class/sessions/today"           400 'identity_required'

# 14~15) 기프티콘 상점 + 복습단어 가드
Test-Api "기프티콘 카탈로그"         GET  "/api/gifts/catalog"                  200 '"ok":true'
Test-Api "복습단어 IDOR 가드"        GET  "/api/vocab/due?uid=student"          401 'auth_required'

Write-Host ""
if ($script:failed -eq 0) {
    Write-Host ("스모크 테스트 전체 통과 ({0}/{0})" -f $script:passed) -ForegroundColor Green
    exit 0
} else {
    Write-Host ("⚠ 스모크 테스트 실패 {0}건 / 통과 {1}건 — 위 FAIL 항목을 확인하세요!" -f $script:failed, $script:passed) -ForegroundColor Red
    exit 1
}

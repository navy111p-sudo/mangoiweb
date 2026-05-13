# ═══════════════════════════════════════════════════════════════════
#  통합 스크립트: 처음부터 GitHub 저장 + Cloudflare Workers 배포
#
#  수행 단계:
#    1) git init (이미 초기화돼 있으면 스킵)
#    2) git add . / git commit
#    3) GitHub 원격 저장소 연결 (origin)
#    4) git push origin main
#    5) cloudflare-deploy 폴더에서 npm install
#    6) wrangler deploy (base + production)
#    7) 배포 URL 헬스체크
#
#  사용법 (택1):
#    1) $env:CLOUDFLARE_API_TOKEN = "cfut_..."
#       .\setup-and-deploy.ps1 -GitHubRepo "https://github.com/navy111p-sudo/mangoiweb.git"
#
#    2) .\setup-and-deploy.ps1
#       (실행 중 토큰/저장소 URL을 안전하게 입력받음)
#
#  옵션:
#    -GitHubRepo     원격 저장소 URL (예: https://github.com/USER/REPO.git)
#    -CommitMessage  커밋 메시지 (기본: "Initial commit: mangoiweb 프로젝트")
#    -SkipGit        Git 단계 건너뜀
#    -SkipDeploy     Cloudflare 배포 단계 건너뜀
#    -ApiToken       Cloudflare API 토큰을 인자로 직접 전달
# ═══════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [string]$GitHubRepo,
    [string]$CommitMessage = "Initial commit: mangoiweb 프로젝트",
    [string]$ApiToken,
    [switch]$SkipGit,
    [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    chcp 65001 > $null
} catch { }

function Write-Step  ($m) { Write-Host "▶ $m" -ForegroundColor Cyan }
function Write-Ok    ($m) { Write-Host "✔ $m" -ForegroundColor Green }
function Write-Warn2 ($m) { Write-Host "⚠ $m" -ForegroundColor Yellow }
function Write-Err2  ($m) { Write-Host "✘ $m" -ForegroundColor Red }

try {
    Set-Location -LiteralPath $PSScriptRoot
    $projectRoot = $PSScriptRoot
    Write-Step "프로젝트 루트: $projectRoot"

    # ═══════════════════════════════════════════════════════════════
    # PART 1 — Git 초기화 + GitHub 푸시
    # ═══════════════════════════════════════════════════════════════
    if (-not $SkipGit) {
        Write-Host ""
        Write-Host "═══ PART 1: Git 초기화 & GitHub 푸시 ═══" -ForegroundColor Magenta

        # 1-a) git 설치 확인
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            throw "git 명령어를 찾을 수 없습니다. Git for Windows를 설치하세요: https://git-scm.com/download/win"
        }
        Write-Ok "git 사용 가능: $((git --version))"

        # 1-b) git init (이미 있으면 스킵)
        if (Test-Path -LiteralPath (Join-Path $projectRoot '.git')) {
            Write-Warn2 ".git 폴더 이미 존재 → init 스킵"
        } else {
            Write-Step "git init"
            & git init -b main
            if ($LASTEXITCODE -ne 0) { throw "git init 실패 (exit=$LASTEXITCODE)" }
            Write-Ok "git 저장소 초기화 완료"
        }

        # 1-c) CRLF 안전 설정
        & git config --local core.safecrlf false 2>&1 | Out-Null
        & git config --local core.autocrlf input 2>&1 | Out-Null

        # 1-d) .gitignore가 없으면 기본값 생성
        $gi = Join-Path $projectRoot '.gitignore'
        if (-not (Test-Path -LiteralPath $gi)) {
            Write-Step ".gitignore 생성"
            @(
                'node_modules/',
                'dist/',
                '.env',
                '.env.local',
                '*.log',
                '.DS_Store',
                'Thumbs.db',
                '.wrangler/'
            ) | Out-File -FilePath $gi -Encoding UTF8
            Write-Ok ".gitignore 생성 완료"
        }

        # 1-e) git add .
        Write-Step "git add ."
        & git add .
        if ($LASTEXITCODE -ne 0) { throw "git add 실패 (exit=$LASTEXITCODE)" }
        Write-Ok "전체 파일 스테이징 완료"

        # 1-f) 커밋 (사용자 이메일/이름이 없으면 자동 설정)
        $userEmail = (& git config user.email) 2>$null
        $userName  = (& git config user.name) 2>$null
        if ([string]::IsNullOrWhiteSpace($userEmail)) {
            & git config --local user.email "navy111p@gmail.com"
            Write-Warn2 "로컬 git user.email 자동 설정: navy111p@gmail.com"
        }
        if ([string]::IsNullOrWhiteSpace($userName)) {
            & git config --local user.name "navy111p-sudo"
            Write-Warn2 "로컬 git user.name 자동 설정: navy111p-sudo"
        }

        Write-Step "git commit"
        & git commit -m $CommitMessage
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "커밋 실패(이미 변경 없거나 동일 상태일 수 있음) — 진행 계속"
        } else {
            Write-Ok "커밋 생성 완료"
        }

        # 1-g) 원격(origin) 연결
        if ([string]::IsNullOrWhiteSpace($GitHubRepo)) {
            $existingOrigin = & git remote get-url origin 2>$null
            if (-not [string]::IsNullOrWhiteSpace($existingOrigin)) {
                Write-Warn2 "기존 origin 사용: $existingOrigin"
                $GitHubRepo = $existingOrigin
            } else {
                $GitHubRepo = Read-Host -Prompt "GitHub 저장소 URL 입력 (예: https://github.com/navy111p-sudo/mangoiweb.git)"
            }
        }
        if ([string]::IsNullOrWhiteSpace($GitHubRepo)) { throw "GitHub 저장소 URL이 비어있음" }

        $existingOrigin = & git remote get-url origin 2>$null
        if ([string]::IsNullOrWhiteSpace($existingOrigin)) {
            Write-Step "git remote add origin $GitHubRepo"
            & git remote add origin $GitHubRepo
        } else {
            if ($existingOrigin -ne $GitHubRepo) {
                Write-Warn2 "기존 origin URL 변경: $existingOrigin → $GitHubRepo"
                & git remote set-url origin $GitHubRepo
            }
        }

        # 1-h) push
        Write-Step "git push -u origin main"
        & git push -u origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "일반 push 실패 → --force 재시도 (초기 커밋이므로 안전)"
            & git push -u origin main --force
            if ($LASTEXITCODE -ne 0) { throw "git push 실패 (exit=$LASTEXITCODE)" }
        }
        Write-Ok "GitHub 푸시 완료 → $GitHubRepo"
    } else {
        Write-Warn2 "Git 단계 건너뜀 (-SkipGit)"
    }

    # ═══════════════════════════════════════════════════════════════
    # PART 2 — Cloudflare Workers 배포
    # ═══════════════════════════════════════════════════════════════
    if (-not $SkipDeploy) {
        Write-Host ""
        Write-Host "═══ PART 2: Cloudflare Workers 배포 ═══" -ForegroundColor Magenta

        $cfDir = Join-Path $projectRoot 'cloudflare-deploy'
        if (-not (Test-Path -LiteralPath $cfDir)) {
            throw "cloudflare-deploy 폴더가 없습니다: $cfDir"
        }
        if (-not (Test-Path -LiteralPath (Join-Path $cfDir 'wrangler.toml'))) {
            throw "wrangler.toml 없음: $cfDir"
        }

        # 2-a) 토큰 확보
        if ([string]::IsNullOrWhiteSpace($ApiToken)) {
            if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
                $ApiToken = $env:CLOUDFLARE_API_TOKEN
            } else {
                Write-Warn2 "CLOUDFLARE_API_TOKEN 환경변수 없음 → 안전 입력"
                $secure = Read-Host -AsSecureString -Prompt "Cloudflare API Token (입력 비표시)"
                $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                try { $ApiToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
                finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
            }
        }
        $ApiToken = $ApiToken.Trim().Trim('"').Trim("'")
        if ([string]::IsNullOrWhiteSpace($ApiToken)) { throw "API 토큰 비어있음" }

        # 2-b) 토큰 유효성 검증
        Write-Step "토큰 유효성 검증 (api.cloudflare.com)"
        try {
            $verify = Invoke-RestMethod `
                -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' `
                -Headers @{ Authorization = "Bearer $ApiToken"; 'Content-Type' = 'application/json' } `
                -Method GET -TimeoutSec 15
            if (-not $verify.success -or $verify.result.status -ne 'active') {
                throw "토큰 검증 실패 (status=$($verify.result.status))"
            }
            Write-Ok "토큰 유효"
        } catch {
            throw "토큰 검증 중 오류: $($_.Exception.Message)"
        }
        $env:CLOUDFLARE_API_TOKEN = $ApiToken

        # 2-c) 환경 확인
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            throw "node.js 미설치. https://nodejs.org/ 에서 LTS 설치 필요"
        }
        if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx 미설치" }
        Write-Ok "node 확인: $(node -v)"

        # 2-d) cloudflare-deploy 폴더로 이동 후 의존성 설치
        Set-Location -LiteralPath $cfDir

        if (-not (Test-Path -LiteralPath (Join-Path $cfDir 'node_modules'))) {
            Write-Step "npm install (cloudflare-deploy)"
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install 실패 (exit=$LASTEXITCODE)" }
            Write-Ok "의존성 설치 완료"
        } else {
            Write-Ok "node_modules 이미 존재 → 설치 스킵"
        }

        # 2-e) base Worker 배포
        Write-Host ""
        Write-Step "1/2: base Worker 배포 (webrtc-unified-platform)"
        & npx --yes wrangler@4 deploy
        if ($LASTEXITCODE -ne 0) { throw "base Worker 배포 실패 (exit=$LASTEXITCODE)" }
        Write-Ok "base Worker 배포 성공"

        # 2-f) production Worker 배포
        Write-Host ""
        Write-Step "2/2: production Worker 배포 (webrtc-unified-platform-prod)"
        & npx --yes wrangler@4 deploy --env production
        if ($LASTEXITCODE -ne 0) { throw "production Worker 배포 실패 (exit=$LASTEXITCODE)" }
        Write-Ok "production Worker 배포 성공"

        # 2-g) 헬스체크
        Write-Host ""
        Write-Step "배포 URL 헬스체크"
        $urls = @(
            'https://webrtc-unified-platform.navy111p.workers.dev/',
            'https://webrtc-unified-platform-prod.navy111p.workers.dev/'
        )
        foreach ($u in $urls) {
            try {
                $res = Invoke-WebRequest -Uri $u -Method HEAD -TimeoutSec 15 -UseBasicParsing
                if ($res.StatusCode -eq 200) { Write-Ok "$u → 200 OK" }
                else { Write-Warn2 "$u → HTTP $($res.StatusCode)" }
            } catch {
                Write-Warn2 "$u → 체크 실패: $($_.Exception.Message)"
            }
        }

        Set-Location -LiteralPath $projectRoot
    } else {
        Write-Warn2 "Cloudflare 배포 건너뜀 (-SkipDeploy)"
    }

    Write-Host ""
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ 전체 작업 완료" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
    if (-not $SkipGit) {
        Write-Host "  GitHub: $GitHubRepo" -ForegroundColor White
    }
    if (-not $SkipDeploy) {
        Write-Host "  base  : https://webrtc-unified-platform.navy111p.workers.dev/" -ForegroundColor White
        Write-Host "  prod  : https://webrtc-unified-platform-prod.navy111p.workers.dev/" -ForegroundColor White
    }
    exit 0
}
catch {
    Write-Host ""
    Write-Err2 "작업 중단: $($_.Exception.Message)"
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }
    exit 1
}
finally {
    Remove-Variable -Name ApiToken -ErrorAction SilentlyContinue
}

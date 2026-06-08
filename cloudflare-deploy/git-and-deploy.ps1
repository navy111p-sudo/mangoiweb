# ═══════════════════════════════════════════════════════════════════
#  통합 스크립트: GitHub 커밋/푸시 + Cloudflare Workers 배포
#
#  수행 단계:
#    1) .git/index.lock 등 잔여 잠금 파일 정리
#    2) origin/main 과 동기화 (강제 최신화)
#    3) 7가지 버그 수정 파일을 스테이징
#    4) 커밋 + GitHub 푸시
#    5) Cloudflare Workers 2개(base + prod) 배포
#    6) 배포 URL 헬스체크
#
#  사용법 (택1):
#    1) $env:CLOUDFLARE_API_TOKEN = "cfut_..." ; .\git-and-deploy.ps1
#    2) .\git-and-deploy.ps1 -ApiToken "cfut_..."
#    3) .\git-and-deploy.ps1                    ← 토큰 없으면 안전 프롬프트
#
#  옵션:
#    -SkipGit        Git 커밋/푸시 건너뜀 (배포만)
#    -SkipDeploy     Cloudflare 배포 건너뜀 (Git 만)
#    -CommitMessage  커밋 메시지 지정 (기본값: 7가지 수정 요약)
# ═══════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [string]$ApiToken,
    [switch]$SkipGit,
    [switch]$SkipDeploy,
    [string]$CommitMessage = "fix(video-call): 7가지 UX/호환성 이슈 수정 (화면멈춤/마이크/가로3인/교재JPEG·PNG/탭순서/REC최소화/모바일그리드)"
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
    # 스크립트 루트 = cloudflare-deploy, 프로젝트 루트 = 상위 디렉터리
    Set-Location -LiteralPath $PSScriptRoot
    $projectRoot = Split-Path -Parent $PSScriptRoot
    Write-Step "스크립트 위치: $PSScriptRoot"
    Write-Step "프로젝트 루트: $projectRoot"

    # ═══════════════════════════════════════════════════════════════
    # PART 1 — Git 커밋 + GitHub 푸시
    # ═══════════════════════════════════════════════════════════════
    if (-not $SkipGit) {
        Write-Host ""
        Write-Host "═══ PART 1: Git 동기화 & GitHub 푸시 ═══" -ForegroundColor Magenta

        Set-Location -LiteralPath $projectRoot

        # 락 파일 강제 제거 (Test-Path 우회, 무조건 시도)
        function Remove-GitLock {
            param([string]$RootPath)
            $locks = @(
                (Join-Path $RootPath '.git\index.lock'),
                (Join-Path $RootPath '.git\HEAD.lock'),
                (Join-Path $RootPath '.git\objects\maintenance.lock'),
                (Join-Path $RootPath '.git\shallow.lock'),
                (Join-Path $RootPath '.git\config.lock')
            )
            foreach ($lf in $locks) {
                # Test-Path가 대괄호 경로에서 실패할 수 있으므로 양쪽 다 시도
                $exists = $false
                try { $exists = [System.IO.File]::Exists($lf) } catch {}
                if ($exists) {
                    try {
                        [System.IO.File]::Delete($lf)
                        Write-Ok "락 제거: $lf"
                    } catch {
                        # PowerShell 방식으로 재시도
                        try {
                            Remove-Item -LiteralPath $lf -Force -ErrorAction Stop
                            Write-Ok "락 제거(PS): $lf"
                        } catch {
                            # cmd /c del 최후 수단
                            & cmd /c "del /f /q `"$lf`"" 2>&1 | Out-Null
                            if ([System.IO.File]::Exists($lf)) {
                                Write-Warn2 "락 제거 실패: $lf — $($_.Exception.Message)"
                            } else {
                                Write-Ok "락 제거(cmd): $lf"
                            }
                        }
                    }
                }
            }
        }

        # 1-a) 잔여 락 파일 제거
        Write-Step "잔여 Git 락 파일 정리 중..."
        Remove-GitLock -RootPath $projectRoot

        # 1-a') CRLF 경고/에러 억제 (Windows에서 LF 파일 add 시 치명화 방지)
        Write-Step "Git 줄바꿈 경고 억제 (core.safecrlf=false)"
        & git config --local core.safecrlf false 2>&1 | Out-Null
        & git config --local core.autocrlf input 2>&1 | Out-Null

        # git 호출을 안전하게 감싸는 헬퍼 — stderr 경고를 무시, 오직 $LASTEXITCODE 로만 판단
        function Invoke-GitSafe {
            param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Args)
            $saved = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $out = & git @Args 2>&1
                $exit = $LASTEXITCODE
                foreach ($line in $out) { Write-Host $line }
                return $exit
            } finally {
                $ErrorActionPreference = $saved
            }
        }

        # 1-b) origin 최신화
        Write-Step "git fetch origin"
        $rc = Invoke-GitSafe 'fetch' 'origin'
        if ($rc -ne 0) { throw "git fetch 실패 (exit=$rc)" }
        Remove-GitLock -RootPath $projectRoot

        # 1-c) 발산(diverged) 상태 처리:
        Write-Step "HEAD를 origin/main 에 soft-reset (작업 내용은 유지)"
        $rc = Invoke-GitSafe 'reset' '--soft' 'origin/main'
        if ($rc -ne 0) {
            Write-Warn2 "soft-reset 실패 → mixed-reset 재시도"
            Remove-GitLock -RootPath $projectRoot
            $rc = Invoke-GitSafe 'reset' '--mixed' 'origin/main'
            if ($rc -ne 0) { throw "reset 실패 (exit=$rc)" }
        }
        Remove-GitLock -RootPath $projectRoot

        # 1-d) 수정된 파일만 정확하게 스테이징 (절대경로 기반)
        $rel_targets = @(
            'cloudflare-deploy\public\index.html',
            'cloudflare-deploy\public\admin.html',
            'cloudflare-deploy\public\js\mango-rec.js',
            'cloudflare-deploy\schema.sql',
            'cloudflare-deploy\migration-attendance-fields.sql',
            'cloudflare-deploy\wrangler.toml',
            'cloudflare-deploy\public\video-call\index.html',
            'cloudflare-deploy\public\video-call\css\style.css',
            'cloudflare-deploy\public\video-call\js\app.js',
            'cloudflare-deploy\public\video-call\js\pdf-viewer.js',
            'cloudflare-deploy\public\video-call\js\webrtc.js',
            'cloudflare-deploy\public\video-call\js\recorder.js',
            'cloudflare-deploy\git-and-deploy.ps1',
            '.github\workflows\deploy.yml',
            'cloudflare-deploy\.github\workflows\deploy.yml'
        )

        Write-Step "$($rel_targets.Count)개 파일 스테이징 (절대경로 검증)"
        $stagedCount = 0
        foreach ($rel in $rel_targets) {
            $absPath = Join-Path -Path $projectRoot -ChildPath $rel
            $fileExists = $false
            try { $fileExists = [System.IO.File]::Exists($absPath) } catch {}

            if ($fileExists) {
                $rc = Invoke-GitSafe 'add' '--' $rel
                if ($rc -ne 0) {
                    Write-Warn2 "git add 실패 (exit=$rc): $rel"
                } else {
                    Write-Ok "added: $rel"
                    $stagedCount++
                }
            } else {
                Write-Warn2 "파일 없음(건너뜀): $absPath"
            }
        }
        Write-Step "총 $stagedCount 개 스테이징 완료"
        Remove-GitLock -RootPath $projectRoot

        # 1-e) 커밋 (변경 없으면 스킵)
        $stagedOut = & git diff --cached --name-only 2>&1
        if (-not [string]::IsNullOrWhiteSpace($stagedOut)) {
            Remove-GitLock -RootPath $projectRoot
            Write-Step "git commit"
            $rc = Invoke-GitSafe 'commit' '-m' $CommitMessage
            if ($rc -ne 0) {
                Write-Warn2 "커밋 실패 → lock 정리 후 1회 재시도"
                Remove-GitLock -RootPath $projectRoot
                Start-Sleep -Seconds 1
                $rc = Invoke-GitSafe 'commit' '-m' $CommitMessage
                if ($rc -ne 0) { throw "git commit 실패 (exit=$rc)" }
            }
            Write-Ok "커밋 생성 완료"
        } else {
            Write-Warn2 "스테이징된 변경사항 없음 → 커밋 스킵"
        }

        # 1-f) 푸시
        Remove-GitLock -RootPath $projectRoot
        Write-Step "git push origin main"
        $rc = Invoke-GitSafe 'push' 'origin' 'main'
        if ($rc -ne 0) {
            Write-Warn2 "일반 push 실패 → 원격이 앞선 경우 재동기화 시도"
            Remove-GitLock -RootPath $projectRoot
            Invoke-GitSafe 'fetch' 'origin' | Out-Null
            Invoke-GitSafe 'rebase' 'origin/main' | Out-Null
            Remove-GitLock -RootPath $projectRoot
            $rc = Invoke-GitSafe 'push' 'origin' 'main'
            if ($rc -ne 0) { throw "git push 재시도도 실패 (exit=$rc)" }
        }
        Write-Ok "GitHub 푸시 완료 → https://github.com/navy111p-sudo/webrtc-client-app"

        Set-Location -LiteralPath $PSScriptRoot
    } else {
        Write-Warn2 "Git 단계 건너뜀 (-SkipGit)"
    }

    # ═══════════════════════════════════════════════════════════════
    # PART 2 — Cloudflare Workers 배포
    # ═══════════════════════════════════════════════════════════════
    if (-not $SkipDeploy) {
        Write-Host ""
        Write-Host "═══ PART 2: Cloudflare Workers 배포 ═══" -ForegroundColor Magenta

        # 2-a) 토큰 확보
        if ([string]::IsNullOrWhiteSpace($ApiToken)) {
            if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
                $ApiToken = $env:CLOUDFLARE_API_TOKEN
            } else {
                Write-Warn2 "CLOUDFLARE_API_TOKEN 없음 → 안전 프롬프트"
                $secure = Read-Host -AsSecureString -Prompt "Cloudflare API Token 입력 (화면 비표시)"
                $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                try { $ApiToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
                finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
            }
        }
        $ApiToken = $ApiToken.Trim().Trim('"').Trim("'")
        if ([string]::IsNullOrWhiteSpace($ApiToken)) { throw "API 토큰 비어있음" }

        # 2-b) 토큰 형식 검증
        if ($ApiToken.Length -lt 20) { throw "토큰이 너무 짧음 ($($ApiToken.Length)자)" }
        if ($ApiToken -notmatch '^[A-Za-z0-9_\-]+$') { throw "토큰 형식 오류" }

        # 2-c) 토큰 유효성 실제 검증
        Write-Step "토큰 유효성 검증 (api.cloudflare.com)"
        $verify = Invoke-RestMethod `
            -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' `
            -Headers @{ Authorization = "Bearer $ApiToken"; 'Content-Type' = 'application/json' } `
            -Method GET -TimeoutSec 15
        if (-not $verify.success -or $verify.result.status -ne 'active') {
            throw "토큰 검증 실패 (status=$($verify.result.status))"
        }
        Write-Ok "토큰 유효"
        $env:CLOUDFLARE_API_TOKEN = $ApiToken

        # 2-d) 필수 도구 체크
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node.js 미설치" }
        if (-not (Get-Command npx  -ErrorAction SilentlyContinue)) { throw "npx 미설치" }
        if (-not (Test-Path -LiteralPath "$PSScriptRoot\wrangler.toml")) {
            throw "wrangler.toml 없음: $PSScriptRoot"
        }
        Write-Ok "환경 확인 완료 (node=$((node -v)))"

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
            'https://webrtc-unified-platform.navy111p.workers.dev/video-call/',
            'https://webrtc-unified-platform-prod.navy111p.workers.dev/video-call/'
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
    } else {
        Write-Warn2 "Cloudflare 배포 건너뜀 (-SkipDeploy)"
    }

    Write-Host ""
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✅ 전체 작업 완료" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  GitHub: https://github.com/navy111p-sudo/webrtc-client-app" -ForegroundColor White
    Write-Host "  base  : https://webrtc-unified-platform.navy111p.workers.dev/video-call/" -ForegroundColor White
    Write-Host "  prod  : https://webrtc-unified-platform-prod.navy111p.workers.dev/video-call/" -ForegroundColor White
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

# ============================================================================
#  mangoiweb — GitHub + Cloudflare Workers Deploy
#  Encoding: UTF-8 with BOM (safe for Windows PowerShell 5 and PowerShell 7+)
#  All static strings are ASCII English so the file parses identically on every
#  console codepage. Korean commit messages are still possible via -CommitMessage.
#
#  Usage:
#    .\setup-and-deploy.ps1
#    .\setup-and-deploy.ps1 -GitHubRepo "https://github.com/navy111p-sudo/mangoiweb.git"
#    .\setup-and-deploy.ps1 -SkipGit
#    .\setup-and-deploy.ps1 -SkipDeploy
#    .\setup-and-deploy.ps1 -CommitMessage "feat: my change"
#    $env:CLOUDFLARE_API_TOKEN = "cfut_..."; .\setup-and-deploy.ps1
#
#  Options:
#    -GitHubRepo      Git remote URL (asked interactively if omitted)
#    -CommitMessage   Commit message (default = "deploy: <timestamp>")
#    -ApiToken        Cloudflare API token (else env var, else prompt)
#    -SkipGit         Skip the Git stage
#    -SkipDeploy      Skip the Cloudflare deploy stage
#    -StageAll        git add . (default = stage only cloudflare-deploy files)
# ============================================================================

[CmdletBinding()]
param(
    [string]$GitHubRepo,
    [string]$CommitMessage,
    [string]$ApiToken,
    [switch]$SkipGit,
    [switch]$SkipDeploy,
    [switch]$StageAll
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Switch console to UTF-8 so any Korean argument values (e.g. -CommitMessage)
# survive intact when passed to git.exe.
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
    $OutputEncoding           = [System.Text.Encoding]::UTF8
    chcp 65001 | Out-Null
} catch { }

# Logging helpers (ASCII only - safe on any codepage).
function Write-Step ($m) { Write-Host "[STEP] $m" -ForegroundColor Cyan }
function Write-Ok   ($m) { Write-Host "[ OK ] $m" -ForegroundColor Green }
function Write-Warn2($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err2 ($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Write-Header($m) {
    Write-Host ""
    Write-Host ("=" * 72) -ForegroundColor Magenta
    Write-Host ("  " + $m) -ForegroundColor Magenta
    Write-Host ("=" * 72) -ForegroundColor Magenta
}

try {
    Set-Location -LiteralPath $PSScriptRoot
    $projectRoot = $PSScriptRoot
    Write-Step "Project root: $projectRoot"

    if (-not $CommitMessage) {
        $CommitMessage = "deploy: " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    }

    # ========================================================================
    # PART 1 - Git stage + commit + push
    # ========================================================================
    if (-not $SkipGit) {
        Write-Header "PART 1: Git commit and push"

        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            throw "git command not found. Install Git for Windows: https://git-scm.com/download/win"
        }
        Write-Ok ("git version: " + ((git --version) -replace '\s+', ' '))

        # git init if missing
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
            Write-Step "git init -b main"
            & git init -b main | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git init failed (exit=$LASTEXITCODE)" }
        }

        # Quiet CRLF warnings on Windows
        & git config --local core.safecrlf false | Out-Null
        & git config --local core.autocrlf input | Out-Null
        & git config --local i18n.commitEncoding utf-8 | Out-Null
        & git config --local i18n.logOutputEncoding utf-8 | Out-Null

        # Default identity (only if not set)
        $cfgEmail = & git config user.email 2>$null
        $cfgName  = & git config user.name  2>$null
        if (-not $cfgEmail) { & git config --local user.email "navy111p@gmail.com" | Out-Null; Write-Warn2 "Set local user.email = navy111p@gmail.com" }
        if (-not $cfgName)  { & git config --local user.name  "navy111p-sudo"     | Out-Null; Write-Warn2 "Set local user.name  = navy111p-sudo" }

        # Stage
        if ($StageAll) {
            Write-Step "git add . (all files)"
            & git add .
        } else {
            Write-Step "git add cloudflare-deploy"
            & git add cloudflare-deploy
        }
        if ($LASTEXITCODE -ne 0) { throw "git add failed (exit=$LASTEXITCODE)" }

        # Commit (skip if no staged changes)
        $staged = & git diff --cached --name-only 2>$null
        if ([string]::IsNullOrWhiteSpace($staged)) {
            Write-Warn2 "Nothing staged - skipping commit"
        } else {
            Write-Step ("git commit -m '{0}'" -f $CommitMessage)
            & git commit -m $CommitMessage | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git commit failed (exit=$LASTEXITCODE)" }
            Write-Ok "Commit created"
        }

        # Origin
        if ([string]::IsNullOrWhiteSpace($GitHubRepo)) {
            $existing = & git remote get-url origin 2>$null
            if ($existing) {
                Write-Ok ("Using existing origin: " + $existing)
                $GitHubRepo = $existing
            } else {
                $GitHubRepo = Read-Host -Prompt "Enter GitHub repo URL (e.g. https://github.com/navy111p-sudo/mangoiweb.git)"
            }
        }
        if ([string]::IsNullOrWhiteSpace($GitHubRepo)) { throw "GitHub repo URL is empty" }

        $existing = & git remote get-url origin 2>$null
        if ([string]::IsNullOrWhiteSpace($existing)) {
            & git remote add origin $GitHubRepo | Out-Null
            Write-Ok ("Added origin: " + $GitHubRepo)
        } elseif ($existing -ne $GitHubRepo) {
            & git remote set-url origin $GitHubRepo | Out-Null
            Write-Warn2 ("Replaced origin: $existing -> $GitHubRepo")
        }

        # Push
        Write-Step "git push -u origin main"
        & git push -u origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "push failed - trying fetch + rebase + push"
            & git fetch origin | Out-Null
            & git rebase origin/main | Out-Null
            & git push -u origin main
            if ($LASTEXITCODE -ne 0) { throw "git push failed (exit=$LASTEXITCODE)" }
        }
        Write-Ok ("Pushed to " + $GitHubRepo)
    } else {
        Write-Warn2 "Git stage skipped (-SkipGit)"
    }

    # ========================================================================
    # PART 2 - Cloudflare Workers deploy
    # ========================================================================
    if (-not $SkipDeploy) {
        Write-Header "PART 2: Cloudflare Workers deploy"

        $cfDir = Join-Path $projectRoot 'cloudflare-deploy'
        if (-not (Test-Path -LiteralPath $cfDir)) { throw "cloudflare-deploy folder not found: $cfDir" }
        if (-not (Test-Path -LiteralPath (Join-Path $cfDir 'wrangler.toml'))) { throw "wrangler.toml not found in $cfDir" }

        # Token
        if ([string]::IsNullOrWhiteSpace($ApiToken)) {
            if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
                $ApiToken = $env:CLOUDFLARE_API_TOKEN
                Write-Ok "Using token from CLOUDFLARE_API_TOKEN env var"
            } else {
                $secure = Read-Host -AsSecureString -Prompt "Enter Cloudflare API Token (hidden input)"
                $bstr   = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                try { $ApiToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
                finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
            }
        }
        $ApiToken = $ApiToken.Trim().Trim('"').Trim("'")
        if ([string]::IsNullOrWhiteSpace($ApiToken)) { throw "API token is empty" }
        if ($ApiToken.Length -lt 20) { throw ("Token too short (length=$($ApiToken.Length))") }
        if ($ApiToken -notmatch '^[A-Za-z0-9_\-]+$') { throw "Token has invalid characters - please re-enter" }

        # Validate
        Write-Step "Verifying token with api.cloudflare.com"
        $verify = Invoke-RestMethod `
            -Uri 'https://api.cloudflare.com/client/v4/user/tokens/verify' `
            -Headers @{ Authorization = "Bearer $ApiToken"; 'Content-Type' = 'application/json' } `
            -Method GET -TimeoutSec 15
        if (-not $verify.success -or $verify.result.status -ne 'active') {
            throw ("Token verification failed (status=$($verify.result.status))")
        }
        Write-Ok "Token is valid"
        $env:CLOUDFLARE_API_TOKEN = $ApiToken

        # Environment checks
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node.js not found. Install LTS: https://nodejs.org/" }
        if (-not (Get-Command npx  -ErrorAction SilentlyContinue)) { throw "npx not found" }
        Write-Ok ("node version: " + (node -v))

        # npm install (first time)
        Set-Location -LiteralPath $cfDir
        if (-not (Test-Path -LiteralPath (Join-Path $cfDir 'node_modules'))) {
            Write-Step "npm install (first time)"
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit=$LASTEXITCODE)" }
            Write-Ok "Dependencies installed"
        } else {
            Write-Ok "node_modules already present - skipping npm install"
        }

        # Deploy base
        Write-Step "Deploy 1/2: base worker (webrtc-unified-platform)"
        & npx --yes wrangler@4 deploy --config ".\wrangler.toml"
        if ($LASTEXITCODE -ne 0) { throw "base worker deploy failed (exit=$LASTEXITCODE)" }
        Write-Ok "Base worker deployed"

        # Deploy production
        Write-Step "Deploy 2/2: production worker (webrtc-unified-platform-prod)"
        & npx --yes wrangler@4 deploy --config ".\wrangler.toml" --env production
        if ($LASTEXITCODE -ne 0) { throw "production worker deploy failed (exit=$LASTEXITCODE)" }
        Write-Ok "Production worker deployed"

        # Health check
        Write-Step "Health check"
        $urls = @(
            'https://webrtc-unified-platform.navy111p.workers.dev/',
            'https://webrtc-unified-platform-prod.navy111p.workers.dev/'
        )
        foreach ($u in $urls) {
            try {
                $res = Invoke-WebRequest -Uri $u -Method HEAD -TimeoutSec 15 -UseBasicParsing
                if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 400) { Write-Ok ("$u  ->  HTTP " + $res.StatusCode) }
                else { Write-Warn2 ("$u  ->  HTTP " + $res.StatusCode) }
            } catch {
                Write-Warn2 ("$u  ->  " + $_.Exception.Message)
            }
        }

        Set-Location -LiteralPath $projectRoot
    } else {
        Write-Warn2 "Cloudflare deploy skipped (-SkipDeploy)"
    }

    Write-Host ""
    Write-Header "ALL DONE"
    if (-not $SkipGit)    { Write-Host ("  GitHub : " + $GitHubRepo) -ForegroundColor White }
    if (-not $SkipDeploy) {
        Write-Host "  base   : https://webrtc-unified-platform.navy111p.workers.dev/" -ForegroundColor White
        Write-Host "  prod   : https://webrtc-unified-platform-prod.navy111p.workers.dev/" -ForegroundColor White
    }
    exit 0
}
catch {
    Write-Host ""
    Write-Err2 ("Aborted: " + $_.Exception.Message)
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }
    exit 1
}
finally {
    Remove-Variable -Name ApiToken -ErrorAction SilentlyContinue
}

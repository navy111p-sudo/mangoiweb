# ===================================================================
#  deploy-full.ps1 - Full deploy script (ASCII-only, PowerShell 5 safe)
#  Usage:
#    1) $env:CLOUDFLARE_API_TOKEN = "<token>" ; .\deploy-full.ps1
#    2) .\deploy-full.ps1 -Token "<token>"
#    3) .\deploy-full.ps1 -SkipGit                  # deploy only
# ===================================================================
[CmdletBinding()]
param(
    [string]$Token,
    [switch]$SkipGit
)

$ErrorActionPreference = 'Stop'

function W-Step($m) { Write-Host "STEP: $m" -ForegroundColor Cyan }
function W-Ok($m)   { Write-Host "OK  : $m" -ForegroundColor Green }
function W-Warn($m) { Write-Host "WARN: $m" -ForegroundColor Yellow }
function W-Err($m)  { Write-Host "ERR : $m" -ForegroundColor Red }

Set-Location -LiteralPath $PSScriptRoot
$projectRoot = Split-Path -Parent $PSScriptRoot
W-Step "project root: $projectRoot"

# === PART 1: Git stage + commit + push ===
if (-not $SkipGit) {
    Write-Host ""
    Write-Host "=== PART 1: Git add/commit/push ===" -ForegroundColor Magenta

    Set-Location -LiteralPath $projectRoot

    # Force remove any leftover .lock files
    Get-ChildItem -Path ".git" -Filter "*.lock" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            [System.IO.File]::Delete($_.FullName)
            W-Ok "removed lock: $($_.Name)"
        } catch {
            W-Warn "could not remove lock: $($_.Name)"
        }
    }

    & git config --local core.safecrlf false 2>&1 | Out-Null
    & git config --local core.autocrlf input 2>&1 | Out-Null

    W-Step "git add -A (stage all changes)"
    & git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }

    $staged = & git diff --cached --name-only
    if (-not [string]::IsNullOrWhiteSpace($staged)) {
        $arr = $staged -split "`n" | Where-Object { $_ -ne "" }
        $count = $arr.Count
        W-Ok ("staged files: " + $count)
        $arr | Select-Object -First 15 | ForEach-Object { Write-Host ("  - " + $_) }
        if ($count -gt 15) { Write-Host ("  ... +" + ($count - 15) + " more") }

        W-Step "git commit"
        $msg = "feat: deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm")
        & git commit -m $msg
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
        W-Ok "commit done"

        W-Step "git push origin main"
        & git push origin main
        if ($LASTEXITCODE -ne 0) {
            W-Warn "push failed, retry with fetch+rebase"
            & git fetch origin
            & git rebase origin/main
            & git push origin main
            if ($LASTEXITCODE -ne 0) { throw "git push failed" }
        }
        W-Ok "GitHub push done"
    } else {
        W-Warn "no staged changes - skipping commit"
    }

    Set-Location -LiteralPath $PSScriptRoot
}

# === PART 2: Cloudflare deploy ===
Write-Host ""
Write-Host "=== PART 2: Cloudflare Workers deploy ===" -ForegroundColor Magenta

if ([string]::IsNullOrWhiteSpace($Token)) {
    if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
        $Token = $env:CLOUDFLARE_API_TOKEN
    } else {
        $secure = Read-Host -AsSecureString -Prompt "Cloudflare API Token (input hidden)"
        $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $Token = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
}
$Token = $Token.Trim().Trim('"').Trim("'")

# Validate token: must be ASCII only and at least 20 chars
if ($Token.Length -lt 20) {
    throw ("Token too short (" + $Token.Length + " chars). Real Cloudflare tokens are 40+ chars.")
}
# Check ASCII only (no Korean / non-ASCII)
foreach ($ch in $Token.ToCharArray()) {
    if ([int]$ch -gt 127) {
        throw "Token contains non-ASCII character. You probably typed the placeholder text instead of your real token."
    }
}
$env:CLOUDFLARE_API_TOKEN = $Token
W-Ok ("token loaded, " + $Token.Length + " chars, ASCII verified")

# IMPORTANT: explicitly point to our wrangler.toml to avoid picking up
# the rogue wrangler.jsonc in C:\Users\Admin\Desktop\mangoi_develop2-main\
$cfgPath = Join-Path $PSScriptRoot "wrangler.toml"
if (-not (Test-Path $cfgPath)) { throw "wrangler.toml not found at $cfgPath" }
W-Ok ("using config: " + $cfgPath)

# 1) base
W-Step "1/2 deploy: base worker"
& npx --yes wrangler@4 deploy --config $cfgPath
if ($LASTEXITCODE -ne 0) { throw ("base deploy failed exit=" + $LASTEXITCODE) }
W-Ok "base worker deployed"

# 2) production
W-Step "2/2 deploy: production worker"
& npx --yes wrangler@4 deploy --env production --config $cfgPath
if ($LASTEXITCODE -ne 0) { throw ("production deploy failed exit=" + $LASTEXITCODE) }
W-Ok "production worker deployed"

# 3) Health check
Write-Host ""
W-Step "verify: /api/_bootstrap"
$url = "https://webrtc-unified-platform-prod.navy111p.workers.dev/api/_bootstrap"
try {
    $res = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 30
    W-Ok ("build_stamp: " + $res.build_stamp)
    W-Ok ("tables_created: " + ($res.tables_created -join ", "))
    $expected = @("student_points","point_transactions","point_rules","gift_catalog","gift_redemptions","point_rule_log")
    $missing = $expected | Where-Object { $_ -notin $res.tables_created }
    if ($missing) {
        W-Warn ("missing tables: " + ($missing -join ", "))
    } else {
        W-Ok "ALL 6 point tables created!"
    }
} catch {
    W-Err ("health check failed: " + $_.Exception.Message)
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host "  prod: https://webrtc-unified-platform-prod.navy111p.workers.dev/" -ForegroundColor White
Write-Host ("  check: " + $url) -ForegroundColor DarkGray

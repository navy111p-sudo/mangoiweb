# =============================================================
#  mangoi_Speech : push patched category-ui.js with PAT
# -------------------------------------------------------------
#  All comments/messages are in English to avoid encoding issues
#  on Windows PowerShell 5 (which mangles non-BOM UTF-8 Korean).
#
#  USAGE:
#    Double-click "run-push.bat" in the SAME folder.
#    Or:  cd to this folder, then  .\push-with-token.ps1
# =============================================================

$ErrorActionPreference = "Stop"
try { chcp 65001 | Out-Null } catch {}
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Clear-Host
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " mangoi_Speech : Chinese coach card patch + push" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- paths ------------------------------------------------
$PatchDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir  = Join-Path $PatchDir "mangoi_Speech"
$PatchSrc = Join-Path $PatchDir "category-ui.js"
$RepoUrl  = "https://github.com/navy111p-sudo/mangoi_Speech.git"
$UserName = "navy111p-sudo"

# ---- pre-check --------------------------------------------
Write-Host "[1/7] Pre-check" -ForegroundColor Yellow
if (-not (Test-Path $PatchSrc)) {
    Write-Host "  ERROR: patch file not found: $PatchSrc" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
try {
    $gitVer = (& git --version) 2>&1
    Write-Host "  OK Git: $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: git not found. Install: https://git-scm.com" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- token input ------------------------------------------
Write-Host ""
Write-Host "[2/7] Enter GitHub Personal Access Token" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Generate at:  https://github.com/settings/tokens?type=beta" -ForegroundColor Cyan
Write-Host "  Repository:   navy111p-sudo/mangoi_Speech" -ForegroundColor Cyan
Write-Host "  Permission:   Contents = Read and write" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (token is hidden when typing - just paste and press Enter)" -ForegroundColor DarkGray
Write-Host ""

$secureToken = Read-Host -Prompt "  Token" -AsSecureString
if (-not $secureToken) {
    Write-Host "  ERROR: empty token" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($token.Length -lt 20) {
    Write-Host "  WARN: token looks too short ($($token.Length) chars). Continue? Ctrl+C to abort" -ForegroundColor Yellow
    Read-Host
}

# ---- clean existing clone ---------------------------------
if (Test-Path $RepoDir) {
    Write-Host ""
    Write-Host "[3/7] Remove existing clone folder" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $RepoDir
}

# ---- clone -------------------------------------------------
Write-Host ""
Write-Host "[4/7] Cloning navy111p-sudo/mangoi_Speech ..." -ForegroundColor Yellow
& git clone $RepoUrl $RepoDir 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: clone failed (network/firewall?)" -ForegroundColor Red
    $token = $null; [GC]::Collect()
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- copy patch -------------------------------------------
Write-Host ""
Write-Host "[5/7] Copy category-ui.js patch" -ForegroundColor Yellow
Copy-Item -Force $PatchSrc (Join-Path $RepoDir "js\category-ui.js")
Write-Host "  OK" -ForegroundColor Green

# ---- commit + push ----------------------------------------
Write-Host ""
Write-Host "[6/7] commit + push" -ForegroundColor Yellow
Push-Location $RepoDir
try {
    & git add "js/category-ui.js" | Out-Host
    & git -c user.email="navy111p@gmail.com" -c user.name=$UserName commit -m "feat: add Chinese coach card to category UI (links to speech-coach-cn.html)" 2>&1 | Out-Host

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  NOTE: nothing to commit (already up-to-date)" -ForegroundColor Yellow
        $token = $null; [GC]::Collect()
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 0
    }

    # inject token into remote URL temporarily
    $authUrl = "https://" + $UserName + ":" + $token + "@github.com/navy111p-sudo/mangoi_Speech.git"
    & git remote set-url origin $authUrl | Out-Null

    Write-Host "  Pushing ..." -ForegroundColor DarkGray
    & git push origin main 2>&1 | Out-Host
    $pushOK = ($LASTEXITCODE -eq 0)

    # restore clean remote URL immediately
    & git remote set-url origin $RepoUrl | Out-Null

    if (-not $pushOK) {
        Write-Host ""
        Write-Host "  ERROR: push failed" -ForegroundColor Red
        Write-Host "  Possible causes:" -ForegroundColor Yellow
        Write-Host "    1) token is invalid or expired" -ForegroundColor White
        Write-Host "    2) Permissions missing 'Contents: Read and write'" -ForegroundColor White
        Write-Host "    3) Repository access doesnt include mangoi_Speech" -ForegroundColor White
        Write-Host "  Re-issue:  https://github.com/settings/tokens?type=beta" -ForegroundColor Cyan
        $token = $null; [GC]::Collect()
        Pop-Location
        Read-Host "Press Enter to exit"
        exit 1
    }
} finally {
    Pop-Location
}

# ---- wipe token from memory --------------------------------
$token       = $null
$secureToken = $null
$authUrl     = $null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

# ---- cleanup ----------------------------------------------
Write-Host ""
Write-Host "[7/7] Cleanup clone folder" -ForegroundColor Yellow
try { Remove-Item -Recurse -Force $RepoDir -ErrorAction SilentlyContinue } catch {}

# ---- done -------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " DONE! Token has been wiped from memory." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host " Cloudflare Pages will auto-build in ~1-2 minutes." -ForegroundColor White
Write-Host " Check:  https://mangoi-speech.pages.dev/practice" -ForegroundColor Cyan
Write-Host " The Chinese card will appear next to Phonics/BTS/SIU." -ForegroundColor White
Write-Host ""
Write-Host " Tip: revoke this token if you wont reuse it:" -ForegroundColor DarkGray
Write-Host "      https://github.com/settings/tokens?type=beta" -ForegroundColor DarkGray
Write-Host ""

Read-Host "Press Enter to close"

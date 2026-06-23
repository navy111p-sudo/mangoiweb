# ============================================================
#  webrtc-unified-platform - SAFE DEPLOY
# ------------------------------------------------------------
#  Order: (1) staging (-prod, low traffic) -> (2) human check
#         -> (3) main (production)
#  If TypeScript fails to compile, esbuild stops here and
#  production is NOT touched.
#  Run: right-click -> "Run with PowerShell"
#       or:  powershell -ExecutionPolicy Bypass -File deploy-safe.ps1
#  (ASCII-only on purpose: avoids Windows PowerShell CP949 encoding errors)
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Use THIS folder's wrangler.toml explicitly. Without this, wrangler walked up
# and grabbed the wrong ..\..\wrangler.jsonc (old mangoi_web.js worker).
$cfg = Join-Path $PSScriptRoot 'wrangler.toml'
if (-not (Test-Path $cfg)) {
  Write-Host "[FAILED] wrangler.toml not found next to this script: $cfg" -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
Write-Host "Using config: $cfg" -ForegroundColor DarkGray

function Run-Step($title, $cmd) {
  Write-Host ""
  Write-Host "=== $title ===" -ForegroundColor Cyan
  Write-Host "> $cmd" -ForegroundColor DarkGray
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[FAILED] exit=$LASTEXITCODE. Production (main) was NOT changed. Check the error above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
}

Write-Host "Mangoi SAFE DEPLOY - staging first, then production" -ForegroundColor Green

# (1) staging (-prod). TS build errors are caught here.
Run-Step "Step 1/2: deploy to STAGING (webrtc-unified-platform-prod)" "npx wrangler deploy --env production --config `"$cfg`""

Write-Host ""
Write-Host "Now verify on STAGING:" -ForegroundColor Yellow
Write-Host "  https://webrtc-unified-platform-prod.navy111p.workers.dev" -ForegroundColor Yellow
Write-Host "  Check: 2 users join -> video/audio -> chat -> PDF share -> one user refresh (reconnect)" -ForegroundColor Yellow
$ans = Read-Host "If staging is OK, type yes then Enter (anything else cancels production deploy)"

if ($ans -ne 'yes') {
  Write-Host "Production deploy cancelled. Main is unchanged." -ForegroundColor Yellow
  Read-Host "Press Enter to exit"
  exit 0
}

# (3) main (production)
Run-Step "Step 2/2: deploy to MAIN (webrtc-unified-platform)" "npx wrangler deploy --config `"$cfg`""

Write-Host ""
Write-Host "[DONE] If anything breaks, rollback:" -ForegroundColor Green
Write-Host "  git checkout -- src/signaling-room.ts src/video-call-room.ts" -ForegroundColor Gray
Write-Host "  or: Dashboard -> Worker -> Deployments -> Rollback to previous" -ForegroundColor Gray
Read-Host "Press Enter to exit"

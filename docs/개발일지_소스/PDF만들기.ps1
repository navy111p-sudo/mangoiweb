# 개발일지 HTML -> 바탕화면 PDF 2개 생성
# 사용법: 이 파일에서 마우스 오른쪽 -> "PowerShell에서 실행"
#  (또는 PowerShell 창에서)  .\PDF만들기.ps1

$chrome = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { Write-Host "크롬/엣지를 찾을 수 없습니다." -ForegroundColor Red; pause; exit 1 }

$src = $PSScriptRoot
$desk = [Environment]::GetFolderPath('Desktop')

# ⚠️ (2026-08-07) 요약본 2개가 여기 빠져 있었습니다. 그래서 일지를 고쳐도
#    요약 PDF 만 옛날 것으로 남았습니다(실제로 이틀 묵어 있었습니다). 네 개를 한 번에 만듭니다.
$jobs = @(
  @{ h = "$src\개발일지_한국어.html";      p = "$desk\망고아이_개발일지_최신.pdf" },
  @{ h = "$src\개발일지_영어.html";        p = "$desk\Mangoi_Development_Diary_LATEST.pdf" },
  @{ h = "$src\개발일지_요약_한국어.html"; p = "$desk\망고아이_개발일지_요약.pdf" },
  @{ h = "$src\개발일지_요약_영어.html";   p = "$desk\Mangoi_Development_Diary_SUMMARY.pdf" }
)

foreach ($j in $jobs) {
  if (-not (Test-Path $j.h)) { Write-Host "원본 없음: $($j.h)" -ForegroundColor Red; continue }
  $uri = "file:///" + ($j.h -replace '\\','/')
  Start-Process -FilePath $chrome -Wait -NoNewWindow -ArgumentList `
    "--headless=new","--disable-gpu","--no-pdf-header-footer",
    "--print-to-pdf=`"$($j.p)`"","`"$uri`""
  if (Test-Path $j.p) {
    $kb = [math]::Round((Get-Item $j.p).Length/1KB,1)
    Write-Host ("완료: {0}  ({1} KB)" -f (Split-Path $j.p -Leaf), $kb) -ForegroundColor Green
  } else {
    Write-Host ("실패: {0}" -f (Split-Path $j.p -Leaf)) -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "바탕화면의 PDF 2개가 새로 만들어졌습니다." -ForegroundColor Cyan
pause

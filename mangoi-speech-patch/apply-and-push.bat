@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ==========================================================
REM  mangoi_Speech repo 자동 패치 + GitHub push 스크립트 v2
REM ==========================================================

echo.
echo ============================================================
echo  🇨🇳 mangoi_Speech : Chinese coach card 패치
echo ============================================================
echo.

set "PATCH_DIR=%~dp0"
set "PATCH_DIR=%PATCH_DIR:~0,-1%"
set "REPO_DIR=%PATCH_DIR%\mangoi_Speech"

REM 1) git 명령어 존재 확인
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] git 명령어를 찾을 수 없습니다.
    echo.
    echo  설치 안내:
    echo   1) https://git-scm.com 에서 Git for Windows 다운로드
    echo   2) 설치 후 CMD 창을 닫고 다시 열기
    echo   3) 또는 — 가장 쉬운 방법:
    echo      "1-가장-쉬운-방법-GitHub-웹-편집.md" 파일을 메모장으로 열고
    echo      안내대로 GitHub 웹에서 30초 만에 적용
    echo.
    pause
    exit /b 1
)
echo [STEP 1/6] git 확인 OK
git --version

REM 2) 기존 clone 폴더 삭제
if exist "%REPO_DIR%" (
    echo [STEP 2/6] 기존 clone 폴더 삭제 중...
    rmdir /s /q "%REPO_DIR%"
)

REM 3) clone
echo [STEP 3/6] navy111p-sudo/mangoi_Speech clone 중...
git clone https://github.com/navy111p-sudo/mangoi_Speech.git "%REPO_DIR%"
if errorlevel 1 (
    echo [ERROR] clone 실패 - 네트워크/방화벽 확인
    pause
    exit /b 1
)

REM 4) 패치 복사
echo [STEP 4/6] category-ui.js 패치 복사...
copy /Y "%PATCH_DIR%\category-ui.js" "%REPO_DIR%\js\category-ui.js"

REM 5) commit + push
echo [STEP 5/6] git add + commit + push 중...
cd /d "%REPO_DIR%"
git add js/category-ui.js
git -c user.email="navy111p@gmail.com" -c user.name="navy111p-sudo" commit -m "feat: 🇨🇳 중국어 카드 추가 (Phonics/BTS/SIU 옆) - speech-coach-cn.html 로 이동"
if errorlevel 1 (
    echo.
    echo [WARN] commit 변경 사항 없음 - 이미 동일 내용일 수 있음
    pause
    exit /b 0
)

git push origin main
if errorlevel 1 (
    echo.
    echo ============================================================
    echo [ERROR] push 실패 - GitHub 인증 미완료입니다
    echo ============================================================
    echo.
    echo 해결 방법 (가장 쉬운 순):
    echo.
    echo 1) 그냥 GitHub 웹에서 5초 만에 :
    echo    "1-가장-쉬운-방법-GitHub-웹-편집.md" 파일을 메모장으로 여세요
    echo.
    echo 2) Git Credential Manager 설정 후 다시 실행:
    echo    git config --global credential.helper manager
    echo    그 다음 이 .bat 다시 실행 → 브라우저 GitHub 로그인 팝업
    echo.
    echo 3) Personal Access Token (PAT):
    echo    https://github.com/settings/tokens 에서 토큰 발급
    echo    push 시 username=navy111p-sudo, password=토큰 입력
    echo.
    pause
    exit /b 1
)

REM 6) 완료
echo.
echo [STEP 6/6] ✅ 푸시 완료!
echo.
echo ============================================================
echo  Cloudflare Pages 자동 빌드 1~2분 후 확인:
echo  https://mangoi-speech.pages.dev/practice
echo ============================================================
echo.

cd /d "%PATCH_DIR%"
rmdir /s /q "%REPO_DIR%"

pause
endlocal

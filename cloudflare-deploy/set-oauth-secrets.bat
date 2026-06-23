@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 망고아이 소셜 로그인 시크릿 등록

echo ============================================================
echo   망고아이 소셜 로그인 OAuth 시크릿 등록
echo   (카카오 / 네이버 / 구글)
echo ============================================================
echo.
echo  각 항목에서 발급받은 값을 붙여넣고 Enter 를 누르세요.
echo  (마우스 우클릭 = 붙여넣기 / 화면에는 보이지 않을 수 있음)
echo  필요 없는 항목은 입력 단계에서 Ctrl+C 로 건너뛰세요.
echo.
echo  Redirect URI (각 콘솔에 등록 필요):
echo    카카오: https://webrtc-unified-platform.navy111p.workers.dev/api/oauth/kakao/callback
echo    네이버: https://webrtc-unified-platform.navy111p.workers.dev/api/oauth/naver/callback
echo    구글  : https://webrtc-unified-platform.navy111p.workers.dev/api/oauth/google/callback
echo.
pause
echo.

echo ---------- [1/6] KAKAO_CLIENT_ID (카카오 REST API 키) ----------
call npx wrangler secret put KAKAO_CLIENT_ID
echo.
echo ---------- [2/6] KAKAO_CLIENT_SECRET ----------
call npx wrangler secret put KAKAO_CLIENT_SECRET
echo.
echo ---------- [3/6] NAVER_CLIENT_ID ----------
call npx wrangler secret put NAVER_CLIENT_ID
echo.
echo ---------- [4/6] NAVER_CLIENT_SECRET ----------
call npx wrangler secret put NAVER_CLIENT_SECRET
echo.
echo ---------- [5/6] GOOGLE_CLIENT_ID ----------
call npx wrangler secret put GOOGLE_CLIENT_ID
echo.
echo ---------- [6/6] GOOGLE_CLIENT_SECRET ----------
call npx wrangler secret put GOOGLE_CLIENT_SECRET
echo.

echo ============================================================
echo   등록 완료! 상태 확인 (true 가 나오면 성공):
echo ============================================================
echo.
curl -s https://webrtc-unified-platform.navy111p.workers.dev/api/oauth/status
echo.
echo.
echo  세 provider 가 true 면 로그인 모달의 소셜 버튼이 실제로 동작합니다.
echo  시크릿은 즉시 적용되며 재배포가 필요 없습니다.
echo.
pause

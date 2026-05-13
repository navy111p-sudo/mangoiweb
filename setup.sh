#!/bin/bash
# ============================================================
# WebRTC 통합 플랫폼 - 설치 스크립트
# ============================================================

set -e

echo "╔══════════════════════════════════════════════╗"
echo "║   WebRTC 통합 플랫폼 설치 시작                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. 메인 프로젝트 의존성 설치
echo "📦 [1/3] 메인 서버 의존성 설치 중..."
npm install
echo "✅ 메인 서버 의존성 설치 완료"
echo ""

# 2. uploads 폴더 생성
echo "📁 [2/3] 업로드 디렉토리 생성..."
mkdir -p uploads
echo "✅ uploads 폴더 준비 완료"
echo ""

# 3. TURN 중계 모듈 의존성 설치 (선택)
echo "🔄 [3/3] TURN 중계 모듈 의존성 설치 중..."
cd modules/turn-relay && npm install && cd ../..
echo "✅ TURN 중계 모듈 의존성 설치 완료"
echo ""

# 4. 환경 변수 파일 생성
if [ ! -f .env ]; then
  echo "⚙️  .env 파일 생성 중..."
  cp .env.example .env
  echo "✅ .env 파일 생성 완료 (필요시 수정하세요)"
else
  echo "ℹ️  .env 파일이 이미 존재합니다."
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   설치 완료!                                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║   npm start          → 메인 서버 실행         ║"
echo "║   npm run dev        → 개발 모드 (nodemon)    ║"
echo "║   npm run turn:dev   → TURN 중계 로컬 테스트   ║"
echo "║   npm run turn:deploy→ TURN Cloudflare 배포   ║"
echo "╚══════════════════════════════════════════════╝"

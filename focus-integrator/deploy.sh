#!/usr/bin/env bash
# ==============================================================
#  메인 통합 시스템 — GitHub push (→ Cloudflare Pages 자동 배포)
#  macOS / Linux 용 스크립트
#
#  사용법:
#    bash deploy.sh https://github.com/<USER>/<REPO>.git
#  (인자가 없으면 중간에 물어봅니다)
# ==============================================================
set -euo pipefail

cd "$(dirname "$0")"

# 기본 저장소 URL (사용자 지정)
DEFAULT_REMOTE="https://github.com/navy111p-sudo/webrtc-client-app.git"
REMOTE_URL="${1:-$DEFAULT_REMOTE}"
echo "▶ Remote : $REMOTE_URL"

# 파이썬 계산 로직 사전 검증 (선택)
if command -v python3 >/dev/null 2>&1; then
  echo "▶ 로컬 계산 테스트..."
  python3 main_system.py || true
  echo
fi

# git repo 초기화 (이미 있으면 재사용)
if [[ ! -d .git ]]; then
  git init -b main
fi

# 기본 아이덴티티가 없다면 세션 한정 설정
git config user.email   >/dev/null 2>&1 || git config user.email "navy111p@gmail.com"
git config user.name    >/dev/null 2>&1 || git config user.name  "Jeong Wooyoung"

git add .
if git diff --cached --quiet; then
  echo "ℹ️  변경 사항 없음 — 커밋 건너뜀"
else
  git commit -m "feat: 메인 통합 시스템 + Cloudflare Pages 배포 구조"
fi

# 원격 설정 / 업데이트
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "▶ push → $REMOTE_URL (main)"
git push -u origin main

echo
echo "✅ 완료. Cloudflare Pages 가 이 저장소를 연결되어 있다면 자동 배포가 시작됩니다."
echo "   최초 1회: Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git"

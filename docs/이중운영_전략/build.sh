#!/usr/bin/env bash
# 망고아이 이중운영 설명서 — HTML → PDF 재생성
#
# 사용법:  cd docs/이중운영_전략 && ./build.sh
# 필요:    한글 폰트 (sudo apt-get install -y fonts-nanum fonts-noto-cjk)

set -euo pipefail
cd "$(dirname "$0")"

SRC="망고아이_두사이트_동시운영_설명서.html"
OUT="망고아이_두사이트_동시운영_설명서.pdf"

# Chromium 찾기 — Playwright 번들 → 시스템 설치 순
CHROME=""
for c in /opt/pw-browsers/chromium-*/chrome-linux/chrome \
         /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
  [ -x "$c" ] && CHROME="$c" && break
done

if [ -z "$CHROME" ]; then
  echo "오류: Chromium 을 찾을 수 없습니다." >&2
  exit 1
fi

# pipefail 하에서 `fc-list | grep -q` 는 SIGPIPE 로 오탐이 납니다. 출력을 변수로 받습니다.
KO_FONTS="$(fc-list :lang=ko 2>/dev/null || true)"
if [ -z "$KO_FONTS" ]; then
  echo "경고: 한글 폰트가 없습니다. 글자가 네모(두부)로 나옵니다." >&2
  echo "      sudo apt-get install -y fonts-nanum fonts-noto-cjk" >&2
fi

"$CHROME" --headless --disable-gpu --no-sandbox \
  --no-pdf-header-footer \
  --virtual-time-budget=8000 \
  --print-to-pdf="$OUT" \
  "file://$(pwd)/$SRC" 2>/dev/null

echo "생성 완료: $OUT ($(du -h "$OUT" | cut -f1))"

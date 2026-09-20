#!/usr/bin/env bash
set -e
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
for pair in "content_easy:_easy:KR" "content_easy_en:_easy_en:EN"; do
  MOD="${pair%%:*}"; rest="${pair#*:}"; SFX="${rest%%:*}"; LB="${rest##*:}"
  echo "===== 쉬운사용법 $LB ====="
  MANUAL_MODULE=$MOD python build_pdf.py | tail -1
  MANUAL_SUFFIX=$SFX node pdf_convert.js | tail -1
  MANUAL_MODULE=$MOD MANUAL_SUFFIX=$SFX python finalize_pdf.py | tail -1
  MANUAL_SUFFIX=$SFX node pdf_convert.js | tail -1
  MANUAL_MODULE=$MOD python build_pptx.py | tail -1
done
echo "EASY BUILD DONE"

#!/usr/bin/env bash
set -e
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
for pair in "content_train:_train:KR" "content_train_en:_train_en:EN"; do
  MOD="${pair%%:*}"; rest="${pair#*:}"; SFX="${rest%%:*}"; LB="${rest##*:}"
  echo "===== 강사교육매뉴얼 $LB ====="
  MANUAL_MODULE=$MOD python build_pdf.py | tail -1
  MANUAL_SUFFIX=$SFX node pdf_convert.js | tail -1
  MANUAL_MODULE=$MOD MANUAL_SUFFIX=$SFX python finalize_pdf.py | tail -1
  MANUAL_SUFFIX=$SFX node pdf_convert.js | tail -1
  MANUAL_MODULE=$MOD python build_pptx.py | tail -1
  MANUAL_MODULE=$MOD python build_xlsx.py | tail -1
  MANUAL_MODULE=$MOD python build_docx.py | tail -1
done
echo "TRAIN BUILD DONE"

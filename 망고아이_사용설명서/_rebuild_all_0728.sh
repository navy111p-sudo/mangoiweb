#!/usr/bin/env bash
# 2026-07-28 전체 재생성 — 한글/영문 × PDF(2패스 차례)·PPTX·XLSX·DOCX
set -e
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"

build_lang () {
  local MOD="$1" SFX="$2" LABEL="$3"
  echo "=================  $LABEL  ================="
  MANUAL_MODULE=$MOD python build_pdf.py            | tail -1
  MANUAL_SUFFIX=$SFX node   pdf_convert.js          | tail -1
  MANUAL_MODULE=$MOD MANUAL_SUFFIX=$SFX python finalize_pdf.py | tail -1
  MANUAL_SUFFIX=$SFX node   pdf_convert.js          | tail -1
  MANUAL_MODULE=$MOD python build_pptx.py           | tail -1
  MANUAL_MODULE=$MOD python build_xlsx.py           | tail -1
  MANUAL_MODULE=$MOD python build_docx.py           | tail -1
}

build_lang content    ""    "한글 (KR)"
build_lang content_en "_en" "영문 (EN)"
echo "REBUILD DONE"

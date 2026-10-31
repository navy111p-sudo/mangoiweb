#!/usr/bin/env bash
# 2026-07-28 教师使用说明书(간체중문) 생성 — PDF(2패스 차례)·PPTX·XLSX·DOCX
# 폰트는 content_zh.py 의 FONT / FONT_CSS(微软雅黑) 를 빌더가 읽는다. (맑은 고딕엔 간체자 글리프가 없어 두부가 난다)
set -e
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"

MOD=content_zh
SFX=_zh

echo "=================  简体中文 (ZH)  ================="
MANUAL_MODULE=$MOD python build_pdf.py                       | tail -1
MANUAL_SUFFIX=$SFX node   pdf_convert.js                     | tail -1
MANUAL_MODULE=$MOD MANUAL_SUFFIX=$SFX python finalize_pdf.py | tail -1
MANUAL_SUFFIX=$SFX node   pdf_convert.js                     | tail -1
MANUAL_MODULE=$MOD python build_pptx.py                      | tail -1
MANUAL_MODULE=$MOD python build_xlsx.py                      | tail -1
MANUAL_MODULE=$MOD python build_docx.py                      | tail -1
echo "ZH BUILD DONE"

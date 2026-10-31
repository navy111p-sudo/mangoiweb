set -e
SRC="$(pwd)"
DESK="/c/Users/Admin/Desktop/03_망고아이_교육매뉴얼/사용설명서"
LIB="/c/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/library"

# 바탕화면은 PDF+PPTX만(사용자 구성 유지 — xlsx 없음), 자료실은 전 형식
# aud|kr_folder|en_folder|kr_base|en_base|lib_dir|slug|lib_docx(1/0)
rows="
student|학생용|Student|망고아이_학생용_사용설명서|Mangoi_Student_User_Guide|student|student|0
admin|관리자용|Admin|망고아이_관리자용_사용설명서|Mangoi_Admin_User_Guide|admin|admin|0
teacher|교사용|Teacher|망고아이_교사용_사용설명서|Mangoi_Teacher_User_Guide|teacher|teacher|0
branch|지사용|Branch|망고아이_지사용_사용설명서|Mangoi_Branch_User_Guide|branch|hq|1
agency|대리점용|Agency|망고아이_대리점용_사용설명서|Mangoi_Agency_User_Guide|agency|agency|1
"
echo "$rows" | while IFS='|' read -r aud krf enf krb enb libd slug hasdocx; do
  [ -z "$aud" ] && continue
  # ---- 바탕화면 (PDF · PPTX) ----
  for ext in pdf pptx; do
    cp "$SRC/build_${ext}/${krb}.${ext}"     "$DESK/한글/${krf}/${krb}.${ext}"
    cp "$SRC/build_${ext}_en/${enb}.${ext}"  "$DESK/영어/${enf}/${enb}.${ext}"
  done
  # ---- 자료실 (slug-kr / slug-en) ----
  exts="pdf pptx xlsx"
  [ "$hasdocx" = "1" ] && exts="pdf pptx xlsx docx"
  for ext in $exts; do
    cp "$SRC/build_${ext}/${krb}.${ext}"    "$LIB/${libd}/${slug}-kr.${ext}"
    cp "$SRC/build_${ext}_en/${enb}.${ext}" "$LIB/${libd}/${slug}-en.${ext}"
  done
  echo "OK $aud -> desktop(pdf,pptx x2) + library($exts x2)"
done
echo "DISTRIBUTE DONE"

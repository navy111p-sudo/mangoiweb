# 📘 관리자용 사용설명서 — 원본 (2026-10-09)

관리자 자료실의 `/library/admin/admin-kr|en.pdf · .pptx · .xlsx` 를 만드는 원본입니다.
옛 판(2026-07-27)은 원본이 저장소에 없어 고칠 수 없었고, 화면·숫자·주소(mangoi.co.kr)가 옛것이었습니다.

| 파일 | 하는 일 |
|---|---|
| `content.mjs` | **글 정본** (KO/EN · 9장 39단계 · FAQ). 화면이 바뀌면 여기부터 고칩니다 |
| `capture.mjs` | 실제 화면 파일(`cloudflare-deploy/public`)을 띄우고 API 만 **가짜 데이터**로 대신해 찍습니다 |
| `build.mjs` | PDF(A4, Noto Sans KR 심음) + `make_office.py` 호출 |
| `make_office.py` | 같은 글로 PPTX·XLSX |

## 만드는 법 (리포 루트)
```bash
cd cloudflare-deploy/public && python3 -m http.server 8977   # 다른 창
node "docs/자료실_원본/관리자용_사용설명서/capture.mjs" <캡처폴더>      # LANGS=ko,en (기본)
node "docs/자료실_원본/관리자용_사용설명서/build.mjs" <캡처폴더> <출력폴더>
cp <출력폴더>/admin-* cloudflare-deploy/public/library/admin/
```

## ⛔ 지킬 것
- **실제 학생·강사 정보를 쓰지 마세요** — `/library/` 는 누구나 받고 저장소도 공개입니다(Emma Kim · Teacher Anna 등 가짜만).
- 글은 `content.mjs` 하나 — PDF·PPT·Excel 이 서로 다른 말을 하지 않게.
- 그림이 하나라도 빠지면 `build.mjs` 가 멈춥니다(빈 상자 든 설명서 방지).
- 캡처 `c8-payroll-dash` 는 가짜 응답에 칸이 모자라 «undefined명» 이 찍혀 **본문에 안 씁니다**.
- 🎬 동영상 사용설명서(`admin-kr|en.mp4`)는 원본이 없어 이번에 다시 만들지 못했습니다(2026-07 판 그대로).

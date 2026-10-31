# 📘 관리자용 사용설명서 — 원본 (2026-10-09 · 2026-10-28 10장 추가)

관리자 자료실의 `/library/admin/admin-kr|en.pdf · .pptx · .xlsx` 를 만드는 원본입니다.
옛 판(2026-07-27)은 원본이 저장소에 없어 고칠 수 없었고, 화면·숫자·주소(mangoi.co.kr)가 옛것이었습니다.

| 파일 | 하는 일 |
|---|---|
| `content.mjs` | **글 정본** (KO/EN · 10장 45단계 · FAQ 11개). 화면이 바뀌면 여기부터 고칩니다 |
| `capture.mjs` | 실제 화면 파일(`cloudflare-deploy/public`)을 띄우고 API 만 **가짜 데이터**로 대신해 찍습니다(1~9장) |
| `../AI컨텐츠_결제안내/capture.mjs` | **10장 «AI 컨텐츠 결제(대리점)»** 그림(`p2-menu` … `p6-done`) — 대리점 화면을 시연 계정 모드로 찍습니다 |
| `restore_images.py` | 이미 배포된 PPTX 에서 단계 그림을 **원래 이름으로 되살립니다**(고치지 않는 장은 다시 안 찍기) |
| `build.mjs` | PDF(A4, Noto Sans KR 심음) + `make_office.py` 호출 |
| `make_office.py` | 같은 글로 PPTX·XLSX |
| `../_공용/pdf-helpers.mjs` | 크로미움 띄우기·글꼴 심기(결제 안내서와 함께 씀) |

## 만드는 법 (리포 루트)
```bash
cd cloudflare-deploy/public && python3 -m http.server 8977   # 다른 창
# ① 전부 새로 찍기
node "docs/자료실_원본/관리자용_사용설명서/capture.mjs" <캡처폴더>          # 1~9장 (LANGS=ko,en 기본)
node "docs/자료실_원본/AI컨텐츠_결제안내/capture.mjs" <캡처폴더>          # 10장
# ② 또는 한 장만 고칠 때 — 나머지 그림은 지금 PPTX 에서 되살린다
node -e "import('./docs/자료실_원본/관리자용_사용설명서/content.mjs').then(m=>process.stdout.write(JSON.stringify(m.T)))" > <c.json>
python3 -I "docs/자료실_원본/관리자용_사용설명서/restore_images.py" <c.json> cloudflare-deploy/public/library/admin <캡처폴더>
#    → «못 찾음» 으로 나온 그림만 capture.mjs 로 찍는다
node "docs/자료실_원본/관리자용_사용설명서/build.mjs" <캡처폴더> <출력폴더>
cp <출력폴더>/admin-* cloudflare-deploy/public/library/admin/
```
크롬 경로는 손으로 박지 않습니다(컨테이너 기본 Playwright 크로미움). 다른 크롬은 `CHROME=<실행 파일>`.

## 판 기록
- **2026-10-09** 9장 39단계 — 새로 씀(수업 입력·연기·변경·취소·급여 최신 화면).
- **2026-10-28** 10장 «AI 컨텐츠 결제(대리점)» 6단계 + FAQ 3개 추가 → **10장 45단계**.
  1~9장 그림은 10-09 판 그대로(`restore_images.py` 로 되살림 — 그 사이 화면이 바뀌어 글과 어긋나는 것을 피함),
  10장만 2026-10-28 화면. 표지에 «화면: 1~9장 2026-10-09 · 10장 2026-10-28» 로 적어 두었습니다.

## ⛔ 지킬 것
- **실제 학생·강사·학원 정보를 쓰지 마세요** — `/library/` 는 누구나 받고 저장소도 공개입니다(Emma Kim · Teacher Anna · 샘플영어학원 · demo001 등 가짜만).
- 글은 `content.mjs` 하나 — PDF·PPT·Excel 이 서로 다른 말을 하지 않게.
- 그림이 하나라도 빠지면 `build.mjs` 가 멈춥니다(빈 상자 든 설명서 방지).
- 캡처 `c8-payroll-dash` 는 가짜 응답에 칸이 모자라 «undefined명» 이 찍혀 **본문에 안 씁니다**.
- 🎬 동영상 사용설명서(`admin-kr|en.mp4`)는 원본이 없어 다시 만들지 못했습니다(2026-07 판 그대로 — 10장 결제 내용 없음).

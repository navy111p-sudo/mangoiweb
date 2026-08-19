# 「관리자 페이지 쉬운 사용법」 만드는 곳

자료실에서 내려받는 안내서(한국어·영어 각 25장)와, 관리자 화면에서 여는 슬라이드 뷰어가
쓰는 그림을 **여기서 다시 만든다.** 예전에는 그림 21장만 저장소에 있고 «무엇으로 만들었는지» 가
없어서, 문구 한 줄을 고치려면 전부 다시 만들어야 했다.

## 무엇이 어디로 나가나

| 만드는 것 | 나가는 자리 |
|---|---|
| `01.jpg` … `25.jpg` · `.webp` | `cloudflare-deploy/public/guide/admin-easy{,-en}/` |
| `admin-easy.pdf` · `admin-easy-en.pdf` | 같은 폴더 (자료실 「📄 PDF」, 뷰어의 「📄 저장」) |
| `admin-easy-kr.pptx` · `admin-easy-en.pptx` | `cloudflare-deploy/public/library/admin/` |

슬라이드 «제목 줄»(뷰어 아래 캡션)은 `cloudflare-deploy/public/js/adm-s18.js` 의 `titles` 다.
**원고와 장수·순서가 같아야 한다.**

## 돌리는 법

```bash
# 0) 준비물 — 저장소 의존성이 아니다. 밖에서 한 번 받아 둔다.
mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
pip install pillow python-pptx
#    한글 글꼴이 없는 컨테이너면 Pretendard 를 /usr/share/fonts 에 깔고 fc-cache -f

# 1) 관리자 화면을 로컬로 띄운다 (실서비스가 아니다 — 프록시가 mangoi.ai 를 막는다)
cd cloudflare-deploy/public && python3 -m http.server 8899 &

# 2) 화면 캡처 (한국어·영어)
cd /경로/mangoiweb
PW_DIR=/tmp/pw node tools/guide-shots/shoot.mjs /tmp/shots-ko ko
PW_DIR=/tmp/pw node tools/guide-shots/shoot.mjs /tmp/shots-en en

# 3) 슬라이드 조립 (그림 + PDF + PPTX)
PW_DIR=/tmp/pw node tools/guide-shots/deck/build.mjs ko /tmp/shots-ko /tmp/deck-ko
PW_DIR=/tmp/pw node tools/guide-shots/deck/build.mjs en /tmp/shots-en /tmp/deck-en

# 4) 저장소에 반영 + adm-s18.js 의 titles 갱신 + admin.html 의 ?v= 올리기
```

## 손댈 때 알아 둘 것

- **원고만 고치면 된다** — `deck/slides.ko.mjs` · `deck/slides.en.mjs`. 디자인은 `deck/build.mjs`.
- **화면에 없는 기능을 적지 말 것.** 캡처에 보이는 것만 적는다.
- **표에 가짜 학생·가짜 금액을 넣지 않는다.** 자료를 불러오기 전 화면 그대로 찍는다.
  안내서에 실제가 아닌 숫자가 들어가면 그게 사실로 읽힌다.
- `/api/**` 는 전부 스텁이라 **D1(개발·운영 공용 DB)에는 아무것도 닿지 않는다.**
- 제목 이모지는 **Unicode 11 이하**만 쓴다(Win10 두부 방지). ZWJ 조합(🧑‍🏫)도 피한다.
- `public/js/*.js` 를 고쳤으면 `admin.html` 의 `?v=` 를 함께 올린다 — `asset_version_harness` 가 잡는다.

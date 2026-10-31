# 「관리자 페이지 쉬운 사용법」 26장 — 만드는 곳

관리자 화면 왼쪽 아래 **계정 ▸ 자료실 / 사용 안내서**, 그리고 「📘 쉬운 사용법」으로 열리는
그 26장짜리 안내가 여기서 만들어집니다.

> 📌 **2026-10-09 — 핵심 업무 6장 추가**(사장님 «수업스케줄링·결제확인·직원급여·학생결제를 특히 자세히, 화살표로»).
> 흐름 한 장 + 수강신청 · 주간 스케줄 · 연기/변경 · 학생 결제 · 강사 급여 5장. 그림 위에 **빨간 번호 + 화살표 + 주황 테두리**를 그립니다.

| 여기 | 무엇 |
|---|---|
| `slides.mjs` | **글 정본.** 26장의 글이 전부 여기 있습니다. 글만 고칠 거면 이 파일만 보면 됩니다 |
| `sample-data.mjs` | 핵심 업무 화면을 «채워서» 찍기 위한 **견본 응답**(가짜 이름·금액). 진짜 개인정보가 그림에 안 찍히게 일부러 가짜를 씁니다 |
| `capture.mjs` | 관리자 화면을 **새로 찍어** `.shots/` 에 넣습니다 |
| `build.mjs` | 글 + 화면 그림 → `cloudflare-deploy/public/guide/admin-easy/` 의 26장 + PDF |

> 📌 **글투는 «10세 수준»** 입니다(2026-08-22 사장님 지시). 짧은 문장, 쉬운 낱말,
> 순서가 있는 일은 1·2·3. 자세한 규칙은 `slides.mjs` 머리말에 적혀 있습니다.

---

## 고치는 방법

### ① 준비 (처음 한 번만)

```bash
cd docs/관리자안내_소스

# 한글 글꼴 — 저장소에 넣지 않습니다(10MB). 구글 폰트 주소는 프록시에 막혀 있으니 npm 으로 받습니다.
mkdir -p fonts && cd fonts && npm pack @fontsource/noto-sans-kr \
  && tar xzf fontsource-noto-sans-kr-*.tgz && cd ..

# 굽는 데 쓰는 도구
npm install sharp playwright-core
```

### ② 글만 고칠 때

`slides.mjs` 를 고치고 → `node build.mjs`

### ③ 화면 그림까지 새로 찍을 때

관리자 화면이 바뀌었으면 그림도 새로 찍어야 합니다.

```bash
# 창 하나: 배포되는 그 파일들을 그대로 띄웁니다
cd cloudflare-deploy/public && python3 -m http.server 8899

# 창 둘
cd docs/관리자안내_소스
node capture.mjs          # 전부 (한 장만: node capture.mjs login)
node build.mjs
```

찍은 그림은 `.shots/` 에 들어가고 **저장소에는 넣지 않습니다** — 다시 찍으면 되고,
넣어 두면 오히려 «옛 화면» 이 남습니다.

---

## 🔴 화살표(번호) 붙이는 법 — `type:'focus'` 장

- `capture.mjs` 의 대상에 `marks:[…]` 를 적습니다. `'css:선택자'` 또는 `'버튼 글자'`.
  찍을 때 그 요소의 자리를 `.shots/marks-<이름>.json` 에 남기고, `build.mjs` 가 그 위에
  **주황 테두리 + 빨간 번호 + 화살표** 를 그립니다(번호 동그라미는 다른 표시를 안 가리는 자리로 비켜섭니다).
- ⛔ **`marks` 순서 = `slides.mjs` 의 `steps` 순서** 입니다. 한쪽만 바꾸면 «3번 화살표» 가 엉뚱한 설명을 가리킵니다.
- 못 찾은 표시는 `⚠️ 화살표 자리를 못 찾음` 으로 알려 주고 **그리지 않습니다**(엉뚱한 곳을 가리키는 것보다 낫습니다).
- `crop:'auto'` 면 표시한 곳이 다 들어가게 알아서 자릅니다.
- 핵심 업무 화면에서는 오른쪽 아래 «AI 운영비서» 단추를 감추고 찍습니다(표를 덮어서).

## ⚠️ 여기서 밟기 쉬운 것

- **`mangoi.ai` 는 이 컨테이너에서 안 열립니다**(프록시가 막습니다 — CLAUDE.md 4-1-1).
  그래서 «배포된 진짜 화면» 이 아니라 **로컬 서버 + 컨테이너 크로미움**으로 찍습니다.
  서버가 없으니 `/api/*` 는 모양만 맞는 JSON(스텁)으로 답합니다 —
  **표가 비어 있는 것은 버그가 아니라 스텁이라서** 그렇습니다.
- **빈 브라우저는 «첫 방문자»** 라 환영 안내(`#aw-overlay`)가 스크롤·클릭을 막습니다.
  `capture.mjs` 가 `localStorage` 로 «본 것» 표시를 먼저 넣습니다. 지우지 마세요.
- **장 번호(04·05…)는 `build.mjs` 가 순서대로 저절로 매깁니다** — 제목에 ①② 를 적지 마세요(장을 끼우면 꼬입니다).
- **`adm-s18.js` 의 한국어 제목**은 `slides.mjs` 의 제목과 짝입니다.
  한쪽만 고치면 **그림은 맞는데 쪽 제목만 옛것**이 됩니다(에러가 안 납니다).
  `build.mjs` 가 끝에 대조해서 알려 줍니다.
- **`adm-s18.js` 를 고쳤으면 `admin.html` 의 `?v=` 도 함께 올리세요.**
  안 올리면 `asset_version_harness` 가 FAIL 냅니다(그리고 실제로 옛 파일이 캐시에 남습니다).
- **이모지는 Unicode 6.0 안쪽만.** Win10 에서 두부(□)로 나옵니다(CLAUDE.md 1-4).
  번호·화살표는 이모지가 아니라 CSS 로 그립니다.

## 안내문에 적힌 것의 정본

| 안내문의 내용 | 코드의 정본 |
|---|---|
| 들어가는 주소 `mangoi.ai/admin` | `cloudflare-deploy/src/site-url.ts` 의 `SITE_ORIGIN` |
| 왼쪽 메뉴 7묶음과 그 안의 이름 | `cloudflare-deploy/public/js/adm-ia6.js` 의 `GROUPS` |
| 카카오 채널 주소 | CLAUDE.md 2장 — 뒤에 `/chat` 을 붙이면 안 됩니다 |

## 영어판은?

## 영어판(2026-10-09 부터 같은 소스로 만듭니다)

영어판(`/guide/admin-easy-en/`)도 **26장 · 같은 구조**입니다. 글 정본은 `slides-en.mjs`(장 순서·`step`·`focus` 가 `slides.mjs` 와 같아야 합니다),
슬라이드 틀의 글자(«Be careful»·«Follow the red numbers…»)는 `build.mjs` 의 `UI` 표입니다.

```bash
GUIDE_LANG=en node capture.mjs   # 관리자 화면을 «영어»로 찍어 .shots/en/ 에
GUIDE_LANG=en node build.mjs     # → public/guide/admin-easy-en/ 26장 + admin-easy-en.pdf
```

- 영어로 찍을 때는 `localStorage` 에 `mangoi_lang='en'`·`mangoi_lang_by='user'` 를 넣습니다(안 넣으면 한국 국적 계정이 KO 로 되돌립니다).
- 견본 데이터의 지점·강사 표시는 `enSample()` 이 영어로 바꿉니다(학생 이름은 그대로 — 실제 화면도 한글 이름입니다).
- 표시가 버튼 «글자» 로 찾는 장은 `marksEn` 을 따로 둡니다(화면 글자가 다르니까). 영어 글자가 길어 칸이 잘리는 장은 `viewportEn`(급여 = 2400 폭).
- 화면에 적는 버튼 이름은 **실제 영어 화면의 글자**(그 요소의 `data-en`)로 맞추세요.
- 다시 구우면 `adm-s18.js` 의 `DECKS.en.ver`·`pdf` 의 `?v=`, `admin.html` 영어 PDF 링크의 `?v=`, `adm-welcome.js` 의 그림 `?v=` 를 함께 올리세요.
- 그림을 다시 구우면 `cloudflare-deploy/public/js/adm-s18.js` 의 `DECKS.ko.ver`(그리고 PDF 주소의 `?v=`)를 올리세요. 그림은 7일 캐시라 안 올리면 옛 그림이 남습니다.

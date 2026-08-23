# 「관리자 페이지 쉬운 사용법」 21장 — 만드는 곳

관리자 화면 왼쪽 아래 **계정 ▸ 자료실 / 사용 안내서**, 그리고 「📘 쉬운 사용법」으로 열리는
그 21장짜리 안내가 여기서 만들어집니다.

| 여기 | 무엇 |
|---|---|
| `slides.mjs` | **글 정본.** 21장의 글이 전부 여기 있습니다. 글만 고칠 거면 이 파일만 보면 됩니다 |
| `capture.mjs` | 관리자 화면을 **새로 찍어** `.shots/` 에 넣습니다 |
| `build.mjs` | 글 + 화면 그림 → `cloudflare-deploy/public/guide/admin-easy/` 의 21장 + PDF |

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
node capture.mjs          # 12장 전부 (한 장만: node capture.mjs login)
node build.mjs
```

찍은 그림은 `.shots/` 에 들어가고 **저장소에는 넣지 않습니다** — 다시 찍으면 되고,
넣어 두면 오히려 «옛 화면» 이 남습니다.

---

## ⚠️ 여기서 밟기 쉬운 것

- **`mangoi.ai` 는 이 컨테이너에서 안 열립니다**(프록시가 막습니다 — CLAUDE.md 4-1-1).
  그래서 «배포된 진짜 화면» 이 아니라 **로컬 서버 + 컨테이너 크로미움**으로 찍습니다.
  서버가 없으니 `/api/*` 는 모양만 맞는 JSON(스텁)으로 답합니다 —
  **표가 비어 있는 것은 버그가 아니라 스텁이라서** 그렇습니다.
- **빈 브라우저는 «첫 방문자»** 라 환영 안내(`#aw-overlay`)가 스크롤·클릭을 막습니다.
  `capture.mjs` 가 `localStorage` 로 «본 것» 표시를 먼저 넣습니다. 지우지 마세요.
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

영어판(`/guide/admin-easy-en/`, 24장)은 **아직 이 소스로 만들지 않습니다.**
한국어판만 2026-08-22 에 새로 만들었습니다. 영어판을 같은 방식으로 옮기려면
`slides.mjs` 에 영어 글을 더하고 `build.mjs` 의 내보내는 곳을 하나 더 두면 됩니다.

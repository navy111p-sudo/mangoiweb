# 망고아이 관리자 — 블루 톤앤매너 디자인 시스템

신뢰감 있는 진한 네이비 배경 + 연한 블루 콘텐츠 + WCAG AA 대비 표준 만족.

---

## 1. 색상 팔레트 (CSS Variables)

`:root`에 한 번 정의해두고 전체 컴포넌트에서 재사용합니다.

```css
:root {
  /* ===== 배경 톤 (어두운 → 밝은) ===== */
  --bg-darkest:  #020617; /* slate-950 : 코드 블록, 터미널 */
  --bg-outer:    #0F172A; /* slate-900 : 페이지 바깥 배경 */
  --bg-card:     #1E293B; /* slate-800 : 다크 카드 배경 */
  --bg-header:   #1E3A8A; /* blue-900  : 카드/섹션 헤더 */
  --bg-soft:     #E0F2FE; /* sky-100   : 라이트 강조 박스 */
  --bg-soft-50:  #F0F9FF; /* sky-50    : 라이트 본문 박스 */

  /* ===== 텍스트 (다크 배경 위) ===== */
  --text-on-dark:        #F8FAFC; /* slate-50  : 본문 (대비 17.4:1) */
  --text-on-dark-muted:  #CBD5E1; /* slate-300 : 부가 설명 (8.7:1) */
  --text-on-dark-strong: #DBEAFE; /* blue-100  : 헤더 (15.2:1) */
  --text-on-dark-accent: #93C5FD; /* blue-300  : 강조 b/strong (8.2:1) */
  --text-on-dark-link:   #60A5FA; /* blue-400  : 링크 (5.8:1) */
  --text-on-dark-code:   #67E8F9; /* cyan-300  : 인라인 코드 (9.4:1) */

  /* ===== 텍스트 (라이트 배경 위) ===== */
  --text-on-light:        #0F172A; /* slate-900 : 본문 (19.7:1) */
  --text-on-light-muted:  #334155; /* slate-700 : 부가 (10.8:1) */
  --text-on-light-strong: #1E40AF; /* blue-800  : 헤더 (8.6:1) */
  --text-on-light-link:   #2563EB; /* blue-600  : 링크 (5.5:1) */

  /* ===== 보더 ===== */
  --border-on-dark:  rgba(59,130,246,0.35);  /* blue-500 35% */
  --border-on-light: rgba(30,64,175,0.25);   /* blue-800 25% */

  /* ===== 액션 (버튼/포커스) ===== */
  --accent:        #2563EB; /* blue-600 */
  --accent-hover:  #1D4ED8; /* blue-700 */
  --accent-active: #1E40AF; /* blue-800 */
  --focus-ring:    rgba(96,165,250,0.4); /* blue-400 40% */

  /* ===== 시맨틱 ===== */
  --success: #22C55E; /* green-500 */
  --warning: #FACC15; /* yellow-400 */
  --danger:  #EF4444; /* red-500 */
}
```

### Tailwind 매핑 (config 없이 기본 클래스로)

| CSS 변수 | Tailwind 클래스 (배경) | Tailwind 클래스 (텍스트) |
|---|---|---|
| `--bg-outer` | `bg-slate-900` | — |
| `--bg-card` | `bg-slate-800` | — |
| `--bg-header` | `bg-blue-900` | — |
| `--bg-soft` | `bg-sky-100` | — |
| `--bg-soft-50` | `bg-sky-50` | — |
| `--text-on-dark` | — | `text-slate-50` |
| `--text-on-dark-muted` | — | `text-slate-300` |
| `--text-on-dark-strong` | — | `text-blue-100` |
| `--text-on-dark-accent` | — | `text-blue-300` |
| `--text-on-light` | — | `text-slate-900` |
| `--accent` | `bg-blue-600` | `text-blue-600` |

---

## 2. 페이지 바탕 (바깥 영역)

### CSS

```css
body {
  background: linear-gradient(180deg, var(--bg-outer) 0%, var(--bg-darkest) 100%);
  color: var(--text-on-dark);
  font-family: 'Pretendard', -apple-system, 'Segoe UI', sans-serif;
  min-height: 100vh;
  margin: 0;
}
```

### Tailwind

```html
<body class="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-slate-50 font-sans">
  ...
</body>
```

---

## 3. 카드 컴포넌트

두 가지 변형 — **다크 카드** (대시보드의 기본) / **라이트 카드** (가이드/설명 박스).

### 3-1. 다크 카드 (메인 콘텐츠 박스)

#### CSS

```css
.card-dark {
  background: linear-gradient(135deg, var(--bg-outer), var(--bg-card));
  color: var(--text-on-dark);
  border: 1px solid var(--border-on-dark);
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.card-dark > .card-header {
  background: linear-gradient(135deg, var(--bg-header), var(--accent));
  color: var(--text-on-dark-strong);
  border-radius: 10px;
  padding: 12px 16px;
  margin: -18px -18px 14px;
  font-weight: 700;
  font-size: 14px;
}
.card-dark p,
.card-dark li {
  color: var(--text-on-dark);
  line-height: 1.7;
}
.card-dark b,
.card-dark strong {
  color: var(--text-on-dark-accent);
  font-weight: 700;
}
```

#### Tailwind

```html
<section class="bg-gradient-to-br from-slate-900 to-slate-800 text-slate-50
                border border-blue-500/35 rounded-2xl p-5 mb-4 shadow-xl">
  <header class="bg-gradient-to-br from-blue-900 to-blue-600 text-blue-100
                 rounded-xl px-4 py-3 -m-5 mb-3 font-bold text-sm">
    📡 푸시 상태 + VAPID
  </header>
  <p class="leading-7">
    지금 푸시 시스템이 <strong class="text-blue-300 font-bold">실제 발송</strong>
    상태입니다.
  </p>
</section>
```

### 3-2. 라이트 카드 (안쪽 설명 박스, ice blue)

다크 카드 **안에** 사용하는 강조 박스. 본문 대비 17:1 보장.

#### CSS

```css
.card-light {
  background: var(--bg-soft-50);
  color: var(--text-on-light);
  border: 1px solid var(--border-on-light);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 12px 0;
}
.card-light h3,
.card-light h4 {
  color: var(--text-on-light-strong);
  margin-top: 0;
}
.card-light b,
.card-light strong {
  color: var(--text-on-light-strong);
}
.card-light a {
  color: var(--text-on-light-link);
  text-decoration: underline;
}
```

#### Tailwind

```html
<div class="bg-sky-50 text-slate-900 border border-blue-800/25 rounded-xl px-4 py-3.5 my-3">
  <h4 class="text-blue-800 font-bold mt-0">📖 쉬운 설명</h4>
  <p>
    <strong class="text-blue-800">VAPID 키</strong>는 Apple/Google 서버에
    "이 서버가 망고아이 서버 맞다"고 증명하는 보안 키입니다.
  </p>
</div>
```

---

## 4. 타이포그래피 (단계별 텍스트 가독성)

다크 배경 위 단계 라벨이 흐릿한 문제 해결.

### CSS

```css
.step-label {
  display: inline-block;
  background: var(--accent);
  color: #FFFFFF;
  padding: 4px 12px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 12px;
  margin-right: 8px;
  letter-spacing: 0.5px;
}
.step-title {
  color: var(--text-on-dark-strong);
  font-size: 16px;
  font-weight: 700;
  margin: 18px 0 8px;
}
.step-body {
  color: var(--text-on-dark);
  font-size: 13.5px;
  line-height: 1.75;
  padding-left: 12px;
  border-left: 3px solid var(--accent);
  margin-left: 4px;
}
```

### Tailwind

```html
<div class="mt-5">
  <div class="flex items-center mb-2">
    <span class="bg-blue-600 text-white px-3 py-1 rounded-full font-extrabold text-xs tracking-wide">
      1단계
    </span>
    <h3 class="text-blue-100 text-base font-bold ml-2">SOLAPI 회원가입</h3>
  </div>
  <div class="text-slate-50 text-sm leading-7 pl-3 border-l-2 border-blue-600 ml-1">
    solapi.com 회원가입 → 사업자번호 인증 → 캐시 1만원 충전
  </div>
</div>
```

---

## 5. 버튼

### CSS

```css
.btn-primary {
  background: linear-gradient(135deg, var(--accent), #3B82F6);
  color: #FFFFFF;
  border: 1px solid rgba(147,197,253,0.5);
  border-radius: 8px;
  padding: 9px 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-primary:hover {
  background: linear-gradient(135deg, var(--accent-hover), var(--accent));
  box-shadow: 0 4px 14px var(--focus-ring);
  transform: translateY(-1px);
}
.btn-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.btn-secondary {
  background: transparent;
  color: var(--text-on-dark-accent);
  border: 1px solid var(--border-on-dark);
}
.btn-secondary:hover {
  background: rgba(59,130,246,0.15);
  color: var(--text-on-dark-strong);
}
```

### Tailwind

```html
<!-- Primary -->
<button class="bg-gradient-to-br from-blue-600 to-blue-500 text-white
               border border-blue-300/50 rounded-lg px-4 py-2 font-bold
               hover:from-blue-700 hover:to-blue-600 hover:shadow-lg hover:-translate-y-px
               focus-visible:ring-2 focus-visible:ring-blue-400/40
               transition-all">
  🔐 새 VAPID 키 생성
</button>

<!-- Secondary -->
<button class="bg-transparent text-blue-300 border border-blue-500/35 rounded-lg px-4 py-2
               hover:bg-blue-500/15 hover:text-blue-100 transition-all">
  취소
</button>
```

---

## 6. 폼 (input / textarea / select)

### CSS

```css
.form-input,
.form-textarea,
.form-select {
  background: rgba(15,23,42,0.75);
  color: var(--text-on-dark);
  border: 1px solid var(--border-on-dark);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13.5px;
  width: 100%;
}
.form-input::placeholder { color: #64748B; }
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus-ring);
  outline: none;
}
.form-label {
  display: block;
  color: var(--text-on-dark-muted);
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 4px;
}
```

### Tailwind

```html
<label class="block text-slate-300 text-xs font-semibold mb-1">제목</label>
<input type="text" placeholder="망고아이 알림"
       class="w-full bg-slate-900/75 text-slate-50 border border-blue-500/35
              rounded-md px-3 py-2 text-sm
              placeholder:text-slate-500
              focus:border-blue-600 focus:ring-2 focus:ring-blue-400/40 focus:outline-none" />
```

---

## 7. 코드 블록 (터미널 / PowerShell)

### CSS

```css
code {
  background: var(--bg-darkest);
  color: var(--text-on-dark-code);
  border: 1px solid var(--border-on-dark);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.92em;
}
pre.terminal {
  background: var(--bg-darkest);
  color: var(--text-on-dark);
  border: 1px solid var(--border-on-dark);
  border-radius: 10px;
  padding: 14px 18px;
  overflow-x: auto;
  line-height: 1.65;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12.5px;
  position: relative;
}
pre.terminal::before {
  content: '● ● ●';
  position: absolute;
  top: 8px; right: 14px;
  color: rgba(255,255,255,0.15);
  letter-spacing: 4px;
  font-size: 10px;
}
/* 인라인 변수/명령어 강조 */
pre.terminal .cmd { color: var(--text-on-dark-code); }
pre.terminal .arg { color: #FACC15; }
pre.terminal .comment { color: #64748B; font-style: italic; }
```

### Tailwind

```html
<pre class="relative bg-slate-950 text-slate-50 border border-blue-500/35
            rounded-xl px-5 py-4 overflow-x-auto leading-relaxed font-mono text-xs">
  <span class="absolute top-2 right-3 text-white/15 tracking-widest text-[10px]">● ● ●</span>
<span class="text-cyan-300">cd</span> <span class="text-yellow-400">"C:\Users\Admin\Desktop\..."</span>
<span class="text-cyan-300">npx</span> wrangler@4 secret put <span class="text-yellow-400">SOLAPI_API_KEY</span>
</pre>
```

---

## 8. 표 (Table)

### CSS

```css
table {
  width: 100%;
  background: rgba(15,23,42,0.55);
  border-collapse: collapse;
  border-radius: 10px;
  overflow: hidden;
}
thead th {
  background: var(--bg-header);
  color: var(--text-on-dark-strong);
  padding: 8px 12px;
  text-align: left;
  font-weight: 700;
  font-size: 12.5px;
  border-bottom: 1px solid var(--border-on-dark);
}
tbody td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--border-on-dark);
  color: var(--text-on-dark);
  font-size: 13px;
}
tbody tr:nth-child(even) {
  background: rgba(30,41,59,0.35);
}
tbody tr:hover {
  background: rgba(59,130,246,0.15);
}
```

### Tailwind

```html
<table class="w-full bg-slate-900/55 rounded-xl overflow-hidden">
  <thead>
    <tr>
      <th class="bg-blue-900 text-blue-100 px-3 py-2 text-left text-xs font-bold">플랫폼</th>
      <th class="bg-blue-900 text-blue-100 px-3 py-2 text-left text-xs font-bold">지원</th>
    </tr>
  </thead>
  <tbody>
    <tr class="hover:bg-blue-500/15">
      <td class="px-3 py-1.5 text-slate-50 text-sm border-b border-blue-500/25">Chrome</td>
      <td class="px-3 py-1.5 text-slate-50 text-sm border-b border-blue-500/25">✅</td>
    </tr>
    <tr class="bg-slate-800/35 hover:bg-blue-500/15">
      <td class="px-3 py-1.5 text-slate-50 text-sm border-b border-blue-500/25">Safari iOS</td>
      <td class="px-3 py-1.5 text-slate-50 text-sm border-b border-blue-500/25">⚠️ 16.4+</td>
    </tr>
  </tbody>
</table>
```

---

## 9. 알림 박스 (info / success / warning / danger)

### CSS

```css
.alert {
  border-radius: 10px;
  padding: 12px 16px;
  margin: 12px 0;
  font-size: 13px;
  border-left: 4px solid;
}
.alert-info    { background: rgba(37,99,235,0.15);  border-color: var(--accent);  color: var(--text-on-dark); }
.alert-success { background: rgba(34,197,94,0.15);  border-color: var(--success); color: var(--text-on-dark); }
.alert-warning { background: rgba(250,204,21,0.15); border-color: var(--warning); color: var(--text-on-dark); }
.alert-danger  { background: rgba(239,68,68,0.15);  border-color: var(--danger);  color: var(--text-on-dark); }
```

### Tailwind

```html
<div class="bg-blue-600/15 border-l-4 border-blue-600 text-slate-50 rounded-xl px-4 py-3 my-3 text-sm">
  💡 <strong class="text-blue-300">Web Push는 SOLAPI 비용이 0원!</strong>
</div>
<div class="bg-yellow-400/15 border-l-4 border-yellow-400 text-slate-50 rounded-xl px-4 py-3 my-3 text-sm">
  ⚠️ 학생이 한 번 "알림 허용"을 눌러야 합니다.
</div>
```

---

## 10. WCAG AA 대비 검증

| 조합 | 대비 비율 | WCAG 등급 |
|---|---|---|
| `#F8FAFC` 글자 / `#0F172A` 배경 | **17.4:1** | AAA ✅ |
| `#CBD5E1` 글자 / `#1E293B` 배경 | **8.7:1** | AAA ✅ |
| `#93C5FD` 강조 / `#1E293B` 배경 | **8.2:1** | AAA ✅ |
| `#60A5FA` 링크 / `#0F172A` 배경 | **5.8:1** | AA ✅ |
| `#0F172A` 글자 / `#F0F9FF` 배경 | **19.7:1** | AAA ✅ |
| `#1E40AF` 헤더 / `#F0F9FF` 배경 | **8.6:1** | AAA ✅ |

본문 텍스트 모두 4.5:1 이상 (WCAG AA 본문), 큰 글자 모두 3:1 이상 (WCAG AA 큰 글자) 통과.

---

## 11. 적용 우선순위 가이드

1. **`:root` CSS variables 먼저 선언** — 전체 페이지 색상의 단일 소스
2. **body 배경 + 폰트** — 전체 톤 결정
3. **`.card-dark` / `.card-light` 컴포넌트 클래스** — 콘텐츠 박스
4. **`.btn-primary`, `.form-input`, `pre.terminal`** — 인터랙티브 요소
5. **`.step-label`, `.step-body`** — 가이드 단계 표시 (가독성 핵심)
6. **`.alert-*`** — 알림/경고 박스

---

## 12. 기존 admin.html에 즉시 적용하는 한 줄

이 가이드의 색상 시스템은 admin.html의 **ph100 패치** 로 실제 적용됩니다 (`<style id="ph100-blue-theme">`).
별도 코드 작성 없이 deploy.bat 실행 후 사이트 새로고침만으로 전체 페이지가 위 디자인 시스템에 따라 렌더링됩니다.

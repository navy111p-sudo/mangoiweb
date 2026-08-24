/**
 * home_opening_btn_harness.mjs — 홈 «오프닝 소리» 버튼에 글자가 들어앉지 않게 (2026-08-24)
 *
 * 왜 필요한가
 *   사장님 제보 「이거 글자가 이상해」 — 34px 짜리 동그란 🔊 버튼 자리에
 *   «오프 / 닝 소 / 리 끄 / 기» 가 세 줄로 쪼개져 밖으로 넘쳐 있었다.
 *   원인은 CSS 도 줄바꿈도 아니고 **i18n 엔진**이다:
 *     `[data-ko], [data-en]` 이 붙은 요소는 엔진이 **textContent 를 통째로 갈아끼운다.**
 *     🌐 를 눌러도 설명이 따라오게 하려고 그 두 속성을 달았는데,
 *     그 순간 아이콘이 지워지고 문장이 그 자리에 들어앉았다.
 *   ⚠️ 엔진이 «둘» 이라 한쪽만 피해도 소용없다 — index.html 인라인 엔진과 js/mango-i18n.js.
 *   ✅ 설명은 «-title / -aria» 접미사로 단다. 그쪽은 title·aria-label 만 건드린다.
 *
 * ⚠️ 부정 검사(«이 속성이 없어야 한다»)는 반드시 주석을 벗겨 낸 사본으로 한다.
 *    「왜 안 다는지」 적은 설명 주석에 그 이름이 들어가 있어 원본으로 재면 자기 주석을 잡는다
 *    (CLAUDE.md 2장 — c24_finance_kcpm_harness ③ 에서 실제로 밟은 함정).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-home-opening.js'), 'utf8');
const i18n = readFileSync(join(PUB, 'js', 'mango-i18n.js'), 'utf8');
const index = readFileSync(join(PUB, 'index.html'), 'utf8');

/** 주석 제거 — JS 블록/줄 주석 */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const bare = strip(js);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m) => { fail++; console.log(`  ❌ ${m}`); };

console.log('home_opening_btn_harness — 🔊 버튼 자리에 문장이 들어앉지 않는가');

/* ── ① 🔴 버튼에 data-ko / data-en 을 달지 않는가 (핵심) ────────────────── */
const koSets = (bare.match(/setAttribute\(\s*['"]data-(ko|en)['"]/g) || []);
if (koSets.length === 0) ok('① 버튼에 data-ko/data-en 을 달지 않는다 (엔진이 아이콘을 문장으로 갈아끼우는 열쇠)');
else no(`① data-ko/data-en 을 다시 달았다 (${koSets.length}곳) — 🔊 자리에 «오프닝 소리 끄기» 가 들어앉는다`);

/* ── ② 옛 버전이 남긴 속성을 지우는가 ────────────────────────────────── */
if (/removeAttribute\(\s*['"]data-ko['"]\s*\)/.test(bare) && /removeAttribute\(\s*['"]data-en['"]\s*\)/.test(bare))
  ok('② 옛 버전이 달아 둔 data-ko/data-en 을 지운다 (캐시된 DOM 대비)');
else no('② 옛 속성을 안 지운다 — 옛 파일이 남은 화면에서는 그대로 재발한다');

/* ── ③ 설명은 -title / -aria 접미사로 다는가 ────────────────────────── */
const suffixed = ['data-ko-title', 'data-en-title', 'data-ko-aria', 'data-en-aria']
  .filter(a => new RegExp(`setAttribute\\(\\s*['"]${a}['"]`).test(bare));
if (suffixed.length === 4) ok('③ 설명·읽어주기는 -title/-aria 로 단다 (🌐 를 눌러도 따라온다)');
else no(`③ -title/-aria 가 ${suffixed.length}/4 뿐이다 — 언어를 바꾸면 설명이 한국어로 굳는다`);

/* ── ④ 버튼 글자는 아이콘 하나뿐인가 ────────────────────────────────── */
if (/textContent\s*=\s*off\s*\?\s*'🔇'\s*:\s*'🔊'/.test(bare))
  ok('④ 버튼 글자는 🔇/🔊 아이콘 하나다');
else no('④ 버튼 글자가 아이콘 하나가 아니다 — 동그라미 안에서 줄바꿈이 생긴다');

/* ── ⑤ 넘쳐도 화면으로 쏟아지지 않게 막아 두었는가 (안전망) ──────────── */
if (/overflow:hidden/.test(bare) && /white-space:nowrap/.test(bare))
  ok('⑤ 안전망 — 무엇이 들어와도 동그라미 밖으로 넘치지 않는다');
else no('⑤ overflow 안전망이 없다 — 다시 글자가 들어오면 화면으로 쏟아진다');

/* ── ⑥ 🔴 전제 확인 — 엔진은 여전히 data-ko 를 textContent 로 쓰는가 ──── */
//   전제가 바뀌면 위 검사들의 «이유» 가 사라진다. 그때는 이 하니스부터 다시 읽어야 한다.
const engineWrites = /querySelectorAll\(\s*'\[data-ko\], \[data-en\]'\s*\)/.test(i18n)
  && /el\.textContent\s*=\s*txt/.test(i18n);
const engineTitle = /\[data-ko-title\]/.test(i18n) && /\[data-ko-aria\]/.test(i18n);
if (engineWrites && engineTitle) ok('⑥ 전제 확인 — 엔진은 data-ko 로 textContent 를 갈고, -title/-aria 는 속성만 건드린다');
else no('⑥ i18n 엔진의 규칙이 바뀌었다 — 이 하니스의 전제가 무너졌으니 사람이 다시 읽어야 한다');

/* ── ⑦ index.html 인라인 엔진도 같은 규칙인가 (엔진이 둘이다) ────────── */
if (/querySelectorAll\('\[data-ko\],\[data-en\]'\)/.test(index) && /querySelectorAll\('\[data-ko-title\],\[data-en-title\]'\)/.test(index))
  ok('⑦ index.html 인라인 엔진도 같은 규칙이다 (한쪽만 피해선 안 되는 이유)');
else no('⑦ 인라인 엔진의 규칙이 바뀌었다 — 두 엔진이 어긋나면 화면마다 답이 달라진다');

console.log(`\n${fail === 0 ? '✅' : '🚨'} home_opening_btn_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

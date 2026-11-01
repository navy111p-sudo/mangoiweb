// 🖐 A.i 선생님 수업 — «선생님 화면 크게·작게» 자동 회귀 하니스 (2026-10-19)
// 문자열 «있는가» 만이 아니라, 페이지의 크기 조절 모듈(TW)을 오려 내 가짜 화면에서 «실제로 돌려» 답을 봅니다.
//   ① 손잡이 마크업 — 한/영 이름표, 키보드로 잡히는가(role=separator · tabindex)
//   ② CSS — 폰(≤760)에서는 손잡이가 숨고 폭 규칙도 안 걸리는가 · 하한/상한 숫자가 JS 와 짝인가
//   ③ 얼굴 보호 상한 — 60% 를 골라도 «오른쪽 칸 전체 가로÷세로 1.25» 까지만 넓어지는가
//   ④ 짝: 대답 보기가 떠 선생님 그림 칸이 낮아져도 폭이 «출렁이지 않는가»(그림 칸 높이로 재지 않는다)
//   ⑤ 짝: 상한에 안 닿는 값은 그대로 걸리는가 · null 이면 원래 배치로 돌아가는가 · 저장 키가 맞는가
//   ⑥ 폰(손잡이 숨김)에서 불러와도 이상한 값으로 바뀌지 않는가
//   ⑦ 키보드 조작이 수업 단축키(스페이스·화살표)로 새지 않는가 · 다시 재는 감시가 그림 칸이 아니라 교실 칸을 보는가
// 실패하면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PAGE = process.env.AI_CLASS_PAGE || path.join(HERE, '..', 'cloudflare-deploy', 'public', 'ai-class.html');
const html = fs.readFileSync(PAGE, 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
// 부정 검사용 — JS 주석(블록·줄)을 벗긴다. 문자열 안의 // (주소)는 건드리지 않게 따옴표를 따라간다.
function stripJs(t) {
  let o = '', i = 0, q = '';
  while (i < t.length) {
    const c = t[i], d = t[i + 1];
    if (q) { o += c; if (c === '\\') { o += d || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; o += c; i++; continue; }
    if (c === '/' && d === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && d === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    o += c; i++;
  }
  return o;
}

// ── ① 손잡이 마크업 ──────────────────────────────────────────────
const tag = (id) => { const m = html.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>')); return m ? m[0] : ''; };
const bar = tag('tSplitBar'), big = tag('tBig'), small = tag('tSmall'), split = tag('tSplit');
ok(!!split && !!bar && !!big && !!small, '① 손잡이·◀·▶ 요소가 있다');
ok(/role="separator"/.test(bar) && /tabindex="0"/.test(bar), '① 경계는 키보드로 잡히는 separator 다');
ok(/aria-label="[^"]*[가-힣][^"]*\/[^"]*[A-Za-z]/.test(big) && /aria-label="[^"]*[가-힣][^"]*\/[^"]*[A-Za-z]/.test(small), '① ◀·▶ 이름표가 한/영 병기다');
ok(/title="[^"]*[가-힣][^"]*\/[^"]*[A-Za-z]/.test(split), '① 손잡이 툴팁이 한/영 병기다');
ok(!/data-ko|data-en/.test(big + small), '① 아이콘 버튼에 data-ko/data-en 을 달지 않았다(본문을 갈아끼움)');

// ── ② CSS ───────────────────────────────────────────────────────
const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
const mediaAt = css.indexOf('@media (min-width:761px){\n  .stage{position:relative}');
const before = mediaAt > 0 ? css.slice(0, mediaAt) : '';
ok(mediaAt > 0, '② 손잡이 규칙이 761px 이상 미디어쿼리 안에 있다(전제)');
ok(/\.tsplit\{display:none\}/.test(before), '② 기본(폰)은 손잡이가 숨는다 — 미디어쿼리 «밖» 에 display:none');
const inMedia = mediaAt > 0 ? css.slice(mediaAt, mediaAt + 4000) : '';
const clampM = inMedia.match(/\.stage\.tw\{grid-template-columns:minmax\(0,1fr\) clamp\((\d+)px,var\(--tw\),calc\(100% - (\d+)px\)\)\}/);
ok(!!clampM, '② 폭 규칙(.stage.tw)이 미디어쿼리 안에만 있다');
ok(!/\.stage\.tw\{/.test(before), '② 폰 배치에는 폭 규칙이 안 걸린다(미디어쿼리 밖에 .stage.tw 없음)');
ok(/\[hidden\]|tip\.hidden/.test(html), '② 크기 표시(%)는 hidden 으로 감춘다(전제)');

// ── JS 모듈 오려 내기 ─────────────────────────────────────────────
const a = html.indexOf('var TW = (function(){');
const b = html.indexOf('window.__aiClassTeacherW = TW;');
const twSrc = a > 0 && b > a ? html.slice(a, b) : '';
const maxM = html.match(/var TW_SIDE_MAX = ([\d.]+);/);
ok(!!twSrc && !!maxM, '전제: 크기 조절 모듈(TW)과 상한 상수를 오려 냈다');
const tMin = (twSrc.match(/T_MIN = (\d+)/) || [])[1], bMin = (twSrc.match(/BOOK_MIN = (\d+)/) || [])[1];
ok(clampM && tMin === clampM[1] && bMin === clampM[2], `② JS 하한·교재 최소폭(${tMin}/${bMin})이 CSS clamp(${clampM && clampM[1]}/${clampM && clampM[2]})와 짝이다`);
const twCode = stripJs(twSrc);
ok(/\.observe\(stage\)/.test(twCode) && !/\.observe\(tile\)/.test(twCode), '⑦ 다시 재는 감시는 교실 칸(stage)을 본다 — 그림 칸(tile)을 보면 대답 보기마다 출렁임');
const applyBody = (twCode.match(/function apply\(f\)\{[\s\S]*?\n    \}/) || [''])[0];
ok(applyBody && /sideAspect\(\)/.test(applyBody) && !/tile\.offsetHeight/.test(applyBody), '④ 상한은 오른쪽 칸 전체로 잰다(apply 안에서 그림 칸 높이를 안 씀)');
ok(/e\.stopPropagation\(\)/.test(twCode) && /e\.preventDefault\(\)/.test(twCode), '⑦ 키보드 조작은 수업 단축키로 새지 않는다');
ok(/lsGet\(KEY\)/.test(twCode) && /lsSet\(KEY/.test(twCode) && /KEY = 'aiClassTeacherW'/.test(twCode), '⑤ 저장은 try/catch 헬퍼(lsGet/lsSet) + 키 aiClassTeacherW');
ok(!/localStorage\./.test(twCode), '⑤ localStorage 를 직접 만지지 않는다(시크릿 창에서 던짐)');

// ── 가짜 화면에서 실제로 돌리기 ──────────────────────────────────
function makeWorld(o) {
  const W = { stageW: o.stageW, sideH: o.sideH, tileH: o.tileH, shown: o.shown !== false, store: Object.assign({}, o.store || {}), ro: null };
  const cls = (set) => ({ add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) });
  // ⚠️ Object.assign 은 getter 를 «값» 으로 복사한다 — 크기가 안 바뀌는 가짜가 되어 검사가 헛돈다. 설명자째 옮긴다.
  const el = (extra) => Object.defineProperties({ attrs: {}, disabled: false, hidden: true, textContent: '', setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, setPointerCapture() {} }, Object.getOwnPropertyDescriptors(extra || {}));
  const stageCls = new Set();
  const stage = el({ style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }, classList: cls(stageCls), get offsetWidth() { return W.stageW; }, getBoundingClientRect() { return { right: W.stageW, width: W.stageW }; } });
  const sideW = () => {
    if (!stageCls.has('tw')) return Math.round(W.stageW * 0.31);
    const f = parseFloat(stage.style.props['--tw']) / 100;
    return Math.round(Math.min(Math.max(220, f * W.stageW), W.stageW - 320));
  };
  const side = el({ get offsetWidth() { return W.shown ? sideW() : 0; }, get offsetHeight() { return W.shown ? W.sideH : 0; } });
  const tile = el({ get offsetWidth() { return side.offsetWidth; }, get offsetHeight() { return W.tileH; } });
  const sp = el({ parentNode: stage, classList: cls(new Set()) });
  stage.querySelector = (s) => (s === '.side' ? side : null);
  const ids = { tSplit: sp, tTile: tile, tSplitBar: el(), tSplitTip: el(), tBig: el(), tSmall: el() };
  const $ = (id) => ids[id];
  const getComputedStyle = (e) => (e === sp ? { display: W.shown ? 'block' : 'none' } : { columnGap: '8px' });
  const window = { ResizeObserver: function (cb) { this.observe = (t) => { W.ro = { cb, target: t }; }; } };
  const lsGet = (k) => (k in W.store ? W.store[k] : null);
  const lsSet = (k, v) => { W.store[k] = v; };
  const fn = new Function('$', 'lsGet', 'lsSet', 'markHL', 'getComputedStyle', 'window', 'document', 'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'ResizeObserver',
    'var TW_SIDE_MAX = ' + maxM[1] + ';\n' + twSrc + '\nreturn TW;');
  const TW = fn($, lsGet, lsSet, () => {}, getComputedStyle, window, { body: { classList: cls(new Set()) } }, (f) => { f(); return 0; }, () => 0, () => {}, window.ResizeObserver);
  return { W, TW, stage, side, tile, ids };
}

let world;
try {
  // 1383x786 실측 모양: 교실 1158, 오른쪽 칸 높이 421, 대답 칸이 한 줄일 때 그림 칸 239
  world = makeWorld({ stageW: 1158, sideH: 421, tileH: 239 });
  const { TW, W } = world;
  ok(TW.get() === null, '⑤ 저장값이 없으면 원래 배치(null)로 시작한다');
  TW.set(0.6, true);
  const capF = Math.round((Number(maxM[1]) * 421 / 1158) * 1000) / 1000;
  ok(Math.abs(TW.get() - capF) <= 0.002, `③ 60% 를 골라도 상한까지만(${capF}) — 실제 ${TW.get()}`);
  ok(TW.capped() === true, '③ 상한에 닿으면 capped()=true(◀ 비활성·«최대» 표시의 근거)');
  ok(world.ids.tBig.disabled === true, '③ 상한이면 ◀(크게) 버튼이 비활성');
  ok(TW.sideAspect() <= Number(maxM[1]) + 0.005, '③ 오른쪽 칸 전체 가로÷세로가 상한 이하');
  ok(W.store.aiClassTeacherW === String(TW.get()), '⑤ 사람이 고른 값을 저장한다(실제로 걸린 값)');
  const fCap = TW.get();
  // ④ 대답 보기가 떠 그림 칸이 110px 로 눌림 → 다시 재도 폭이 같아야 한다
  W.tileH = 110; TW.refit();
  ok(TW.get() === fCap, `④ 그림 칸이 낮아져도(239→110) 폭이 그대로 — ${fCap} → ${TW.get()}`);
  W.tileH = 300; TW.refit();
  ok(TW.get() === fCap, '④ 그림 칸이 다시 커져도 폭이 그대로');
  // 감시가 등록됐고, 감시가 불러도 같은 값
  ok(W.ro && W.ro.target === world.stage, '⑦ 크기 감시가 교실 칸(stage)에 걸려 있다');
  if (W.ro) { W.tileH = 120; W.ro.cb(); ok(TW.get() === fCap, '④ 감시가 깨어나도 폭이 출렁이지 않는다'); }
  // ⑤ 상한에 안 닿는 값은 그대로
  TW.set(0.35, true);
  ok(Math.abs(TW.get() - 0.35) < 0.0015 && TW.capped() === false, '⑤ 상한에 안 닿는 값(35%)은 그대로 걸린다');
  // 최소
  TW.set(0.1, true);
  ok(TW.get() >= 0.2 - 0.0005 && world.ids.tSmall.disabled === true, '⑤ 너무 작은 값은 하한(20%)으로 · ▶ 비활성');
  // null = 원래대로
  TW.set(null, true);
  ok(TW.get() === null && !world.stage.classList.contains('tw') && W.store.aiClassTeacherW === '', '⑤ null 이면 원래 배치로 · 저장값 비움');
  // 창이 커지면 같은 want 로 다시 — 큰 창(1920 z1.2 실측 1390x562)은 상한이 더 넓다
  TW.set(0.6, true);
  W.stageW = 1390; W.sideH = 562; TW.refit();
  const capBig = Math.round((Number(maxM[1]) * 562 / 1390) * 1000) / 1000;
  ok(Math.abs(TW.get() - Math.min(capBig, TW.want())) <= 0.002, `③ 창이 바뀌면 같은 고른 값으로 다시 잰다(${TW.get()})`);
} catch (e) { ok(false, '가짜 화면에서 모듈 실행 실패: ' + (e && e.message)); }

// ⑥ 폰(손잡이 숨김)에서 불러오기 — 저장값이 이상한 값으로 바뀌지 않아야 한다
try {
  const ph = makeWorld({ stageW: 348, sideH: 0, tileH: 129, shown: false, store: { aiClassTeacherW: '0.4' } });
  ok(Math.abs(ph.TW.get() - 0.4) < 0.0015, `⑥ 폰에서 불러와도 고른 값(40%)을 그대로 기억한다 — ${ph.TW.get()}`);
  ph.W.shown = true; ph.W.stageW = 1158; ph.W.sideH = 421; ph.TW.refit();
  ok(Math.abs(ph.TW.get() - 0.4) < 0.0015, '⑥ PC 로 돌아오면 그 값이 걸린다');
} catch (e) { ok(false, '⑥ 폰 시나리오 실행 실패: ' + (e && e.message)); }

console.log(fails.map(f => '  ❌ ' + f).join('\n'));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

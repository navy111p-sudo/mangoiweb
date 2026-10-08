// tool_dock_close_harness.mjs — 교재도구·필기도구·칠판 도구 패널 «✕ 닫기» 버튼 (2026-10-08)
//
// 사장님 제보: 폰 세로에서 필기도구·교재도구 패널이 화면 가운데를 덮는데 닫을 길이 없었다.
// mango-tools-dock.js 의 ensureClose()·mangoCloseToolDock() 을 «가짜 DOM» 위에서 실제로 돌리고,
// 무작위 조작(열기·닫기·칠판 전환·도구바 재렌더·언어 전환·틱)을 수백 번 반복하며
// 매 조작 뒤 불변식을 검사한다.
//
// 불변식
//   ① 어느 패널에도 닫기 버튼은 «최대 하나» (틱·재렌더가 거듭돼도 쌓이지 않는다)
//   ② 열린 패널에는 닫기 버튼이 «반드시 하나» 있고 맨 앞 자식이다
//      (도구바가 방금 다시 그려졌어도 — 열 때 바로 넣는다. 1.2초 틱을 기다리지 않는다)
//   ③ 닫기 버튼을 누르면 세 패널이 모두 닫히고, 탭 전환(vcSwitchTab)은 일어나지 않는다
//   ④ 닫기 클릭이 바깥으로 전파되지 않는다(stopPropagation) — 패널 뒤 교재가 클릭을 받지 않게
//   ⑤ 버튼 글자는 만들 때의 언어를 따르고 data-ko/data-en 은 둘 다 있다
//   ⑥ 짝: 닫기 버튼이 없어도 «칩 토글로 열고 닫기» 는 예전 그대로 동작한다
//
// 변이시험: MUTANT_SRC=<고친 사본 경로> 로 다른 소스를 물릴 수 있다(저장소 파일을 고치지 않고).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC_PATH = process.env.MUTANT_SRC || new URL('../cloudflare-deploy/public/js/mango-tools-dock.js', import.meta.url);
const SRC = readFileSync(SRC_PATH, 'utf8');
const ITER = Number(process.env.ITER || 400);
const SEEDS = (process.env.SEEDS || '1,2,3,4,5').split(',').map(Number);

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, info) {
  if (cond) { pass++; return; }
  fail++;
  if (fails.length < 25) fails.push(name + (info ? ' — ' + info : ''));
}

// ── 가짜 DOM ────────────────────────────────────────────────
function mkEl(tag, rect) {
  const classes = new Set(), attrs = new Map(), props = new Map(), listeners = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(), children: [], parent: null,
    _text: '', type: '', id: '',
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get firstChild() { return this.children[0] || null; },
    classList: {
      contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x),
      toggle: (x, yes) => { const on = yes === undefined ? !classes.has(x) : !!yes; on ? classes.add(x) : classes.delete(x); return on; }
    },
    getAttribute: x => attrs.has(x) ? attrs.get(x) : null,
    setAttribute: (x, v) => attrs.set(x, String(v)),
    getBoundingClientRect: () => rect || { left: 10, top: 40, bottom: 70, right: 200 },
    style: { setProperty: (k, v) => props.set(k, v), getPropertyValue: k => props.get(k) || '', left: '', top: '', right: '' },
    addEventListener: (k, fn) => { (listeners[k] = listeners[k] || []).push(fn); },
    insertBefore(node, ref) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
      node.parent = this; return node;
    },
    appendChild(node) { return this.insertBefore(node, null); },
    querySelector(sel) {
      const m = /^:scope > \.([\w-]+)$/.exec(sel);
      if (m) return this.children.find(c => c.classList.contains(m[1])) || null;
      const m2 = /^\.([\w-]+)$/.exec(sel);
      if (m2) { const walk = n => { for (const c of n.children) { if (c.classList.contains(m2[1])) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); }
      throw new Error('unsupported selector in fake DOM: ' + sel);
    },
    click() {
      const ev = { _stopped: false, _prevented: false, stopPropagation() { this._stopped = true; }, preventDefault() { this._prevented = true; } };
      (listeners.click || []).forEach(fn => fn(ev));
      return ev;
    },
    _listeners: listeners,
  };
  return el;
}
function closeBtns(bar) { return bar.children.filter(c => c.classList.contains('mango-dock-close')); }

function makeWorld() {
  const materials = mkEl('div'), anno = mkEl('div'), wb = mkEl('div'), wbTab = mkEl('div'), pane = mkEl('div', { left: 0, top: 0, bottom: 800, right: 400 });
  // 원래 들어 있던 도구 버튼(닫기 버튼이 «맨 앞» 에 들어가는지 보려고)
  [materials, anno, wb].forEach((b, i) => { const x = mkEl('button'); x.textContent = 'tool' + i; b.appendChild(x); });
  const chips = { materials: mkEl('button'), write: mkEl('button') };
  const sel = { '#tab-pdf .pdf-controls': materials, '#tab-pdf .pdf-anno-bar': anno, '#tab-whiteboard .wb-toolbar': wb };
  for (const k of Object.keys(chips)) sel[`.mango-tool-chip[data-tool="${k}"]`] = chips[k];
  const W = { lang: 'ko', switches: 0, portrait: true, tick: null, listeners: {} };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia: () => ({ matches: W.portrait }),
    addEventListener: (k, fn) => { W.listeners[k] = fn; },
    getLang: () => W.lang,
  };
  const document = {
    readyState: 'complete',
    querySelector: s => sel[s] || null,
    getElementById: id => ({ 'tab-whiteboard': wbTab, 'vc-content-pane': pane })[id] || null,
    createElement: t => mkEl(t),
  };
  const ctx = {
    window, document,
    setInterval: fn => { W.tick = fn; },
    vcSwitchTab: t => { W.switches++; if (t === 'pdf') wbTab.classList.remove('active'); else if (t === 'whiteboard') wbTab.classList.add('active'); },
  };
  vm.runInNewContext(SRC, ctx);
  return { W, window, materials, anno, wb, wbTab, chips, bars: { materials, anno, wb } };
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// 지금 «열려 보이는» 패널들
function openBars(w) {
  const r = [];
  if (w.materials.getAttribute('data-mango-dock-open') === 'true') r.push(['materials', w.materials]);
  if (w.anno.getAttribute('data-mango-dock-open') === 'true') r.push(['anno', w.anno]);
  if (w.wb.classList.contains('mango-wb-dock-open')) r.push(['wb', w.wb]);
  return r;
}

// 열린 채로 도구바가 다시 그려진 패널 — 다음 틱(1.2초) 전까지는 버튼이 비어 있을 수 있다.
// (상주 MutationObserver 를 두지 않는 것은 의도 — CLAUDE.md 홈 정지 사고)
function invariants(w, tag, stale) {
  for (const [name, bar] of Object.entries(w.bars)) {
    const n = closeBtns(bar).length;
    ok(`① ${name} 닫기 버튼 최대 1개 (${tag})`, n <= 1, `실제 ${n}개`);
  }
  const op = openBars(w);
  ok(`열린 패널은 최대 1개 (${tag})`, op.length <= 1, op.map(x => x[0]).join(','));
  for (const [name, bar] of op) {
    if (stale && stale.has(bar)) continue;
    const btns = closeBtns(bar);
    ok(`② 열린 ${name} 에 닫기 버튼 있음 (${tag})`, btns.length === 1, `실제 ${btns.length}개`);
    ok(`② 열린 ${name} 의 닫기 버튼이 맨 앞 (${tag})`, bar.children[0] && bar.children[0].classList.contains('mango-dock-close'));
    const b = btns[0];
    if (b) {
      ok(`⑤ data-ko/data-en (${tag})`, b.getAttribute('data-ko') === '✕ 닫기 (Close)' && b.getAttribute('data-en') === '✕ Close (닫기)');
      ok(`⑤ type=button (${tag})`, b.type === 'button');
    }
  }
}

// ── 0. API 가 존재 ───────────────────────────────────────────
{
  const w = makeWorld();
  ok('mangoCloseToolDock 가 전역에 있다', typeof w.window.mangoCloseToolDock === 'function');
  ok('mangoToggleToolDock 가 전역에 있다', typeof w.window.mangoToggleToolDock === 'function');
  ok('처음엔 세 패널 모두 닫힘', openBars(w).length === 0);
  ok('처음 로드 때 세 패널 모두 닫기 버튼을 미리 넣음', ['materials', 'anno', 'wb'].every(k => closeBtns(w.bars[k]).length === 1));
}

// ── 1. 정해진 시나리오 (패널별로 열고 → 버튼으로 닫기) ──────────
for (const [which, onWb, barKey] of [['materials', false, 'materials'], ['write', false, 'anno'], ['write', true, 'wb']]) {
  for (const lang of ['ko', 'en']) {
    const w = makeWorld();
    w.W.lang = lang;
    if (onWb) w.wbTab.classList.add('active');
    // 재렌더: 도구바 내용이 통째로 바뀌어 닫기 버튼이 사라진 «직후» 에 연다(틱 없이)
    const bar = w.bars[barKey];
    bar.children.splice(0).forEach(c => c.parent = null);
    const t = mkEl('button'); t.textContent = 'tool'; bar.appendChild(t);
    w.window.mangoToggleToolDock(which);
    const tag = `${which}/${onWb ? 'wb' : 'pdf'}/${lang}`;
    ok(`열림 ${tag}`, openBars(w).some(x => x[1] === bar));
    invariants(w, tag);
    const btn = closeBtns(bar)[0];
    ok(`재렌더 직후 열어도 닫기 버튼이 바로 있음 ${tag}`, !!btn);
    if (!btn) continue;
    // 새로 만든 버튼이면 그 언어로 써져야 한다
    ok(`⑤ 글자가 언어를 따름 ${tag}`, btn.textContent === (lang === 'en' ? '✕ Close (닫기)' : '✕ 닫기 (Close)'), btn.textContent);
    const before = w.W.switches;
    const ev = btn.click();
    ok(`③ 닫힘 ${tag}`, openBars(w).length === 0, openBars(w).map(x => x[0]).join(','));
    ok(`③ 탭 전환 없음 ${tag}`, w.W.switches === before);
    ok(`④ stopPropagation ${tag}`, ev._stopped);
    ok(`④ preventDefault ${tag}`, ev._prevented);
    ok(`칩 aria-expanded=false ${tag}`, w.chips[which].getAttribute('aria-expanded') === 'false');
    ok(`칩 화살표 ▾ 로 돌아옴 ${tag}`, / ▾$/.test(w.chips[which].textContent), w.chips[which].textContent);
    // 다시 열면 또 닫힐 수 있다(한 번 쓰고 죽는 버튼 아님)
    w.window.mangoToggleToolDock(which);
    const btn2 = closeBtns(bar)[0];
    ok(`두 번째 열기에도 같은 버튼 1개 ${tag}`, !!btn2 && closeBtns(bar).length === 1);
    btn2 && btn2.click();
    ok(`두 번째 닫기 ${tag}`, openBars(w).length === 0);
  }
}

// ── 2. 짝: 칩 토글만으로도 예전처럼 닫힘(⑥) ───────────────────
{
  const w = makeWorld();
  w.window.mangoToggleToolDock('write'); ok('⑥ 칩으로 열림', openBars(w).length === 1);
  w.window.mangoToggleToolDock('write'); ok('⑥ 칩으로 닫힘', openBars(w).length === 0);
  w.window.mangoToggleToolDock('materials'); w.window.mangoToggleToolDock('write');
  ok('⑥ 하나 열면 다른 하나는 닫힘(상호 배타)', openBars(w).length === 1 && openBars(w)[0][0] === 'anno');
}

// ── 3. 무작위 조작 수백 번 × 여러 시드 ─────────────────────────
let totalOps = 0;
for (const seed of SEEDS) {
  const r = rng(seed);
  const w = makeWorld();
  const stale = new Set();
  for (let i = 0; i < ITER; i++) {
    const op = Math.floor(r() * 9);
    let name = '';
    if (op === 0) { name = 'toggle-materials'; stale.clear(); w.window.mangoToggleToolDock('materials'); }
    else if (op === 1) { name = 'toggle-write'; stale.clear(); w.window.mangoToggleToolDock('write'); }
    else if (op === 2) {
      name = 'click-close';
      const o = openBars(w);
      if (o.length) {
        const b = closeBtns(o[0][1])[0];
        const before = w.W.switches;
        if (b) {
          const ev = b.click();
          ok(`③ 무작위 닫기 (seed ${seed} #${i})`, openBars(w).length === 0);
          ok(`③ 무작위 닫기 탭전환 없음 (seed ${seed} #${i})`, w.W.switches === before);
          ok(`④ 무작위 닫기 전파 차단 (seed ${seed} #${i})`, ev._stopped);
        }
      } else {
        // 닫힌 상태에서 전역 닫기를 불러도 아무 일 없음(멱등)
        w.window.mangoCloseToolDock();
        ok(`닫힌 상태에서 닫기는 무해 (seed ${seed} #${i})`, openBars(w).length === 0);
      }
    }
    else if (op === 3) { name = 'to-whiteboard'; w.wbTab.classList.add('active'); }
    else if (op === 4) { name = 'to-pdf'; w.wbTab.classList.remove('active'); }
    else if (op === 5) {
      name = 'rerender';
      const keys = ['materials', 'anno', 'wb'];
      const bar = w.bars[keys[Math.floor(r() * 3)]];
      bar.children.splice(0).forEach(c => c.parent = null);
      const n = 1 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) bar.appendChild(mkEl('button'));
      stale.add(bar);
    }
    else if (op === 6) {
      name = 'tick'; w.W.tick && w.W.tick();
      // 틱 뒤에는 열린 패널에 반드시 버튼이 돌아와 있어야 한다
      for (const [n2, b2] of openBars(w)) ok(`② 재렌더 뒤 틱이 닫기 버튼을 되살림 ${n2} (seed ${seed} #${i})`, closeBtns(b2).length === 1);
      stale.clear();
    }
    else if (op === 7) { name = 'lang'; stale.clear(); w.W.lang = w.W.lang === 'en' ? 'ko' : 'en'; w.W.listeners['mangoi:lang-changed'] && w.W.listeners['mangoi:lang-changed'](); }
    else { name = 'resize'; w.W.portrait = !w.W.portrait; w.W.listeners.resize && w.W.listeners.resize(); }
    totalOps++;
    invariants(w, `seed ${seed} #${i} ${name}`, stale);
  }
}

// ── 4. 소스 계약(주석 벗긴 사본) ─────────────────────────────
{
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  ok('enforce 가 세 패널에 ensureClose', /function enforce\(\)\s*\{[\s\S]*?ensureClose\(pdfControls\(\)\)[\s\S]*?ensureClose\(pdfAnnoBar\(\)\)[\s\S]*?ensureClose\(wbToolbar\(\)\)/.test(code));
  ok('닫기 클릭은 mangoCloseToolDock 을 부른다', /addEventListener\('click'[\s\S]{0,200}?mangoCloseToolDock\(\)/.test(code));
  ok('mangoCloseToolDock 안에서 vcSwitchTab 을 부르지 않는다',
    (() => { const i = code.indexOf('window.mangoCloseToolDock = function'); if (i < 0) return false; const body = code.slice(i, code.indexOf('};', i)); return !/vcSwitchTab/.test(body); })());
}

// ── 5. CSS 계약 ─────────────────────────────────────────────
{
  const css = readFileSync(process.env.MUTANT_CSS || new URL('../cloudflare-deploy/public/css/mango-tools-dock.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
  const hide = blocks.find(b => /mango-dock-close/.test(b.sel) && /display:\s*none\s*!important/.test(b.body));
  const show = blocks.find(b => /mango-dock-close/.test(b.sel) && /position:\s*sticky/.test(b.body));
  ok('CSS: 닫힌 패널에서 숨기는 규칙이 있다', !!hide);
  ok('CSS: 보이는 규칙(sticky)이 있다', !!show);
  // 특이성: 숨김 규칙이 보이기 규칙을 이겨야 닫힌 패널에 버튼이 새지 않는다
  const spec = s => { const t = s.replace(/:not\(([^)]*)\)/g, ' $1 '); return [(t.match(/#[\w-]+/g) || []).length, (t.match(/\.[\w-]+|\[[^\]]+\]|:(?!not)[\w-]+/g) || []).length, (t.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length]; };
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (hide && show) {
    const hs = hide.sel.split(',').map(s => spec(s.trim()));
    const ss = show.sel.split(',').map(s => spec(s.trim()));
    const minHide = hs.reduce((a, b) => cmp(a, b) <= 0 ? a : b);
    const maxShow = ss.reduce((a, b) => cmp(a, b) >= 0 ? a : b);
    ok('CSS: 숨김 규칙 특이성 > 보이기 규칙', cmp(minHide, maxShow) > 0, `hide ${minHide} vs show ${maxShow}`);
    ok('CSS: 숨김이 세 패널을 모두 덮음', /pdf-controls/.test(hide.sel) && /pdf-anno-bar/.test(hide.sel) && /wb-toolbar/.test(hide.sel));
  }
}

console.log(`tool_dock_close_harness — 무작위 조작 ${totalOps}회 · 시드 ${SEEDS.length}개`);
fails.forEach(f => console.log('❌ FAIL ' + f));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

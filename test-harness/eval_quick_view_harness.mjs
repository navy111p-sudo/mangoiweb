// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📝 평가(수업일지) 전문 바로 보기 — 2026-09-30 신설

   [왜] 매니저 제보: 「오늘 수업」의 «지난 수업 평가 / 오늘 평가» 칸이 90자로 잘린 한 줄이라
        대체강사가 지난 수업 내용을 읽으려면 다른 화면을 찾아가야 했다.
        ⛔ eval.html(학부모용)로 보내는 것으로는 부족하다 — 그 화면은 강사 영어 메모(note_en)를 안 그린다.
   [무엇을]
     A. 공용 창 js/eval-quick-view.js 의 renderEval 을 **실제로 돌려** 본문·척도·탈출(XSS)을 본다
     B. mgEvalQuick 를 가짜 DOM·가짜 fetch 로 돌려 200/401/404/늦게 온 응답을 본다
     C. 세 화면(adm-today-classes.js·manager.html·teacher.html)의 «링크 만드는 식» 을 오려 내 돌리고
        짝으로 «숨김(지사·대리점)·id 없음이면 링크를 안 만든다» 를 본다
     D. 세 화면의 클릭 위임을 오려 내 **실제로 클릭을 쏴서** 창이 불리는지·처음엔 파일을 불러오는지 본다
        (짝: 다른 곳을 누르면 아무 일도 안 한다). manager·teacher 는 «첫 화면 외부 리소스 0개» 계약이라
        정적 <script src> 로 싣지 않는다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const VIEW = readFileSync(process.env.EVQ_SRC || join(PUB, 'js', 'eval-quick-view.js'), 'utf8');
const ADM = readFileSync(join(PUB, 'js', 'adm-today-classes.js'), 'utf8');
const MGR = readFileSync(join(PUB, 'manager.html'), 'utf8');
const TCH = readFileSync(join(PUB, 'teacher.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 중괄호 짝으로 자른다 — start 는 여는 «{» 이전 위치 */
function braceFrom(src, start) {
  const j = src.indexOf('{', start);
  if (j < 0) return '';
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  return '';
}

/* ── 가짜 DOM ─────────────────────────────────────────────── */
function fakeDom() {
  const byId = {};
  const listeners = [];
  const appended = [];
  function el(tag) {
    const e = {
      tagName: tag, attrs: {}, innerHTML: '', textContent: '', parentNode: null,
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') { this.id = String(v); } },
      getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
      addEventListener() {},
      removeChild(c) { if (c.id) delete byId[c.id]; },
    };
    Object.defineProperty(e, 'id', {
      get() { return this._id; },
      set(v) { this._id = v; },
      configurable: true,
    });
    return e;
  }
  const mount = (e) => { e.parentNode = { removeChild(c) { if (c.id) delete byId[c.id]; } }; if (e.id) byId[e.id] = e; appended.push(e); return e; };
  const document = {
    documentElement: { lang: 'en' },
    head: { appendChild: mount },
    body: { appendChild: mount },
    createElement: el,
    getElementById: (id) => byId[id] || null,
    addEventListener: (t, fn) => listeners.push({ t, fn }),
    removeEventListener: () => {},
  };
  return { document, listeners, appended, byId };
}

/* ── A. renderEval ─────────────────────────────────────────── */
console.log('\n[A] 창 본문(renderEval)을 실제로 돌린다');
const dA = fakeDom();
const winA = {};
vm.runInNewContext(VIEW, { window: winA, document: dA.document, fetch: () => new Promise(() => {}), setTimeout, console });
ok('A-0 전제: mgEvalQuick·_render 가 생긴다', typeof winA.mgEvalQuick === 'function' && typeof winA.mgEvalQuick._render === 'function');
const R = winA.mgEvalQuick && winA.mgEvalQuick._render;
if (R) {
  const row = {
    id: 42, student_name: '김선우', teacher_name: 'Krystel', lesson_date: '2026-09-29', score_overall: 4.5,
    lesson_title: 'BTS 3 Unit 2', note_en: 'Great vocabulary. Next: Unit 3 page 12.', note_ko: '어휘가 좋아요.',
    note_chips: 'vocab|speaking', next_goals: 'Unit 3', teacher_comment: '<script>alert(1)</script>',
  };
  const en = R(row, true), ko = R(row, false);
  ok('A-1 강사 영어 메모 «전문» 이 그려진다(잘리지 않음)', en.includes('Next: Unit 3 page 12.'));
  ok('A-2 학부모 안내(한국어)도 함께', en.includes('어휘가 좋아요.'));
  ok('A-3 수업·다음 목표', en.includes('BTS 3 Unit 2') && en.includes('>Unit 3<'));
  ok('A-4 태그가 칩으로', en.includes('<span>vocab</span>') && en.includes('<span>speaking</span>'));
  ok('A-5 1~5 척도는 /5', en.includes('⭐ 4.5/5'));
  ok('A-6 0~100 척도는 /100 (짝)', R({ id: 1, score_overall: 88, note_en: 'x' }, true).includes('⭐ 88/100'));
  ok('A-7 탈출 — 태그가 글자로 나간다', !en.includes('<script>') && en.includes('&lt;script&gt;'));
  ok('A-8 EN/KO 라벨이 갈린다', en.includes('Teacher note (English)') && ko.includes('강사 메모 (영어)') && !ko.includes('Teacher note'));
  ok('A-9 빈 칸은 안 그린다(짝)', !R({ id: 2, note_en: 'x' }, true).includes('Strengths'));
  const bare = R({ id: 3, score_overall: 3 }, true);
  ok('A-10 글이 없으면 «점수만» 이라고 말한다', bare.includes('Only the score was saved'));
  ok('A-11 학부모 화면 링크는 그 id 로', en.includes('/eval.html?id=42'));
  ok('A-12 «보기 전용» 이라고 말한다(수정 API 는 아직 없음)', en.includes('View only') && ko.includes('보기 전용'));
}

/* ── B. mgEvalQuick 흐름 ───────────────────────────────────── */
console.log('\n[B] mgEvalQuick 를 가짜 fetch 로 돌린다');
async function runFlow(plan) {
  const d = fakeDom();
  const win = {};
  const pend = [];
  const fetch = (url, opts) => new Promise((res) => pend.push({ url, opts, res }));
  vm.runInNewContext(VIEW, { window: win, document: d.document, fetch, setTimeout, console });
  return { d, win, pend };
}
const reply = (p, st, body) => p.res({ status: st, json: () => Promise.resolve(body) });
const tick = () => new Promise((r) => setTimeout(r, 5));
{
  const { d, win, pend } = await runFlow();
  win.mgEvalQuick(7, { en: true });
  const box = () => d.byId['mg-evq'];
  ok('B-1 누르자마자 «불러오는 중» 창이 뜬다', !!box() && box().innerHTML.includes('Loading'));
  ok('B-2 /api/eval/7 을 세션 쿠키로 부른다', pend[0] && pend[0].url === '/api/eval/7' && pend[0].opts && pend[0].opts.credentials === 'same-origin');
  reply(pend[0], 200, { ok: true, eval: { id: 7, note_en: 'Covered page 12' } });
  await tick();
  ok('B-3 200 이면 전문이 그려진다', box().innerHTML.includes('Covered page 12'));
}
{
  const { d, win, pend } = await runFlow();
  win.mgEvalQuick(7, { en: false });
  reply(pend[0], 401, { ok: false });
  await tick();
  ok('B-4 401 이면 «로그인이 끊겼다» 고 말한다', d.byId['mg-evq'].innerHTML.includes('로그인이 끊겼습니다'));
}
{
  const { d, win, pend } = await runFlow();
  win.mgEvalQuick(7, { en: true });
  reply(pend[0], 404, { ok: false });
  await tick();
  ok('B-5 404 면 «못 찾았다» 고 말한다', d.byId['mg-evq'].innerHTML.includes('not found'));
}
{
  const { d, win, pend } = await runFlow();
  win.mgEvalQuick(1, { en: true });
  win.mgEvalQuick(2, { en: true });
  reply(pend[1], 200, { ok: true, eval: { id: 2, note_en: 'SECOND' } });
  await tick();
  reply(pend[0], 200, { ok: true, eval: { id: 1, note_en: 'FIRST' } });
  await tick();
  ok('B-6 늦게 온 옛 응답이 새 창을 덮지 않는다', d.byId['mg-evq'].innerHTML.includes('SECOND') && !d.byId['mg-evq'].innerHTML.includes('FIRST'));
}
{
  const { d, win, pend } = await runFlow();
  win.mgEvalQuick('abc', { en: true });
  ok('B-7 숫자가 아닌 id 는 부르지 않는다', pend.length === 0 && !d.byId['mg-evq']);
}

/* ── C. 세 화면의 «링크 만드는 식» ─────────────────────────── */
console.log('\n[C] 세 화면의 링크 만드는 식을 오려 내 돌린다');
const BRIEF = { id: 55, date: '2026-09-22', score: 5, max: 5, text: 'The student has a good range…' };
// C-1 관리자
{
  const src = braceFrom(ADM, ADM.indexOf('function xEval('));
  ok('C-0 전제: xEval 을 오려 냈다', src.length > 100);
  let fn = null;
  try {
    fn = new Function('esc', 'T', 'xDash', 'xSmall', src + '; return xEval;')(
      esc, (ko, en) => en, () => '—', (t) => '<small>' + t + '</small>');
  } catch (e) { ok('C-0b xEval 을 만들 수 있다', false, e.message); }
  if (fn) {
    const h = fn(BRIEF, false);
    ok('C-1 관리자: id 가 있으면 누를 수 있는 링크(data-evq=55)', /data-evq="55"/.test(h) && h.includes('/eval.html?id=55'));
    ok('C-2 관리자: <button> 이 아니다(전역 button 규칙 회피)', !/<button/.test(h));
    ok('C-3 관리자: 숨김(지사·대리점)이면 링크 없음(짝)', !/data-evq/.test(fn(BRIEF, true)) && fn(BRIEF, true).includes('HQ only'));
    ok('C-4 관리자: id 가 없으면 링크 없음(짝)', !/data-evq/.test(fn({ date: 'x', text: 'y' }, false)));
    ok('C-5 관리자: 요약 글자는 그대로 보인다', h.includes('The student has a good range'));
  }
}
// C-2 매니저
{
  const i = MGR.indexOf('var ev = function (e) { if (r.eval_hidden)');
  const j = MGR.indexOf("'—'; };", i);
  const src = i >= 0 && j > i ? MGR.slice(i, j + "'—'; };".length) : '';
  ok('C-6 전제: 매니저 ev 식을 오려 냈다', src.length > 100);
  let mk = null;
  try { mk = new Function('esc', 'T', 'r', src + '; return ev;'); } catch (e) { ok('C-6b 매니저 ev 를 만들 수 있다', false, e.message); }
  if (mk) {
    const T = (en) => en;
    const h = mk(esc, T, { eval_hidden: false })(BRIEF);
    ok('C-7 매니저: 링크가 붙는다', /data-evq="55"/.test(h));
    ok('C-8 매니저: 숨김이면 «HQ only» 만(짝)', mk(esc, T, { eval_hidden: true })(BRIEF) === 'HQ only');
    ok('C-9 매니저: 평가가 없으면 «—»(짝)', mk(esc, T, { eval_hidden: false })(null) === '—');
  }
}
// C-3 강사
{
  const i = TCH.indexOf('var evOpen = function (e) {');
  const src = i >= 0 ? braceFrom(TCH, i) + ';' : '';
  ok('C-10 전제: 강사 evOpen 을 오려 냈다', src.length > 50);
  let f = null;
  try { f = new Function('esc', 'T', src + ' return evOpen;')(esc, (en) => en); } catch (e) { ok('C-10b evOpen 을 만들 수 있다', false, e.message); }
  if (f) {
    ok('C-11 강사: 링크가 붙는다', /data-evq="55"/.test(f(BRIEF)));
    ok('C-12 강사: 평가가 없으면 빈 문자열(짝)', f(null) === '' && f({ text: 'x' }) === '');
  }
  ok('C-13 강사: 지난·오늘 평가 두 줄 모두에 붙였다',
    /esc\(ev\(c\.last_eval\)\)\s*\+\s*evOpen\(c\.last_eval\)/.test(TCH) && /esc\(ev\(c\.today_eval\)\)\s*\+\s*evOpen\(c\.today_eval\)/.test(TCH));
}

/* ── D. 클릭 위임 ──────────────────────────────────────────── */
console.log('\n[D] 세 화면의 클릭 위임에 실제로 클릭을 쏜다');
function delegSrc(src, label) {
  // «[data-evq]» 를 찾는 위임 리스너를 품은 IIFE/함수 묶음 — evqOpen·open 정의 + addEventListener
  const k = src.indexOf("closest('[data-evq]')");
  if (k < 0) return '';
  // 그 앞의 가장 가까운 «(function(» 또는 «function evqOpen(» 부터
  let s = src.lastIndexOf('function evqOpen(', k);
  if (s < 0) s = src.lastIndexOf('(function(){', k);
  const end = src.indexOf('});', k);
  return s >= 0 && end > k ? src.slice(s, end + 3) : '';
}
const VER = {};
for (const [label, src, isAdm] of [['관리자', ADM, true], ['매니저', MGR, false], ['강사', TCH, false]]) {
  const body = delegSrc(src, label);
  ok('D-0 ' + label + ' 전제: 위임 코드를 오려 냈다', body.length > 100);
  const v = (body.match(/eval-quick-view\.js\?v=(\d+)/) || [])[1];
  VER[label] = v;
  const d = fakeDom();
  const calls = [];
  const win = {};
  const ctx = { window: win, document: d.document, alert: () => {}, console, localStorage: { getItem: () => null } };
  let code = body;
  if (isAdm) code = 'function isEn(){ return true; } function T(ko,en){ return en; }\n' + body;
  else code = body.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);?\s*$/, '');
  try { vm.runInNewContext(code, ctx); } catch (e) { ok('D-0b ' + label + ' 위임 코드를 실행할 수 있다', false, e.message); continue; }
  const click = d.listeners.find((x) => x.t === 'click');
  ok('D-1 ' + label + ': document 에 click 위임이 걸린다', !!click);
  if (!click) continue;
  const mkEv = (target) => { const ev = { target, prevented: false, preventDefault() { this.prevented = true; } }; return ev; };
  const link = { getAttribute: (k) => (k === 'data-evq' ? '55' : null) };
  const inside = { closest: (sel) => (sel === '[data-evq]' ? link : null) };
  const outside = { closest: () => null };
  // 처음: 아직 창이 없으면 파일을 불러온다
  const e1 = mkEv(inside);
  try { click.fn(e1); } catch (e) { ok('D-2 ' + label + ' 클릭이 던지지 않는다', false, e.message); continue; }
  const sc = d.appended.find((x) => x.tagName === 'script');
  ok('D-2 ' + label + ': 처음 누르면 공용 파일을 불러온다', !!sc && /\/js\/eval-quick-view\.js\?v=\d+/.test(String(sc.src)));
  ok('D-3 ' + label + ': 링크 기본동작(새 탭)을 막는다', e1.prevented === true);
  win.mgEvalQuick = (id, o) => calls.push({ id, o });
  if (sc && sc.onload) sc.onload();
  ok('D-4 ' + label + ': 불러온 뒤 그 id 로 창을 연다', calls.length === 1 && String(calls[0].id) === '55');
  ok('D-5 ' + label + ': 언어를 넘긴다(en)', calls[0] && calls[0].o && calls[0].o.en === true);
  // 두 번째: 이미 있으면 바로
  click.fn(mkEv(inside));
  ok('D-6 ' + label + ': 두 번째부터는 다시 불러오지 않는다', calls.length === 2 && d.appended.filter((x) => x.tagName === 'script').length === 1);
  // 짝: 다른 곳 클릭
  const e3 = mkEv(outside);
  click.fn(e3);
  ok('D-7 ' + label + ': 다른 곳을 누르면 아무 일도 안 한다(짝)', calls.length === 2 && e3.prevented === false);
  if (!isAdm) {
    d.document.documentElement.lang = 'ko';
    click.fn(mkEv(inside));
    ok('D-8 ' + label + ': 한국어 화면이면 en:false(짝)', calls[2] && calls[2].o.en === false);
  }
}
ok('D-9 세 화면이 같은 ?v= 로 부른다', VER['관리자'] && VER['관리자'] === VER['매니저'] && VER['매니저'] === VER['강사'], JSON.stringify(VER));
ok('D-10 manager·teacher 는 정적 <script src> 로 싣지 않는다(외부 리소스 0개 계약)',
  !/<script[^>]+src="\/js\/eval-quick-view/.test(MGR) && !/<script[^>]+src="\/js\/eval-quick-view/.test(TCH));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);

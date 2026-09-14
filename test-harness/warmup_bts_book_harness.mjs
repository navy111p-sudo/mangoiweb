#!/usr/bin/env node
/**
 * warmup_bts_book_harness.mjs — 웜업 «오늘 배울 교재(BTS)» 회귀 감시
 *
 * [왜 생겼나] 2026-09-14 사장님 지시 «BTS부터 해줘. 강사가 참여하지 않아도 모든 것이
 *   작동하게. 지금 하고 있는 자유대화는 그대로 나두고.»
 *   학생 명부의 배정 교재가 «29,498명 중 0건»(D1 실측)이라 교재 축이 통째로 비어 있었고,
 *   그래서 학생이 직접 고르고 화면이 기억하는 방식으로 넣었습니다.
 *
 * ⚠️ 문자열로만 검사하면 이 기능은 «표도 함수도 다 있는데 답만 틀린» 사고를 못 잡습니다.
 *   그래서 표와 판정 함수를 warmup.html 에서 **오려 내 실제로 돌립니다.**
 * ⛔ 기대값을 이 파일에 손으로 적지 마세요 — 밴드 구간은 LEVEL_CATALOG 를,
 *   권 목록은 BTS_BOOKS 를 «읽어» 옵니다. 베껴 적으면 자기가 적은 상수를 검사하게 됩니다.
 * ⚠️ 화면에 «실제로 그려지는가»(보인다·눌린다)는 원리상 여기서 못 봅니다 —
 *   그쪽은 test-harness/manual/warmup-bts-book-browser.mjs 가 브라우저로 잽니다.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'cloudflare-deploy/public/warmup.html');
const P = [], F = [];
const ok = (n) => P.push(n);
const no = (n, got) => F.push(n + (got === undefined ? '' : `  →  ${JSON.stringify(got)}`));
const t = (n, c, got) => (c ? ok(n) : no(n, got));

if (!existsSync(FILE)) { console.error('❌ warmup.html 없음'); process.exit(1); }
const S = readFileSync(FILE, 'utf8');

/** 주석을 벗겨 낸 사본 — 부정 검사가 «자기 주석» 을 잡지 않게 (CLAUDE.md 2장). */
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) { if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i]; if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
/** 여는 괄호부터 짝이 맞는 닫는 괄호까지 (문자열 안은 건너뜀). */
function matchFrom(src, start, open, close) {
  let d = 0, i = src.indexOf(open, start);
  if (i < 0) return null;
  const from = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) break; i++; }
      continue;
    }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return src.slice(from, i + 1); }
  }
  return null;
}
const cut = (name, open, close) => {
  const i = S.indexOf(name);
  return i < 0 ? null : matchFrom(S, i, open, close);
};

// ── ⓪ 전제: 표와 함수를 실제로 오려 냈는가 ────────────────────────
const btsSrc = cut('var BTS_BOOKS = [', '[', ']');
const lvlSrc = cut('var LEVEL_CATALOG = [', '[', ']');
const bandSrc = (() => {
  const i = S.indexOf('function btsBandOf(');
  return i < 0 ? null : S.slice(i, i + (matchFrom(S, i, '{', '}') || '').length + (S.indexOf('{', i) - i));
})();
t('⓪ BTS_BOOKS 를 오려 냈다', !!btsSrc);
t('⓪ LEVEL_CATALOG 를 오려 냈다', !!lvlSrc);
t('⓪ btsBandOf 를 오려 냈다', !!bandSrc && bandSrc.includes('LEVEL_CATALOG'));

let BOOKS = null, CAT = null, bandOf = null;
try {
  BOOKS = new Function('return ' + btsSrc)();
  CAT = new Function('return ' + lvlSrc)();
  bandOf = new Function('LEVEL_CATALOG', bandSrc + '; return btsBandOf;')(CAT);
} catch (e) { no('⓪ 평가 실패', String(e && e.message)); }

if (BOOKS && CAT && bandOf) {
  // ── ① 표 자체 ──────────────────────────────────────────────────
  t('① 권이 하나 이상', BOOKS.length > 0, BOOKS && BOOKS.length);
  const vols = BOOKS.map(b => b.v);
  t('① 권 번호 중복 없음', new Set(vols).size === vols.length,
    vols.filter((v, i) => vols.indexOf(v) !== i));
  t('① 권 번호가 전부 1 이상의 정수', vols.every(v => Number.isInteger(v) && v >= 1),
    vols.filter(v => !(Number.isInteger(v) && v >= 1)));
  t('① 모든 권에 영어 주제', BOOKS.every(b => typeof b.en === 'string' && b.en.trim()),
    BOOKS.filter(b => !(b.en || '').trim()).map(b => b.v));
  t('① 모든 권에 한국어 안내', BOOKS.every(b => typeof b.ko === 'string' && b.ko.trim()),
    BOOKS.filter(b => !(b.ko || '').trim()).map(b => b.v));
  /* ⚠️ 영어 주제가 AI 에게 가는 값입니다 — 한글이 섞이면 영어 프롬프트에 한국어가 샙니다. */
  t('① 영어 주제에 한글이 없다', BOOKS.every(b => !/[가-힣]/.test(b.en)),
    BOOKS.filter(b => /[가-힣]/.test(b.en)).map(b => b.v));

  // ── ② 밴드 매핑을 «실제로 돌려» LEVEL_CATALOG 와 대조 ──────────
  const bad = [];
  for (const b of BOOKS) {
    const band = bandOf(b.v);
    const c = CAT[band - 1];
    if (!c) { bad.push(`${b.v}:밴드없음(${band})`); continue; }
    const m = String(c.lv || '').match(/(\d+)\s*[-~]\s*(\d+)/);
    if (!m || b.v < +m[1] || b.v > +m[2]) bad.push(`${b.v}→밴드${band}(${c.lv})`);
  }
  t('② 모든 권이 LEVEL_CATALOG 구간과 일치', bad.length === 0, bad);
  t('② 모르는 권은 0(«모르면 손대지 않는다»)', bandOf(0) === 0 && bandOf(999) === 0 && bandOf('x') === 0,
    [bandOf(0), bandOf(999), bandOf('x')]);
  /* 짝 검사 — «전부 0» 으로 만들어도 위 ②가 통과하지 않게. */
  t('② 실제 권은 1~8 밴드를 돌려준다', BOOKS.every(b => bandOf(b.v) >= 1 && bandOf(b.v) <= 8),
    BOOKS.filter(b => !(bandOf(b.v) >= 1 && bandOf(b.v) <= 8)).map(b => b.v));

  // ── ③ 자유 대화가 그대로인가 (사장님 지시) ─────────────────────
  const C = strip(S);
  t('③ 교재를 풀면 textbook 을 비운다',
    /function clearBtsBook\([\s\S]{0,400}?WCTX\.textbook\s*=\s*''/.test(C));
  t('③ 교재를 풀면 주제를 «원래 URL 값» 으로 되돌린다',
    /function clearBtsBook\([\s\S]{0,400}?LESSON_TOPIC\s*=\s*LESSON_TOPIC_URL/.test(C));
  t('③ 교재를 풀면 저장값을 지운다',
    /function clearBtsBook\([\s\S]{0,400}?removeItem\(BTS_KEY\)/.test(C));
  /* ⛔ 되돌릴 때 대화 단계까지 되돌리면 «내가 고른 수준» 이 사라집니다. */
  const clearBody = (() => { const i = C.indexOf('function clearBtsBook('); return i < 0 ? '' : (matchFrom(C, i, '{', '}') || ''); })();
  t('③ 되돌리기가 대화 단계를 건드리지 않는다', !!clearBody && !/setLevel\s*\(/.test(clearBody));

  // ── ④ 강사 없이 이어지는가 ─────────────────────────────────────
  const restore = (() => { const i = C.indexOf('function restoreBtsBook('); return i < 0 ? '' : (matchFrom(C, i, '{', '}') || ''); })();
  t('④ 저장값 복원 절이 있다', !!restore && restore.includes('applyBtsBook'));
  t('④ ?textbook= 이 있으면 복원이 양보한다', /if\s*\(\s*WCTX\.textbook\s*\)\s*return/.test(restore), restore.slice(0, 120));
  /* ⛔ 복원이 단계를 덮으면 학생이 직접 올린 수준이 매번 되돌아갑니다. */
  t('④ 복원은 단계를 덮지 않는다(syncBand=false)',
    /applyBtsBook\s*\(\s*v\s*,\s*false\s*,\s*false\s*\)/.test(restore), restore);

  // ── ⑤ 서버는 안 고쳤는가 (이 변경의 전제) ──────────────────────
  const idx = join(ROOT, 'cloudflare-deploy/src/index.ts');
  if (existsSync(idx)) {
    const I = readFileSync(idx, 'utf8');
    t('⑤ 서버가 쓰는 통로(lesson_topic)가 그대로 살아 있다', I.includes('오늘의 대화 주제는'));
    t('⑤ 서버가 교재 통로(textbook)를 그대로 읽는다', I.includes('[오늘 수업 정보]'));
    t('⑤ 서버에 BTS 목록을 복제하지 않았다', !/BTS_BOOKS/.test(I));
  }
}

// ════════════════════════════════════════════════════════════════════
//  ⑥ 📖 «오늘 배울 과» — 교재의 진짜 문장을 붙이는 길 (2026-09-15)
//  ⚠️ 문자열로는 못 봅니다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 이름을 보내는가»
//     뿐입니다. 그래서 절을 오려 내 가짜 fetch 로 «실제로 돌려» 답을 봅니다.
//  ⛔ 기대 이름(«BTS 1 001 (…)»)을 정답으로 못 박지 마세요 — 그것은 D1 의 값이고
//     교재가 늘면 바뀝니다. 여기서는 «서버가 준 key 를 그대로 쓰는가» 만 봅니다.
// ════════════════════════════════════════════════════════════════════
const lsnSrc = (() => {
  const i = S.indexOf('var BTS_LSN_KEY');
  const j = S.indexOf('function btsRenderLessonRow(');
  if (i < 0 || j < 0 || j < i) return null;
  const body = matchFrom(S, j, '{', '}');
  return body ? S.slice(i, S.indexOf('{', j) + body.length) : null;
})();
t('⑥ 과 모듈을 오려 냈다', !!lsnSrc && lsnSrc.includes('btsLoadLessons'));

async function lessonSection() {
  if (!lsnSrc) return;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  /** 가짜 화면 한 벌을 만든다. reply(url) 가 그 주소의 응답을 정한다. */
  function mk(reply, bookOf) {
    const store = new Map();
    const calls = [];
    const LS = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    const doc = { getElementById: () => null };
    /* reply 가 Promise 를 돌려주면 «늦게 오는» 응답이 된다(경합 시험용). */
    const fake = (url) => {
      calls.push(url);
      const r = reply(url);
      return Promise.resolve({ json: () => (r && typeof r.then === 'function' ? r : Promise.resolve(r)) });
    };
    const f = new Function('btsBookOf', 'document', 'localStorage', 'fetch', 'isZh', 'updateTopicChip',
      `var WCTX = {}; var LESSON_TOPIC = '';  var _btsVol = 0;
       ${lsnSrc}
       return {
         wctx: function(){ return WCTX; },
         topic: function(){ return LESSON_TOPIC; },
         setVol: function(v){ _btsVol = v; },
         load: btsLoadLessons, pick: btsPickLesson, match: btsCourseMatch,
         lessons: function(){ return _btsLessons; },
         key: function(){ return _btsLessonKey; },
         setLessons: function(a){ _btsLessons = a; }
       };`);
    const api = f(bookOf, doc, LS, fake, () => false, () => {});
    return { api, calls, store };
  }
  const BOOK = (v) => (BOOKS ? BOOKS.find((b) => b.v === Number(v)) || null : null);

  // ── ⑥-1 코스 이름 고르기 ──────────────────────────────────────────
  // 서버 parseEn 은 이름 모양에 따라 코스명을 다르게 만든다(실측 두 모양을 그대로 넣는다).
  const COURSES = [{ course: 'BTS 1' }, { course: 'BTS 2 Korea (Shapes and colors)' },
                   { course: 'BTS 12 Korea (Jobs, Going to work)' }, { course: '다락원' }];
  {
    const { api } = mk(() => ({ ok: true }), BOOK);
    t('⑥ 권 1 → «BTS 1»', api.match(COURSES, 1) === 'BTS 1', api.match(COURSES, 1));
    t('⑥ 권 2 → 이름 전체가 코스인 모양도 찾는다',
      api.match(COURSES, 2) === 'BTS 2 Korea (Shapes and colors)', api.match(COURSES, 2));
    t('⑥ 권 12 → «BTS 12 …»', api.match(COURSES, 12).startsWith('BTS 12'), api.match(COURSES, 12));
    /* ⛔ 뒤가 숫자면 다른 권 — 여기서 새면 남의 교재 문장을 보냅니다. */
    t('⑥ 권 1 이 «BTS 12» 를 물지 않는다', api.match([{ course: 'BTS 12 Korea (x)' }], 1) === '',
      api.match([{ course: 'BTS 12 Korea (x)' }], 1));
    t('⑥ 권 1 이 «BTS 10» 를 물지 않는다', api.match([{ course: 'BTS 10 (x)' }], 1) === '');
    t('⑥ 없는 권은 빈 값', api.match(COURSES, 7) === '', api.match(COURSES, 7));
  }

  // ── ⑥-2 받아 오면 «그 key» 를 보낸다 / 못 받으면 옛 값 그대로 (짝) ──
  const L1 = { seq: 1, title: 'Welcome to school', key: 'BTS 1 001 (Welcome to school)',
               sentences: [{ en: 'Hello, I am a student.' }, { en: 'I like school.' }] };
  const L2 = { seq: 2, title: 'School Stuff', key: 'BTS 1 002 (School Stuff)', sentences: [{ en: 'I have a pencil' }] };
  {
    const { api, calls } = mk(() => ({ ok: true, lessons: [L1, L2], courses: COURSES }), BOOK);
    api.setVol(1); api.load(1);
    await tick(); await tick();
    t('⑥ 받아 오면 WCTX.textbook 이 «D1 교재 이름» 이 된다', api.wctx().textbook === L1.key, api.wctx().textbook);
    t('⑥ 과 제목이 주제가 된다(권 주제보다 좁다)', api.topic() === 'Welcome to school', api.topic());
    t('⑥ 한 번만 물어본다(코스를 맞혔을 때)', calls.length === 1, calls);
  }
  {
    /* ⛔ 이 갈래가 깨지면 «고치기 전» 보다 나빠집니다 — 반드시 옛 값이어야 합니다.
       ⚠️ pick() 을 직접 부르지 말고 «진짜 경로»(load)로 확인합니다 — 그래야 «ok:false 인데
          lessons 가 실려 온 응답을 그대로 쓰는» 회귀까지 잡힙니다. */
    const { api } = mk(() => ({ ok: false, lessons: [L1] }), BOOK);
    api.setVol(3); api.load(3);
    await tick(); await tick();
    const b3 = BOOK(3);
    t('⑥ 못 받으면 권 이름 그대로 보낸다(옛 동작)',
      !!b3 && api.wctx().textbook === ('BTS 3 (' + b3.en + ')'), api.wctx().textbook);
    t('⑥ 못 받으면 주제도 권 주제 그대로', !!b3 && api.topic() === b3.en, api.topic());
  }
  {
    /* 코스를 못 맞히면 응답의 courses 로 다시 찾아 한 번 더 물어본다. */
    const { api, calls } = mk((u) => (u.includes('BTS%202%20Korea')
      ? { ok: true, lessons: [{ seq: 0, title: '', key: 'BTS 2 Korea (Shapes and colors)', sentences: [{ en: 'It is red.' }] }] }
      : { ok: true, lessons: [], courses: COURSES }), BOOK);
    api.setVol(2); api.load(2);
    await tick(); await tick(); await tick();
    t('⑥ 코스 이름이 다르면 목록에서 찾아 다시 물어본다', calls.length === 2, calls);
    t('⑥ 그때도 key 를 그대로 쓴다', api.wctx().textbook === 'BTS 2 Korea (Shapes and colors)', api.wctx().textbook);
    const b2 = BOOK(2);
    t('⑥ 과 제목이 없으면 권 주제를 쓴다', !!b2 && api.topic() === b2.en, api.topic());
  }

  // ── ⑥-3 자유 대화·엉뚱한 값에 손대지 않는가 ────────────────────────
  {
    const { api } = mk(() => ({ ok: true, lessons: [L1] }), BOOK);
    api.setVol(0); api.setLessons([L1]); api.pick(L1.key, true);
    t('⑥ 교재를 안 골랐으면 textbook 을 만들지 않는다', !api.wctx().textbook, api.wctx().textbook);
  }
  {
    /* ⛔ 목록에 없는 키를 쓰면 서버가 못 찾는데 화면은 «문장 N개» 라고 말합니다(거짓말). */
    const { api } = mk(() => ({ ok: true }), BOOK);
    api.setVol(1); api.setLessons([L1, L2]); api.pick('BTS 9 999 (없는 과)', false);
    t('⑥ 목록에 없는 키는 쓰지 않는다(첫 과로)', api.key() === L1.key, api.key());
  }
  {
    /* 늦게 온 응답이 새 선택을 덮으면 «권을 바꿨는데 옛 권 문장» 이 됩니다.
       ⚠️ 응답을 같은 값으로 두면 이 검사가 헛돕니다 — 권마다 «다른» 과를 주고,
          ①을 «일부러 늦게» 오게 해서 순서가 뒤바뀐 상황을 실제로 만듭니다. */
    const L5 = { seq: 1, title: '', key: 'BTS 5 001 (later)', sentences: [{ en: 'Hi.' }] };
    const slow = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
    const { api } = mk((u) => (u.includes('BTS%201')
      ? slow(25, { ok: true, lessons: [L1] })
      : { ok: true, lessons: [L5] }), BOOK);
    api.setVol(1); api.load(1);        // ① 요청 — 늦게 온다
    api.setVol(5); api.load(5);        // ② 요청 — 먼저 온다. ①의 응답은 버려져야 한다
    await new Promise((r) => setTimeout(r, 60));
    t('⑥ 늦게 온 ①의 응답은 버린다', api.wctx().textbook === L5.key, api.wctx().textbook);
    t('⑥ 그 사이 ②는 제대로 붙는다(짝)', api.key() === L5.key, api.key());
  }

  // ── ⑥-4 «사람이 고른 것» 만 저장한다 (짝) ─────────────────────────
  {
    /* ⚠️ «진짜 경로»(받아 와서 자동으로 첫 과를 쓰는 길)로 확인합니다 —
          pick(…, false) 를 직접 부르면 부르는 쪽이 true 로 바뀌는 회귀를 못 봅니다. */
    const { api, store } = mk(() => ({ ok: true, lessons: [L1, L2] }), BOOK);
    api.setVol(1); api.load(1);
    await tick(); await tick();
    t('⑥ 자동으로 고른 과는 저장하지 않는다', store.size === 0, [...store.entries()]);
  }
  {
    /* ⚠️ 권 번호를 «3» 으로 두는 이유 — 1 로 두면 저장 코드가 권을 안 붙이고 «1|» 을
          박아 넣어도 통과합니다(그러면 다른 권에서 남의 과가 되살아납니다). */
    const { api, store } = mk(() => ({ ok: true }), BOOK);
    api.setVol(3); api.setLessons([L1, L2]);
    api.pick(L2.key, true);
    t('⑥ 사람이 고른 과는 «그 권|키» 로 저장한다',
      store.get('mangoi_warmup_bts_lesson') === '3|' + L2.key, store.get('mangoi_warmup_bts_lesson'));
  }
  {
    const { api, store } = mk(() => ({ ok: true, lessons: [L1, L2] }), BOOK);
    store.set('mangoi_warmup_bts_lesson', '1|' + L2.key);
    api.setVol(1); api.load(1);
    await tick(); await tick();
    t('⑥ 같은 권이면 지난번 과를 이어서 쓴다', api.key() === L2.key, api.key());
  }
  {
    const { api, store } = mk(() => ({ ok: true, lessons: [L1, L2] }), BOOK);
    store.set('mangoi_warmup_bts_lesson', '7|' + L2.key);   // 다른 권의 저장값
    api.setVol(1); api.load(1);
    await tick(); await tick();
    t('⑥ 다른 권의 저장값은 쓰지 않는다', api.key() === L1.key, api.key());
  }
}
await lessonSection();

// ── ⑦ 배선 — 화면이 실제로 그 길을 타는가 ──────────────────────────
{
  const C2 = strip(S);
  const applyBody = (() => { const i = C2.indexOf('function applyBtsBook('); return i < 0 ? '' : (matchFrom(C2, i, '{', '}') || ''); })();
  t('⑦ 권을 고르면 과 목록을 받아 온다', /btsLoadLessons\s*\(/.test(applyBody), applyBody.slice(0, 80));
  t('⑦ 권이 바뀌면 옛 과를 버린다', /_btsLessonKey\s*=\s*''/.test(applyBody));
  const clearBody2 = (() => { const i = C2.indexOf('function clearBtsBook('); return i < 0 ? '' : (matchFrom(C2, i, '{', '}') || ''); })();
  t('⑦ 자유 대화로 되돌리면 과 저장값도 지운다', /removeItem\(BTS_LSN_KEY\)/.test(clearBody2));
  /* ⛔ 자유 대화에서는 이 API 를 부르면 안 됩니다. */
  t('⑦ 자유 대화 갈래는 목록을 받아 오지 않는다', !/btsLoadLessons\s*\(/.test(clearBody2));
  t('⑦ 과를 고르면 그 자리에서 반영한다(select change)', /getElementById\('wusLesson'\)[\s\S]{0,200}btsPickLesson\s*\(/.test(C2));
  /* ⛔ 이미 있는 학생용 API 를 씁니다 — 서버에 새 경로를 만들지 않았습니다. */
  t('⑦ 이미 있는 /api/games/lessons 를 쓴다', /\/api\/games\/lessons\?glang=en/.test(C2));
}

const label = 'warmup_bts_book_harness';
console.log(`\n▶ ${label}`);
P.forEach(x => console.log('  ✅ ' + x));
F.forEach(x => console.log('  ❌ ' + x));
console.log(`\n${label} — PASS ${P.length} / FAIL ${F.length}`);
if (F.length) process.exit(1);

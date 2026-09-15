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
const siuSrc = cut('var SIU_BOOKS = [', '[', ']');
const lvlSrc = cut('var LEVEL_CATALOG = [', '[', ']');
const bandSrc = (() => {
  const i = S.indexOf('function btsBandOf(');
  return i < 0 ? null : S.slice(i, i + (matchFrom(S, i, '{', '}') || '').length + (S.indexOf('{', i) - i));
})();
t('⓪ BTS_BOOKS 를 오려 냈다', !!btsSrc);
t('⓪ LEVEL_CATALOG 를 오려 냈다', !!lvlSrc);
t('⓪ btsBandOf 를 오려 냈다', !!bandSrc && bandSrc.includes('LEVEL_CATALOG'));

let BOOKS = null, CAT = null, bandOf = null, SIUB = null, ALL = [];
try {
  BOOKS = new Function('return ' + btsSrc)();
  SIUB = siuSrc ? new Function('return ' + siuSrc)() : null;
  ALL = (BOOKS || []).concat(SIUB || []);
  CAT = new Function('return ' + lvlSrc)();
  bandOf = new Function('LEVEL_CATALOG', bandSrc + '; return btsBandOf;')(CAT);
} catch (e) { no('⓪ 평가 실패', String(e && e.message)); }
t('⓪ SIU_BOOKS 를 오려 냈다', Array.isArray(SIUB) && SIUB.length > 0, SIUB && SIUB.length);

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

  {
    /* 🔴 «못 받았을 때» 에 저장값이 있으면 그 키가 목록에 없습니다 — 그대로 쓰면
          서버가 못 찾는데 화면은 «문장 N개» 라고 말합니다(거짓말).
       ⚠️ 저장값이 없는 «못 받으면» 시나리오만으로는 이 갈래를 한 번도 안 지납니다. */
    const { api, store } = mk(() => ({ ok: false }), BOOK);
    store.set('mangoi_warmup_bts_lesson', '1|' + L2.key);
    api.setVol(1); api.load(1);
    await tick(); await tick();
    const b1 = BOOK(1);
    t('⑥ 못 받았는데 저장값이 있어도 목록에 없는 키는 안 쓴다',
      api.key() === '' && !!b1 && api.wctx().textbook === ('BTS 1 (' + b1.en + ')'),
      [api.key(), api.wctx().textbook]);
  }
  {
    /* 경합 가드는 «둘»(요청 번호·지금 권)입니다. 권이 달라지는 시나리오만 두면
       둘 중 아무거나 하나로도 막혀서 «하나를 지워도 초록» 이 됩니다.
       ⚠️ 여기서는 «같은 권» 을 두 번 고릅니다 — 권 가드는 도움이 안 되고
          요청 번호 가드만 갈라 줍니다. */
    let n = 0;
    const { api } = mk(() => {
      n += 1;
      return n === 1 ? new Promise((r) => setTimeout(() => r({ ok: true, lessons: [L1] }), 25))
                     : ({ ok: true, lessons: [L2] });
    }, BOOK);
    api.setVol(1); api.load(1);        // ① 늦게 온다
    api.setVol(1); api.load(1);        // ② 같은 권 — 먼저 온다
    await new Promise((r) => setTimeout(r, 60));
    t('⑥ 같은 권을 다시 골라도 늦게 온 응답은 버린다', api.key() === L2.key, api.key());
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

// ════════════════════════════════════════════════════════════════════
//  ⑦ 배선 — «그 글자가 있는가» 가 아니라 «그 길을 실제로 타는가»
//  🔴 문자열로 물으면 «조건 뒤집기» 에 그대로 뚫립니다 — 2026-09-15 함정 대조 실측:
//     `btsLoadLessons(b.v);` → `if(false){ btsLoadLessons(b.v); }` 로 이 기능이
//     통째로 죽어도(권을 골라도 과 조회 0건) 그 글자가 남아 PASS 51 / FAIL 0 이었습니다.
//     `if(false && ls) ls.addEventListener(…)` 도 마찬가지였습니다.
//     잡아 주던 것은 브라우저 검사뿐인데 그것은 «자동으로 안 돕니다» ⟹ CI 가 못 봅니다.
//  ✅ 그래서 몸통을 오려 내 «가짜 fetch·가짜 DOM 으로 실제로 돌려» 답을 봅니다.
// ════════════════════════════════════════════════════════════════════
const fnSrc = (name) => {
  const i = S.indexOf(name);
  if (i < 0) return null;
  const b = matchFrom(S, i, '{', '}');
  return b ? S.slice(i, S.indexOf('{', i) + b.length) : null;
};
const applySrc = fnSrc('function applyBtsBook(');
const clearSrc = fnSrc('function clearBtsBook(');
const wireSrc  = fnSrc('function wireSetup(');
/* 📗 SIU 를 더하면서 생긴 공용 헬퍼 — «손으로 베끼지 말고» 소스에서 오려 내 주입합니다.
   ⛔ 안 넣으면 샌드박스가 그 이름을 몰라 «깔끔한 FAIL» 이 아니라 크래시가 납니다
      (2026-09-15 실측: bookIdOf is not defined 로 9건이 한꺼번에 죽었습니다). */
const idSrc    = fnSrc('function bookIdOf(');
const titleSrc = fnSrc('function bookTitleOf(');
const allSrc   = fnSrc('function allBooks(');
const bookOfSrc= fnSrc('function btsBookOf(');
const HELPERS  = [idSrc, titleSrc].filter(Boolean).join('\n');
/* ⛔ 전제 — 못 오려 내면 아래 검사가 «빈 문자열» 을 보고 조용히 통과합니다. */
t('⑦ applyBtsBook·clearBtsBook·wireSetup 을 오려 냈다',
  !!applySrc && !!clearSrc && !!wireSrc && wireSrc.includes('addEventListener'));

async function wiringSection() {
  if (!lsnSrc || !applySrc || !clearSrc || !wireSrc || !BOOKS) return;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const LA = { seq: 1, title: 'Welcome to school', key: 'BTS 1 001 (Welcome to school)',
               sentences: [{ en: 'Hello.' }, { en: 'I like school.' }] };
  const LB = { seq: 2, title: 'School Stuff', key: 'BTS 1 002 (School Stuff)', sentences: [{ en: 'I have a pencil.' }] };

  /** 가짜 화면 한 벌 — 리스너를 잡아 두었다가 «실제로 쏩니다». */
  function mk2(opts) {
    const o = opts || {};
    const calls = [], store = new Map(), H = {};
    const LS = { getItem: (k) => (store.has(k) ? store.get(k) : null),
                 setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const el = (id) => ({ id, hidden: false, innerHTML: '', textContent: '', value: '',
      addEventListener: (n, fn) => { H[id + ':' + n] = fn; }, appendChild() {} });
    const row = el('row'); row.hidden = false;
    const sec = el('wusLessonSec'); sec.querySelector = () => row;
    const sel = el('wusLesson'), note = el('wusLessonNote'), box = el('setup');
    box.contains = () => true;
    /* 📘 «지금 교재» 줄이 데려갈 자리 — scrollIntoView 가 실제로 불렸는지 기록합니다.
       ⛔ 이 자리가 없으면 아래 ⑧-a 가 «불렀는가» 를 물을 수 없어 문자열 검사로 되돌아갑니다. */
    const booksSec = el('wusBooksSec'); booksSec.scrolled = 0;
    booksSec.scrollIntoView = () => { booksSec.scrolled += 1; };
    const MAP = { wusLessonSec: sec, wusLesson: sel, wusLessonNote: note, wusBooksSec: booksSec };
    const doc = { getElementById: (id) => (MAP[id] || null),
                  createElement: () => ({ set textContent(v) { this._t = v; } }) };
    const fake = (url) => { calls.push(url);
      const r = o.reply ? o.reply(url) : { ok: true, lessons: [LA, LB] };
      return Promise.resolve({ json: () => (r && typeof r.then === 'function' ? r : Promise.resolve(r)) }); };
    const src = `var WCTX = {}; var LESSON_TOPIC = ''; var LESSON_TOPIC_URL = '원래주제';
       var BTS_KEY = 'mangoi_warmup_bts'; var _btsVol = 0;
       ${HELPERS}
       ${lsnSrc}
       ${applySrc}
       ${clearSrc}
       (${wireSrc})();
       return { wctx: function(){ return WCTX; }, topic: function(){ return LESSON_TOPIC; },
                vol: function(){ return _btsVol; }, key: function(){ return _btsLessonKey; },
                lessons: function(){ return _btsLessons; }, render: btsRenderLessonRow };`;
    const f = new Function('btsBookOf', 'btsBandOf', 'setLevel', 'levelLabel', 'addMsg',
      'updateTopicChip', 'setupEl', 'document', 'localStorage', 'fetch', 'isZh',
      'startWarmup', 'startProbe', 'setupGoBack', 'setAge', 'setWarmLang', 'renderSetup', src);
    /* ⛔ Number(v) 로 견주지 마세요 — SIU id('siu015')가 NaN 이 되어 영영 안 걸립니다. */
    const api = f((v) => (ALL.find((b) => String(b.v) === String(v)) || null), () => 0, () => {},
      () => '', () => {}, () => {}, () => box, doc, LS, fake, () => !!o.zh,
      () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
    /* «화면을 누른다» — 위임 클릭이 보는 모양 그대로 만든다. */
    const clickBts = (v) => {
      const node = { getAttribute: (n) => (n === 'data-bts' ? String(v) : null),
                     hasAttribute: (n) => n === 'data-bts' };
      H['setup:click']({ target: { closest: () => node } });
    };
    const change = (v) => { sel.value = v; H['wusLesson:change'](); };
    /* 📘 «지금 교재» 줄을 누른다 — 위임 클릭이 보는 모양 그대로. */
    const clickJump = () => {
      const node = { getAttribute: (n) => (n === 'data-jump' ? 'books' : null),
                     hasAttribute: (n) => n === 'data-jump' };
      H['setup:click']({ target: { closest: () => node } });
    };
    return { api, calls, store, clickBts, change, clickJump, sel, sec, row, note, booksSec, hooked: H };
  }

  // ── ⑦-1 권을 누르면 조회가 «실제로» 나가고 그 답이 붙는가 (짝) ──────
  try {
    const m = mk2();
    m.clickBts(1);
    t('⑦ 권을 누르면 과 조회가 실제로 나간다', m.calls.length === 1, m.calls);
    t('⑦ 그 주소는 이미 있는 학생용 API 다',
      (m.calls[0] || '').indexOf('/api/games/lessons?glang=en') === 0, m.calls[0]);
    await tick(); await tick();
    t('⑦ 받아 온 D1 이름이 실제로 WCTX.textbook 에 붙는다', m.api.wctx().textbook === LA.key, m.api.wctx().textbook);
    t('⑦ 과 고르개에 그 과들이 실제로 그려진다', m.sec.hidden === false && m.row.hidden === false, [m.sec.hidden, m.row.hidden]);
  } catch (e) { no('⑦ 권 누르기를 돌려 봤다', String(e && e.message)); }

  // ── ⑦-2 (짝) 자유 대화는 이 길을 한 번도 안 탄다 ───────────────────
  try {
    const m = mk2();
    m.store.set('mangoi_warmup_bts_lesson', '1|' + LB.key);
    m.clickBts(0);
    t('⑦ 자유 대화를 누르면 조회가 한 건도 안 나간다', m.calls.length === 0, m.calls);
    t('⑦ 자유 대화로 되돌리면 과 저장값도 지운다', !m.store.has('mangoi_warmup_bts_lesson'), [...m.store.keys()]);
    t('⑦ 자유 대화면 교재 이름을 만들지 않는다', !m.api.wctx().textbook, m.api.wctx().textbook);
    t('⑦ 자유 대화면 과 줄을 감춘다', m.sec.hidden === true, m.sec.hidden);
  } catch (e) { no('⑦ 자유 대화를 돌려 봤다', String(e && e.message)); }

  // ── ⑦-3 권을 바꾸면 «그 자리에서» 옛 과를 버린다 ────────────────────
  try {
    const m = mk2();
    m.clickBts(1); await tick(); await tick();
    const before = m.api.key();
    m.clickBts(2);                       /* 응답이 오기 «전» 에 이미 비어 있어야 한다 */
    t('⑦ 권을 바꾸면 옛 과를 그 자리에서 버린다', before === LA.key && m.api.key() === '', [before, m.api.key()]);
  } catch (e) { no('⑦ 권 바꾸기를 돌려 봤다', String(e && e.message)); }

  // ── ⑦-4 과를 고르면 «그 자리에서» 반영·저장된다 (change 를 실제로 쏨) ─
  try {
    const m = mk2();
    m.clickBts(1); await tick(); await tick();
    m.change(LB.key);
    t('⑦ 과를 고르면 그 자리에서 반영된다', m.api.key() === LB.key && m.api.wctx().textbook === LB.key,
      [m.api.key(), m.api.wctx().textbook]);
    t('⑦ 사람이 고른 과는 «권|키» 로 저장된다',
      m.store.get('mangoi_warmup_bts_lesson') === '1|' + LB.key, m.store.get('mangoi_warmup_bts_lesson'));
  } catch (e) { no('⑦ 과 고르기를 돌려 봤다', String(e && e.message)); }

  // ── ⑦-5 화면이 «거짓말» 하지 않는가 ────────────────────────────────
  try {
    const NO_S = { seq: 1, title: 'x', key: 'BTS 1 001 (x)', sentences: [] };
    const m = mk2({ reply: () => ({ ok: true, lessons: [NO_S] }) });
    m.clickBts(1); await tick(); await tick();
    t('⑦ 문장이 0개면 «문장 N개» 라고 말하지 않는다', m.note.textContent === '', m.note.textContent);
    t('⑦ 과가 하나뿐이면 고르개를 감춘다(줄은 남김)', m.row.hidden === true && m.sec.hidden === false,
      [m.row.hidden, m.sec.hidden]);
  } catch (e) { no('⑦ 안내 문구를 돌려 봤다', String(e && e.message)); }
  try {
    const m = mk2();
    m.clickBts(1); await tick(); await tick();
    t('⑦ 문장이 있으면 그 수를 말한다(짝)', /2개/.test(m.note.textContent), m.note.textContent);
  } catch (e) { no('⑦ 문장 수 안내를 돌려 봤다', String(e && e.message)); }

  // ── ⑦-6 중국어면 통째로 감춘다 ─────────────────────────────────────
  try {
    const m = mk2({ zh: true });
    m.clickBts(1); await tick(); await tick();
    t('⑦ 중국어 화면에서는 과 줄을 감춘다', m.sec.hidden === true, m.sec.hidden);
  } catch (e) { no('⑦ 중국어 갈래를 돌려 봤다', String(e && e.message)); }

  // ── ⑧-a «지금 교재» 줄을 눌러 «실제로» 교재 자리로 가는가 ────────────
  //  🔴 [왜 실행으로 묻나] 이 자리를 문자열(`/\[data-jump\]/`·`'books'`)로 물었더니
  //     `if(false && t.getAttribute('data-jump') === 'books'){` 한 글자 변이가
  //     **PASS 74 / FAIL 0 으로 그대로 통과**했습니다(2026-09-15 함정 대조 실측).
  //     그 변이는 버튼을 완전히 죽이는 것 = 이번 변경의 존재 이유가 사라지는 것입니다.
  //  ⛔ 문자열 검사로 되돌리지 마세요.
  try {
    const m = mk2();
    m.clickJump();
    t('⑧ «지금 교재» 줄을 누르면 교재 자리로 실제로 데려간다', m.booksSec.scrolled === 1, m.booksSec.scrolled);
    /* (짝) 아무 일도 안 하는 클릭은 데려가지 않는다 — 없으면 «언제나 스크롤» 도 통과합니다. */
    const m2 = mk2();
    m2.clickBts(1);
    t('⑧ 교재를 고르는 클릭은 그 자리로 안 데려간다(짝)', m2.booksSec.scrolled === 0, m2.booksSec.scrolled);
    /* ⛔ 교재 섹션이 감춰져 있으면(중국어) 데려가지 않는다 — 없는 곳으로 보내면 안 됩니다. */
    const m3 = mk2({ zh: true });
    m3.booksSec.hidden = true;
    m3.clickJump();
    t('⑧ 교재 자리가 감춰져 있으면 데려가지 않는다', m3.booksSec.scrolled === 0, m3.booksSec.scrolled);
  } catch (e) { no('⑧ «지금 교재» 줄 누르기를 돌려 봤다', String(e && e.message)); }
}
await wiringSection();

// ════════════════════════════════════════════════════════════════════
// ⑧ 📘 «지금 교재» 줄 — 교재 자리가 첫 화면 «밖» 이라는 사고 (2026-09-15)
//  [왜] 교재 섹션은 8단계 수준 목록 «아래» 라 실측상 PC 1920x1040 에서 top 1380px ·
//    폰 390x844 에서 1577px = 첫 화면 밖입니다. 그런데 시작 버튼은 sticky 라 늘 보입니다
//    ⟹ 스크롤할 이유가 없어 교재를 한 번도 못 보고 시작합니다(사장님 실제 사고).
//  ⚠️ «어디에 그려지는가» 는 여기서 못 봅니다 — 그건 manual/warmup-bts-book-browser ⑩절.
//    이 절은 «무슨 글자가 나오는가 · 배선이 살아 있는가» 만 봅니다.
//  ⛔ 「그 함수가 있는가」로 묻지 마세요 — `if(false)` 한 줄이면 그대로 통과합니다.
//    오려 내 «실제로 돌려» 답으로 묻고, «짝»(안 골랐을 때 / 골랐을 때 / 중국어)을 둡니다.
// ════════════════════════════════════════════════════════════════════
{
  const bnSrc = fnSrc('function btsRenderBookNow(');
  /* ⛔ 전제 — 못 오려 내면 아래가 빈 문자열을 보고 조용히 통과합니다. */
  t('⑧ btsRenderBookNow 를 오려 냈다', !!bnSrc && bnSrc.includes('wusBookNow'), !!bnSrc);
  if (bnSrc) {
    /* ⛔ 정본이 쓰는 escapeHtml 을 «소스에서 오려 내» 넣습니다 — 손으로 베끼면
          정본이 바뀔 때 검사만 옛 동작을 보게 됩니다(CLAUDE.md 「값을 베껴 적지 마세요」). */
    const escSrc = fnSrc('function escapeHtml(');
    const run = (vol, zh, lesson) => {
      /* ⚠️ 마크업이 `<button … hidden>` 이므로 시작 상태는 «true» 입니다.
         false 로 두면 `el.hidden = false;` 를 지우는 변이(= 버튼이 영영 안 보임)가
         그대로 통과합니다(2026-09-15 함정 대조 실측 74/0). */
      const el = { id: 'wusBookNow', hidden: true, innerHTML: '',
                   get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ''); } };
      const doc = { getElementById: (id) => (id === 'wusBookNow' ? el : null) };
      const f = new Function('document', 'isZh', '_btsVol', 'btsLessonNow',
        `${escSrc || ''}\nvar BTS_BOOKS = ${btsSrc || '[]'};\nvar SIU_BOOKS = ${siuSrc || '[]'};
         ${allSrc || ''}\n${idSrc || ''}\n${titleSrc || ''}\n${bookOfSrc || ''}
         ${bnSrc}\nbtsRenderBookNow(); return { hidden: document.getElementById('wusBookNow').hidden,
           text: document.getElementById('wusBookNow').textContent };`);
      return f(doc, () => zh, vol, () => lesson);
    };
    t('⑧ escapeHtml 을 오려 냈다(정본이 쓰는 그것)', !!escSrc, !!escSrc);
    try {
      const free = run(0, false, null);
      const book = run(1, false, null);
      const lsn  = run(1, false, { seq: 2, title: 'School Stuff' });
      const zh   = run(1, true, null);
      t('⑧ 안 골랐으면 «자유 대화» 라고 말한다', free.hidden === false && /자유 대화/.test(free.text), free);
      t('⑧ 골랐으면 «BTS 1» 이라고 말한다(짝)', book.hidden === false && /BTS 1/.test(book.text), book);
      t('⑧ 과까지 골랐으면 «제 2과» 도 말한다', /제 2과/.test(lsn.text), lsn);
      t('⑧ 중국어면 감춘다(교재 섹션과 짝)', zh.hidden === true, zh);
      /* 🛡️ 서버가 준 값은 이스케이프해서 넣는가 — 지금 서버는 정수를 주지만
            안전이 «서버 한 줄» 에만 기대지 않게 합니다. */
      /* 📗 SIU 도 한 번 그려 봅니다 — 안 넣으면 그 갈래를 되돌려 화면이
         「📘 지금 교재 BTS siu015」라는 «눈에 보이는 거짓말» 을 해도 110/0 통과합니다
         (2026-09-15 함정 대조 실측). 브라우저는 잡지만 게이트가 안 물어 갑니다. */
      if (Array.isArray(SIUB) && SIUB.length) {
        const sb = run(SIUB[0].v, false, null);
        t('⑧ SIU 를 고르면 그 교재 이름을 말한다', /SIU BASIC/.test(sb.text), sb.text);
        t('⑧ SIU 를 «BTS …» 라고 부르지 않는다(짝)', !/BTS/.test(sb.text), sb.text);
        t('⑧ SIU 에는 과 번호를 지어내지 않는다', !/제 .*과/.test(sb.text), sb.text);
      }
      const evil = run(1, false, { seq: '<img src=x onerror=1>', title: 'x' });
      t('⑧ 서버가 준 과 번호를 그대로 태그로 넣지 않는다',
        evil.text.indexOf('<img') < 0 && String(evil.text).indexOf('&lt;img') >= 0, evil.text);
    } catch (e) { no('⑧ btsRenderBookNow 를 돌려 봤다', String(e && e.message)); }
    /* ⚠️ «감춘다» 만 두면 «전부 감추기» 도 통과합니다 — 위 세 줄이 그 짝입니다. */
  }
  /* 🔌 배선 — 그 함수를 «부르는 곳» 이 살아 있는가.
     ⛔ 개수로 못 박지 마세요(정당하게 늘 수 있습니다) — «두 자리에 다 있는가» 로 묻습니다. */
  const rsBody = (() => { const i = S.indexOf('function renderSetup('); return i < 0 ? '' : (matchFrom(S, i, '{', '}') || ''); })();
  const lrBody = (() => { const i = S.indexOf('function btsRenderLessonRow('); return i < 0 ? '' : (matchFrom(S, i, '{', '}') || ''); })();
  t('⑧ renderSetup 이 그 줄을 갱신한다', /btsRenderBookNow\s*\(/.test(strip(rsBody)), rsBody.length);
  t('⑧ btsRenderLessonRow 도 갱신한다(교재를 껐을 때)', /btsRenderBookNow\s*\(/.test(strip(lrBody)), lrBody.length);
  /* ⛔ 조기 return «앞» 이어야 합니다 — 뒤에 두면 «교재 없음» 으로 바꿔도 줄이 안 바뀝니다. */
  const lrClean = strip(lrBody);
  t('⑧ 그 갱신이 조기 return 보다 «앞» 이다',
    lrClean.indexOf('btsRenderBookNow') >= 0 && lrClean.indexOf('btsRenderBookNow') < lrClean.indexOf('return'),
    [lrClean.indexOf('btsRenderBookNow'), lrClean.indexOf('return')]);
  /* 🖱️ 눌러서 교재 자리로 가는 길은 ⑧-a 가 «실제로 눌러» 봅니다 — 문자열로 묻지 않습니다. */
  /* 🧷 화면에 그 줄이 «시작 버튼보다 앞» 에 있는가(문서 순서) — sticky 로 위에 붙습니다. */
  const iBn = S.indexOf('id="wusBookNow"'), iSt = S.indexOf('id="wusStart"');
  t('⑧ 마크업에서 시작 버튼보다 앞에 있다', iBn > 0 && iSt > 0 && iBn < iSt, [iBn, iSt]);
}

/* ══ ⑨ 📗 SIU BASIC — 단계로 갈라 보여 준다 (2026-09-15) ═══════════════════
   [왜] Mai 가 SIU BASIC 29권을 올렸고 사장님이 «단계별로 나눠서» 를 고르셨습니다.
     BTS 는 «권 번호 = 레벨» 인데 SIU 는 전부 같은 한 레벨이라, 그 구조에 그냥
     못 넣습니다. 섞으면 7살 학생 목록에 «Job interview» 가 올라옵니다.
   ⛔ «그 글자가 있는가» 로 묻지 마세요 — 목록 함수를 오려 내 «실제로 돌려»
      무슨 HTML 이 나오는지 봅니다. 그리고 「SIU 가 위」 옆에 **「BTS 는 그대로」를
      짝으로** 둡니다 — 짝이 없으면 «전부 SIU 로 바꾸기» 도 통과합니다. */
if (Array.isArray(SIUB) && SIUB.length) {
  // ── 표 자체 ──────────────────────────────────────────────────────
  t('⑨ SIU 권이 하나 이상', SIUB.length > 0, SIUB.length);
  t('⑨ 모든 권에 D1 이름(book)', SIUB.every(b => typeof b.book === 'string' && /^SIU BASIC \d{3} - /.test(b.book)),
    SIUB.filter(b => !/^SIU BASIC \d{3} - /.test(String(b.book || ''))).map(b => b.v));
  t('⑨ 모든 권에 영어 주제', SIUB.every(b => typeof b.en === 'string' && b.en.trim()),
    SIUB.filter(b => !(b.en || '').trim()).map(b => b.v));
  t('⑨ 모든 권에 한국어 안내', SIUB.every(b => typeof b.ko === 'string' && b.ko.trim()),
    SIUB.filter(b => !(b.ko || '').trim()).map(b => b.v));
  t('⑨ 영어 주제에 한글이 없다(AI 에게 가는 값)', SIUB.every(b => !/[가-힣]/.test(b.en)),
    SIUB.filter(b => /[가-힣]/.test(b.en)).map(b => b.v));
  t('⑨ 모든 권에 s:"SIU" 표시', SIUB.every(b => b.s === 'SIU'), SIUB.filter(b => b.s !== 'SIU').map(b => b.v));
  const ids = ALL.map(b => String(b.v));
  t('⑨ 두 표를 합쳐도 id 가 겹치지 않는다', new Set(ids).size === ids.length,
    ids.length - new Set(ids).size);
  /* ⚠️ 012 는 서버에 없습니다 — 없는 교재를 목록에 만들면 «골랐는데 아무것도 없는» 교재가 됩니다. */
  t('⑨ 서버에 없는 012 를 지어내지 않았다', !SIUB.some(b => /^SIU BASIC 012\b/.test(String(b.book || ''))),
    SIUB.filter(b => /012/.test(String(b.book || ''))).map(b => b.book));

  // ── bookIdOf — parseInt 함정 ─────────────────────────────────────
  if (idSrc) {
    const idOf = new Function(idSrc + '; return bookIdOf;')();
    t('⑨ bookIdOf — BTS 는 숫자', idOf('5') === 5 && idOf(5) === 5, [idOf('5'), idOf(5)]);
    t('⑨ bookIdOf — SIU 는 문자열 그대로', idOf('siu015') === 'siu015', idOf('siu015'));
    t('⑨ bookIdOf — 0·빈값은 «안 고름»', idOf('0') === 0 && idOf('') === 0 && idOf(null) === 0,
      [idOf('0'), idOf(''), idOf(null)]);
    /* 🪤 이 한 줄이 이 절의 핵심입니다 — parseInt 로 되돌리면 SIU 가 0 이 됩니다. */
    t('⑨ bookIdOf — SIU 가 0 으로 떨어지지 않는다(짝)', idOf('siu015') !== 0, idOf('siu015'));
  } else no('⑨ bookIdOf 를 오려 내지 못했다');

  // ── btsBookOf — 두 표를 다 찾는가 ───────────────────────────────
  if (bookOfSrc && idSrc && allSrc) {
    const find = new Function('BTS_BOOKS', 'SIU_BOOKS',
      `${allSrc}\n${idSrc}\n${bookOfSrc}\nreturn btsBookOf;`)(BOOKS, SIUB);
    const anySiu = SIUB[0];
    t('⑨ btsBookOf — BTS 를 찾는다', !!find(BOOKS[0].v), !!find(BOOKS[0].v));
    t('⑨ btsBookOf — SIU 도 찾는다(짝)', !!find(anySiu.v) && find(anySiu.v).s === 'SIU', anySiu.v);
    /* ⚠️ localStorage 에서 복원하면 «언제나 문자열» 입니다 — === 로 견주면 BTS 가 안 걸립니다. */
    t('⑨ btsBookOf — 문자열로 복원해도 BTS 를 찾는다', !!find(String(BOOKS[0].v)), String(BOOKS[0].v));
    t('⑨ btsBookOf — 모르는 값은 못 찾는다(짝)', find('siu999') === null && find(0) === null,
      [find('siu999'), find(0)]);
  } else no('⑨ btsBookOf/allBooks 를 오려 내지 못했다');

  // ── 목록 — 단계로 갈리는가 ──────────────────────────────────────
  const listSrc = fnSrc('function btsListHtml(');
  t('⑨ btsListHtml 을 오려 냈다', !!listSrc && listSrc.includes('SIU_BAND_MIN'), !!listSrc);
  const minM = S.match(/var\s+SIU_BAND_MIN\s*=\s*(\d+)/);
  t('⑨ SIU_BAND_MIN 을 소스에서 읽었다', !!minM, minM && minM[1]);
  if (listSrc && minM && bandOf) {
    const MIN = Number(minM[1]);
    /* ⚠️ vol 을 «반드시» 넘길 수 있어야 합니다 — 0 으로만 부르면 item() 의 `on`(「지금」 표시)과
       pickInRest(고른 교재가 접힌 쪽이면 펴 두기) **두 갈래가 원리상 한 번도 안 돕니다**
       (2026-09-15 함정 대조 실측: ` open` 을 지워도 110/0 통과). CLAUDE.md 「그 가드가
       «실제로 일하는» 상태를 만들어 주세요」. */
    const runList = (band, vol) => {
      const f = new Function('BTS_BOOKS', 'SIU_BOOKS', 'SIU_BAND_MIN', '_warmLevel', '_btsVol',
        'btsBandOf', 'escapeHtml', 'bookTitleOf',
        `${listSrc}\nreturn btsListHtml();`);
      return f(BOOKS, SIUB, MIN, band, vol === undefined ? 0 : vol, bandOf,
        (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        new Function(titleSrc + '; return bookTitleOf;')());
    };
    /* «위에 펼쳐진 목록» 만 떼어 본다 — <details> 안은 접혀 있는 쪽이다. */
    const openPart = (h) => { const i = h.indexOf('<details'); return i < 0 ? h : h.slice(0, i); };
    try {
      const low  = runList(1);          // 1단계 — BTS 가 먼저여야
      const high = runList(MIN);        // 5단계 — SIU 가 먼저여야
      const lowOpen = openPart(low), highOpen = openPart(high);
      t('⑨ 낮은 단계에서는 BTS 가 위에 펼쳐진다',
        /data-bts="\d+"/.test(lowOpen) && !/data-bts="siu/.test(lowOpen), lowOpen.slice(0, 120));
      t('⑨ 높은 단계에서는 SIU 가 위에 펼쳐진다(짝)',
        /data-bts="siu/.test(highOpen), highOpen.slice(0, 160));
      /* ⛔ «안 보이게» 가 아니라 «접어 둔다» — 어느 단계에서든 다 고를 수 있어야 합니다. */
      t('⑨ 낮은 단계에서도 SIU 를 고를 수는 있다(접힌 채)', /data-bts="siu/.test(low), null);
      t('⑨ 높은 단계에서도 BTS 를 고를 수는 있다(접힌 채)', /data-bts="\d+"/.test(high.slice(high.indexOf('<details'))), null);
      /* 짝 — «전부 SIU 로 바꾸기» 를 막습니다. */
      t('⑨ 낮은 단계 목록에 BTS 가 실제로 있다(짝)',
        (lowOpen.match(/data-bts="\d+"/g) || []).length >= 2, (lowOpen.match(/data-bts="\d+"/g) || []).length);
      t('⑨ «자유 대화» 는 두 단계 모두에 남아 있다',
        /data-bts="0"/.test(low) && /data-bts="0"/.test(high), null);
      t('⑨ SIU 권 수만큼 다 그린다',
        (high.match(/data-bts="siu/g) || []).length === SIUB.length,
        (high.match(/data-bts="siu/g) || []).length);

      /* ── 고른 교재가 «접힌 쪽» 에 있을 때 ── 낮은 단계에서 SIU 를 고른 상태.
         ⛔ 이 두 검사가 없으면 ` open` 과 `on` 을 지워도 초록입니다(실측). */
      const lowPicked = runList(1, SIUB[0].v);
      t('⑨ 고른 교재가 접힌 쪽이면 그 상자를 펴 둔다', /<details[^>]*\sopen/.test(lowPicked),
        (lowPicked.match(/<details[^>]*>/) || [''])[0]);
      t('⑨ 고른 교재에 «지금» 표시가 붙는다',
        new RegExp('class="wus-item on"[^>]*data-bts="' + SIUB[0].v + '"').test(lowPicked)
        || /wus-item on[\s\S]{0,200}wus-now/.test(lowPicked), null);
      /* 짝 — 안 고른 상태에서는 «저절로» 펴지지 않아야 합니다(「언제나 open」 을 막습니다). */
      t('⑨ 아무것도 안 골랐으면 접힌 채로 둔다(짝)', !/<details[^>]*\sopen/.test(low),
        (low.match(/<details[^>]*>/) || [''])[0]);
    } catch (e) { no('⑨ 목록 평가 실패', String(e && e.message)); }
  }

  // ── applyBtsBook — SIU 는 D1 이름을 «그대로» 보낸다 ─────────────
  if (applySrc && idSrc && titleSrc && allSrc && bookOfSrc) {
    const runApply = (v) => {
      const f = new Function('BTS_BOOKS', 'SIU_BOOKS', 'setLevel', 'levelLabel', 'addMsg',
        'updateTopicChip', 'localStorage', 'btsRenderLessonRow', 'btsLoadLessons', 'btsBandOf',
        `var WCTX = {}; var LESSON_TOPIC = ''; var BTS_KEY = 'k'; var BTS_LSN_KEY = 'k2';
         var _btsVol = 0, _btsLessons = [], _btsLessonKey = '', _btsFetchSeq = 0;
         var _lessonCalls = 0;
         ${allSrc}\n${idSrc}\n${titleSrc}\n${bookOfSrc}
         var _realLoad = btsLoadLessons; btsLoadLessons = function(x){ _lessonCalls++; };
         ${applySrc}
         var ok = applyBtsBook(${JSON.stringify(v)}, false, true);
         return { ok: ok, wctx: WCTX, topic: LESSON_TOPIC, vol: _btsVol, lessonCalls: _lessonCalls };`);
      return f(BOOKS, SIUB, () => {}, () => '', () => {}, () => {},
        { setItem(){}, removeItem(){} }, () => {}, () => {}, bandOf);
    };
    try {
      const siu = runApply(SIUB[0].v);
      const bts = runApply(BOOKS[0].v);
      t('⑨ SIU 를 고르면 WCTX.textbook 이 D1 이름 «그대로»',
        siu.wctx.textbook === SIUB[0].book, siu.wctx.textbook);
      /* ⛔ 없는 Lv 를 지어내면 서버가 엉뚱한 레벨로 문장을 찾습니다. */
      t('⑨ SIU 에는 Lv 를 지어내지 않는다', siu.wctx.level === '', JSON.stringify(siu.wctx.level));
      t('⑨ SIU 는 과를 부르지 않는다(한 권 = 한 과)', siu.lessonCalls === 0, siu.lessonCalls);
      t('⑨ SIU 주제가 AI 에게 간다', siu.topic === SIUB[0].en, siu.topic);
      /* ── 짝: BTS 는 한 글자도 안 바뀌어야 한다 ── */
      t('⑨ BTS 는 예전처럼 «BTS N (주제)» 를 보낸다(짝)',
        bts.wctx.textbook === 'BTS ' + BOOKS[0].v + ' (' + BOOKS[0].en + ')', bts.wctx.textbook);
      t('⑨ BTS 는 Lv 를 그대로 보낸다(짝)', bts.wctx.level === 'Lv ' + BOOKS[0].v, bts.wctx.level);
      t('⑨ BTS 는 과를 부른다(짝)', bts.lessonCalls === 1, bts.lessonCalls);
    } catch (e) { no('⑨ applyBtsBook 평가 실패', String(e && e.message)); }
  } else no('⑨ applyBtsBook 주변을 오려 내지 못했다');
} else no('⑨ SIU_BOOKS 를 못 읽어 이 절을 돌리지 못했다');

const label = 'warmup_bts_book_harness';
console.log(`\n▶ ${label}`);
P.forEach(x => console.log('  ✅ ' + x));
F.forEach(x => console.log('  ❌ ' + x));
console.log(`\n${label} — PASS ${P.length} / FAIL ${F.length}`);
if (F.length) process.exit(1);

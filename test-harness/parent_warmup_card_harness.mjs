// -*- coding: utf-8 -*-
// 👪 학부모 대시보드 «수업 전 A.i 웜업» 카드 하니스 (2026-10-02 P4)
//   실행:  node test-harness/parent_warmup_card_harness.mjs
//   대상:  cloudflare-deploy/src/warmup-parent.ts   (정본 — 진짜 SQLite 에 실제로 돌린다)
//          cloudflare-deploy/src/api-students.ts    (대시보드 배선 — 게이트 «뒤» 에서 읽는가)
//          cloudflare-deploy/src/api-reports.ts     (월간 성적표 데이터 배선)
//          cloudflare-deploy/public/parent.html     (pdWarmupHtml 을 오려 내 실제로 그린다)
//
//   지키는 것 — 전부 «짝» 으로 묻습니다(한쪽만 보면 «전부 0»·«전부 보이기» 가 통과합니다).
//     ① 그 학생 것만 센다 ↔ 다른 학생·대소문자만 다른 계정은 안 센다
//     ② 표가 없으면 «모름(null)» ↔ 표가 있으면 0 도 0 이라고 말한다
//     ③ 교정 기록이 연결되기 전엔 «아직 기록 안 함» ↔ 연결 뒤엔 그 학생 예만 최대 2개
//     ④ 화면: 값이 있으면 그린다 ↔ 서버가 칸을 안 보내면 카드를 감춘다 · 지어내지 않는다
//   변이시험용: WP_SRC / STU_SRC / REP_SRC / PARENT_SRC 로 고친 사본을 가리킬 수 있다.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const P = (...a) => resolve(__dir, '../cloudflare-deploy', ...a);
const WP_SRC = process.env.WP_SRC || P('src/warmup-parent.ts');
const STU_SRC = process.env.STU_SRC || P('src/api-students.ts');
const REP_SRC = process.env.REP_SRC || P('src/api-reports.ts');
const PARENT_SRC = process.env.PARENT_SRC || P('public/parent.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, ok, info) {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name + (info ? ' — ' + info : '')); console.log('  ❌ FAIL ' + name + (info ? ' — ' + info : '')); }
}
/* 주석 벗기기 — 정규식 한 줄로 하면 문자열 속 «/api/x/*» 같은 글자에 걸려 파일 뒤가 통째로 사라진다
   (CLAUDE.md 2장 「블록주석을 정규식 한 줄로 지웠더니」). 글자를 훑으며 «문자열 안인가» 를 함께 본다. */
function strip(t) {
  let out = '', i = 0, q = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && n === '/' && t[i - 1] !== ':') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
/* 여는 «{» 부터 짝이 맞는 «}» 까지 */
function blockFrom(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

// ───────────────────────── ① 정본을 진짜 SQLite 에 돌린다 ─────────────────────────
console.log('\n① 정본(readParentWarmup · warmupCountsBetween · logWarmupFix) — 진짜 SQLite');
let W = null;
try { W = await import(pathToFileURL(WP_SRC).href + '?t=' + Date.now()); } catch (e) { FAILS.push('import: ' + e.message); }
check('전제: 정본 모듈을 불러왔다', !!W);
const G = await import(pathToFileURL(P('src/warmup-log.ts')).href);

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
if (!DatabaseSync || !W) {
  console.log('  ⏭  건너뜀 — node:sqlite 가 없거나 모듈을 못 불렀습니다');
  if (!DatabaseSync) { FAIL++; FAILS.push('node:sqlite 없음 — 정본을 못 돌렸다'); }
} else {
  /* D1 모양으로 감싼다 — prepare().bind().first/all/run 과 bind 없는 first/all 둘 다 */
  const wrap = (sdb) => ({
    prepare(sql) {
      const st = sdb.prepare(sql);
      const mk = (args) => ({
        first: async () => st.get(...args) ?? null,
        all: async () => ({ results: st.all(...args) }),
        run: async () => st.run(...args),
      });
      return { ...mk([]), bind: (...a) => mk(a) };
    },
  });
  const KST = 9 * 3600 * 1000;
  // 기준 시각: 2026-10-15 12:00 KST
  const NOW = Date.UTC(2026, 9, 15, 3, 0, 0);
  const MONTH_START = Date.UTC(2026, 9, 1) - KST;   // 2026-10-01 00:00 KST
  const sdb = new DatabaseSync(':memory:');
  for (const sql of G.WARMUP_LOG_DDL) sdb.exec(sql);
  const db = wrap(sdb);
  const ins = sdb.prepare(`INSERT INTO warmup_session_log (session_id, user_id, started_at, first_reply_at) VALUES (?,?,?,?)`);
  const day = (d, h = 10) => Date.UTC(2026, 9, d, h - 9, 0, 0);   // 10월 d일 h시 KST
  ins.run('a1', 'lee', day(2), day(2) + 60000);         // 말함 — 10/2
  ins.run('a2', 'lee', day(2, 18), day(2, 18) + 60000); // 말함 — 같은 날
  ins.run('a3', 'lee', day(9), day(9) + 60000);         // 말함 — 10/9
  ins.run('a4', 'lee', day(10), null);                  // 열고 말 안 함
  ins.run('a5', 'lee', MONTH_START - 1, MONTH_START);   // 9/30 23:59:59.999 KST — 지난달
  ins.run('a6', 'lee', MONTH_START, MONTH_START + 5);   // 10/1 00:00 KST — 이번 달 첫 순간
  const NEXT_START = Date.UTC(2026, 10, 1) - KST;           // 2026-11-01 00:00 KST — 다음 달
  ins.run('a7', 'lee', NEXT_START, NEXT_START + 5);     // 다음 달 첫 순간 — 이번 달에 안 들어간다
  ins.run('b1', 'LEE', day(3), day(3) + 1);             // 대소문자만 다른 «남의» 계정
  ins.run('c1', 'kim', day(4), day(4) + 1);
  ins.run('c2', 'kim', day(5), null);
  ins.run('z1', null, day(6), day(6) + 1);              // 비로그인

  // 교정 표가 아직 없을 때
  const r0 = await W.readParentWarmup(db, 'lee', NOW);
  check('이번 달(KST) 말한 웜업 = 4회 (지난달·남의 계정 제외, 1일 0시 포함)', r0.spoke_sessions_this_month === 4, JSON.stringify(r0));
  check('이번 달 시작된 웜업 = 5회 (말 안 한 1회 포함)', r0.sessions_this_month === 5, String(r0.sessions_this_month));
  check('말한 날 = 3일 (같은 날 두 번은 하루)', r0.days_this_month === 3, String(r0.days_this_month));
  check('달 표기는 KST 기준 2026-10', r0.month === '2026-10', r0.month);
  check('교정 표가 없으면 fixes_recorded=false (0건과 다른 사실)', r0.fixes_recorded === false && r0.recent_fixes.length === 0);
  const rk = await W.readParentWarmup(db, 'kim', NOW);
  check('짝: 다른 학생은 자기 것만 (kim 1회·2세션)', rk.spoke_sessions_this_month === 1 && rk.sessions_this_month === 2, JSON.stringify(rk));
  const rLEE = await W.readParentWarmup(db, 'LEE', NOW);
  check('짝: 대소문자만 다른 계정은 섞이지 않는다 (LEE 1회)', rLEE.spoke_sessions_this_month === 1, JSON.stringify(rLEE));
  const rNone = await W.readParentWarmup(db, 'nobody', NOW);
  check('짝: 기록 없는 학생은 «0» (모름이 아니다)', rNone.spoke_sessions_this_month === 0 && rNone.days_this_month === 0);

  // 표 자체가 없으면 «모름»
  const empty = wrap(new DatabaseSync(':memory:'));
  const rU = await W.readParentWarmup(empty, 'lee', NOW);
  check('세션 표가 없으면 횟수는 null(모름) — 0 으로 지어내지 않는다',
    rU.spoke_sessions_this_month === null && rU.days_this_month === null && rU.sessions_this_month === null, JSON.stringify(rU));
  const cnull = await W.warmupCountsBetween(empty, 'lee', 0, NOW);
  check('warmupCountsBetween: 표 없음 → null', cnull === null);
  const cbetween = await W.warmupCountsBetween(db, 'lee', MONTH_START, NEXT_START);
  check('warmupCountsBetween: 기간 횟수 = 대시보드와 같은 식 (4/5/3)',
    cbetween && cbetween.spoke_sessions === 4 && cbetween.sessions === 5 && cbetween.days === 3, JSON.stringify(cbetween));

  // 교정 기록
  const env = { DB: db };
  const fix = (was, now, why) => ({ was, now, why_ko: why, tag: 'past_tense', severity: 'major' });
  const okG = await W.logWarmupFix(env, { sessionId: 'g1', userId: 'guest_ab12', fix: fix('I go', 'I went', 'x') });
  check('게스트 아이디는 기록하지 않는다', okG === false);
  const okSame = await W.logWarmupFix(env, { sessionId: 'a1', userId: 'lee', fix: fix('Hi', 'Hi', 'x') });
  check('고친 것이 없는(was===now) 카드는 기록하지 않는다', okSame === false);
  const r1 = await W.readParentWarmup(db, 'lee', NOW);
  check('짝: 아직 아무도 안 썼으면 여전히 fixes_recorded=false', r1.fixes_recorded === false);
  /* logWarmupFix 는 Date.now() 로 적는다 — 순서를 정하려고 created_at 만 고쳐 둔다 */
  await W.logWarmupFix(env, { sessionId: 'a1', userId: 'lee', fix: fix('I go school yesterday.', 'I went to school yesterday.', '어제 일은 과거형') });
  await W.logWarmupFix(env, { sessionId: 'a1', userId: 'lee', fix: fix('I go school yesterday.', 'I went to school yesterday.', '중복') });
  await W.logWarmupFix(env, { sessionId: 'a3', userId: 'lee', fix: fix('She like cats.', 'She likes cats.', '3인칭 단수') });
  await W.logWarmupFix(env, { sessionId: 'a3', userId: 'lee', fix: fix('<b>x</b> is', 'It is', '태그') });
  await W.logWarmupFix(env, { sessionId: 'c1', userId: 'kim', fix: fix('KIM SECRET', 'Kim fixed', 'kim') });
  const all = sdb.prepare(`SELECT id, user_id, was FROM warmup_fix_log ORDER BY id`).all();
  check('같은 세션·같은 문장은 한 줄만 (중복 방지)', all.filter((r) => r.was === 'I go school yesterday.').length === 1, JSON.stringify(all));
  const setAt = sdb.prepare(`UPDATE warmup_fix_log SET created_at = ? WHERE was = ?`);
  setAt.run(NOW - 3 * 86400000, 'I go school yesterday.');
  setAt.run(NOW - 1 * 86400000, 'She like cats.');
  setAt.run(NOW - 40 * 86400000, '<b>x</b> is');      // 30일 밖
  setAt.run(NOW - 1000, 'KIM SECRET');
  const r2 = await W.readParentWarmup(db, 'lee', NOW);
  check('연결 뒤에는 fixes_recorded=true', r2.fixes_recorded === true);
  check('최근 교정 최대 2개 · 최신 먼저', r2.recent_fixes.length === 2 && r2.recent_fixes[0].from === 'She like cats.'
    && r2.recent_fixes[1].from === 'I go school yesterday.', JSON.stringify(r2.recent_fixes));
  check('{from,to,why_ko,at} 모양', r2.recent_fixes[0].to === 'She likes cats.' && r2.recent_fixes[0].why_ko === '3인칭 단수'
    && typeof r2.recent_fixes[0].at === 'number');
  check('짝: 다른 학생(kim)의 문장은 lee 에 절대 안 실린다', !JSON.stringify(r2).includes('KIM SECRET'));
  const rk2 = await W.readParentWarmup(db, 'kim', NOW);
  check('짝: kim 은 자기 교정만', rk2.recent_fixes.length === 1 && rk2.recent_fixes[0].from === 'KIM SECRET', JSON.stringify(rk2.recent_fixes));
  check('30일 밖의 교정은 안 싣는다', !JSON.stringify(r2).includes('<b>x</b>'));
  const broke = { DB: { prepare() { throw new Error('boom'); } } };
  let threw = false, ret = null;
  try { ret = await W.logWarmupFix(broke, { sessionId: 's', userId: 'lee', fix: fix('a b', 'a c', '') }); } catch { threw = true; }
  check('logWarmupFix 는 DB 가 죽어도 던지지 않는다(웜업이 멈추면 안 된다)', !threw && ret === false);
  let threw2 = false, ret2 = null;
  try { ret2 = await W.readParentWarmup(broke.DB, 'lee', NOW); } catch { threw2 = true; }
  check('readParentWarmup 도 던지지 않고 «모름» 을 돌려준다', !threw2 && ret2 && ret2.spoke_sessions_this_month === null && ret2.fixes_recorded === false);
}

// ───────────────────────── ② 서버 배선 ─────────────────────────
console.log('\n② 대시보드·월간 성적표 배선');
const STU = strip(readFileSync(STU_SRC, 'utf8'));
const REP_LEN_OK = () => strip(readFileSync(REP_SRC, 'utf8')).length > 20000;
const rIdx = STU.indexOf("path === '/api/parent/dashboard'");
const route = rIdx >= 0 ? blockFrom(STU, STU.indexOf('{', rIdx)) : '';
check('전제: 대시보드 라우트를 오려 냈다', route.length > 500, String(route.length));
check('전제: 주석 벗기기가 파일을 먹지 않았다', STU.length > 50000 && REP_LEN_OK(), String(STU.length));
const callIdx = route.search(/readParentWarmup\(\s*env\.DB\s*,\s*childUid\s*,/);
const gateIdx = route.indexOf("error: 'auth_required'");
const pwIdx = route.indexOf("error: 'password_not_set'");
check('readParentWarmup 을 «childUid(DB 표기)» 로 부른다', callIdx > 0);
check('그 호출은 본인확인·비밀번호 게이트 «뒤» 에 있다', callIdx > gateIdx && callIdx > pwIdx && gateIdx > 0 && pwIdx > 0,
  `call=${callIdx} gate=${gateIdx} pw=${pwIdx}`);
const jsonRet = route.slice(route.lastIndexOf('return json({'));
check('응답에 warmup 칸을 싣는다', /\bwarmup\b\s*[,}]/.test(jsonRet) || /\bwarmup\s*:/.test(jsonRet));
const callLine = route.slice(callIdx - 120, callIdx);
check('호출이 죽은 조건 안에 있지 않다', !/if\s*\(\s*(false|0)\b/.test(callLine), callLine);

const REP = strip(readFileSync(REP_SRC, 'utf8'));
const bIdx = REP.indexOf('async function buildMonthlyReportData');
const body = bIdx >= 0 ? blockFrom(REP, REP.indexOf('{', REP.indexOf(')', bIdx))) : '';
check('전제: buildMonthlyReportData 를 오려 냈다', body.length > 500);
check('월간 데이터가 warmupCountsBetween(env.DB, uid, start, end) 를 부른다',
  /warmupCountsBetween\(\s*env\.DB\s*,\s*uid\s*,\s*start\s*,\s*end\s*\)/.test(body));
check('월간 데이터 반환에 warmup 칸이 있다', /\n\s*warmup\s*:\s*warmupCounts\s*,/.test(body));
check('짝: ai_activity_count 의 뜻을 바꾸지 않았다(웜업을 더하지 않음)', !/aiActivityCount\s*[+]?=.*warmup/i.test(body));

// ───────────────────────── ③ 화면: pdWarmupHtml 을 실제로 돌린다 ─────────────────────────
console.log('\n③ parent.html — pdWarmupHtml 을 오려 내 실제로 그린다');
const HTML = readFileSync(PARENT_SRC, 'utf8');
const fIdx = HTML.indexOf('function pdWarmupHtml(');
const fOpen = fIdx >= 0 ? HTML.indexOf('{', fIdx) : -1;
const fn = fIdx >= 0 ? HTML.slice(fIdx, fOpen) + blockFrom(HTML, fOpen) : '';
check('전제: pdWarmupHtml 을 오려 냈다', fn.length > 300, String(fn.length));
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (Number(n) || 0).toLocaleString('ko-KR');
const fmtDate = (ms) => (ms ? '10월 14일' : '-');
let render = null;
try { render = new Function('esc', 'fmt', 'fmtDate', fn + '\nreturn pdWarmupHtml;')(esc, fmt, fmtDate); } catch (e) { FAILS.push('compile: ' + e.message); }
check('전제: 컴파일된다', typeof render === 'function');
const R = (w, en) => { try { return render(w, !!en); } catch (e) { return 'THROW:' + e.message; } };
const text = (h) => String(h).replace(/<[^>]+>/g, '');
const W1 = { month: '2026-10', sessions_this_month: 5, spoke_sessions_this_month: 4, days_this_month: 3, fixes_recorded: true,
  recent_fixes: [
    { from: 'She like cats.', to: 'She likes cats.', why_ko: '3인칭 단수', at: 1 },
    { from: '<img src=x onerror=alert(1)>', to: 'It is', why_ko: '<script>x</script>', at: 2 },
    { from: 'THIRD', to: 'third', why_ko: '', at: 3 },
  ] };
const h1 = R(W1, false);
check('값이 있으면 «4회 · 3일» 을 그린다', /4\s*회\s*·\s*3\s*일/.test(text(h1)), text(h1).slice(0, 120));
check('열고 말 안 한 1회는 «빼고 셌다» 고 말한다', /1회는 빼고/.test(text(h1)));
check('교정 예: 학생 문장 → 고친 문장 + 이유', h1.includes('She like cats.') && h1.includes('She likes cats.') && h1.includes('3인칭 단수'));
check('교정 예는 최대 2개', !h1.includes('THIRD'));
check('서버 값은 이스케이프한다(스크립트·태그가 안 들어간다)', !h1.includes('<img') && !h1.includes('<script>') && h1.includes('&lt;img'));
check('data-ko/data-en 은 «글자만» 담은 span 에만 (안에 다른 태그 없음)',
  /data-ko=/.test(h1) && !/data-ko="[^"]*"[^>]*>[^<]*<(?!\/span)/.test(h1));
const h1en = R(W1, true);
check('영어 화면이면 영어로', /4\s*times\s*·\s*3\s*days/.test(text(h1en)) && /corrected/i.test(text(h1en)), text(h1en).slice(0, 120));
check('짝: 서버가 warmup 칸을 안 보내면 null(카드 감춤)', R(undefined) === null && R(null) === null);
const hU = R({ month: '2026-10', sessions_this_month: null, spoke_sessions_this_month: null, days_this_month: null, fixes_recorded: false, recent_fixes: [] });
check('횟수를 모르면 «—» 이고 «0회» 라고 지어내지 않는다', /—/.test(text(hU)) && !/0\s*회/.test(text(hU)), text(hU).slice(0, 120));
const hNR = R({ month: '2026-10', sessions_this_month: 2, spoke_sessions_this_month: 2, days_this_month: 1, fixes_recorded: false, recent_fixes: [] });
check('교정 기록이 연결 전이면 «아직 기록하고 있지 않아요»(예를 지어내지 않음)', /아직 기록하고 있지 않/.test(text(hNR)) && !/pd-wu-fix/.test(hNR));
const hE = R({ month: '2026-10', sessions_this_month: 2, spoke_sessions_this_month: 2, days_this_month: 1, fixes_recorded: true, recent_fixes: [] });
check('짝: 기록은 되는데 0건이면 «없어요» (연결 전 문구와 다르다)', /고쳐 준 표현이 없어요/.test(text(hE)) && !/아직 기록하고 있지 않/.test(text(hE)));
const h0 = R({ month: '2026-10', sessions_this_month: 0, spoke_sessions_this_month: 0, days_this_month: 0, fixes_recorded: true, recent_fixes: [] });
check('0회면 «0회» + «아직 말을 시작한 기록이 없어요»', /0\s*회/.test(text(h0)) && /아직 웜업에서 말을 시작한 기록이 없어요/.test(text(h0)));

// 카드·배선
check('카드 마크업이 있고 처음엔 감춰져 있다', /id="pd-warmup-card"[^>]*display:none/.test(HTML));
const PSTRIP = strip(HTML);
const wireIdx = PSTRIP.indexOf("getElementById('pd-warmup-card')");
const wire = wireIdx >= 0 ? blockFrom(PSTRIP, PSTRIP.lastIndexOf('{', wireIdx)) : '';
check('전제: pdRender 의 웜업 블록을 오려 냈다', wire.includes('pdWarmupHtml'));
/* 배선을 «실제로» 돌린다 — `if (false)` 한 글자에 뚫리지 않게 */
function runWire(d, startShown) {
  /* 새로고침으로 다시 그릴 때 카드가 «이미 보이는» 상태일 수 있다 — 그때도 감추는지 본다 */
  const els = { 'pd-warmup-card': { style: { display: startShown ? '' : 'none' } }, 'pd-warmup': { innerHTML: '' } };
  const doc = { getElementById: (id) => els[id] || null };
  try { new Function('document', 'd', 'pdWarmupHtml', 'window', 'getLang', wire)(doc, d, render, {}, () => 'ko'); }
  catch (e) { return { err: e.message }; }
  return { shown: els['pd-warmup-card'].style.display !== 'none', html: els['pd-warmup'].innerHTML };
}
const wOn = runWire({ warmup: W1 });
check('배선: warmup 이 오면 카드를 보이고 그린다', wOn.shown === true && /4/.test(wOn.html), JSON.stringify(wOn).slice(0, 160));
const wOff = runWire({}, true);
check('짝: warmup 이 없으면 카드를 감춘다', wOff.shown === false, JSON.stringify(wOff));

// 대비 — 교정 예의 빨강·초록 글자를 카드 안 상자(--pd-tint) 위에서 잰다
const tok = (n) => { const m = HTML.match(new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})')); return m ? m[1] : null; };
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
for (const t of ['pd-red', 'pd-green', 'pd-ink2', 'pd-muted']) {
  const c = tok(t), bg = tok('pd-tint');
  const v = c && bg ? cr(c, bg) : 0;
  console.log(`     ${t} on pd-tint = ${v.toFixed(2)}`);
  check(`대비 ${t} / pd-tint ≥ 4.5`, v >= 4.5, v.toFixed(2));
}
check('카드 안에서 pd-red·pd-green 토큰을 쓴다(테마 밖 하드코딩 색 없음)', /var\(--pd-red\)/.test(fn) && /var\(--pd-green\)/.test(fn) && !/#[0-9a-fA-F]{3,6}/.test(fn));

console.log(`\n${'─'.repeat(60)}`);
console.log(`학부모 웜업 카드 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);

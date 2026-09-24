// ═══════════════════════════════════════════════════════════════════════
// 🎥🤖 student_track_roster_harness — 학생 구분(화상+AI / AI만) 명부·요약 (2026-09-24)
//
// 무엇을 지키나
//   ① 판정 함수 rosterTrackOf 를 «소스에서 오려 내» 실제로 돌린다 — 모르면 unknown(AI만 아님)
//   ② 요약 SQL(loadTrackSummary)을 «소스에서 오려 내» 진짜 SQLite 에 돌린다
//      — 화상반 근거 셋(활성 예약·카페24 씨앗·수업방 접속)·자리표시 제외·30일·대소문자·스코프
//   ③ 명부 칸(행마다 track)과 요약 숫자가 «같은 말» 을 하는가 — 한쪽만 바뀌면 FAIL
//   ④ 요약의 AI만 인원 == A.i 사용료 청구(재원 − 화상반) 인원
//   ⑤ 서버 배선 — summary_only 는 명부 쿼리 «앞» 에서 돌아간다 · 행에 enrolled_now 가 실린다
//   ⑥ /branch 화면 — 첫 화면 두 요청 계약(boot 에 안 넣음) · 이름 칸을 서버가 주는 name 으로
//      · 모름을 0 으로 그리지 않음 · 탭 필터를 가짜 DOM 으로 실제로 돌림
// 판정은 문자열이 아니라 «실행» 으로 묻는다(CLAUDE.md 2장 — 문자열 하니스로는 못 잡는다).
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(ROOT, 'cloudflare-deploy');
const rd = (p) => fs.readFileSync(path.join(CF, p), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
};

/** 여는 중괄호부터 짝 맞는 닫는 중괄호까지(문자열·템플릿 안 괄호는 대략 무시 — 이 파일들엔 없음) */
function blockFrom(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}

const st = rd('src/student-track-roster.ts');
const bill = rd('src/ai-billing.ts');
const exec = rd('src/exec-summary.ts');
const api = rd('src/api-admin.ts');
const br = rd('public/branch.html');

// ── 정본 조각 읽기 ─────────────────────────────────────────────────────
const LIVE_UIDS_SQL = (bill.match(/export const LIVE_UIDS_SQL = `([\s\S]*?)`;/) || [])[1] || '';
const LOOKBACK = Number((bill.match(/export const LIVE_LOOKBACK_DAYS = (\d+);/) || [])[1]);
ok('전제: 청구 정본 LIVE_UIDS_SQL·30일을 소스에서 읽었다', LIVE_UIDS_SQL.length > 50 && LOOKBACK > 0);
const activeSrc = blockFrom(exec, exec.indexOf('export function activeCond'));
const enrolledSrc = blockFrom(exec, exec.indexOf('export function enrolledCond'));
const stripSig = (s, name) => s.replace(/export function (\w+)\([^)]*\)\s*:\s*[^{]+\{/, `function ${name}(alias){`);
// eslint-disable-next-line no-new-func
const { activeCond, enrolledCond } = new Function(
  stripSig(activeSrc, 'activeCond') + '\n' + stripSig(enrolledSrc, 'enrolledCond') + '\nreturn { activeCond, enrolledCond };')();
ok('전제: 재원 판정 정본(enrolledCond)을 소스에서 읽었다', /end_date/.test(enrolledCond('s')));

// ① rosterTrackOf ──────────────────────────────────────────────────────
console.log('\n① rosterTrackOf — 한 줄의 트랙');
const rtSrc = blockFrom(st, st.indexOf('export function rosterTrackOf'));
let rosterTrackOf = null;
try {
  rosterTrackOf = new Function(rtSrc.replace(/export function rosterTrackOf\([^)]*\)\s*:\s*\w+\s*\{/, 'function rosterTrackOf(uid, enrolledNow, live){') + '\nreturn rosterTrackOf;')();
} catch (e) { console.log('   (오려 내기 실패: ' + e.message + ')'); }
ok('전제: rosterTrackOf 를 오려 냈다', typeof rosterTrackOf === 'function');
const run = (...a) => { try { return rosterTrackOf(...a); } catch (e) { return 'THROW:' + e.message; } };
const LS = new Set(['kim', 'abc']);
ok('화상반 목록에 있으면 live_ai', run('abc', 1, LS) === 'live_ai');
ok('대소문자만 달라도 live_ai(청구 쪽과 같은 규칙)', run('Kim', 0, LS) === 'live_ai');
ok('재원 중인데 화상반 아니면 ai_only', run('zz', 1, LS) === 'ai_only');
ok('재원도 화상도 아니면 none(AI만으로 세지 않는다)', run('zz', 0, LS) === 'none');
ok('화상반 목록을 못 읽으면 unknown — ⛔ ai_only 로 떨어뜨리지 않는다', run('zz', 1, null) === 'unknown');
ok('아이디가 비면 unknown', run('', 1, LS) === 'unknown');

// ② 요약 SQL — 진짜 SQLite ───────────────────────────────────────────
console.log('\n② loadTrackSummary SQL — 진짜 SQLite');
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch (_) {}
const sumFn = blockFrom(st, st.indexOf('export async function loadTrackSummary'));
const sqlTpl = (sumFn.match(/const sql = (`[\s\S]*?`);/) || [])[1] || '';
ok('전제: 요약 SQL 을 소스에서 오려 냈다', sqlTpl.length > 50);
if (!DatabaseSync) {
  console.log('   ⏭ node:sqlite 없음 — ②~④ 건너뜀');
} else {
  const NOW = Date.now(), DAY = 86400000;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, franchise TEXT, shop_name TEXT, status TEXT, end_date TEXT);
           CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, room_id TEXT, joined_at INTEGER);`);
  const insS = db.prepare('INSERT INTO students_erp VALUES (?,?,?,?,?)');
  // [아이디, 지사, 대리점, 상태, 종료일]
  [
    ['a_live_sched', '부산', '해운대', 'active', null],   // 활성 예약 → 화상
    ['b_live_c24', '부산', '해운대', 'inactive', null],   // 카페24 씨앗 최근 → 화상(재원 아니어도)
    ['c_ai', '부산', '해운대', 'active', null],           // 재원 · 화상 없음 → AI만
    ['d_gone', '부산', '해운대', 'inactive', null],       // 재원 아님 · 화상 없음 → 어디에도 안 셈
    ['Kim', '부산', '서면', 'active', null],              // 예약은 'kim' 소문자 → 화상
    ['f_old_c24', '부산', '서면', 'active', null],        // 카페24 기록 40일 전 → AI만
    ['g_class', '부산', '서면', 'active', null],          // 망고아이 수업방 접속(account_uid) → 화상
    ['h_other', '서울', '강남', 'active', null],          // 다른 지사 AI만
    ['i_ended', '부산', '해운대', 'active', '2000-01-01'], // 종료일 지남 → 재원 아님
    ['j_cancel', '부산', '서면', 'active', null],         // 예약이 cancelled 뿐 → AI만
  ].forEach(r => insS.run(...r));
  const insC = db.prepare('INSERT INTO class_schedules (user_id,status) VALUES (?,?)');
  insC.run('a_live_sched', 'active'); insC.run('kim', 'active'); insC.run('lms', 'active'); insC.run('type_seed', 'active');
  insC.run('j_cancel', 'cancelled');
  const insA = db.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)');
  insA.run('b_live_c24', null, 'c24-1', NOW - 3 * DAY);
  insA.run('f_old_c24', null, 'c24-2', NOW - 40 * DAY);
  insA.run('u_x81', 'g_class', 'class-9-20260920', NOW - 2 * DAY);

  const buildSql = (where) => new Function('LIVE_UIDS_SQL', 'enrolledCond', 'where', 'return ' + sqlTpl)(LIVE_UIDS_SQL, enrolledCond, where);
  const since = NOW - LOOKBACK * DAY;
  const summ = (cond, binds) => {
    const rows = db.prepare(buildSql(cond)).all(since, since, ...binds);
    let live = 0, ai = 0; const orgs = {};
    for (const x of rows) { live += Number(x.live_n); ai += Number(x.ai_n); orgs[x.shop_name] = [Number(x.live_n), Number(x.ai_n)]; }
    return { live, ai, orgs };
  };
  let all = null;
  try { all = summ('', []); } catch (e) { console.log('   (SQL 실행 실패: ' + e.message + ')'); }
  ok('SQL 이 실제로 돈다', !!all);
  if (all) {
    ok('화상 = 활성예약·카페24 최근·대소문자·수업방 접속 = 4명', all.live === 4, all);
    ok('AI만 = 재원 − 화상 = c_ai·f_old_c24·h_other·j_cancel = 4명', all.ai === 4, all);
    ok('해운대: 화상 2 · AI만 1(재원 아님·종료일 지남은 안 셈)', JSON.stringify(all.orgs['해운대']) === '[2,1]', all.orgs);
    ok('서면: 화상 2 · AI만 2(40일 전 카페24·취소된 예약은 화상 아님)', JSON.stringify(all.orgs['서면']) === '[2,2]', all.orgs);
    ok('자리표시(lms·type_seed) 예약은 아무도 화상으로 만들지 않는다', !all.orgs['']);
    const bs = summ(`s.franchise LIKE ?`, ['부산%']);
    ok('스코프(부산 지사)로 자르면 서울 학생이 빠진다', bs.ai === 3 && !bs.orgs['강남'], bs);

    // ③ 명부 칸과 요약이 같은 말을 하는가 ─────────────────────────
    console.log('\n③ 명부 칸(행마다 track) ↔ 요약 숫자');
    const liveSet = new Set(db.prepare(LIVE_UIDS_SQL).all(since, since).map(r => String(r.uid).toLowerCase()));
    const exprSrc = blockFrom(st, st.indexOf('export function enrolledNowExpr'));
    const enrolledNowExpr = new Function('enrolledCond', exprSrc.replace(/export function enrolledNowExpr\([^)]*\)\s*:\s*\w+\s*\{/, 'function enrolledNowExpr(alias){') + '\nreturn enrolledNowExpr;')(enrolledCond);
    const rows = db.prepare(`SELECT s.user_id, ${enrolledNowExpr('s')} AS enrolled_now FROM students_erp s`).all();
    const cnt = { live_ai: 0, ai_only: 0, none: 0, unknown: 0 };
    rows.forEach(r => { cnt[rosterTrackOf(r.user_id, r.enrolled_now, liveSet)]++; });
    ok('명부의 화상+AI 수 == 요약의 화상 수', cnt.live_ai === all.live, cnt);
    ok('명부의 AI만 수 == 요약의 AI만 수', cnt.ai_only === all.ai, cnt);
    ok('재원 아님(d_gone·i_ended)은 none 으로 따로 보인다', cnt.none === 2, cnt);

    // ④ 청구 인원과 같은가 ─────────────────────────────────────────
    console.log('\n④ A.i 사용료 청구(재원 − 화상반)와 같은 인원인가');
    const roster = db.prepare(`SELECT user_id FROM students_erp WHERE shop_name = ? AND ${enrolledCond('')}`).all('서면')
      .filter(r => !liveSet.has(String(r.user_id).toLowerCase()));
    ok('서면 청구 인원 == 요약 AI만(서면)', roster.length === all.orgs['서면'][1], roster.length);
  }
}

// ⑤ 서버 배선 ─────────────────────────────────────────────────────────
console.log('\n⑤ 서버 배선 — /api/admin/students/unified');
const hi = api.indexOf("path === '/api/admin/students/unified'");
const h = blockFrom(api, hi);
ok('전제: 핸들러를 잘라 냈다', h.length > 1000);
const iOnly = h.indexOf('if (_summaryOnly)'), iMain = h.indexOf('WITH page AS');
ok('summary_only 는 명부 쿼리 «앞» 에서 돌아간다(명부를 안 읽는다)', iOnly > 0 && iMain > 0 && iOnly < iMain);
const onlyBlk = blockFrom(h, iOnly);
ok('summary_only 갈래는 정본 loadTrackSummary 를 부르고 return 한다', /loadTrackSummary\(/.test(onlyBlk) && /return json\(/.test(onlyBlk));
ok('행마다 enrolled_now 를 page·바깥 SELECT 둘 다에 싣는다',
  /enrolledNowExpr\('s'\)\}\s*AS enrolled_now/.test(h) && /p\.enrolled_now/.test(h));
ok('track=1 이면 정본 attachRosterTracks 로 칸을 붙인다', /if \(_wantTrack\)[^\n]*attachRosterTracks\(/.test(h));
ok('shop 필터는 완전일치 바인드(LIKE 아님) · 요약처럼 TRIM', /conds\.push\(`TRIM\(s\.shop_name\) = \?`\); binds\.push\(_shop\)/.test(h));
ok('요약은 스코프(_ssw) 조건을 그대로 넘긴다', /loadTrackSummary\(env as any, _ssw\.cond, _ssw\.binds/.test(h));
ok('⛔ 트랙을 students_erp 에 저장하지 않는다(UPDATE 없음)', !/UPDATE students_erp[^`]*track/i.test(st + h));

// ⑥ /branch 화면 ──────────────────────────────────────────────────────
console.log('\n⑥ /branch 화면');
const bootBlk = blockFrom(br, br.indexOf('function boot()'));
ok('첫 화면 두 요청 계약 — boot() 에 학생 구분 요청을 넣지 않았다', bootBlk.length > 0 && !/unified/.test(bootBlk));
ok('학생 구분 카드는 첫 페인트 «뒤» setTimeout 으로 받는다', /setTimeout\(function\(\)\{ if \(window\.__dashTrack\) window\.__dashTrack\(\); \}, \d{4}\)/.test(br));
ok('명부는 track=1 로 받는다', /students\/unified\?track=1/.test(br));
const ptStart = br.indexOf('function paintTrack(){');
const ptBlk = blockFrom(br, ptStart);
ok('요약을 못 읽으면(ok:false) 숫자 대신 «확인하지 못했습니다» — 0명으로 그리지 않는다',
  /if \(!ts \|\| !ts\.ok\)/.test(ptBlk) && ptBlk.indexOf('확인하지 못했습니다') > 0 && ptBlk.indexOf('확인하지 못했습니다') < ptBlk.indexOf('tkpis'));

// 가짜 DOM 으로 paintStudents 실제 실행
const segStart = br.indexOf('  var TRK = {');
const segEnd = br.indexOf('/* 🎥🤖 대시보드');
const code = br.slice(segStart, segEnd);
const els = {
  stuBody: { className: '', innerHTML: '', textContent: '' },
  stuSeg: { hidden: true, innerHTML: '' },
  stuQ: { value: '' },
};
const D = { students: null };
const win = {};
let paint = null;
try {
  new Function('D', 'window', 'document', 'T', 'esc', code)(D, win,
    { getElementById: (id) => els[id] || null },
    (en, ko) => ko, (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  paint = win.paintStudents;
  win.openCard = () => {};
} catch (e) { console.log('   (실행 실패: ' + e.message + ')'); }
ok('전제: paintStudents 를 오려 내 실행했다', typeof paint === 'function');
if (paint) {
  D.students = { ok: true, track_ok: true, students: [
    { user_id: 'kimsy', name: '김서윤', shop_name: '해운대', track: 'live_ai', status: 'active' },
    { user_id: 'cyn7', name: 'cyn7', shop_name: '해운대', track: 'ai_only', status: 'active' },
    { user_id: 'jmj', name: '정민재', shop_name: '서면', track: 'ai_only', status: 'active' },
    { user_id: 'old1', name: '박옛날', shop_name: '서면', track: 'none', status: 'inactive' },
    { user_id: 'q9', name: '한지우', shop_name: '서면' },   // track 없음(옛 캐시) → 확인 못 함
  ] };
  const safe = (f) => { try { f(); return true; } catch (e) { console.log('   (' + e.message + ')'); return false; } };
  ok('전체 탭이 그려진다', safe(() => paint()) && els.stuSeg.hidden === false);
  ok('탭 숫자: 전체 5 · 화상+AI 1 · AI만 2 · 재원 아님 1 · 확인 못 함 1',
    /전체 5/.test(els.stuSeg.innerHTML) && /화상\+AI 1/.test(els.stuSeg.innerHTML) && /AI만 2/.test(els.stuSeg.innerHTML)
    && /재원 아님 1/.test(els.stuSeg.innerHTML) && /확인 못 함 1/.test(els.stuSeg.innerHTML), els.stuSeg.innerHTML);
  ok('이름이 아이디와 같으면 «이름 미등록»(예전 «(no name)» 대신)', /이름 미등록/.test(els.stuBody.innerHTML) && !/\(no name\)/.test(els.stuBody.innerHTML));
  ok('track 이 없는 행은 «확인 못 함» — AI만으로 그리지 않는다', (els.stuBody.innerHTML.match(/trk-unk/g) || []).length === 1);
  safe(() => win.stuTabSet('ai_only'));
  const rowsN = (els.stuBody.innerHTML.match(/class="row"/g) || []).length;
  ok('AI만 탭 → 2줄만', rowsN === 2, rowsN);
  ok('짝: AI만 탭에 화상 학생(김서윤)이 안 나온다', !/김서윤/.test(els.stuBody.innerHTML));
  safe(() => win.stuTabSet('live_ai'));
  ok('짝: 화상+AI 탭에는 김서윤만', /김서윤/.test(els.stuBody.innerHTML) && !/정민재/.test(els.stuBody.innerHTML));
  safe(() => win.stuGo('all', '서면'));
  const r2 = (els.stuBody.innerHTML.match(/class="row"/g) || []).length;
  ok('대리점 줄을 누르면 그 대리점 학생만(서면 3명) + 📍 표시', r2 === 3 && /📍 서면/.test(els.stuBody.innerHTML), r2);
  safe(() => win.stuShopClear());
  ok('📍 ✕ 로 모든 대리점으로 돌아온다', (els.stuBody.innerHTML.match(/class="row"/g) || []).length === 5);
  D.students.track_ok = false; safe(() => paint());
  ok('서버가 track_ok:false 면 그 사실을 글로 말한다', /확인하지 못해/.test(els.stuBody.innerHTML));
}

// ⑦ 관리자 화면 배선 ─────────────────────────────────────────────────
console.log('\n⑦ 관리자 화면');
const adm = rd('public/admin.html');
const jsRaw = rd('public/js/adm-student-track.js');
// 부정 검사는 주석을 벗긴 사본으로(설명 주석이 그 낱말을 담는다). 블록주석 추적 + 문자열 밖 // 만 제거.
function stripComments(src){
  let out = '', i = 0, inBlock = false, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
const js = stripComments(jsRaw);
ok('전제: 주석을 벗겨도 코드는 남는다', js.length > jsRaw.length * 0.5 && /getJson\(/.test(js));
ok('학생관리 안에 학생 구분 칸이 있다', /<details id="sm-student-track" class="sub-item">/.test(adm) && /id="stk-body"/.test(adm));
ok('스크립트를 defer 로 싣는다', /<script src="\/js\/adm-student-track\.js\?v=\d+" defer><\/script>/.test(adm));
ok('관리자 함정: 카드 안에 <button> 을 만들지 않는다(전역 파랑 알약 규칙)', !/<button/.test(js));
ok('관리자 함정: 인라인 «background:» 대신 background-color', !/[^-]background:/.test(js));
ok('관리자 함정: 스타일은 body 에 붙인다', /document\.body\.appendChild\(st\)/.test(js));
ok('언어 이벤트를 document·window 둘 다 듣는다', /document\.addEventListener\('mangoi:lang-changed'/.test(js) && /window\.addEventListener\('mangoi:lang-changed'/.test(js));
ok('⛔ 상주 타이머·관찰자 없음', !/setInterval|MutationObserver/.test(js));
ok('대리점 명부는 shop= + track=1 로 받는다', /\?track=1&shop=/.test(js));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

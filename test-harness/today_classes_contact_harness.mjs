#!/usr/bin/env node
/**
 * ☎️🏫🆔 매니저 「오늘 수업」에 학생 아이디·연락처·학원 (2026-09-07)
 *
 * 왜 만들었나
 *   매니저 피드백: «Please include student Name, ID, contact number, Academy on managers schedule».
 *   수업에 아무도 안 들어올 때 그 줄에서 바로 학생을 찾아야 하는데, 목록에 이름밖에 없어
 *   명부 화면을 따로 열어야 했다.
 *
 * 📊 [잰 것 — 2026-09-07 운영 D1]
 *   · `students_erp` 29,484행의 phone · parent_phone · student_phone 은 **세 칸 전부 0건**이다.
 *     (카페24 원본에 값이 없다 — CLAUDE.md 2장 「학생 전화번호로 문자를 보내려는데 아무에게도 안 감」)
 *     ⇒ 그 칸을 연락처로 읽으면 **영원히 빈칸**이고, 화면은 «고장» 으로 읽힌다.
 *   · `student_retention` 은 223행 중 199행에 번호가 있다. 예약이 잡힌 학생 444명 기준 105명(23.6%).
 *     ⚠️ 그 표는 «이탈 위험 학생 스냅샷» 이라 전체 명부가 아니다 — 카페24 서버가 밀어 넣고,
 *        이번 스냅샷에 없는 학생은 지워진다(api-retention.ts handleRetentionIngest).
 *        즉 «없음» 이 정상이고, 화면은 그 이유를 말해야 한다.
 *   · `students_erp.shop_name`(학원) 29,079/29,484 = 98.6%. 예약 학생 444명 기준 434명(97.7%).
 *
 * 이 하니스가 지키는 것
 *   ① 서버가 두 갈래(망고아이 예약 · 카페24) **모두** 에 academy·contact_phone 을 싣는다
 *      — 한 갈래만 실으면 「어떤 줄은 나오고 어떤 줄은 안 나온다」가 된다.
 *   ② 연락처를 `students_erp` 의 phone 칸에서 읽지 않는다 (그 칸은 0건 — 되살리면 늘 빈칸)
 *   ③ 연락처 조회가 실패해도 목록 전체가 죽지 않는다 (try/catch 안)
 *   ④ 화면 표의 «머리칸 수 = 줄칸 수» (칸을 늘릴 때 한쪽만 고치면 표가 통째로 밀린다)
 *   ⑤ 값이 없을 때 «—» 와 «왜 없는지» 를 말한다 (빈칸은 «고장» 으로 읽힌다)
 *   ⑥ 화면에 그린 칸은 검색도 함께 훑는다 (아니면 「보이는데 검색하면 0건」)
 *   ⑦ manager.html 도 같은 칸을 그린다 (한쪽만 그리면 화면마다 답이 다르다)
 *
 * ⚠️ 문자열로만 검사하지 않는다 — 화면 파일을 **실제로 실행해서** 표를 그려 보고 센다.
 *    (「그 낱말이 있는가」로 재면 주석만 남겨도 통과한다 — CLAUDE.md 2장 반복 교훈)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ADMIN_TS = readFileSync(join(__dir, '../cloudflare-deploy/src/api-admin.ts'), 'utf8');
const TCJS_PATH = join(__dir, '../cloudflare-deploy/public/js/adm-today-classes.js');
const TCJS = readFileSync(TCJS_PATH, 'utf8');
const MANAGER = readFileSync(join(__dir, '../cloudflare-deploy/public/manager.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok) {
  if (ok) { PASS++; console.log('  ✅ ' + label); }
  else { FAIL++; FAILS.push(label); console.log('  ⚠ FAIL ' + label); }
}

/* 주석을 벗긴 사본 — 부정 검사(«이 낱말이 없어야 한다»)는 반드시 이쪽으로 판정한다.
   «쓰지 말 것» 이라고 적어 둔 설명 주석을 검사가 자기 자신을 잡는 사고가 이 저장소에 실재한다. */
function stripComments(t) {
  let out = '', i = 0, inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = l.indexOf('/*');
      if (b < 0) break;
      const e = l.indexOf('*/', b + 2);
      if (e < 0) { l = l.slice(0, b); inBlock = true; break; }
      l = l.slice(0, b) + l.slice(e + 2);
    }
    out += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}

// ── ⓪ 핸들러 본문만 떼어낸다 (길이로 자르지 않는다 — 늘어나면 뒤가 잘려 거짓 실패가 난다) ──
const hStart = ADMIN_TS.indexOf(`path === '/api/admin/classes/today'`);
check('⓪ /api/admin/classes/today 핸들러를 찾았다', hStart > 0);
const hEnd = (() => {
  const nxt = ADMIN_TS.indexOf("path === '/api/admin/class-audit'", hStart + 40);
  return nxt > hStart ? nxt : hStart + 14000;
})();
const HANDLER = hStart > 0 ? ADMIN_TS.slice(hStart, hEnd) : '';
const HANDLER_NC = stripComments(HANDLER);

// ── ① 두 갈래 모두에 academy·contact_phone 이 실린다 ────────────────────
/* sessions.push({...}) 두 덩어리를 중괄호 짝으로 잘라 «각각» 본다.
   합쳐서 「파일에 두 번 나온다」로 세면 한 갈래에 두 번 적어도 통과한다. */
function pushBlocks(src) {
  const out = []; let from = 0;
  for (;;) {
    const i = src.indexOf('sessions.push({', from);
    if (i < 0) break;
    let d = 0, j = src.indexOf('{', i);
    const start = j;
    for (; j < src.length; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}') { d--; if (d === 0) break; }
    }
    out.push(src.slice(start, j + 1));
    from = j + 1;
  }
  return out;
}
const PUSHES = pushBlocks(HANDLER_NC);
check('① sessions.push 가 두 갈래(망고아이·카페24) 있다', PUSHES.length === 2);
check('①-a 두 갈래 모두 academy 를 싣는다', PUSHES.length === 2 && PUSHES.every(b => /\bacademy\s*:/.test(b)));
check('①-b 두 갈래 모두 contact_phone 을 싣는다', PUSHES.length === 2 && PUSHES.every(b => /\bcontact_phone\s*:/.test(b)));
check('①-c 두 갈래 모두 student_uid(아이디)를 싣는다', PUSHES.length === 2 && PUSHES.every(b => /\bstudent_uid\s*:/.test(b)));

// ── ② 학원은 students_erp.shop_name 에서 온다 (두 SELECT 모두) ──────────
const selCount = (HANDLER_NC.match(/se\.shop_name\s+AS\s+se_shop/g) || []).length;
check('② 두 조회(망고아이·카페24) 모두 se.shop_name 을 뽑는다', selCount === 2);

// ── ③ 연락처를 students_erp 의 phone 칸에서 읽지 않는다 ─────────────────
/*  ⛔ 그 세 칸은 운영 D1 에서 0건이다 — 되살리면 «고쳤는데 안 나온다» 가 된다.
    (여기서 보는 것은 이 핸들러뿐이다. 다른 화면은 각자 사정이 있다.) */
check('③ 연락처를 se.phone / se.parent_phone / se.student_phone 에서 읽지 않는다',
  !/se\.(parent_phone|student_phone|phone)\b/.test(HANDLER_NC));
check('③-b 연락처 정본은 student_retention.phone 이다',
  /FROM\s+student_retention[\s\S]{0,200}phone/.test(HANDLER_NC));

// ── ④ 연락처 조회 실패가 목록 전체를 멈추지 않는다 ──────────────────────
/*  「try 안인가」를 중괄호 세기로 재면 객체 리터럴과 블록을 못 가른다(CLAUDE.md 2장).
    그래서 «그 조회 바로 뒤에 catch 가 오는가» 로 본다 — 조회를 try 밖으로 빼면 이 모양이 깨진다. */
const retIdx = HANDLER_NC.indexOf('FROM student_retention');
const afterRet = retIdx > 0 ? HANDLER_NC.slice(retIdx, retIdx + 700) : '';
check('④ 연락처 조회가 try/catch 로 감싸여 있다 (실패해도 목록은 뜬다)',
  retIdx > 0 && /catch\s*\(/.test(afterRet));

// ── ⑤~⑥ 화면을 실제로 그려서 센다 ─────────────────────────────────────
function renderOnce(sessions, opts = {}) {
  const els = {};
  const mk = (id) => (els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', checked: false, addEventListener() {}, removeEventListener() {} }));
  mk('tc-body'); mk('tc-count');
  if (opts.q != null) mk('tc-q').value = opts.q;
  const doc = { getElementById: (id) => els[id] || null, dispatchEvent: () => true, addEventListener() {} };
  const win = { adminLang: 'ko', addEventListener() {}, removeEventListener() {} };
  win.document = doc;
  const ctx = {
    window: win, document: doc,
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sessions, date: '2026-09-08', counts: {} }) }),
    console: { log() {}, warn() {}, error() {} },
    Date, Number, String, Math, JSON, Array, Object, RegExp, encodeURIComponent, decodeURIComponent, setTimeout,
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(TCJS, ctx, { filename: 'adm-today-classes.js' });
  return win.tcLoadToday().then(() => els['tc-body'].innerHTML);
}

const NOW = Date.now();
const SESSIONS = [
  { schedule_id: 11, source: 'mangoi', observable: true, room_id: 'class-11-20260908',
    student_uid: 'jye46712', student_name: '김선우', academy: '분당학원', contact_phone: '01012345678',
    level: 'Lv 3', textbook: 'BTS 2', textbook_assigned: true, teacher_name: 'KRYSTEL',
    start_ts: NOW + 600000, end_ts: NOW + 2400000, status: 'early', join_open: false, is_level_test: false },
  { schedule_id: null, source: 'cafe24', observable: false, room_id: 'c24-512470',
    student_uid: 'abc99', student_name: 'MANGO AI', academy: null, contact_phone: null,
    level: null, textbook: null, textbook_assigned: false, teacher_name: 'Teacher Shas',
    start_ts: NOW + 900000, end_ts: NOW + 2700000, status: 'early', join_open: false, is_level_test: false },
];

const html = await renderOnce(SESSIONS);
const thN = (html.match(/<th>/g) || []).length;
const trs = html.split('<tr>').slice(2);                       // thead 한 줄 제외
const tdN = trs.map(r => (r.match(/<td[ >]/g) || []).length);
check(`④-1 표의 머리칸 수(${thN}) = 각 줄의 칸 수(${tdN.join(',')})`,
  thN > 0 && tdN.length === 2 && tdN.every(n => n === thN));
check('④-2 「연락처」·「학원」 머리칸이 있다', /연락처/.test(html) && /학원/.test(html));

check('⑤-1 있는 연락처는 tel: 링크로 그린다 (매니저는 폰으로 본다)', /href="tel:01012345678"/.test(html));
check('⑤-2 번호를 읽기 좋게 끊어 준다', /010-1234-5678/.test(html));
check('⑤-3 학원 이름을 그린다', /분당학원/.test(html));
check('⑤-4 학생 아이디를 이름 밑에 그린다', /jye46712/.test(html));
check('⑤-5 값이 없으면 «—» 로 둔다 (지어내지 않는다)', (html.match(/>—</g) || []).length >= 2);
/* 🔴 (2026-09-07 함정 대조) 예전엔 이 검사가 «title 에 이유가 있는가» 였다 —
   그런데 title 툴팁은 **마우스 전용**이라 폰에서는 영원히 안 뜬다(CLAUDE.md 2장).
   즉 검사가 «폰에서 아무것도 안 보이는 상태» 를 정답으로 못 박고 있었다.
   ⇒ «화면에 보이는 글자» 로 말하는가로 바꾼다. */
check('⑤-6 없는 «이유» 를 화면에 보이는 줄로 말한다 (title 은 폰에서 안 뜬다)',
  /관리 대상|at-risk/.test(html) && !/title="[^"]*(전화번호가 저장돼 있지 않|no phone numbers)/.test(html));
check('⑤-7 그 안내는 «서버가 준 근거» 가 있을 때만 그린다 (화면이 스스로 판정하지 않는다)',
  /contact_source/.test(TCJS));

const htmlQ = await renderOnce(SESSIONS, { q: '분당학원' });
check('⑥-1 학원 이름으로 검색된다', /class-11-20260908/.test(htmlQ) && !/c24-512470/.test(htmlQ));
const htmlQ2 = await renderOnce(SESSIONS, { q: '5678' });
check('⑥-2 번호 뒷자리로 검색된다', /class-11-20260908/.test(htmlQ2) && !/c24-512470/.test(htmlQ2));
/* 🔴 (2026-09-07 함정 대조) 뒷자리만 시험하면 «저장값만 훑는» 상태가 그대로 통과한다 —
   실제로 그랬다: 화면은 「010-1234-5678」로 그리는데 검색은 「01012345678」만 알아
   **보이는 그대로 치면 0건**이었다. 보이는 표기로도 찾히는지 짝으로 본다. */
const htmlQ3 = await renderOnce(SESSIONS, { q: '010-1234-5678' });
check('⑥-3 화면에 보이는 표기 그대로(010-1234-5678) 검색된다',
  /class-11-20260908/.test(htmlQ3) && !/c24-512470/.test(htmlQ3));
const htmlQ4 = await renderOnce(SESSIONS, { q: '010-1234' });
check('⑥-4 보이는 표기의 앞부분(010-1234)으로도 검색된다',
  /class-11-20260908/.test(htmlQ4) && !/c24-512470/.test(htmlQ4));

// ── ⑦ manager.html 도 같은 칸을 그린다 ────────────────────────────────
const MGR_NC = stripComments(MANAGER);
check('⑦-1 manager.html 이 academy 를 그린다', /r\.academy/.test(MGR_NC));
check('⑦-2 manager.html 이 contact_phone 을 그린다', /r\.contact_phone/.test(MGR_NC));
check('⑦-3 manager.html 이 student_uid(아이디)를 그린다', /r\.student_uid/.test(MGR_NC));
check('⑦-4 manager.html 도 tel: 링크로 건다', /href="tel:/.test(MGR_NC));

// ── ⑧ 자산 버전 — 화면 js 를 고쳤으면 admin.html 의 ?v= 도 올라가 있어야 한다 ──
/*  (원장 대조는 asset_version_harness 가 한다. 여기서는 «부르는 곳이 있는가» 만 본다) */
const ADMIN_HTML = readFileSync(join(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
check('⑧ admin.html 이 adm-today-classes.js 를 ?v= 를 붙여 싣는다',
  /adm-today-classes\.js\?v=\d+/.test(ADMIN_HTML));

// ── ⑨ 개인정보 배선 (2026-09-07 함정 대조가 지적한 자리) ──────────────
/*  ⛔ 연락처는 «본사·내부직원» 에게만 — 이 API 는 isAgencyAllowedApi 에 올라 있어
    지사·대리점도 부른다. 그냥 실으면 지사장·학원장이 처음으로 학생 번호를 보게 된다. */
check('⑨-1 연락처를 본사·내부직원(hq/none)에게만 싣는다',
  /_ctSeeContact\s*=\s*_ctScope\.type\s*===\s*'hq'\s*\|\|\s*_ctScope\.type\s*===\s*'none'/.test(HANDLER_NC)
  && /if\s*\(\s*_ctSeeContact\s*\)/.test(HANDLER_NC));
check('⑨-2 화면이 «왜 없는지» 를 스스로 판정하지 않게 근거를 서버가 준다 (contact_source)',
  /contact_source\s*:/.test(HANDLER_NC));
/*  🔒 이제 이 응답에 전화번호가 실린다 — 공유 캐시에 앉으면 한 사람 것이 남에게 나간다. */
check('⑨-3 전화번호가 실린 응답에 Cache-Control: private, no-store 를 붙인다',
  /Cache-Control'\s*,\s*'private,\s*no-store'/.test(HANDLER_NC));
/*  ⚠️ ORDER BY 없이 LIMIT 만 걸면 «어느 2000» 인지 정해지지 않고 나머지는 조용히 «—» 가 된다. */
check('⑨-4 연락처 조회에 ORDER BY 가 있다 (잘릴 때 «어느 것» 인지 정해진다)',
  /FROM\s+student_retention[\s\S]{0,220}ORDER\s+BY/.test(HANDLER_NC));
/*  🔒 phoneMap 은 스코프가 안 걸린 «전체» 맵이다 — 이미 잘린 sessions.push 두 곳에만 붙어야 한다.
    다른 목록에 갖다 붙이는 순간 격리가 풀린다. */
const phoneUses = (HANDLER_NC.match(/phoneMap\.get\(/g) || []).length;
check('⑨-5 phoneMap 을 쓰는 곳이 스코프로 잘린 두 갈래뿐이다',
  phoneUses === 2 && PUSHES.filter(b => /phoneMap\.get\(/.test(b)).length === 2);
/*  ⑧ 두 화면이 같은 사실을 말하는가 */
check('⑨-6 manager.html 도 «왜 없는지» 를 같은 근거(contact_source)로 말한다',
  /contact_source/.test(MGR_NC));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);

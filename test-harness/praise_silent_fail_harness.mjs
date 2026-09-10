// praise_silent_fail_harness.mjs — ⭐ 칭찬 별의 «조용한 실패» 를 막는다 (2026-09-10)
//
// [왜 이 검사가 있나]
//   2026-09-10 사장님 「교사가 prize 를 줘도 학생 쪽에서 점수도 소리도 변화가 없어」.
//   실패하는 길이 셋(죽은 번호 · 계정 미등록 · 교사 세션 없음)인데 셋 다 화면에
//   한 글자도 안 그렸다. 그래서 어느 쪽인지조차 알 수 없었고, 실패 횟수도 못 셌다.
//
// [무엇을 못 박나]
//   A. 배선 — defer(idx-vc-mobilefix.js)가 «밖에서 감싸는» 이름들이 idx-main.js 에
//      실제로 있는가. 그 이름이 바뀌면 이 수리는 **조용히 헛돈다**(에러도 안 난다).
//   B. 실패 안내 — 학생 확인(ack)이 안 오면 서버에 한 번 묻고 사유를 말하는가.
//      ⚠️ «묻는다» 만 보면 «늘 묻는» 코드도 통과한다 → «학생이 답하면 안 묻는다» 를 짝으로 본다.
//   C. 이름표 재시도 — 계정을 늦게 읽어도 등록되는가.
//      ⚠️ «보낸다» 만 보면 «교사도 보내는» 코드가 통과한다 → «교사는 안 보낸다» 를 짝으로 본다.
//   D. 서버 폴백 — 번호가 죽었을 때 이름으로 찾되 «유일할 때만» 인가.
//      ⚠️ «찾는다» 만 보면 «아무나 집는» 코드가 통과한다 → «동명이인이면 안 붙는다» 를 짝으로.
//
// [어떻게] 문자열로 「그 줄이 있는가」를 묻지 않는다. 소스에서 절을 오려 내 **실제로 돌리고**,
//   서버 SQL 은 **진짜 SQLite** 에 돌린다. 되돌리면 실제로 FAIL 이 나는 것을 확인했다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const MOBILEFIX = join(ROOT, 'cloudflare-deploy/public/js/idx-vc-mobilefix.js');
const IDXMAIN = join(ROOT, 'cloudflare-deploy/public/js/idx-main.js');
const APIPOINTS = join(ROOT, 'cloudflare-deploy/src/api-points.ts');

const SRC_FIX = process.env.PRAISE_FIX_FILE || MOBILEFIX;
const FIX = readFileSync(SRC_FIX, 'utf8');
const MAIN = readFileSync(IDXMAIN, 'utf8');
const API = readFileSync(APIPOINTS, 'utf8');

let pass = 0, fail = 0;
const ok = (t) => { pass++; console.log(`  ✅ ${t}`); };
const no = (t, d) => { fail++; console.log(`  ❌ ${t}${d ? ' — ' + d : ''}`); };
const is = (c, t, d) => (c ? ok(t) : no(t, d));

/* 이름 붙은 IIFE 를 통째로 오려 낸다: `(function 이름() { … })();`
   ⛔ 길이로 자르지 않는다 — 옆 절이 딸려 오거나 본문이 잘린다(CLAUDE.md 2장). */
function iife(src, name) {
  const head = src.indexOf(`(function ${name}(`);
  if (head < 0) return '';
  let i = src.indexOf('{', head);
  if (i < 0) return '';
  let depth = 0, inS = null, inC = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (inC === 'line') { if (c === '\n') inC = null; continue; }
    if (inC === 'block') { if (c === '*' && n === '/') { inC = null; j++; } continue; }
    if (inS) { if (c === '\\') { j++; continue; } if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { inC = 'line'; j++; continue; }
    if (c === '/' && n === '*') { inC = 'block'; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(head, src.indexOf(';', j) + 1); }
  }
  return '';
}

/* ══════════════════ A. 배선 — 감싸는 이름이 원본에 실제로 있는가 ══════════════════
   이 수리는 idx-main.js(blocking, 첫 화면 여유 187B)를 못 고쳐서 «밖에서 덮는» 방식이다.
   그 이름이 바뀌면 typeof 검사에 걸려 조용히 건너뛴다 — 에러도 경고도 없다. */
console.log('\nA. 배선 — defer 가 덮는 이름이 idx-main.js 에 실재하는가');
for (const fn of ['vcAwardPoint', 'vcRegisterRosterIdentity', 'vcShowStarToast', 'vcSyncAwardUI']) {
  is(new RegExp(`^function\\s+${fn}\\s*\\(`, 'm').test(MAIN),
    `idx-main.js 에 최상위 function ${fn} 이 있다`,
    '이름이 바뀌었다면 defer 의 덮어쓰기가 통째로 헛돈다');
}
is(/window\._vcPendingAwards\s*\[/.test(MAIN) || /_vcPendingAwards\s*=/.test(MAIN),
  'idx-main.js 가 _vcPendingAwards 대기 목록을 쓴다',
  'defer 가 awardId 를 그 목록에서 알아낸다');
is(/delete\s+window\._vcPendingAwards\[/.test(MAIN),
  'ack 가 오면 원본이 대기 목록에서 지운다',
  '이게 없으면 «학생이 답했는지» 를 알 수 없다');

const SILENT = iife(FIX, 'praiseSilentFail');
const ROSTER = iife(FIX, 'praiseRosterRetry');
is(SILENT.length > 200, '⑮ praiseSilentFail 절을 오려 냈다', '절 이름이 바뀌었다면 아래 검사가 전부 헛돈다');
is(ROSTER.length > 200, '⑯ praiseRosterRetry 절을 오려 냈다', '절 이름이 바뀌었다면 아래 검사가 전부 헛돈다');

/* 가짜 브라우저 — 절을 실제로 돌리기 위한 최소 환경 */
function makeEnv({ teacher = false, account = null, adminSession = null, serverReply = { ok: true } } = {}) {
  const timers = [];
  const toasts = [];
  const posts = [];
  const win = {};
  const env = {
    win, toasts, posts, timers,
    fire() { const t = timers.splice(0); t.forEach((f) => f()); },
    pendingKeys: () => Object.keys(win._vcPendingAwards || {}),
  };
  win._vcPendingAwards = {};
  win._vcAwardCounts = {};
  const g = {
    window: win,
    document: { querySelector: () => ({ textContent: '민준' }) },
    localStorage: {
      getItem: (k) => (k === 'mangoi_admin_session' ? (adminSession ? JSON.stringify(adminSession) : null)
        : k === 'mango_token' ? 'tok' : null),
    },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    fetch: (url, opt) => {
      posts.push({ url, body: JSON.parse(opt.body) });
      return Promise.resolve({ json: () => Promise.resolve(serverReply) });
    },
    vcShowStarToast: (t, msg) => toasts.push(msg),
    vcSyncAwardUI: () => {},
    getCurrentUser: () => account,
    vcIsTeacherRole: () => teacher,
    vcRoomId: 'class-1-20260910',
    vcUserId: 'peer-live',
    vcUsername: '교사 Kaye',
    console: { log() {}, warn() {} },
    JSON, Promise, Object, String, RegExp, Date,
  };
  return { env, g };
}
function run(code, g) {
  const keys = Object.keys(g);
  // eslint-disable-next-line no-new-func
  new Function(...keys, code)(...keys.map((k) => g[k]));
}

/* ══════════════════ B. 실패 안내 — 실제로 돌려서 확인 ══════════════════ */
console.log('\nB. 학생 확인이 안 오면 사유를 말하는가 (절을 실제로 실행)');
{
  // 원본 흉내: awardId 를 만들어 대기 목록에 넣는다(진짜 vcAwardPoint 와 같은 모양)
  const origMaker = (win) => function (targetUserId, btn, toast) {
    const id = 'pt_test_' + Object.keys(win._vcPendingAwards).length;
    win._vcPendingAwards[id] = { toast, btn, targetUserId };
    return 'orig-ret';
  };

  // B-1 학생이 답하지 않으면 → 서버에 «한 번» 묻고, 성공이면 «들어갔다» 고 말한다
  {
    const { env, g } = makeEnv({ serverReply: { ok: true } });
    g.window.vcAwardPoint = origMaker(g.window);
    run(SILENT, g);
    const r = g.window.vcAwardPoint('peer-dead', null, {});
    is(r === 'orig-ret', 'B-1a 원본 반환값을 그대로 돌려준다', '감싸면서 반환을 잃으면 부르는 쪽이 깨진다');
    env.fire();                                    // 3.5초 타이머 발화
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 1, 'B-1b 학생이 안 답하면 서버에 «한 번» 묻는다', `실제 ${env.posts.length}회`);
    is(env.posts[0] && env.posts[0].url.includes('/api/points/award-praise'),
      'B-1c 물어보는 곳이 award-praise 다');
    is(env.posts[0] && env.posts[0].body.award_id === 'pt_test_0',
      'B-1d 원본이 만든 같은 award_id 로 묻는다(그래야 두 번 안 들어간다)');
    is(env.toasts.some((t) => /들어갔어요/.test(t)),
      'B-1e 포인트가 들어갔으면 그렇게 말한다', `실제: ${JSON.stringify(env.toasts)}`);
    is(env.toasts.some((t) => /연출|못 봤/.test(t)),
      'B-1f 학생 화면 연출은 못 봤다는 것도 함께 말한다',
      '「+1P」 만 말하면 선생님이 학생도 봤다고 오해한다');
  }

  // B-2 ⛔ 짝 검사 — 학생이 답했으면 **묻지 않는다**
  {
    const { env, g } = makeEnv();
    g.window.vcAwardPoint = origMaker(g.window);
    run(SILENT, g);
    g.window.vcAwardPoint('peer-live', null, {});
    delete g.window._vcPendingAwards['pt_test_0'];   // ack 도착 흉내
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 0, 'B-2 학생이 답하면 서버에 안 묻는다(요청이 안 늘어난다)',
      `실제 ${env.posts.length}회 — 이 짝이 없으면 «늘 묻는» 코드도 통과한다`);
  }

  // B-3 사유별 문구 — 셋 다 «왜» 를 말해야 한다
  for (const [err, want] of [
    ['account_not_registered', /로그인/],
    ['auth_required', /선생님 로그인/],
    ['target_not_student', /학생이 아니/],
    ['daily_cap_reached', /한도/],
  ]) {
    const { env, g } = makeEnv({ serverReply: { ok: false, error: err } });
    g.window.vcAwardPoint = origMaker(g.window);
    run(SILENT, g);
    g.window.vcAwardPoint('peer-dead', null, {});
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.toasts.some((t) => want.test(t)), `B-3 «${err}» 를 사람 말로 알려 준다`,
      `실제: ${JSON.stringify(env.toasts)}`);
  }

  // B-4 원본 모양이 바뀌어 awardId 를 못 찾으면 조용히 옛 동작 그대로 (막는 쪽으로 실패하지 않는다)
  {
    const { env, g } = makeEnv();
    g.window.vcAwardPoint = function () { return 'x'; };   // 대기 목록에 아무것도 안 넣는 원본
    run(SILENT, g);
    g.window.vcAwardPoint('peer', null, {});
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 0 && env.toasts.length === 0,
      'B-4 awardId 를 못 찾으면 조용히 옛 동작 그대로', '엉뚱한 안내를 띄우면 안 된다');
  }
}

/* ══════════════════ C. 이름표 재시도 — 실제로 돌려서 확인 ══════════════════ */
console.log('\nC. 이름표(로스터) 등록을 늦게라도 해내는가');
{
  const origReg = () => 'reg-ret';

  // C-1 처음엔 계정을 못 읽어도, 나중에 읽히면 등록한다
  {
    let acct = null;
    const { env, g } = makeEnv();
    g.getCurrentUser = () => acct;
    g.window.vcRegisterRosterIdentity = origReg;
    run(ROSTER, g);
    const r = g.window.vcRegisterRosterIdentity();
    is(r === 'reg-ret', 'C-1a 원본 반환값을 그대로 돌려준다');
    env.timers.splice(0, 1)[0]();                       // 1초 차례 — 아직 계정 없음
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 0, 'C-1b 계정을 못 읽으면 아직 안 보낸다');
    acct = { uid: 'stu9', name: '민준' };                // 로그인 정보가 늦게 도착
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length >= 1, 'C-1c 계정이 읽히면 그때 등록한다',
      '두 번 만에 포기하면 그 수업 내내 칭찬을 넣을 곳이 없다');
    const b = env.posts[0].body;
    is(b.account_uid === 'stu9' && b.room && b.peer_id, 'C-1d 방·번호·계정을 함께 보낸다');
  }

  // C-2 학생 로그인이 없으면 관리자 세션에서 계정을 빌린다
  {
    const { env, g } = makeEnv({ adminSession: { uid: 'jeong', name: '정우영' } });
    g.getCurrentUser = () => null;
    g.window.vcRegisterRosterIdentity = origReg;
    run(ROSTER, g);
    g.window.vcRegisterRosterIdentity();
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length >= 1 && env.posts[0].body.account_uid === 'jeong',
      'C-2 학생 키가 없으면 관리자 세션 uid 로 등록한다',
      `실제 ${env.posts.length}회 ${JSON.stringify(env.posts[0] && env.posts[0].body)}`);
  }

  // C-3 ⛔ 짝 검사 — 교사는 등록하지 않는다 (칭찬을 «받는» 쪽이 아니다)
  {
    const { env, g } = makeEnv({ teacher: true, account: { uid: 't1', name: '교사' } });
    g.window.vcRegisterRosterIdentity = origReg;
    run(ROSTER, g);
    g.window.vcRegisterRosterIdentity();
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 0, 'C-3 교사는 이름표를 등록하지 않는다',
      `실제 ${env.posts.length}회 — 이 짝이 없으면 «전원 등록» 도 통과한다`);
  }

  // C-4 한 번 성공하면 그 뒤 차례는 스스로 물러난다 (요청을 헛되이 늘리지 않는다)
  {
    const { env, g } = makeEnv({ account: { uid: 'stu9', name: '민준' } });
    g.window.vcRegisterRosterIdentity = origReg;
    run(ROSTER, g);
    g.window.vcRegisterRosterIdentity();
    const first = env.timers.splice(0, 1)[0];
    first();
    await new Promise((r2) => setImmediate(r2));
    env.fire();
    await new Promise((r2) => setImmediate(r2));
    is(env.posts.length === 1, 'C-4 등록에 성공하면 남은 차례는 안 보낸다', `실제 ${env.posts.length}회`);
  }

  // C-5 ⛔ 상주 타이머 금지 — 홈 전체가 멎은 전력이 있다
  is(!/setInterval/.test(ROSTER) && !/MutationObserver/.test(ROSTER),
    'C-5 상주 setInterval·MutationObserver 를 두지 않는다',
    'CLAUDE.md 2장 — body class 관찰자·상주 타이머가 홈을 통째로 멎게 한 전력');
  is(!/mangoi_logged_user/.test(ROSTER),
    'C-6 관리자에게 학생 로그인 키를 «만들어 주지» 않는다',
    '그 키 하나로 학생 전용 기능이 통째로 열린다');
}

/* ══════════════════ D. 서버 폴백 — 진짜 SQLite 로 ══════════════════ */
console.log('\nD. 번호가 죽었을 때 이름으로 찾되 «유일할 때만» 인가');
{
  /* award-praise 라우트만 중괄호 짝으로 자른다.
     ⚠️ 파일 전체에서 indexOf 로 보면 같은 문자열이 vc_roster 등록 쪽에도 있어
        «첫 번째가 늘 앞» 이라 언제나 통과하거나 언제나 실패한다(CLAUDE.md 2장). */
  const ROUTE = (() => {
    const a = API.indexOf("path === '/api/points/award-praise'");
    if (a < 0) return '';
    let i = API.indexOf('{', a), depth = 0;
    for (let j = i; j < API.length; j++) {
      if (API[j] === '{') depth++;
      else if (API[j] === '}') { depth--; if (depth === 0) return API.slice(a, j + 1); }
    }
    return '';
  })();
  is(ROUTE.length > 200, 'D-0a award-praise 라우트를 잘라 냈다', '못 자르면 아래가 전부 헛돈다');

  /* 🪤 «유일할 때만» 판정을 하니스에 **베껴 적으면 안 된다** — 소스를 한 번도 안 보고
     내가 적은 값만 보게 되어, 소스에서 조건을 풀어도 초록불이 된다(실제로 그 상태였다).
     그래서 조건식을 소스에서 «읽어» 그대로 평가한다(CLAUDE.md 2장 「자기가 새로 만든 상수를 잡아 통과」). */
  const condSrc = (ROUTE.match(/if\s*\((uniq\.size[^)]*)\)\s*rr\s*=\s*rows\[0\]/) || [])[1] || '';
  is(!!condSrc, 'D-0b 「후보가 몇이면 받는가」 조건식을 소스에서 읽었다', '못 읽으면 D-1·D-2 가 헛돈다');
  const uniqOk = condSrc ? new Function('uniq', `return (${condSrc});`) : () => false;

  const m = API.match(/SELECT account_uid, name, role FROM vc_roster\s+WHERE room_id=\? AND name=\?[\s\S]*?LIMIT 20/);
  is(!!m, 'D-0 award-praise 의 이름 폴백 SQL 을 오려 냈다', '못 오려 내면 아래가 헛돈다');
  if (m) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE vc_roster (room_id TEXT, peer_id TEXT, account_uid TEXT, name TEXT, role TEXT, updated_at INTEGER, PRIMARY KEY(room_id, peer_id));`);
    const add = (peer, uid, name) => db.prepare(
      `INSERT INTO vc_roster VALUES (?,?,?,?,'student',?)`
    ).run('R', peer, uid, name, Date.now());
    add('p-old', 'stu9', '민준');      // 죽은 번호
    add('p-new', 'stu9', '민준');      // 같은 사람이 다시 들어옴 = 새 번호
    add('p-x', 'other1', '민서');
    add('p-y', 'other2', '민서');      // 동명이인 — 계정이 둘

    const sql = m[0].replace(/\s+/g, ' ');
    const pick = (name) => {
      const rows = db.prepare(sql).all('R', name);
      const uniq = new Set(rows.map((r) => String(r.account_uid)));
      return uniqOk(uniq) && rows.length ? rows[0].account_uid : null;   // 소스에 적힌 조건 그대로
    };
    is(pick('민준') === 'stu9', 'D-1 번호가 죽어도 이름이 유일하면 그 계정을 찾는다');
    is(pick('민서') === null, 'D-2 동명이인이면 붙이지 않는다(모르는 것보다 틀린 게 나쁘다)');
    is(pick('없는이름') === null, 'D-3 없는 이름이면 붙이지 않는다');
    db.close();
  }

  // D-4 «유일할 때만» 이 코드에 실제로 있는가 — 이것이 D-2 의 근거다
  is(/uniq\.size\s*===\s*1/.test(API), 'D-4 후보가 정확히 하나일 때만 받는다',
    '이 줄이 빠지면 동명이인에게 남의 포인트가 간다');
  is(/AND name=\?/.test(API) && !/LIKE/.test(m ? m[0] : ''),
    'D-5 이름은 완전일치로만 찾는다(LIKE·부분일치 금지)');
  is(/target_name/.test(FIX), 'D-6 화면이 폴백용 이름을 함께 보낸다',
    '안 보내면 서버 폴백이 영영 안 돈다');
  // D-7 폴백은 «못 찾았을 때만» 돈다 — 늘 이름으로 찾으면 번호를 보내는 뜻이 사라진다
  const peerFirst = ROUTE.indexOf('AND peer_id=?');
  const nameNext = ROUTE.indexOf('AND name=?');
  is(peerFirst > 0 && nameNext > peerFirst,
    'D-7b 번호로 먼저 찾고, 못 찾았을 때만 이름을 본다',
    `peer=${peerFirst} name=${nameNext}`);
  is(/if\s*\(!rr\?\.account_uid\)\s*\{[\s\S]{0,600}?AND name=\?/.test(ROUTE),
    'D-7c 이름 폴백이 «번호로 못 찾았을 때» 분기 안에 있다',
    '분기 밖에 있으면 늘 이름으로도 찾는다');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

/* ══════════════════════════════════════════════════════════════════════
   🔔 강사 웹푸시 — 카카오 대신 «폰에 뜨는» 자동 알림  (2026-09-14)

   [왜] 사장님 「카카오톡으로도 교사들에게 가게 할 수 없어?」. 카카오는 필리핀 번호에
        «구조적으로» 안 닿아(카카오ID 발송 API 없음 · 알림톡은 한국 번호 전용) 웹푸시로 결정.
   [무엇을 지키나]
     A. 정본 src/teacher-push.ts 를 **실제로 돌린다**(가짜 D1·가짜 web-push):
        원부 강사 → 계정(teacher_account_links) → 구독(push_subscriptions) 두 다리.
        «보낸다» 옆에 «계정 없음·구독 없음·조회 실패는 0 + 이유» 를 짝으로 둔다.
     B. absent-sweep 배선 — 푸시는 이메일을 «대신» 하지 않고 «더한다»(이메일 갈래 그대로),
        푸시가 갔으면 운영자 «못 보냄» 경고를 안 올린다(짝: 안 갔으면 올린다).
     C. no-show 알림 배선 — 강사는 본문 uid 만이 아니라 원부 계정 전부에.
     D. 연락처 연결 API·화면 — push_on/reach_by:'push' 가 실려 배지가 그려진다(카카오ID 만으론 초록 아님).
     E. teacher.html — 🔔 버튼이 있고 구독은 me.username 으로 저장하며, 실패 사유를 단계별로 말한다.
   🪤 문자열로만 보면 «함수가 있고 호출도 있다» 로 다 초록이 된다 — A 는 실제 실행, B~E 는
      «짝» 으로 둔다(«한다» 만 두면 «전부 안 하기» 도 통과한다).
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(join(HERE, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 — «길이» 로 자르지 않는다(규칙서 2장). */
function braceBlock(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}

const SRC = join(HERE, '../cloudflare-deploy/src');
const PUSH = rd('../cloudflare-deploy/src/teacher-push.ts');
const SWEEP = rd('../cloudflare-deploy/src/absent-sweep.ts');
const NOTIFY = rd('../cloudflare-deploy/src/api-notify.ts');
const ADMIN = rd('../cloudflare-deploy/src/api-admin.ts');
const TCT = rd('../cloudflare-deploy/public/js/adm-tcontact.js');
const TEACHER = rd('../cloudflare-deploy/public/teacher.html');
const ADMIN_HTML = rd('../cloudflare-deploy/public/admin.html');

// ═══════════════ A. 정본을 실제로 돌린다 ═══════════════
console.log('\nA. teacher-push.ts — 원부 → 계정 → 구독, 실제 실행');
{
  const tmp = mkdtempSync(join(tmpdir(), 'tpush-'));
  // web-push 는 가짜로 — «어느 endpoint 에 wakeup 이 나갔나» 만 기록한다.
  writeFileSync(join(tmp, 'web-push.ts'), `
    export const calls: any[] = [];
    export function getWebPushMode(env: any) { return env.MODE || 'real'; }
    export async function broadcastWebPush(eps: string[], env: any) {
      calls.push(eps.slice());
      if (env.MODE === 'disabled') return { sent: 0, failed: 0, mode: 'disabled', expired: [] };
      return { sent: eps.length, failed: 0, mode: env.MODE || 'real', expired: env.EXPIRE || [] };
    }
  `);
  // 정본은 확장자 없이 import 한다(번들러 전제) — 타입 제거 실행에는 .ts 가 필요하다.
  writeFileSync(join(tmp, 'teacher-push.ts'), PUSH.replace("from './web-push'", "from './web-push.ts'").replace("from './d1-chunk'", "from './d1-chunk.ts'"));
  writeFileSync(join(tmp, 'd1-chunk.ts'), rd('../cloudflare-deploy/src/d1-chunk.ts'));   // 진짜 청크 헬퍼 그대로(정본을 베끼지 않는다)
  const runner = `
    import { pushToTeacher, teacherAccountsOf, teacherIdsWithPush } from './teacher-push.ts';
    import { calls } from './web-push.ts';
    const out = [];
    const add = (n, ok, got) => out.push([n, !!ok, got]);
    /* 정본이 «던지면» 러너가 죽어 결과줄조차 안 나온다(변이시험 실측) — 던지는 것도 «그 검사의 FAIL» 로 남긴다. */
    const tc = async (n, f) => { try { const [ok, got] = await f(); out.push([n, !!ok, got]); } catch (e) { out.push([n, false, 'threw: ' + (e && e.message)]); } };
    /* 가짜 D1 — 질의문을 보고 답을 바꾼다(늘 같은 값을 주면 시나리오가 안 만들어진다 — 규칙서 2장).
       prepare()·prepare().bind() 두 층 모두에 all/first/run 을 둔다. */
    function mkDb(links, subs, opts = {}) {
      const ins = [];
      const answer = (sql, args) => {
        if (opts.throwOn && sql.includes(opts.throwOn)) throw new Error('D1 down');
        if (sql.includes('FROM teacher_account_links l') && sql.includes('JOIN push_subscriptions')) {
          const s = new Set();
          for (const l of links) if (subs.some(p => p.user_id === l.username && p.enabled === 1)) s.add(String(l.teacher_id));
          return { results: [...s].map(tid => ({ tid })) };
        }
        if (sql.includes('FROM teacher_account_links')) {
          // LIMIT 을 «실제로» 지킨다 — 안 지키면 「계정을 하나만 읽게」 되돌려도 초록이다(변이시험 실측).
          const lim = Number((sql.match(/LIMIT (\\d+)/) || [])[1] || 1000);
          return { results: links.filter(l => String(l.teacher_id) === args[0]).slice(0, lim).map(l => ({ username: l.username })) };
        }
        if (sql.includes('FROM push_subscriptions')) return { results: subs.filter(p => p.enabled === 1 && args.includes(p.user_id)).map(p => ({ endpoint: p.endpoint })) };
        if (sql.startsWith('INSERT INTO push_queue')) { ins.push(args); return { success: true }; }
        if (sql.startsWith('UPDATE push_subscriptions')) { return { success: true }; }
        return { results: [] };
      };
      const mk = (sql, args) => ({
        all: async () => answer(sql, args), first: async () => (answer(sql, args).results || [])[0] || null, run: async () => answer(sql, args),
        bind: (...a) => mk(sql, a),
      });
      return { DB: { prepare: (sql) => mk(sql, []) }, MODE: opts.mode || 'real', EXPIRE: opts.expire || [], __ins: ins };
    }
    const LINKS = [{ teacher_id: '22', username: 'mangoi_018' }, { teacher_id: '18', username: 'mangoi_168' }, { teacher_id: '18', username: 'Mangoi_168' }, { teacher_id: '29', username: 'hq_t_kang' }];
    const SUBS = [{ user_id: 'mangoi_018', endpoint: 'ep-farrah', enabled: 1 }, { user_id: 'mangoi_168', endpoint: 'ep-len-a', enabled: 1 },
                  { user_id: 'Mangoi_168', endpoint: 'ep-len-a', enabled: 1 }, { user_id: 'Mangoi_168', endpoint: 'ep-len-b', enabled: 1 },
                  { user_id: 'hq_t_kang', endpoint: 'ep-kang-off', enabled: 0 }, { user_id: 'ysyt01', endpoint: 'ep-student', enabled: 1 }];

    // 1) 계정 다리
    add('A-1 원부 22 → 계정 mangoi_018', JSON.stringify(await teacherAccountsOf(mkDb(LINKS, SUBS), 22)) === '["mangoi_018"]', await teacherAccountsOf(mkDb(LINKS, SUBS), 22));
    add('A-2 원부 18 → 대소문자만 다른 두 계정 «전부»', (await teacherAccountsOf(mkDb(LINKS, SUBS), '18')).length === 2);
    add('A-3 없는 원부 → []', (await teacherAccountsOf(mkDb(LINKS, SUBS), 999)).length === 0);
    add('A-4 빈 id → [] (조회 자체를 안 한다)', (await teacherAccountsOf(mkDb(LINKS, SUBS), '')).length === 0);

    // 2) 보낸다 — 그리고 «안 보낸다» 를 짝으로
    let env = mkDb(LINKS, SUBS); calls.length = 0;
    let r = await pushToTeacher(env, 22, 'T', 'B', '/teacher', 'tag-1');
    add('A-5 구독 있는 강사 → sent 1 · 큐 1 · wakeup 1', r.sent === 1 && env.__ins.length === 1 && calls.length === 1 && calls[0][0] === 'ep-farrah', r);
    const q0 = env.__ins[0] || [];   // 큐가 비어도 «깔끔한 FAIL» — 러너를 죽이지 않는다(변이시험 실측)
    add('A-6 큐에 제목·본문·url·tag 가 그대로 실린다', q0[1] === 'T' && q0[2] === 'B' && q0[3] === '/teacher' && q0[6] === 'tag-1', q0);
    env = mkDb(LINKS, SUBS); calls.length = 0;
    r = await pushToTeacher(env, 18, 'T', 'B');
    add('A-7 계정 둘·구독 셋(같은 endpoint 겹침) → endpoint 는 «중복 없이» 2개', r.accounts === 2 && r.subs === 2 && r.sent === 2 && env.__ins.length === 2, r);
    await tc('A-8 구독이 꺼진(enabled 0) 강사 → 0 + why no_subscription', async () => { const r = await pushToTeacher(mkDb(LINKS, SUBS), 29, 'T', 'B'); return [r.sent === 0 && r.why === 'no_subscription', r]; });
    await tc('A-9 계정이 안 이어진 강사 → 0 + why no_linked_account', async () => { const r = await pushToTeacher(mkDb(LINKS, SUBS), 999, 'T', 'B'); return [r.sent === 0 && r.why === 'no_linked_account', r]; });
    r = await pushToTeacher(mkDb(LINKS, SUBS), '', 'T', 'B');
    add('A-10 원부 id 없음 → 0 + why no_teacher_id', r.sent === 0 && r.why === 'no_teacher_id', r);
    // 3) «덤» 계정(노쇼 본문 uid) — 합치되 중복은 한 번
    env = mkDb(LINKS, SUBS); calls.length = 0;
    r = await pushToTeacher(env, 22, 'T', 'B', '/', 't', ['mangoi_018', 'ysyt01']);
    add('A-11 extra 계정을 합친다 (원부 계정 + 덤 = 2, 겹치면 한 번)', r.accounts === 2 && r.sent === 2 && calls[0].sort().join() === 'ep-farrah,ep-student', r);
    env = mkDb(LINKS, SUBS); calls.length = 0;
    r = await pushToTeacher(env, null, 'T', 'B', '/', 't', ['ysyt01']);
    add('A-12 원부 없이 덤 계정만으로도 간다 (노쇼 본문 uid 만 있을 때)', r.sent === 1 && calls[0][0] === 'ep-student', r);
    // 4) 실패 방향 — 던지지 않는다
    await tc('A-13 구독 조회가 죽어도 «던지지 않고» 0 + lookup_failed', async () => { const r = await pushToTeacher(mkDb(LINKS, SUBS, { throwOn: 'FROM push_subscriptions' }), 22, 'T', 'B'); return [r.ok === false && r.sent === 0 && r.why === 'lookup_failed', r]; });
    await tc('A-14 계정 조회가 죽어도 던지지 않는다 (0 + no_linked_account)', async () => { const r = await pushToTeacher(mkDb(LINKS, SUBS, { throwOn: 'FROM teacher_account_links' }), 22, 'T', 'B'); return [r.sent === 0 && r.why === 'no_linked_account', r]; });
    r = await pushToTeacher(mkDb(LINKS, SUBS, { mode: 'disabled' }), 22, 'T', 'B');
    add('A-15 web-push 가 disabled 면 0 + why push_disabled (키 없음을 «성공» 으로 안 읽는다)', r.sent === 0 && r.why === 'push_disabled', r);
    r = await pushToTeacher({ MODE: 'real' }, 22, 'T', 'B');
    add('A-16 DB 가 없으면 0 (no_linked_account — 계정부터 못 읽음)', r.sent === 0 && r.why, r);
    // 5) 만료 endpoint 는 끈다
    env = mkDb(LINKS, SUBS, { expire: ['ep-farrah'] });
    const upd = [];
    const origPrep = env.DB.prepare; env.DB.prepare = (sql) => { if (sql.startsWith('UPDATE push_subscriptions')) upd.push(sql); return origPrep(sql); };
    await pushToTeacher(env, 22, 'T', 'B');
    add('A-17 만료된 endpoint 는 enabled 0 으로 끈다', upd.length === 1);
    // 6) 화면용 집합
    const ids = await teacherIdsWithPush(mkDb(LINKS, SUBS));
    add('A-18 켜진 구독이 있는 원부 = {22, 18} (29 는 꺼져서 빠짐)', ids.has('22') && ids.has('18') && !ids.has('29') && ids.size === 2, [...ids]);
    await tc('A-19 조회가 죽으면 빈 집합 (있는데 없다고 — 사람이 한 번 더 켜 보는 쪽)', async () => { const ids2 = await teacherIdsWithPush(mkDb(LINKS, SUBS, { throwOn: 'JOIN push_subscriptions' })); return [ids2.size === 0, [...ids2]]; });
    console.log(JSON.stringify(out));
  `;
  // ⚠️ 위 러너에서 «try 밖» 의 case 가 던지면 status≠0 → A-0 FAIL + stderr 출력(아래). 던질 수 있는 case 는 tc 로 감싼다.
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    check('A-0 teacher-push.ts 실행(타입 제거 import)', false);
    console.log(r.stderr.slice(0, 1200));
  } else {
    check('A-0 teacher-push.ts 실행(타입 제거 import)', true);
    const lines = r.stdout.trim().split('\n');
    const cases = JSON.parse(lines[lines.length - 1]);
    for (const [name, ok, got] of cases) check(name + (ok ? '' : ` (실제 ${JSON.stringify(got)})`), ok);
  }
}

// ═══════════════ B. absent-sweep 배선 ═══════════════
console.log('\nB. absent-sweep — 푸시를 «더한다»(이메일 그대로) · 갔으면 «못 보냄» 경고를 안 올린다');
{
  const code = stripComments(SWEEP);
  const fnStart = code.indexOf('async function runAbsentStudentSweep');
  const body = braceBlock(code, code.indexOf('{', code.indexOf(')', fnStart)));
  check('B-0 runAbsentStudentSweep 본문을 잘라 냈다', body.length > 2000 && /findTeacherContact\(env, c\.teacher_id\)/.test(body));
  check('B-1 정본 pushToTeacher 를 import 한다', /import \{ pushToTeacher \} from '\.\/teacher-push'/.test(code));
  const pushAt = body.indexOf('pushToTeacher(env, c.teacher_id');
  const emailAt = body.indexOf('if (tc.email) {');
  check('B-2 강사에게 pushToTeacher 를 «실제로 부른다»', pushAt > 0);
  check('B-3 이메일 갈래는 그대로 남아 있다 (푸시가 이메일을 «대신» 하지 않는다)', emailAt > 0 && /sendEmail\(env as any, \{/.test(body));
  check('B-4 문자 갈래도 그대로 (한국 번호일 때만)', /else if \(tc\.phone && isKr\(tc\.phone\)\)/.test(body));
  check('B-5 푸시가 이메일 «앞» 에서 나간다 (이메일이 던져도 푸시는 갔다)', pushAt > 0 && pushAt < emailAt);
  check('B-6 푸시 결과(보냄/이유)를 detail 에 남긴다', /detail\.teacher_push = pushOk \? 'sent' : \(pr\.why \|\| 'failed'\)/.test(body));
  check('B-7 push 가 던져도 흐름이 계속된다 (try/catch + detail.error)', /catch \(e: any\) \{ detail\.teacher_push = 'error:'/.test(body));
  // 짝: 갔으면 안 올리고, 안 갔으면 올린다 — 조건식을 오려 내 평가
  const m = body.match(/if \((!pushOk)\) ownerLines\.push\(`  ⚠ 강사/);
  check('B-8 운영자 «못 보냄» 경고는 «푸시가 안 갔을 때만»', !!m);
  if (m) {
    const f = new Function('pushOk', `return (${m[1]});`);
    check('B-9 푸시 갔음 → 경고 안 올림', f(true) === false);
    check('B-10 푸시 안 감 → 경고 올림 (짝 — 조용히 넘기지 않는다)', f(false) === true);
  }
  check('B-11 못 보낸 이유는 여전히 detail.teacher_sms 에 남는다', /detail\.teacher_sms = why;/.test(body));
  check('B-12 «절대 던지지 않는» 정본에 기대므로 pushOk 초기값은 false', /let pushOk = false;/.test(body));
}

// ═══════════════ C. no-show 알림 배선 ═══════════════
console.log('\nC. /api/notify/no-show — 강사는 «원부 계정 전부» 에게 (본문 uid 는 덤)');
{
  const code = stripComments(NOTIFY);
  const h0 = code.indexOf("path === '/api/notify/no-show'");
  check('C-0 no-show 핸들러가 있다', h0 > 0);
  const blk = braceBlock(code, code.indexOf('{', h0));
  check('C-1 정본을 import 한다', /import \{ pushToTeacher \} from '\.\/teacher-push'/.test(code));
  const m = blk.match(/else if \(waitingFor === 'teacher'\) \{[\s\S]*?pushToTeacher\(env, _parties\?\.teacherId, pushTitle, pushBody, roomUrl, `no-show-\$\{roomId\}`,\s*missingUid \? \[missingUid\] : \[\]\)/);
  check('C-2 강사가 «안 온» 갈래에서 원부(_parties.teacherId) 계정으로 보낸다 + 본문 uid 를 덤으로', !!m);
  check('C-3 학생이 안 온 갈래는 예전 그대로 sendPushToUser(missingUid)', /else if \(missingUid\) push = await sendPushToUser\(env, missingUid/.test(blk));
  // 순서: teacherLive 가 먼저 막는다 — 강사가 방에 있으면 푸시 안 나감(2026-09-04 결정 유지)
  const liveAt = blk.indexOf("if (teacherLive) push = { skipped: true, reason: 'teacher_present' }");
  const pushAt = blk.indexOf('pushToTeacher(env, _parties?.teacherId');
  check('C-4 «강사가 방에 있으면 안 보낸다» 가 pushToTeacher 보다 먼저 판정된다', liveAt > 0 && liveAt < pushAt);
  /* C-5 는 «식을 오려 내 실제로 평가» — `{ ok: pr.sent > 0, ...pr }` 처럼 spread 가 뒤에 오면 정본의
     ok(=던지지 않았다, 늘 true)가 덮어써서 구독이 없어도 notified_push=1 이 된다. 글자로만 보면 초록이었다(함정 대조 실측). */
  // ⚠️ 앵커는 pushToTeacher 호출 «뒤» — 앞쪽 `let push: any = { skipped: true }` 가 먼저 걸려 헛돈다(실측)
  const pm = blk.slice(blk.indexOf('pushToTeacher(env, _parties?.teacherId')).match(/push = (\{[^;]*?\});/);
  check('C-5 push 결과 조립식이 있다', !!pm);
  if (pm) {
    const mk = new Function('pr', `return (${pm[1]});`);
    check('C-5a 구독 없음(sent 0, 정본 ok true) → push.ok false (notified_push 0)', mk({ ok: true, sent: 0, why: 'no_subscription' }).ok === false);
    check('C-5b 실제로 나감(sent 1) → push.ok true (짝)', mk({ ok: true, sent: 1, why: '' }).ok === true);
    check('C-5c why 가 함께 실린다', mk({ ok: true, sent: 0, why: 'no_linked_account' }).why === 'no_linked_account');
  }
}

// ═══════════════ D. 연락처 연결 API + 화면 ═══════════════
console.log('\nD. 📇 강사 연락처 연결 — push_on / reach_by:push · 카카오ID 만으론 초록 아님');
{
  const code = stripComments(ADMIN);
  const h0 = code.indexOf("path === '/api/admin/teacher-contacts'");
  const blk = braceBlock(code, code.indexOf('{', h0));
  check('D-0 API 블록을 잘라 냈다', blk.length > 500 && /reach_by/.test(blk));
  check('D-1 teacherIdsWithPush 를 «한 번» 부른다 (강사 수만큼이 아니라)', (blk.match(/await teacherIdsWithPush\(env\)/g) || []).length === 1);
  const rb = blk.match(/reach_by: ([^\n]+),\n/);
  check('D-2 reach_by 식이 있다', !!rb);
  if (rb) {
    const f = new Function('email', 'phone', 'isKrPhone', 'pushIds', 't', `return (${rb[1]});`);
    const ids = new Set(['7']);
    const kr = (p) => /^(\+?82|0)10/.test(String(p || '').replace(/[\s-]/g, ''));
    check('D-3 이메일 있음 → email (푸시가 있어도 이메일이 앞)', f('a@b', null, kr, ids, { id: 7 }) === 'email');
    check('D-4 한국 번호만 → sms', f(null, '010-1234-5678', kr, ids, { id: 7 }) === 'sms');
    check('D-5 이메일·한국번호 없음 + 푸시 켬 → push', f(null, '0935-842-9931', kr, ids, { id: 7 }) === 'push');
    check('D-6 이메일·한국번호 없음 + 푸시 안 켬 → null (필리핀 번호·카카오ID 는 자동 수단이 아니다)', f(null, '0935-842-9931', kr, new Set(), { id: 7 }) === null);
  }
  check('D-7 push_on 을 응답에 싣는다', /push_on: pushIds\.has\(String\(t\.id\)\)/.test(blk));
  check('D-8 reachable 도 푸시를 센다 (요약 «알림 못 가는 강사 N명» 이 같은 말을 하도록)', /reachable: !!email \|\| \(phone \? isKrPhone\(phone\) : false\) \|\| pushIds\.has\(String\(t\.id\)\)/.test(blk));

  // 화면 배지 — 함수를 오려 내 실제로 돌린다
  const fm = TCT.match(/function reachBadge\(r\) \{[\s\S]*?\n  \}/);
  check('D-9 reachBadge 를 오려 냈다', !!fm);
  if (fm) {
    const badge = new Function('T', fm[0] + '; return reachBadge;')((ko) => ko);
    const g = (r) => badge(r);
    check('D-10 email + push_on → 「이메일로 자동 발송 + 🔔 푸시」 초록', /이메일로 자동 발송 \+ 🔔 푸시/.test(g({ reach_by: 'email', push_on: true, linked_profile_id: '1' }).txt) && g({ reach_by: 'email', push_on: true }).bg === '#dcfce7');
    check('D-11 email 만 → «+ 푸시» 없음 (짝)', !/푸시/.test(g({ reach_by: 'email', push_on: false }).txt));
    check('D-12 push 만 → 「푸시로 자동 발송」 초록', /푸시로 자동 발송/.test(g({ reach_by: 'push', push_on: true, linked_profile_id: '1' }).txt) && g({ reach_by: 'push', push_on: true }).bg === '#dcfce7');
    const k = g({ reach_by: null, push_on: false, linked_profile_id: '1', kakao_id: 'TeacherAna18' });
    check('D-13 카카오ID 만 → 여전히 노랑 «자동 발송 불가» (카카오는 자동 수단이 아니다)', k.bg === '#fef3c7' && /자동 발송 불가/.test(k.txt));
    check('D-14 그 노란 배지가 «강사가 🔔 알림 받기를 켜면 간다» 고 다음 할 일을 말한다', /알림 받기/.test(k.txt));
    check('D-15 연결 안 됨 → 빨강 그대로', g({ reach_by: null, linked_profile_id: null }).bg === '#fee2e2');
  }
  check('D-16 admin.html 의 adm-tcontact.js ?v= 가 올라갔다 (immutable 캐시)', /adm-tcontact\.js\?v=([2-9]|\d{2,})/.test(ADMIN_HTML));
}

// ═══════════════ E. teacher.html 버튼 + 구독 ═══════════════
console.log('\nE. teacher.html — 🔔 알림 받기 버튼 · me.username 으로 구독 · 실패 사유를 단계별로');
{
  check('E-0 상단바에 #push 버튼이 있다', /<button class="tbtn" id="push" type="button"/.test(TEACHER));
  const scripts = [...TEACHER.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const code = stripComments(scripts);
  check('E-1 subscribePush 가 있다', /function subscribePush\(\)/.test(code));
  const sub = braceBlock(code, code.indexOf('{', code.indexOf('function subscribePush()')));
  check('E-2 구독을 «서버가 확인해 준 계정명»(DATA.me.username) 으로 저장한다', /var who = DATA && DATA\.me && DATA\.me\.username;/.test(sub) && /user_id: who/.test(sub));
  check('E-3 계정을 모르면 저장하지 않고 이유를 말한다 (짝)', /if \(!who\) return Promise\.resolve\(\{ ok:false, why: pushWhy\('who'\)/.test(sub));
  check('E-4 /api/push/vapid-public-key → sw 등록 → pushManager.subscribe → /api/push/subscribe 순', sub.indexOf('/api/push/vapid-public-key') < sub.indexOf("serviceWorker.register('/sw.js')") && sub.indexOf("register('/sw.js')") < sub.indexOf('pushManager.subscribe(') && sub.indexOf('pushManager.subscribe(') < sub.indexOf('/api/push/subscribe'));
  check('E-5 HTTP 오류를 «키 없음» 으로 읽지 않는다 (r.ok 를 따로 본다)', /if \(!r\.ok\) \{ code = r\.status; step = 'http'; throw/.test(sub));
  check('E-6 연결 실패는 net 갈래 (키 없음과 구분)', /\.catch\(function\(e\)\{ step = 'net'; throw e; \}\)/.test(sub));
  check('E-7 푸시 미지원 브라우저(아이폰 사파리 탭)는 그 사실을 말한다', /pushWhy\('unsupported'\)/.test(sub) && /Add to Home Screen/.test(code));
  // pushWhy 표를 오려 내 실제로 돌린다 — 아는 단계는 각각 다른 말, 모르는 단계는 «알 수 없는 단계»
  const wm = code.match(/function pushWhy\(step, code\)\{[\s\S]*?\n  \}/);
  check('E-8 pushWhy 를 오려 냈다', !!wm);
  if (wm) {
    const why = new Function('T', wm[0] + '; return pushWhy;')((en, ko) => ko);
    const steps = ['unsupported', 'who', 'key', 'http', 'sw', 'subscribe', 'save', 'net'];
    const texts = steps.map(s => why(s, 503));
    check('E-9 여덟 단계가 서로 다른 말을 한다', new Set(texts).size === steps.length);
    check('E-10 모르는 단계는 «알 수 없는 단계» 라고 말한다 (틀린 문구를 조용히 내지 않는다)', /알 수 없는 단계: zzz/.test(why('zzz', 0)));
    check('E-11 http 단계는 상태 코드를 그대로 보여 준다', /HTTP 503/.test(why('http', 503)));
  }
  check('E-12 켜져 있으면 누르기 «전에» 켜짐으로 그린다 (getSubscription 으로 미리 본다)', /getRegistration\('\/'\)[\s\S]{0,200}?getSubscription\(\)\.then\(function\(sub\)\{ pushOn = !!sub; paintPushBtn\(\); \}\)/.test(code));
  check('E-13 라벨은 상태에 따라 JS 가 그린다 (data-en 아님) + 언어 토글 때 다시 그린다', !/id="push-lbl" data-en/.test(TEACHER) && /if \(typeof paintPushBtn === 'function'\) paintPushBtn\(\);/.test(code));
  check('E-14 성공·실패를 토스트로 말한다 (사유 포함)', /toast\('⚠️ ' \+ r\.why\)/.test(code) && /알림 켜짐 — 결석·학생 대기 알림/.test(code));
  check('E-15 누르는 동안 버튼을 잠근다 (두 번 눌러 두 구독이 되지 않게)', /b\.disabled = true;\s*subscribePush\(\)\.then\(function\(r\)\{\s*b\.disabled = false;/.test(code));
  check('E-16 켜진 상태 CSS 가 있다 (다크 테마 포함)', /\.tbtn-push-on\{/.test(TEACHER) && /html\[data-t="dark"\] \.tbtn-push-on\{/.test(TEACHER));
  check('E-17 ⛔ 켜기 실패로 저장값을 남기지 않는다 (localStorage 에 push 키를 안 쓴다)', !/localStorage\.setItem\(['"][^'"]*push/i.test(code));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:'); FAILS.forEach(f => console.log('  - ' + f)); process.exit(1); }

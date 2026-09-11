/* ═══════════════════════════════════════════════════════════════════════════
   💾 schedule_drag_persist_harness.mjs — 주간 전체 스케줄 «드래그 이동» 이 서버에
      실제로 저장되는가 (2026-09-11)

   [무엇을 지키나] 2026-09-11 실사고. 사장님이 정우영 학생의 금 14:20 수업을
     강선생님 → MAIMAI 로 드래그해 옮기셨는데 홈 화면은 계속 강선생님을 가리켰다.
     원인: confirmMoveDo() 가 하는 일이 메모리 한 줄(SLOTS[key]=slot)뿐이었다.
     확인 모달은 「⚡ 담당 교사도 함께 변경됩니다」라고 약속하고 「✅ 이동됨」까지
     띄웠지만 **요청이 한 건도 나가지 않아** 새로고침하면 조용히 되돌아갔다.
     같은 병의 형제가 이미 둘 있다 — 「화면에서 수업을 잡았는데 학생은 «오늘 수업
     없음»」(2026-08-24 saveNewSlot)·「직원을 등록했는데 로그인이 안 돼요」(2026-08-18).

   [왜 문자열 검사로는 안 되나] 함수도 값도 다 «있었다». 없던 것은 «요청» 하나뿐이라
     수리 전에도 --fast 는 전부 초록이었다. 그래서 여기서는 화면 코드를 오려 내
     **가짜 fetch·가짜 DOM 으로 실제로 돌려** 무엇이 나가는지 본다.

   [짝으로 묻는 것들 — 한쪽만 두면 엉터리 수리가 통과한다]
     · «요청이 나간다»        ↔ «옮길 수 없는 칸(자리표시·차단)에는 안 나간다»
     · «성공하면 화면을 옮긴다» ↔ «실패하면 화면을 옮기지 않는다»(거짓 성공 금지)
     · «강사를 바꾸면 싣는다»  ↔ «시간만 옮기면 안 싣는다»(권한을 넓히지 않는다)
     · «반복은 요일»          ↔ «일회성은 날짜»(섞으면 «매주» 가 죽는다)
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WEEKLY = new URL('../cloudflare-deploy/public/admin/weekly-schedule.html', import.meta.url);
const APIADM = new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url);
const html = readFileSync(WEEKLY, 'utf8');
const srv = readFileSync(APIADM, 'utf8');
const CF = join(fileURLToPath(new URL('../cloudflare-deploy/', import.meta.url)));
const GATE_TS = readFileSync(new URL('../cloudflare-deploy/src/class-teacher-move.ts', import.meta.url), 'utf8');
const AUTH_TS = readFileSync(new URL('../cloudflare-deploy/src/auth-admin.ts', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ❌ ' + m); } };
const sec = (t) => console.log('\n' + t);

/** 앵커부터 «중괄호 짝» 으로 한 문장을 오려 낸다. */
function sliceStmt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const b = src.indexOf('{', i);
  if (b < 0) return '';
  let d = 0;
  for (let j = b; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1) + ';'; }
  }
  return '';
}

/* 저장은 공용 함수 한 곳(persistSlotMove)에 있고 세 입구가 그것을 부른다 — 함께 오려 낸다. */
const PERSIST_SRC = sliceStmt(html, 'async function persistSlotMove(');
const FAILMSG_SRC = sliceStmt(html, 'function slotMoveFailMsg(');
const MOVE_SRC = PERSIST_SRC + '\n' + FAILMSG_SRC + '\n' + sliceStmt(html, 'window.confirmMoveDo=async function(){');
const RSC_SRC = sliceStmt(html, 'window.rscConfirm = async function(){');
const CMOVE_SRC = sliceStmt(html, 'window.confirmMove=async function(newDate,newHour){');

sec('⓪ 전제 — 검사 대상을 실제로 오려 냈는가 (이게 깨지면 아래가 전부 헛돈다)');
ok(MOVE_SRC.length > 800, 'confirmMoveDo/persistSlotMove 를 오려 내지 못했다 (길이 ' + MOVE_SRC.length + ')');
ok(/fetch\(/.test(MOVE_SRC), '오려 낸 코드에 fetch 가 없다 — 범위가 어긋났거나 저장을 안 한다');
ok(PERSIST_SRC.length > 400 && FAILMSG_SRC.length > 100, '공용 저장 함수를 오려 내지 못했다');
ok(RSC_SRC.length > 400 && CMOVE_SRC.length > 200, '형제 입구(rscConfirm·confirmMove)를 오려 내지 못했다');

/** confirmMoveDo 를 가짜 환경에서 실제로 돌린다. */
async function run(opts) {
  const o = Object.assign({
    src: MOVE_SRC,
    slot: { id: 11, ids: [11], type: '1on1', students: [{ uid: 'jeong', name: '정우영' }], moveField: 'scheduled_date', duration_min: 20 },
    movedTeacher: true,
    reply: { status: 200, json: { ok: true } },     // 서버 응답(호출마다 같은 값)
  }, opts || {});

  const calls = [];          // 나간 요청
  const added = [];          // addSlot 호출
  const removed = [];        // SLOTS 에서 지운 키
  const toasts = [];
  let reloaded = 0, rendered = 0;

  const SLOTS = {};
  const slotKey = (t, d, m) => t + '__' + d + '__' + m;
  SLOTS[slotKey('29', '2026-09-11', 14 * 60 + 20)] = o.slot;

  const sandbox = {
    window: {}, console,
    currentLang: 'ko',
    SLOTS, slotKey,
    addSlot: (tid, d, h, s, m) => { added.push({ tid, d, h, m }); SLOTS[slotKey(tid, d, h * 60 + (m || 0))] = s; },
    render: () => { rendered++; },
    reloadAndRender: async () => { reloaded++; },
    closeModal: () => {},
    showDndToast: (msg, kind) => { toasts.push({ msg: String(msg), kind: kind || '' }); },
    escapeHtml: (x) => String(x == null ? '' : x),
    minLabel: (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'),
    fetch: async (url, init) => {
      calls.push({ url: String(url), method: (init && init.method) || 'GET', body: JSON.parse((init && init.body) || '{}') });
      const rep = typeof o.reply === 'function' ? o.reply(calls.length) : o.reply;
      return {
        ok: rep.status >= 200 && rep.status < 300,
        status: rep.status,
        json: async () => { if (rep.json === undefined) throw new Error('not json'); return rep.json; },
      };
    },
  };
  // SLOTS 에서 지우는 것을 잡으려고 delete 를 감시하는 대신 실행 뒤 키 존재로 판정한다
  vm.createContext(sandbox);
  new vm.Script(o.src).runInContext(sandbox);

  sandbox.window.__moveCtx = {
    srcTeacher: { id: '29', name: '중국어 강선생님' },
    dstTeacher: { id: '27', name: 'MAIMAI' },
    srcCoords: { dateISO: '2026-09-11', hour: 14, minute: 20, startMin: 14 * 60 + 20 },
    dstCoords: { dateISO: o.dstDate || '2026-09-11', hour: o.dstHour == null ? 15 : o.dstHour, minute: 0, startMin: (o.dstHour == null ? 15 : o.dstHour) * 60 },
    srcNm: '중국어 강선생님', dstNm: 'MAIMAI',
    movedTeacher: o.movedTeacher,
    srcData: { slot: o.slot },
  };
  await sandbox.window.confirmMoveDo();
  const srcGone = !(slotKey('29', '2026-09-11', 14 * 60 + 20) in SLOTS);
  return { calls, added, removed, toasts, reloaded, rendered, srcGone, SLOTS };
}

sec('① 저장이 실제로 나가는가 (이 사고의 본체)');
{
  const r = await run({});
  ok(r.calls.length === 1, '요청이 1건이 아니다 (' + r.calls.length + '건) — 드래그가 저장되지 않는다');
  const c = r.calls[0] || { url: '', method: '', body: {} };
  ok(c.method === 'PATCH', 'PATCH 가 아니다: ' + c.method);
  ok(/\/api\/admin\/class-schedules\/11$/.test(c.url), '엉뚱한 주소로 보낸다: ' + c.url);
  ok(c.body.start_time === '15:00', 'start_time 을 안 보낸다: ' + JSON.stringify(c.body));
  ok(r.rendered === 1 && r.srcGone, '저장 성공인데 화면을 안 옮겼다');
}

sec('② 강사 변경 — 싣는가 / 함부로 싣지 않는가 (짝)');
{
  const moved = await run({ movedTeacher: true });
  ok((moved.calls[0] || {}).body.teacher_id === '27', '강사 열을 바꿨는데 teacher_id 를 안 보낸다');
  const same = await run({ movedTeacher: false });
  ok(same.calls.length === 1, '시간만 옮길 때 요청이 안 나간다');
  ok(!('teacher_id' in ((same.calls[0] || {}).body || {})),
    '시간만 옮겼는데 teacher_id 를 보낸다 — 본사 전용 게이트를 괜히 타서 강사가 못 옮기게 된다');
}

sec('③ 반복 ↔ 일회성 — 보내는 칸이 갈리는가');
{
  const once = await run({ slot: { id: 11, ids: [11], type: '1on1', students: [{ uid: 'a' }], moveField: 'scheduled_date' } });
  const b1 = (once.calls[0] || {}).body || {};
  ok(b1.scheduled_date === '2026-09-11' && !('day_of_week' in b1),
    '일회성인데 날짜를 안 보내거나 요일을 함께 보낸다: ' + JSON.stringify(b1));

  const rep = await run({ slot: { id: 12, ids: [12], type: '1on1', students: [{ uid: 'a' }], moveField: 'day_of_week' } });
  const b2 = (rep.calls[0] || {}).body || {};
  ok(b2.day_of_week === 'Fri' && !('scheduled_date' in b2),
    '반복인데 요일을 안 보내거나 날짜를 함께 보낸다: ' + JSON.stringify(b2)
    + ' ⚠️ 반복 행에 scheduled_date 가 붙으면 sessions/today 가 그쪽을 우선해 «매주» 가 죽는다');

  /* 🔴 서버가 «어느 칸인지» 를 안 줬을 때 — 넘겨짚지 말고 **안 옮긴다.**
     2026-09-11 함정 대조: 처음엔 slot.recurring 으로 갈랐는데 그 칸이 진짜 수업에는
     실리지 않아 언제나 false → 반복 행에 날짜를 박아 «매주» 를 죽일 뻔했다.
     ⚠️ 이 짝이 없으면 «모르면 일회성» 같은 넘겨짚기가 그대로 통과한다. */
  for (const mf of [undefined, '', 'weekly', null]) {
    const unk = await run({ slot: { id: 41, ids: [41], type: '1on1', students: [{ uid: 'a' }], moveField: mf } });
    ok(unk.calls.length === 0 && unk.added.length === 0 && !unk.srcGone,
      '수업 종류를 모르는데(' + JSON.stringify(mf) + ') 옮겼다 — 틀린 칸을 고치면 화면으로 되돌릴 길이 없다');
    ok(unk.toasts.some(t => t.kind === 'bad'), '모를 때 사람에게 말하지 않는다');
  }

  // 요일은 시간대와 무관해야 한다 — UTC 로 파싱하지 않으면 하루가 밀린다
  const mon = await run({ slot: { id: 13, ids: [13], type: '1on1', students: [{ uid: 'a' }], moveField: 'day_of_week' }, dstDate: '2026-09-14' });
  ok(((mon.calls[0] || {}).body || {}).day_of_week === 'Mon', '9/14(월)인데 요일이 Mon 이 아니다');
}

sec('④ 그룹 수업 — 서버 행이 여럿이면 전부 옮기는가');
{
  const g = await run({ slot: { id: 21, ids: [21, 22, 23], type: 'group', students: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], moveField: 'scheduled_date' } });
  ok(g.calls.length === 3, '그룹인데 요청이 ' + g.calls.length + '건 — 한 명만 옮기면 수업이 쪼개진다');
  const ids = g.calls.map(c => c.url.split('/').pop()).sort();
  ok(ids.join(',') === '21,22,23', '보낸 id 가 다르다: ' + ids.join(','));
}

sec('⑤ 실패하면 «옮겨진 척» 하지 않는가 (거짓 성공 금지)');
{
  const bad = await run({ reply: { status: 200, json: { ok: false, error: 'forbidden_teacher' } } });
  ok(bad.added.length === 0 && !bad.srcGone, '서버가 거절했는데 화면을 옮겼다 — 사고가 그대로 남는다');
  ok(bad.reloaded === 1, '실패 뒤 서버에서 다시 읽지 않는다 — 화면이 계속 거짓말한다');
  ok(bad.toasts.some(t => t.kind === 'bad'), '실패를 사람에게 말하지 않는다');

  /* 🪤 종단 404 본문은 {error:'Not Found'} 라 ok 칸이 «없다».
     판정을 d.ok===false 로 쓰면 undefined===false 가 거짓이라 그대로 «성공» 이 된다. */
  const nf = await run({ reply: { status: 404, json: { error: 'Not Found' } } });
  ok(nf.added.length === 0 && !nf.srcGone, '404(ok 칸 없음)를 성공으로 읽었다');

  const boom = await run({ reply: { status: 500, json: undefined } });
  ok(boom.added.length === 0 && !boom.srcGone, '본문이 JSON 이 아닌 500 을 성공으로 읽었다');
}

sec('⑥ 옮길 수 없는 칸에는 요청을 보내지 않는가');
{
  const ghost = await run({ slot: { id: null, ids: [], type: '1on1', students: [{ uid: 'a' }], moveField: 'scheduled_date', origin: 'lms' } });
  ok(ghost.calls.length === 0, '자리표시(LMS·시드) 칸인데 요청을 보냈다');
  /* 🪤 «요청 0건» 만 보면 안 된다 — ids 가 비면 루프가 0회라 가드를 지워도 0건이다.
     그때는 fails 도 비어 «성공» 으로 읽고 화면만 옮긴다(= 고치기 전 그 버그). */
  ok(ghost.added.length === 0 && !ghost.srcGone,
    '옮길 수 없는 칸인데 화면에서는 옮겼다 — 새로고침하면 되돌아가는 그 사고가 그대로다');
  ok(ghost.toasts.some(t => t.kind === 'bad'), '옮길 수 없다고 말하지 않는다');

  const blk = await run({ slot: { id: 31, ids: [31], type: 'blocked', source: 'unavailability', students: [], moveField: 'scheduled_date' } });
  ok(blk.calls.length === 0, '근무불가 차단인데 이 API 로 보냈다 — 그건 다른 표(teacher_unavailability)다');
  ok(blk.added.length === 0, '차단을 화면에서만 옮겼다 — 예전 사고 그대로다');
}

sec('⑦ 서버 게이트 — 정본을 «실제로 돌려» 본다 (위치 검사로는 조건 뒤집기를 못 잡는다)');
/* 🪤 2026-09-11 함정 대조 실측: 이 절이 blk.indexOf(...) 로 «글자의 위치» 만 볼 때
   `if (false && _pchActor.isTeacher)`(강사 차단 무력화)와 «모르면 통과»(fail-open) 변이가
   **둘 다 PASS 41 / FAIL 0 으로 통과**했다. 하필 그 자리가 강사 급여를 지키는 자리다.
   (CLAUDE.md 「게이트를 라우트 «안» 에만 두지 마세요 — 조건을 뒤집어도 글자가 남아 통과」) */
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

/** 게이트 정본을 «소스 그대로»(또는 변이를 먹인 사본) 돌릴 수 있게 만든다. */
async function loadGate(gateSrc) {
  if (!esbuildApi) return null;
  const orgFn = (AUTH_TS.match(/export function isOrgScopedRole[\s\S]*?\n\}/) || [])[0] || '';
  if (!orgFn) return null;
  // import 줄만 걷어내고 정본 판정(isOrgScopedRole)은 «소스에서 오려 내» 함께 넣는다(복제 금지)
  const body = gateSrc.replace(/^import[^\n]*\n/gm, '');
  const js = esbuildApi.transformSync(orgFn + '\n' + body, { loader: 'ts', format: 'esm' }).code;
  return await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

const G = await loadGate(GATE_TS);
ok(!!G && typeof G.teacherMoveDenyReason === 'function' && typeof G.moveFieldConflict === 'function',
  '게이트 정본(class-teacher-move.ts)을 번들해 돌리지 못했다 — 아래 검사가 전부 헛돈다');

if (G) {
  const deny = (a) => G.teacherMoveDenyReason(a);
  const HQ = { ok: true, isTeacher: false, scopeType: 'hq' };
  ok(deny(HQ) === null, '본사 계정을 막는다 — 아무도 강사를 못 바꾸게 된다');
  ok(deny({ ...HQ, scopeType: 'none' }) === null, "scope 'none'(내부직원)을 막는다");
  ok((deny({ ...HQ, isTeacher: true }) || {}).error === 'forbidden_teacher',
    '강사를 안 막는다 — 남의 수업을 자기에게 가져올 수 있다(수업이 곧 급여)');
  ok((deny({ ...HQ, scopeType: 'teacher' }) || {}).error === 'forbidden_teacher',
    "scope_type='teacher' 를 안 막는다 — 이름 기반 강사 판정을 못 탄 계정이 그대로 통과한다");
  for (const st of ['branch', 'agency', 'franchise']) {
    ok((deny({ ...HQ, scopeType: st }) || {}).error === 'forbidden_scope', '조직 계정(' + st + ')을 안 막는다');
  }
  /* 🔴 «모른다» 를 «본사» 로 읽지 않는가 — getAdminActor 는 스코프를 못 구해도
     scopeType='none' → resolveRole 이 staff(본사 동급)로 떨어뜨린다. D1 이 한 번
     흔들릴 때 지사 계정이 그대로 통과하던 자리다. */
  for (const st of [null, undefined, '', '   ']) {
    ok((deny({ ...HQ, scopeType: st }) || {}).error === 'scope_unknown',
      '권한을 «못 읽었을 때»(' + JSON.stringify(st) + ') 막지 않는다 — fail-open');
  }
  ok((deny({ ok: false, isTeacher: false, scopeType: 'hq' }) || {}).status === 401, '미로그인을 통과시킨다');

  const mfc = (row, body) => G.moveFieldConflict(row, body);
  ok((mfc({ schedule_kind: 'recurring', scheduled_date: null }, { scheduled_date: '2026-09-14' }) || {}).error === 'recurring_needs_dow',
    '매주 반복 행에 날짜를 박는 요청을 통과시킨다 — 그 하루만 열리고 «매주» 가 죽는다');
  ok(mfc({ schedule_kind: 'dated', scheduled_date: '2026-09-11' }, { scheduled_date: '2026-09-18' }) === null,
    '날짜가 정해진 수업을 옮기지 못하게 막는다 — 되던 것이 깨진다');
  ok(mfc({ schedule_kind: 'recurring', scheduled_date: null }, { day_of_week: 'Mon' }) === null,
    '반복 수업을 요일로 옮기는 정상 요청을 막는다');
  ok(mfc(null, { scheduled_date: '2026-09-14' }) === null, '행을 못 읽었을 때 여기서 판단한다(부르는 쪽이 막아야 한다)');
}

sec('⑦-2 서버 라우트 — 그 정본을 «부르고 결과를 조건으로 쓰는가»');
{
  const A = srv.indexOf("if ((method === 'PATCH' || method === 'PUT') && /^\\/api\\/admin\\/class-schedules");
  const B = srv.indexOf('💰 Phase F1~F2', A > 0 ? A : 0);
  const blk = (A > 0 && B > A) ? srv.slice(A, B) : '';
  ok(blk.length > 1000, 'PATCH 핸들러를 오려 내지 못했다 (길이 ' + blk.length + ')');

  /* 🪤 부정 검사는 **주석을 벗겨 낸 사본** 으로 판정한다 — 2026-09-11 실측: 「⛔ canEditOrg 로
     막으면 안 된다」고 적어 둔 내 주석이 그대로 걸려 멀쩡한 코드가 FAIL 했다
     (CLAUDE.md 「부정 검사가 자기 주석을 잡는다」). */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const bare = strip(blk);
  ok(bare.length > 600 && bare.length < blk.length,
    '주석 제거가 이상하다 (원본 ' + blk.length + ' → ' + bare.length + ') — 이 상태면 아래 부정 검사가 헛돈다');

  const iPush = bare.indexOf("sets.push('teacher_id = ?')");
  ok(iPush > 0, 'PATCH 가 teacher_id 를 UPDATE 목록에 넣지 않는다 — 강사 변경이 저장될 수 없다');
  /* ⛔ 「이름이 어디 있나」가 아니라 «게이트가 «채운 그 값» 을 조건으로 쓰는가» 로 묻는다. */
  const iDeny = bare.indexOf('const _deny = teacherMoveDenyReason(');
  ok(iDeny > 0 && iDeny < iPush, '게이트 정본을 teacher_id 저장보다 앞에서 부르지 않는다');
  ok(/if\s*\(_deny\)\s*return json\(/.test(bare), '게이트를 부르기만 하고 그 결과로 막지 않는다');
  ok(/if\s*\(_mfDeny\)\s*return json\(/.test(bare), '반복/날짜 판정을 부르기만 하고 막지 않는다');
  const iRead = bare.indexOf("error: 'schedule_read_failed'");
  ok(iRead > 0 && iRead < iPush,
    '행을 못 읽었는데 담당 강사를 바꾼다 — 카페24 미러 도장(c24-mirror:manual)이 함께 빠져 밤에 되돌아간다');
  const iFound = bare.indexOf("error: 'teacher_not_found'");
  ok(iFound > 0 && iFound < iPush, '없는 강사 번호를 그대로 저장한다 — 그 수업은 «강사를 모르는» 행이 된다');
  ok(/canEditOrg\s*\(/.test(bare) === false,
    'canEditOrg 로 막고 있다 — 그 함수는 scope «none»(내부직원·교사)에도 true 라 강사를 못 막는다');

  /* 🔴 감사 이력을 요청 본문으로 위조할 수 없어야 한다 — body 는 request.json() 이다.
     (2026-09-11 함정 대조 지적: __teacher_to_name 을 body 에 끼워 넘기고 있었다) */
  ok(/__teacher_to_name|__teacher_from/.test(blk) === false,
    '감사 이력용 상태를 body 에 끼워 넘긴다 — 클라이언트가 «담당 강사 29 → 아무개» 를 위조할 수 있다');
  ok(/_tchToName/.test(bare), '강사 변경이 감사 이력(class_audit_log)에 남지 않는다');

  /* 🚚 화면이 판정을 복제하지 않고 서버 값을 쓰는가 */
  ok(/move_field:/.test(srv), '/api/admin/schedules 가 move_field 를 안 내려준다 — 화면이 판정을 복제하게 된다');
  ok(/slot\.recurring/.test(strip(MOVE_SRC)) === false,
    'confirmMoveDo 가 아직 slot.recurring 으로 가른다 — 그 칸은 진짜 수업에 실리지 않아 언제나 false 다');
}

sec('⑧ 변이시험 — 되돌리면 실제로 FAIL 나는가');
{
  const muts = [
    ['옛 코드(메모리만 고치고 «이동됨» 이라고 말하기)', s => s.replace(/await fetch\(/g, 'await (async()=>({ok:true,status:200,json:async()=>({ok:true})}))(')],
    ['저장 «전» 에 화면을 옮기기', s => s.replace('if(!res.ok){', 'addSlot(ctx.dstTeacher.id,ctx.dstCoords.dateISO,ctx.dstCoords.hour,slot,ctx.dstCoords.minute||0);\n  if(!res.ok){')],
    ['판정을 «실패라고 말했는가»(d.ok===false)로', s => s.replace('if(!(r.ok && d && d.ok===true))', 'if(d && d.ok===false)')],
    ['그룹인데 첫 행만 보내기', s => s.replace('var ids=(slot.ids&&slot.ids.length)?slot.ids.slice():(slot.id?[slot.id]:[]);', 'var ids=(slot.id?[slot.id]:[]);')],
    ['반복 수업에도 날짜를 함께 보내기', s => s.replace("if(mf==='day_of_week'){", "body.scheduled_date=String(ctx.dstCoords.dateISO);\n  if(mf==='day_of_week'){")],
    ['강사를 안 싣기', s => s.replace('if(newTeacherId) body.teacher_id=String(newTeacherId);', '')],
    ['자리표시 칸도 보내기', s => s.replace("if(!ids.length) return { ok:false, reason:'no_id', fails:[] };", '')],
    ['모르면 «일회성» 으로 넘겨짚기', s => s.replace("if(mf!=='day_of_week'&&mf!=='scheduled_date') return { ok:false, reason:'unknown_kind', fails:[] };", "if(mf!=='day_of_week') mf='scheduled_date';")],
    ['옛 판정(slot.recurring)으로 되돌리기', s => s.replace("if(mf==='day_of_week'){", 'if(slot.recurring){')],
  ];
  for (const [name, f] of muts) {
    const src = f(MOVE_SRC);
    /* 🪤 치환이 안 먹으면 «아무것도 안 돌리고 PASS» 가 된다 — 검사가 조용히 사라지는 모양이라
       따로 FAIL 로 둔다(2026-09-11 함정 대조 지적). */
    ok(src !== MOVE_SRC, '변이 «' + name + '» 의 치환이 안 먹었다 — 이 줄이 리팩터된 것이다(검사가 헛돈다)');
    let broke = (src === MOVE_SRC);
    if (!broke) {
      try {
        const a = await run({ src });
        if (a.calls.length !== 1 || (a.calls[0].body.teacher_id !== '27')) broke = true;
        const g = await run({ src, slot: { id: 21, ids: [21, 22], type: 'group', students: [{ uid: 'a' }, { uid: 'b' }], moveField: 'scheduled_date' } });
        if (g.calls.length !== 2) broke = true;
        const bad = await run({ src, reply: { status: 200, json: { ok: false, error: 'x' } } });
        if (bad.added.length || bad.srcGone || bad.reloaded !== 1) broke = true;
        const nf = await run({ src, reply: { status: 404, json: { error: 'Not Found' } } });
        if (nf.added.length || nf.srcGone) broke = true;
        const rep = await run({ src, slot: { id: 12, ids: [12], type: '1on1', students: [{ uid: 'a' }], moveField: 'day_of_week' } });
        const rb = rep.calls[0] ? rep.calls[0].body : {};
        if (rb.day_of_week !== 'Fri' || ('scheduled_date' in rb)) broke = true;
        const gh = await run({ src, slot: { id: null, ids: [], type: '1on1', students: [{ uid: 'a' }], moveField: 'scheduled_date' } });
        if (gh.calls.length !== 0 || gh.added.length || gh.srcGone) broke = true;
        const unk = await run({ src, slot: { id: 41, ids: [41], type: '1on1', students: [{ uid: 'a' }] } });
        if (unk.calls.length !== 0 || unk.added.length) broke = true;
      } catch (_) { broke = true; }
    }
    ok(broke, '변이 «' + name + '» 가 그대로 통과했다 — 이 검사는 그것을 못 막는다');
  }

  /* 🔒 서버 게이트에도 «조건 뒤집기» 변이를 넣는다 — 이것이 없으면 위 ⑦절이 헛돌아도 모른다.
     (CLAUDE.md 「변이 N종 전부 FAIL 이라고 적을 때 그 N 에 «조건 뒤집기» 가 들어 있는지 세어 보라」) */
  if (G) {
    const gmuts = [
      ['강사 차단 무력화', t => t.replace('if (a.isTeacher) return denyTeacher;', 'if (false && a.isTeacher) return denyTeacher;')],
      ['«모르면» 통과(fail-open)', t => t.replace(/if \(a\.scopeType == null[\s\S]*?\n  \}/, '')],
      ['조직 계정 통과', t => t.replace('if (isOrgScopedRole(st)) {', 'if (false) {')],
      ['반복 수업 판정 끄기', t => t.replace("if (kind === 'recurring' && !hasDate) {", 'if (false) {')],
    ];
    for (const [name, f] of gmuts) {
      const src = f(GATE_TS);
      ok(src !== GATE_TS, '서버 변이 «' + name + '» 의 치환이 안 먹었다 — 정본이 리팩터된 것이다');
      let broke = (src === GATE_TS);
      if (!broke) {
        try {
          const M = await loadGate(src);
          const HQ = { ok: true, isTeacher: false, scopeType: 'hq' };
          if ((M.teacherMoveDenyReason({ ...HQ, isTeacher: true }) || {}).error !== 'forbidden_teacher') broke = true;
          if ((M.teacherMoveDenyReason({ ...HQ, scopeType: null }) || {}).error !== 'scope_unknown') broke = true;
          if ((M.teacherMoveDenyReason({ ...HQ, scopeType: 'branch' }) || {}).error !== 'forbidden_scope') broke = true;
          if ((M.moveFieldConflict({ schedule_kind: 'recurring', scheduled_date: null }, { scheduled_date: '2026-09-14' }) || {}).error !== 'recurring_needs_dow') broke = true;
        } catch (_) { broke = true; }
      }
      ok(broke, '서버 변이 «' + name + '» 가 그대로 통과했다 — 급여가 걸린 게이트를 못 지킨다');
    }
  }
}

sec('⑨ 형제 입구 — 같은 일을 하는 다른 길도 «서버에» 저장하는가');
/* 🔴 2026-09-11 함정 대조 지적: 드래그만 고치면 사장님이 다음에 우클릭 「수업 변경」 →
   담당 강사 탭을 쓰는 순간 그 사고가 글자 그대로 재현된다. 이 화면에는 같은 일을 하는
   입구가 «셋» 이다(드래그 · 우클릭 연기/변경 · 「이동」 모달). */
{
  for (const [name, src] of [['rscConfirm(우클릭 연기/변경)', RSC_SRC], ['confirmMove(이동 모달)', CMOVE_SRC]]) {
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    ok(/persistSlotMove\s*\(/.test(bare), name + ' 가 저장 함수를 부르지 않는다 — 화면만 바뀌고 새로고침하면 되돌아간다');
    ok(/await\s+persistSlotMove/.test(bare), name + ' 가 저장을 기다리지 않는다');
    /* ⛔ 저장 «전» 에 화면을 옮기면 안 된다 — 성공 판정(res.ok)보다 addSlot 이 뒤여야 한다. */
    const iRes = bare.indexOf('persistSlotMove');
    const iAdd = bare.indexOf('addSlot(');
    ok(iAdd > iRes, name + ' 가 저장 전에 화면을 옮긴다');
    ok(/if\s*\(!res\.ok\)/.test(bare), name + ' 가 저장 실패를 확인하지 않는다');
    /* 예전에 「✅ 담당 강사 변경」·alert('시간이 변경되었습니다') 를 저장 없이 띄우던 자리다. */
    const iFail = bare.indexOf('if(!res.ok)') >= 0 ? bare.indexOf('if(!res.ok)') : bare.indexOf('if (!res.ok)');
    ok(iFail > 0 && iFail < iAdd, name + ' 의 실패 처리가 화면 반영보다 뒤에 있다');
  }
  ok(/alert\(/.test(CMOVE_SRC) === false, 'confirmMove 가 아직 alert 로 «변경됐다» 고 말한다(저장과 무관하게)');
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);

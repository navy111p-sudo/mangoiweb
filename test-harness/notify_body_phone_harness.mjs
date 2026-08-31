/* ═══════════════════════════════════════════════════════════════════════════
   📵 `/api/notify/*` 가 «본문에 적힌 번호·이름» 을 믿지 않는지 감시 (2026-09-01 신설)

   [무엇을 막나] 다섯 경로가 인증 없이 열려 있는데 **요청 본문의 전화번호로 그대로 발송**했다.
   누구나 아무 번호에나 「망고아이」 이름으로 문자를 보낼 수 있었다(돈이 나가고 사칭이 된다).

   🔴 그리고 `no-show` 는 더 나쁘다 — 본문의 `teacher_name` 이 그대로 `class_no_show` 에
   들어가는데, 읽는 쪽(`no-show-truth.ts`)이 그 이름을 출석부와 맞춰 «오판» 인지 가리고
   **급여는 present === true 일 때만 되돌린다.** 즉 이름을 틀리게 심으면
   들어와 수업한 강사에게 0원이 나간다.

   [실측 2026-09-01] 이 알림 기능은 «한 번도» 발송된 적이 없다 — 화면이 번호를 꺼내는
   `demoStudents`(js/idx-user-session.js)가 **데모 5명 하드코딩이고 전화번호 칸이 없다.**
   D1 도 `class_no_show` 38건 전부 `notified_kakao=0`, `students_erp` 29,438행의 전화번호 0건.
   ⟹ 게이트를 걸든 안 걸든 «되던 알림» 은 없다. 그래서 게이트 대신 **번호를 본문에서 안 받는** 쪽으로
      고쳤다(나중에 번호가 적재되면 그날부터 맞는 사람에게 저절로 나간다).

   [검사 방법] 문자열만 보지 않는다 — 해석 함수를 esbuild 로 컴파일해 가짜 D1 로 **실제로 돌린다.**
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위 주석 제거 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시» 하나에
 *  코드가 통째로 함께 사라진다(이 저장소 index.ts 에서 실측 8만자). */
function strip(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw;
  }).join('\n');
}

const notifyRaw = readFileSync(join(SRC, 'api-notify.ts'), 'utf8');
const notify = strip(notifyRaw);

const PATHS = ['lesson-started', 'lesson-ended', 'chat-summary', 'no-show', 'mention'];

/** 핸들러를 «중괄호 짝» 으로 자른다. 길이로 자르면 옆 핸들러가 딸려 온다.
 *  ⚠️ 문자열 안의 짝 없는 중괄호가 있으면 어긋난다 — 지금은 없지만, 어긋나면 조각이
 *  짧아지므로 부르는 쪽이 길이를 함께 확인한다. */
function handlerBlock(name) {
  const s = notify.indexOf(`path === '/api/notify/${name}'`);
  if (s < 0) return '';
  let d = 0, started = false;
  for (let i = s; i < notify.length; i++) {
    if (notify[i] === '{') { d++; started = true; }
    else if (notify[i] === '}') { d--; if (started && d === 0) return notify.slice(s, i + 1); }
  }
  return '';
}

console.log('\n[ A. 본문에 적힌 전화번호를 한 곳도 쓰지 않는다 ]');
{
  /* ⚠️ 부정 검사는 «주석 벗긴 사본» 으로 — 「전화번호는 본문에서 받지 않는다」고 적은
     설명 주석 자체가 걸려 거짓 FAIL 이 난다(이 저장소가 여러 번 밟은 함정).
     ⚠️ 그리고 «파일 전체» 를 훑지 않는다 — 이 파일에 나중에 「발송 테스트」류의 정당한
     body.phone 핸들러가 생기면 멀쩡한 코드가 FAIL 한다. 물어야 할 것은 «그 이름이 나오는가»
     가 아니라 «그 다섯 경로가 그 짓을 하는가» 다(2026-09-01 trap-check 지적). */
  const hits = [];
  for (const p of PATHS) {
    const blk = handlerBlock(p);
    if (!blk) { no(`${p} 핸들러를 찾지 못했다`, '구조가 바뀌었나?'); continue; }
    blk.split('\n').forEach((l, i) => {
      if (/body\.(student_phone|parent_phone|teacher_phone|mentioned_phone|phone)\b/.test(l)) {
        hits.push(p + ' +' + (i + 1) + ': ' + l.trim().slice(0, 80));
      }
    });
  }
  check('본문 전화번호를 읽는 곳이 0곳이다', hits.length === 0,
    hits.join('\n       ') + '\n       → 인증이 없는 경로다. 아무나 아무 번호로 문자를 보낼 수 있게 된다');

  check('번호는 정본 해석기(notify-contacts)를 거친다',
    /from '\.\/notify-contacts'/.test(notify) && /resolveNotifyPhones\(/.test(notify),
    '해석기를 안 쓰면 어디선가 다시 본문 값을 쓰게 된다');
}

console.log('\n[ B. no-show 의 강사·학생 «이름» 도 서버가 푼다 — 급여가 걸린 값이다 ]');
{
  /* 블록은 «중괄호 짝» 으로 자른다. 길이로 자르면 옆 핸들러가 딸려 온다. */
  const s = notify.indexOf("path === '/api/notify/no-show'");
  let block = '';
  if (s >= 0) {
    let d = 0, started = false;
    for (let i = s; i < notify.length; i++) {
      if (notify[i] === '{') { d++; started = true; }
      else if (notify[i] === '}') { d--; if (started && d === 0) { block = notify.slice(s, i + 1); break; } }
    }
  }
  check('no-show 블록을 찾았다', block.length > 500, '핸들러 구조가 바뀌었나?');
  check('예약에서 이름을 푼다(partiesForRoom)', /partiesForRoom\(/.test(block),
    '본문 teacher_name 을 그대로 쓰면 남의 수업에 엉뚱한 이름을 심어 급여를 0원으로 만들 수 있다');
  check('서버가 푼 값이 «먼저» 오고 본문은 폴백이다',
    /_parties\?\.teacherName \|\| body\.teacher_name/.test(block)
    && /_parties\?\.studentName \|\| body\.student_name/.test(block),
    '순서가 반대면 본문이 이기므로 고친 것이 아니다');
  check('기록하는 «순간» 에 푼다(INSERT 보다 앞)',
    block.indexOf('partiesForRoom') < block.indexOf('INSERT INTO class_no_show'),
    '나중에 읽을 때 풀면 역사를 덮어쓴다 — class_schedules 는 뒤에 바뀐다(실측 class-895)');
}

console.log('\n[ C. 실제로 돌려 본다 — 가짜 D1 로 해석기를 실행 ]');
{
  /* ⚠️ esbuild 는 bin/ 경로를 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API 를 쓴다. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'notify-'));
  const out = join(dir, 'c.mjs');
  buildSync({ entryPoints: [join(SRC, 'notify-contacts.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /** 질의문에 따라 답을 주는 가짜 D1. 바인드 값도 함께 돌려줘 «무엇으로 찾았나» 를 본다. */
  const mkEnv = (rows) => ({ DB: { prepare: (q) => ({ bind: (...a) => ({
    first: async () => (typeof rows === 'function' ? rows(q, a) : rows),
  }) }) } });

  const p1 = await M.resolveNotifyPhones(
    mkEnv({ phone: '010-1111-2222', student_phone: '', parent_phone: '010-3333-4444' }),
    { studentUid: 'jeong' });
  check('학생 계정으로 학생·학부모 번호를 찾는다',
    p1.student === '01011112222' && p1.parent === '01033334444',
    JSON.stringify(p1));

  const p2 = await M.resolveNotifyPhones(mkEnv(null), { studentUid: 'nobody' });
  check('못 찾으면 빈 값이다 — 본문 값으로 되돌아가지 않는다',
    p2.student === '' && p2.parent === '' && p2.teacher === '',
    JSON.stringify(p2) + ' — 폴백이 생기면 구멍이 그대로다');

  const p3 = await M.resolveNotifyPhones(
    mkEnv({ phone: '010-5555-6666', parent_phone: '010-5555-6666' }), { studentUid: 'x' });
  check('학생·학부모 번호가 같으면 한 번만 보낸다', p3.student === '' && p3.parent === '01055556666',
    JSON.stringify(p3) + ' — 2026-07-22 학부모 컴플레인 #1');

  const p4 = await M.resolveNotifyPhones(mkEnv({ phone: '12345' }), { studentUid: 'x' });
  check('번호로 볼 수 없는 값은 버린다', p4.student === '', JSON.stringify(p4));

  const p5 = await M.resolveNotifyPhones({ DB: { prepare: () => { throw new Error('D1 down'); } } },
    { studentUid: 'x' }).catch((e) => e);
  check('D1 이 죽어도 던지지 않는다(알림이 수업을 막으면 안 된다)',
    p5 && p5.student === '' && !(p5 instanceof Error), String(p5));

  // ── 방 → 당사자 해석
  const sched = { uid: 'delaware', sname: '김연숙', tid: '3', tname: 'HT FARRAH' };
  const r1 = await M.partiesForRoom(mkEnv(sched), 'class-895-20260825');
  check('방 번호만으로 예약을 푼다(class-{예약id}-{YYYYMMDD})',
    r1 && r1.teacherName === 'HT FARRAH' && r1.studentName === '김연숙' && r1.studentUid === 'delaware',
    JSON.stringify(r1));

  let sawId = null;
  await M.partiesForRoom(mkEnv((q, a) => { if (/class_schedules/.test(q)) sawId = a[0]; return sched; }),
    'class-999-20260101', 852);
  check('schedule_id 가 있으면 그것을 쓴다(방 번호보다 우선)', sawId === 852, '쓴 id: ' + sawId);

  const r2 = await M.partiesForRoom(mkEnv(sched), 'meet-123');
  check('예약방이 아니면 null — 본문 폴백은 부르는 쪽이 정한다', r2 === null, JSON.stringify(r2));

  const r3 = await M.partiesForRoom(mkEnv(null), 'class-852-20260806');
  check('예약행이 지워졌으면 null(실측 38건 중 2건)', r3 === null, JSON.stringify(r3));

  const r4 = await M.partiesForRoom(mkEnv({ uid: 'x', sname: '', tid: null, tname: null }), 'class-1-20260101');
  check('이름 칸이 비었으면 null 로 둔다 — 빈 문자열을 «이름» 으로 쓰지 않는다',
    r4 && r4.teacherName === null && r4.studentName === null, JSON.stringify(r4));

  const r5 = await M.partiesForRoom({ DB: { prepare: () => { throw new Error('D1 down'); } } }, 'class-1-20260101');
  check('예약 조회가 죽어도 던지지 않는다', r5 === null, String(r5));

  /* ── 강사 번호: «위임했는가» 만 보면 헛돌 수 있다. 실제로 돌려서 정본 규칙이 사는지 본다.
     ⚠️ 정본(findTeacherContact)은 teachers → teacher_profiles(linked) → 이름일치 순으로 조회한다. */
  /* ⚠️ 정본은 프로필 목록을 `.bind()` **없이** `.all()` 로 부른다. 가짜 DB 가 bind 아래에만
     all 을 두면 그 줄이 예외를 내고 정본이 통째로 lookup_failed 로 빠지는데, 그러면
     ambiguous·부분일치 검사까지 «빈 문자열» 이라 **헛돌며 통과**한다(실제로 그랬다).
     그래서 두 층 모두에 first/all 을 둔다. */
  const teacherEnv = (profiles, linked = null) => {
    const api = (q) => ({
      first: async () => (/FROM teachers/.test(q) ? { id: '3', name: 'HT FARRAH' }
        : /linked_teacher_id/.test(q) ? linked : null),
      all: async () => ({ results: profiles }),
    });
    return { DB: { prepare: (q) => ({ ...api(q), bind: () => api(q) }) } };
  };

  const t1 = await M.phoneForTeacher(teacherEnv([{ english_name: 'HT FARRAH', phone: '0917-000-1111' }]), '3');
  check('강사 원부 번호로 프로필 전화를 찾는다', t1 === '09170001111', JSON.stringify(t1));

  const t2 = await M.phoneForTeacher(teacherEnv([
    { english_name: 'HT FARRAH', phone: '0917-000-1111' },
    { korean_name: 'HT FARRAH', phone: '0917-222-3333' },
  ]), '3');
  check('후보가 둘이면 아무에게도 안 보낸다(ambiguous)', t2 === '',
    JSON.stringify(t2) + ' — 모르는 것보다 틀린 게 나쁘다');

  const t3 = await M.phoneForTeacher(teacherEnv([{ english_name: 'ANNA', phone: '0917-999-8888' }]), '3');
  check("부분일치로 남의 번호를 붙이지 않는다('ANNA' ⊄ 'HT FARRAH')", t3 === '', JSON.stringify(t3));

  const t4 = await M.phoneForTeacher(teacherEnv([], { phone: '0917-555-6666' }), '3');
  check('관리자가 손으로 정한 연결이 이름 추측보다 앞선다', t4 === '09175556666', JSON.stringify(t4));

  const t5 = await M.phoneForTeacher(teacherEnv([]), '');
  check('강사번호가 없으면 조회하지 않는다', t5 === '', JSON.stringify(t5));
}

console.log('\n[ D. 강사 번호는 «정본 해석기» 에 위임한다 — 같은 판정을 복제하지 않는다 ]');
{
  /* ⚠️ 처음엔 이 자리에 `phoneForTeacher … return '';` 를 정규식으로 못 박아 두었다.
     그런데 「강사 전화번호 칸이 없다」는 내 전제가 **틀렸고**(teacher_profiles.phone 이 있고
     absent-sweep 이 이미 쓰고 있었다), 그래서 그 검사는 **틀린 사실을 검사로 굳히고** 있었다
     — 나중에 제대로 이으면 오히려 FAIL 이 났을 것이다(2026-09-01 trap-check 지적).
     이제 «빈 값을 돌려주는가» 가 아니라 «정본에 위임하는가» 를 본다. */
  const mod = strip(readFileSync(join(SRC, 'notify-contacts.ts'), 'utf8'));
  const sweep = strip(readFileSync(join(SRC, 'absent-sweep.ts'), 'utf8'));
  check('정본 findTeacherContact 에 위임한다(판정을 복제하지 않는다)',
    /from '\.\/absent-sweep'/.test(mod) && /findTeacherContact\(env, tid\)/.test(mod),
    '이름 일치 규칙을 여기에 복제하면 반드시 어긋난다(규칙서 2장)');
  check('그 정본이 실제로 내보내져 있다', /export async function findTeacherContact/.test(sweep),
    'export 가 빠지면 컴파일은 되어도 두 벌로 갈라진다');
  check('정본은 후보가 둘 이상이면 아무에게도 안 보낸다',
    /hits\.length === 1/.test(sweep) && /ambiguous/.test(sweep),
    '애매할 때 보내면 남의 강사에게 간다 — 모르는 것보다 틀린 게 나쁘다');
  check('강사는 «계정» 이 아니라 원부 번호로 찾는다',
    /teacherId\?: any/.test(mod) && !/teacherUid/.test(mod),
    '계정으로 이으면 겹치는 구간에서 남의 번호가 걸린다(강사 번호는 세 갈래)');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 notify_body_phone_harness 실패'); process.exit(1); }
console.log('🎉 notify_body_phone_harness — 전부 통과');

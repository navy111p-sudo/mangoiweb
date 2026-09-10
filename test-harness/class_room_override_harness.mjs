/**
 * 「오늘은 이 방으로」 감시 — src/class-room-override.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 이 하니스가 있나
 *   ① 방 이름 규칙이 **화면과 갈리면** 2026-09-09 사고(「같은 번호인데 다른 방」)가 그대로
 *      재현된다. 그래서 «글자가 있는가» 가 아니라 **두 규칙을 오려 내 실제로 돌려 답을 대조**한다.
 *   ② 학생 «입장» 경로에 붙는 코드라 **던지면 안 된다**(fail-open). 가짜 D1 로 실제로 확인한다.
 *   ③ 「남의 수업을 다른 방으로 돌리는」 조작이라 권한은 **모르면 막는 쪽**이어야 한다.
 *
 * ⛔ 검사를 「그 함수가 있는가」로 되돌리지 말 것 — 함수도 값도 «있는데» 답만 틀린 것이
 *    이 저장소가 반복해서 밟은 모양이다.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

let pass = 0, fail = 0;
const ok = (t) => { pass++; console.log('  PASS ' + t); };
const bad = (t, why) => { fail++; console.log('  FAIL ' + t + (why ? ' — ' + why : '')); };
const check = (t, cond, why) => (cond ? ok(t) : bad(t, why));

const modSrc = readFileSync(join(SRC, 'class-room-override.ts'), 'utf8');
const mangoSrc = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const modalSrc = readFileSync(join(PUB, 'js/idx-vc-room.js'), 'utf8');

/* ── 정본을 «컴파일 없이» 실제로 돌린다 (node --experimental-strip-types) ───── */
function runInModule(body) {
  const tmp = mkdtempSync(join(tmpdir(), 'cro-'));
  const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'class-room-override.ts'), fix(modSrc));
  writeFileSync(join(tmp, 'd1-chunk.ts'), fix(readFileSync(join(SRC, 'd1-chunk.ts'), 'utf8')));
  writeFileSync(join(tmp, 'run.mjs'), body);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  return r;
}

/* ══ ① 방 이름 규칙이 화면과 «같은 말» 을 하는가 ══════════════════════════════ */
console.log('\n① 방 이름 규칙 — 화면(idx-vc-room.js)과 서버가 같은 답을 내는가');
{
  // 화면 규칙을 오려 내 실제로 돌린다
  const cut = (src, head) => {
    const i = src.indexOf(head);
    if (i < 0) return null;
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '{') { d++; started = true; }
      else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    return null;
  };
  const normBody = cut(modalSrc, 'function normalize(');
  const prefixM = /var\s+PREFIX\s*=\s*'([^']*)'/.exec(modalSrc);
  check('전제: 화면의 normalize() 를 오려 냈다', !!normBody);
  check('전제: 화면의 PREFIX 를 읽었다 (' + (prefixM && prefixM[1]) + ')', !!prefixM);

  if (normBody && prefixM) {
    const clientRoom = new Function('code',
      normBody.replace(/^\s*function\s+normalize\s*\([^)]*\)\s*\{/, '').replace(/\}\s*$/, '')
        .replace(/\breturn\b/, 'const __slug =') + `
        ; return __slug ? ${JSON.stringify(prefixM[1])} + __slug : '';`
    );

    const SAMPLES = ['1234', 'MEET-1234', 'Meet-1234', 'meet-1234', ' 1234 ', 'ROOM 7',
                     '회의', '12-34', 'abc', 'ABC', 'a b c', '1234!!', '', '   '];
    const r = runInModule(`
      import { meetRoomId } from './class-room-override.ts';
      const S = ${JSON.stringify(SAMPLES)};
      console.log(JSON.stringify(S.map(s => meetRoomId(s))));
    `);
    if (r.status !== 0) {
      bad('①-0 서버 규칙 실행', (r.stderr || '').split('\n').filter(Boolean).slice(-2).join(' | '));
    } else {
      const server = JSON.parse(r.stdout.trim().split('\n').pop());
      let same = 0, diff = [];
      SAMPLES.forEach((s, i) => {
        const c = clientRoom(s);
        if (c === server[i]) same++; else diff.push(`${JSON.stringify(s)} 화면=${c} 서버=${server[i]}`);
      });
      diff.length === 0
        ? ok(`화면과 서버가 ${same}/${SAMPLES.length} 전부 같은 답 (예: 1234 → ${server[0]})`)
        : bad('화면과 서버의 답이 다르다', diff.join(' · '));
      // «제대로 만든다» 도 짝으로 — 전부 빈 문자열이어도 «같다» 는 통과한다
      check('①-b 빈 값이 아닌 답이 실제로 나온다 (meet- 가 붙는다)',
        server[0] === 'meet-1234' && server[1] === 'meet-1234',
        '대문자 MEET-1234 도 같은 방이어야 한다: ' + JSON.stringify(server.slice(0, 2)));
    }
  }
}

/* ══ ② 지정 값 검증 — 모르는 값은 거절하는가 ══════════════════════════════════ */
console.log('\n② 지정 값 검증 — 예약방·공용방으로는 못 보낸다');
{
  const r = runInModule(`
    import { validateOverrideInput } from './class-room-override.ts';
    const T = [
      [1, '1234'], [1, 'MEET-1234'], [1, ' 1234 '],
      [1, ''], [1, '   '], [1, '!!!'],
      [1, 'class-849-20260910'], [1, 'mangoi-class'], [1, 'c24-511741'], [1, 'demo-1'], [1, 'room-abc'],
      [0, '1234'], [-3, '1234'], ['x', '1234'], [null, '1234'],
    ];
    console.log(JSON.stringify(T.map(([a,b]) => { const v = validateOverrideInput(a,b); return [v.ok, v.room_id, v.error||null]; })));
  `);
  if (r.status !== 0) { bad('②-0 실행', (r.stderr||'').split('\n').filter(Boolean).slice(-2).join(' | ')); }
  else {
    const v = JSON.parse(r.stdout.trim().split('\n').pop());
    check('②-1 정상 번호는 통과하고 meet- 가 붙는다', v[0][0] === true && v[0][1] === 'meet-1234', JSON.stringify(v[0]));
    check('②-2 대문자·공백도 같은 방으로', v[1][1] === 'meet-1234' && v[2][1] === 'meet-1234', JSON.stringify([v[1], v[2]]));
    check('②-3 빈 값·기호뿐인 값은 거절', v[3][0] === false && v[4][0] === false && v[5][0] === false, JSON.stringify(v.slice(3, 6)));
    check('②-4 ⛔ 예약 수업방(class-…)으로는 못 보낸다', v[6][0] === false, JSON.stringify(v[6]));
    check('②-5 ⛔ 공용 연습방(mangoi-class)으로는 못 보낸다', v[7][0] === false, JSON.stringify(v[7]));
    check('②-6 ⛔ 카페24·연습·자동생성 방도 막는다', v[8][0] === false && v[9][0] === false && v[10][0] === false, JSON.stringify(v.slice(8, 11)));
    check('②-7 예약 번호가 이상하면 거절', v.slice(11).every(x => x[0] === false), JSON.stringify(v.slice(11)));
  }
}

/* ══ ③ 적용 — 갈아 끼우는가 / 실패해도 던지지 않는가 ═════════════════════════ */
console.log('\n③ 적용 — room_id 를 갈아 끼우고, 실패해도 «예약방 그대로» 로 넘어가는가');
{
  const r = runInModule(`
    import { applyRoomOverrides } from './class-room-override.ts';
    const mkDb = (rows) => ({ prepare() { return { bind() { return { all: async () => ({ results: rows }) }; } }; } });
    const out = [];
    const S = () => ([{ schedule_id: 7, room_id: 'class-7-20260910' }, { schedule_id: 8, room_id: 'class-8-20260910' }]);

    // 1) 지정이 있으면 갈아 끼운다 — 그리고 «지정 없는 다른 수업» 은 안 건드린다
    let s = S();
    await applyRoomOverrides(mkDb([{ schedule_id: 7, ymd: '20260910', room_id: 'meet-1234', note: '오늘만' }]), s, '20260910');
    out.push(['갈아끼움', s[0].room_id, s[0].room_override === true, s[0].room_id_original, s[0].room_override_note]);
    out.push(['안건드림', s[1].room_id, s[1].room_override === undefined]);

    // 2) 표에 meet- 가 아닌 값이 들어 있으면 무시한다 (마지막 문)
    s = S();
    await applyRoomOverrides(mkDb([{ schedule_id: 7, ymd: '20260910', room_id: 'class-999-20260910', note: null }]), s, '20260910');
    out.push(['meet아님무시', s[0].room_id, s[0].room_override === undefined]);

    // 3) 조회가 던져도 «던지지 않고» 원래 방 그대로
    s = S();
    let threw = false;
    try { await applyRoomOverrides({ prepare() { throw new Error('boom'); } }, s, '20260910'); } catch (e) { threw = true; }
    out.push(['던지지않음', threw === false, s[0].room_id]);

    // 4) 빈 목록·빈 결과에서도 조용히
    s = [];
    try { await applyRoomOverrides(mkDb([]), s, '20260910'); out.push(['빈목록', true]); } catch (e) { out.push(['빈목록', false]); }

    console.log(JSON.stringify(out));
  `);
  if (r.status !== 0) { bad('③-0 실행', (r.stderr||'').split('\n').filter(Boolean).slice(-3).join(' | ')); }
  else {
    const o = JSON.parse(r.stdout.trim().split('\n').pop());
    const g = (k) => o.find(x => x[0] === k);
    check('③-1 지정된 수업은 그 회의방으로 갈아 끼운다', g('갈아끼움')[1] === 'meet-1234' && g('갈아끼움')[2] === true, JSON.stringify(g('갈아끼움')));
    check('③-2 «원래 방» 과 «메모» 를 함께 남긴다', g('갈아끼움')[3] === 'class-7-20260910' && g('갈아끼움')[4] === '오늘만', JSON.stringify(g('갈아끼움')));
    check('③-3 지정 없는 다른 수업은 한 글자도 안 바꾼다', g('안건드림')[1] === 'class-8-20260910' && g('안건드림')[2] === true, JSON.stringify(g('안건드림')));
    check('③-4 표에 meet- 가 아닌 값이 있으면 무시한다', g('meet아님무시')[1] === 'class-7-20260910' && g('meet아님무시')[2] === true, JSON.stringify(g('meet아님무시')));
    check('③-5 🔴 조회가 실패해도 던지지 않는다 (학생 입장이 막히면 안 된다)', g('던지지않음')[1] === true && g('던지지않음')[2] === 'class-7-20260910', JSON.stringify(g('던지지않음')));
    check('③-6 빈 목록에서도 조용히 넘어간다', g('빈목록')[1] === true);
  }
}

/* ══ ④ 권한 — 모르면 막는가 ══════════════════════════════════════════════════ */
console.log('\n④ 담당 강사 판정 — 모르면 «막는 쪽» 으로 실패하는가');
{
  const r = runInModule(`
    import { teacherOwnsSchedule } from './class-room-override.ts';
    const db = (linkRow) => ({ DB: { prepare() { return { bind() { return { first: async () => linkRow }; } }; } } });
    const boom = { DB: { prepare() { throw new Error('boom'); } } };
    const out = [];
    const A = (u) => ({ username: u });
    out.push(['계정명이 teacher_id', await teacherOwnsSchedule(db(null), A('mangoi_018'), { teacher_id: 'mangoi_018' })]);
    out.push(['대소문자 무시',      await teacherOwnsSchedule(db(null), A('Mangoi_018'), { teacher_id: 'mangoi_018' })]);
    out.push(['링크로 연결',        await teacherOwnsSchedule(db({ teacher_id: '22' }), A('mangoi_018'), { teacher_id: '22' })]);
    out.push(['남의 수업',          await teacherOwnsSchedule(db({ teacher_id: '22' }), A('mangoi_018'), { teacher_id: '7' })]);
    out.push(['연결 없음',          await teacherOwnsSchedule(db(null), A('mangoi_777'), { teacher_id: '22' })]);
    out.push(['담당 미지정 수업',    await teacherOwnsSchedule(db({ teacher_id: '22' }), A('mangoi_018'), { teacher_id: null })]);
    out.push(['계정 없음',          await teacherOwnsSchedule(db({ teacher_id: '22' }), A(''), { teacher_id: '22' })]);
    out.push(['조회가 던짐',        await teacherOwnsSchedule(boom, A('mangoi_018'), { teacher_id: '22' })]);
    console.log(JSON.stringify(out));
  `);
  if (r.status !== 0) { bad('④-0 실행', (r.stderr||'').split('\n').filter(Boolean).slice(-3).join(' | ')); }
  else {
    const o = Object.fromEntries(JSON.parse(r.stdout.trim().split('\n').pop()));
    // ⚠️ «막는다» 만 넣으면 «전부 막기» 도 통과한다 — «제대로 통과시킨다» 를 짝으로 둔다
    check('④-1 계정명이 그대로 teacher_id 면 통과', o['계정명이 teacher_id'] === true);
    check('④-2 대소문자만 달라도 통과 (로그인이 대소문자를 무시한다)', o['대소문자 무시'] === true);
    check('④-3 계정 연결표로 이어지면 통과', o['링크로 연결'] === true);
    check('④-4 ⛔ 남의 수업은 막는다', o['남의 수업'] === false);
    check('④-5 ⛔ 연결이 없으면 막는다 (이름으로 짐작하지 않는다)', o['연결 없음'] === false);
    check('④-6 ⛔ 담당이 안 정해진 수업은 막는다', o['담당 미지정 수업'] === false);
    check('④-7 ⛔ 계정이 없으면 막는다', o['계정 없음'] === false);
    check('④-8 🔴 조회가 던져도 막는 쪽으로 실패한다', o['조회가 던짐'] === false);
  }
}

/* ══ ⑤ 배선 — 정말 그 경로에 붙어 있는가 ════════════════════════════════════ */
console.log('\n⑤ 배선 — sessions/today 와 지정 API 에 실제로 붙어 있는가');
{
  const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const mBare = bare(mangoSrc), aBare = bare(adminSrc);

  // sessions/today — 세션을 «다 만든 뒤», current 를 «고르기 전» 이어야 한다
  const iSort = mBare.indexOf('sessions.sort((a, b) => a.start_ts - b.start_ts)');
  const iApply = mBare.indexOf('applyRoomOverrides(');
  const iCurrent = mBare.indexOf('let current: any = null');
  check('⑤-1 sessions/today 가 applyRoomOverrides 를 부른다', iApply > 0);
  check('⑤-2 세션을 다 만든 «뒤» 에 부른다', iApply > iSort && iSort > 0,
    `sort=${iSort} apply=${iApply}`);
  check('⑤-3 자동 입장 대상(current)을 «고르기 전» 에 부른다 — 안 그러면 학생이 옛 방으로 간다',
    iApply < iCurrent && iCurrent > 0, `apply=${iApply} current=${iCurrent}`);

  // 지정 API — PUT 이고, 모르는 action 을 거절하고, 권한 셋을 다 본다
  const iPut = aBare.indexOf("method === 'PUT' && path === '/api/admin/class-schedules'");
  check('⑤-4 지정 API 가 «비어 있는» PUT 에 붙어 있다 (src/index.ts 를 안 건드림)', iPut > 0);
  if (iPut > 0) {
    // 그 라우트 몸통만 중괄호 짝으로 자른다
    let d = 0, started = false, body = '';
    for (let j = iPut; j < aBare.length; j++) {
      const c = aBare[j];
      if (c === '{') { d++; started = true; }
      else if (c === '}') { d--; if (started && d === 0) { body = aBare.slice(iPut, j + 1); break; } }
    }
    check('⑤-5 그 라우트 몸통을 잘라 냈다', body.length > 200);
    check('⑤-6 모르는 action 은 거절한다', /unknown_action/.test(body),
      '이 경로에 다른 뜻을 넣을 때 모르는 요청이 조용히 흘러 들어간다');
    /* 🔴 (2026-09-10 함정 대조) «그 글자가 있는가» 로 쓰면 **게이트를 무력화해도 통과합니다** —
       `if (mine !== true && false)` · `isOrgScopedRole('') && false` 를 실제로 넣어 보니
       51/51 초록이었습니다. CLAUDE.md 2장 「«불렀는가» 만 보지 말고 «그 결과를 조건으로
       쓰는가» 도 보세요」. 그래서 **게이트가 채운 «그 변수» 를 조건에 쓰는지** 로 묻습니다. */
    check('⑤-7 ⛔ 지사·대리점을 막는다 — 판정 결과를 «그대로» 조건으로 쓴다',
      /if\s*\(\s*isOrgScopedRole\s*\(\s*\(_roActor as any\)\.role\s*\)\s*\)\s*\{/.test(body)
      && /forbidden_scope/.test(body),
      '조건에 && false 같은 것이 끼면 아무도 안 막힌다');
    check('⑤-8 ⛔ 강사는 «자기 수업» 인지 확인한다 — 그 답을 «그대로» 조건으로 쓴다',
      /const\s+mine\s*=\s*await\s+teacherOwnsSchedule\s*\(/.test(body)
      && /if\s*\(\s*mine\s*!==\s*true\s*\)\s*return/.test(body)
      && /if\s*\(\s*!_roIsHq\s*\)\s*\{/.test(body)
      && /forbidden_not_my_class/.test(body),
      '조건이 느슨해지면 아무 강사나 남의 수업을 다른 방으로 돌린다');
    check('⑤-8b ⛔ «본사인가» 를 양성으로 묻는다 (차단목록만 두면 스코프 조회 실패 때 fail-open)',
      /_roIsHq\s*=\s*String\(\(_roActor as any\)\.role \|\| ''\)\s*===\s*'hq'/.test(body),
      'getAdminActor 는 스코프 조회 실패를 삼키고 staff 로 떨어뜨린다 — 그때 담당 확인이 건너뛰어진다');
    check('⑤-9 ⛔ canEditOrg 로 막지 않는다 (그 함수는 교사에 true 라 못 가린다)', !/canEditOrg\s*\(/.test(body));
    check('⑤-10 지난 날짜에는 못 건다', /past_ymd/.test(body));
    check('⑤-11 값 검증 정본을 쓴다', /validateOverrideInput\s*\(/.test(body));
    check('⑤-12 안내 링크 도메인을 손으로 안 적는다 (SITE_ORIGIN 정본)',
      /SITE_ORIGIN/.test(body) && !/https:\/\/mangoi\.ai/.test(body));
  }

  // 만료가 «표의 열쇠» 인가 — 청소 크론에 기대지 않는다
  check('⑤-13 만료가 열쇠에 박혀 있다 (PRIMARY KEY (schedule_id, ymd))',
    /PRIMARY KEY \(schedule_id, ymd\)/.test(modSrc),
    '「만료 컬럼 + 청소 크론」 으로 바꾸면 지우는 일을 잊어 다음 수업까지 끌고 간다');
}

/* ══ ⑥ 화면 — 선생님이 지정하는 자리 · 학생이 «바뀐 것을 아는» 자리 ══════════ */
console.log('\n⑥ 화면 — 지정 버튼과 학생 안내가 실제로 붙어 있는가');
{
  const teacherSrc = readFileSync(join(PUB, 'teacher.html'), 'utf8');
  const deferSrc = readFileSync(join(PUB, 'js/idx-vc-roomcode.js'), 'utf8');
  const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const tBare = bare(teacherSrc), dBare = bare(deferSrc);

  // 선생님 화면
  check('⑥-1 강사 화면에 지정 버튼이 있다', /data-roomset=/.test(tBare));
  check('⑥-2 그 버튼이 openRoomOverride 를 실제로 부른다',
    /\[data-roomset\]/.test(tBare) && /openRoomOverride\s*\(\s*list\[/.test(tBare),
    '버튼만 있고 배선이 없으면 눌러도 아무 일도 안 일어난다');
  check('⑥-3 지정 API 를 PUT 으로 부른다', /method:\s*'PUT'/.test(tBare) && /'\/api\/admin\/class-schedules'/.test(tBare));
  check('⑥-4 🔴 «성공이라고 말했는가»(d.ok !== true)로 가른다',
    /d\.ok\s*!==\s*true/.test(tBare),
    'd.ok === false 로 가르면 종단 404 본문에 ok 칸이 없어 «정상» 으로 흘러간다');
  /* 🔴 (함정 대조) 검사 범위를 «길이» 로 자르면 양쪽으로 다 틀립니다 — 함수가 자라면
     끝에 붙인 코드가 창 밖으로 빠지고(거짓 통과), 지금도 창이 함수 끝을 넘겨 **옆 함수를
     스캔**합니다(거짓 실패). CLAUDE.md 2장. **중괄호 짝으로 몸통만** 잘라 봅니다. */
  const cutFn = (src, head) => {
    const i = src.indexOf(head);
    if (i < 0) return null;
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '{') { d++; started = true; }
      else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    return null;
  };
  const roFn = cutFn(tBare, 'function openRoomOverride(');
  check('⑥-5a 전제: openRoomOverride 몸통을 잘라 냈다', !!roFn && roFn.length > 400);
  check('⑥-5 링크 주소를 화면이 조립하지 않는다 (서버가 준 d.link 를 쓴다)',
    !!roFn && /d\.link/.test(roFn) && !/location\s*\.\s*(origin|host)/.test(roFn));
  check('⑥-6 ⛔ window.open 으로 링크를 열지 않는다 (인앱 브라우저는 null 만 준다)',
    !!roFn && !/window\.open\s*\(/.test(roFn));
  check('⑥-7 지정을 «취소» 하는 길이 있다', /room_override_clear/.test(tBare));
  check('⑥-8 맞바꿈(포인트·복습퀴즈가 쉰다)을 선생님에게 말한다',
    /포인트[·・].{0,6}복습퀴즈|Points and the review quiz/.test(tBare));

  // 학생 화면 (defer — 첫 화면 예산 0)
  check('⑥-9 학생 안내가 defer 파일에 있다', /assignedBanner/.test(dBare));
  /* 🔴 (함정 대조) `/typedAtJoin\s*=/` 는 **선언줄 `var typedAtJoin = '';`** 에 걸립니다 —
     캡처 한 줄을 지워도 통과했습니다. 캡처가 없으면 값이 영원히 비어서, 스스로 번호를 친
     사람에게도 「선생님이 옮겼다」가 뜹니다. **«입력칸에서 읽어 담는가»** 로 묻습니다. */
  check('⑥-10 «사람이 안 쳤을 때만» 안내한다 (스스로 친 사람에게는 거짓말이 된다)',
    /!typedAtJoin/.test(dBare)
    && /typedAtJoin\s*=\s*\([^)]*vc-roomcode-input|_rc\s*&&\s*_rc\.value\.trim\(\)/.test(dBare)
    && /vc-roomcode-input'\);\s*typedAtJoin\s*=/.test(dBare.replace(/\s+/g, ' ').replace(/ /g, ' ')),
    '입장 순간에 입력칸에서 «실제로 읽어» 담아야 한다 — 선언줄만 있으면 늘 빈 값이다');
  /* ⛔ 식 모양을 글자 그대로 못 박지 않는다(MEET_RE 로 정리하는 무해한 리팩터에 거짓 FAIL).
     «회의방인지 보고 나서 그 배너를 부르는가» 로 묻는다. */
  check('⑥-11 회의방일 때만 안내한다',
    /meet-[\s\S]{0,80}assignedBanner\s*\(/i.test(dBare) || /MEET_RE[\s\S]{0,80}assignedBanner\s*\(/.test(dBare));
  check('⑥-12 학생에게도 맞바꿈을 말한다',
    /포인트[·・].{0,10}복습퀴즈|review quiz/.test(dBare));
  /* ⛔ 이 안내를 첫 화면(blocking)으로 옮기면 예산이 그 자리에서 깨진다(여유 186B). */
  check('⑥-13 blocking 파일(idx-main.js)에는 안 넣었다',
    !/assignedBanner/.test(readFileSync(join(PUB, 'js/idx-main.js'), 'utf8')));
}

/* ══ ⑦ 🔴 «방 번호를 스스로 만드는 곳» 이 전부 지정을 보는가 ═══════════════════
   [왜] `class-{id}-{ymd}` 를 **독립적으로 만드는 곳이 여럿**이다. 학생 쪽만 갈아 끼우면
     강사는 옛 방, 학생은 지정된 방으로 갈려 「같은 수업인데 둘 다 참여자 1명」이 **매번**
     재현된다 — 이 저장소가 네 번 사고 낸 그 자리다. `api-teacher.ts` 가 그 파일 안에서
     「api-mango.ts 의 sessions/today 와 **반드시 같은 식**」이라고 주석으로 못 박고 있다.
   [무엇을 묻나] «부르는가» 만이 아니라 **«넘기는 행이 schedule_id 를 담고 있는가»** 도 본다 —
     안 담으면 헬퍼가 **에러 없이 늘 헛돈다**(CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도
     안 일어남」). absent-sweep 은 실제로 `s.id` 만 담고 있어 여기서 잡혔다. */
console.log('\n⑦ 방 번호를 만드는 곳들이 지정을 보는가');
{
  const MUST = [
    { f: 'api-mango.ts',    why: '학생 입장 — 이게 이 기능의 본체' },
    { f: 'api-teacher.ts',  why: '강사 [수업 입장] — 안 보면 강사와 학생이 다른 방' },
    { f: 'absent-sweep.ts', why: '결석 감지 — 안 보면 오탐 + class_no_show → 수업료 0원' },
  ];
  for (const m of MUST) {
    const src = readFileSync(join(SRC, m.f), 'utf8');
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const calls = [...bare.matchAll(/applyRoomOverrides\s*\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*,/g)];
    if (!calls.length) { bad('⑦ ' + m.f + ' 가 지정을 보지 않는다', m.why); continue; }
    ok('⑦ ' + m.f + ' 가 applyRoomOverrides 를 부른다 (목록: ' + calls[0][1] + ')');
    /* 넘기는 행이 schedule_id 를 갖고 있는가 —
       ⚠️ 배열 이름으로 `<arr>.push(` 를 찾으면 못 잡는다(api-mango 는 안쪽 함수가 `out.push`
          하고 그 반환값을 받는다). 그래서 **«결정론적 방 번호를 담는 객체 리터럴»** 을
          전부 찾아 거기에 `schedule_id` 가 있는지 본다 — 그것이 진짜 규칙이다. */
    const lits = [];
    for (const pm of bare.matchAll(/\.push\s*\(\s*\{/g)) {
      let i = bare.indexOf('{', pm.index), d = 0;
      for (let j = i; j < bare.length; j++) {
        const c = bare[j];
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) { lits.push(bare.slice(i, j + 1)); break; } }
      }
    }
    const roomLits = lits.filter(t => /room_id\s*:\s*`class-\$\{/.test(t));
    check('⑦ ' + m.f + ' 에서 «class- 방 번호를 담는 행» 을 찾았다 (' + roomLits.length + '곳)',
      roomLits.length >= 1, '못 찾으면 아래 검사가 통째로 헛돈다');
    check('⑦ ' + m.f + ' 의 그 행이 schedule_id 를 담는다 (안 담으면 에러 없이 늘 헛돈다)',
      roomLits.length >= 1 && roomLits.every(t => /\bschedule_id\s*:/.test(t)), m.why);
  }

  /* 아직 «지정을 안 보는» 곳은 숨기지 말고 **이름을 찍어 출력**한다.
     ⛔ FAIL 로 만들지 않는다 — 무관한 PR 이 전부 빨간불이 된다(선례: popup_open_return_harness). */
  const OPEN = [];
  for (const f of ['classes-now.ts', 'lesson-reminder.ts', 'no-show-truth.ts']) {
    try {
      const t = readFileSync(join(SRC, f), 'utf8');
      if (/class-\$\{/.test(t) && !/applyRoomOverrides/.test(t)) OPEN.push(f);
    } catch {}
  }
  console.log('  ℹ️ 아직 지정을 안 보는 곳(사람 결정 대기): ' + (OPEN.join(' · ') || '없음'));
  console.log('     → 지정된 수업의 참관 버튼·리마인더 링크는 «옛 방» 을 가리킵니다.');
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

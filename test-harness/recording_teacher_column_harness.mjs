/* ═══════════════════════════════════════════════════════════════════════════
   🧑‍🏫 녹화 목록 「교사 이름」·「교사 아이디」 칸 감시 — 2026-09-04

   [왜 만들었나]
     사장님이 관리자 › 🎬 녹화 목록 화면을 두고 「교사 이름과 아이디가 나오게 해줘.
     지금은 교사 이름에 아이디가 나와」라고 하셨다. 화면 실측 그대로 그 칸에는
     `jye46712`·`jeong`·`heyst`·`교사 Mangoi_168` 이 떠 있었다 — 교사도 아니고
     이름도 아니었다.

   [무엇이 문제였나 — 두 칸 다 «교사» 가 아니다]
     · `recordings.teacher_name` = «방을 먼저 켠 사람의 표시이름».
       2026-09-04 운영 D1 실측 2,122행 중 **670행이 학생 계정**이고 371행만 `교사 ` 접두사.
       게다가 2026-09-02 부터 강사는 자동 녹화를 안 하므로 앞으로 거의 항상 학생이다.
     · `recordings.teacher_id` = 화상방(DO)이 접속마다 새로 발급하는 **임시 번호**.
       실측 2,122행 중 **2,105행(99.2%)이 `u_` 로 시작**한다. 계정이 아니다.

   [왜 문자열 검사만으로는 모자란가]
     틀리는 방식이 「함수가 없다」가 아니라 «누구를 교사라고 부르는가» 다. 강사 번호가
     세 벌이라 숫자로 이으면 **조용히 남의 이름**이 붙고 에러가 안 난다(CLAUDE.md 2장).
     그래서 여기서는 판정 모듈을 esbuild 로 컴파일해 가짜 D1 에 물려 **실제로 돌리고**,
     화면 셀도 소스에서 오려 내 실행한다.

   ⚠️ 「못 찾는다」 검사만 넣으면 판정이 통째로 헛돌아도 초록이 된다.
      **«제대로 찾는다» 검사를 반드시 짝으로** 둔다(CLAUDE.md 2장).

   실행: node test-harness/recording_teacher_column_harness.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'cloudflare-deploy', 'src');
const rd   = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok    = (n) => { console.log('  ✅ ' + n); pass++; };
const no    = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

const MANGO = rd('cloudflare-deploy/src/api-mango.ts');
const CORE  = rd('cloudflare-deploy/public/js/adm-core.js');
const HTML  = rd('cloudflare-deploy/public/admin.html');
const MOD   = rd('cloudflare-deploy/src/recording-teacher.ts');

/* 부정 검사는 주석을 벗긴 사본으로 — 「왜 안 쓰는지」 적은 설명이 자기 검사에 걸린다.
   ⚠️ 블록주석을 정규식 한 줄로 지우면 문자열 속 «별표+슬래시» 에 그 뒤가 통째로
      날아간다(CLAUDE.md 2장). 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripComments(text) {
  const out = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    let s = line, res = '';
    while (s.length) {
      if (inBlock) {
        const e = s.indexOf('*/');
        if (e < 0) { s = ''; break; }
        s = s.slice(e + 2); inBlock = false; continue;
      }
      const b = s.indexOf('/*');
      const l = s.indexOf('//');
      if (b < 0 && l < 0) { res += s; break; }
      if (l >= 0 && (b < 0 || l < b)) { res += s.slice(0, l); break; }
      res += s.slice(0, b); s = s.slice(b + 2); inBlock = true;
    }
    out.push(res);
  }
  return out.join('\n');
}
const CORE_NC = stripComments(CORE);
const MOD_NC  = stripComments(MOD);

/* ══ A. 배선 — 서버가 풀어 주고 화면이 그리는가 ═══════════════════════════ */
console.log('\n[ A. 배선 ]');
check('서버가 판정 정본을 import 한다',
  /import\s*\{[^}]*resolveRecordingTeachers[^}]*\}\s*from\s*'\.\/recording-teacher'/.test(MANGO),
  '판정을 api-mango.ts 안에 복제하지 말 것 — 두 벌이 되면 한쪽만 고쳐진다');
check('/api/recordings 응답에 teacher 를 싣는다',
  /const _recTeachers = await resolveRecordingTeachers\(/.test(MANGO),
  'teacher 를 안 실으면 화면 칸이 늘 «—» 다');
/* ⛔ 이 줄을 «글자 그대로» 못 박지 말 것 — 같은 자리에 칸을 하나 더 실으면
      보장은 그대로인데 검사만 깨진다. 물어야 할 것은 «들어 있는가» 다. */
check('재생 불가한 행(저장 실패·보관 만료)에도 teacher 를 싣는다',
  /if \(!playable\) return \{[^}]*\bteacher\b[^}]*\};/.test(MANGO),
  '그 행이야말로 «누구 수업이었나» 를 알아야 하는 자리다');

check('화면이 교사 이름 칸을 그린다', /\+ '<td>' \+ teacherCell \+ '<\/td>'/.test(CORE));
check('화면이 교사 아이디 칸을 그린다', /\+ '<td>' \+ teacherIdCell \+ '<\/td>'/.test(CORE));

check('화면이 서버가 푼 값을 쓴다(teacher.name / teacher.uid)',
  /teacher:\s*\(r\.teacher && r\.teacher\.name\)/.test(CORE_NC)
  && /teacher_uid:\s*\(r\.teacher && r\.teacher\.uid\)/.test(CORE_NC),
  '화면이 스스로 판정하면 서버와 두 벌이 되어 어긋난다');

/* 🔴 이번에 고친 사고 그 자체 — 되살아나면 「교사 이름에 아이디가 나온다」가 그대로 재현된다. */
check('⛔ 화면이 teacher_name/teacher_id 를 교사 칸으로 되돌리지 않았다',
  !/teacher:\s*r\.teacher_name\s*\|\|\s*r\.teacher_id/.test(CORE_NC),
  'teacher_name 은 «방을 켠 사람», teacher_id 는 DO 임시번호(u_…) 다');
check('⛔ 판정 정본이 DO 임시번호(teacher_id)를 읽지 않는다',
  !/\br\.teacher_id\b/.test(MOD_NC) && !/\bteacher_id\b/.test(
    (MOD_NC.match(/rows\.forEach\(\(r, i\) => \{[\s\S]*?\n {4}\}\);/) || [''])[0]),
  '그 값을 아이디 칸에 그리면 그 순간 화면이 거짓말을 한다');

{ /* thead 의 <th> 수 = 한 줄이 그리는 <td> 수 = 빈 표 colspan.
     ⛔ 숫자를 못 박지 말 것 — 칸을 늘리는 정상적인 변경마다 검사만 깨진다. */
  const upTo  = HTML.slice(0, HTML.indexOf('<tbody id="recordings-table">'));
  const head  = upTo.slice(upTo.lastIndexOf('<thead>'));
  const nTh   = (head.match(/<th[\s>]/g) || []).length;
  const body  = CORE.slice(CORE.indexOf("return '<tr>'"), CORE.indexOf("+ '</tr>';") + 12);
  const nTd   = (body.match(/<td/g) || []).length + 3;   // 점수 셀 3개는 함수가 <td> 를 만든다
  const rrt   = CORE.indexOf('function renderRecordingsTable()');
  const nCol  = Number((CORE.slice(rrt, rrt + 4000).match(/colspan="(\d+)"/) || [])[1] || -1);
  check('thead 칸 수 = 한 줄이 그리는 칸 수', nTh > 0 && nTh === nTd, 'th=' + nTh + ' td=' + nTd);
  check('빈 표 colspan 도 그 칸 수와 같다', nCol === nTh, 'colspan=' + nCol + ' th=' + nTh);
  check('머리글에 「교사 이름」·「교사 아이디」 두 칸이 있다',
    /data-ko="교사 이름"/.test(head) && /data-ko="교사 아이디"/.test(head), head.slice(0, 200));
  check('두 칸 다 정렬 키가 있고 서로 다르다',
    /data-sk="teacher"/.test(head) && /data-sk="teacherid"/.test(head));
}

check('정렬 값 함수가 두 키를 안다',
  /key === 'teacher'\)/.test(CORE) && /key === 'teacherid'\)/.test(CORE));
check('표 안 필터가 교사 이름·아이디로도 걸러진다',
  /String\(r\.teacher \|\| ''\)/.test(CORE_NC) && /String\(r\.teacher_uid \|\| ''\)/.test(CORE_NC),
  '화면에 보이는 말로 검색해서 0건이 나오면 「검색이 고장났다」로 읽힌다');
check('서버 검색도 예약에 배정된 강사 이름·아이디까지 훑는다',
  /FROM class_schedules cs/.test(MANGO) && /FROM teacher_account_links tal/.test(MANGO)
  && /COALESCE\(t\.name,''\) LIKE \?/.test(MANGO),
  '방 class-1079 의 교사 「KRYSTEL」은 recordings 어느 칸에도 없다');
{ // LIKE 자리 수 = 바인드 수 (하나만 늘리면 D1 이 던져 목록이 통째로 500 이 된다)
  const m = MANGO.match(/whereParts\.push\(\s*"\(r\.room_id LIKE[\s\S]*?whereBinds\.push\(([^)]*)\);/);
  const nQ = m ? (m[0].match(/LIKE \?/g) || []).length : -1;
  const nB = m ? m[1].split(',').filter(x => x.trim()).length : -2;
  check('LIKE 자리 수 = 바인드 수', nQ > 0 && nQ === nB, 'LIKE=' + nQ + ' bind=' + nB);
}

/* 화면이 붙이는 「교사 」 접두사와 서버가 떼는 접두사가 같아야 한다 — 두 벌이면 어긋난다. */
check('화면이 붙이는 표시이름 접두사와 서버가 떼는 접두사가 같다',
  /'교사 ' \+ tname/.test(CORE) && /startsWith\('교사 '\)/.test(MOD),
  "adm-core.js 의 \"'교사 ' + tname\" 과 recording-teacher.ts 의 접두사가 짝이다");

/* ══ B. 판정을 실제로 돌린다 ══════════════════════════════════════════════ */
console.log('\n[ B. 판정 모듈을 컴파일해 가짜 D1 로 실행 ]');
{
  /* ⚠️ esbuild 는 bin/ 을 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'recteach-'));
  const out = join(dir, 'm.mjs');
  buildSync({ entryPoints: [join(SRC, 'recording-teacher.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /* 가짜 D1 — 질의문을 보고 답을 바꾼다.
     ⚠️ prepare() 와 prepare().bind() **두 층 모두**에 all/first 를 둔다. 한 층만 두면
        정본이 그 줄에서 예외를 내고 「빈 값이 정답」인 검사만 초록이 된다(CLAUDE.md 2장). */
  const calls = [];
  const mkEnv = (data) => {
    const answer = (q, binds) => {
      calls.push({ q, n: binds.length });
      if (/FROM class_schedules/.test(q))
        return { results: (data.schedules || []).filter(r => binds.includes(r.id)) };
      if (/FROM teachers/.test(q))
        return { results: binds.length
          ? (data.teachers || []).filter(r => binds.includes(String(r.id)))
          : (data.teachers || []) };
      if (/FROM teacher_account_links/.test(q))
        return { results: binds.length
          ? (data.links || []).filter(r => binds.includes(String(r.teacher_id)))
          : (data.links || []) };
      if (/FROM students_erp/.test(q))
        return { results: (data.students || []).filter(r => binds.includes(r.user_id)) };
      return { results: [] };
    };
    const layer = (q, binds) => ({
      all:   async () => answer(q, binds),
      first: async () => (answer(q, binds).results || [])[0] || null,
    });
    return { DB: { prepare: (q) => ({ ...layer(q, []), bind: (...b) => layer(q, b) }) } };
  };

  /* 값은 2026-09-04 운영 D1 실측 그대로. */
  const DATA = {
    schedules: [{ id: 1079, teacher_id: '16' },   // KRYSTEL
                { id: 997,  teacher_id: '8'  },   // KAYE
                { id: 849,  teacher_id: '29' },   // 중국어 강선생님
                { id: 555,  teacher_id: '99' },   // 원부에 없는 번호
                { id: 556,  teacher_id: 'mangoi_042' }],  // 계정명이 그대로 들어간 행
    teachers: [{ id: 16, name: 'KRYSTEL' }, { id: 8, name: 'KAYE' },
               { id: 29, name: '중국어 강선생님' }, { id: 27, name: 'MAIMAI' },
               { id: 10, name: 'HT NESS' }, { id: 18, name: 'LEN' }, { id: 6, name: 'JANE' }],
    links: [{ username: 'mangoi_169', teacher_id: '16', teacher_name: 'KRYSTEL', linked_at: 2 },
            { username: 'mangoi_162', teacher_id: '8',  teacher_name: 'KAYE',    linked_at: 2 },
            { username: 'hq_t_kang',  teacher_id: '29', teacher_name: '중국어 강선생님', linked_at: 2 },
            { username: 'Mangoi_168', teacher_id: '18', teacher_name: 'LEN',     linked_at: 2 },
            { username: 'mangoi_114', teacher_id: '6',  teacher_name: 'JANE',    linked_at: 2 },
            { username: 'mangoi_042', teacher_id: '10', teacher_name: 'HT NESS', linked_at: 2 }],
    students: [{ user_id: 'jye46712' }, { user_id: 'heyst' }, { user_id: 'jeong' },
               { user_id: 'delaware' }, { user_id: 'Kim' }],
  };
  const run = (rows, data = DATA) => M.resolveRecordingTeachers(mkEnv(data), rows);

  // ── 예약이 있는 방 — 이것이 정본이다 (실측 커버리지 class-* 255건 중 253건)
  const r1 = await run([{ room_id: 'class-1079-20260903', teacher_name: 'jye46712' }]);
  check('예약방: 학생이 켠 녹화라도 «배정된 강사» 를 찾는다',
    r1[0].name === 'KRYSTEL' && r1[0].uid === 'mangoi_169' && r1[0].source === 'schedule',
    JSON.stringify(r1[0]));
  check('그때 학생 계정(jye46712)이 교사 칸으로 새지 않는다',
    r1[0].name !== 'jye46712' && r1[0].uid !== 'jye46712', JSON.stringify(r1[0]));

  const r2 = await run([{ room_id: 'class-849-20260902', teacher_name: '교사 강선생님' }]);
  check('예약방: 한글 이름 강사도 이름·아이디가 함께 나온다',
    r2[0].name === '중국어 강선생님' && r2[0].uid === 'hq_t_kang', JSON.stringify(r2[0]));

  const r3 = await run([{ room_id: 'class-555-20260903', teacher_name: 'heyst' }]);
  check('예약의 강사 번호가 원부에 없으면 지어내지 않는다',
    r3[0].name === '' && r3[0].uid === '' && r3[0].source === 'none', JSON.stringify(r3[0]));

  const r3b = await run([{ room_id: 'class-556-20260903', teacher_name: 'heyst' }]);
  check('예약에 계정명이 그대로 들어간 행도 읽는다(CLAUDE.md 경고 대비)',
    r3b[0].uid === 'mangoi_042' && r3b[0].name === 'HT NESS', JSON.stringify(r3b[0]));

  // ── 예약이 없는 공용방 — 표시이름 폴백
  const r4 = await run([{ room_id: 'demo-1', teacher_name: '교사 Mangoi_168' }]);
  check('공용방: 「교사 <계정>」 표시이름이면 그 계정으로 이름을 찾는다',
    r4[0].uid === 'Mangoi_168' && r4[0].name === 'LEN' && r4[0].source === 'account',
    JSON.stringify(r4[0]));

  const r4b = await run([{ room_id: 'demo-1', teacher_name: '교사 mangoi_168' }]);
  check('대소문자만 다르고 후보가 유일하면 그것으로 잇는다',
    r4b[0].uid === 'Mangoi_168' && r4b[0].name === 'LEN', JSON.stringify(r4b[0]));

  const dup = { ...DATA, links: DATA.links.concat([{ username: 'MANGOI_168', teacher_id: '6', teacher_name: 'JANE', linked_at: 3 }]) };
  const r4c = await run([{ room_id: 'demo-1', teacher_name: '교사 mangoi_168' }], dup);
  check('⛔ 대소문자 후보가 둘이면 아무거나 고르지 않는다(남의 계정 방지)',
    r4c[0].uid === '' && r4c[0].name === 'mangoi_168' && r4c[0].source === 'display',
    JSON.stringify(r4c[0]));

  const r5 = await run([{ room_id: 'mangoi-class', teacher_name: '교사 MAIMAI' }]);
  check('공용방: 원부 이름과 완전일치하고 후보가 유일하면 잇는다',
    r5[0].name === 'MAIMAI' && r5[0].source === 'roster', JSON.stringify(r5[0]));
  check('그 강사에 계정 연결이 없으면 이름을 아이디 자리에 옮겨 적지 않는다',
    r5[0].uid === '', JSON.stringify(r5[0]));

  const twin = { ...DATA, teachers: DATA.teachers.concat([{ id: 31, name: 'MAIMAI' }]) };
  const r5b = await run([{ room_id: 'mangoi-class', teacher_name: '교사 MAIMAI' }], twin);
  check('⛔ 같은 이름 강사가 둘이면 붙이지 않는다(동명이인)',
    r5b[0].uid === '' && r5b[0].source === 'display', JSON.stringify(r5b[0]));

  const r6 = await run([{ room_id: 'meet-1234', teacher_name: '교사 Teacher Kaye' }]);
  check('계정·원부 어디에도 못 이으면 이름만 남기고 아이디는 «모름»',
    r6[0].name === 'Teacher Kaye' && r6[0].uid === '' && r6[0].source === 'display',
    JSON.stringify(r6[0]));

  // ── 🔴 이번에 고친 사고: 학생 계정을 교사 칸에 옮겨 적지 않는다
  const r7 = await run([{ room_id: 'mangoi-class', teacher_name: 'jeong' }]);
  check('⛔ 공용방에서 학생 계정을 교사로 삼지 않는다',
    r7[0].name === '' && r7[0].uid === '' && r7[0].source === 'none', JSON.stringify(r7[0]));
  const r7b = await run([{ room_id: 'mangoi-class', teacher_name: '교사 jeong' }]);
  check('⛔ 「교사 」 접두사가 붙어도 학생 계정이면 교사가 아니다',
    r7b[0].name === '' && r7b[0].uid === '', JSON.stringify(r7b[0]));
  const r7c = await run([{ room_id: 'meet-123', teacher_name: 'Karl (본사 매니저) (student)' }]);
  check('접두사가 없는 표시이름은 교사 후보로 삼지 않는다',
    r7c[0].source === 'none', JSON.stringify(r7c[0]));

  // ── 모양·안전
  const rows = [{ room_id: 'class-1079-20260903', teacher_name: 'jye46712' },
                { room_id: 'meet-x', teacher_name: 'nobody' },
                { room_id: 'class-997-20260903', teacher_name: '교사 Teacher Kaye' }];
  const rA = await run(rows);
  check('입력과 같은 길이·같은 순서로 돌려준다',
    rA.length === 3 && rA[0].name === 'KRYSTEL' && rA[1].source === 'none' && rA[2].name === 'KAYE',
    JSON.stringify(rA));

  const many = Array.from({ length: 250 }, (_, i) => ({ room_id: 'class-' + (2000 + i) + '-20260903', teacher_name: '' }));
  calls.length = 0;
  await run(many);
  check('D1 바인드 100개 한도를 넘지 않는다(청크 분할)',
    calls.length > 1 && calls.every(c => c.n <= 100), JSON.stringify(calls.map(c => c.n)));

  const deadEnv = { DB: { prepare: () => { throw new Error('no such table'); } } };
  let threw = false, rDead = null;
  try { rDead = await M.resolveRecordingTeachers(deadEnv, rows); } catch { threw = true; }
  check('DB 가 죽어도 던지지 않는다', !threw);
  check('그때는 전부 빈 값(길이는 유지)',
    !threw && rDead.length === 3 && rDead.every(x => x.uid === '' && x.name === '' && x.source === 'none'));

  check('방 번호에서 예약 id 를 읽는다', M.teacherScheduleIdFromRoom('class-1079-20260903') === 1079);
  check('공용방은 예약 id 가 없다(null)', M.teacherScheduleIdFromRoom('mangoi-class') === null);
  check('표시이름에서 「교사 」 접두사를 뗀다', M.staffDisplaySuffix('교사 Teacher Kaye') === 'Teacher Kaye');
  check('접두사가 없으면 빈 문자열(교사 후보 아님)', M.staffDisplaySuffix('jye46712') === '');
  check('대소문자 후보가 유일할 때만 돌려준다',
    M.uniqueCaseInsensitive(['aB'], 'ab') === 'aB' && M.uniqueCaseInsensitive(['aB', 'Ab'], 'ab') === null);
}

/* ══ C. 화면 셀을 실제로 그려 본다 ═══════════════════════════════════════ */
console.log('\n[ C. 화면 셀 — 소스를 오려 내 실행 ]');
{
  const start = CORE.indexOf('const _tSrcTip = {');
  const end   = CORE.indexOf("      : _tNoneTip) + '\">—</span>';", start);
  check('교사 셀 코드를 소스에서 찾았다', start > 0 && end > start,
    '못 찾으면 아래 검사는 전부 무의미하다 — 모양이 바뀌었으면 여기부터 고칠 것');

  if (start > 0 && end > start) {
    const body = CORE.slice(start, CORE.indexOf(';', end) + 1);
    const esc  = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cell = new Function('r', 'adminLang', '_esc', body + '\n return { name: teacherCell, uid: teacherIdCell };');
    const draw = (r, lang = 'ko') => cell(r, lang, esc);

    const a = draw({ teacher: 'KRYSTEL', teacher_uid: 'mangoi_169', teacher_src: 'schedule' });
    check('교사 이름을 그린다', a.name.includes('KRYSTEL'), a.name);
    check('아이디를 따로 그린다', a.uid.includes('mangoi_169'), a.uid);
    check('이름 칸에 아이디를 함께 적지 않는다(칸이 둘인 이유)',
      !a.name.includes('mangoi_169'), a.name);
    check('근거를 툴팁으로 말한다', /예약에 배정된 강사/.test(a.name), a.name);

    const b = draw({ teacher: '', teacher_uid: '', teacher_src: 'none', started_by: 'jeong' });
    check('교사를 못 찾으면 «—» 로 말한다', b.name.includes('—') && b.uid.includes('—'), b.name);
    check('그때 «왜 비었는지» 와 «누가 켰는지» 를 함께 말한다',
      /강사가 적혀 있지 않습니다/.test(b.name) && /녹화를 켠 사람: jeong/.test(b.name), b.name);
    check('⛔ 녹화를 켠 사람(학생 계정)을 교사 칸 «본문» 으로 그리지 않는다',
      !/>jeong</.test(b.name), b.name);

    const c = draw({ teacher: 'MAIMAI', teacher_uid: '', teacher_src: 'roster' });
    check('이름만 있으면 아이디는 «—» 와 이유', c.name.includes('MAIMAI')
      && c.uid.includes('—') && /연결된 로그인 계정이 없습니다/.test(c.uid), c.uid);

    const d = draw({ source: 'orphan', teacher: '', teacher_uid: '', teacher_src: 'none', started_by: '' });
    check('고아 행은 «기록이 없다» 고 말한다', /기록이 없어 교사를 알 수 없습니다/.test(d.name), d.name);

    const e = draw({ teacher: '<img src=x onerror=alert(1)>', teacher_uid: 'a"b', teacher_src: 'display' });
    check('이름·아이디를 HTML 로 해석하지 않는다(이스케이프)',
      !e.name.includes('<img') && !e.uid.includes('a"b'), e.name + ' | ' + e.uid);

    const f = draw({ teacher: 'KAYE', teacher_uid: 'mangoi_162', teacher_src: 'schedule' }, 'en');
    check('영어 화면에서는 영어로 말한다', /Assigned teacher/.test(f.name), f.name);

    const g = draw({});
    check('teacher 가 아예 없어도(옛 응답) 죽지 않는다', g.name.includes('—') && g.uid.includes('—'));
  }
}

console.log('\n' + (fail ? '❌' : '✅') + ' PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);

/* ═══════════════════════════════════════════════════════════════════════════
   🎓 녹화 목록 「학생」 칸 감시 — 2026-09-01

   [왜 만들었나]
     사장님이 관리자 › 🎬 녹화 목록 화면을 두고 「여기에 학생 목록도 넣어줄 수 있어?
     학생도 알아야 해서」라고 하셨다. 그 화면의 「교사」 칸에는 방을 **먼저 켠 사람**이
     찍혀서 `heyst`·`cys01`·`mby1` 같은 **학생 계정**이 그대로 올라와 있었고,
     그래서 목록만 보고는 어느 학생 수업인지 알 수 없었다.

   [왜 문자열 검사만으로는 모자란가]
     틀리는 방식이 「함수가 없다」가 아니라 «누구를 학생이라고 부르는가» 다.
     - `participant_names` 를 그대로 쓰면 임시 접속번호(z6nn4uhuwt95py0f4o6hvm)가
       학생 이름 자리에 뜬다(D1 실측: 최근 15건 중 9건이 그 모양).
     - 이름으로 사람을 찾으면 동명이인에게 남의 수업이 붙는다(CLAUDE.md 2장).
     둘 다 **에러가 안 난다.** 그래서 여기서는 판정 모듈을 esbuild 로 컴파일해
     가짜 D1 에 물려 **실제로 돌리고**, 화면 셀도 소스에서 오려 내 실행한다.

   실행: node test-harness/recording_student_column_harness.mjs
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

/* ══ A. 배선 — 서버가 풀어 주고 화면이 그리는가 ═══════════════════════════ */
console.log('\n[ A. 배선 ]');
check('서버가 판정 정본을 import 한다',
  /import\s*\{[^}]*resolveRecordingStudents[^}]*\}\s*from\s*'\.\/recording-students'/.test(MANGO),
  '판정을 api-mango.ts 안에 복제하지 말 것 — 두 벌이 되면 한쪽만 고쳐진다');
check('/api/recordings 응답에 students 를 싣는다',
  /const _recStudents = await resolveRecordingStudents\(/.test(MANGO) && /\bstudents,?\s*$/m.test(MANGO),
  'students 를 안 실으면 화면 칸이 늘 «—» 다');
check('재생 불가한 행(dl_url 없는 행)에도 students 를 싣는다',
  /if \(!playable\) return \{ \.\.\.row, students \};/.test(MANGO),
  '저장 실패·보관 만료 행이야말로 «누구 수업이었나» 를 알아야 하는 자리다');

check('화면이 학생 칸을 그린다', /\+ '<td>' \+ studentCell \+ '<\/td>'/.test(CORE));
check('빈 목록 colspan 이 13 이다(칸을 하나 늘렸다)',
  /colspan="13"/.test(CORE) && !/colspan="12"/.test(CORE),
  'colspan 이 어긋나면 «녹화 기록 없음» 줄만 표 폭이 달라진다');
check('화면이 participant_names 로 학생을 지어내지 않는다',
  !/students\s*=\s*[^;]*participant_names/.test(CORE),
  '그 배열에는 교사 표시이름과 임시 접속번호가 섞여 있다');

{ // thead 의 <th> 수와 <tbody> 가 그리는 <td> 수가 같아야 한다
  const thead = (HTML.match(/<tbody id="recordings-table">/) ? HTML.slice(0, HTML.indexOf('<tbody id="recordings-table">')) : '');
  const head  = thead.slice(thead.lastIndexOf('<thead>'));
  const nTh   = (head.match(/<th[\s>]/g) || []).length;
  const body  = CORE.slice(CORE.indexOf("return '<tr>'"), CORE.indexOf("+ '</tr>';") + 12);
  const nTd   = (body.match(/<td/g) || []).length + 3;   // gaze·speak·participation 셀은 함수가 <td> 를 만든다
  check('thead 칸 수 = 한 줄이 그리는 칸 수', nTh === 13 && nTd === 13, 'th=' + nTh + ' td=' + nTd);
  check('머리글에 「학생」 칸이 있다', /data-ko="학생" data-en="Student"/.test(head));
}

check('검색이 학생(참가자)까지 훑는다',
  /COALESCE\(r\.participant_names,''\) LIKE \?/.test(MANGO) && /COALESCE\(r\.participant_ids,''\) LIKE \?/.test(MANGO),
  '화면에 이름이 보이는데 그 이름으로 검색하면 0건 = 「검색했는데 아무것도 없다」');
{ // LIKE 자리 수와 바인드 수가 맞는가 (하나만 늘리면 D1 이 던진다)
  const m = MANGO.match(/whereParts\.push\("\(r\.room_id LIKE[^"]*"\);[\s\S]{0,200}?whereBinds\.push\(([^)]*)\);/);
  const nQ = m ? (m[0].match(/LIKE \?/g) || []).length : -1;
  const nB = m ? m[1].split(',').filter(x => x.trim()).length : -2;
  check('LIKE 자리 수 = 바인드 수', nQ === nB && nQ === 5, 'LIKE=' + nQ + ' bind=' + nB);
}

/* ══ B. 판정을 실제로 돌린다 ══════════════════════════════════════════════ */
console.log('\n[ B. 판정 모듈을 컴파일해 가짜 D1 로 실행 ]');
{
  /* ⚠️ esbuild 는 bin/ 을 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'recstu-'));
  const out = join(dir, 'm.mjs');
  buildSync({ entryPoints: [join(SRC, 'recording-students.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /* 가짜 D1 — 질의문을 보고 답을 바꾼다.
     ⚠️ prepare() 와 prepare().bind() **두 층 모두**에 all/first 를 둔다. 한 층만 두면
        정본이 그 줄에서 예외를 내고, 「빈 값이 정답」인 검사만 초록이 된다(CLAUDE.md 2장). */
  const calls = [];
  const mkEnv = (data) => {
    const answer = (q, binds) => {
      calls.push({ q, n: binds.length });
      if (/FROM class_schedules/.test(q)) {
        return { results: (data.schedules || []).filter(r => binds.includes(r.id)) };
      }
      if (/FROM students_erp/.test(q)) {
        return { results: (data.students || []).filter(r => binds.includes(r.user_id)) };
      }
      return { results: [] };
    };
    const layer = (q, binds) => ({
      all:   async () => answer(q, binds),
      first: async () => (answer(q, binds).results || [])[0] || null,
    });
    return { DB: { prepare: (q) => ({
      ...layer(q, []),
      bind: (...b) => layer(q, b),
    }) } };
  };

  const DATA = {
    schedules: [{ id: 1086, user_id: 'cys01', student_name: '최윤서' },
                { id: 1078, user_id: 'jye46712', student_name: '김선우' },
                { id: 777,  user_id: 'newkid',   student_name: '박신입' }],
    // 실측 그대로 — 학생만 students_erp 에 있다. 강사 계정(mangoi_114)·임시번호는 없다.
    students: [{ user_id: 'cys01', korean_name: '최윤서' },
               { user_id: 'jye46712', korean_name: '김선우' },
               { user_id: 'heyst', korean_name: '김사랑' },
               { user_id: 'kim',   korean_name: '김민수' }],
  };

  const run = (rows, data = DATA) => M.resolveRecordingStudents(mkEnv(data), rows);

  const r1 = await run([{ room_id: 'class-1086-20260901',
    participant_ids: '["7uj58e6gz6x2n1lex0lwen","z6nn4uhuwt95py0f4o6hvm","cys01"]',
    consented_user_ids: '["cys01"]' }]);
  check('예약방의 학생을 찾는다', r1[0].length === 1 && r1[0][0].uid === 'cys01' && r1[0][0].name === '최윤서',
    JSON.stringify(r1[0]));
  check('예약의 학생에는 표시가 붙는다(화면이 맨 앞·굵게 그린다)', r1[0][0].scheduled === true);
  check('임시 접속번호는 학생으로 세지 않는다',
    !r1[0].some(s => /^[a-z0-9]{18,}$/.test(s.uid)), JSON.stringify(r1[0]));

  const r2 = await run([{ room_id: 'class-1086-20260901', participant_ids: '["u_y8l6pbltzu","mangoi_114"]', consented_user_ids: '[]' }]);
  check('강사 계정(학생 명부에 없음)은 학생으로 붙이지 않는다',
    r2[0].length === 1 && r2[0][0].uid === 'cys01', JSON.stringify(r2[0]));

  const r3 = await run([{ room_id: 'class-777-20260901', participant_ids: '[]', consented_user_ids: '[]' }]);
  check('명부에 아직 없는 계정도 예약에 적힌 이름으로 말한다',
    r3[0].length === 1 && r3[0][0].uid === 'newkid' && r3[0][0].name === '박신입', JSON.stringify(r3[0]));

  const r4 = await run([{ room_id: 'mangoi-class', participant_ids: '["cm00vatkld8pkuq46glhyk","heyst"]', consented_user_ids: '["heyst"]' }]);
  check('공용방도 «명부에 있는 계정» 이면 찾는다',
    r4[0].length === 1 && r4[0][0].uid === 'heyst' && r4[0][0].name === '김사랑', JSON.stringify(r4[0]));
  check('공용방 학생에는 예약 표시가 없다', !r4[0][0].scheduled);

  const r5 = await run([{ room_id: 'mangoi-class', participant_ids: '["Kim"]', consented_user_ids: '[]' }]);
  check('대소문자가 다르면 붙이지 않는다(Kim ≠ kim — 남의 이름 방지)',
    r5[0].length === 0, JSON.stringify(r5[0]));

  const r6 = await run([{ room_id: 'meet-demo-1', participant_ids: '["nobody-here"]', consented_user_ids: '[]' }]);
  check('아무도 못 찾으면 빈 목록(화면이 «—» 로 사실대로 말한다)', r6[0].length === 0);

  const r7 = await run([{ room_id: 'class-1086-20260901', participant_ids: 'not json', consented_user_ids: null }]);
  check('participant_ids 가 깨져 있어도 예약 학생은 나온다',
    r7[0].length === 1 && r7[0][0].uid === 'cys01', JSON.stringify(r7[0]));

  const r8 = await run([{ room_id: 'class-1078-20260901', participant_ids: '["jye46712","heyst","cys01","kim"]', consented_user_ids: '[]' }]);
  check('여러 명이면 예약 학생이 맨 앞이고 나머지도 함께 나온다',
    r8[0].length === 4 && r8[0][0].uid === 'jye46712' && r8[0][0].scheduled === true,
    JSON.stringify(r8[0]));
  check('같은 계정을 두 번 적지 않는다',
    new Set(r8[0].map(s => s.uid)).size === r8[0].length);

  const many = { room_id: 'mangoi-class',
    participant_ids: JSON.stringify(Array.from({ length: 250 }, (_, i) => 'u' + i).concat(['heyst'])),
    consented_user_ids: '[]' };
  calls.length = 0;
  const r9 = await run([many]);
  check('D1 바인드 100개 한도를 넘지 않는다(청크 분할)',
    calls.length > 1 && calls.every(c => c.n <= 100), JSON.stringify(calls.map(c => c.n)));
  check('청크로 나눠도 학생을 찾는다', r9[0].length === 1 && r9[0][0].uid === 'heyst');

  const rows = [{ room_id: 'class-1086-20260901', participant_ids: '[]', consented_user_ids: '[]' },
                { room_id: 'meet-x', participant_ids: '[]', consented_user_ids: '[]' },
                { room_id: 'class-1078-20260901', participant_ids: '[]', consented_user_ids: '[]' }];
  const rA = await run(rows);
  check('입력과 같은 길이·같은 순서로 돌려준다',
    rA.length === 3 && rA[0][0].uid === 'cys01' && rA[1].length === 0 && rA[2][0].uid === 'jye46712');

  // DB 가 통째로 죽어도 목록은 떠야 한다 — 여기서 던지면 녹화 목록 전체가 500 이 된다.
  const deadEnv = { DB: { prepare: () => { throw new Error('no such table'); } } };
  let threw = false, rDead = null;
  try { rDead = await M.resolveRecordingStudents(deadEnv, rows); } catch { threw = true; }
  check('DB 가 죽어도 던지지 않는다', !threw);
  check('그때는 전부 빈 목록(길이는 유지)', !threw && rDead.length === 3 && rDead.every(x => x.length === 0));

  check('방 번호에서 예약 id 를 읽는다', M.scheduleIdFromRoom('class-1086-20260901') === 1086);
  check('공용방은 예약 id 가 없다(null)', M.scheduleIdFromRoom('mangoi-class') === null);
}

/* ══ C. 화면 셀을 실제로 그려 본다 ═══════════════════════════════════════ */
console.log('\n[ C. 화면 셀 — 소스를 오려 내 실행 ]');
{
  const start = CORE.indexOf('const studentCell = (function () {');
  const end   = CORE.indexOf('})();', start);
  check('학생 셀 코드를 소스에서 찾았다', start > 0 && end > start,
    '못 찾으면 아래 검사는 전부 무의미하다 — 모양이 바뀌었으면 여기부터 고칠 것');

  if (start > 0 && end > start) {
    const body = CORE.slice(start, end + 5);
    const esc  = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cell = new Function('r', 'adminLang', '_esc', body + '\n return studentCell;');
    const draw = (r, lang = 'ko') => cell(r, lang, esc);

    const one = draw({ source: 'both', students: [{ uid: 'cys01', name: '최윤서', scheduled: true }] });
    check('학생 이름을 그린다', one.includes('최윤서'));
    check('계정은 툴팁으로 함께 알려 준다', one.includes('계정: cys01'));

    check('학생을 못 찾으면 «—» 와 그 이유를 함께 말한다', (() => {
      const h = draw({ source: 'both', students: [] });
      return h.includes('—') && /title="[^"]*로그인/.test(h);
    })(), '빈칸으로 두면 「고장」으로 읽힌다');
    check('고아 행은 «기록이 없다» 고 말한다', (() => {
      const h = draw({ source: 'orphan', students: [] });
      return h.includes('—') && /title="[^"]*기록이 없어/.test(h);
    })());
    check('students 가 아예 없어도(옛 응답) 죽지 않는다',
      draw({ source: 'both' }).includes('—'));

    const four = draw({ source: 'both', students: [
      { uid: 'a', name: '가나' }, { uid: 'b', name: '나다' }, { uid: 'c', name: '다라' }, { uid: 'd', name: '라마' }] });
    check('사람이 많으면 3명까지 적고 나머지는 «외 N명»', four.includes('외 1명') && !four.includes('라마<'),
      four);
    check('숨긴 사람 이름은 툴팁에 남긴다', four.includes('라마'));

    const bad = draw({ source: 'both', students: [{ uid: 'x', name: '<script>alert(1)</script>' }] });
    check('이름을 HTML 로 해석하지 않는다(이스케이프)',
      !bad.includes('<script>') && bad.includes('&lt;script&gt;'), bad);

    const en = draw({ source: 'both', students: [] }, 'en');
    check('영어 화면에서는 영어로 말한다', /title="[^"]*student account/i.test(en), en);

    const idOnly = draw({ source: 'both', students: [{ uid: 'newkid', name: '' }] });
    check('이름을 못 구했으면 계정이라도 보여 준다', idOnly.includes('newkid'));
  }
}

console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + 'PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail === 0 ? 0 : 1);

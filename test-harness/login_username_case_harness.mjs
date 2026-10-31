// 🔤 아이디 대소문자 무시 하니스 — 2026-08-24 (사장님 지시)
//
// [무엇이 문제였나]
//   `admin_account.username` 은 `TEXT NOT NULL UNIQUE` 로 **COLLATE NOCASE 가 없다.**
//   SQLite 는 `mangoi_167` 과 `Mangoi_167` 을 «다른 값» 으로 본다. 그런데 로그인 조회가
//   못 찾으면 «옛 LMS 통과 인증» 이 그 자리에서 **새 계정을 만든다**(입력한 글자 그대로).
//   → 휴대폰 키보드의 자동 대문자 한 번에 계정이 두 벌이 된다.
//   실측(2026-08-24): `mangoi_167`(7/30 · HANNAH 연결됨) 과 `Mangoi_167`(8/24 · 연결 안 됨)
//   이 나란히 존재했고, 정작 쓰는 쪽에 연결이 없어 강사 화면이 「수업 없음」이었다.
//   출근·급여가 계정 단위라 기록도 두 갈래로 쪼개진다.
//
// [왜 문자열 검사만으로는 모자란가]
//   지켜야 하는 것은 «그 SQL 이 실제로 무엇을 고르는가» 다. 특히 «정확일치를 먼저» 라는
//   순서는 눈으로 봐서는 맞는지 알 수 없다 — 틀리면 «어제까지 되던 사람» 의 비밀번호가
//   갑자기 안 맞는다. 그래서 **소스에서 SQL 을 그대로 오려 내 진짜 SQLite 에 돌린다.**
//
// 실행: node test-harness/login_username_case_harness.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const auth = rd('../cloudflare-deploy/src/auth-admin.ts');
const legacy = rd('../cloudflare-deploy/src/legacy-teacher-auth.ts');
const tapi = rd('../cloudflare-deploy/src/api-teacher.ts');
const stuApi = rd('../cloudflare-deploy/src/api-students.ts');
const guard = rd('../cloudflare-deploy/public/js/session-guard.js');
const admLogin = rd('../cloudflare-deploy/public/admin/login.html');
const parentHtml = rd('../cloudflare-deploy/public/parent.html');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ══ ① 로그인이 고르는 SQL 을 «소스에서 오려 내» 진짜 SQLite 에 돌린다 ═══════════ */
console.log('\n════ ① 대소문자가 갈린 두 계정에서 무엇을 고르는가 (실제 SQLite) ════');
{
  // 소스의 후보 조회 SQL 을 그대로 가져온다 — 여기에 적어 두면 언젠가 소스와 어긋난다.
  const m = /`SELECT username, password_hash FROM admin_account\s*\n\s*WHERE username = \? COLLATE NOCASE\s*\n\s*ORDER BY[^`]*`/.exec(auth);
  check('소스에서 후보 조회 SQL 을 찾았다', !!m);
  if (m) {
    const sql = m[0].slice(1, -1).replace(/\s+/g, ' ').trim();
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE admin_account (id INTEGER PRIMARY KEY AUTOINCREMENT,
             username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);`);
    // 실측 상황 그대로 — 소문자가 먼저 생겼고(id 1), 대문자가 나중(id 2)
    db.prepare(`INSERT INTO admin_account (username, password_hash) VALUES (?, ?)`).run('mangoi_167', 'HASH_LOWER');
    db.prepare(`INSERT INTO admin_account (username, password_hash) VALUES (?, ?)`).run('Mangoi_167', 'HASH_UPPER');
    db.prepare(`INSERT INTO admin_account (username, password_hash) VALUES (?, ?)`).run('mangoi_168', 'HASH_OTHER');

    /* ⚠️ 바인드 개수를 SQL 에서 세어 맞춘다. 개수를 손으로 적어 두면, 정렬절이 빠지는
       회귀에서 «검사 실패» 가 아니라 **예외로 죽어** 아무것도 보고하지 못한다(실측). */
    const nParams = (sql.match(/\?/g) || []).length;
    const run = (typed) => db.prepare(sql).all(...Array(nParams).fill(typed)).map((r) => r.username);
    check('정확일치를 먼저 세우는 정렬절이 있다 (없으면 아래 순서 검사가 무의미)',
      /ORDER BY \(username = \?\) DESC/.test(sql), sql);

    const asTyped = run('Mangoi_167');
    check('🔴 두 계정이 모두 후보로 잡힌다 (대소문자 무시)', asTyped.length === 2, asTyped);
    check('🔴 «정확일치» 가 맨 앞이다 — 대문자로 치면 대문자 계정이 먼저',
      asTyped[0] === 'Mangoi_167', asTyped);

    const asLower = run('mangoi_167');
    check('🔴 소문자로 치면 소문자 계정이 먼저 (반대 방향도 같다)',
      asLower[0] === 'mangoi_167' && asLower.length === 2, asLower);

    // 정확일치가 아예 없는 표기 — 그래도 찾아야 한다(이게 «무시» 의 핵심)
    const asMixed = run('MANGOI_167');
    check('🟡 어떤 대소문자로 쳐도 계정을 찾는다', asMixed.length === 2, asMixed);

    check('⛔ 다른 아이디까지 끌어오지 않는다 (mangoi_168 은 섞이지 않는다)',
      !asTyped.includes('mangoi_168') && !asMixed.includes('mangoi_168'));

    const none = run('nobody_999');
    check('⛔ 없는 아이디는 0건 (→ 옛 LMS 폴백 분기로 가야 한다)', none.length === 0, none);

    /* «후보마다 비밀번호를 대 본다» 는 규칙을 그대로 흉내 내 본다.
       두 계정에 서로 다른 비번이 걸려 있어도 **어느 쪽도 잠기지 않아야** 한다. */
    const pick = (typed, pw) => {
      for (const u of run(typed)) {
        const h = db.prepare(`SELECT password_hash h FROM admin_account WHERE username = ?`).get(u).h;
        if (h === pw) return u;
      }
      return null;
    };
    check('🔴 대문자 계정의 비번을 치면 그 계정으로 들어간다',
      pick('Mangoi_167', 'HASH_UPPER') === 'Mangoi_167');
    check('🔴 소문자 계정의 비번을 치면 그 계정으로 들어간다 (한쪽이 잠기지 않는다)',
      pick('Mangoi_167', 'HASH_LOWER') === 'mangoi_167');
    check('⛔ 둘 다 아닌 비번은 아무 계정도 열지 않는다',
      pick('Mangoi_167', 'HASH_WRONG') === null);
  }
}

/* ══ ② 찾은 계정의 «DB 에 적힌 아이디» 로 아래가 이어지는가 ═══════════════════════ */
console.log('\n════ ② 세션·2FA·스코프·기록이 전부 같은 아이디를 쓰는가 ════');
{
  /* 여기서 갈리면 대소문자가 그대로 아래로 흘러 같은 사고가 다시 난다.
     ⚠️ SQL 안의 컬럼명 `username` 은 그대로여야 한다 — 바인딩하는 값만 본다. */
  const need = [
    ['세션에 적히는 아이디', /\.bind\(token, acctUser, ip, ua/],
    ['2FA 조회', /FROM admin_2fa WHERE username = \? LIMIT 1`\s*\)\s*\.bind\(acctUser\)/],
    ['계정 이름·언어 조회', /FROM admin_account WHERE username = \? LIMIT 1`\)\.bind\(acctUser\)/],
    ['권한 스코프 조회', /FROM admin_scope WHERE username = \? LIMIT 1`\)\.bind\(acctUser\)/],
    ['로그인 성공 기록', /recordLogin\(env, acctUser, ip, ua, true, null\)/],
    ['역할 판정', /resolveRole\(scopeType, acctUser, acctName\)/],
    ['화면에 돌려주는 아이디', /ok: true, username: acctUser/],
    ['화면 신원(resolveUiIdentity)', /resolveUiIdentity\(acctUser, acctName, isTeacher\)/],
  ];
  for (const [label, re] of need) check(label + ' 이 «DB 에 적힌 아이디» 를 쓴다', re.test(auth));

  /* 🔴 «계정이 없다»(→ 옛 LMS 폴백) 와 «있는데 비번이 틀리다»(→ 401) 의 구분.
     이게 무너지면 비번을 틀릴 때마다 옛 LMS 로 나가고, 최악에는 계정이 또 생긴다. */
  check('🔴 계정이 있는데 비번만 틀리면 옛 LMS 로 폴백하지 않는다',
    /if \(!row && candRows\.length\) \{[\s\S]{0,300}?return json\(\{ ok: false, error: 'invalid_credentials' \}, 401\)/.test(auth));
  check('🔴 계정이 «하나도» 없을 때만 옛 LMS 폴백으로 간다',
    /if \(!row\) \{\s*\n\s*if \(!legacyLoginEnabled/.test(auth));
  check('⛔ 옛 방식(정확일치 한 건만 조회)이 되살아나지 않았다',
    !/FROM admin_account WHERE username = \? LIMIT 1`\s*\n?\s*\)\.bind\(username\)\.first<\{ username: string; password_hash/.test(auth));
}

/* ══ ③ 계정을 «만드는» 두 경로도 같은 규칙인가 ═══════════════════════════════════ */
console.log('\n════ ③ 새 계정이 대소문자만 달리해서 또 생기지 않는가 ════');
{
  check('자동 생성(옛 LMS 통과 인증)이 대소문자 무시로 먼저 확인한다',
    /FROM admin_account WHERE username = \? COLLATE NOCASE LIMIT 1/.test(legacy));
  check('🔴 이미 있으면 만들지 않고 그대로 돌아간다',
    /if \(existing && String\(existing\.username\) !== loginId\)[\s\S]{0,200}?return;/.test(legacy));
  check('⛔ 있는 계정의 비번·이름을 덮어쓰지 않는다 (여기는 «만드는» 자리다)',
    !/UPDATE admin_account SET password_hash/.test(legacy));
  check('직원 등록(staff-create) 중복 검사도 대소문자 무시',
    /FROM admin_account WHERE username = \? COLLATE NOCASE LIMIT 1/.test(auth));
  check('무엇과 부딪혔는지 알려 준다 (대소문자만 다르면 눈으로 못 찾는다)',
    /대소문자만 다릅니다/.test(auth) && /existing: dup\.username/.test(auth));
}

/* ══ ④ 강사 화면의 «계정 ↔ 원부» 연결도 대소문자를 무시하는가 ═══════════════════ */
console.log('\n════ ④ 연결표 조회 ════');
{
  /* 이게 빠지면 고쳐 놓고도 화면은 그대로 「계정이 연결돼 있지 않다」고 말한다 —
     본사가 `mangoi_167` 에 연결해 뒀는데 세션이 `Mangoi_167` 이면 0건이다. */
  check('teacher_account_links 조회가 COLLATE NOCASE 다',
    /FROM teacher_account_links WHERE username = \? COLLATE NOCASE/.test(tapi));
}

/* ══ ⑤ 학생 계정도 같은 규칙인가 (students_erp) — 2026-08-25 ═════════════════════
   [무엇이 문제였나]
     `/api/student/login` 은 `WHERE user_id = ? COLLATE NOCASE` 로 찾는데, 학생을
     «만드는» 쪽은 `WHERE user_id = ?`(대소문자 구분)로 중복을 봤다. `user_id` 는
     TEXT PRIMARY KEY = BINARY 라 `jeong` 과 `Jeong` 이 UNIQUE 에 걸리지 않는다.
     → 두 벌이 나란히 생기고, 로그인은 그중 «아무 행이나» 집는다(출석·포인트가 갈린다).
     admin_account 건(①~④)과 같은 뿌리인데 표만 다르다. */
console.log('\n════ ⑤ 학생 계정(students_erp)도 대소문자를 무시하는가 ════');
{
  const sadmin = rd('../cloudflare-deploy/src/api-admin.ts');
  const sstu = rd('../cloudflare-deploy/src/api-students.ts');

  /* «찾는 쪽» 이 실제로 무엇을 고르는지는 눈으로 알 수 없다 — 소스에서 오려 내 돌린다. */
  const m = /`SELECT user_id FROM students_erp WHERE user_id = \? COLLATE NOCASE LIMIT 1`/.exec(sadmin);
  check('관리자 수동 등록(/api/admin/students/create)의 중복검사 SQL 을 찾았다', !!m);
  if (m) {
    const sql = m[0].slice(1, -1);
    const db = new DatabaseSync(':memory:');
    // 운영과 같은 모양 — PRIMARY KEY 에 COLLATE NOCASE 가 «없다»(스키마는 안 바꾼다).
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, password_hash TEXT);`);
    db.prepare(`INSERT INTO students_erp (user_id, korean_name) VALUES (?, ?)`).run('jeong', '정우영');

    const hit = db.prepare(sql).all('Jeong').map((r) => r.user_id);
    check('🔴 대소문자만 다른 아이디를 «이미 있다» 로 잡는다', hit.length === 1 && hit[0] === 'jeong', hit);
    check('상관없는 아이디는 안 잡는다 (과잉 차단 아님)',
      db.prepare(sql).all('jeong2').length === 0);

    /* 이 검사가 «무의미해지지 않게» 전제도 함께 못박는다: 스키마가 BINARY 라서
       중복 INSERT 가 실제로 성공한다는 것. 그래서 찾는 쪽이 유일한 방어다. */
    let inserted = false;
    try { db.prepare(`INSERT INTO students_erp (user_id) VALUES (?)`).run('Jeong'); inserted = true; } catch { /* 무시 */ }
    check('⚠️ 전제 확인 — 스키마만으로는 안 막힌다(대소문자만 다른 행이 그대로 들어간다)', inserted);
  }

  check('홈 회원가입(/api/student/register)의 중복검사도 COLLATE NOCASE 다',
    /SELECT user_id FROM students_erp WHERE user_id = \? COLLATE NOCASE LIMIT 1/.test(sstu));
  /* ⛔ 한쪽만 고치면 그 경로로 그대로 두 벌이 생긴다 — 둘은 «짝» 이다. */
  check('두 등록 경로 모두 대소문자를 구분하는 옛 검사가 남아 있지 않다',
    !/SELECT user_id FROM students_erp WHERE user_id = \?(?! COLLATE NOCASE)/.test(sadmin)
    && !/SELECT user_id FROM students_erp WHERE user_id = \?(?! COLLATE NOCASE)/.test(sstu));
  check('학부모-자녀 잇기도 대소문자를 무시하고, DB 표기로 이어 준다',
    /FROM students_erp WHERE user_id = \? COLLATE NOCASE LIMIT 1/.test(sstu)
    && /const childUid = exists \? String\(exists\.user_id\) : cUid;/.test(sstu));
  check('무엇과 부딪혔는지 알려 준다 (대소문자만 다르면 눈으로 못 찾는다)',
    /대소문자만 다릅니다/.test(sadmin) && /대소문자만 다릅니다/.test(sstu));
}

/* ══ ⑥ 학생 «로그인» 도 정확일치 우선인가 (실제 SQLite) ═════════════════════
   ⑤는 «계정을 만들 때» 중복을 잡는지만 봤다. 정작 매일 도는 것은 «로그인» 인데
   그쪽은 ORDER BY 없는 NOCASE 조회라 **둘 중 아무 행이나** 집고 있었다.
   운영 실측(2026-08-26): `Kim`/`kim`, `Lee`/`lee` 네 행이 실재한다 — 남의 계정으로
   들어가면 출석·포인트가 통째로 갈린다. 그래서 여기도 «정확일치 먼저» 를 못 박는다. */
console.log('\n════ ⑥ 학생 로그인이 대소문자가 갈린 두 계정에서 무엇을 고르는가 ════');
{
  const m = /`SELECT user_id, student_name, parent_name, parent_phone, parent_user_id, password_hash\s*\n\s*FROM students_erp WHERE user_id = \? COLLATE NOCASE\s*\n\s*ORDER BY[^`]*`/.exec(stuApi);
  check('소스에서 학생 로그인 조회 SQL 을 찾았다', !!m);
  if (m) {
    const sql = m[0].slice(1, -1).replace(/\s+/g, ' ').trim();
    check('정확일치를 먼저 세우는 정렬절이 있다 (없으면 아래 순서 검사가 무의미)',
      /ORDER BY \(user_id = \?\) DESC/.test(sql), sql);

    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_name TEXT,
             parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, password_hash TEXT);`);
    // 운영 실측 그대로 — 대문자 행이 먼저 들어가 있어도 정확일치가 이겨야 한다.
    for (const [u, n] of [['Kim', 'Kim'], ['kim', '김민수'], ['Lee', 'Lee'], ['lee', '이병엽']]) {
      db.prepare(`INSERT INTO students_erp (user_id, student_name) VALUES (?, ?)`).run(u, n);
    }
    const nParams = (sql.match(/\?/g) || []).length;
    const pick = (typed) => {
      const r = db.prepare(sql).all(...Array(nParams).fill(typed));
      return r.length ? r[0].user_id : null;
    };
    check('🔴 «kim» 으로 치면 정확히 kim (Kim 이 아니다)', pick('kim') === 'kim', pick('kim'));
    check('🔴 «Kim» 으로 치면 정확히 Kim', pick('Kim') === 'Kim', pick('Kim'));
    check('🔤 «KIM» — 정확일치가 없으면 대소문자만 다른 행으로 들어간다 (로그인은 된다)',
      pick('KIM') !== null, pick('KIM'));
    check('한 행만 돌려준다 (LIMIT 1 — 여러 행이 오면 호출부가 아무거나 쓴다)',
      db.prepare(sql).all(...Array(nParams).fill('kim')).length === 1);
    check('상관없는 아이디는 안 걸린다 (과잉 매칭 아님)', pick('kimchi') === null);
  }

  /* 로그인만 고쳐서는 반쪽이다 — 아이디를 «치는» 다른 화면도 같은 규칙이어야 한다.
     빠지면 「로그인은 되는데 연장 결제만 학생을 못 찾는」 상태가 된다. */
  check('연장 결제 본인확인(/api/student/lookup)도 대소문자 무시 + 정확일치 우선',
    /SELECT \* FROM students_erp WHERE user_id = \? COLLATE NOCASE\s*\n\s*ORDER BY \(user_id = \?\) DESC/.test(stuApi));
  check('비밀번호 설정(/api/student/set-password)도 대소문자 무시 + 정확일치 우선',
    /SELECT user_id, password_hash FROM students_erp WHERE user_id = \? COLLATE NOCASE\s*\n\s*ORDER BY \(user_id = \?\) DESC/.test(stuApi));
  /* ⚠️ 0건 UPDATE 는 에러를 내지 않는다 — 입력 표기로 쓰면 «저장했다는데 안 바뀌는» 상태가 된다. */
  check('⛔ 비밀번호 UPDATE 는 입력 표기가 아니라 DB 표기(canonUid)로 나간다',
    /UPDATE students_erp SET password_hash = \? WHERE user_id = \?`\)\.bind\(newHash, canonUid\)/.test(stuApi));
  check('학부모 대시보드도 대소문자 무시 + 이후 조회를 DB 표기로 통일한다',
    /FROM students_erp WHERE user_id = \? COLLATE NOCASE\s*\n\s*ORDER BY \(user_id = \?\) DESC[^;]*;\s*\n[\s\S]{0,400}?childUid = String\(student\.user_id\);/.test(stuApi));
  check('본인확인 비교도 대소문자를 무시한다 (여기만 남으면 401 로 막힌다)',
    /_authUid\.toLowerCase\(\) !== childUid\.toLowerCase\(\)/.test(stuApi));
}

/* ══ ⑦ 화면 — 폰 키보드가 아이디를 대문자로 만들지 않는가 ═══════════════════
   서버가 대소문자를 무시해도 이건 남는다 —
     ① 화면에 대문자가 찍히는 것 자체가 아이를 멈춰 세운다
     ② 자동고침(autocorrect)은 «다른 글자» 를 만들어 실제로 로그인을 깨뜨린다
   ⚠️ index.html 은 공동 금지구역이라 그 안의 칸에 속성을 직접 못 적는다 →
      defer 파일(session-guard.js)이 밖에서 입혀 준다. 그래서 그 파일을 검사한다. */
console.log('\n════ ⑦ 아이디 칸 자동 대문자·자동 고침 차단 ════');
{
  check('아이디 칸 보정 코드가 session-guard.js 에 있다', /__mangoiIdNoCaps/.test(guard));
  check('세 속성을 모두 끈다 (하나만 끄면 자동고침이 남는다)',
    /autocapitalize'?,\s*'off'/.test(guard) && /autocorrect'?,\s*'off'/.test(guard)
    && /spellcheck'?,\s*'false'/.test(guard));
  check('나중에 만들어지는 로그인 칸(lm-uid)도 잡는다 — 누를 때·포커스 때 둘 다',
    /addEventListener\('pointerdown'/.test(guard) && /addEventListener\('focusin'/.test(guard));
  /* ⚠️ 부정 검사는 **주석을 벗겨 낸 사본**으로 판정한다 — 안 그러면 「왜 안 쓰는지」 적어 둔
     설명 주석에 그 낱말이 들어 있어 검사가 자기 주석을 잡는다(CLAUDE.md 2장, 실제로 밟았다). */
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('⛔ 상주 감시자(DOM 변화 관찰)로 지켜보지 않는다 (홈 전체를 멎게 한 전력)',
    !/MutationObserver/.test(stripComments(guard)));
  check('⛔ 비밀번호 칸은 건드리지 않는다 (text/search 만 손본다)',
    /t !== 'text' && t !== 'search'/.test(guard));
  check('autocomplete="username" 만 달아도 새 화면이 자동으로 걸린다',
    /getAttribute\('autocomplete'\) === 'username'/.test(guard));

  /* 정적 HTML 은 밖에서 입히지 말고 마크업에 직접 적는다 — 첫 글자 입력보다 빠르다. */
  check('관리자·강사 로그인 아이디 칸에 autocapitalize=off 가 박혀 있다',
    /id="username"[^>]*autocapitalize="off"[^>]*autocorrect="off"[^>]*spellcheck="false"/.test(admLogin));
  check('학부모 화면 자녀 아이디 칸에도 박혀 있다',
    /id="uid-input"[^>]*autocapitalize="off"[^>]*autocorrect="off"[^>]*spellcheck="false"/.test(parentHtml));

  /* 🔠 비밀번호는 대소문자를 «그대로» 본다(2026-08-26 사장님 결정 — 급여·회계 계정 49개).
     그래서 「틀렸습니다」 뒤가 아니라 치기 전에 원인을 보여 준다. */
  check('Caps Lock 안내가 관리자·강사 로그인에 있다',
    /id="capsWarn"/.test(admLogin) && /getModifierState/.test(admLogin));
  check('keydown·keyup 둘 다 본다 (한쪽만 보면 켠 직후 한 박자 늦는다)',
    /addEventListener\('keydown', check\)/.test(admLogin) && /addEventListener\('keyup', check\)/.test(admLogin));
}

console.log('\n' + '─'.repeat(58));
console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
process.exit(FAIL ? 1 : 0);

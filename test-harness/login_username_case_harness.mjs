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

console.log('\n' + '─'.repeat(58));
console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
process.exit(FAIL ? 1 : 0);

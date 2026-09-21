// ═══════════════════════════════════════════════════════════════════════
// 🎓 student_ai_onboarding_harness — 화상수업 없이 AI 학습도구만 쓰는 학생의 «1단계 배선»
//
// [무엇을 지키는가 — 2026-09-02]
//   교재·성적표·AI 도구는 이미 다 있었는데 «이 학생이 몇 레벨이고 무슨 교재인가» 를
//   적어 두는 칸(students_erp.level·textbook)이 **29,462명 전원 비어 있었다.**
//   그 칸을 채우는 배선 셋을 이 하네스가 지킨다:
//     ① 레벨테스트 CEFR → 교재 레벨('Lv N') 변환      (src/student-placement.ts)
//     ② 배정할 수 있는 «실재하는» 교재 목록            (같은 파일 loadTextbookChoices)
//     ③ 화면 배선 — 무인증 경로에서 본문 uid 를 안 믿는가, 목록을 실제로 부르는가
//
// [⛔ 문자열로 검사하지 않는다]
//   이 배선의 결함은 전부 «함수도 값도 있는데 답이 틀린» 모양이다. 실제로 수리 전에도
//   회귀 하네스가 전부 초록이었다. 그래서 여기서는 **정본을 번들해 실제로 돌리고**,
//   SQL 은 **진짜 SQLite 에 돌린다.**
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

let PASS = 0, FAIL = 0, SKIP = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra ? '\n       ↳ ' + String(extra).slice(0, 220) : ''}`);
}
function eq(name, a, b) { check(`${name} → ${JSON.stringify(a)}`, JSON.stringify(a) === JSON.stringify(b), `기대 ${JSON.stringify(b)}`); }
function skip(name) { SKIP++; console.log(`  ⏭ ${name}`); }

/* ── 진짜 SQLite 를 D1 모양으로 감싼다 ─────────────────────────────────
   ⚠️ 정본이 .bind() 없이 부르는 질의가 섞이면 bind 아래에만 응답을 둔 가짜 DB 는
      그 줄에서 예외를 낸다 → 함수가 통째로 «빈 값» 을 주는데, 하필 「없으면 안 한다」류
      검사는 빈 값이 정답이라 **헛돌며 통과한다**(CLAUDE.md 함정). 그래서 두 층 모두 둔다. */
function d1(db) {
  const wrap = (sql, params) => ({
    bind: (...p) => wrap(sql, p),
    run: async () => { const r = db.prepare(sql).run(...(params || [])); return { meta: { changes: Number(r.changes || 0), last_row_id: Number(r.lastInsertRowid || 0) } }; },
    first: async () => { const r = db.prepare(sql).get(...(params || [])); return r === undefined ? null : r; },
    all: async () => ({ results: db.prepare(sql).all(...(params || [])) }),
  });
  return { DB: { prepare: (sql) => wrap(sql, []), exec: async (sql) => db.exec(sql) } };
}

console.log('\n═══ 학생 AI 온보딩 1단계 배선 ═══');

/* ═══ A. 정본을 번들해 실제로 돌린다 ══════════════════════════════════ */
console.log('\n[ A. CEFR → 교재 레벨 변환 — 실제로 돌려서 확인 ]');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }
let M = null;
if (!esbuildApi) {
  skip('esbuild 없음 — 실행 검증을 건너뜁니다(정적 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'plc-')), 'p.mjs');
  let ok = true;
  try {
    esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'student-placement.ts')], bundle: true,
      format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch (e) { ok = false; console.log('       ↳ ' + String(e).slice(0, 200)); }
  check('student-placement.ts 를 번들해 실제로 돌릴 수 있다', ok);
  if (ok) M = await import('file://' + out.replace(/\\/g, '/'));
}

if (M) {
  const L = M.textbookLevelFromCefr, B = M.bandFromCefr;

  /* 🔑 이 표기가 핵심이다 — review_quizzes.level 실측값이 'Lv 1'·'Lv 3' 형식이고
     warmupLessonContext 가 LOWER(level)=LOWER(?) 로 **완전일치** 비교한다.
     'A1' 을 그대로 넣으면 영영 아무것도 안 맞는데 **에러는 안 난다.** */
  eq("A1", L('A1'), 'Lv 1');
  eq("A2", L('A2'), 'Lv 5');
  eq("A2+", L('A2+'), 'Lv 9');
  eq("B1", L('B1'), 'Lv 13');
  eq("B1+", L('B1+'), 'Lv 18');
  eq("B2", L('B2'), 'Lv 22');
  eq("B2+", L('B2+'), 'Lv 26');
  eq("C1", L('C1'), 'Lv 31');
  check("모두 'Lv N' 표기다 (review_quizzes.level 과 같은 형식)",
    ['A1', 'A2', 'B1', 'B2', 'C1'].every((c) => /^Lv \d+$/.test(String(L(c)))));

  /* 'Starter' 는 CEFR 이름이 아니라 레벨테스트가 「A1 조차 못 넘겼다」로 내는 값이다.
     ⛔ 이걸 «모름» 으로 두면 배정이 가장 필요한 완전 초보만 빈칸이 된다. */
  eq('Starter (A1 미만)', L('Starter'), 'Lv 1');
  eq('C2 (커리큘럼 위쪽 끝 밖)', L('C2'), 'Lv 31');

  eq('소문자로 와도 같다', L('a1'), 'Lv 1');
  eq('공백이 섞여도 같다', L(' B1 '), 'Lv 13');
  eq('모르는 값은 null (지어내지 않는다)', L('영어잘함'), null);
  eq('빈 값은 null', L(''), null);
  eq('null 도 null', L(null), null);

  /* 🔁 왕복 일치 — 우리가 만든 'Lv N' 을 판단력 훈련의 정본 파서에 되돌려 넣어
     같은 밴드가 나오는지 본다. 두 눈금이 어긋나면 여기서 잡힌다. */
  if (esbuildApi) {
    const jl = join(mkdtempSync(join(tmpdir(), 'jl-')), 'j.mjs');
    let ok2 = true;
    try {
      esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'judgment-level.ts')], bundle: true,
        format: 'esm', platform: 'neutral', outfile: jl, logLevel: 'silent' });
    } catch { ok2 = false; }
    if (ok2) {
      const J = await import('file://' + jl.replace(/\\/g, '/'));
      const bad = [];
      for (const c of ['A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1']) {
        const back = J.bandFromTextbookLevel(L(c));
        if (back !== B(c)) bad.push(`${c}: ${L(c)} → 밴드 ${back} (기대 ${B(c)})`);
      }
      check(`'Lv N' 을 정본 파서에 되돌리면 같은 밴드가 나온다${bad.length ? ' — ' + bad.join(', ') : ''}`, bad.length === 0);
    } else skip('judgment-level.ts 번들 실패 — 왕복 검사 생략');
  }

  /* 🔒 전수 — 레벨테스트가 실제로 낼 수 있는 값이 하나도 빠지지 않는가.
     ⛔ 「내가 아는 것만」 검사하면 안 된다. 값 목록을 **그 핸들러 소스에서 읽어 온다.** */
  const admin = rd('cloudflare-deploy/src/api-admin.ts');
  /* 🪜 (2026-09-14) 채점 순서의 정본이 student-placement.ts 의 CEFR_LADDER 로 옮겨갔다(홈 카드 게이지와 같은 눈금).
     api-admin 의 CEFR_ORDER 는 그것을 펼친 것뿐이라 리터럴이 없다 — 정본에서 읽고, api-admin 이 그것을 쓰는지 짝으로 본다. */
  const place = rd('cloudflare-deploy/src/student-placement.ts');
  const orderLine = (place.match(/export const CEFR_LADDER[^=]*=\s*\[([^\]]*)\]/) || [])[1] || '';
  const orders = orderLine.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  check(`레벨테스트의 CEFR 사다리(CEFR_LADDER)를 정본에서 읽었다 (${orders.length}개)`, orders.length >= 5);
  check('채점(api-admin CEFR_ORDER)이 그 사다리를 그대로 쓴다', /const CEFR_ORDER[^=\n]*=\s*\[\s*\.\.\.CEFR_LADDER\s*\]/.test(admin));
  const seedLine = (admin.match(/let level = '([^']+)'/) || [])[1] || '';
  check(`레벨테스트의 «못 넘겼을 때» 초기값을 소스에서 읽었다 ('${seedLine}')`, !!seedLine);
  const unmapped = [...orders, seedLine].filter((v) => v && !L(v));
  check(`레벨테스트가 낼 수 있는 값이 전부 교재 레벨로 이어진다${unmapped.length ? ' — 빠짐: ' + unmapped.join(', ') : ''}`,
    unmapped.length === 0);
}

/* ═══ B. 학생 명부에 적는 동작 — 진짜 SQLite ═════════════════════════ */
console.log('\n[ B. 레벨 기록 — 진짜 SQLite 에 돌려서 확인 ]');
if (!M) skip('번들 실패 — 기록 검사 생략');
else {
  const db = new DatabaseSync(':memory:');
  /* ⚠️ 일부러 updated_at 을 «빼고» 만든다 — 자가가입이 만드는 최소 스키마가 그 모양이다.
     정본이 그 칸을 멱등 ALTER 하지 않으면 여기서 바로 잡힌다(픽스처에 넣어 두면 영영 못 잡는다). */
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, level TEXT)`);
  db.exec(`INSERT INTO students_erp (user_id, level) VALUES ('mango1', NULL), ('mango2', 'Lv 22'), ('Kim', NULL), ('kim', NULL)`);
  const env = d1(db);
  const lv = (u) => { const r = db.prepare(`SELECT level FROM students_erp WHERE user_id = ?`).get(u); return r ? r.level : '(없음)'; };

  const r1 = await M.applyPlacementLevel(env, 'mango1', 'B1');
  check('비어 있으면 적는다', r1.applied === true && r1.reason === 'applied', JSON.stringify(r1));
  eq('  실제로 DB 에 들어갔다', lv('mango1'), 'Lv 13');

  const r2 = await M.applyPlacementLevel(env, 'mango2', 'A1');
  check('이미 있으면 덮어쓰지 않는다 (사람 손이 이긴다)', r2.applied === false && r2.reason === 'already_set', JSON.stringify(r2));
  eq('  기존 값이 그대로다', lv('mango2'), 'Lv 22');

  const r3 = await M.applyPlacementLevel(env, '없는학생', 'B1');
  check("없는 학생은 'not_found' — 'already_set' 과 뭉뚱그리지 않는다", r3.reason === 'not_found', JSON.stringify(r3));

  const r4 = await M.applyPlacementLevel(env, '', 'B1');
  check("uid 가 없으면 'no_uid' 로 조용히 넘어간다", r4.applied === false && r4.reason === 'no_uid');

  const r5 = await M.applyPlacementLevel(env, 'mango1', '영어잘함');
  check("모르는 레벨이면 'no_level' — 아무 값이나 적지 않는다", r5.applied === false && r5.reason === 'no_level');

  /* 🔤 대소문자만 다른 계정이 실재한다(Kim/kim). NOCASE 로 넓히면 «둘 중 아무나» 집는다. */
  await M.applyPlacementLevel(env, 'Kim', 'A1');
  eq('대문자 계정만 정확히 맞춰 적었다', lv('Kim'), 'Lv 1');
  eq('  소문자 동명 계정은 안 건드렸다', lv('kim'), null);

  /* 💥 부르는 쪽이 «레벨테스트 채점» 이라 여기서 던지면 학생이 결과를 못 받는다. */
  const boom = { DB: { prepare: () => { throw new Error('boom'); }, exec: async () => { throw new Error('boom'); } } };
  let threw = false, r6 = null;
  try { r6 = await M.applyPlacementLevel(boom, 'mango1', 'B1'); } catch { threw = true; }
  check('DB 가 통째로 터져도 던지지 않는다', !threw && r6 && r6.reason === 'error');
}

/* ═══ C. 배정할 교재 목록 — 진짜 SQLite ══════════════════════════════ */
console.log('\n[ C. 실재하는 교재 목록 — 진짜 SQLite 에 돌려서 확인 ]');
if (!M) skip('번들 실패 — 교재 목록 검사 생략');
else {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE review_quizzes (textbook TEXT, level TEXT, active INTEGER)`);
  db.exec(`CREATE TABLE textbook_files (name TEXT, active INTEGER)`);
  db.exec(`CREATE TABLE zh_vocab (textbook TEXT)`);
  db.exec(`CREATE TABLE zh_passage (textbook TEXT)`);
  db.exec(`INSERT INTO review_quizzes VALUES ('BTS 1 001 (Welcome to school)','Lv 1',1),
                                             ('BTS 1 001 (Welcome to school)','Lv 1',1),
                                             ('다락원','Lv 3',1),
                                             ('꺼진 교재','Lv 2',0)`);
  db.exec(`INSERT INTO textbook_files VALUES ('[BTS Books] Slide1.JPG',1), ('[BTS Books] Slide2.JPG',1),
                                             ('[SIU BOOKS] a.jpg',1), ('[다락원 중국어 마스터 3] p.jpg',1),
                                             ('대괄호없는파일.jpg',1), ('[지워진책] x.jpg',0)`);
  db.exec(`INSERT INTO zh_vocab VALUES ('다락원')`);

  const list = await M.loadTextbookChoices(d1(db));
  /* ⚠️ 없는 키를 그대로 읽으면 하네스가 «실패» 를 말하지 못하고 예외로 죽는다.
     검사는 무슨 일이 있어도 끝까지 돌면서 결과를 세야 한다(변이시험에서 실제로 밟았다). */
  const raw = Object.fromEntries(list.map((x) => [x.name, x]));
  const by = new Proxy(raw, { get: (t, k) => (k in t ? t[k] : { quizzes: 0, files: 0, level: null, lang: '(없음)' }) });

  check('문항이 있는 교재와 라이브러리 묶음을 함께 준다',
    !!by['BTS 1 001 (Welcome to school)'] && !!by['SIU BOOKS'] && !!by['BTS Books'], JSON.stringify(list.map((x) => x.name)));
  eq('  문항 수를 센다', by['BTS 1 001 (Welcome to school)'].quizzes, 2);
  eq('  그 교재의 레벨도 함께 준다', by['BTS 1 001 (Welcome to school)'].level, 'Lv 1');
  eq('  라이브러리 페이지 수를 센다', by['BTS Books'].files, 2);
  check('active=0 은 세지 않는다', !raw['꺼진 교재'] && !raw['지워진책']);
  check('대괄호 없는 파일은 묶음으로 만들지 않는다', !raw['대괄호없는파일.jpg']);

  /* 🈶 영어 학생에게 중국어 교재를 배정하면 웜업·복습퀴즈에 병음이 섞여 나온다.
     ⛔ 이름을 보고 짐작하지 않는다 — 근거는 zh_vocab·zh_passage 에 실재하는가. */
  eq('중국어 교재를 표시한다', by['다락원'].lang, 'zh');
  eq('  라이브러리 쪽 긴 이름도 이어서 표시한다', by['다락원 중국어 마스터 3'].lang, 'zh');
  eq('  영어 교재는 en 그대로다', by['SIU BOOKS'].lang, 'en');

  check('문항이 있는 교재가 먼저 온다 (위에서부터 고르면 바로 먹는 교재가 된다)',
    list[0].quizzes > 0, JSON.stringify(list.slice(0, 3).map((x) => [x.name, x.quizzes])));

  // 한쪽 표가 없어도 나머지는 그대로 나와야 한다 — 통째로 던지면 배정 화면이 죽는다
  const db2 = new DatabaseSync(':memory:');
  db2.exec(`CREATE TABLE review_quizzes (textbook TEXT, level TEXT, active INTEGER)`);
  db2.exec(`INSERT INTO review_quizzes VALUES ('BTS 1 001','Lv 1',1)`);
  let threw2 = false, l2 = null;
  try { l2 = await M.loadTextbookChoices(d1(db2)); } catch { threw2 = true; }
  check('표가 하나 없어도 던지지 않고 나머지를 준다', !threw2 && l2 && l2.length === 1, threw2 ? 'threw' : JSON.stringify(l2));
}

/* ═══ D. 배선 — 화면·서버가 실제로 이어져 있는가 ══════════════════════ */
console.log('\n[ D. 배선 ]');
const admin = rd('cloudflare-deploy/src/api-admin.ts');

/* 🔒 /api/leveltest/diagnose 는 무인증 공개 경로다. 본문의 student_uid 로 적으면
   아무나 남의 학생 레벨을 바꾼다(CLAUDE.md 「본문에 적힌 «누구에게» 를 그대로 쓴다」). */
const diagStart = admin.indexOf("path === '/api/leveltest/diagnose'");
check('diagnose 핸들러를 찾았다', diagStart > 0);
const diagEnd = admin.indexOf('application_id: appId', diagStart);
const diagBody = diagStart > 0 && diagEnd > diagStart ? admin.slice(diagStart, diagEnd) : '';
check('채점 뒤 학생 명부에 레벨을 적는다', /applyPlacementLevel\(/.test(diagBody));
check('그 uid 는 «토큰으로 확인된» 것이다', /authUidGlobal\([^)]*\)/.test(diagBody) && /applyPlacementLevel\(\s*env[^,]*,\s*authedUid/.test(diagBody), diagBody.slice(-400));
check('⛔ 본문 uid 로 폴백하지 않는다 (폴백하면 구멍이 그대로 남는다)',
  !/applyPlacementLevel\([^)]*\b(authedUid\s*\|\|\s*uid|uid\s*\|\|)/.test(diagBody));

/* 📚 교재 목록 — 서버가 실재 이름을 주고 화면이 그것을 실제로 부르는가 */
const bulk = rd('cloudflare-deploy/public/js/adm-bulkbook.js');
check('서버가 ?library=1 일 때만 실재 목록을 계산한다',
  /searchParams\.get\('library'\)\s*===\s*'1'/.test(admin) && /loadTextbookChoices\(/.test(admin));
check('기존 items 응답은 그대로 둔다 (이 API 를 쓰는 화면이 다섯 곳이다)',
  /items:\s*rs\.results \|\| \[\]/.test(admin));
check('배정 화면이 ?library=1 로 부른다', /\/api\/admin\/textbooks\?library=1/.test(bulk));
check('배정 화면이 실재 목록(library)을 실제로 그린다', /j\.library/.test(bulk) && /optgroup/.test(bulk));
check('문항 수를 화면에 보여 준다 (0이면 AI 즉석 출제라 바로는 안 나온다)',
  /b\.quizzes/.test(bulk) && /b\.files/.test(bulk));
check("레벨 입력 안내가 'Lv' 형식이다 (review_quizzes.level 과 같은 표기)",
  /Lv 1|Lv 3/.test(bulk) && !/placeholder="예: A1"/.test(bulk));

/* 🎓 자가가입 화면 */
const su = rd('cloudflare-deploy/public/signup.html');
check('자가가입 화면이 서버 API 를 실제로 부른다', /fetch\('\/api\/student\/register'/.test(su));
/* ⚠️ 부정 검사(«이 글자가 없어야 한다»)는 반드시 주석을 벗긴 사본으로 판정한다 —
   「왜 그렇게 안 했는지」 적은 설명 주석이 자기 자신을 잡는다(실제로 한 번 잡혔다).
   ⛔ 블록주석을 정규식 한 줄로 지우면 안 된다(짝 없는 별표+슬래시 하나에 뒤가 통째로
      사라진다). 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripJsComments(src) {
  const out = []; let inBlock = false;
  for (let line of String(src).split('\n')) {
    if (inBlock) {
      const e = line.indexOf('*' + '/');
      if (e < 0) { out.push(''); continue; }
      line = line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const b = line.indexOf('/' + '*');
      if (b < 0) break;
      const e = line.indexOf('*' + '/', b + 2);
      if (e < 0) { line = line.slice(0, b); inBlock = true; break; }
      line = line.slice(0, b) + line.slice(e + 2);
    }
    out.push(line.replace(/^[ \t]*\/\/.*$/, ''));
  }
  return out.join('\n');
}
const suCode = stripJsComments(su);
check("성공 판정을 «성공이라고 말했는가»(d.ok === true)로 한다",
  /d\.ok === true/.test(suCode) && !/d\.ok === false/.test(suCode));
check('비밀번호를 반드시 받는다 (지금 학생 29,462명 중 비번 설정자 1명)',
  /sg-pw2/.test(su) && /password:/.test(su));
check('로그인과 같은 키에 저장한다 (mangoi_logged_user + mango_token)',
  /setItem\('mango_token'/.test(su) && /setItem\('mangoi_logged_user'/.test(su));

/* 📱 폰 키보드가 아이디를 대문자로 바꾸거나 딴 낱말로 고치면 로그인이 깨진다 */
const uidInput = (su.match(/<input id="sg-uid"[^>]*>/) || [''])[0];
check('아이디 칸에 autocapitalize·autocorrect·spellcheck 를 모두 껐다',
  /autocapitalize="off"/.test(uidInput) && /autocorrect="off"/.test(uidInput) && /spellcheck="false"/.test(uidInput), uidInput);

/* 🌐 두 엔진 모두 대비 — 관리자는 document, 공용 엔진은 window 에서 쏜다 */
check('언어 전환을 window·document 양쪽에서 듣는다',
  /window\.addEventListener\('mangoi:lang-changed'/.test(su) && /document\.addEventListener\('mangoi:lang-changed'/.test(su));
check('⛔ input 에 data-ko/data-en 을 달지 않았다 (그 둘은 textContent 를 갈아끼운다)',
  !/<input[^>]*data-(ko|en)=/.test(su));
/* 🔴 그 두 속성 «안» 에 태그를 넣어도 안 된다 — 엔진이 textContent 로 넣으므로 «<b>» 가
   글자 그대로 화면에 드러난다. 2026-09-02 에 실제로 밟았고 「input 만」 보던 위 검사는
   <p> 를 놓쳤다. 화면 전체에서 본다. */
const tagInI18n = (su.match(/data-(?:ko|en)="[^"]*<[a-zA-Z]/g) || []);
check(`⛔ data-ko/data-en 값 안에 HTML 태그가 없다${tagInI18n.length ? ' — ' + tagInI18n.join(' / ') : ''}`,
  tagInI18n.length === 0);

/* 🏠 공용 전역바가 제목 글자를 덮지 않게 자리를 «재서» 비운다(숫자를 박으면 또 어긋난다) */
/* ⚠️ 「JS 가 값을 넣는가」만 보면 헛돈다 — CSS 가 그 값을 «쓰는지» 를 따로 봐야 한다
   (변이시험에서 CSS 규칙만 지웠는데 통과했다). 두 쪽을 각각 확인한다. */
check('상단 줄이 그 폭만큼 자리를 비운다 (CSS)', /\.top\{[^}]*padding-right:\s*calc\([^}]*--gbar-w/.test(su));
check('  그 값을 전역바에서 얻는다 (JS)', /--gbar-w/.test(suCode) && /mangoi-global-bar/.test(suCode));
check('  그 폭을 실제로 재서 넣는다 (고정 숫자가 아니다)', /getBoundingClientRect\(\)\.width/.test(suCode));
check('  ⛔ 상주 MutationObserver·setInterval 로 지키지 않는다 (홈을 멎게 한 전력)',
  !/new MutationObserver/.test(suCode) && !/setInterval/.test(suCode));

/* 🈶 한자 글꼴 검사가 <style> 안 CSS 주석의 홑낫표를 세므로 그 안에서는 « » 를 쓴다 */
const styleBlock = (su.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
check('<style> 안에 CJK 홑낫표가 없다 (983KB 한자 폰트 오판 방지)', !/[「」]/.test(styleBlock));

/* 🗣 배선했는데 화면이 침묵하면 아무도 모른다 — 이 저장소가 반복해서 밟은 사고다. */
const lt = rd('cloudflare-deploy/public/level-test-ai.html');
check('레벨테스트 결과 화면이 배정 결과(placement)를 읽는다', /d\.placement/.test(lt));
check('  «저장됐다»·«이미 있다»·«로그인하면» 세 경우를 구분해 말한다',
  /pl\.applied/.test(lt) && /already_set/.test(lt) && /no_uid/.test(lt));
check('  서버가 준 레벨 문자열을 이스케이프해서 그린다', /esc\(pl\.level\)/.test(lt));

/* 🗺 「있는데 아무도 모르는 화면」이 되지 않게 */
const map = rd('cloudflare-deploy/public/admin/site-structure-map.html');
check('사이트 지도에 등록돼 있다', /href="\/signup\.html"/.test(map));

/* ═══ E. 야간 동기화가 그 값을 지우지 않는가 — 진짜 SQLite 로 확인 ════════════
   🔴 이 검사가 없으면 이 작업 전체가 무효가 된다. importCafe24Students 는 매일 밤 03:00 KST 에
      카페24 학생 «전원» 을 DELETE 하고 다시 넣는다. 보존 조건에 level·textbook 이 없으면
      낮에는 멀쩡히 보이고 다음 날 조용히 «미배정» 으로 돌아온다(에러 없음).
   ⛔ 「그 문자열이 있는가」로 보지 않는다 — SQL 을 소스에서 오려 내 실제로 돌린다. */
console.log('\n[ E. 야간 동기화 보존 — 진짜 SQLite 에 돌려서 확인 ]');
{
  const sync = rd('cloudflare-deploy/src/cafe24-sync.ts');
  const delSql = (sync.match(/DELETE FROM students_erp[\s\S]*?(?=`)/) || [''])[0];
  check('야간 동기화의 DELETE 문을 소스에서 오려 냈다', delSql.length > 60, delSql.slice(0, 120));
  const sentinel = Number((sync.match(/CAFE24_STUDENT_SENTINEL\s*=\s*(\d+)/) || [])[1] || 0);
  check(`센티넬 값을 소스에서 읽었다 (${sentinel})`, sentinel > 0);

  if (delSql && sentinel) {
    const db = new DatabaseSync(':memory:');
    /* ⚠️ (2026-09-15) 이 fixture 는 «DELETE 가 읽는 칸» 을 전부 갖고 있어야 한다. 하나라도 빠지면
       `no such column` 이 나고, 그건 이 절의 판정이 아니라 **하니스 자체의 크래시**라
       아래 검사들이 통째로 사라진다(번호 세 칸이 보존 목록에 더해질 때 실제로 밟았다). */
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, created_at INTEGER,
      password_hash TEXT, parent_user_id TEXT, eval_band TEXT, level TEXT, textbook TEXT,
      parent_phone TEXT, student_phone TEXT, phone TEXT)`);
    // 카페24 학생(센티넬) 셋 — 레벨만 / 교재만 / 아무것도 없음
    db.exec(`INSERT INTO students_erp (user_id, created_at, level, textbook) VALUES
      ('c24_lv',   ${sentinel}, 'Lv 13', NULL),
      ('c24_book', ${sentinel}, NULL,    'BTS 1 001 (Welcome to school)'),
      ('c24_bare', ${sentinel}, NULL,    NULL)`);
    /* ⛔ 감싸지 않으면 «깔끔한 FAIL» 이 아니라 스택트레이스만 남고 그 아래 검사가 사라진다 —
       무엇이 깨졌는지 안 보인다(규칙서 2장 「하니스를 크래시시키지 마세요」). */
    let delRan = true;
    try { db.prepare(delSql).run(sentinel); }
    catch (e) { delRan = false; }
    check('오려 낸 DELETE 문이 이 fixture 에서 실제로 돈다', delRan,
      'no such column 이면 fixture 에 그 칸을 더할 것 — 실제 students_erp 에는 있다');
    const alive = (u) => !!db.prepare(`SELECT 1 FROM students_erp WHERE user_id = ?`).get(u);
    /* ⚠️ DELETE 가 못 돌았으면 «아무도 안 지워졌기 때문에» 아래 둘이 ✅ 로 나온다 —
       「확인 안 한 것」이 「문제없음」으로 섞인다. 그때는 통과시키지 말고 건너뛴 것으로 센다. */
    if (!delRan) {
      skip('레벨이 적힌 카페24 학생은 밤에 안 지워진다 (DELETE 가 못 돌아 판정 불가)');
      skip('교재가 배정된 카페24 학생도 안 지워진다 (DELETE 가 못 돌아 판정 불가)');
    } else {
      check('레벨이 적힌 카페24 학생은 밤에 안 지워진다', alive('c24_lv'),
        '지워지면 다시 INSERT 될 때 level 이 NULL 이 된다 — 배정이 매일 밤 사라진다');
      check('교재가 배정된 카페24 학생도 안 지워진다', alive('c24_book'),
        '「📚 일괄 교재 배정」이 매일 밤 초기화된다');
    }
    check('  값이 없는 행은 예전대로 지워진다 (동기화가 멈추면 그것대로 사고다)', !alive('c24_bare'));
  }

  /* ⚠️ 보존 조건이 읽는 칸은 «지연 ALTER» 로 생긴다 — 없는 DB 에서는 DELETE 가
     no such column 으로 죽고 그 예외를 nightlyCafe24Refresh 가 삼켜 동기화가 조용히 멈춘다. */
  for (const col of ['level', 'textbook', 'parent_phone', 'student_phone', 'phone']) {
    check(`${col} 에 멱등 ALTER 가 DELETE 앞에 있다`,
      sync.indexOf(`ADD COLUMN ${col} TEXT`) > 0 &&
      sync.indexOf(`ADD COLUMN ${col} TEXT`) < sync.indexOf('DELETE FROM students_erp'));
  }
}

// ═══════════════ 결과 ═══════════════
console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패 (건너뜀 ${SKIP})`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach((f) => console.log('  - ' + f)); process.exitCode = 1; }
else console.log('🎉 학생 AI 온보딩 1단계 배선 전부 통과');
console.log('====================================================');

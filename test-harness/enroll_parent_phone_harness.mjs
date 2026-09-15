#!/usr/bin/env node
/**
 * 📞 enroll_parent_phone_harness — 수업 전 안내문자가 «받는 사람» 을 잃지 않는지
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * [무엇을 지키나 — 2026-09-10]
 *   수업 30분 전 리마인더(`lesson-reminder.ts`)는 살아 있는데 **한 통도 못 보내고 있었다.**
 *   실측: 최근 7일 671건의 수업을 정확히 찾아내고 발송 0건 · `students_erp` 29,485행의
 *   번호 칸 네 개가 전부 0건. 카페24 원본에 번호가 없고, 그 표에 손으로 넣어도
 *   매일 밤 03:00 KST 동기화의 UPSERT 가 `phone`·`parent_phone`·`student_phone` 을 덮는다
 *   (8월에 문자가 실제로 나갔던 체험계정 lt15·lt16·lt18 이 그렇게 번호를 잃었다).
 *
 *   그래서 «우리 화면에서 받은 번호» 는 `student_erp_override` 에 두고,
 *   읽는 정본 `phonesForStudent`(notify-contacts.ts)가 그것을 **먼저** 본다.
 *
 * [왜 문자열 검사로는 안 되나]
 *   함수도 값도 다 «있고» 틀릴 수 있는 것은 «무슨 답이 나오는가» 뿐이다 —
 *   수리 전에도 `--fast` 314건이 전부 초록이었다. 그래서 이 하니스는 정본을 **번들해서
 *   실제로 돌리고**, 저장 쪽은 **진짜 SQLite** 에 SQL 을 그대로 실행해 본다.
 *
 * [짝으로 두는 이유]
 *   «override 가 이긴다» 만 검사하면 «항상 override, 명부는 안 본다» 는 엉터리 수리도 통과한다.
 *   그래서 «override 가 없으면 명부로 떨어진다»(= 되던 것이 안 깨졌다)를 반드시 함께 본다.
 */

import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = join(CF, 'src');
const PUB = join(CF, 'public');

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** 주석을 벗긴 사본 — 부정 검사는 반드시 이걸로 한다(자기 설명 주석을 잡는 함정). */
function strip(t) {
  let out = '', inBlock = false;
  for (const line of String(t).split('\n')) {
    let l = line;
    if (inBlock) {
      const e = l.indexOf('*/');
      if (e < 0) { out += '\n'; continue; }
      l = l.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const s = l.indexOf('/*');
      if (s < 0) break;
      const e = l.indexOf('*/', s + 2);
      if (e < 0) { l = l.slice(0, s); inBlock = true; break; }
      l = l.slice(0, s) + l.slice(e + 2);
    }
    out += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}

console.log('\n📞 수업 전 안내문자 — 받는 사람 번호 배선\n');

const overrideTs = read(join(SRC, 'student-override.ts'));
const notifyTs = read(join(SRC, 'notify-contacts.ts'));
const reminderTs = read(join(SRC, 'lesson-reminder.ts'));
const adminTs = read(join(SRC, 'api-admin.ts'));
const coreJs = read(join(PUB, 'js', 'adm-core.js'));
const adminHtml = read(join(PUB, 'admin.html'));
const cssTxt = read(join(PUB, 'css', 'admin-inline-c.css'));

check('전제: 검사에 필요한 파일을 전부 읽었다',
  !!(overrideTs && notifyTs && reminderTs && adminTs && coreJs && adminHtml && cssTxt));

// ══════════════════════════════════════════════════════════════
//  A절 — 읽는 정본을 «실제로 돌려» 본다
// ══════════════════════════════════════════════════════════════
console.log('\n[A] 번호 정본 phonesForStudent — 실제 실행');

let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

let M = null;
if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (정적 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'phone-')), 'nc.mjs');
  let ok = true, err = '';
  try {
    esbuildApi.buildSync({
      entryPoints: [join(SRC, 'notify-contacts.ts')], bundle: true, format: 'esm',
      platform: 'neutral', outfile: out, logLevel: 'silent',
    });
  } catch (e) { ok = false; err = String(e?.message || e).slice(0, 120); }
  check('notify-contacts.ts 를 번들해 실제로 돌릴 수 있다', ok, err);
  if (ok) M = await import('file://' + out.replace(/\\/g, '/'));
}

/**
 * 가짜 D1 — **질의문을 보고 답을 바꾼다.**
 * ⚠️ 늘 같은 값을 돌려주면 「…한 경우에도」류 시나리오가 한 번도 안 만들어져 검사가 헛돈다.
 * ⚠️ `prepare()` 와 `prepare().bind()` **두 층 모두** first/all 을 둔다 — 정본이 bind 없이
 *    부르는 질의가 섞이면 그 줄에서 예외가 나고, 「못 찾는다」가 정답인 검사는 초록이 된다.
 */
function fakeDB({ ovRow = null, erpRow = null, throwOn = '' } = {}) {
  const answer = (sql) => {
    if (throwOn && sql.includes(throwOn)) throw new Error('boom:' + throwOn);
    if (sql.includes('student_erp_override')) return ovRow;
    if (sql.includes('students_erp')) return erpRow;
    return null;
  };
  const mk = (sql) => ({
    bind: () => ({ first: async () => answer(sql), all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }),
    first: async () => answer(sql),
    all: async () => ({ results: [] }),
    run: async () => ({ meta: {} }),
  });
  return { DB: { prepare: (sql) => mk(String(sql)), exec: async () => {}, batch: async () => [] } };
}

if (M?.phonesForStudent) {
  const P = M.phonesForStudent;

  // ① 우리가 받아 둔 번호가 명부보다 «먼저» — 이 배선이 없으면 발송은 영영 0건이다
  const r1 = await P(fakeDB({
    ovRow: { parent_phone: '01011112222', student_phone: '' },
    erpRow: { parent_phone: '01099998888', student_phone: '', phone: '' },
  }), 'heys');
  check('① override 에 번호가 있으면 그것을 쓴다', r1.parent === '01011112222', JSON.stringify(r1));

  // ② 짝 — override 가 없으면 «명부» 로 떨어진다(되던 것을 안 깬다).
  //    이 검사가 없으면 「항상 override, 명부는 안 본다」는 엉터리 수리도 통과한다.
  const r2 = await P(fakeDB({
    ovRow: null,
    erpRow: { parent_phone: '01099998888', student_phone: '01077776666', phone: '' },
  }), 'heys');
  check('② override 가 없으면 학생 명부 번호를 쓴다',
    r2.parent === '01099998888' && r2.student === '01077776666', JSON.stringify(r2));

  // ③ 칸 단위로 떨어진다 — 학부모만 받아 뒀으면 학생 번호는 명부에서
  const r3 = await P(fakeDB({
    ovRow: { parent_phone: '01011112222', student_phone: null },
    erpRow: { parent_phone: '01099998888', student_phone: '01077776666', phone: '' },
  }), 'heys');
  check('③ 칸 단위로 떨어진다(학부모=override · 학생=명부)',
    r3.parent === '01011112222' && r3.student === '01077776666', JSON.stringify(r3));

  // ④ 둘 다 없으면 빈 값 — «모르면 안 보낸다»(지어내지 않는다)
  const r4 = await P(fakeDB({ ovRow: null, erpRow: null }), 'nobody');
  check('④ 아무 데도 없으면 빈 값(번호를 지어내지 않는다)', r4.parent === '' && r4.student === '');

  // ⑤ 명부 조회가 깨져도 우리가 받아 둔 번호는 살아남는다
  const r5 = await P(fakeDB({
    ovRow: { parent_phone: '01011112222', student_phone: '' },
    throwOn: 'students_erp',
  }), 'heys');
  check('⑤ 명부 조회가 실패해도 override 번호는 살아남는다', r5.parent === '01011112222', JSON.stringify(r5));

  // ⑥ 반대쪽 fail-open — override 쪽이 깨져도 명부로 간다(리마인더가 통째로 멈추면 안 된다)
  const r6 = await P(fakeDB({
    throwOn: 'student_erp_override',
    erpRow: { parent_phone: '01099998888', student_phone: '', phone: '' },
  }), 'heys');
  check('⑥ override 조회가 실패해도 명부로 떨어진다(fail-open)', r6.parent === '01099998888', JSON.stringify(r6));

  // ⑦ 짧은 번호는 «없는 것» 으로 본다 — 세 곳(화면·서버·정본)이 같은 규칙이어야 한다
  const r7 = await P(fakeDB({ ovRow: { parent_phone: '1234', student_phone: '' }, erpRow: null }), 'heys');
  check('⑦ 9자리 미만은 번호로 치지 않는다', r7.parent === '', JSON.stringify(r7));
} else if (esbuildApi) {
  check('phonesForStudent 를 번들에서 찾았다', false, 'export 이름이 바뀌었나');
}

// ══════════════════════════════════════════════════════════════
//  B절 — 저장 SQL 을 «진짜 SQLite» 에 돌린다
// ══════════════════════════════════════════════════════════════
console.log('\n[B] setOverridePhones — 진짜 SQLite 에서');

const setFn = (overrideTs.match(/export async function setOverridePhones[\s\S]*?\n\}/) || [])[0] || '';
check('setOverridePhones 를 소스에서 찾았다', setFn.length > 200);

/* ⚠️ SQL 을 여기에 **베껴 적으면 안 된다.** 그러면 이 절은 소스를 한 번도 안 보고
   내가 적은 문자열만 검사한다 — 실제로 그렇게 짰다가, 소스에서 COALESCE 를 지우는 변이가
   34/34 로 그대로 통과했다(규칙서 2장 「검사에 설정표를 손으로 적으면 같은 일이 난다」).
   그래서 **정본 함수 안의 그 템플릿 리터럴을 오려 내 평가**한다. */
const sqlTpl = (() => {
  const i = setFn.indexOf('`INSERT INTO student_erp_override');
  if (i < 0) return '';
  const j = setFn.indexOf('`', i + 1 + 'INSERT INTO student_erp_override'.length);
  return j < 0 ? '' : setFn.slice(i, j + 1);
})();
check('저장 SQL 을 소스에서 오려 냈다(전제 — 못 오려 내면 아래 절은 헛돈다)', sqlTpl.length > 200);

if (setFn && sqlTpl) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, parent_phone TEXT, student_phone TEXT, phone_by TEXT, phone_at INTEGER)`);

  // 템플릿 안의 `${clear ? … }` 를 실제로 평가한다 — 소스가 바뀌면 이 SQL 도 바뀐다
  const sqlFor = (clearParent, clearStudent) => {
    /* 소스의 템플릿을 그대로 평가한다 — 두 칸을 «따로» 지울 수 있는지까지 이 SQL 이 정한다.
       인자를 안 주면 둘 다 true(= 옛 검사와 같은 «둘 다 지우기»). */
    const cp = clearParent === undefined ? true : clearParent;
    const cs = clearStudent === undefined ? cp : clearStudent;
    // eslint-disable-next-line no-new-func
    return new Function('clearParent', 'clearStudent', 'return ' + sqlTpl)(cp, cs);
  };
  let saveErr = '';
  const runSave = (uid, parent, student, clear = false) => {
    const now = Date.now();
    try {
      db.prepare(sqlFor(clear, clear)).run(uid, parent || null, student || null, 'test', now, now, now,
        clear ? (parent || null) : parent, clear ? (student || null) : student, 'test', now, now);
    } catch (e) {
      /* 크래시 대신 «깔끔한 FAIL» 로 — 스택만 남으면 무엇이 깨졌는지 안 보인다 */
      saveErr = String(e?.message || e).slice(0, 120);
    }
  };
  const get = (uid) => db.prepare(`SELECT parent_phone, student_phone FROM student_erp_override WHERE user_id=?`).get(uid) || {};

  runSave('heys', '01011112222', '');
  check('B-1 처음 저장하면 그 번호가 들어간다', get('heys').parent_phone === '01011112222', saveErr);

  // 학생 번호만 고치러 온 요청이 학부모 번호를 지우면, 그 뒤 문자가 조용히 한 통만 나간다
  runSave('heys', '', '01077776666');
  const g2 = get('heys');
  check('B-2 한 칸만 고쳐도 다른 칸은 안 지워진다',
    g2.parent_phone === '01011112222' && g2.student_phone === '01077776666', JSON.stringify(g2));

  runSave('heys', '01033334444', '');
  check('B-3 다시 저장하면 새 번호로 바뀐다', get('heys').parent_phone === '01033334444');

  runSave('heys', '', '', true);
  const g4 = get('heys');
  check('B-4 clear 로 부르면 지워진다(「아직 안 받음」과 「지웠다」를 가른다)',
    !g4.parent_phone && !g4.student_phone, JSON.stringify(g4));

  /* clear 가 «넘긴 칸만» 지우는지 — 학부모를 지우러 온 요청이 학생 번호까지 없애면
     그 뒤 문자가 조용히 한 통만 나간다(함정 대조가 잡은 자리). */
  runSave('heys2', '01011112222', '01077776666');
  const sqlClearParentOnly = sqlFor(true, false);
  const nowC = Date.now();
  try {
    db.prepare(sqlClearParentOnly).run('heys2', null, null, 'test', nowC, nowC, nowC,
      null, '', 'test', nowC, nowC);
  } catch (e) { saveErr = String(e?.message || e).slice(0, 120); }
  const g5 = get('heys2');
  check('B-5 학부모만 지우면 학생 번호는 남는다',
    !g5.parent_phone && g5.student_phone === '01077776666', JSON.stringify(g5) + ' ' + saveErr);

  db.close();
}

// ══════════════════════════════════════════════════════════════
//  C절 — «어디에 쓰는가». students_erp 에 쓰면 하룻밤이면 사라진다
// ══════════════════════════════════════════════════════════════
console.log('\n[C] 번호를 «동기화가 못 덮는 자리» 에 쓴다');

const setBody = strip(setFn);
check('C-1 저장 정본은 student_erp_override 에 쓴다', /INSERT INTO student_erp_override/.test(setBody));
check('C-2 저장 정본이 students_erp 를 건드리지 않는다',
  !/students_erp/.test(setBody),
  'students_erp 에 쓰면 읽는 정본(phonesForStudent)이 먼저 보는 표와 갈린다 — 게다가 카페24가 번호를 ' +
  '주기 시작하면 그 값이 이긴다(2026-09-15 전에는 카페24가 빈 값으로 매일 밤 덮었다)');

// 등록 API 도 마찬가지 — 그 라우트 안에서 students_erp 번호 칸을 UPDATE 하면 같은 사고다
/* ⚠️ 범위를 «길이» 로 자르면 안 된다 — 그 블록에 줄이 몇 개 늘기만 해도 뒷부분이 잘려
   멀쩡한 코드가 «없다» 로 나온다(실제로 밟았다: GET 에 코드를 더하자 POST 가 9000자 밖으로
   밀려 C-5·D-1 이 거짓 FAIL). **중괄호 짝**으로 그 라우트 블록만 잘라 낸다. */
function blockFrom(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const enrollRoute = blockFrom(adminTs, "if ((method === 'GET' || method === 'POST') && path === '/api/admin/enrollments')");
check('C-3 등록 라우트를 잘라 냈다(전제)', enrollRoute.length > 1000);
check('C-4 등록 라우트가 students_erp 의 번호 칸을 직접 UPDATE 하지 않는다',
  !/UPDATE\s+students_erp[\s\S]{0,200}(parent_phone|student_phone|\bphone\b)/i.test(strip(enrollRoute)));
check('C-5 등록 라우트가 번호를 override 정본에 맡긴다(복제 금지)',
  /setOverridePhones\s*\(/.test(strip(enrollRoute)));

// ══════════════════════════════════════════════════════════════
//  D절 — 조용한 실패 금지. 저장이 안 됐으면 화면이 말해야 한다
// ══════════════════════════════════════════════════════════════
console.log('\n[D] 저장 실패를 사람에게 말한다');

check('D-1 서버가 저장 결과를 응답에 싣는다(phone_saved)',
  /phone_saved/.test(strip(enrollRoute)));
const coreStrip = strip(coreJs);
check('D-2 단건 등록 화면이 그 결과를 읽는다',
  /d\.phone_saved\s*&&\s*d\.phone_saved\.ok\s*===\s*false/.test(coreStrip));
check('D-3 일괄 등록 화면도 읽는다(한쪽만 고치면 일괄만 조용히 실패한다)',
  /j\.phone_saved\s*&&\s*j\.phone_saved\.ok\s*===\s*false/.test(coreStrip));

// ══════════════════════════════════════════════════════════════
//  E절 — 리마인더가 그 정본을 실제로 부른다
// ══════════════════════════════════════════════════════════════
console.log('\n[E] 리마인더 배선');

const remStrip = strip(reminderTs);
check('E-1 리마인더가 번호 정본을 import 한다', /import\s*\{[^}]*phonesForStudent[^}]*\}\s*from\s*'\.\/notify-contacts'/.test(remStrip));
check('E-2 리마인더가 그 함수를 실제로 부른다', /await\s+phonesForStudent\s*\(/.test(remStrip));

// ══════════════════════════════════════════════════════════════
//  F절 — 화면 세 곳이 짝이다(머리글 · 행 · 좁은 화면 배치)
// ══════════════════════════════════════════════════════════════
console.log('\n[F] 표 칸이 서로 어긋나지 않는다');

check('F-1 행에 연락처 입력칸이 있다', /class="en-row-phone"/.test(coreJs));
check('F-2 그 값을 읽어 서버로 보낸다', /parent_phone:\s*parentPhone/.test(coreStrip) || /parent_phone:\s*r\.parent_phone/.test(coreStrip));
// 단건·일괄 두 경로가 모두 보내야 한다 — 한쪽만 보내면 일괄 등록만 번호를 잃는다
const postCount = (coreStrip.match(/parent_phone:\s*r\.parent_phone/g) || []).length;
check('F-3 단건·일괄 «두» 경로 모두 번호를 보낸다', postCount >= 2, `실제 ${postCount}곳`);

// 머리글 <th> 수 == 한 행이 그리는 <td> 수
const thead = (adminHtml.match(/<table id="en-multi-table"[\s\S]*?<\/thead>/) || [''])[0];
const thCount = (thead.match(/<th\b/g) || []).length;
const rowTpl = (coreJs.match(/tr\.innerHTML\s*=[\s\S]*?en-c-del[\s\S]*?';/) || [''])[0];
const tdCount = (rowTpl.match(/<td class="en-c /g) || []).length;
check('F-4 머리글 칸 수와 행 칸 수가 같다', thCount > 0 && thCount === tdCount, `th ${thCount} / td ${tdCount}`);
check('F-5 머리글에 연락처 열이 있다', /data-ko="학부모 연락처"/.test(thead));

/* 좁은 화면은 12칸 그리드다 — order 순서대로 span 을 쌓아 **줄마다 합이 정확히 12** 여야 한다.
   ⚠️ order 를 안 주면 기본값 0 이라 학생 아이디보다 앞으로 튀어나온다(실제로 밟은 함정). */
const spanRules = [...cssTxt.matchAll(/#en-multi-table tbody tr td\.en-c-([a-z]+)\s*\{\s*order:\s*(\d+);\s*grid-column:\s*span\s*(\d+);/g)]
  .map(m => ({ key: m[1], order: Number(m[2]), span: Number(m[3]) }))
  .sort((a, b) => a.order - b.order);
check('F-6 좁은 화면 배치 규칙을 읽었다(전제)', spanRules.length >= 9, `${spanRules.length}개`);
const phoneRule = spanRules.find(r => r.key === 'phone');
check('F-7 연락처 칸에 order 가 있다(없으면 맨 앞으로 튀어나온다)', !!phoneRule && phoneRule.order > 0);
let sum = 0, lines12 = true, bad = '';
for (const r of spanRules) {
  sum += r.span;
  if (sum === 12) sum = 0;
  else if (sum > 12) { lines12 = false; bad = `${r.key} 에서 ${sum}`; break; }
}
check('F-8 줄마다 span 합이 정확히 12 다', lines12 && sum === 0, bad || `남은 합 ${sum}`);

// ══════════════════════════════════════════════════════════════
//  H절 — 이미 등록된 학생에게도 번호를 넣을 수 있나
//    ⚠️ 등록 화면의 칸은 «앞으로 등록되는» 학생용이다. 이것이 없으면 지금 수업 중인
//       학생(테스트 명단 9명이 그렇다)에게는 안내문자를 영영 못 보낸다.
// ══════════════════════════════════════════════════════════════
console.log('\n[H] 이미 등록된 학생의 번호를 고치는 길');

const patchRoute = blockFrom(adminTs, "if (method === 'PATCH' && /^\\/api\\/admin\\/enrollments");
check('H-1 PATCH 라우트를 잘라 냈다(전제)', patchRoute.length > 500);
const patchStrip = strip(patchRoute);
check('H-2 연락처만 보내도 받는다(status 를 필수로 두지 않는다)',
  /!b\.status\s*&&\s*!_wantPhone/.test(patchStrip),
  'status 필수면 번호만 고칠 수가 없다');
check('H-3 둘 다 없으면 여전히 거절한다(빈 요청을 「저장됨」이라 하지 않는다)',
  /invalidBody\(\['status'\]\)/.test(patchStrip));
check('H-4 그 경로도 발송이 읽는 자리(override)에 적는다',
  /setOverridePhones\s*\(/.test(patchStrip),
  '신청서에만 적으면 문자는 그대로 안 나간다');
check('H-5 그 경로도 저장 결과를 응답에 싣는다', /phone_saved/.test(patchStrip));

/* ⛔ 강사 가드 — 이 두 경로는 `TEACHER_BLOCKED_PREFIXES` 에 없어 강사도 닿는다.
   GET 에 번호를 실으면 «남의 집 학부모 연락처가 한 화면에 모이고»,
   PATCH 를 열어 두면 강사가 아무 신청건의 «문자가 갈 번호» 를 바꿀 수 있다(돈이 나간다).
   ⚠️ 방향이 다르다 — 읽기는 «안 실어 주는 쪽», 쓰기는 «막는 쪽» 으로 실패해야 한다. */
check('H-10 목록이 강사에게는 번호를 안 실어 준다',
  /isTeacher/.test(strip(enrollRoute)) && /maySeePhones/.test(strip(enrollRoute)));
check('H-11 번호 수정은 강사를 막는다(403)',
  /isTeacher/.test(patchStrip) && /forbidden_teacher|forbiddenTeacherBody/.test(patchStrip));
check('H-12 역할을 못 물어보면 «막는 쪽» 으로 실패한다',
  /let mayEditPhone = false/.test(patchStrip) && /let maySeePhones = false/.test(strip(enrollRoute)),
  '기본값이 true 면 조회 한 번 실패에 그대로 새어 나간다');
/* 라벨이 「학부모 연락처」인데 학생 번호가 그 자리에 뜨면, 거기서 고칠 때 출처가 섞인다. */
check('H-13 목록 번호는 학생 번호로 폴백하지 않는다',
  !/notify_phone\s*=\s*p\?\.parent\s*\|\|\s*p\?\.student/.test(strip(enrollRoute)));

/* 목록이 «지금 발송이 읽는» 번호를 보여 주는가.
   ⚠️ `enrollments.parent_phone`(등록할 때 적은 값)을 그리면 두 값이 갈렸을 때 옛 값을 말한다. */
check('H-6 목록 API 가 override 의 실제 번호를 실어 보낸다',
  /loadOverridePhones\s*\(/.test(strip(enrollRoute)) && /notify_phone/.test(strip(enrollRoute)));
check('H-7 화면이 그 값을 그린다(신청서에 적힌 값이 아니라)',
  /it\.notify_phone/.test(coreStrip));
check('H-8 번호가 없으면 «문자 안 감» 이라고 말한다(빈칸으로 두지 않는다)',
  /문자 안 감/.test(coreJs) && /no SMS/.test(coreJs));
/* 인라인 onclick 이 부르는 이름은 언제나 «전역» 에서 찾는다 — 함수가 다른 함수 «안» 에
   선언돼 있으면 ReferenceError 인데 화면은 멀쩡해 보인다(규칙서 2장). 중괄호 깊이로 본다. */
const declIdx = coreJs.indexOf('async function enEditPhone');
let depth = 0;
for (let i = 0; i < declIdx; i++) {
  const ch = coreJs[i];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
}
check('H-9 enEditPhone 이 스크립트 최상위에 있다(인라인 onclick 이 찾을 수 있다)',
  declIdx > 0 && depth === 0, `깊이 ${depth}`);

// ══════════════════════════════════════════════════════════════
//  G절 — 바뀐 파일의 ?v= 를 올렸나 (immutable 캐시에 옛 파일이 남는다)
// ══════════════════════════════════════════════════════════════
console.log('\n[G] 자산 버전');
check('G-1 adm-core.js 를 부르는 ?v= 가 있다', /adm-core\.js\?v=\d+/.test(adminHtml));
check('G-2 admin-inline-c.css 를 부르는 ?v= 가 있다', /admin-inline-c\.css\?v=\d+/.test(adminHtml));


// ══════════════════════════════════════════════════════════════
//  I절 — 수강 만료 안내(7·3일 전)도 «우리가 받아 둔 번호» 를 본다 (2026-09-15)
//
//  실사고: 그 sweep 이 `students_erp` 를 직접 읽어 번호를 정했다. 우리 화면에서 받은 번호는
//  `student_erp_override` 에 있는데 그 경로가 정본을 지나지 않아 영영 못 봤다
//  (2026-09-15 실측: 그날 23건 시도 / 번호를 찾은 학생 1명).
//  ℹ️ 명부 칸이 «밤마다 덮이던» 것은 같은 날 #995 로 막혔다 — 그래도 정본을 지나는 것이 맞다
//     (override 는 «우리가 받은 값» 이고, 판정이 한 곳에 남는다).
//
//  이 절이 이렇게 생긴 이유(전부 실측으로 뚫렸던 것):
//   ⚠️ 「그 함수를 부르는가」로 물으면 부르고 «결과를 안 쓰는» 변이가 통과한다.
//   ⚠️ «override 만»·«명부만» 두 시나리오로는 부족하다 — 그 둘이 배타적이라 「누가 이기는가」가
//      원리상 안 검사되고, **정본을 폴백으로 내리는 변이**(= 이 수리를 통째로 되돌리는 것)와
//      **학생 번호 폴백 삭제**·**우선순위 뒤집기** 셋이 그대로 통과했다.
//   ⚠️ 가짜 D1 이 «표 이름» 만 보면 `WHERE user_id = ?` 를 지우는 변이(= 남의 번호로 문자가
//      나간다)가 통과한다 → 이 가짜는 **질의문을 보고** 답을 바꾼다.
// ══════════════════════════════════════════════════════════════
console.log('\n[I] 만료 안내 — 번호 판정 정본 배선');

const enrollTs = read(join(SRC, 'enroll-ops.ts'));

check('I-1 enroll-ops.ts 가 번호 정본을 import 한다',
  /import\s*\{[^}]*\bphonesForStudent\b[^}]*\}\s*from\s*'\.\/notify-contacts'/.test(strip(enrollTs)));

/* 함수 몸통을 «중괄호 짝» 으로 자른다 — 길이나 첫 `\n}` 로 자르면 엉뚱한 조각이 나온다.
   ⚠️ 문자열·주석 안의 중괄호는 추적하지 않는다. 지금 본문은 균형이 맞아 무해하고,
      어긋나면 아래 I-0·I-2 «전제» 검사가 조용한 통과를 막는다. */
function bodyOf(src, needle) {
  const i = src.indexOf(needle);
  if (i < 0) return '';
  const open = src.indexOf('{', src.indexOf(')', i));
  if (open < 0) return '';
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return '';
}
const sweepSrc = bodyOf(enrollTs, 'export async function runEnrollExpirySweep');
check('I-0 (전제) runEnrollExpirySweep 을 오려 냈다', sweepSrc.length > 300, `${sweepSrc.length}자`);

/* 타입 표기만 걷어내 그대로 돌린다(컴파일 없이). */
const sweepJs = sweepSrc
  .replace(/^export\s+/, '')
  .replace(/\(env:\s*any,\s*opts\?:\s*\{[^}]*\}\)/, '(env, opts)')
  .replace(/:\s*Promise<[^>]*>/g, '')
  /* ⚠️ 배열 표기를 «먼저» 지운다 — ` as any` 를 먼저 지우면 `(x as any[])` 가 `(x[])` 가 되어
        문법이 깨진다(그러면 이 절이 통째로 «실행 실패» 로 죽는다. 실제로 밟았다). */
  .replace(/\s+as\s+any\[\]/g, '')
  .replace(/:\s*any\[\]/g, '')
  .replace(/:\s*any\b/g, '')
  .replace(/\s+as\s+any\b/g, '');

const SW_UID = 'sweep_fixture_1';        // ⛔ 실계정·실명을 박지 말 것(선례: approval_policy_harness 의 mgr_jjw)
const SW_OTHER = '01099998888';          // «남의 학생» 번호 — 질의가 그 학생으로 좁히지 않으면 이것이 잡힌다

function runSweep(opt) {
  const { ovParent = '', ovStudent = '', erpParent = '', erpPhone = '', throwCore = false } = opt || {};
  const sent = [];
  let narrowed = null;
  const rows = [{ user_id: SW_UID, last_date: '2026-09-18', remaining: 2 }];
  const db = {
    prepare(sql) {
      const binds = [];
      const api = {
        bind: (...a) => { binds.push(...a); return api; },
        all: async () => ({ results: /FROM\s+class_schedules/i.test(sql) ? rows : [] }),
        first: async () => {
          if (/FROM\s+enroll_notify_log/i.test(sql)) return null;        // 아직 안 보냄
          if (/FROM\s+students_erp/i.test(sql)) {
            /* 그 학생으로 «좁히는» 질의만 그 학생 행을 받는다. 좁히지 않으면 실제 D1 은
               아무 행(=남의 학생)을 주므로 그 사고를 여기서 재현한다. */
            narrowed = /\buser_id\s*=\s*\?/i.test(sql) && binds.includes(SW_UID);
            if (!narrowed) return { ph: SW_OTHER, nm: '남의학생' };
            return { ph: (erpParent || erpPhone || null), nm: '테스트' };  // COALESCE 흉내
          }
          return null;
        },
        run: async () => ({}),
      };
      return api;
    },
    exec: async () => ({}),
  };
  const factory = new Function(
    'kstToday', 'daysBetween', 'ensureEnrollTables', 'sendPlainSms', 'siteUrl', 'phonesForStudent',
    `${sweepJs}\nreturn runEnrollExpirySweep;`
  );
  const fn = factory(
    () => '2026-09-15',
    () => 3,                                   // exp3 창에 들어오게
    async () => {},
    async (_e, phone) => { sent.push(String(phone)); return { ok: true }; },
    () => 'https://mangoi.ai/enroll.html',
    async () => { if (throwCore) throw new Error('boom'); return { parent: ovParent, student: ovStudent }; },
  );
  return fn({ DB: db }).then((out) => ({ out, sent, narrowed }));
}

const I = {};
let Ierr = '';
try {
  I.ovOnly  = await runSweep({ ovParent: '01011112222' });                                  // 우리가 받아 둔 번호만
  I.none    = await runSweep({});                                                            // 아무 데도 없다
  I.erpOnly = await runSweep({ erpParent: '01033334444' });                                  // 명부에만(옛 경로)
  I.thrown  = await runSweep({ throwCore: true, erpParent: '01055556666' });                 // 정본이 던진다
  I.both    = await runSweep({ ovParent: '01011112222', erpParent: '01033334444' });         // 둘 다 있다
  I.ovStu   = await runSweep({ ovStudent: '01077778888' });                                  // override 학생만
  I.ovBoth  = await runSweep({ ovParent: '01011112222', ovStudent: '01077778888' });         // 학부모+학생
  I.short   = await runSweep({ ovParent: '010111222', erpParent: '01033334444' });           // override 9자리
} catch (e) { Ierr = String(e?.message || e); }

const one = (r) => (r && r.sent.length === 1 ? r.sent[0] : JSON.stringify(r ? r.sent : null));

check('I-2 (전제) 함수가 실제로 돌았다', !Ierr, Ierr);
check('I-3 우리가 받아 둔 번호(override)로 문자가 나간다',
  one(I.ovOnly) === '01011112222', one(I.ovOnly));
check('I-4 (짝) 번호가 아무 데도 없으면 문자를 안 보낸다',
  !!I.none && I.none.sent.length === 0, one(I.none));
check('I-5 (짝) 명부에만 번호가 있어도 예전처럼 나간다',
  one(I.erpOnly) === '01033334444', one(I.erpOnly));
check('I-6 정본이 던져도 명부 번호로 떨어진다(fail-open)',
  one(I.thrown) === '01055556666', one(I.thrown));
/* ↓ 여기부터가 2026-09-15 함정 대조가 «뚫렸다» 고 실측한 자리들이다. 지우지 말 것. */
check('I-7 override 와 명부가 «둘 다» 있으면 override 가 이긴다 (정본을 폴백으로 내리는 변이 방지)',
  one(I.both) === '01011112222', one(I.both));
check('I-8 override 에 «학생» 번호만 있어도 그 번호로 나간다 (학생 폴백 삭제 변이 방지)',
  one(I.ovStu) === '01077778888', one(I.ovStu));
check('I-9 학부모·학생이 둘 다 있으면 «학부모» 가 이긴다 (우선순위 뒤집기 변이 방지)',
  one(I.ovBoth) === '01011112222', one(I.ovBoth));
check('I-10 명부 조회가 «그 학생» 으로 좁혀진다 — 남의 번호로 절대 안 나간다',
  !!I.none && I.none.narrowed === true
    && Object.values(I).every((r) => r && !r.sent.includes(SW_OTHER)),
  I.none ? `narrowed=${I.none.narrowed}` : '실행 실패');
check('I-11 override 가 9자리면 명부의 멀쩡한 번호로 떨어진다 (되던 것을 깨지 않는다)',
  one(I.short) === '01033334444', one(I.short));

/* ℹ️ 아직 정본을 «안» 보는 학부모 문자 경로 — FAIL 로 만들지 않는다(무관한 PR 이 전부 빨간불이 된다.
      선례: popup_open_return_harness). 대신 **이름을 찍어** 다음 사람이 보게 한다.
      ⛔ 「그 배선 누락은 닫혔다」로 읽히게 두지 말 것 — 닫힌 것은 아래 둘뿐이다. */
const NOT_YET = [
  ['api-lessons.ts', '수업일지 → /api/eval/create (강사 화면이 매 일지마다 부른다)'],
  ['api-pay.ts', '자동결제 사전안내(prebill) — 돈이 걸린 경로'],
  ['api-admin.ts', 'AI 초안 승인 → feedback-drafts/approve'],
  ['enroll-activate.ts', '등록 확정 안내 (화면 기본값 OFF)'],
  ['api-games.ts', 'microlearn 안내 (parent_phone 만)'],
];
console.log('  ℹ️ 아직 번호 정본을 안 보는 학부모 문자 경로 (사람 결정 대기 — FAIL 아님):');
for (const [f, what] of NOT_YET) {
  /* ⚠️ **주석을 벗긴 사본**으로 묻는다 — 그러지 않으면 「왜 아직 안 고쳤나」를 적은
        설명 주석이 잡혀 «이미 고쳐졌다» 고 거짓으로 찍힌다(2026-09-15 api-pay.ts 에서 실제로 밟았다).
     ⚠️ 그리고 «import 가 있는가» 가 아니라 **«부르는가»** 로 묻는다(안 쓰는 import 가 있다). */
  const src = strip(read(join(SRC, f)));
  const wired = /\bphonesForStudent\s*\(/.test(src);
  console.log(`     ${wired ? '✅ 이제 정본을 봅니다 — 이 목록에서 빼세요' : '·'} ${f} — ${what}`);
}

// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  결과: PASS ${pass} / FAIL ${fail}`);
if (fail) console.log('  실패:\n   - ' + fails.join('\n   - '));
console.log('════════════════════════════════════════\n');
if (fail) process.exit(1);

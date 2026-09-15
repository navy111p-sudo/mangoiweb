#!/usr/bin/env node
/**
 * 📞 student_contact_phone_override_harness — 「학생 상세 › 연락처·정보」 전화번호가
 * ═══════════════════════════════════════════════════════════════════════════
 *   카페24 야간 동기화에 지워지지 않는지 (2026-09-15)
 *
 * [무엇이 문제였나]
 *   `PATCH /api/admin/student/:uid/contact`(관리자 › 학생 상세 › 연락처·정보 편집)가
 *   student_phone·parent_phone 을 `students_erp` 에만 썼다. 그 표는 카페24가 정본이라
 *   `importCafe24Students()` 의 UPSERT 가 매일 밤 03:00 KST 에 그 두 칸을 카페24 값(대부분
 *   빈 값)으로 그대로 덮는다(cafe24-sync.ts `ON CONFLICT ... parent_phone = excluded.parent_phone`).
 *   9/10 파일럿테스트 학생들의 전화번호가 이렇게 사라졌다 — 이미 카페24에 실재하는 학생이라
 *   그 UPSERT 가 매일 밤 걸리고, 번호를 «지키는» 자리(student_erp_override)에는 이 화면이
 *   아무것도 안 적고 있었다. korean_name 은 같은 핸들러가 이미 override 에 함께 적어 살아남는데
 *   전화번호만 그 보호가 없었다(CLAUDE.md 2장 「학생 이름·계정을 D1 에서 고치거나 지웠는데
 *   다음날 원복됨」과 같은 뿌리).
 *
 *   같은 클래스의 «이미 등록된 학생» 갭은 enroll_parent_phone_harness.mjs H절이 «수강신청 수정»
 *   화면(`/api/admin/enrollments/:id` PATCH) 쪽으로 이미 한 번 닫아 두었다 — 이 하니스는 그
 *   형제(「학생 상세」 화면)를 닫는다. 둘은 서로 다른 라우트이므로 한쪽만 있으면 다른 화면에서
 *   그대로 재현된다.
 *
 * [왜 문자열 검사만으로는 모자란가]
 *   함수도 호출도 다 «있고» 틀릴 수 있는 것은 «어느 순서로 부르는가»·«무엇을 조건으로 쓰는가»
 *   뿐이다. 그래서 라우트 블록은 **중괄호 짝**으로 오려 내고, «저장 전에 실uid를 구했는가»는
 *   문자열 위치로, «어떤 body 가 왔을 때 무엇을 override 에 넘기는가»는 그 결정 조각만 따로
 *   오려 내 **실제로 평가**한다.
 *
 * 변이시험으로 실제 FAIL 확인(수리 전 상태로 되돌려 봄):
 *   Ⓐ setOverridePhones 호출을 지운다              → ②-2 FAIL
 *   Ⓑ _needsRealUid 조건에서 phoneTouched 를 뺀다   → ②-3 FAIL (realUid 가 항상 null)
 *   Ⓒ /full 이 override 값을 안 덮어쓴다             → ③-1 FAIL
 *   Ⓓ 응답에서 phone_override_warning 을 뺀다        → ②-5 FAIL
 *
 * 📌 (2026-09-15, trap-check 후속) — 처음 판은 parent·student 를 **한 번의 setOverridePhones
 *    호출**에 함께 넘겼다. setOverridePhones 의 `clear` 는 «필드별» 이 아니라 «전역 하나» 라,
 *    한쪽을 비워 clear:true 가 되면 다른 쪽에 9자리 미만 값(마스킹은 아닌, 그냥 짧은/오타 값)이
 *    남아 있을 때 그 필드도 «넘겨졌다» 는 이유만으로 같은 clear 취급을 받아 **멀쩡히 저장돼
 *    있던 값이 조용히 NULL 로 지워졌다**(진짜 SQLite 로 재현됨 — ④-7). 고침은 api-admin.ts
 *    의 기존 두 호출부(11494·11564행)처럼 **필드마다 따로** 부르는 것 — ②-7·④절이 이를 본다.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** 부정 검사는 주석을 벗긴 사본으로(설명 주석이 옛/새 낱말을 담고 있어 자기 주석을 잡는 함정 — CLAUDE.md 2장). */
function strip(t) {
  let out = '', inBlock = false;
  for (const line of String(t).split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const s = l.indexOf('/*'); if (s < 0) break;
      const e = l.indexOf('*/', s + 2);
      if (e < 0) { l = l.slice(0, s); inBlock = true; break; }
      l = l.slice(0, s) + l.slice(e + 2);
    }
    out += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}

/* 라우트 블록을 «중괄호 짝» 으로 자른다 — 길이로 자르면 옆 라우트에 코드가 늘 때
   정작 볼 부분이 창 밖으로 밀려 거짓 통과/거짓 FAIL 이 난다(CLAUDE.md 2장). */
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

console.log('\n📞 학생 상세 › 연락처·정보 — 전화번호가 카페24 야간 동기화에서 살아남는가\n');

const mango = read(join(SRC, 'api-mango.ts'));
const overrideTs = read(join(SRC, 'student-override.ts'));
const studentHtml = read(join(PUB, 'admin', 'student.html'));

check('전제: 검사에 필요한 파일을 전부 읽었다', !!(mango && overrideTs && studentHtml));

// ══════════════════════════════════════════════════════════════
//  ① 라우트를 오려 낸다 (전제 — 못 오려 내면 아래가 전부 헛돈다)
// ══════════════════════════════════════════════════════════════
console.log('\n[①] 라우트 블록 오려내기');

const contactRoute = blockFrom(mango, '// /api/admin/student/:uid/contact (PATCH — students_erp 업데이트)');
check('①-1 PATCH …/contact 라우트를 잘라 냈다', contactRoute.length > 800, `길이 ${contactRoute.length}`);

const fullRoute = blockFrom(mango, '// /api/admin/student/:uid/full — 한 번에 모든 탭 데이터 적재 (Promise.allSettled)');
check('①-2 GET …/full 라우트를 잘라 냈다', fullRoute.length > 800, `길이 ${fullRoute.length}`);

const contactStrip = strip(contactRoute);
const fullStrip = strip(fullRoute);

// ══════════════════════════════════════════════════════════════
//  ② 쓰는 쪽 — PATCH …/contact 가 override 에도 함께 적는가
// ══════════════════════════════════════════════════════════════
console.log('\n[②] 쓰는 쪽 — PATCH 가 student_erp_override 에도 적는가');

check('②-1 전화번호가 손에 닿았는지 따로 추적한다(phoneTouched)', /phoneTouched/.test(contactStrip));
check('②-2 정본 setOverridePhones 를 실제로 부른다(판정을 복제하지 않는다)',
  /setOverridePhones\s*\(/.test(contactStrip));

// realUid 를 구하는 조건이 이름뿐 아니라 전화번호도 봐야 한다 — 안 그러면 preRow 가 null 이라
// setOverridePhones 를 부를 realUid 자체가 없다.
const needsRealUidM = contactStrip.match(/const _needsRealUid\s*=\s*([^;]+);/);
check('②-3 「진짜 user_id 를 구하는」 조건이 전화번호 변경도 본다(이름만 보면 realUid 가 늘 null)',
  !!needsRealUidM && /phoneTouched/.test(needsRealUidM[1]), needsRealUidM && needsRealUidM[1]);

// preRow(SELECT) 가 UPDATE 보다 앞서야 한다 — UPDATE 뒤에는 이름이 바뀌어 못 찾을 수 있다(기존 주석의 그 사고).
{
  const iPreRow = contactStrip.indexOf('const preRow');
  const iUpdate = contactStrip.indexOf('UPDATE students_erp SET');
  const iSetOverride = contactStrip.indexOf('setOverridePhones(');
  check('②-4 순서: preRow 조회 → UPDATE → setOverridePhones (이 순서가 아니면 realUid 를 못 구한다)',
    iPreRow >= 0 && iUpdate > iPreRow && iSetOverride > iUpdate,
    `preRow=${iPreRow} UPDATE=${iUpdate} setOverridePhones=${iSetOverride}`);
}

check('②-5 저장 실패를 응답에 실어 화면이 말하게 한다(phone_override_warning)',
  /phone_override_warning/.test(contactStrip),
  '조용히 넘기면 「넣었으니 가겠지」로 믿는데 다음날 밤 지워진다(CLAUDE.md)');

// 마스킹된 표시값("010-1234-****")을 그대로 override 에 심으면 원본이 손상된다 —
// PII_GUARD 로 걸러진 값은 phoneTouched 에도 안 들어가야 한다(같은 continue 문 앞에서 걸린다).
{
  const guardIdx = contactStrip.indexOf('skippedMasked.push(k); continue;');
  const touchedIdx = contactStrip.indexOf('phoneTouched.parent = String');
  check('②-6 마스킹 값은 phoneTouched 로 넘어가기 전에 걸러진다(같은 루프에서 guard 가 먼저)',
    guardIdx >= 0 && touchedIdx > guardIdx, `guard=${guardIdx} touched=${touchedIdx}`);
}

// 🔴 (trap-check 지적) parent·student 를 «한 payload 에 합쳐서» 한 번만 부르면 안 된다 —
//   setOverridePhones 의 clear 는 전역 하나라, 그러면 한쪽을 지울 때 다른 쪽의 짧은/오타 값도
//   같은 clear 취급을 받아 조용히 지워진다. **필드마다 따로** 불러야 한다.
{
  const callCount = (contactStrip.match(/setOverridePhones\s*\(/g) || []).length;
  check('②-7 setOverridePhones 를 필드마다 «따로» 부른다(두 번 이상 — 한 번에 합치지 않는다)',
    callCount >= 2, `호출 ${callCount}회`);
  check('②-7b 한 호출의 payload 에 parent 와 student 를 «함께» 담지 않는다(교차 오염 방지)',
    !/\{\s*parent:\s*phoneTouched\.parent[^}]*student:/.test(contactStrip)
    && !/\{\s*student:\s*phoneTouched\.student[^}]*parent:/.test(contactStrip));
}

// ══════════════════════════════════════════════════════════════
//  ③ 읽는 쪽 — GET …/full 이 override 값을 «먼저» 보여주는가
// ══════════════════════════════════════════════════════════════
console.log('\n[③] 읽는 쪽 — GET …/full 화면 값이 문자 발송이 읽는 값과 같은가');

check('③-1 getOverridePhones 를 실제로 부른다', /getOverridePhones\s*\(/.test(fullStrip));
check('③-2 override 값이 있으면 erp.parent_phone 을 덮어 보여준다', /_erpRow\.parent_phone\s*=\s*_ovPhones\.parent/.test(fullStrip));
check('③-3 override 값이 있으면 erp.student_phone 을 덮어 보여준다', /_erpRow\.student_phone\s*=\s*_ovPhones\.student/.test(fullStrip));

// 짝 — override 가 없으면 원래 students_erp 값 그대로여야 한다(되던 것을 안 깬다).
// `if (_ovPhones.parent) …` 형태의 조건부라면 이미 만족한다(빈 값이면 매칭 실패라 원래 값이 남는다).
check('③-4 override 값이 없을 때는 그대로 두는 조건부다(무조건 덮어쓰지 않는다)',
  /if\s*\(_ovPhones\.parent\)/.test(fullStrip) && /if\s*\(_ovPhones\.student\)/.test(fullStrip));

// 순서 — 마스킹(maskRecordPII) 보다 앞에서 덮어써야 마스킹 규칙이 override 값에도 똑같이 걸린다.
{
  const iOv = fullStrip.indexOf('getOverridePhones(');
  const iMask = fullStrip.indexOf('maskRecordPII(_erpRow)');
  check('③-5 순서: override 병합이 PII 마스킹보다 앞이다(안 그러면 override 번호가 마스킹을 건너뛴다)',
    iOv >= 0 && iMask > iOv, `override=${iOv} mask=${iMask}`);
}

// fail-open — 조회 실패해도 화면이 죽으면 안 된다(카드 전체가 «학생을 찾을 수 없습니다» 로 보이던 사고와 같은 급).
// ⚠️ «fail-open» 이라는 낱말 자체는 설명 주석에만 있으므로 strip() 이 지운다 — 구조(try…catch 로
//    감쌌는가)로 물어야 한다. 원본(주석 포함) 텍스트에서 구조만 본다.
check('③-6 override 조회를 try/catch 로 감싼다(실패해도 학생 상세 전체가 죽으면 안 된다)',
  /try\s*\{[\s\S]{0,200}getOverridePhones\([\s\S]{0,300}\}\s*catch/.test(fullRoute));

// ══════════════════════════════════════════════════════════════
//  ④ 각 필드 호출의 payload 조립 — 실제로 평가한다 (parent 호출 · student 호출 «따로»)
// ══════════════════════════════════════════════════════════════
console.log('\n[④] 필드별 payload 조립 — 실제로 평가한다');

/* 각 호출의 두 번째 인자(삼항식)만 오려 낸다 — «phoneTouched.parent ? {...} : {...}」 모양.
   ⛔ 손으로 다시 적지 않는다 — 소스에서 그 식 그대로를 오려 내 평가한다. */
const parentExprM = contactRoute.match(/phoneTouched\.parent\s*\?\s*\{\s*parent:\s*phoneTouched\.parent\s*\}\s*:\s*\{\s*parent:\s*'',\s*clear:\s*true\s*\}/);
const studentExprM = contactRoute.match(/phoneTouched\.student\s*\?\s*\{\s*student:\s*phoneTouched\.student\s*\}\s*:\s*\{\s*student:\s*'',\s*clear:\s*true\s*\}/);
check('④-1 parent 호출의 payload 식을 소스에서 오려 냈다(전제)', !!parentExprM, contactRoute.length);
check('④-1b student 호출의 payload 식을 소스에서 오려 냈다(전제)', !!studentExprM, contactRoute.length);

function evalExpr(expr, phoneTouched) {
  // eslint-disable-next-line no-new-func
  return new Function('phoneTouched', 'return (' + expr + ');')(phoneTouched);
}

if (parentExprM && studentExprM) {
  try {
    const pp1 = evalExpr(parentExprM[0], { parent: '01011112222' });
    check('④-2 parent 에 실제 값이면 clear 없이 그 값만', pp1.parent === '01011112222' && !pp1.clear, JSON.stringify(pp1));

    const pp2 = evalExpr(parentExprM[0], { parent: '' });
    check('④-3 parent 를 비우면 그 호출만 clear:true(다른 필드는 이 식에 아예 없다)',
      pp2.parent === '' && pp2.clear === true && !('student' in pp2), JSON.stringify(pp2));

    const ss1 = evalExpr(studentExprM[0], { parent: '', student: '0103' });
    check('④-4 parent 가 비어 있어도 student 호출의 payload 에는 parent 가 안 실린다(교차 오염 없음)',
      ss1.student === '0103' && !('parent' in ss1) && !ss1.clear, JSON.stringify(ss1));
  } catch (e) {
    check('④-2~④-4 필드별 payload 를 실제로 평가했다', false, String(e?.message || e).slice(0, 200));
  }
}

// ══════════════════════════════════════════════════════════════
//  ④-5 «끝에서 끝까지» — 진짜 SQLite 로 trap-check 가 잡은 그 사고를 재현/대조한다
//      (한쪽을 비우고, 다른 쪽에 9자리 미만 «가비지» 값이 남아 있을 때)
// ══════════════════════════════════════════════════════════════
console.log('\n[④-5] 실제 SQLite — 「한쪽 비움 + 다른쪽 가비지」 시나리오');

try {
  const { DatabaseSync } = await import('node:sqlite');
  const setFn = (overrideTs.match(/export async function setOverridePhones[\s\S]*?\n\}/) || [])[0] || '';
  const sqlTplM = /`INSERT INTO student_erp_override[\s\S]*?`/.exec(setFn);
  check('④-5a setOverridePhones 의 저장 SQL 을 소스에서 오려 냈다(전제)', !!sqlTplM);

  if (sqlTplM) {
    const sqlTpl = sqlTplM[0];
    /* 소스의 `${clearParent ? … }` 를 실제로 평가한다 — normPhone 도 소스에서 그대로 오려 쓴다
       (손으로 다시 적으면 «내가 적은 규칙» 을 재는 꼴이 된다 — CLAUDE.md 2장). */
    const normPhoneM = /function normPhone\(v: any\): string \{[\s\S]*?\n\}/.exec(overrideTs);
    check('④-5b normPhone 도 소스에서 오려 냈다(전제)', !!normPhoneM);
    // TS 타입 표기만 벗긴다(값·조건은 한 글자도 안 건드린다) — string.replace 는 첫 일치만 바꾸므로
    // 앞선 치환이 뒤의 패턴을 어긋나게 만들 걱정이 없다.
    const normPhoneJs = (normPhoneM ? normPhoneM[0] : '').replace('(v: any)', '(v)').replace(': string {', ' {');
    let normPhone = (v) => String(v ?? '').replace(/[^0-9]/g, '');
    if (normPhoneJs) {
      const body = normPhoneJs.replace(/^function normPhone\(v\)\s*\{/, '').replace(/\}$/, '');
      try { normPhone = new Function('v', body); } catch { /* 폴백 유지 — 아래 ④-5b 가 이미 FAIL 을 남긴다 */ }
    }

    const sqlFor = (clearParent, clearStudent) =>
      new Function('clearParent', 'clearStudent', 'return ' + sqlTpl)(clearParent, clearStudent);

    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, parent_phone TEXT, student_phone TEXT, phone_by TEXT, phone_at INTEGER)`);
    const get = (uid) => db.prepare(`SELECT parent_phone, student_phone FROM student_erp_override WHERE user_id=?`).get(uid) || {};
    const now = () => Date.now();

    /* setOverridePhones(env, uid, {parent?, student?, clear?}, by) 를 «진짜와 같은 모양» 으로 흉내 낸다 —
       normPhone·SQL 은 소스에서 오려 왔으니 여기서 다시 만드는 것은 얕은 «호출 배선» 뿐이다. */
    function callSetOverridePhones(uid, phones) {
      const parent = normPhone(phones?.parent);
      const student = normPhone(phones?.student);
      const clear = !!phones?.clear;
      const clearParent = clear && phones?.parent !== undefined;
      const clearStudent = clear && phones?.student !== undefined;
      const t = now();
      db.prepare(sqlFor(clearParent, clearStudent)).run(
        uid, parent || null, student || null, 'test', t, t, t,
        clearParent ? (parent || null) : parent,
        clearStudent ? (student || null) : student,
        'test', t, t,
      );
    }

    // 시드 — 학부모·학생 번호 둘 다 유효하게 저장돼 있다.
    db.exec(`DELETE FROM student_erp_override`);
    db.prepare(`INSERT INTO student_erp_override (user_id, hidden, parent_phone, student_phone, created_at) VALUES (?,0,?,?,?)`)
      .run('pilot9', '01011112222', '01033334444', now());

    // ── (A) 옛 방식 — 한 번의 호출에 두 필드를 함께 담는다(trap-check 가 재현한 그 사고) ──
    callSetOverridePhones('pilot9', { parent: '', student: '0103', clear: true });
    const afterOld = get('pilot9');
    check('④-5c [대조] 옛 방식(한 번에 합침)은 실제로 학생 번호까지 지운다(이 검사가 사고를 재현하고 있다는 증거)',
      afterOld.parent_phone === null && afterOld.student_phone === null, JSON.stringify(afterOld));

    // 다시 시드
    db.exec(`DELETE FROM student_erp_override`);
    db.prepare(`INSERT INTO student_erp_override (user_id, hidden, parent_phone, student_phone, created_at) VALUES (?,0,?,?,?)`)
      .run('pilot9', '01011112222', '01033334444', now());

    // ── (B) 새 방식 — 필드마다 따로 부른다(지금 코드) ──
    callSetOverridePhones('pilot9', { parent: '', clear: true });      // parent 만 지운다
    callSetOverridePhones('pilot9', { student: '0103' });               // student 는 가비지값 — clear 안 씀
    const afterNew = get('pilot9');
    check('④-5d 새 방식(필드별 호출)은 학부모만 지워지고 학생 번호는 살아남는다(수리 확인)',
      afterNew.parent_phone === null && afterNew.student_phone === '01033334444', JSON.stringify(afterNew));

    db.close();
  }
} catch (e) {
  check('④-5 SQLite 재현 절 자체가 돌았다', false, String(e?.message || e).slice(0, 300));
}

// ══════════════════════════════════════════════════════════════
//  ⑤ 화면 — 저장 실패를 사람에게 말한다 + 안내 문구가 있다
// ══════════════════════════════════════════════════════════════
console.log('\n[⑤] 화면 — 실패를 조용히 넘기지 않는다');

check('⑤-1 화면이 phone_override_warning 을 읽는다', /j\.phone_override_warning/.test(studentHtml));
check('⑤-2 그 경고 문구가 사전에 있다(한/영)', /phoneOverrideWarn/.test(studentHtml));
check('⑤-3 연락처 편집 화면에 「여기서 저장하면 야간 동기화에도 안 지워진다」안내가 있다',
  /카페24 야간 동기화[\s\S]{0,20}지워지지 않습니다|survives the nightly Cafe24 sync/.test(studentHtml));

// ══════════════════════════════════════════════════════════════
//  ⑥ 정본을 복제하지 않았는가 — setOverridePhones/getOverridePhones 를 새로 만들지 않았다
// ══════════════════════════════════════════════════════════════
console.log('\n[⑥] 판정을 복제하지 않았다');

check('⑥-1 api-mango.ts 가 student-override.ts 에서 import 한다(자체 구현 아님)',
  /import\s*\{[^}]*getOverridePhones[^}]*setOverridePhones[^}]*\}\s*from\s*'\.\/student-override'/.test(strip(mango))
  || /import\s*\{[^}]*setOverridePhones[^}]*getOverridePhones[^}]*\}\s*from\s*'\.\/student-override'/.test(strip(mango)));
check('⑥-2 라우트 블록 안에서 INSERT INTO student_erp_override 를 직접 쓰지 않는다(전화번호는 setOverridePhones 위임)',
  !/INSERT INTO student_erp_override[\s\S]{0,120}parent_phone/.test(contactStrip));

// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  결과: PASS ${pass} / FAIL ${fail}`);
if (fail) console.log('  실패:\n   - ' + fails.join('\n   - '));
console.log('════════════════════════════════════════\n');
if (fail) process.exit(1);

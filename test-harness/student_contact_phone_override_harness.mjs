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
//  ④ 결정 로직을 실제로 평가한다 — 어떤 body 가 왔을 때 무엇을 override 에 넘기는가
// ══════════════════════════════════════════════════════════════
console.log('\n[④] payload 조립 — 실제로 평가한다');

const buildStart = contactRoute.indexOf('const payload: { parent?: string; student?: string; clear?: boolean } = {};');
const buildEndAnchor = 'if (clear) payload.clear = true;';
const buildEnd = contactRoute.indexOf(buildEndAnchor, buildStart);
const buildSnippet = (buildStart >= 0 && buildEnd >= 0)
  ? contactRoute.slice(buildStart, buildEnd + buildEndAnchor.length)
  : '';
check('④-1 payload 조립 조각을 오려 냈다(전제)', buildSnippet.length > 100, `길이 ${buildSnippet.length}`);

/* new Function 은 TS 를 모른다 — «const payload: {...} = {}」의 타입 표기만 벗겨 낸다.
   ⛔ 값·조건은 한 글자도 안 건드린다(그러면 검사가 소스가 아니라 내가 다시 쓴 코드를 재는 꼴이다). */
const buildSnippetJs = buildSnippet.replace(
  /const payload:\s*\{[^}]*\}\s*=\s*\{\};/,
  'const payload = {};'
);
check('④-1b 타입 표기를 벗겼다(전제 — 못 벗기면 아래는 SyntaxError 로 죽는다)',
  buildSnippetJs !== buildSnippet && buildSnippetJs.length > 0);

function buildPayload(phoneTouched) {
  // eslint-disable-next-line no-new-func
  return new Function('phoneTouched', buildSnippetJs + '\nreturn payload;')(phoneTouched);
}

try {
  const p1 = buildPayload({ parent: '01011112222' });
  check('④-2 학부모 번호만 실제 값이면 clear 없이 그 값만 넘긴다',
    p1.parent === '01011112222' && p1.student === undefined && !p1.clear, JSON.stringify(p1));

  const p2 = buildPayload({ parent: '' });
  check('④-3 학부모 칸을 비워서 저장하면 clear:true 로 넘긴다(지운다는 뜻)',
    p2.parent === '' && p2.clear === true, JSON.stringify(p2));

  const p3 = buildPayload({ parent: '01011112222', student: '01033334444' });
  check('④-4 둘 다 실제 값이면 둘 다 값 그대로, clear 는 없다',
    p3.parent === '01011112222' && p3.student === '01033334444' && !p3.clear, JSON.stringify(p3));

  const p4 = buildPayload({ parent: '01011112222', student: '' });
  check('④-5 한쪽만 지워도 clear:true(전체) — 그래도 실제 값이 있는 칸은 그대로 값이 실린다(setOverridePhones 가 그 값으로 직접 SET)',
    p4.parent === '01011112222' && p4.student === '' && p4.clear === true, JSON.stringify(p4));

  const p5 = buildPayload({});
  check('④-6 아무 것도 안 건드렸으면 빈 객체(그 필드는 override 에서도 손대지 않는다)',
    Object.keys(p5).length === 0, JSON.stringify(p5));
} catch (e) {
  // 크래시 대신 «깔끔한 FAIL» 로 — 스택만 남으면 무엇이 깨졌는지 안 보인다(CLAUDE.md 2장).
  check('④-2~④-6 payload 조립을 실제로 평가했다', false, String(e?.message || e).slice(0, 200));
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

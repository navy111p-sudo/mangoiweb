#!/usr/bin/env node
/**
 * 🏢 student_contact_org_override_harness — 「학생 상세 › 연락처·정보」 가맹점·소속이
 * ═══════════════════════════════════════════════════════════════════════════
 *   카페24 야간 동기화에 지워지지 않는가 + 「가입일」이 signup_date 대신 created_at 으로
 *   떨어지는가 (2026-09-15)
 *
 * [무엇이 문제였나 — 사장님 제보]
 *   「학생 정보 화면이야. 왼쪽에 가입일, 가맹점이 비어있어. 이 부분을 채워줘.」
 *
 *   ① 가입일 — `admin/student.html` 의 왼쪽 요약 카드·KPI 카드가 「가입일」에 `erp.signup_date`
 *      를 읽고 있었다. 그런데 같은 낱말 「가입일」을 쓰는 **관리자 학생 명부 표**는 이미 다른 열을
 *      본다 — `adm-core.js` 의 `data-sort-key="created_at" data-ko="가입일"`(및 그 정렬 기본값을
 *      정할 때 남긴 주석 「실제 표에 있는 열(가입일 = created_at)로 명시한다」). `signup_date` 는
 *      명부 표에서는 **다른 이름**(「수강 시작일」)으로 따로 있다 — 카페24 «수강 시작일» 이지
 *      「가입일」이 아니다. 그래서 카페24 원본에 signup_date 가 없는 학생은 명부에는 가입일이
 *      뜨는데(created_at 을 보므로) 상세 카드만 늘 «—» 였다 — «같은 라벨을 화면마다 다른 필드로
 *      읽는다» 는 이 저장소의 반복 사고와 같은 뿌리.
 *
 *   ② 가맹점 — 상세 카드는 `erp.franchise || erp.shop_name` 이미 최선의 폴백을 쓰고 있어 코드
 *      버그는 아니었다. 대신 **편집 후 지속성**이 없었다 — `franchise`·`shop_name` 은 카페24
 *      UPSERT 의 SET 목록에 있어(`cafe24-sync.ts`) 관리자가 상세 화면에서 손으로 채워 넣어도
 *      다음 날 밤 03:00 KST 에 그대로 지워진다. 같은 화면의 전화번호가 9/10 에 이미 겪은 것과
 *      정확히 같은 사고(student-override.ts 머리말)를 franchise·shop_name 칸에서 반복하게 된다.
 *
 * [고침]
 *   ① `admin/student.html` — 「가입일」 표시 두 곳(요약 카드·KPI 카드)을
 *      `erp.signup_date || fmtDay(erp.created_at)` 로 — signup_date 는 지우지 않는다(«수강 시작일»
 *      이라는 별개의 사실이라 다른 화면이 그 뜻으로 쓸 수 있다).
 *   ② `student-override.ts` — 전화번호와 같은 자리에 franchise·shop_name 칸을 추가하고
 *      `setOverrideOrgField(env, uid, field, value, by)` 로 **한 번에 한 필드만** 지정한다(전화번호가
 *      겪은 교차 오염 사고를 시그니처로 원천 차단). `applyStudentErpOverrides()` 가 korean_name 과
 *      «따로» 두 UPDATE 문으로 franchise·shop_name 을 각자 재적용한다. `api-mango.ts` 의 PATCH
 *      …/contact 와 GET …/full 이 전화번호와 같은 짝(쓰는 쪽·읽는 쪽)으로 이를 쓴다.
 *
 * 📌 (2026-09-15, origin/main 병합) — 전화번호 쪽이 병렬로 더 나은 설계(`_ovStu`/`_ovPar`/
 *    `_ovTouch`/`phoneKept`)로 다시 짜여 병합됐다. `typeof b.x === 'string'` 로 갈라야 하는 이유는
 *    이 화면(admin/student.html)의 폼이 빈 칸을 `value || null` 로 보내기 때문 — `String(v ?? '')`
 *    로 null 까지 ''로 뭉개면 «안 건드린 칸» 이 «지우려는 칸」으로 오판된다(전화번호 쪽에서 실제로
 *    있었던 결함). 가맹점·소속도 **같은 폼, 같은 직렬화**라 같은 함정이라 그 패턴을 그대로 따랐다 —
 *    `_ovFran`/`_ovShop`/`_orgTouch`/`org_kept`. ⛔ `String(b[k] ?? '').trim()` 로 되돌리지 말 것.
 *
 * [왜 문자열 검사만으로는 모자란가]
 *   함수도 호출도 다 «있고» 틀릴 수 있는 것은 «어느 순서로 부르는가»·«한 필드씩인가»·«실제로
 *   재적용이 되는가» 뿐이다. 그래서 라우트 블록은 **중괄호 짝**으로 오려 내고, «가입일 폴백» 은
 *   그 식을 오려 내 실제로 평가하며, `applyStudentErpOverrides()` 의 재적용 SQL 은 소스에서 그대로
 *   오려 내 **진짜 SQLite 에 돌린다**(손으로 다시 적으면 «내가 적은 규칙» 을 재는 꼴이 된다 —
 *   CLAUDE.md 2장).
 *
 * 변이시험으로 실제 FAIL 확인(수리 전 상태로 되돌려 봄):
 *   Ⓐ 「가입일」 폴백을 지우고 signup_date 만 보게 되돌린다      → ①-2 / ①-3 FAIL
 *   Ⓑ setOverrideOrgField 호출을 지운다                        → ②-2 FAIL
 *   Ⓒ preRow 조건에서 _orgTouch 를 뺀다                        → ②-3 FAIL
 *   Ⓓ applyStudentErpOverrides 에서 franchise 재적용 UPDATE 를 뺀다→ ⑤-2 FAIL(SQLite 실측)
 *   Ⓔ applyStudentErpOverrides 에서 shop_name 재적용 UPDATE 를 뺀다 → ⑤-3 FAIL(SQLite 실측)
 *   Ⓕ setOverrideOrgField 시그니처를 두 필드를 한 번에 받게 바꾼다  → ②-8 FAIL
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

/* 라우트·함수 블록을 «중괄호 짝» 으로 자른다 — 길이로 자르면 옆 코드가 늘 때
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

console.log('\n🏢 학생 상세 — 가입일 폴백 + 가맹점·소속이 카페24 야간 동기화에서 살아남는가\n');

const mango = read(join(SRC, 'api-mango.ts'));
const overrideTs = read(join(SRC, 'student-override.ts'));
const studentHtml = read(join(PUB, 'admin', 'student.html'));
const cafe24Sync = read(join(SRC, 'cafe24-sync.ts'));

check('전제: 검사에 필요한 파일을 전부 읽었다', !!(mango && overrideTs && studentHtml && cafe24Sync));

// ══════════════════════════════════════════════════════════════
//  ① 「가입일」이 created_at 폴백을 쓰는가 — 학생 명부 표와 같은 뜻
// ══════════════════════════════════════════════════════════════
console.log('\n[①] 가입일 — signup_date 가 비면 created_at 으로 떨어지는가');

check('①-1 학생 명부 표 자신이 「가입일 = created_at」을 정본으로 못 박아 두었다(전제 — 여기 맞춘다)',
  /가입일\s*=\s*created_at/.test(read(join(PUB, 'js', 'adm-core.js'))));

// renderCard() 의 qSignup 행
const cardRowM = studentHtml.match(/\[t\('qSignup'\),\s*([^\]]+)\]/);
check('①-2 요약 카드(renderCard)의 「가입일」 행이 signup_date || created_at 폴백이다',
  !!cardRowM && /erp\.signup_date/.test(cardRowM[1]) && /erp\.created_at/.test(cardRowM[1]),
  cardRowM && cardRowM[1]);

// renderExtension() 의 KPI purple 카드
const kpiRowM = studentHtml.match(/Sign-up[\s\S]{0,140}?<\/div><\/div>/);
check('①-3 KPI 카드(renderExtension)의 「Sign-up」 값도 signup_date || created_at 폴백이다',
  !!kpiRowM && /erp\.signup_date/.test(kpiRowM[0]) && /erp\.created_at/.test(kpiRowM[0]),
  kpiRowM && kpiRowM[0]);

check('①-4 signup_date 자체는 지우지 않았다(다른 화면이 «수강 시작일» 뜻으로 쓸 수 있어야 한다)',
  /erp\.signup_date/.test(studentHtml));

// 폴백 식을 실제로 평가 — signup_date 가 비었을 때 created_at 이 쓰이는지, 있을 때는 그대로인지.
if (cardRowM) {
  function fmtDayFake(ts) { if (!ts) return '—'; return 'D' + ts; }
  function evalRow(expr, erp) {
    // eslint-disable-next-line no-new-func
    return new Function('erp', 'fmtDay', 'return (' + expr + ');')(erp, fmtDayFake);
  }
  try {
    const v1 = evalRow(cardRowM[1], { signup_date: '2026-03-01', created_at: 1751500000000 });
    check('①-5 signup_date 가 있으면 그대로 쓴다(created_at 으로 덮지 않는다)', v1 === '2026-03-01', v1);
    const v2 = evalRow(cardRowM[1], { signup_date: '', created_at: 1751500000000 });
    check('①-6 signup_date 가 비면 created_at 폴백이 실제로 쓰인다', v2 === 'D1751500000000', v2);
    const v3 = evalRow(cardRowM[1], { signup_date: null, created_at: null });
    check('①-7 둘 다 없으면 「—」(fmtDay 의 자체 폴백)', v3 === '—', v3);
  } catch (e) {
    check('①-5~①-7 가입일 폴백 식을 실제로 평가했다', false, String(e?.message || e).slice(0, 200));
  }
}

// ══════════════════════════════════════════════════════════════
//  ② 쓰는 쪽 — PATCH …/contact 가 franchise·shop_name 을 override 에도 적는가
// ══════════════════════════════════════════════════════════════
console.log('\n[②] 쓰는 쪽 — PATCH 가 student_erp_override 에도 franchise·shop_name 을 적는가');

const contactRoute = blockFrom(mango, '// /api/admin/student/:uid/contact (PATCH — students_erp 업데이트)');
check('전제: PATCH …/contact 라우트를 잘라 냈다', contactRoute.length > 800, `길이 ${contactRoute.length}`);
const contactStrip = strip(contactRoute);

check('②-1 가맹점·소속이 손에 닿았는지 따로 추적한다(_ovFran/_ovShop/_orgTouch)',
  /_ovFran/.test(contactStrip) && /_ovShop/.test(contactStrip) && /_orgTouch/.test(contactStrip));
check('②-2 정본 setOverrideOrgField 를 실제로 부른다(판정을 복제하지 않는다)',
  /setOverrideOrgField\s*\(/.test(contactStrip));

// 🔴 (병합, 2026-09-15) null 을 빈 문자열로 뭉개지 않는가 — 전화번호 쪽이 겪은 바로 그 결함.
//    이 폼은 빈 칸을 `value || null` 로 보내므로 typeof 로 걸러야 한다.
check('②-1b _ovFran/_ovShop 는 typeof === \'string\' 으로 가른다(null 을 지우기로 오판하지 않는다)',
  /typeof\s+b\.franchise\s*===\s*'string'/.test(contactStrip) && /typeof\s+b\.shop_name\s*===\s*'string'/.test(contactStrip));
check('②-1c String(v ?? \'\').trim() 처럼 null 을 뭉개는 옛 방식으로 되돌아가지 않았다(가맹점·소속 자리)',
  !/franchise\s*=\s*String\(b\[k\]\s*\?\?/.test(contactStrip));

const preRowCondM = contactStrip.match(/const preRow\s*=\s*\(([^)]+)\)/);
check('②-3 preRow 를 구하는 조건이 가맹점·소속 변경도 본다(안 그러면 realUid 가 늘 null)',
  !!preRowCondM && /_orgTouch/.test(preRowCondM[1]), preRowCondM && preRowCondM[1]);

{
  const iPreRow = contactStrip.indexOf('const preRow');
  const iUpdate = contactStrip.indexOf('UPDATE students_erp SET');
  const iSetOverride = contactStrip.lastIndexOf('setOverrideOrgField(');
  check('②-4 순서: preRow 조회 → UPDATE → setOverrideOrgField (이 순서가 아니면 realUid 를 못 구한다)',
    iPreRow >= 0 && iUpdate > iPreRow && iSetOverride > iUpdate,
    `preRow=${iPreRow} UPDATE=${iUpdate} setOverrideOrgField=${iSetOverride}`);
}

check('②-5 저장 실패를 응답에 실어 화면이 말하게 한다(org_kept)',
  /org_kept/.test(contactStrip));

{
  const callCount = (contactStrip.match(/setOverrideOrgField\s*\(/g) || []).length;
  check('②-6 setOverrideOrgField 를 필드마다 «따로» 부른다(두 번 이상)', callCount >= 2, `호출 ${callCount}회`);
}

// franchise 호출과 shop_name 호출이 서로 다른 값을 넘기는지 — 한 호출에 두 필드를 합치지 않았는가.
// ⚠️ [^)]* 로 자르면 String(realUid) 안의 ')' 에서 끊긴다(실제로 밟음) — ')' 대신 줄 끝(';')까지 본다.
check('②-7 franchise 호출은 _ovFran 값만, shop_name 호출은 _ovShop 값만 넘긴다(교차 오염 없음)',
  /setOverrideOrgField\([^;]*'franchise'\s*,\s*_ovFran/.test(contactStrip)
  && /setOverrideOrgField\([^;]*'shop_name'\s*,\s*_ovShop/.test(contactStrip));

// ══════════════════════════════════════════════════════════════
//  ②-8 setOverrideOrgField 시그니처 — 한 번에 한 필드만 받는가 (전화번호 사고를 구조로 막는다)
// ══════════════════════════════════════════════════════════════
const setOrgFnM = overrideTs.match(/export async function setOverrideOrgField\(([\s\S]*?)\):/);
check('②-8 setOverrideOrgField 는 field 하나 + value 하나만 받는다(두 필드를 한 payload 로 받지 않는다)',
  !!setOrgFnM && /field:\s*'franchise'\s*\|\s*'shop_name'/.test(setOrgFnM[1]) && /value:\s*string/.test(setOrgFnM[1])
  && !/franchise\?:/.test(setOrgFnM[1]) && !/shop_name\?:/.test(setOrgFnM[1]),
  setOrgFnM && setOrgFnM[1].replace(/\s+/g, ' '));

// ══════════════════════════════════════════════════════════════
//  ③ 읽는 쪽 — GET …/full 이 override 값을 「먼저」 보여주는가
// ══════════════════════════════════════════════════════════════
console.log('\n[③] 읽는 쪽 — GET …/full 이 override 된 가맹점·소속을 보여주는가');

const fullRoute = blockFrom(mango, '// /api/admin/student/:uid/full — 한 번에 모든 탭 데이터 적재 (Promise.allSettled)');
check('전제: GET …/full 라우트를 잘라 냈다', fullRoute.length > 800, `길이 ${fullRoute.length}`);
const fullStrip = strip(fullRoute);

check('③-1 getOverrideOrg 를 실제로 부른다', /getOverrideOrg\s*\(/.test(fullStrip));
check('③-2 override 값이 있으면 erp.franchise 를 덮어 보여준다', /_erpRow\.franchise\s*=\s*_ovOrg\.franchise/.test(fullStrip));
check('③-3 override 값이 있으면 erp.shop_name 을 덮어 보여준다', /_erpRow\.shop_name\s*=\s*_ovOrg\.shop_name/.test(fullStrip));
check('③-4 override 값이 없을 때는 그대로 두는 조건부다(무조건 덮어쓰지 않는다)',
  /if\s*\(_ovOrg\.franchise\)/.test(fullStrip) && /if\s*\(_ovOrg\.shop_name\)/.test(fullStrip));

{
  const iOv = fullStrip.indexOf('getOverrideOrg(');
  const iMask = fullStrip.indexOf('maskRecordPII(_erpRow)');
  check('③-5 순서: override 병합이 PII 마스킹보다 앞이다', iOv >= 0 && iMask > iOv, `override=${iOv} mask=${iMask}`);
}

check('③-6 override 조회를 try/catch 로 감싼다(실패해도 학생 상세 전체가 죽으면 안 된다)',
  /try\s*\{[\s\S]{0,200}getOverrideOrg\([\s\S]{0,300}\}\s*catch/.test(fullRoute));

// ══════════════════════════════════════════════════════════════
//  ④ 화면 — 저장 실패를 사람에게 말한다
// ══════════════════════════════════════════════════════════════
console.log('\n[④] 화면 — 실패를 조용히 넘기지 않는다');

check('④-1 화면이 org_kept 를 읽는다', /j\.org_kept\s*===\s*false/.test(studentHtml));
check('④-2 그 경고 문구가 사전에 있다(한/영)', /orgNotKept:\{ko:/.test(studentHtml));
// 짝 — 앞만 보면 «언제나 경고» 도 통과한다. 가맹점·소속을 안 고친 저장(org_kept=null)은 조용해야 한다.
check('④-3 가맹점·소속을 안 고친 저장(org_kept=null)에는 경고하지 않는다', !/j\.org_kept\s*!==\s*true/.test(studentHtml));

// ══════════════════════════════════════════════════════════════
//  ⑤ 재적용 — 진짜 SQLite 로 「야간 동기화 뒤 되살아나는가」를 재현한다
// ══════════════════════════════════════════════════════════════
console.log('\n[⑤] 실제 SQLite — applyStudentErpOverrides() 가 franchise·shop_name 을 각자 되살리는가');

try {
  const { DatabaseSync } = await import('node:sqlite');
  const applyFnM = overrideTs.match(/export async function applyStudentErpOverrides[\s\S]*?\n\}\n/);
  check('⑤-1 applyStudentErpOverrides 를 소스에서 오려 냈다(전제)', !!applyFnM);

  if (applyFnM) {
    // korean_name·franchise·shop_name 세 UPDATE 문을 각각 그대로 오려 쓴다(손으로 다시 적지 않는다).
    const nameSql = (applyFnM[0].match(/UPDATE students_erp\s+SET korean_name[\s\S]*?korean_name IS NOT NULL AND TRIM\(korean_name\) <> ''\)/) || [])[0];
    const franSql = (applyFnM[0].match(/UPDATE students_erp\s+SET franchise[\s\S]*?franchise IS NOT NULL AND TRIM\(franchise\) <> ''\)/) || [])[0];
    const shopSql = (applyFnM[0].match(/UPDATE students_erp\s+SET shop_name[\s\S]*?shop_name IS NOT NULL AND TRIM\(shop_name\) <> ''\)/) || [])[0];
    check('⑤-1b 세 UPDATE 문(이름·franchise·shop_name)을 각각 오려 냈다(전제)',
      !!nameSql && !!franSql && !!shopSql,
      `name=${!!nameSql} fran=${!!franSql} shop=${!!shopSql}`);

    if (nameSql && franSql && shopSql) {
      const db = new DatabaseSync(':memory:');
      db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT, franchise TEXT, shop_name TEXT, created_at INTEGER)`);
      db.exec(`CREATE TABLE student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, franchise TEXT, shop_name TEXT, org_by TEXT, org_at INTEGER)`);

      // 카페24가 «전부 지워 놓은」 상태를 흉내낸다 — 세 학생 모두 franchise·shop_name 이 NULL.
      db.exec(`
        INSERT INTO students_erp (user_id, korean_name, username, franchise, shop_name, created_at) VALUES
          ('u_fran_only', '김가맹', '김가맹', NULL, NULL, 1751500000000),
          ('u_shop_only', '이소속', '이소속', NULL, NULL, 1751500000000),
          ('u_untouched', '박무관', '박무관', '카페24지사', '카페24학원', 1751500000000);
      `);
      // 관리자가 각각 다른 필드만 지정해 둔 상태 — franchise 만 지정한 학생, shop_name 만 지정한 학생.
      db.exec(`
        INSERT INTO student_erp_override (user_id, hidden, franchise, shop_name, created_at) VALUES
          ('u_fran_only', 0, '강남지사', NULL, 1),
          ('u_shop_only', 0, NULL, '망고아이 서초센터', 1);
      `);

      // 세 UPDATE 문을 소스 그대로 실행 — 손으로 다시 쓰지 않는다(정본을 실제로 돈다).
      db.exec(nameSql);
      db.exec(franSql);
      db.exec(shopSql);

      const rowFran = db.prepare(`SELECT franchise, shop_name FROM students_erp WHERE user_id='u_fran_only'`).get();
      check('⑤-2 franchise 만 지정한 학생 — franchise 는 되살아나고 shop_name 은 여전히 비어 있다(카페24 값)',
        rowFran.franchise === '강남지사' && rowFran.shop_name === null, JSON.stringify(rowFran));

      const rowShop = db.prepare(`SELECT franchise, shop_name FROM students_erp WHERE user_id='u_shop_only'`).get();
      check('⑤-3 shop_name 만 지정한 학생 — shop_name 은 되살아나고 franchise 는 여전히 비어 있다(교차 오염 없음)',
        rowShop.shop_name === '망고아이 서초센터' && rowShop.franchise === null, JSON.stringify(rowShop));

      const rowUn = db.prepare(`SELECT franchise, shop_name FROM students_erp WHERE user_id='u_untouched'`).get();
      check('⑤-4 지정하지 않은 학생은 카페24 값 그대로다(무관한 행을 건드리지 않는다)',
        rowUn.franchise === '카페24지사' && rowUn.shop_name === '카페24학원', JSON.stringify(rowUn));

      db.close();
    }
  }
} catch (e) {
  check('⑤ SQLite 재현 절 자체가 돌았다', false, String(e?.message || e).slice(0, 300));
}

// ══════════════════════════════════════════════════════════════
//  ⑥ 스키마 — 카페24 UPSERT 가 franchise·shop_name 을 덮는다는 전제가 지금도 맞는가
// ══════════════════════════════════════════════════════════════
console.log('\n[⑥] 전제 — cafe24-sync.ts 가 franchise·shop_name 을 실제로 UPSERT 하는가(이 사고의 원인)');

check('⑥-1 cafe24-sync.ts 의 UPSERT SET 목록에 franchise 가 있다(그래서 override 가 필요하다)',
  /franchise\s*=\s*excluded\.franchise/.test(cafe24Sync));
check('⑥-2 cafe24-sync.ts 의 UPSERT SET 목록에 shop_name 이 있다', /shop_name\s*=\s*excluded\.shop_name/.test(cafe24Sync));
check('⑥-3 마지막 페이지에서 applyStudentErpOverrides 를 부른다(붙이는 쪽↔읽는 쪽 순서가 지켜진다)',
  /if\s*\(done\)[\s\S]{0,60}applyStudentErpOverrides\(env\)/.test(cafe24Sync));

// ══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  결과: PASS ${pass} / FAIL ${fail}`);
if (fail) console.log('  실패:\n   - ' + fails.join('\n   - '));
console.log('════════════════════════════════════════\n');
if (fail) process.exit(1);

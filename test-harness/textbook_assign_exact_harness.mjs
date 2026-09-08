// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🎯 교재 배정 «그 학생만» 정확일치 — 소스의 SQL 을 오려 내 진짜 SQLite 에 돌린다
   (2026-09-08 신설)

   [왜 필요한가] 이 입구가 하는 일은 운영 D1 의 students_erp 를 UPDATE 하는 것이다.
   조건이 한 글자만 헐거워도 «그 학생 한 명» 이 «수백 명» 이 되는데, 에러는 안 난다
   (2026-09-08 실측: 학생 29,485명이 **전원 미배정** 이라 only_empty 가 아무것도 못 걸러 준다).

   ⚠️ 문자열로 「그 조건이 있는가」만 보면 헛돈다 — LIKE 로 바꿔도 글자는 그대로 남는다.
      **소스에서 조건절과 바인드 조립을 오려 내 진짜 SQLite 에 돌려** 무엇이 걸리는지 센다.
   ⚠️ 「남의 것은 안 걸린다」만 넣지 않는다 — «그 학생은 제대로 걸린다» 를 짝으로 둔다.
      한쪽만 두면 «아무것도 안 걸리는 코드» 가 통과한다(CLAUDE.md 2장).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-admin.ts'), 'utf8');

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  ✅ ' + n); }
  else { FAIL++; console.log('  ❌ ' + n + (why ? '  →  ' + why : '')); }
};

/* ── ⓪ 소스에서 «진짜로» 오려 냈는가 ────────────────────────────────────────
   ⚠️ 이 절이 없으면, 오려내기가 헛돌 때 아래 검사들이 «내가 적어 둔 값» 만 보고
      전부 통과한다(CLAUDE.md 2장 「자기가 새로 만든 상수를 잡아 통과」). */
console.log('\n── ⓪ 정본을 실제로 읽었는가 ─────────────────────────');
const COND = (SRC.match(/if \(userIds\.length\) \{ conds\.push\(`([^`]+)`\)/) || [])[1];
check('정확일치 조건절을 소스에서 오려 냈다', !!COND, String(COND));
const BINDEXPR = (SRC.match(/binds\.push\((',' \+ userIds\.join\([^)]*\) \+ ',')\)/) || [])[1];
check('   바인드 조립도 오려 냈다', !!BINDEXPR, String(BINDEXPR));
/* ⚠️ 바인드 한도 — IN (?,?,…) 로 펴면 D1 100개 제한에 걸리고 d1_bind_limit_harness 가 FAIL 낸다 */
/* ⚠️ 게이트의 «첫 줄» 을 앵커로 잡는다 — 배열 판정이 rawIds 선언 «앞» 에 있으므로
   rawIds 부터 자르면 그 줄이 빠져 검사가 조용히 헛돈다(실제로 한 번 그랬다). */
const GATE_START = 'if (b.user_ids != null && !Array.isArray(b.user_ids))';
const GATE_END = "if (userIds.some(v => v.indexOf(',') >= 0)) return json({ ok: false, error: 'invalid_user_ids' }, 400);";
const _gs = SRC.indexOf(GATE_START), _ge = SRC.indexOf(GATE_END);
const gateSrc = (_gs >= 0 && _ge > _gs) ? SRC.slice(_gs, _ge + GATE_END.length) : '';
check('   입구 게이트도 오려 냈다', !!gateSrc && /too_many_user_ids/.test(gateSrc), String(gateSrc).slice(0, 60));
/* ⚠️ 바인드 한도 — IN (?,?,…) 로 펴면 D1 100개 제한에 걸린다. 조건절 전체를 본다. */
const ASSIGN_BLOCK = SRC.slice(SRC.indexOf("path === '/api/admin/students/bulk-assign-textbook'"), SRC.indexOf('return json({ ok: true, updated, targets'));
/* ⛔ 부정 검사는 «주석을 벗긴 사본» 으로 판정한다 — 안 그러면 「왜 안 쓰는지」 적어 둔
   설명 주석이 그대로 걸려 FAIL 난다(CLAUDE.md 2장 — 여기서 실제로 한 번 밟았다).
   ⚠️ 블록주석을 정규식 한 줄로 지우지 않는다 — 문자열 속 «별표+슬래시» 하나에 그 뒤가
      통째로 사라진다(같은 장). 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripComments(t) {
  let inBlock = false;
  return t.split('\n').map(line => {
    let out = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (b >= 0 && (l < 0 || b < l)) { out += line.slice(i, b); inBlock = true; i = b + 2; }
        else if (l >= 0) { out += line.slice(i, l); i = line.length; }
        else { out += line.slice(i); i = line.length; }
      }
    }
    return out;
  }).join('\n');
}
check('   자리표시자를 펴지 않는다 (map(() => \'?\') 없음)', !/map\(\(\)\s*=>\s*'\?'\)/.test(stripComments(ASSIGN_BLOCK)));

if (!COND || !BINDEXPR || !gateSrc) {
  console.log('\n⚠️ 정본을 못 읽어 아래를 잴 수 없습니다 — 먼저 ⓪을 고치세요.');
  console.log(`\n🎯 textbook_assign_exact_harness — PASS ${PASS} / FAIL ${FAIL + 1}`);
  process.exit(1);
}
const bindOf = ids => new Function('userIds', 'return ' + BINDEXPR)(ids);

/* ── 진짜 SQLite — 운영과 같은 모양의 students_erp ────────────────────────
   ⚠️ 대소문자만 다른 계정(Kim/kim)은 **실재한다**(CLAUDE.md 2장). 그대로 넣어 본다. */
function db() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, textbook TEXT, shop_name TEXT)`);
  const rows = [
    ['jeong', '정우영', null, '망고아이'],
    ['jeong2', '정우영2', null, '망고아이'],
    ['eon', '언니', null, '망고아이'],
    ['kim', '김민수', null, '부산지사'],
    ['Kim', '김민수(대문자)', null, '부산지사'],
    ['mby1', '지승연', null, '망고아이'],
    ['jjy2323', '장지웅', 'BTS 2 001', '유앤아이'],
  ];
  const st = d.prepare(`INSERT INTO students_erp (user_id, korean_name, textbook, shop_name) VALUES (?,?,?,?)`);
  for (const r of rows) st.run(...r);
  return d;
}
/* 라우트가 조립하는 것과 같은 모양으로 WHERE 를 만든다 */
function targets(ids, opts) {
  const o = opts || {};
  const d = db();
  const conds = [], binds = [];
  if (o.scope) { conds.push('shop_name = ?'); binds.push(o.scope); }
  if (o.q) { conds.push(`(korean_name LIKE ? OR user_id LIKE ?)`); binds.push('%' + o.q + '%', '%' + o.q + '%'); }
  if (o.onlyEmpty !== false) conds.push(`(textbook IS NULL OR textbook = '')`);
  if (ids && ids.length) { conds.push(COND); binds.push(bindOf(ids)); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const out = d.prepare(`SELECT user_id FROM students_erp ${where} ORDER BY user_id`).all(...binds);
  d.close();
  return out.map(r => r.user_id);
}

console.log('\n── ① «그 학생» 을 제대로 찾는가 (짝 검사) ───────────');
check('한 명을 넣으면 그 한 명이 걸린다', JSON.stringify(targets(['jeong'])) === '["jeong"]', JSON.stringify(targets(['jeong'])));
check('여럿을 넣으면 그만큼만 걸린다',
  JSON.stringify(targets(['jeong', 'mby1'])) === '["jeong","mby1"]', JSON.stringify(targets(['jeong', 'mby1'])));

console.log('\n── ② 남의 계정이 딸려오지 않는가 ───────────────────');
check('접두사가 같은 다른 계정은 안 걸린다 (jeong ≠ jeong2)', targets(['jeong']).indexOf('jeong2') < 0);
check('조각으로는 안 걸린다 (eon 으로 jeong 이 안 걸림)', JSON.stringify(targets(['eon'])) === '["eon"]', JSON.stringify(targets(['eon'])));
/* 🔴 대소문자만 다른 계정이 실재한다 — «둘 중 아무나» 집으면 남의 계정에 배정된다 */
check('대소문자를 무시하지 않는다 (Kim 은 kim 을 안 건드린다)',
  JSON.stringify(targets(['Kim'])) === '["Kim"]', JSON.stringify(targets(['Kim'])));
check('   그 반대도 같다 (kim → kim 만)', JSON.stringify(targets(['kim'])) === '["kim"]', JSON.stringify(targets(['kim'])));

console.log('\n── ③ 다른 조건과 «AND» 로 묶이는가 ─────────────────');
check('스코프 밖 학생은 못 건드린다', JSON.stringify(targets(['kim'], { scope: '망고아이' })) === '[]', JSON.stringify(targets(['kim'], { scope: '망고아이' })));
check('   스코프 안이면 걸린다 (짝)', JSON.stringify(targets(['jeong'], { scope: '망고아이' })) === '["jeong"]');
check('이미 교재가 있으면 기본값(미배정만)에서 빠진다', JSON.stringify(targets(['jjy2323'])) === '[]', JSON.stringify(targets(['jjy2323'])));
check('   only_empty 를 끄면 걸린다 (짝)', JSON.stringify(targets(['jjy2323'], { onlyEmpty: false })) === '["jjy2323"]');

console.log('\n── ④ 못 찾으면 «아무것도 안 한다» ──────────────────');
check('없는 아이디는 0명 (엉뚱한 학생에게 안 붙는다)', JSON.stringify(targets(['nosuchuser'])) === '[]');
/* ⚠️ 목록을 안 보내면 예전처럼 «조건 없음» 이어야 한다 — 새 조건이 옛 동작을 깨면 안 된다 */
check('목록을 안 보내면 옛 동작 그대로 (전체가 대상)', targets([]).length === 6, String(targets([]).length));

console.log('\n── ⑤ 입구 게이트 (상한·이상한 값) ──────────────────');
/* 소스의 게이트 세 줄을 오려 내 실제로 돌린다 — «있는가» 가 아니라 «무슨 답이 나오는가» */
const gate = new Function('b', `
  const json = (o, s) => ({ __rej: true, body: o, status: s });
  ${gateSrc.replace(/: any\[\]/g, '').replace(/: any/g, '').replace(/Array<[^>]*>/g, 'Array')}
  return { userIds };
`);
const tryGate = b => { try { return gate(b); } catch (e) { return { threw: String(e && e.message) }; } };
check('빈 배열은 «목록 없음» 으로 본다', JSON.stringify(tryGate({ user_ids: [] }).userIds) === '[]');
/* 🔴 «배열이 아닌 모양» 은 거절해야 한다 — 조용히 [] 로 떨어지면 이 조건이 통째로 빠져
   스코프 전체가 대상이 된다(fail-open). 함정 대조가 실제로 이 구멍을 찾았다. */
for (const bad of ['jeong', 'a,b', 123, true]) {
  const r = tryGate({ user_ids: bad });
  check(`배열이 아니면 거절한다 (${JSON.stringify(bad)})`, r.__rej === true && r.body.error === 'invalid_user_ids', JSON.stringify(r));
}
{
  const r = tryGate({ user_ids: { 0: 'jeong', length: 1 } });
  check('유사배열도 거절한다 ({0:…, length:1})', r.__rej === true, JSON.stringify(r));
}
/* ⚠️ 짝 — 아예 «안 보낸» 것은 예전처럼 «목록 없음» 이어야 한다(옛 동작을 깨면 안 된다) */
check('   아예 안 보내면 옛 동작 그대로', JSON.stringify(tryGate({}).userIds) === '[]', JSON.stringify(tryGate({})));
check('공백·빈 문자열만 보내면 거절한다', !!tryGate({ user_ids: ['  ', ''] }).__rej || (tryGate({ user_ids: ['  ', ''] }).userIds || []).length === 0);
check('   그때 조용히 «전체» 로 흐르지 않는다', (() => {
  const r = tryGate({ user_ids: ['  ', ''] });
  return r.__rej ? r.body.error === 'invalid_user_ids' : false;
})(), JSON.stringify(tryGate({ user_ids: ['  ', ''] })));
check('콤마가 든 값은 거절한다 (구분자를 깨뜨린다)',
  (tryGate({ user_ids: ['a,b'] }) || {}).__rej === true, JSON.stringify(tryGate({ user_ids: ['a,b'] })));
const ids51 = Array.from({ length: 51 }, (_, i) => 'u' + i);
const ids50 = Array.from({ length: 50 }, (_, i) => 'u' + i);
check('50개를 넘으면 거절한다', tryGate({ user_ids: ids51 }).__rej === true, JSON.stringify(tryGate({ user_ids: ids51 })).slice(0, 80));
check('   50개까지는 통과한다 (짝)', (tryGate({ user_ids: ids50 }).userIds || []).length === 50);
check('중복은 한 번만 센다', (tryGate({ user_ids: ['a', 'a', 'b'] }).userIds || []).length === 2);
check('앞뒤 공백은 다듬는다', (tryGate({ user_ids: [' jeong '] }).userIds || [])[0] === 'jeong');

console.log(`\n🎯 textbook_assign_exact_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);

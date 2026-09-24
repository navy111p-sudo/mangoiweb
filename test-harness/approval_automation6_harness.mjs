#!/usr/bin/env node
/**
 * 🤖 결재 자동화 6단계 (2026-09-24) — 결재 전 질문 «이 가게 전에도?» · «이번 달 이 항목 합계»
 *
 * 무엇을 지키나
 *   ① vendorKey — 대소문자·공백·기호 무시, 두 글자 미만은 비교 안 함.
 *   ② askCard — 승인된 지출만 · 이 건 자신 제외 · 취소 결재 제외 · 90일 창 · 다른 사람 수 ·
 *      이번 달(KST) 같은 항목 합계는 통화를 섞지 않음 · 지난달은 안 셈(짝).
 *   ③ 배선 — 가게 이름을 따로 UPDATE(칸 없어도 올리기 성공) · 이력 라우트가 행마다 canView 로 거른다 ·
 *      분류 목록은 instr(콤마 문자열) · 실패해도 이력은 준다 · 화면이 ask 를 그린다.
 *   ④ 화면 askHtml 을 실제로 돌려 — 처음 보는 가게 경고 · 못 읽음 · 합계 없음.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const kst = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h) - 9 * 3600_000;
const NOW = kst(2026, 9, 24, 12);

console.log('\n① vendorKey');
ok('대소문자·공백·기호 무시', P.vendorKey('  SM Supermarket - Makati ') === P.vendorKey('sm supermarket makati'));
ok('한글도 비교', P.vendorKey('다이소 강남점') === '다이소강남점');
ok('한 글자는 비교 안 함', P.vendorKey('A') === '' && P.vendorKey('') === '' && P.vendorKey(null) === '');
ok('분류 목록은 돈 나가는 것만(purchase·expense)', P.spendTypesCsv() === ',purchase,expense,', P.spendTypesCsv());

console.log('\n② askCard');
{
  const cur = { id: 99, vendor: 'National Book Store', category: 'supplies', requester_username: 'mai' };
  const base = { status: 'approved', currency: 'PHP', category: 'supplies', vendor: 'national book store' };
  const rows = [
    { ...base, id: 1, amount: 1000, created_at: kst(2026, 9, 3, 10), requester_username: 'mai' },
    { ...base, id: 2, amount: 2000, created_at: kst(2026, 9, 10, 10), requester_username: 'karl' },
    { ...base, id: 3, amount: 500, created_at: kst(2026, 8, 20, 10), requester_username: 'mai' },     // 지난달 — 가게는 세고 합계는 안 셈
    { ...base, id: 4, amount: 9999, created_at: kst(2026, 9, 11, 10), requester_username: 'mai', reverses_id: 1 }, // 취소 결재
    { ...base, id: 5, amount: 777, created_at: kst(2026, 9, 12, 10), requester_username: 'mai', status: 'rejected' },
    { ...base, id: 6, amount: 50000, currency: 'KRW', created_at: kst(2026, 9, 13, 10), requester_username: 'jeong', vendor: 'other shop' },
    { ...base, id: 99, amount: 3333, created_at: kst(2026, 9, 24, 9), requester_username: 'mai' },    // 이 건 자신
    { ...base, id: 7, amount: 100, created_at: NOW - 100 * 86400_000, requester_username: 'mai' },     // 90일 밖
    { ...base, id: 10, amount: 400, created_at: kst(2026, 9, 15, 10), requester_username: 'karl', status: 'pending' }, // 대기 — 둘 다 안 셈
    { ...base, id: 8, amount: 40, category: 'meal', created_at: kst(2026, 9, 14, 10), requester_username: 'mai', vendor: 'x' },
  ];
  const a = P.askCard(cur, rows, NOW);
  ok('같은 가게 3번(90일 · 승인만 — 대기·이 건·취소·반려 제외)', a.vendorCount === 3, String(a.vendorCount));
  ok('그중 다른 사람 1번', a.vendorOthers === 1, String(a.vendorOthers));
  ok('마지막 날짜', a.vendorLast === kst(2026, 9, 10, 10));
  const php = a.catMonth.find(b => b.currency === 'PHP'), krw = a.catMonth.find(b => b.currency === 'KRW');
  ok('이번 달 사무·소모품 ₱3,000 (지난달·취소·반려·자신·다른 항목 제외)', php && php.total === 3000 && php.count === 2, JSON.stringify(a.catMonth));
  ok('통화를 섞지 않는다(₩ 따로)', krw && krw.total === 50000);
  ok('항목 이름을 싣는다', a.category && a.category.ko === '사무 · 소모품');
  const b = P.askCard({ ...cur, vendor: '' }, rows, NOW);
  ok('(짝) 가게를 못 읽었으면 세지 않는다', b.vendor === null && b.vendorCount === 0);
  const c = P.askCard({ ...cur, category: 'nope' }, rows, NOW);
  ok('(짝) 모르는 항목이면 합계 없음', c.category === null && c.catMonth.length === 0);
  const d = P.askCard({ ...cur, vendor: 'Brand New Shop' }, rows, NOW);
  ok('(짝) 처음 보는 가게 → 0', d.vendorCount === 0 && d.vendorLast === null);
}

console.log('\n③ 배선');
{
  ok('vendor 칸 ALTER', /ADD COLUMN vendor TEXT/.test(API));
  const up = API.indexOf('UPDATE approval_requests SET vendor = ? WHERE id = ?');
  ok('가게 이름을 따로 UPDATE(safe 안)', up > 0 && /await safe\(async \(\) => \{\s*await env\.DB\.prepare\(`UPDATE approval_requests SET vendor/.test(API));
  const hi = API.indexOf("if (method === 'GET' && mHist)");
  const hb = bodyAt(API, hi);
  ok('이력 라우트가 askCard 를 부른다', /askCard\(/.test(hb));
  ok('행마다 canView 로 거른다', /\.filter\(x => canView\(actor, x\.req_type, x\.requester_username, \[\], ph\)\)/.test(hb));
  ok('askCard 에 거른 행(vis)을 넘긴다', /askCard\([^;]*?, vis, Date\.now\(\)\)/.test(hb));
  ok('분류 목록은 instr 콤마 문자열', /instr\(\?, ',' \|\| req_type \|\| ','\) > 0/.test(hb) && /spendTypesCsv\(\)/.test(hb));
  ok('실패해도 이력은 준다(ask 만 null)', /history: historyCard\(r, rows as any\[\]\), ask/.test(hb) && /let ask: any = null/.test(hb));
  const m = hb.match(/`(SELECT id, req_type, status, reverses_id[\s\S]*?)`/);
  ok('질문 SQL 을 찾았다(전제)', !!m);
  if (m) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE approval_requests (id INTEGER, req_type TEXT, status TEXT, reverses_id INTEGER, amount REAL,
      currency TEXT, created_at INTEGER, requester_username TEXT, vendor TEXT, category TEXT)`);
    const ins = db.prepare('INSERT INTO approval_requests (id, req_type, status, created_at) VALUES (?,?,?,?)');
    ins.run(1, 'purchase', 'approved', NOW); ins.run(2, 'expense', 'approved', NOW); ins.run(3, 'hr', 'approved', NOW);
    ins.run(4, 'purchase', 'pending', NOW); ins.run(5, 'purchase', 'approved', NOW - 91 * 86400_000);
    const got = db.prepare(m[1]).all(P.spendTypesCsv(), NOW - 90 * 86400_000).map(x => x.id).sort();
    ok('SQL: 돈 나가는 승인건·90일 안만 (인사 제외)', got.join(',') === '1,2', got.join(','));
  }
  ok('화면이 askHtml 을 그린다', /hh \+= askHtml\(j\.ask\);/.test(WORK));
}

console.log('\n④ 화면 askHtml — 실제로 돌린다');
{
  const i = WORK.indexOf('function askHtml(');
  const src = i < 0 ? '' : WORK.slice(i, WORK.indexOf('{', i)) + bodyAt(WORK, i);
  try {
    const f = new Function('T', 'esc', 'money', 'when', src + '\nreturn askHtml;')(
      (en, ko) => ko, x => String(x), (v, c) => (c === 'KRW' ? '₩' : '₱') + v, () => '9/10');
    ok('ask 가 없으면 아무것도 안 그림', f(null) === '');
    const h1 = f({ vendor: 'NBS', vendorCount: 0, vendorOthers: 0, vendorLast: null, category: { ko: '사무 · 소모품', en: 'Office' }, catMonth: [] });
    ok('처음 보는 가게는 경고색', /histwarn[^>]*>최근 90일 처음 보는 가게/.test(h1));
    ok('합계가 없으면 «아직 없음»', /승인 합계: 아직 없음/.test(h1));
    const h2 = f({ vendor: 'NBS', vendorCount: 3, vendorOthers: 1, vendorLast: 1, category: { ko: '사무 · 소모품', en: 'Office' },
      catMonth: [{ currency: 'PHP', total: 3000, count: 2 }, { currency: 'KRW', total: 50000, count: 1 }] });
    ok('(짝) 전에 산 가게는 경고 없음 + 횟수', !/histwarn/.test(h2) && /최근 90일 승인 3번 \(다른 사람 1번\)/.test(h2));
    ok('통화별로 따로 쓴다', /₱3000 \(2건\) · ₩50000 \(1건\)/.test(h2), h2);
    const h3 = f({ vendor: null, vendorCount: 0, vendorOthers: 0, vendorLast: null, category: null, catMonth: [] });
    ok('가게를 못 읽었으면 그렇게 말한다', /이름을 읽지 못했습니다/.test(h3));
  } catch (e) { ok('askHtml 을 돌렸다', false, e.message); }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);

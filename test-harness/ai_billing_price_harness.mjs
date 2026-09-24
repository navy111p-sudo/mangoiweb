/**
 * ai_billing_price_harness.mjs — 학원(B2B) A.i 공급가 «인원 구간» 청구 감시 (2026-09-24)
 * ════════════════════════════════════════════════════════════════════════
 *  무엇을 지키나
 *   ① 사장님 공급가 제안서 5안(71↑ 4,500 · 51~70 5,500 · 21~50 6,500 · 20↓ 7,500원/명)
 *   ② 최소 20명분 청구 · 구간 경계 보정(인원이 늘면 청구액이 «절대 줄지 않는다» — 0~2,000명 전수)
 *   ③ 지사 커미션 40% + 본사 몫 = 총액
 *   ④ 청구서는 «생성 시점 규칙» 으로 계산(price_rule 스냅샷) · 옛 청구서(NULL)는 rate×인원 그대로
 *   ⑤ 화상반 학생은 청구 인원에서 뺀다(이중 청구 방지) — LIVE_UIDS_SQL 을 «진짜 SQLite» 에 돌린다
 *   ⑥ 화상반 조회가 실패하면 «아무도 청구하지 않는다»(currentRoster 를 오려 내 실제로 돌림)
 *   ⑦ 배선: 청구서·이력·결제가 전부 invoiceAmount() 하나를 쓴다 · 화면이 금액을 다시 계산하지 않는다
 *  ⚠️ 문자열 검사만으로는 «무슨 금액이 나오는가» 를 못 본다 — 정본을 import 해 실제로 돌린다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const BILL_FILE = process.env.AIB_BILL_FILE || join(SRC, 'ai-billing.ts');
const PRICE_FILE = process.env.AIB_PRICE_FILE || join(SRC, 'ai-billing-price.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`);
}
const sec = (t) => console.log('\n' + t);

/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 — 문자열·주석 안의 괄호는 세지 않는다. */
function braceBlock(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return src.slice(openIdx);
}
/** 함수 선언 전체(TS 반환 타입의 { } 를 건너뛰고 «몸통» 중괄호부터 짝 맞춤). */
function fnDecl(src, name) {
  const at = src.search(new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\s*\\(`));
  if (at < 0) return '';
  // 인자 목록 괄호 짝
  let i = src.indexOf('(', at), d = 0;
  for (; i < src.length; i++) { if (src[i] === '(') d++; else if (src[i] === ')') { d--; if (d === 0) break; } }
  // 반환 타입 건너뛰기 — 괄호·꺾쇠 깊이 0 에서 만나는 첫 { 가 몸통 (TS 반환 타입 안의 { 는 < > 안에 있다)
  let j = i + 1, ang = 0, par = 0, brc = 0;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '<') ang++; else if (c === '>') ang--;
    else if (c === '(') par++; else if (c === ')') par--;
    else if (c === '{') {
      if (ang === 0 && par === 0 && brc === 0 && /[)\s>\]]$/.test(src.slice(Math.max(0, j - 2), j).replace(/\s+$/, ' ')) && !/:\s*$/.test(src.slice(i + 1, j))) break;
      brc++;
    } else if (c === '}') brc--;
  }
  return src.slice(at, j) + braceBlock(src, j);
}
/** 주석을 줄 단위로 벗긴다(부정 검사용) — 블록주석 안인지 추적한다. */
function stripComments(t) {
  const out = []; let inBlock = false;
  for (const line of t.split('\n')) {
    let s = line, res = '';
    for (let k = 0; k < s.length; k++) {
      if (inBlock) { if (s[k] === '*' && s[k + 1] === '/') { inBlock = false; k++; } continue; }
      if (s[k] === '/' && s[k + 1] === '*') { inBlock = true; k++; continue; }
      if (s[k] === '/' && s[k + 1] === '/' && s[k - 1] !== ':') break;
      res += s[k];
    }
    out.push(res);
  }
  return out.join('\n');
}

const P = await import(pathToFileURL(PRICE_FILE).href + '?t=' + Date.now());
const billSrc = readFileSync(BILL_FILE, 'utf8');
const billCode = stripComments(billSrc);

console.log('════════ 💰 학원 A.i 공급가(인원 구간) 하니스 ════════');

/* ══ ① 5안 경계값 ═══════════════════════════════════════════════════════ */
sec('[①] 5안 구간 단가 · 경계값 (사장님 공급가 제안서)');
{
  const expect = { 1: 150000, 5: 150000, 20: 150000, 21: 150000, 23: 150000, 24: 156000, 50: 325000,
    51: 325000, 60: 330000, 70: 385000, 71: 385000, 86: 387000, 100: 450000, 200: 900000 };
  for (const [n, t] of Object.entries(expect)) {
    const got = P.aiPrice(Number(n)).total;
    check(`${n}명 → ${t.toLocaleString()}원`, got === t, `실제 ${got}`);
  }
  check('71명 이상 단가 4,500', P.aiPrice(100).rate === 4500);
  check('51~70명 단가 5,500', P.aiPrice(60).rate === 5500);
  check('21~50명 단가 6,500', P.aiPrice(30).rate === 6500);
  check('20명 이하 단가 7,500', P.aiPrice(10).rate === 7500);
  check('0명은 0원 · none (학생 없는 학원에 최소 청구를 걸지 않는다)', P.aiPrice(0).total === 0 && P.aiPrice(0).basis === 'none');
}

/* ══ ② 청구액은 인원이 늘면 절대 줄지 않는다 ═════════════════════════════ */
sec('[②] 인원이 늘면 청구액이 절대 줄지 않는다 (0~2,000명 전수)');
{
  let bad = null, prev = -1;
  for (let n = 0; n <= 2000; n++) { const t = P.aiPrice(n).total; if (t < prev) { bad = `${n - 1}명 ${prev} → ${n}명 ${t}`; break; } prev = t; }
  check('구간 단가: 역전 0건', !bad, bad);
  // 짝: 보정을 없앤 «5안 그대로» 는 실제로 역전한다 — 이 검사가 헛돌지 않는다는 증거
  let raw = null; prev = -1;
  for (let n = 1; n <= 200; n++) { const b = Math.max(n, 20); const t = b * P.tierFor(b).rate; if (t < prev) { raw = n; break; } prev = t; }
  check('(대조) 보정 없는 5안은 21명에서 실제로 역전한다', raw === 21, `첫 역전 ${raw}`);
  // 보정은 «바로 아래 인원» 까지만 — 부풀려 새 계단을 만들지 않는다
  check('51명 금액 = 50명 금액 (375,000 으로 부풀지 않음)', P.aiPrice(51).total === P.aiPrice(50).total);
  let flatMax = 0, run = 0; prev = -1;
  // 1~20명은 최소 청구라 원래 같은 금액이다 — 보정 구간만 보려고 21명부터 센다(21~23 · 71~85 = 최대 15)
  for (let n = 20; n <= 2000; n++) { const t = P.aiPrice(n).total; run = t === prev ? run + 1 : 0; flatMax = Math.max(flatMax, run); prev = t; }
  check('보정으로 금액이 멈춰 있는 구간은 최대 20명 이하 (보정이 과하지 않다)', flatMax <= 20, `최대 ${flatMax}`);
  let badC = null; prev = -1;
  for (let n = 0; n <= 500; n++) { const t = P.aiPrice(n, 5000).total; if (t < prev) { badC = n; break; } prev = t; }
  check('예외 단가도 역전 0건', badC == null);
}

/* ══ ③ 최소 20명분 ═════════════════════════════════════════════════════ */
sec('[③] 최소 20명분 청구');
{
  const p5 = P.aiPrice(5);
  check('5명 → 청구 인원 20', p5.billable === 20 && p5.count === 5 && p5.min_applied === true);
  check('20명 → 최소 청구 표시 없음', P.aiPrice(20).min_applied === false);
  check('설명 글자에 «최소 20명분»', /최소 20명분/.test(P.aiPriceNote(p5).ko) && /minimum 20/.test(P.aiPriceNote(p5).en));
  check('예외 단가도 최소 20명분 (5명 × 5,000 → 100,000)', P.aiPrice(5, 5000).total === 100000);
  check('상수 AI_MIN_BILLABLE = 20', P.AI_MIN_BILLABLE === 20);
}

/* ══ ④ 지사 커미션 40% ══════════════════════════════════════════════════ */
sec('[④] 지사 커미션 40% · 본사 몫');
{
  let bad = null;
  for (let n = 0; n <= 300; n++) {
    const p = P.aiPrice(n);
    if (p.branch_commission + p.hq_share !== p.total || p.branch_commission !== Math.round(p.total * 0.4)) { bad = n; break; }
  }
  check('커미션 + 본사 몫 = 총액, 커미션 = 40% (0~300명)', bad == null, `${bad}명`);
  check('상수 BRANCH_COMMISSION_PCT = 40', P.BRANCH_COMMISSION_PCT === 40);
  check('30명 → 커미션 78,000 · 본사 117,000', P.aiPrice(30).branch_commission === 78000 && P.aiPrice(30).hq_share === 117000);
}

/* ══ ⑤ 예외 단가 · 규칙 스냅샷 ═══════════════════════════════════════════ */
sec('[⑤] 학원 예외 단가 · parseAiPriceRule');
{
  const c = P.aiPrice(80, 3000);
  check('예외 단가 80명 × 3,000 = 240,000 (custom)', c.total === 240000 && c.basis === 'custom');
  check('예외 단가 0/null 이면 구간 단가', P.aiPrice(80, 0).basis === 'tier' && P.aiPrice(80, null).basis === 'tier');
  const rt = P.parseAiPriceRule(JSON.stringify(P.currentAiPriceRule()));
  check('규칙 JSON 왕복', !!rt && rt.tiers.length === 4 && rt.min === 20 && rt.pct === 40);
  check('1명부터 못 덮는 규칙은 거절(null)', P.parseAiPriceRule({ tiers: [{ min: 10, rate: 5000 }], min: 0, pct: 40 }) === null);
  check('깨진 JSON 은 null (던지지 않는다)', P.parseAiPriceRule('{oops') === null && P.parseAiPriceRule(null) === null);
  const old = { tiers: [{ min: 51, rate: 5000 }, { min: 1, rate: 8000 }], min: 10, pct: 30 };
  const po = P.aiPrice(100, null, old);
  check('스냅샷 규칙으로 계산 (100명 × 5,000 · 커미션 30%)', po.total === 500000 && po.branch_commission === 150000, JSON.stringify(po));
  check('스냅샷 규칙에도 경계 보정 (60명 → 50명 × 8,000 = 400,000)', P.aiPrice(60, null, old).total === 400000);
  check('스냅샷의 최소 청구 10명 (3명 → 80,000)', P.aiPrice(3, null, old).total === 80000);
}

/* ══ ⑥ invoiceAmount — 청구서 금액 정본 (소스에서 오려 실제로 돌림) ═════ */
sec('[⑥] invoiceAmount() — 청구서·이력·결제가 쓰는 금액 정본');
let invoiceAmount = null;
{
  const decl = fnDecl(billSrc, 'invoiceAmount');
  check('invoiceAmount 를 오려 냈다 (전제)', decl.length > 50);
  try {
    const js = stripTypeScriptTypes(decl.replace(/^export\s+/, ''));
    invoiceAmount = new Function('aiPrice', 'parseAiPriceRule', 'currentAiPriceRule', 'DEFAULT_AI_RATE_KRW',
      js + '\nreturn invoiceAmount;')(P.aiPrice, P.parseAiPriceRule, P.currentAiPriceRule, 10000);
  } catch (e) { check('invoiceAmount 실행 준비', false, e.message); }
  const call = (inv, n) => { try { return invoiceAmount(inv, n); } catch (e) { return { total: NaN, err: e.message }; } };
  if (invoiceAmount) {
    const rule = JSON.stringify(P.currentAiPriceRule());
    check('새 청구서(규칙 스냅샷·예외 없음) 30명 → 195,000', call({ rate_krw: 0, price_rule: rule }, 30).total === 195000);
    check('새 청구서 5명 → 최소 20명분 150,000', call({ rate_krw: 0, price_rule: rule }, 5).total === 150000);
    check('새 청구서 + 예외 단가 3,000 × 80 → 240,000', call({ rate_krw: 3000, price_rule: rule }, 80).total === 240000);
    const oldRule = JSON.stringify({ tiers: [{ min: 1, rate: 9000 }], min: 0, pct: 40 });
    check('스냅샷 규칙이 «지금 표» 를 이긴다 (10명 × 9,000)', call({ rate_krw: 0, price_rule: oldRule }, 10).total === 90000);
    check('옛 청구서(price_rule NULL) = rate × 인원 그대로 (소급 안 함)', call({ rate_krw: 10000, price_rule: null }, 5).total === 50000);
    check('포함 인원 0 → 0원 (결제 게이트가 막는다)', call({ rate_krw: 0, price_rule: rule }, 0).total === 0);
  }
}

/* ══ ⑦ 화상반 제외 SQL — 진짜 SQLite ═══════════════════════════════════ */
sec('[⑦] LIVE_UIDS_SQL — 화상반 학생 판정 (node:sqlite)');
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { console.log('  ⏭ node:sqlite 없음 — ⑦⑧ 건너뜀'); }
const sqlM = billSrc.match(/export const LIVE_UIDS_SQL = `([\s\S]*?)`;/);
check('LIVE_UIDS_SQL 을 오려 냈다 (전제)', !!sqlM);
const DAY = 86400000, NOW = Date.now();
function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, scheduled_date TEXT);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, room_id TEXT, joined_at INTEGER);
           CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT, shop_name TEXT);`);
  const cs = db.prepare('INSERT INTO class_schedules (user_id,status,scheduled_date) VALUES (?,?,?)');
  cs.run('sched_live', 'active', null);
  cs.run('lms', 'active', null);
  cs.run('sched_cancel', 'cancelled', '2026-10-01');
  const at = db.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)');
  at.run('c24_recent', null, 'c24-1001', NOW - 5 * DAY);
  at.run('c24_future', null, 'c24-1002', NOW + 3 * DAY);
  at.run('c24_old', null, 'c24-1003', NOW - 60 * DAY);
  at.run('u_device01', 'class_acct', 'class-848-20260920', NOW - 2 * DAY);
  at.run('device_only', null, 'class-900-20260920', NOW - 2 * DAY);
  at.run('meet_user', 'meet_acct', 'meet-1234', NOW - 1 * DAY);
  const st = db.prepare('INSERT INTO students_erp (user_id,korean_name,username,shop_name) VALUES (?,?,?,?)');
  for (const u of ['sched_live', 'c24_recent', 'c24_future', 'c24_old', 'class_acct', 'device_only', 'ai_only1', 'ai_only2', 'sched_cancel'])
    st.run(u, '학생 ' + u, u, '망고학원');
  return db;
}
function liveSet(db) {
  const since = NOW - 30 * DAY;
  return new Set(db.prepare(sqlM[1]).all(since, since).map(r => String(r.uid).toLowerCase()));
}
if (DatabaseSync && sqlM) {
  const db = makeDb(); const L = liveSet(db);
  check('활성 예약 학생 = 화상반', L.has('sched_live'));
  check('자리표시(lms) 는 화상반 아님', !L.has('lms'));
  check('취소된 예약만 있으면 화상반 아님', !L.has('sched_cancel'));
  check('카페24 씨앗 최근 30일 = 화상반', L.has('c24_recent'));
  check('카페24 미래 예약 = 화상반', L.has('c24_future'));
  check('카페24 60일 전 한 번뿐 = 화상반 아님', !L.has('c24_old'));
  check('망고아이 수업방 계정(account_uid) = 화상반', L.has('class_acct'));
  check('기기 임시번호(user_id)는 계정이 아니다 — 세지 않음', !L.has('u_device01') && !L.has('device_only'));
  check('회의방(meet-) 은 수업이 아니다', !L.has('meet_acct'));
  check('(짝) A.i반 학생은 화상반이 아니다', !L.has('ai_only1') && !L.has('ai_only2'));
}

/* ══ ⑦-2 loadLiveUids — 정본을 오려 실제로 돌림 (대소문자·실패 방향) ═══════ */
sec('[⑦-2] loadLiveUids() — 소문자로 모으고, 실패하면 null');
if (DatabaseSync && sqlM) {
  const decl = fnDecl(billSrc, 'loadLiveUids');
  let load = null;
  try {
    load = new Function('LIVE_UIDS_SQL', 'LIVE_LOOKBACK_DAYS', stripTypeScriptTypes(decl.replace(/^export\s+/, '')) + '\nreturn loadLiveUids;')(sqlM[1], 30);
  } catch (e) { check('loadLiveUids 실행 준비', false, e.message); }
  if (load) {
    const db = makeDb();
    db.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run('UPPER_SEED', null, 'c24-3001', NOW - DAY);
    const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ all: async () => ({ results: db.prepare(sql).all(...a) }) }) }) } };
    const set = await load(env).catch(() => 'threw');
    check('화상반 집합을 만든다 (c24_recent·class_acct 포함)', set instanceof Set && set.has('c24_recent') && set.has('class_acct'));
    check('대문자 씨앗을 소문자로 담는다 (UPPER_SEED → upper_seed)', set instanceof Set && set.has('upper_seed') && !set.has('UPPER_SEED'));
    const bad = { DB: { prepare: () => { throw new Error('D1 down'); } } };
    const r = await load(bad).catch(() => 'threw');
    check('조회가 던지면 null (던지지 않는다 → 부르는 쪽이 청구 0명)', r === null);
  }
}

/* ══ ⑧ currentRoster — 화상반 제외 · 조회 실패면 아무도 청구 안 함 ═══════ */
sec('[⑧] currentRoster() — 재원 − 화상반 · 실패하면 청구 0명');
{
  const decl = fnDecl(billSrc, 'currentRoster');
  check('currentRoster 를 오려 냈다 (전제)', decl.length > 50);
  let roster = null;
  try {
    const js = stripTypeScriptTypes(decl);
    roster = new Function('enrolledCond', 'hiddenExcludeCond', 'loadLiveUids', js + '\nreturn currentRoster;')(
      () => '1=1', async () => '', async () => null);
  } catch (e) { check('currentRoster 실행 준비', false, e.message); }
  if (roster && DatabaseSync && sqlM) {
    const db = makeDb();
    const envOf = (d) => ({ DB: { prepare: (sql) => ({ bind: (...a) => ({ all: async () => ({ results: d.prepare(sql).all(...a) }) }) }) } });
    const run = async (live, d = db) => { try { return await roster(envOf(d), '망고학원', live); } catch (e) { return { ok: 'threw', rows: [], err: e.message }; } };
    const r = await run(liveSet(db));
    const ids = (r.rows || []).map(x => x.user_id).sort();
    check('화상반 4명(예약·카페24 둘·수업방 계정) 빠짐', r.ok === true && r.live_excluded === 4, JSON.stringify({ ok: r.ok, ex: r.live_excluded }));
    check('A.i반만 남는다 (c24_old · device_only · ai_only1·2 · sched_cancel)',
      JSON.stringify(ids) === JSON.stringify(['ai_only1', 'ai_only2', 'c24_old', 'device_only', 'sched_cancel']), JSON.stringify(ids));
    {
      const db2 = makeDb();
      db2.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run('AI_ONLY1', null, 'c24-2001', NOW - DAY);
      // 명부 쪽이 대문자인 경우도 — 씨앗 'mixed01' ↔ 명부 'Mixed01' (양쪽을 다 소문자로 맞춰야 잡힌다)
      db2.prepare('INSERT INTO students_erp (user_id,korean_name,username,shop_name) VALUES (?,?,?,?)').run('Mixed01', '학생 M', 'Mixed01', '망고학원');
      db2.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run('mixed01', null, 'c24-2002', NOW - DAY);
      const r2 = await run(liveSet(db2), db2);
      check('(전제) db2 명부에 Mixed01 이 있다 — 화상반이 아니면 남았을 학생', (await run(new Set(), db2)).rows.some(x => x.user_id === 'Mixed01'));
      check('대소문자만 다른 카페24 씨앗(AI_ONLY1)도 화상반으로 뺀다', r2.ok === true && !(r2.rows || []).some(x => x.user_id === 'ai_only1'));
      check('명부가 대문자(Mixed01)·씨앗이 소문자여도 화상반으로 뺀다', r2.ok === true && !(r2.rows || []).some(x => x.user_id === 'Mixed01'));
    }
    const f = await run(null);
    check('화상반 조회 실패(null) → ok=false · 0명 (이중 청구보다 안 받는다)', f.ok === false && (f.rows || []).length === 0, JSON.stringify(f));
    const all = await run(new Set());
    check('(짝) 화상반이 없으면 재원 전원', all.ok === true && all.rows.length === 9);
  }
}

/* ══ ⑨ 배선 — 금액 정본 하나 · 화면은 계산하지 않는다 ═══════════════════ */
sec('[⑨] 배선 — 청구서·이력·결제·미리보기가 같은 정본을 쓴다');
{
  const count = (re) => (billCode.match(re) || []).length;
  check('옛 금액식(인원 × rate_krw)이 남아 있지 않다', count(/includedCount\s*\*\s*Number\(inv\.rate_krw\)|included_count\)\s*\*\s*Number\(r\.rate_krw\)|rate\s*\*\s*roster\.length/g) === 0);
  // 선언 줄(function invoiceAmount()은 빼고 «호출 모양» 만 센다 — 선언이 함께 걸리면 호출 하나를 지워도 통과한다
  check('invoiceAmount 호출이 셋 이상 (/invoice · /history · checkout)', count(/(?<!function )invoiceAmount\(/g) >= 3);
  check('(짝) invoiceAmount 선언은 정확히 하나 (복제 없음)', count(/function invoiceAmount\(/g) === 1);
  const chk = billCode.slice(billCode.indexOf("p === 'invoice/checkout'"));
  check('결제 금액 = invoiceAmount(...).total', /const amount = invoiceAmount\([^)]*\)\.total/.test(chk));
  check('청구서 INSERT 가 price_rule 을 스냅샷', /INSERT INTO ai_billing_invoices[^`]*price_rule/.test(billCode) && /JSON\.stringify\(currentAiPriceRule\(\)\)/.test(billCode));
  check('price_rule 칸을 지연 ALTER 로 만든다', /ALTER TABLE ai_billing_invoices ADD COLUMN price_rule/.test(billCode));
  const gen = fnDecl(billCode, 'generateOrRefreshInvoice');
  check('생성: 화상반 조회 실패면 아무것도 안 더한다', /if \(!rosterR\.ok\) return/.test(gen) && gen.indexOf('!rosterR.ok') < gen.indexOf('INSERT OR IGNORE'));
  check('생성: 화상반 조회는 청구서 머리 INSERT «앞» (실패 시 빈 청구서가 안 남는다)', /if \(!live\) return/.test(gen) && gen.indexOf('if (!live) return') < gen.indexOf('INSERT INTO ai_billing_invoices'));
  for (const f of ['branch.html', 'manager.html']) check(`${f}: 옛 형식 캐시 키(aibill)를 안 쓴다`, !/'aibill'/.test(readFileSync(join(PUB, f), 'utf8')));
  const mon = fnDecl(billCode, 'generateMonthlyAiInvoices');
  check('월 cron: 화상반을 «한 번» 읽고 실패하면 청구서 0장', /loadLiveUids\(env\)/.test(mon) && /if \(!live\) return/.test(mon) && /generateOrRefreshInvoice\([^)]*live\)/.test(mon));
  const rateGet = billCode.slice(billCode.indexOf("p === 'rate' && method === 'GET'"), billCode.indexOf("p === 'rate' && method === 'POST'"));
  check('/rate: 화상반을 빼고(aiCount) 정본 aiPrice 로 계산', /live\.has\(/.test(rateGet) && /aiPrice\(aiCount/.test(rateGet));

  const adm = stripComments(readFileSync(join(PUB, 'js/adm-ai-billing.js'), 'utf8'));
  check('관리자 화면: 인원 × 단가를 다시 계산하지 않는다', !/enrolled_count\)\s*\*|aibRecalc/.test(adm));
  check('관리자 화면: 서버 금액·커미션을 그린다', /estimated_total_krw/.test(adm) && /branch_commission_krw/.test(adm));
  const admHtml = readFileSync(join(PUB, 'admin.html'), 'utf8');
  check('admin.html 이 adm-ai-billing.js ?v=2 이상을 부른다', /adm-ai-billing\.js\?v=([2-9]|\d\d)/.test(admHtml));
  for (const f of ['branch.html', 'manager.html']) {
    const h = stripComments(readFileSync(join(PUB, f), 'utf8'));
    const body = fnDecl(h, 'paintAiBill');
    check(`${f}: 청구서 카드가 서버 설명(aiBillPriceRows)을 그린다`, (body.match(/aiBillPriceRows\(/g) || []).length >= 2);
    check(`${f}: 학원 화면에 지사 커미션을 그리지 않는다`, !/branch_commission_krw/.test(body + fnDecl(h, 'aiBillPriceRows')));
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }

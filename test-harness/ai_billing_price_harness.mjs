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
/* (2026-10-23) ③ 명단 쓰기에 «결제 승인 중이 아닐 때만» 조건이 붙었다 — 그 조각은 정본(b2b-pay-guard.ts)에서 «읽어» 주입한다(베끼지 않음).
   조건이 보는 ai_billing_invoices 는 시험 DB 에 «선점 없음» 행만 둔다 → 예전 동작 그대로 재는 것. */
const guardSrc = readFileSync(join(BILL_FILE, '..', 'b2b-pay-guard.ts'), 'utf8');
const UNCLAIMED_SQL = (guardSrc.match(/export const MGB_UNCLAIMED_SQL = `([^`]+)`;/) || [])[1] || '';
const UNCLAIMED_DDL = `CREATE TABLE IF NOT EXISTS ai_billing_invoices (id INTEGER PRIMARY KEY, confirming_order TEXT, confirming_at INTEGER);
  INSERT OR IGNORE INTO ai_billing_invoices (id) VALUES (1), (2);`;
const unclaimedBinds = (id) => [id, Date.now() - 5 * 60 * 1000];

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
sec('[⑧] currentRoster() — 재원 ∩ 신청 − 화상반 · 실패하면 청구 0명');
{
  const decl = fnDecl(billSrc, 'currentRoster');
  check('currentRoster 를 오려 냈다 (전제)', decl.length > 50);
  let roster = null;
  try {
    const js = stripTypeScriptTypes(decl);
    roster = new Function('enrolledCond', 'hiddenExcludeCond', 'loadLiveUids', 'loadAiOptIns', js + '\nreturn currentRoster;')(
      () => '1=1', async () => '', async () => null, async () => null);
  } catch (e) { check('currentRoster 실행 준비', false, e.message); }
  if (roster && DatabaseSync && sqlM) {
    const db = makeDb();
    const envOf = (d) => ({ DB: { prepare: (sql) => ({ bind: (...a) => ({ all: async () => ({ results: d.prepare(sql).all(...a) }) }) }) } });
    // 신청 명단 — ai_only1·c24_old 만 신청, sched_live 는 신청했지만 화상반(화상반이 이긴다)
    const OPT = new Set(['ai_only1', 'c24_old', 'sched_live']);
    const ALL_OPT = new Set(['sched_live', 'c24_recent', 'c24_future', 'c24_old', 'class_acct', 'device_only', 'ai_only1', 'ai_only2', 'sched_cancel', 'mixed01']);
    const run = async (live, d = db, opt = OPT) => { try { return await roster(envOf(d), '망고학원', live, opt); } catch (e) { return { ok: 'threw', rows: [], err: e.message }; } };
    const r = await run(liveSet(db));
    const ids = (r.rows || []).map(x => x.user_id).sort();
    const idle = (r.idle_rows || []).map(x => x.user_id).sort();
    check('화상반 4명(예약·카페24 둘·수업방 계정) 빠짐', r.ok === true && r.live_excluded === 4, JSON.stringify({ ok: r.ok, ex: r.live_excluded }));
    check('청구 = 신청한 학생만 (ai_only1 · c24_old)', JSON.stringify(ids) === JSON.stringify(['ai_only1', 'c24_old']), JSON.stringify(ids));
    check('(짝) 신청 안 한 학원생은 «신청 안 함» 으로 따로 (청구 안 함)',
      JSON.stringify(idle) === JSON.stringify(['ai_only2', 'device_only', 'sched_cancel']), JSON.stringify(idle));
    check('(짝) 신청했어도 화상반이면 청구 안 함 — 화상반이 이긴다 (sched_live)', !ids.includes('sched_live') && !idle.includes('sched_live'));
    const none = await run(liveSet(db), db, new Set());
    check('신청이 한 명도 없으면 청구 0명 (테스트 기간 실측 상태)', none.ok === true && none.rows.length === 0 && (none.idle_rows || []).length === 5, JSON.stringify({ n: none.rows.length, i: (none.idle_rows || []).length }));
    const of = await run(liveSet(db), db, null);
    check('신청 명단 조회 실패(null) → ok=false · 0명', of.ok === false && (of.rows || []).length === 0, JSON.stringify(of));
    {
      const db2 = makeDb();
      db2.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run('AI_ONLY1', null, 'c24-2001', NOW - DAY);
      // 명부 쪽이 대문자인 경우도 — 씨앗 'mixed01' ↔ 명부 'Mixed01' (양쪽을 다 소문자로 맞춰야 잡힌다)
      db2.prepare('INSERT INTO students_erp (user_id,korean_name,username,shop_name) VALUES (?,?,?,?)').run('Mixed01', '학생 M', 'Mixed01', '망고학원');
      db2.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run('mixed01', null, 'c24-2002', NOW - DAY);
      const r2 = await run(liveSet(db2), db2, ALL_OPT);
      check('(전제) db2 명부에 Mixed01 이 있다 — 화상반이 아니면 남았을 학생', (await run(new Set(), db2, ALL_OPT)).rows.some(x => x.user_id === 'Mixed01'));
      check('대소문자만 다른 카페24 씨앗(AI_ONLY1)도 화상반으로 뺀다', r2.ok === true && !(r2.rows || []).some(x => x.user_id === 'ai_only1'));
      check('명부가 대문자(Mixed01)·씨앗이 소문자여도 화상반으로 뺀다', r2.ok === true && !(r2.rows || []).some(x => x.user_id === 'Mixed01'));
    }
    const f = await run(null);
    check('화상반 조회 실패(null) → ok=false · 0명 (이중 청구보다 안 받는다)', f.ok === false && (f.rows || []).length === 0, JSON.stringify(f));
    const all = await run(new Set(), db, ALL_OPT);
    check('(짝) 화상반이 없고 전원 신청하면 재원 전원', all.ok === true && all.rows.length === 9);
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
  check('월 cron: 화상반·신청 명단을 «한 번» 읽고 실패하면 청구서 0장', /loadLiveUids\(env\)/.test(mon) && /loadAiOptIns\(env\)/.test(mon) && /if \(!live \|\| !optIn\) \{/.test(mon) && mon.indexOf('if (!live || !optIn) {') < mon.indexOf('for (const s of shops)') && /generateOrRefreshInvoice\([^)]*live, optIn, true\)/.test(mon));
  check('월 cron: 자동 청구 스위치를 대리점 목록보다 «먼저» 본다', /billingEnabled\(env\)/.test(mon) && mon.indexOf('billingEnabled(env)') < mon.indexOf('FROM students_erp'));
  const rateGet = billCode.slice(billCode.indexOf("p === 'rate' && method === 'GET'"), billCode.indexOf("p === 'rate' && method === 'POST'"));
  check('/rate: 화상반을 빼고 «신청한» 학생만(aiCount) 정본 aiPrice 로 계산', /live\.has\(/.test(rateGet) && /optIn\.has\(/.test(rateGet) && /aiPrice\(aiCount/.test(rateGet));
  check('/rate: «재원 − 화상반» 옛 식으로 되돌리지 않았다', !/aiCount = g\.enrolled - g\.live/.test(rateGet));

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

/* ══ ⑩ 추천안 ① «자동 분류 + 학원 확인» — 명세 줄의 화상반/A.i반 표시 ═══════
   planItemTrackSync(순수) 를 오려 실제로 돌리고, syncItemTracks 를 진짜 SQLite 에 물려 돌린다.
   「자동으로 뺀다」 옆에 «학원이 손댄 줄은 안 건드린다»·«명부에 없는 학생은 그대로» 를 짝으로 둔다
   — 짝이 없으면 «전부 제외» 나 «학원 확인 무시» 도 통과한다. */
sec('[⑩] 자동 분류 + 학원 확인 — 명세 줄 track·user_set');
{
  let plan = null, syncFn = null;
  try {
    plan = new Function(stripTypeScriptTypes(fnDecl(billSrc, 'planItemTrackSync').replace(/^export\s+/, '')) + '\nreturn planItemTrackSync;')();
  } catch (e) { check('planItemTrackSync 실행 준비', false, e.message); }
  check('planItemTrackSync 를 오려 냈다 (전제)', typeof plan === 'function');
  const P2 = (items, live, roster, opt = roster) => { try { return plan(items, new Set(live), new Set(roster), new Set(opt)); } catch (e) { return [{ err: e.message }]; } };
  if (plan) {
    const r1 = P2([{ id: 1, student_user_id: 'A', included: 1, user_set: 0, track: 'ai' }], ['a'], ['a']);
    check('A.i반이던 학생이 화상반이 되면 자동으로 뺀다 (대소문자 무시)', r1.length === 1 && r1[0].included === 0 && r1[0].track === 'live', JSON.stringify(r1));
    const r2 = P2([{ id: 2, student_user_id: 'b', included: 0, user_set: 0, track: 'live' }], [], ['b']);
    check('화상반이던 학생이 «신청한» A.i 단독이 되면 자동으로 다시 넣는다', r2.length === 1 && r2[0].included === 1 && r2[0].track === 'ai', JSON.stringify(r2));
    const r2b = P2([{ id: 21, student_user_id: 'b2', included: 0, user_set: 0, track: 'live' }], [], ['b2'], []);
    check('(짝) 화상반이 끝나도 신청 안 했으면 «신청 안 함» — 넣지 않는다', r2b.length === 1 && r2b[0].included === 0 && r2b[0].track === 'none', JSON.stringify(r2b));
    const r2c = P2([{ id: 22, student_user_id: 'b3', included: 1, user_set: 0, track: 'ai' }], [], ['b3'], []);
    check('신청 명단에서 빠진 학생은 자동으로 청구에서 뺀다', r2c.length === 1 && r2c[0].included === 0 && r2c[0].track === 'none', JSON.stringify(r2c));
    const r2d = P2([{ id: 23, student_user_id: 'b4', included: 1, user_set: 1, track: 'ai' }], [], ['b4'], []);
    check('(짝) 학원이 확인한 줄은 신청이 없어도 포함 여부를 안 바꾼다 (표시만)', r2d.length === 1 && r2d[0].included === 1 && r2d[0].track === 'none', JSON.stringify(r2d));
    const r3 = P2([{ id: 3, student_user_id: 'c', included: 1, user_set: 1, track: 'live' }], ['c'], ['c']);
    check('(짝) 학원이 확인한 줄(user_set=1)은 포함 여부를 안 바꾼다', r3.length === 0, JSON.stringify(r3));
    const r3b = P2([{ id: 4, student_user_id: 'd', included: 0, user_set: 1, track: 'ai' }], [], ['d']);
    check('(짝) 학원이 뺀 A.i반 학생(퇴원 등)은 자동으로 되살리지 않는다', r3b.length === 0 || r3b[0].included === 0, JSON.stringify(r3b));
    const r4 = P2([{ id: 5, student_user_id: 'e', included: 1, user_set: 0, track: 'ai' }], ['e'], []);
    check('(짝) 명부에 없는 학생은 판정 근거가 없어 그대로 둔다', r4.length === 0, JSON.stringify(r4));
    const r5 = P2([{ id: 6, student_user_id: 'f', included: 1, user_set: 0, track: 'ai' }], [], ['f']);
    check('(짝) 이미 맞는 줄은 쓰지 않는다 (바뀔 때만)', r5.length === 0, JSON.stringify(r5));
    const r6 = P2([{ id: 7, student_user_id: 'g', included: 1, user_set: 0, track: null }], [], ['g']);
    check('옛 줄(track 없음)은 표시만 채운다 (포함 그대로)', r6.length === 1 && r6[0].included === 1 && r6[0].track === 'ai', JSON.stringify(r6));
  }
  if (DatabaseSync) {
    try {
      syncFn = new Function('planItemTrackSync', 'MGB_UNCLAIMED_SQL', 'mgbUnclaimedBinds', stripTypeScriptTypes(fnDecl(billSrc, 'syncItemTracks')) + '\nreturn syncItemTracks;')(plan, UNCLAIMED_SQL, unclaimedBinds);
    } catch (e) { check('syncItemTracks 실행 준비', false, e.message); }
    check('syncItemTracks 를 오려 냈다 (전제)', typeof syncFn === 'function');
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE ai_billing_invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, student_user_id TEXT NOT NULL,
      student_name TEXT, included INTEGER NOT NULL DEFAULT 1, added_manually INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      track TEXT, user_set INTEGER NOT NULL DEFAULT 0, UNIQUE(invoice_id, student_user_id))`);
    d.exec(UNCLAIMED_DDL);
    const ins = d.prepare('INSERT INTO ai_billing_invoice_items (invoice_id,student_user_id,student_name,included,created_at,track,user_set) VALUES (1,?,?,?,0,?,?)');
    ins.run('ai1', 'A1', 1, 'ai', 0);        // 계속 A.i반
    ins.run('turnlive', 'T', 1, 'ai', 0);    // A.i반 → 화상반이 됨 → 자동 제외
    ins.run('confirmed', 'C', 1, 'live', 1); // 학원이 «화상반 아님» 으로 확인해 넣음 → 그대로
    ins.run('left', 'L', 1, 'ai', 0);        // 명부에서 사라짐 → 그대로
    ins.run('wasai', 'W', 1, 'ai', 0);       // 옛 규칙으로 포함됐지만 신청 안 함 → 자동 제외
    const mk = (sql) => { const st = d.prepare(sql); const bound = (a) => ({ _st: st, _a: a,
      all: async () => ({ results: st.all(...a) }), run: async () => { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } });
      return { bind: (...a) => bound(a) }; };
    const env = { DB: { prepare: mk, batch: async (arr) => arr.map((b) => { const r = b._st.run(...b._a); return { meta: { changes: Number(r.changes) } }; }) } };
    const aiRows = [{ user_id: 'ai1', name: 'A1' }];
    const liveRows = [{ user_id: 'turnlive', name: 'T' }, { user_id: 'confirmed', name: 'C' }, { user_id: 'newlive', name: 'N' }];
    const live = new Set(['turnlive', 'confirmed', 'newlive']);
    const idleRows = [{ user_id: 'wasai', name: 'W' }, { user_id: 'idle1', name: 'I' }];
    let res = null;
    try { res = await syncFn(env, 1, liveRows, aiRows, live, 0, 0, idleRows); } catch (e) { res = { err: e.message }; }
    const row = (u) => d.prepare('SELECT included, track, user_set FROM ai_billing_invoice_items WHERE student_user_id=?').get(u) || {};
    check('새 화상반 학생은 «체크 해제된 줄» 로 명세에 보인다', row('newlive').included === 0 && row('newlive').track === 'live', JSON.stringify(row('newlive')));
    check('A.i반→화상반 학생은 자동 제외된다', row('turnlive').included === 0 && row('turnlive').track === 'live', JSON.stringify(row('turnlive')));
    check('(짝) 학원이 확인해 넣은 학생은 그대로 포함', row('confirmed').included === 1 && row('confirmed').user_set === 1, JSON.stringify(row('confirmed')));
    check('(짝) A.i반 학생은 그대로 포함', row('ai1').included === 1 && row('ai1').track === 'ai');
    check('(짝) 명부에서 사라진 학생은 손대지 않는다', row('left').included === 1);
    check('신청 안 한 학원생은 «체크 해제된 줄»(none) 로 보인다', row('idle1').included === 0 && row('idle1').track === 'none', JSON.stringify(row('idle1')));
    check('옛 규칙으로 들어간 미신청 학생은 자동 제외된다', row('wasai').included === 0 && row('wasai').track === 'none', JSON.stringify(row('wasai')));
    check('결과 숫자: 새로 보인 화상반 1 · 신청 안 함 1 · 자동 제외 2', res && res.live_listed === 1 && res.idle_listed === 1 && res.auto_excluded === 2, JSON.stringify(res));
    /* (2026-10-23) ③ 결제 «승인 중» 인 청구서는 자동 동기화도 체크를 안 바꾼다(낸 돈과 열린 학생 수가 갈리지 않게) · 선점이 낡으면 바꾼다(짝) */
    d.prepare("INSERT INTO ai_billing_invoice_items (invoice_id,student_user_id,student_name,included,created_at,track,user_set) VALUES (2,'tl2','T2',1,0,'ai',0)").run();
    d.prepare('UPDATE ai_billing_invoices SET confirming_order=?, confirming_at=? WHERE id=2').run('MGB-2-HOLD-a', Date.now());
    const tl2 = () => d.prepare("SELECT included FROM ai_billing_invoice_items WHERE invoice_id=2 AND student_user_id='tl2'").get()?.included;
    try { await syncFn(env, 2, [{ user_id: 'tl2', name: 'T2' }], [], new Set(['tl2']), 0, 0, []); } catch (e) { check('승인 중 동기화 실행', false, e.message); }
    check('③ 결제 승인 중이면 자동 동기화가 체크를 안 바꾼다', tl2() === 1, tl2());
    d.prepare('UPDATE ai_billing_invoices SET confirming_at=? WHERE id=2').run(Date.now() - 10 * 60 * 1000);
    try { await syncFn(env, 2, [{ user_id: 'tl2', name: 'T2' }], [], new Set(['tl2']), 0, 0, []); } catch (e) { check('낡은 선점 동기화 실행', false, e.message); }
    check('③ (짝) 선점이 5분 넘게 낡았으면 자동 동기화가 바꾼다', tl2() === 0, tl2());
    check('③ (전제) 승인 중 조건을 정본에서 읽었다', UNCLAIMED_SQL.includes('confirming_order'));
    const bad = { DB: { prepare: () => { throw new Error('no such column: track'); }, batch: async () => [] } };
    let r7; try { r7 = await syncFn(bad, 1, liveRows, aiRows, live, 0, 0, idleRows); } catch (e) { r7 = 'threw'; }
    check('칸이 없는 DB 에서도 던지지 않는다 (옛 동작으로 남음)', r7 !== 'threw' && r7.auto_excluded === 0, JSON.stringify(r7));
  }
  const gen = fnDecl(billCode, 'generateOrRefreshInvoice');
  check('배선: 생성·보강이 syncItemTracks 를 부르고 화상반 명단을 넘긴다', /syncItemTracks\(env, invoiceId, rosterR\.live_rows/.test(gen));
  check('배선: 명부가 비어도 분류 동기화까지 간다 (옛 조기 return 제거)', !/if \(!roster\.length\) return/.test(gen));
  const item = billCode.slice(billCode.indexOf("p === 'invoice/item'"), billCode.indexOf("p === 'history'"));
  /* (2026-10-20) 한 명·여러 명 경로가 같은 정본(setItemsIncluded)을 쓰게 바뀌었다 — «SQL 이 그 라우트 안에 있는가»(식 모양)
     대신 «정본이 user_set=1 을 쓰는가» + «두 라우트가 그 정본을 부르는가» 로 묻는다. */
  const setInc = fnDecl(billCode, 'setItemsIncluded');
  check('배선: 학원이 체크를 바꾸면 user_set=1 (학원 확인) — 정본 setItemsIncluded', /included = \?, user_set = 1/.test(setInc));
  check('배선: 한 명 경로(invoice/item)가 정본을 부른다', /setItemsIncluded\(env, invoiceId, inv\.shop_name, \[studentUid\]/.test(item));
  const items2 = billCode.slice(billCode.indexOf("p === 'invoice/items'"), billCode.indexOf("p === 'history'"));
  check('배선: 여러 명 경로(invoice/items)가 쓰기 권한·draft 를 보고 정본을 부른다',
    /writeAllowed\(env, request, inv\.shop_name\)/.test(items2) && /inv\.status !== 'draft'/.test(items2) && /setItemsIncluded\(env, invoiceId, inv\.shop_name, uids/.test(items2));
  check('(짝) setItemsIncluded 선언은 정확히 하나', (billCode.match(/function setItemsIncluded\(/g) || []).length === 1);
  check('배선: 명세 GET 이 track·user_set 을 싣는다', /SELECT id, student_user_id, student_name, included, added_manually, track, COALESCE\(user_set,0\)/.test(billCode));
  for (const f of ['branch.html', 'manager.html']) {
    const h = stripComments(readFileSync(join(PUB, f), 'utf8'));
    const body = fnDecl(h, 'paintAiBill');
    check(`${f}: 화상반 줄을 따로 모아 그린다 (track === 'live')`, /it\.track === 'live'/.test(body) && /lvIt\.map\(itemRow\)/.test(body));
    check(`${f}: 학원 확인 표시(user_set)를 그린다`, /user_set\) === 1/.test(body));
    check(`${f}: (짝) A.i반 줄도 그대로 그린다`, /aiIt\.map\(itemRow\)/.test(body));
  }
}

/* ══ ⑪ 월 자동 청구 «마지막 결과» — 실패가 조용히 사라지지 않는가 ══════════
   generateMonthlyAiInvoices·recordCronRun·readCronRun 을 오려 가짜 부품으로 «실제로» 돌린다.
   «실패를 적는다» 옆에 «성공도 적는다»·«적기가 실패해도 안 던진다» 를 짝으로 둔다. */
sec('[⑪] 월 자동 청구 결과 기록 — 실패가 보이는가');
{
  let mk = null;
  try {
    const src = [fnDecl(billSrc, 'generateMonthlyAiInvoices'), fnDecl(billSrc, 'recordCronRun'), fnDecl(billSrc, 'readCronRun')]
      .map(d => stripTypeScriptTypes(d.replace(/^export\s+/, ''))).join('\n');
    mk = new Function('ensureSchema', 'safe', 'enrolledCond', 'monthAdd', 'currentMonthKST', 'loadLiveUids', 'generateOrRefreshInvoice', 'billingEnabled', 'loadAiOptIns',
      src + '\nreturn { gen: generateMonthlyAiInvoices, read: readCronRun };');
  } catch (e) { check('월 cron 함수 실행 준비', false, e.message); }
  check('월 cron 세 함수를 오려 냈다 (전제)', typeof mk === 'function');
  if (mk && DatabaseSync) {
    const safeF = async (fn, fb) => { try { return await fn(); } catch { return fb; } };
    const mkEnv = (shops, opts = {}) => {
      const d = new DatabaseSync(':memory:');
      d.exec('CREATE TABLE ai_billing_meta (k TEXT PRIMARY KEY, v TEXT, at INTEGER NOT NULL)');
      const prep = (sql) => {
        if (/FROM students_erp/.test(sql)) return { all: async () => { if (opts.shopsThrow) throw new Error('boom'); return { results: shops.map(x => ({ shop_name: x })) }; } };
        if (opts.metaThrow && /ai_billing_meta/.test(sql)) throw new Error('no such table');
        const st = d.prepare(sql);
        return { bind: (...a) => ({ run: async () => st.run(...a), first: async () => st.get(...a) || null }), first: async () => st.get() || null };
      };
      return { d, env: { DB: { prepare: prep } } };
    };
    const run = async (shops, live, genImpl, opts) => {
      const { d, env } = mkEnv(shops, opts);
      const o = opts || {};
      const f = mk(async () => {}, safeF, () => '1=1', (m) => '2026-10', () => '2026-09', async () => live, genImpl,
        async () => o.enabled !== false, async () => (o.optIn === undefined ? new Set(['x']) : o.optIn));
      let r; try { r = await f.gen(env); } catch (e) { r = { threw: e.message }; }
      let last; try { last = await f.read(env); } catch (e) { last = { threw: e.message }; }
      return { r, last };
    };
    let genCalls = 0;
    const okGen = async (_e, shop) => { genCalls++; return { invoice_id: 1, added: 2, created: true }; };
    genCalls = 0;
    const off = await run(['A', 'B'], new Set(), okGen, { enabled: false });
    check('자동 청구가 꺼져 있으면(기본·테스트 기간) 청구서 0장 + «disabled» 기록', off.last && off.last.status === 'disabled' && off.r.invoices === 0 && genCalls === 0, JSON.stringify({ last: off.last, genCalls }));
    const noOpt = await run(['A', 'B'], new Set(), okGen, { optIn: null });
    check('신청 명단 조회 실패 → «live_check_failed» (청구서 0장)', noOpt.last && noOpt.last.status === 'live_check_failed' && noOpt.r.invoices === 0, JSON.stringify(noOpt.last));
    const skGen = async (_e, shop) => shop === 'B' ? { invoice_id: 0, added: 0, created: false, skipped: true } : { invoice_id: 1, added: 1, created: true };
    const sk = await run(['A', 'B'], new Set(), skGen);
    check('신청이 없는 학원은 건너뛴 것으로 센다 (실패 아님 · 빈 청구서 없음)', sk.last && sk.last.status === 'ok' && sk.last.skipped === 1 && sk.last.invoices === 1 && sk.last.failed === 0, JSON.stringify(sk.last));
    const a = await run(['A', 'B'], new Set(), okGen);
    check('(짝) 켜져 있으면 성공하면 «ok» 와 숫자를 남긴다', a.last && a.last.status === 'ok' && a.last.invoices === 2 && a.last.added === 4 && a.last.month === '2026-10' && a.last.at > 0, JSON.stringify(a.last));
    const b = await run(['A', 'B'], null, okGen);
    check('화상반 조회 실패 → «live_check_failed» 가 남는다 (청구서 0장)', b.last && b.last.status === 'live_check_failed' && b.r.invoices === 0, JSON.stringify(b.last));
    const c = await run(['A'], new Set(), okGen, { shopsThrow: true });
    check('대리점 목록 실패 → «shops_failed» (0곳 «할 일 없음» 으로 위장하지 않는다)', c.last && c.last.status === 'shops_failed', JSON.stringify(c.last));
    const e2 = await run([], new Set(), okGen);
    check('(짝) 대리점이 정말 0곳이면 «ok»', e2.last && e2.last.status === 'ok' && e2.last.agencies === 0, JSON.stringify(e2.last));
    const pGen = async (_e, shop) => shop === 'B' ? { invoice_id: 0, added: 0, created: false, live_check_failed: true } : { invoice_id: 1, added: 1, created: true };
    const f2 = await run(['A', 'B', 'C'], new Set(), pGen);
    check('일부 대리점 실패 → «partial» + 실패 수', f2.last && f2.last.status === 'partial' && f2.last.failed === 1 && f2.last.invoices === 2, JSON.stringify(f2.last));
    const g = await run(['A'], new Set(), okGen, { metaThrow: true });
    check('기록이 실패해도 월 cron 은 던지지 않고 결과를 돌려준다', !g.r.threw && g.r.invoices === 1, JSON.stringify(g.r));
    check('(짝) 기록을 못 읽으면 null (지어내지 않는다)', g.last === null, JSON.stringify(g.last));
  }
  const rateGet = billCode.slice(billCode.indexOf("p === 'rate' && method === 'GET'"), billCode.indexOf("p === 'rate' && method === 'POST'"));
  check('배선: /rate 응답에 last_cron 을 싣는다', /last_cron: await readCronRun\(env\)/.test(rateGet));

  // 관리자 카드 한 줄 — renderCron 을 오려 가짜 DOM 으로 돌린다
  const admSrc = readFileSync(join(PUB, 'js/adm-ai-billing.js'), 'utf8');
  let rc = null, box = null;
  try {
    box = { id: 'aib-cron', style: {}, textContent: '' };
    const els = { 'aib-cron': box };
    rc = new Function('el', 'L', 'isEn', 'num', 'esc', 'var LAST_CRON;\n' + fnDecl(admSrc, 'renderCron') + '\nreturn renderCron;')(
      (id) => els[id] || null, (ko) => ko, () => false, (n) => String(n), (x) => String(x));
  } catch (e) { check('renderCron 실행 준비', false, e.message); }
  check('renderCron 을 오려 냈다 (전제)', typeof rc === 'function');
  if (rc) {
    const draw = (c) => { try { rc(c); return { t: box.textContent, col: box.style.color }; } catch (e) { return { t: 'threw:' + e.message }; } };
    const x1 = draw({ status: 'live_check_failed', month: '2026-10', at: 1790000000000, agencies: 376, invoices: 0, added: 0 });
    check('실패는 빨간 글자 + «한 장도 만들지 않았습니다» + 할 일', x1.col === '#b91c1c' && /한 장도 만들지 않았습니다/.test(x1.t) && /청구서 만들기/.test(x1.t), JSON.stringify(x1));
    const x2 = draw({ status: 'ok', month: '2026-10', at: 1790000000000, agencies: 376, invoices: 376, added: 6900 });
    check('(짝) 성공은 회색 글자 + 숫자', x2.col === '#475467' && /청구서 376장/.test(x2.t) && !/⚠/.test(x2.t), JSON.stringify(x2));
    const x3 = draw({ status: 'partial', month: '2026-10', at: 1790000000000, agencies: 3, invoices: 2, added: 2, failed: 1 });
    check('일부 실패는 빨간 글자 + 실패 수', x3.col === '#b91c1c' && /1곳은 만들지 못했습니다/.test(x3.t), JSON.stringify(x3));
    const x4 = draw(null);
    check('(짝) 기록이 없으면 «아직 실행 기록이 없습니다» (지어내지 않는다)', /아직 실행 기록이 없습니다/.test(x4.t), JSON.stringify(x4));
  }
  check('배선: 불러오기·언어 전환 때 renderCron 을 부른다', /renderCron\(d\.last_cron\)/.test(admSrc) && /renderCron\(LAST_CRON\)/.test(admSrc));
  check('admin.html 이 adm-ai-billing.js ?v=3 이상을 부른다', /adm-ai-billing\.js\?v=([3-9]|\d\d)/.test(readFileSync(join(PUB, 'admin.html'), 'utf8')));
}

/* ══ ⑫ (2026-10-20) AI 컨텐츠 결제 — 명단 쓰기는 «그 청구서 명세에 있는 학생» 에게만 · 선결제 마감 ══════════
   setItemsIncluded 를 오려 진짜 SQLite 로 돌린다. «넣는다» 옆에 «명세에 없는 아이디(다른 학원 학생)는 안 건드린다» 를 짝으로
   — 예전 한 명 경로는 아무 아이디나 받아 ai_billing_optin 에 넣거나 지웠다(다른 학원 청구가 붙거나 빠짐). */
sec('[⑫] AI 컨텐츠 결제 — 명세에 있는 학생만 · 선결제 마감');
{
  let setFn = null;
  try {
    setFn = new Function('safe', 'ensureB2bClaimColumns', 'MGB_UNCLAIMED_SQL', 'mgbUnclaimedBinds', stripTypeScriptTypes(fnDecl(billSrc, 'setItemsIncluded')) + '\nreturn setItemsIncluded;')(
      async (fn, fb) => { try { return await fn(); } catch { return fb; } }, async () => {}, UNCLAIMED_SQL, unclaimedBinds);
  } catch (e) { check('setItemsIncluded 실행 준비', false, e.message); }
  check('setItemsIncluded 를 오려 냈다 (전제)', typeof setFn === 'function');
  if (setFn && DatabaseSync) {
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE ai_billing_invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL, student_user_id TEXT NOT NULL,
      student_name TEXT, included INTEGER NOT NULL DEFAULT 1, added_manually INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
      track TEXT, user_set INTEGER NOT NULL DEFAULT 0, UNIQUE(invoice_id, student_user_id));
      CREATE TABLE ai_billing_optin (uid_lc TEXT PRIMARY KEY, user_id TEXT NOT NULL, shop_name TEXT, created_at INTEGER NOT NULL, created_by TEXT);`);
    d.exec(UNCLAIMED_DDL);
    const ins = d.prepare('INSERT INTO ai_billing_invoice_items (invoice_id,student_user_id,student_name,included,created_at,track,user_set) VALUES (?,?,?,?,0,?,0)');
    ins.run(1, 'Kid1', 'K1', 0, 'none'); ins.run(1, 'kid2', 'K2', 0, 'none'); ins.run(1, 'vid', 'V', 0, 'live');
    ins.run(2, 'other', 'O', 1, 'ai');   // 다른 학원 청구서의 학생
    d.prepare('INSERT INTO ai_billing_optin VALUES (?,?,?,0,?)').run('other', 'other', '남의학원', 'x');
    const mk = (sql) => { const st = d.prepare(sql); const bound = (a) => ({ _st: st, _a: a,
      all: async () => ({ results: st.all(...a) }), run: async () => { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } });
      return { bind: (...a) => bound(a) }; };
    const env = { DB: { prepare: mk, batch: async (arr) => arr.map((b) => { const r = b._st.run(...b._a); return { meta: { changes: Number(r.changes) } }; }) } };
    const opt = () => d.prepare('SELECT uid_lc FROM ai_billing_optin ORDER BY uid_lc').all().map(r => r.uid_lc).join(',');
    const row = (inv, u) => d.prepare('SELECT included, track, user_set FROM ai_billing_invoice_items WHERE invoice_id=? AND student_user_id=?').get(inv, u) || {};
    let r1; try { r1 = await setFn(env, 1, '우리학원', ['Kid1', 'kid2', 'other', 'ghost'], 1, 'agency'); } catch (e) { r1 = { err: e.message }; }
    check('여러 명을 한 번에 넣는다 — 명세에 있는 둘만 바뀐다', r1 && r1.ok === true && r1.changed.length === 2 && row(1, 'Kid1').included === 1 && row(1, 'kid2').included === 1, JSON.stringify(r1));
    check('넣은 줄은 user_set=1 · track=ai (학원 확인)', row(1, 'Kid1').user_set === 1 && row(1, 'Kid1').track === 'ai', JSON.stringify(row(1, 'Kid1')));
    check('명세에 없는 아이디는 «모름» 으로 돌려준다', r1 && r1.unknown && r1.unknown.length === 2, JSON.stringify(r1));
    check('(짝) 다른 학원 학생의 명세 줄은 안 건드린다', row(2, 'other').included === 1);
    check('신청 명단: 넣은 둘만 들어가고(소문자) 다른 학원 신청은 그대로', opt() === 'kid1,kid2,other', opt());
    let r2; try { r2 = await setFn(env, 1, '우리학원', ['other'], 0, 'agency'); } catch (e) { r2 = { err: e.message }; }
    check('(짝) 명세에 없는 학생을 «빼기» 로 보내도 그 학원 신청이 안 지워진다', r2 && r2.changed.length === 0 && opt().includes('other'), JSON.stringify(r2) + ' ' + opt());
    let r3; try { r3 = await setFn(env, 1, '우리학원', ['vid'], 1, 'agency'); } catch (e) { r3 = { err: e.message }; }
    check('화상반 줄을 학원이 넣으면 포함되고 track 표시는 live 그대로', r3 && r3.ok && row(1, 'vid').included === 1 && row(1, 'vid').track === 'live', JSON.stringify(row(1, 'vid')));
    let r4; try { r4 = await setFn(env, 1, '우리학원', ['Kid1'], 0, 'agency'); } catch (e) { r4 = { err: e.message }; }
    check('빼면 명세에서 빠지고 신청 명단에서도 빠진다', r4 && r4.ok && row(1, 'Kid1').included === 0 && !opt().split(',').includes('kid1'), opt());
  }
  // 선결제 마감 — 이용 달의 «전 달 말일». 시각은 KST.
  let due = null;
  try { due = new Function(stripTypeScriptTypes(fnDecl(billSrc, 'prepayDue').replace(/^export\s+/, '')).replace('isValidMonth(billingMonth)', '/^\\d{4}-\\d{2}$/.test(billingMonth)') + '\nreturn prepayDue;')(); }
  catch (e) { check('prepayDue 실행 준비', false, e.message); }
  check('prepayDue 를 오려 냈다 (전제)', typeof due === 'function');
  if (due) {
    const at = (iso) => Date.parse(iso);
    const a = due('2026-11', at('2026-10-20T00:30:00+09:00'));
    check('11월 이용분 → 마감 10월 31일 · D-11 (KST)', a.due_date === '2026-10-31' && a.days_left === 11, JSON.stringify(a));
    const b = due('2027-01', at('2026-12-31T23:59:00+09:00'));
    check('1월 이용분 → 마감 12월 31일 · 오늘(0)', b.due_date === '2026-12-31' && b.days_left === 0, JSON.stringify(b));
    const c = due('2026-03', at('2026-03-02T09:00:00+09:00'));
    check('3월 이용분 → 마감 2월 28일 · 지남(음수)', c.due_date === '2026-02-28' && c.days_left < 0, JSON.stringify(c));
    const e2 = due('2026/11', Date.now());
    check('(짝) 형식이 틀리면 «모름»(지어내지 않는다)', e2.due_date === '' && e2.days_left === null, JSON.stringify(e2));
    const k = due('2026-11', at('2026-10-31T23:30:00+09:00'));
    check('KST 기준 — UTC 로는 31일 14:30 이어도 «오늘 마감»(0)', k.days_left === 0, JSON.stringify(k));
  }
  const invGet = billCode.slice(billCode.indexOf("p === 'invoice' && method === 'GET'"), billCode.indexOf("p === 'invoice/generate'"));
  // (2026-10-23) 꺼짐 갈래는 «안 낸 달» 이 필요 없어 ...prepayDue(month) 를 직접 싣는다 — 셋 다 마감을 싣는지는 그대로 본다
  check('배선: /invoice 응답 셋 모두 마감(...due)을 싣는다', (invGet.match(/\.\.\.(due\b|prepayDue\(month\)\s*\})/g) || []).length === 3);
  // 화면 — 마감은 서버 값을 그린다 · 결제 금액을 화면이 계산하지 않는다 · 돈 화면 캐시 없음
  const mgr = stripComments(readFileSync(join(PUB, 'manager.html'), 'utf8'));
  const due2 = fnDecl(mgr, 'aibDueBar');
  check('manager.html: 마감 띠는 서버의 due_date·days_left 를 그린다 (Date 계산 없음)', /j\.due_date/.test(due2) && /j\.days_left/.test(due2) && !/new Date\(/.test(due2));
  const load = mgr.slice(mgr.indexOf('window.loadAiBill = function'), mgr.indexOf('window.aiBillGenerate'));
  check('manager.html: AI 컨텐츠 결제는 localStorage 캐시 키를 쓰지 않는다', /get\('\/api\/admin\/ai-billing\/invoice'( \+ |\))/.test(load) && /get\('\/api\/admin\/ai-billing\/history'\)/.test(load));
  const bulk = mgr.slice(mgr.indexOf('window.aiBillBulk = function'), mgr.indexOf('window.aiBillFilter'));
  check('manager.html: 일괄 선택은 invoice/items 를 한 번 부르고 먼저 묻는다', /\/api\/admin\/ai-billing\/invoice\/items/.test(bulk) && /window\.confirm\(/.test(bulk));
  check('manager.html: 메뉴 이름 — «화상영어 수업료 결제» · «AI 컨텐츠 결제»', /data-ko="화상영어 수업료 결제"/.test(mgr) && /data-ko="AI 컨텐츠 결제"/.test(mgr) && !/data-ko="AI 사용료 청구서"/.test(mgr) && !/data-ko="수업료 결제"/.test(mgr));
}

/* ══ ⑬ 테스트 대리점 예외 (2026-10-25) — 전체 스위치가 꺼져 있어도 «그 대리점만» 열린다 ══
   판정·조회를 오려 내 실제로 돌린다. «열린다» 와 «남은 안 열린다»·«못 읽으면 안 열린다» 를 짝으로 본다. */
sec('[⑬] 테스트 대리점 예외 — 그 대리점만 열리고, cron 은 그대로');
{
  let openFor = null, enabledFor = null;
  try {
    openFor = new Function(stripTypeScriptTypes(fnDecl(billSrc, 'aiBillingOpenFor').replace(/^export\s+/, '')) + '\nreturn aiBillingOpenFor;')();
    const accM = billSrc.match(/export const AI_BILLING_TEST_ACCOUNTS[^=]*=\s*(\[[^\]]*\])/);
    const accounts = accM ? JSON.parse(accM[1].replace(/'/g, '"')) : null;
    check('예외 계정 목록을 소스에서 읽었다 (ptagency 포함)', Array.isArray(accounts) && accounts.includes('ptagency'), accM && accM[1]);
    enabledFor = (globalOn, dbFn) => new Function('AI_BILLING_TEST_ACCOUNTS', 'billingEnabled', 'aiBillingOpenFor',
      stripTypeScriptTypes(fnDecl(billSrc, 'aiBillingTestShops')) + '\n' + stripTypeScriptTypes(fnDecl(billSrc, 'billingEnabledFor').replace(/^export\s+/, '')) + '\nreturn billingEnabledFor;'
    )(accounts || [], async () => globalOn, openFor);
  } catch (e) { check('판정 함수를 오려 냈다', false, String(e && e.message || e)); }
  if (openFor) {
    const T = new Set(['결제 테스트 대리점']);
    check('스위치 꺼짐 + 예외 대리점 → 열림', openFor(false, T, '결제 테스트 대리점') === true);
    check('(짝) 스위치 꺼짐 + 다른 대리점 → 닫힘', openFor(false, T, '망고아이 강남 대리점') === false);
    check('(짝) 스위치 꺼짐 + 빈 이름 → 닫힘', openFor(false, new Set(['']), '') === false);
    check('스위치 켜짐이면 누구나 열림(예전 동작)', openFor(true, new Set(), '망고아이 강남 대리점') === true);
  }
  if (enabledFor) {
    let lastSql = '', lastBinds = [];
    const db = (rows, throws) => ({ prepare(sql) { lastSql = sql; return { bind(...b) { lastBinds = b; return { async all() { if (throws) throw new Error('D1 down'); return { results: rows }; } }; } }; } });
    const run = async (globalOn, rows, throws, shop) => { try { return await enabledFor(globalOn)({ DB: db(rows, throws) }, shop); } catch (e) { return 'THREW:' + e.message; } };
    check('예외 계정의 대리점(admin_scope) → 열림', await run(false, [{ scope_value: '결제 테스트 대리점' }], false, '결제 테스트 대리점') === true);
    check('조회는 agency 스코프·계정 아이디(소문자)로만', /scope_type = 'agency'/.test(lastSql) && /LOWER\(username\)/.test(lastSql) && lastBinds.includes('ptagency'), lastSql + ' ' + JSON.stringify(lastBinds));
    check('(짝) 다른 대리점 → 닫힘', await run(false, [{ scope_value: '결제 테스트 대리점' }], false, '망고아이 강남 대리점') === false);
    check('(짝) 조회 실패 → 닫힘(던지지 않음)', await run(false, [], true, '결제 테스트 대리점') === false);
    check('(짝) 계정이 대리점이 아니면(행 없음) → 닫힘', await run(false, [], false, '결제 테스트 대리점') === false);
    check('스위치 켜짐 → 조회 없이 열림', await run(true, [], true, '아무 대리점') === true);
  }
  // 배선 — 학원 화면이 타는 세 갈래는 예외를 보고, 월 cron·HQ 스위치는 전체 스위치만 본다
  const seg = (a, b) => billCode.slice(billCode.indexOf(a), billCode.indexOf(b));
  check('배선: GET /invoice 는 billingEnabledFor(env, shopName)', /billingEnabledFor\(env, shopName\)/.test(seg("p === 'invoice' && method === 'GET'", "p === 'invoice/generate'")));
  check('배선: invoice/generate 는 billingEnabledFor(env, shopName)', /billingEnabledFor\(env, shopName\)/.test(seg("p === 'invoice/generate'", "p === 'invoice/item'")));
  check('배선: invoice/checkout 는 billingEnabledFor(env, inv.shop_name)', /billingEnabledFor\(env, inv\.shop_name\)/.test(seg("p === 'invoice/checkout'", 'const amount = invoiceAmount')));
  const mon2 = stripComments(fnDecl(billSrc, 'generateMonthlyAiInvoices'));
  check('(짝) 월 cron 은 예외를 보지 않는다 — 전체 스위치만', /billingEnabled\(env\)/.test(mon2) && !/billingEnabledFor|AI_BILLING_TEST/.test(mon2));
}


// ── ⑭ (2026-10-25) 빈 DB 에서 표가 실제로 생기는가 · 청구서 조회 실패가 internal_error 로 던지지 않는가 ──
console.log('\n⑭ ensureSchema 실제 실행 · GET /invoice 조회 가드');
{
  let mkEnsure = null;
  try {
    const decl = fnDecl(billSrc, 'ensureSchema');
    mkEnsure = () => new Function('safe', 'let _ensured = false;\n' + stripTypeScriptTypes(decl) + '\nreturn ensureSchema;')(async (f, fb) => { try { return await f(); } catch { return fb; } });
  } catch (e) { check('전제: ensureSchema 를 오려 냈다', false, e.message); }
  if (mkEnsure && DatabaseSync) {
    const envOf = (d, failIdx = -1) => { let n = 0; return { DB: {
      prepare: (sql) => ({ run: async () => { const i = n++; if (/^\s*CREATE/i.test(sql) && i === failIdx) throw new Error('boom'); d.exec(sql); return {}; }, bind: () => ({ run: async () => {} }) }),
      exec: async (sql) => { throw new Error('multi-line exec not supported'); },
    } }; };
    const tables = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const d1 = new DatabaseSync(':memory:');
    const ens = mkEnsure();
    try { await ens(envOf(d1)); } catch (e) { check('ensureSchema 가 던지지 않는다', false, e.message); }
    const t = tables(d1);
    check('빈 DB 에 청구서·명세·메타·신청 표가 생긴다(exec 를 못 써도)', ['ai_billing_invoices','ai_billing_invoice_items','ai_billing_meta','ai_billing_optin','agency_ai_rate'].every(x => t.includes(x)), t.join(','));
    check('price_rule·track·user_set 칸이 붙는다', ['price_rule'].every(c => d1.prepare("PRAGMA table_info(ai_billing_invoices)").all().some(r => r.name === c)) && ['track','user_set'].every(c => d1.prepare("PRAGMA table_info(ai_billing_invoice_items)").all().some(r => r.name === c)));
    // 핵심 표가 실패하면 다음 호출이 다시 시도한다(_ensured 를 세우지 않는다)
    const d2 = new DatabaseSync(':memory:');
    const ens2 = mkEnsure();
    await ens2(envOf(d2, 1));
    check('(짝) 청구서 표 생성이 실패하면 그 표는 없다', !tables(d2).includes('ai_billing_invoices'));
    await ens2(envOf(d2));
    check('(짝) 다음 요청이 다시 시도해 표가 생긴다', tables(d2).includes('ai_billing_invoices'));
  }
  const g = billCode.slice(billCode.indexOf("p === 'invoice' && method === 'GET'"), billCode.indexOf("p === 'invoice/generate'"));
  check('GET /invoice 의 청구서 조회는 .catch 로 감싸져 있다(던지면 internal_error)', /FROM ai_billing_invoices WHERE shop_name = \? AND billing_month = \?`\s*\)\.bind\(shopName, month\)\.first<any>\(\)\.catch/.test(g));
  check('조회 실패는 «무엇이 실패했는지» 를 말하는 503', /invoice_lookup_failed/.test(g) && /, 503\)/.test(g));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }

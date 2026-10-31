#!/usr/bin/env node
/**
 * 🤖 결재 자동화 5단계 (2026-09-24) — 월초 요약 · «모두 확인»
 *
 * 무엇을 지키나
 *   ① monthlySlotKst — 1일 KST 9시에만 «지난달» 을 준다(1월이면 작년 12월). 8시·2일은 null(짝).
 *   ② kstMonthRange — 달의 경계가 KST 자정이다(시작은 포함, 다음 달 시작은 제외 — 진짜 SQLite 로).
 *   ③ monthlyReportLines — 0건이면 안 보낸다 · 통화를 섞지 않는다 · 취소 결재는 지출이 아니다 ·
 *      대기 건이 있을 때만 경고 줄(짝).
 *   ④ 배선 — 15분 점검 안에서, KV 에 «보냈다» 를 «알림보다 먼저» 적고, KV 가 없으면 안 보낸다.
 *   ⑤ 화면 «모두 확인» — 실제로 돌린다: 하나씩 순서대로, 이미 확인된 건은 성공으로, 실패는 남긴다,
 *      취소를 누르면 한 건도 안 보낸다(짝). 2건 이상일 때만 버튼(짝).
 *   ⑥ ackOne — 서버가 주는 already_acked 를 성공으로 친다(옛 판정은 error 이름만 봐서 실패로 그렸다).
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
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const kst = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h) - 9 * 3600_000;

console.log('\n① monthlySlotKst — 1일 KST 9시에만');
ok('10/1 09:00 → 2026-09', P.monthlySlotKst(kst(2026, 10, 1, 9)) === '2026-09');
ok('10/1 09:45 → 2026-09 (그 시 안)', P.monthlySlotKst(kst(2026, 10, 1, 9) + 45 * 60000) === '2026-09');
ok('1/1 09:00 → 작년 12월', P.monthlySlotKst(kst(2027, 1, 1, 9)) === '2026-12');
ok('10/1 08:59 → null', P.monthlySlotKst(kst(2026, 10, 1, 9) - 60000) === null);
ok('10/1 10:00 → null', P.monthlySlotKst(kst(2026, 10, 1, 10)) === null);
ok('10/2 09:00 → null', P.monthlySlotKst(kst(2026, 10, 2, 9)) === null);
ok('UTC 로는 1일 09시지만 KST 로는 1일 18시 → null', P.monthlySlotKst(Date.UTC(2026, 9, 1, 9)) === null);

console.log('\n② kstMonthRange — 경계는 KST 자정 (진짜 SQLite)');
{
  const r = P.kstMonthRange('2026-09');
  ok('9월 시작 = 9/1 00:00 KST', r && r[0] === kst(2026, 9, 1, 0));
  ok('9월 끝 = 10/1 00:00 KST', r && r[1] === kst(2026, 10, 1, 0));
  const d = P.kstMonthRange('2026-12');
  ok('12월 끝 = 다음 해 1/1', d && d[1] === kst(2027, 1, 1, 0));
  ok('형식이 아니면 null', P.kstMonthRange('2026-13') === null && P.kstMonthRange('') === null && P.kstMonthRange(null) === null);
  const sw = bodyAt(API, API.indexOf('> {', API.indexOf('export async function runApprovalSlaSweep')) + 1);
  const m = sw.match(/`(SELECT req_type, status[\s\S]*?)`/);
  ok('월간 조회 SQL 을 찾았다(전제)', !!m);
  if (m) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE approval_requests (id INTEGER PRIMARY KEY, req_type TEXT, status TEXT, category TEXT,
      amount REAL, currency TEXT, spent_at TEXT, created_at INTEGER, file_key TEXT, reverses_id INTEGER,
      requester_username TEXT, requester_name TEXT, origin_id INTEGER)`);
    const ins = db.prepare('INSERT INTO approval_requests (id, created_at, status) VALUES (?,?,?)');
    ins.run(1, r[0] - 1, 'approved');     // 8/31 23:59:59.999 KST — 빠져야
    ins.run(2, r[0], 'approved');         // 9/1 00:00 KST — 들어가야
    ins.run(3, r[1] - 1, 'approved');     // 9/30 끝 — 들어가야
    ins.run(4, r[1], 'approved');         // 10/1 00:00 — 빠져야
    const got = db.prepare(m[1]).all(r[0], r[1]).map(x => x.created_at);
    ok('시작은 포함 · 다음 달 시작은 제외', got.length === 2 && got.includes(r[0]) && got.includes(r[1] - 1) && !got.includes(r[1]));
  }
}

console.log('\n③ monthlyReportLines');
{
  ok('0건이면 빈 배열(안 보낸다)', P.monthlyReportLines('2026-09', P.summarizeApprovals([])).length === 0);
  const rows = [
    { req_type: 'purchase', status: 'approved', amount: 1000, currency: 'PHP', category: 'supplies', created_at: kst(2026, 9, 3, 10) },
    { req_type: 'purchase', status: 'approved', amount: 2500, currency: 'PHP', category: 'supplies', created_at: kst(2026, 9, 4, 10) },
    { req_type: 'expense',  status: 'approved', amount: 50000, currency: 'KRW', category: 'meal', created_at: kst(2026, 9, 5, 10) },
    { req_type: 'expense',  status: 'approved', amount: 9999, currency: 'PHP', category: 'meal', reverses_id: 1, created_at: kst(2026, 9, 6, 10) },
    { req_type: 'expense',  status: 'rejected', amount: 777, currency: 'PHP', created_at: kst(2026, 9, 7, 10) },
    { req_type: 'purchase', status: 'pending',  amount: 300, currency: 'PHP', category: 'supplies', created_at: kst(2026, 9, 8, 10) },
  ];
  const L = P.monthlyReportLines('2026-09', P.summarizeApprovals(rows), [
    { name: 'Mai', pct: 50, firstPass: 1, decided: 2 }, { name: 'Solo', pct: 100, firstPass: 1, decided: 1 }]);
  const t = L.join('\n');
  ok('머리에 달 이름', L[0].includes('2026-09'));
  ok('상태별 건수', /올라온 결재 6건 \(승인 4 · 반려 1 · 대기 1\)/.test(t), L[1]);
  ok('통화를 섞지 않는다(₱3,500 · ₩50,000 따로)', t.includes('₱3,500') && t.includes('₩50,000'), L[2]);
  ok('취소 결재(9,999)는 지출 합계에 안 들어간다', !t.includes('9,999') && !t.includes('13,499'));
  ok('반려(777)도 안 들어간다', !t.includes('777'));
  ok('대기 건이 있으면 경고 줄', /아직 대기 중 1건/.test(t));
  ok('많은 항목 줄', /많은 항목: 사무 · 소모품/.test(t));
  ok('첫 통과는 결정 2건 이상만', t.includes('Mai 50%') && !t.includes('Solo'));
  const L2 = P.monthlyReportLines('2026-09', P.summarizeApprovals(rows.filter(r => r.status !== 'pending')));
  ok('(짝) 대기 0건이면 경고 줄 없음', !/대기 중/.test(L2.join('\n')));
  const L3 = P.monthlyReportLines('2026-09', P.summarizeApprovals([
    { req_type: 'purchase', status: 'approved', currency: 'PHP', category: 'supplies', created_at: kst(2026, 9, 3, 10) }]));
  ok('금액이 빠진 건은 따로 알린다', /금액이 빠진 건 1건/.test(L3.join('\n')));
}

console.log('\n④ 배선 — 15분 점검 안, KV 먼저, KV 없으면 안 보냄');
{
  const sw = strip(bodyAt(API, API.indexOf('> {', API.indexOf('export async function runApprovalSlaSweep')) + 1));
  const mb = sw.slice(sw.indexOf('monthlySlotKst(now)'));
  ok('점검 함수가 monthlySlotKst 를 부른다', sw.includes('monthlySlotKst(now)'));
  const iKey = mb.indexOf("'approval_monthly:'"), iPut = mb.indexOf('kv.put(key'), iNotify = mb.indexOf('await notify(');
  ok('KV 키 approval_monthly:', iKey > 0);
  ok('KV 에 적는 것이 알림보다 먼저', iPut > 0 && iNotify > 0 && iPut < iNotify);
  ok('KV 가 없으면 안 보낸다(조건에 kv)', /if \(month && range && kv\)/.test(mb));
  ok('이미 보냈으면 건너뛴다', /if \(!seen\)/.test(mb.slice(0, iPut)));
  ok('summarizeApprovals·firstPassRates 로 문장을 만든다',
     /monthlyReportLines\(month, summarizeApprovals\(rows[^)]*\), firstPassRates\(rows[^)]*\)\)/.test(mb));
  ok('경영진에게만(approversFor exec)', /approversFor\(env, 'exec', null\)/.test(mb.slice(0, 1600)));
  ok('푸시로 못 닿으면 문자', /smsFallback\(env, n\.missed/.test(mb.slice(0, 1600)));
  ok('try 로 감싼다(점검 전체를 멈추지 않게)', /approval-monthly\] failed/.test(sw));
}

console.log('\n⑤ 화면 «모두 확인» — 실제로 돌린다');
function grab(name) {
  const i = WORK.indexOf(name);
  return i < 0 ? '' : WORK.slice(i, i + bodyAt(WORK, i).length + (WORK.indexOf('{', i) - i)) ;
}
const fnAckDone = grab('function ackDone(');
const fnAckDrop = grab('function ackDrop(');
const fnAckAll = grab('window.ackAll = function(');
ok('ackDone·ackDrop·ackAll 을 찾았다(전제)', !!(fnAckDone && fnAckDrop && fnAckAll));
async function runAll(items, answers, confirmAns) {
  const D = { ack_pending: items.map(id => ({ id })), summary: { ack_pending: items.length } };
  const sent = []; let live = 0, maxLive = 0, toasted = '', repainted = 0;
  const fetchStub = (url) => {
    live++; maxLive = Math.max(maxLive, live);
    const id = Number(url.match(/requests\/(\d+)\/ack/)[1]); sent.push(id);
    return new Promise(res => setTimeout(() => { live--; const a = answers[id];
      if (a === 'net') res(Promise.reject(new Error('net')).catch(() => { throw new Error('net'); }));
      res({ json: () => Promise.resolve(a) }); }, 2));
  };
  const f = new Function('D', 'T', 'fetch', 'toast', 'repaint', 'CACHE_KEY', 'localStorage', 'document', 'window',
    fnAckDone + '\n' + fnAckDrop + '\n' + fnAckAll + '\nreturn window.ackAll;');
  const win = { confirm: () => confirmAns };
  const doc = { getElementById: () => null };
  let done;
  const finished = new Promise(r => { done = r; });
  const all = f(D, (en, ko) => ko, fetchStub, (m) => { toasted = m; }, () => { repainted++; done(); }, 'k',
    { setItem() {} }, doc, win);
  all();
  if (confirmAns) await Promise.race([finished, new Promise(r => setTimeout(r, 500))]);
  return { D, sent, maxLive, toasted, repainted };
}
try {
  const r = await runAll([11, 12, 13], { 11: { ok: true }, 12: { ok: false, error: 'not_ackable', already_acked: true }, 13: { ok: false, error: 'not_ackable' } }, true);
  ok('세 건을 모두 보냈다', r.sent.join(',') === '11,12,13', r.sent.join(','));
  ok('하나씩 순서대로(동시 1건)', r.maxLive === 1, 'max ' + r.maxLive);
  ok('이미 확인된 건(already_acked)은 성공 — 목록에서 빠진다', !r.D.ack_pending.some(x => x.id === 12));
  ok('실패한 건은 목록에 남는다', r.D.ack_pending.length === 1 && r.D.ack_pending[0].id === 13);
  ok('결과를 사실대로 말한다(2건 확인 · 1건 실패)', /2건 확인 · 1건 실패/.test(r.toasted), r.toasted);
  ok('끝나면 다시 그린다', r.repainted === 1);
  const r0 = await runAll([11, 12], { 11: { ok: true }, 12: { ok: true } }, false);
  ok('(짝) 취소를 누르면 한 건도 안 보낸다', r0.sent.length === 0 && r0.D.ack_pending.length === 2);
  const r2 = await runAll([21, 22], { 21: { ok: true }, 22: { ok: true } }, true);
  ok('전부 성공이면 «모두 확인했습니다»', /2건 모두 확인했습니다/.test(r2.toasted) && r2.D.ack_pending.length === 0, r2.toasted);
} catch (e) { ok('ackAll 을 돌렸다', false, e.message); }

{
  const fnPaint = grab('function paintAck(');
  const run = (n) => {
    const els = { ackBox: { innerHTML: '' }, ackHead: { hidden: true } };
    const D = { ack_pending: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), summary: {} };
    const f = new Function('D', 'T', 'esc', 'itemHtml', 'document', fnPaint + '\nreturn paintAck;');
    f(D, (en, ko) => ko, x => String(x), () => '<i></i>', { getElementById: id => els[id] })();
    return els.ackBox.innerHTML;
  };
  try {
    ok('2건이면 «모두 확인 (2건)» 버튼', /id="ackAllBtn"[\s\S]*모두 확인 \(2건\)/.test(run(2)));
    ok('(짝) 1건이면 버튼 없음', !/ackAllBtn/.test(run(1)));
  } catch (e) { ok('paintAck 을 돌렸다', false, e.message); }
}

console.log('\n⑥ ackOne — already_acked 를 성공으로');
{
  const one = grab('window.ackOne = function(');
  ok('ackOne 이 ackDone 으로 판정한다', /if \(ackDone\(res\.j\)\)/.test(one));
  try {
    const f = new Function(fnAckDone + '\nreturn ackDone;')();
    ok('ackDone: ok → true', f({ ok: true }) === true);
    ok('ackDone: already_acked → true', f({ ok: false, error: 'not_ackable', already_acked: true }) === true);
    ok('(짝) ackDone: not_ackable 만 → false', f({ ok: false, error: 'not_ackable' }) === false);
    ok('(짝) ackDone: 빈 응답 → false', f({}) === false && f(null) === false);
  } catch (e) { ok('ackDone 을 돌렸다', false, e.message); }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);

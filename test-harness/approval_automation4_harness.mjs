#!/usr/bin/env node
/**
 * 🤖 결재 자동화 4단계 (2026-09-24) — 영수증 재사용 · 결재 전 이력 · 첫 번에 통과 비율
 *
 * 무엇을 지키나
 *   ① 같은 영수증 재사용 → runChecks 가 표시하고 signalOf 가 🔴 로 본다. 「0건이면 표시 없음」을 짝으로.
 *   ② 재사용 조회 SQL 을 «진짜 SQLite» 에 돌려 — 반려·회수·취소·취소결재는 세지 않는가(고쳐 다시 올리기는 정상).
 *   ③ 화면 fileHashOf 와 서버 sha256Hex 를 «실제로 돌려» 같은 값을 내는가(다르면 올리기 전 점검이 헛돈다).
 *   ④ historyCard — 같은 사람·같은 제목·승인된 것만, 통화가 다르면 빼고, 평소 대비 배수.
 *   ⑤ titleKey — 끝의 달·숫자만 떼고 「grammar」 같은 낱말은 안 자른다.
 *   ⑥ firstPassRates — 대기 건은 분모에 안 넣고, 다시 올린 건은 «첫 번» 이 아니다.
 *   ⑦ 배선 — 올리기·점검이 재사용 건수를 넘기는가, 해시를 INSERT 가 아니라 따로 UPDATE 하는가,
 *      이력 라우트가 canView 를 거치는가, 주간 요약이 firstPassRates 를 쓰는가, 화면이 결재함에만 버튼을 다는가.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n① 영수증 재사용 → 🔴 (짝: 0건이면 표시 없음)');
{
  const base = { reqType: 'purchase', amount: 1000, currency: 'PHP', hasFile: true, ocrAmount: 1000,
                 body: 'Printer ink for the office printer', spentAt: '2026-09-20', now: Date.UTC(2026, 8, 24) };
  const f1 = P.runChecks(Object.assign({}, base, { receiptReusedCount: 2 }));
  const f0 = P.runChecks(Object.assign({}, base, { receiptReusedCount: 0 }));
  const fu = P.runChecks(Object.assign({}, base));
  ok('재사용 2건 → receipt_reused 표시', f1.some(f => f.code === 'receipt_reused'));
  ok('0건 → 표시 없음(짝)', !f0.some(f => f.code === 'receipt_reused'));
  ok('값을 안 넘기면 → 표시 없음(옛 호출부 그대로)', !fu.some(f => f.code === 'receipt_reused'));
  const s1 = P.signalOf({ reqType: 'purchase', amount: 1000, ocrAmount: 1000, hasFile: true, flags: f1 });
  const s0 = P.signalOf({ reqType: 'purchase', amount: 1000, ocrAmount: 1000, hasFile: true, flags: f0 });
  ok('재사용 → 🔴', s1.signal === 'red' && s1.reasons.some(r => r.code === 'receipt_reused'));
  ok('재사용 없으면 → 🟢(짝)', s0.signal === 'green', s0.signal);
  ok('isSha256Hex: 64자 소문자 16진수만', P.isSha256Hex('a'.repeat(64)) && !P.isSha256Hex('A'.repeat(64))
     && !P.isSha256Hex('a'.repeat(63)) && !P.isSha256Hex(null) && !P.isSha256Hex("' OR 1=1 --".padEnd(64, 'a')));
}

console.log('\n② 재사용 조회 SQL — 진짜 SQLite');
{
  let sqlite = null;
  try { sqlite = await import('node:sqlite'); } catch { sqlite = null; }
  const fi = API.indexOf('async function receiptReuseCount(');
  const fb = bodyAt(API, fi);
  const m = fb.match(/`(SELECT COUNT\(\*\)[\s\S]*?)`/);
  ok('receiptReuseCount 의 SQL 을 오려 냈다', !!m);
  if (!sqlite) {
    console.log('  ⏭ node:sqlite 없음 — 실행 검사 건너뜀');
  } else if (m) {
    const db = new sqlite.DatabaseSync(':memory:');
    db.exec(`CREATE TABLE approval_requests (id INTEGER PRIMARY KEY, file_hash TEXT, status TEXT, reverses_id INTEGER)`);
    const h = 'b'.repeat(64);
    const ins = db.prepare('INSERT INTO approval_requests (file_hash, status, reverses_id) VALUES (?, ?, ?)');
    for (const [st, rv] of [['approved', null], ['pending', null], ['rejected', null], ['withdrawn', null], ['cancelled', null], ['pending', 7]]) ins.run(h, st, rv);
    ins.run('c'.repeat(64), 'approved', null);
    const c = db.prepare(m[1]).get(h).c;
    ok('승인·대기만 센다(반려·회수·취소·취소결재·다른 해시 제외) → 2', Number(c) === 2, 'got ' + c);
  }
}

console.log('\n③ 화면 fileHashOf == 서버 sha256Hex == 표준 SHA-256');
{
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 250, 99]);
  const want = createHash('sha256').update(bytes).digest('hex');
  const si = API.indexOf('async function sha256Hex(');
  const sSrc = 'return (async function ' + API.slice(si + 'async function '.length, API.indexOf('{', si)).replace(/:\s*Uint8Array/, '').replace(/\):\s*Promise<[^>]+>/, ')') + bodyAt(API, si).replace(/ as unknown as ArrayBuffer/g, '') + ')';
  let got = null;
  try { got = await new Function('crypto', sSrc)(webcrypto)(bytes); } catch (e) { got = 'ERR ' + e.message; }
  ok('서버 sha256Hex 가 표준값', got === want, got);
  const wi = WORK.indexOf('function fileHashOf(');
  const wSrc = 'return (' + WORK.slice(wi, wi + WORK.slice(wi).indexOf('{')) + bodyAt(WORK, wi) + ')';
  let gotW = null;
  try {
    const fakeFile = { arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0)) };
    gotW = await new Function('window', 'crypto', wSrc)({ crypto: webcrypto }, webcrypto)(fakeFile);
  } catch (e) { gotW = 'ERR ' + e.message; }
  ok('화면 fileHashOf 가 같은 값', gotW === want, gotW);
  let gotNone = null;
  try { gotNone = await new Function('window', 'crypto', wSrc)({ crypto: webcrypto }, webcrypto)(null); } catch (e) { gotNone = 'ERR'; }
  ok('파일이 없으면 빈 값(점검만 건너뜀)', gotNone === '');
}

console.log('\n④ historyCard');
{
  const cur = { id: 10, title: 'Internet bill September', amount: 3000, currency: 'PHP', requester_username: 'mgr_karl' };
  const D = 86400000, t0 = Date.UTC(2026, 8, 1);
  const rows = [
    { id: 10, title: 'Internet bill September', amount: 3000, currency: 'PHP', status: 'pending', created_at: t0, requester_username: 'mgr_karl' },
    { id: 9, title: 'Internet bill August', amount: 1500, currency: 'PHP', status: 'approved', created_at: t0 - 30 * D, requester_username: 'mgr_karl' },
    { id: 8, title: 'internet bill  july', amount: 1500, currency: 'PHP', status: 'approved', created_at: t0 - 60 * D, requester_username: 'mgr_karl' },
    { id: 7, title: 'Internet bill June', amount: 1500, currency: 'PHP', status: 'rejected', created_at: t0 - 90 * D, requester_username: 'mgr_karl' },
    { id: 6, title: 'Internet bill May', amount: 1500, currency: 'KRW', status: 'approved', created_at: t0 - 120 * D, requester_username: 'mgr_karl' },
    { id: 5, title: 'Internet bill May', amount: 1500, currency: 'PHP', status: 'approved', created_at: t0 - 120 * D, requester_username: 'mgr_melca' },
    { id: 4, title: 'Internet bill April', amount: -1500, currency: 'PHP', status: 'approved', created_at: t0 - 150 * D, requester_username: 'mgr_karl', reverses_id: 3 },
    { id: 3, title: 'Printer ink', amount: 500, currency: 'PHP', status: 'rejected', created_at: t0 - 20 * D, requester_username: 'mgr_karl' },
  ];
  const h = P.historyCard(cur, rows);
  ok('같은 사람·같은 제목(달 무시)·승인·같은 통화만 → 2건', h.sameTitleCount === 2, JSON.stringify(h.sameTitle.map(x => x.id)));
  ok('최근 것부터', h.sameTitle[0] && h.sameTitle[0].id === 9);
  ok('자기 자신·반려·다른 통화·남의 것·취소결재는 안 셈', !h.sameTitle.some(x => [10, 7, 6, 5, 4].includes(x.id)));
  ok('평소 대비 배수 = 2', h.ratio === 2, String(h.ratio));
  ok('올린 사람 결정 건수·반려 수(자기·취소결재 제외)', h.requesterTotal === 5 && h.requesterRejected === 2, h.requesterTotal + '/' + h.requesterRejected);
  const hNone = P.historyCard({ id: 1, title: 'Brand new thing', amount: 100, currency: 'PHP', requester_username: 'x' }, rows);
  ok('처음 보는 제목 → 0건 · 배수 없음(짝)', hNone.sameTitleCount === 0 && hNone.ratio === null);
  const hEmpty = P.historyCard({ id: 1, title: '   ', amount: 100, currency: 'PHP', requester_username: 'mgr_karl' },
    [{ id: 2, title: '', amount: 5, currency: 'PHP', status: 'approved', created_at: 1, requester_username: 'mgr_karl' }]);
  ok('빈 제목끼리는 «같은 제목» 이 아니다', hEmpty.sameTitleCount === 0);
}

console.log('\n⑤ titleKey');
{
  ok('끝의 달 이름 뗌', P.titleKey('Internet bill September') === 'internet bill' && P.titleKey('Internet Bill Sept') === 'internet bill');
  ok('한국어 「9월」 뗌', P.titleKey('인터넷비 9월') === '인터넷비');
  ok('낱말 안의 mar 는 안 자름(grammar)', P.titleKey('Grammar books') === 'grammar books');
  ok('구분자 없이 붙은 낱말 끝은 안 자름(summary)', P.titleKey('Office summary') === 'office summary');
}

console.log('\n⑥ firstPassRates');
{
  const r = P.firstPassRates([
    { requester_username: 'a', requester_name: 'A', status: 'approved' },
    { requester_username: 'a', requester_name: 'A', status: 'approved', origin_id: 3 },
    { requester_username: 'a', requester_name: 'A', status: 'rejected' },
    { requester_username: 'a', requester_name: 'A', status: 'pending' },
    { requester_username: 'a', requester_name: 'A', status: 'approved', reverses_id: 9 },
    { requester_username: 'b', requester_name: 'B', status: 'approved' },
  ]);
  const a = r.find(x => x.user === 'a');
  ok('대기·취소결재는 분모 밖 → 결정 3건', a && a.decided === 3);
  ok('다시 올려 승인된 건은 «첫 번» 이 아님 → 1/3 = 33%', a && a.firstPass === 1 && a.pct === 33, JSON.stringify(a));
  ok('결정 많은 순', r[0].user === 'a');
}

console.log('\n⑦ 배선');
{
  const cleanApi = strip(API);
  const post = bodyAt(API, API.indexOf("if (method === 'POST' && path === '/api/approval/requests')"));
  ok('올리기가 해시를 계산한다', /fileHash = await sha256Hex\(bytes\)/.test(post));
  ok('올리기가 재사용 건수를 runChecks 에 넘긴다', /receiptReuseCount\(env, fileHash\)/.test(post) && /runChecks\(\{[\s\S]*?receiptReusedCount[\s\S]*?\}\)/.test(post));
  const insM = post.match(/INSERT INTO approval_requests[\s\S]*?VALUES/);
  ok('해시는 INSERT 가 아니라 따로 UPDATE (칸이 없어도 올리기가 산다)', insM && !/file_hash/.test(insM[0]) && /UPDATE approval_requests SET file_hash = \?/.test(post));
  const pre = bodyAt(API, API.indexOf("if (method === 'POST' && path === '/api/approval/precheck')"));
  ok('점검이 해시 모양을 확인한 뒤에만 조회', /isSha256Hex\(b\?\.file_hash\)/.test(pre) && /receiptReusedCount/.test(pre));
  const hi = API.indexOf("if (method === 'GET' && mHist)");
  const hb = bodyAt(API, hi);
  ok('이력 라우트가 있다', hi > 0 && /\/history\$/.test(API));
  ok('이력 라우트가 canView 로 막는다', /canView\(actor, r\.req_type, r\.requester_username/.test(hb) && /403/.test(hb));
  ok('이력 조회가 같은 사람·같은 분류로 좁힌다', /WHERE requester_username = \? AND req_type = \?/.test(hb));
  ok('이력 라우트가 mOne 보다 앞(겹치지 않음)', hi > 0 && hi < API.indexOf("if (method === 'GET' && mOne)"));
  const wki = API.indexOf('export async function runApprovalWeeklyReport');
  const wk = bodyAt(API, API.indexOf('> {', wki) + 1);   // 반환 타입 Promise<{…}> 의 중괄호를 건너뛴다
  ok('주간 요약이 firstPassRates 를 쓴다', /firstPassRates\(/.test(wk) && /첫 번에 통과/.test(wk));
  ok('해시 칸 ALTER 가 있다', /ADD COLUMN file_hash TEXT/.test(cleanApi));
  const it = bodyAt(WORK, WORK.indexOf('function itemHtml('));
  ok('화면: 이력 버튼은 결재함(decidable)·금액 있는 건에만', /if \(decidable && r\.amount != null\)[\s\S]{0,200}loadHist\(/.test(it));
  ok('화면: loadHist 가 /history 를 부른다', /\/api\/approval\/requests\/' \+ id \+ '\/history'/.test(WORK));
  ok('화면: 점검 요청에 file_hash 를 싣는다', /file_hash: fh \|\| ''/.test(WORK) && /fileHashOf\(FILE\)/.test(WORK));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);

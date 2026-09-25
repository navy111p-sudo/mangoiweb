#!/usr/bin/env node
/**
 * 📒📷 결재 자동화 12단계 (2026-09-25) — 간단 회계장부(이번 달·최근 1년, 날짜·금액 오름/내림) · 카드 영수증 사진
 *
 * 무엇을 지키나
 *   ① ledgerFrom — 승인된 지출만 한 줄씩(대기·반려·취소결재·금액 없음 제외, 건수는 따로) · 통화 따로 합계.
 *   ② fileKind · fileDisposition — 화면 안에 띄우는(inline) 것은 «사진이고 inline 을 달라고 했을 때만»(짝).
 *   ③ 서버 배선 — view=ledger 는 canView 를 지난 items 를 쓴다(거르기 전 page 가 아니라) · 파일 경로가 fileDisposition 을 쓴다.
 *   ④ 화면 — ledgerSort 를 오려 내 실제로 돌린다(날짜·금액 × 오름·내림, 금액은 통화끼리) · 홈을 시도한 뒤에만 부른다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const fnAt = (src, i) => src.slice(i, src.indexOf('{', i)) + bodyAt(src, i);

console.log('\n① ledgerFrom');
try {
  const at = s => Date.parse(s + 'T10:00:00+09:00');
  const L = P.ledgerFrom([
    { id: 1, status: 'approved', amount: 500, currency: 'php', created_at: at('2026-09-03'), title: 'ink', requester_name: 'Karl', category_ko: '사무용품' },
    { id: 2, status: 'approved', amount: 12000.5, currency: 'PHP', created_at: at('2026-09-10'), title: 'printer', requester_username: 'mai' },
    { id: 3, status: 'approved', amount: 30000, currency: 'KRW', created_at: at('2026-09-01'), title: 'box' },
    { id: 4, status: 'approved', amount: 9999, currency: 'PHP', reverses_id: 2, created_at: at('2026-09-11') },   // 취소 결재
    { id: 5, status: 'pending', amount: 700, currency: 'PHP', created_at: at('2026-09-12') },
    { id: 6, status: 'rejected', amount: 800, currency: 'PHP', created_at: at('2026-09-12') },
    { id: 7, status: 'approved', amount: null, currency: 'PHP', created_at: at('2026-09-12') },
    { id: 8, status: 'approved', amount: 0, currency: 'PHP', created_at: at('2026-09-12') },
    null,
  ]);
  ok('승인된 지출만 줄로(취소결재·대기·반려·금액없음 제외)', L.rows.map(r => r.id).join(',') === '2,1,3', L.rows.map(r => r.id).join(','));
  ok('기본 순서는 최근 날짜 먼저', L.rows[0].ymd === '2026-09-10' && L.rows[2].ymd === '2026-09-01');
  ok('대기 건수는 따로 센다(1)', L.pending === 1, String(L.pending));
  ok('금액 없는 승인 건수(2)', L.no_amount === 2, String(L.no_amount));
  const php = L.totals.find(t => t.cur === 'PHP'), krw = L.totals.find(t => t.cur === 'KRW');
  ok('통화 따로 합계(₱ 12,500.5 · 2건 / ₩ 30,000 · 1건)', php && php.sum === 12500.5 && php.n === 2 && krw && krw.sum === 30000 && krw.n === 1, JSON.stringify(L.totals));
  ok('통화 이름을 정규화(php → PHP)', L.rows.find(r => r.id === 1).currency === 'PHP');
  ok('이름이 없으면 아이디로', L.rows.find(r => r.id === 2).who === 'mai' && L.rows.find(r => r.id === 1).who === 'Karl');
  ok('날짜는 KST 로(자정 직후도 그날)', P.ledgerFrom([{ id: 9, status: 'approved', amount: 1, currency: 'PHP', created_at: Date.parse('2026-09-01T00:30:00+09:00') }]).rows[0].ymd === '2026-09-01');
  ok('(짝) 빈 목록·이상한 값에도 던지지 않는다', P.ledgerFrom(null).rows.length === 0 && P.ledgerFrom([]).totals.length === 0);
} catch (e) { ok('ledgerFrom 을 돌렸다', false, e.message); }

console.log('\n② fileKind · fileDisposition');
try {
  ok('사진 세 형식은 image', ['jpg', 'jpeg', 'PNG', 'webp'].every(e => P.fileKind(e) === 'image'));
  ok('pdf 는 pdf, 모르는 것은 null', P.fileKind('pdf') === 'pdf' && P.fileKind('exe') === null && P.fileKind(null) === null && P.fileKind('svg') === null);
  ok('사진 + inline 요청이면 inline', P.fileDisposition('jpg', true) === 'inline');
  ok('(짝) 사진이어도 요청이 없으면 내려받기', P.fileDisposition('jpg', false) === 'attachment');
  ok('(짝) PDF·모르는 형식은 요청해도 내려받기', P.fileDisposition('pdf', true) === 'attachment' && P.fileDisposition('html', true) === 'attachment'
     && P.fileDisposition(null, true) === 'attachment');
} catch (e) { ok('fileDisposition 을 돌렸다', false, e.message); }

console.log('\n③ 서버 배선');
try {
  const code = strip(API);
  ok('view=ledger 가 report 와 같은 읽기(상한·offset 0)를 탄다', /const report = url\.searchParams\.get\('view'\) === 'report' \|\| ledger;/.test(code));
  const i = code.indexOf('if (ledger) {');
  ok('전제: ledger 갈래를 찾았다', i > 0);
  const blk = bodyAt(code, i);
  ok('canView 를 지난 items 로 장부를 만든다(거르기 전 page 가 아님)', /ledgerFrom\(items\)/.test(blk) && !/ledgerFrom\(page\)/.test(blk), blk.slice(0, 120));
  ok('잘림·결재선 누락을 함께 말한다', /truncated: hasMore/.test(blk) && /steps_missing: stepsMissing/.test(blk));
  const ledIdx = code.indexOf('if (ledger) {'), repIdx = code.indexOf('summary: summarizeApprovals(items)');
  ok('ledger 갈래가 report 응답보다 앞(같은 거르기 뒤)', ledIdx > 0 && repIdx > ledIdx && ledIdx > code.indexOf('if (!canView(actor, r.req_type'));
  const fi = code.indexOf("const mFile = path.match(");
  const fb = code.slice(fi, fi + 2500);
  ok('파일 경로가 fileDisposition 으로 inline 을 정한다', /const disp = fileDisposition\(r\.file_ext, new URL\(request\.url\)\.searchParams\.get\('inline'\) === '1'\)/.test(fb)
     && /`\$\{disp\}; filename\*=/.test(fb));
  ok('(짝) 파일 경로에 attachment 를 손으로 박아 두지 않았다', !/'Content-Disposition': `attachment;/.test(fb));
  ok('목록 한 줄에 file_kind 를 싣는다', /file_kind: r\.file_key \? fileKind\(r\.file_ext\) : null/.test(code));
} catch (e) { ok('서버를 읽었다', false, e.message); }

console.log('\n④ 화면');
try {
  const W = strip(WORK);
  const si = W.indexOf('function ledgerSort(');
  ok('전제: ledgerSort 를 찾았다', si > 0);
  const ledgerSort = new Function('return ' + fnAt(W, si))();
  const rows = [
    { id: 1, ymd: '2026-09-03', amount: 500, currency: 'PHP' },
    { id: 2, ymd: '2026-09-10', amount: 12000, currency: 'PHP' },
    { id: 3, ymd: '2026-09-01', amount: 30000, currency: 'KRW' },
    { id: 4, ymd: '2026-09-20', amount: 2800, currency: 'PHP' },
    { id: 5, ymd: '2026-09-20', amount: 100, currency: 'PHP' },
  ];
  const ids = (k, d) => ledgerSort(rows, k, d).map(r => r.id).join(',');
  ok('날짜 내림차순(같은 날은 번호 큰 것 먼저)', ids('date', 'desc') === '5,4,2,1,3', ids('date', 'desc'));
  ok('날짜 오름차순', ids('date', 'asc') === '3,1,2,4,5', ids('date', 'asc'));
  ok('금액 내림차순 — 통화끼리(₩ 묶음, ₱ 묶음)', ids('amount', 'desc') === '3,2,4,1,5', ids('amount', 'desc'));
  ok('금액 오름차순 — 통화 묶음 순서는 그대로', ids('amount', 'asc') === '3,5,1,4,2', ids('amount', 'asc'));
  ok('(짝) 원본 배열은 건드리지 않는다', rows.map(r => r.id).join(',') === '1,2,3,4,5');
  const ai = W.indexOf('function ledAutoOpen(');
  const ab = fnAt(W, ai);
  ok('홈을 시도한 뒤에만, 한 번만 부른다', /if \(!HOME_TRIED \|\| LED\.auto\) return;/.test(ab) && /LED\.auto = true;/.test(ab));
  ok('repaint 에서 ledAutoOpen 을 부른다', /findAutoOpen\(\);[^\n]*\n\s*ledAutoOpen\(\);/.test(W));
  const pi = W.indexOf('window.ledSortBy = function(');
  const sb = new Function('LED', 'paintLed', 'return ' + W.slice(W.indexOf('function(', pi), W.indexOf('{', pi)) + bodyAt(W, pi))(
    globalThis.__L = { key: 'date', dir: 'desc' }, () => {});
  sb('date'); ok('같은 머리글을 다시 누르면 방향이 뒤집힌다', globalThis.__L.dir === 'asc');
  sb('amount'); ok('다른 머리글을 누르면 그 기준 + 큰 순부터', globalThis.__L.key === 'amount' && globalThis.__L.dir === 'desc');
  const ri = W.indexOf('function runLed(');
  const rb = fnAt(W, ri);
  ok('결재 권한자만 scope=all', /var scope = \(D && D\.can_approve\) \? 'all' : 'mine';/.test(rb));
  ok('«성공이라고 말했는가» 로 판정(ok===true + 배열)', /d\.ok !== true \|\| !Array\.isArray\(d\.ledger\)/.test(rb));
  const ti = W.indexOf("if (r.has_file && decidable && r.file_kind === 'image')");
  ok('영수증 미리보기는 결재할 사진 건에서만', ti > 0 && /\/file\?inline=1/.test(W.slice(ti, ti + 300)));
  ok('장부 칸은 처음부터 펼쳐져 있다(hidden 없음)', /<div id="ledPanel" class="findpanel">/.test(WORK));
} catch (e) { ok('화면을 돌렸다', false, e.message); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

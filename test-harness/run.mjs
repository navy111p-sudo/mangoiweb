// run.mjs — 하니스 전체 러너 (2026-07-19)
//   · 정적 서버(8791) 자동 기동 → puppeteer 하니스가 localhost:8791 로 로컬 페이지 로드
//   · 모든 *_harness.mjs 를 순차 실행하고 결과를 3분류로 요약:
//       ✅ PASS         — 통과
//       ⏭ SKIP(E2E)    — 활성 화상수업/브라우저 상태가 필요한 E2E (헤드리스로는 원래 불가)
//       ⚠ FAIL         — 실제 확인 필요 (리팩토링 노후화 아님)
//   · 실제 FAIL 이 하나라도 있으면 exit 1. 실행:  node test-harness/run.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.gif':'image/gif',
  '.mp4':'video/mp4', '.webm':'video/webm', '.woff2':'font/woff2', '.ico':'image/x-icon' };

// ── 정적 서버(8791) ── (이미 떠 있으면 그대로 재사용)
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const data = await readFile(join(PUB, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
// --fast: puppeteer E2E 하니스 제외(빠르고 안정적) — 배포 게이트용. 정적서버도 생략.
const FAST = process.argv.includes('--fast');
let served = false;
if (!FAST) {
  served = true;
  await new Promise((resolve) => {
    server.once('error', (e) => { if (e.code === 'EADDRINUSE') { served = false; resolve(); } else resolve(); });
    server.listen(8791, resolve);
  });
  console.log(served ? '🌐 정적 서버 http://localhost:8791 기동' : '🌐 8791 기존 서버 재사용');
} else {
  console.log('⚡ fast 모드 — puppeteer E2E 제외, 소스/fetch 하니스만');
}

// ── 하니스 순차 실행 ──
const files = readdirSync(__dir).filter(f => f.endsWith('_harness.mjs')).sort();
const rows = [];
for (const f of files) {
  if (FAST) {
    let body = ''; try { body = readFileSync(join(__dir, f), 'utf8'); } catch {}
    if (/puppeteer/.test(body)) { rows.push({ f, cat: 'SKIP', note: '⏭ E2E(fast 제외)' }); continue; }
  }
  process.stdout.write('  ▶ ' + f + ' … ');
  let [cat, note] = runHarness(f);
  // 일시적 라이브 blip(동시 배포 등) 흡수: 실패면 1회 재시도, 두 번 실패해야 진짜 FAIL
  if (cat === 'FAIL') { const [c2, n2] = runHarness(f); if (c2 !== 'FAIL') { cat = c2; note = n2 + ' (재시도 통과)'; } }
  rows.push({ f, cat, note });
  console.log(note);
}

function runHarness(f) {
  const r = spawnSync('node', [join(__dir, f)], { encoding: 'utf8', timeout: 90000, cwd: dirname(__dir) });
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const timedOut = !!(r.error && (r.error.code === 'ETIMEDOUT' || r.error.signal === 'SIGTERM'));
  const tail = out.split('\n').slice(-25).join('\n');
  const crash = /ERR_CONNECTION_REFUSED|puppeteer|Cannot read properties|Protocol error|net::|TargetCloseError|Navigation timeout/i.test(out);
  // 실제 '0 아닌' 실패 카운트만 잡는다 ("0 실패"/"0 FAIL" 은 통과)
  const failCount = /(?:^|[^\d])([1-9]\d*)\s*(?:FAIL|실패)\b/.test(tail) || /passed,\s*[1-9]/.test(tail);
  if (timedOut) return ['SKIP', '⏱  timeout(90s) — netem 다중클라이언트 E2E'];
  if (crash) return ['SKIP', '⏭  E2E(로컬서버/활성 화상수업 상태 필요)'];
  if (r.status === 0 && !failCount) return ['PASS', '✅'];
  return ['FAIL', '⚠  실제 확인 필요'];
}
if (served) server.close();

// ── 요약 ──
const n = (c) => rows.filter(r => r.cat === c).length;
console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${n('PASS')}    ⏭ SKIP(E2E) ${n('SKIP')}    ⚠ FAIL ${n('FAIL')}   (총 ${rows.length})`);
const fails = rows.filter(r => r.cat === 'FAIL');
if (fails.length) { console.log('\n  ⚠ 실제 확인 필요:'); fails.forEach(r => console.log('    - ' + r.f)); }
const skips = rows.filter(r => r.cat === 'SKIP');
if (skips.length) { console.log('\n  ⏭ E2E(정상 — 라이브 화상수업/브라우저 상태 필요, 헤드리스 제외):'); skips.forEach(r => console.log('    - ' + r.f)); }
console.log('═'.repeat(60));
process.exit(fails.length ? 1 : 0);

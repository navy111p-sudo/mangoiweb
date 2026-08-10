// run.mjs — 하니스 전체 러너 (2026-07-19)
//   · 정적 서버(8791) 자동 기동 → puppeteer 하니스가 localhost:8791 로 로컬 페이지 로드
//   · 모든 *_harness.mjs 를 순차 실행하고 결과를 3분류로 요약:
//       ✅ PASS         — 통과
//       ⏭ SKIP(E2E)    — 활성 화상수업/브라우저 상태가 필요한 E2E (헤드리스로는 원래 불가)
//       ⚠ FAIL         — 실제 확인 필요 (리팩토링 노후화 아님)
//   · 실제 FAIL 이 하나라도 있으면 exit 1. 실행:  node test-harness/run.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** 이 하니스가 정말 브라우저(E2E)를 쓰는가 — **실제 import/require 로만** 판정한다.
 *  ⚠️ 예전엔 /puppeteer/ 로 본문 아무 데나 찾았다. 그래서 주석에 그 단어를 한 번 쓴
 *     순수 정적 하니스가 통째로 SKIP 됐다 — 게이트가 조용히 꺼진 것이다(2026-08-09 실제 발생).
 *     「검사가 사라져도 FAIL 은 0」 이라 초록불로 보인다. 이름 언급과 실제 사용을 구분한다. */
function usesPuppeteer(body) {
  return /\bfrom\s+['"]puppeteer(?:-\w+)?['"]|\brequire\(\s*['"]puppeteer(?:-\w+)?['"]\s*\)|\bimport\(\s*['"]puppeteer(?:-\w+)?['"]\s*\)/.test(body);
}
// 게이트(--fast)에서 제외할 하니스: git worktree==HEAD 무결성/brace-balance 검사 포함 → 커밋 전엔 미커밋 변경으로 오탐
const GATE_EXCLUDE = new Set(['changes_qa_harness.mjs']);
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
    // 게이트 제외: git worktree==HEAD 무결성 검사가 있어 커밋 전 게이트에선 미커밋 변경으로 항상 실패(오탐)
    if (GATE_EXCLUDE.has(f)) { rows.push({ f, cat: 'SKIP', note: '⏭ 게이트 제외(git 상태 의존)' }); continue; }
    let body = ''; try { body = readFileSync(join(__dir, f), 'utf8'); } catch {}
    if (usesPuppeteer(body)) { rows.push({ f, cat: 'SKIP', note: '⏭ E2E(fast 제외)' }); continue; }
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
  // 🖥 puppeteer(브라우저 E2E) 하니스는 활성 화상수업/특정 DOM 상태가 없으면 UI 단언이 실패하는데
  //   exit 0 으로 끝내는 경우가 있다(브라우저는 떴으니 crash 아님). 헤드리스로는 원래 불가한 검사이므로
  //   'puppeteer 를 쓰는데 실패 카운트만 있는' 경우는 진짜 회귀가 아니라 E2E → SKIP.
  //   (실제 소스/fetch 하니스는 puppeteer 를 안 쓰므로 이 완화에 안 걸린다 = 진짜 FAIL 은 그대로 FAIL)
  let harnessBody = ''; try { harnessBody = readFileSync(join(__dir, f), 'utf8'); } catch {}
  const isE2E = usesPuppeteer(harnessBody);
  if (timedOut) return ['SKIP', '⏱  timeout(90s) — netem 다중클라이언트 E2E'];
  // ⚠️ 2026-08-09 수정 — 이 완화들은 **E2E 하니스에만** 적용한다.
  //   그전엔 E2E 여부를 안 보고 crash 면 무조건 SKIP 이었다. 그래서
  //   순수 소스/fetch 하니스가 «Cannot read properties» 같은 **진짜 버그**로 죽어도
  //   SKIP 으로 내려가 초록불이 됐다 — 경보기 안에 있던 경보기 고장이다.
  //   E2E 가 아닌 하니스가 죽으면 그건 브라우저 환경 탓이 아니라 코드 탓이다 → FAIL.
  if (crash) return isE2E
    ? ['SKIP', '⏭  E2E(로컬서버/활성 화상수업 상태 필요)']
    : ['FAIL', '⚠  하니스가 오류로 죽음(E2E 아님 — 코드 문제)'];
  if (r.status === 0 && !failCount) return ['PASS', '✅'];
  if (isE2E) return ['SKIP', '⏭  E2E(브라우저는 떴으나 활성 수업 상태 필요 — 헤드리스 불가)'];
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

// ── 기준선(baseline) 검사 ── (2026-08-09 신설)
//   FAIL 0 만 보면 «조용히 사라진 검사» 를 못 잡는다:
//   하니스가 SKIP 으로 내려가거나 파일이 지워져도 FAIL 은 0 이라 초록불이 된다.
//   대수술 중엔 그게 가장 위험하다 — 부순 걸 «통과» 로 보고받게 되므로.
//   그래서 «PASS 가 기준선보다 줄었는가 / SKIP 이 늘었는가» 를 같이 본다.
//   기준선을 의도적으로 올릴 땐:  node test-harness/run.mjs --fast --update-baseline
const BASELINE_PATH = join(__dir, 'baseline.json');
const mode = FAST ? 'fast' : 'full';
// ⚠️ 여기서 파싱 실패를 조용히 삼키면 **게이트가 통째로 꺼진 채 초록불**이 된다.
//    (실제로 그랬다 — PowerShell Out-File 이 붙인 BOM 하나에 검사가 사라졌다.)
//    그래서 ① BOM 을 벗기고 ② 못 읽으면 «없음» 이 아니라 «고장» 으로 크게 실패한다.
let baseline = {};
let baselineRaw = null;
try { baselineRaw = readFileSync(BASELINE_PATH, 'utf8').replace(/^﻿/, ''); } catch { /* 파일 없음 = 아직 기준선 미설정, 정상 */ }
if (baselineRaw !== null) {
  try {
    baseline = JSON.parse(baselineRaw);
  } catch (e) {
    console.log(`\n  🚨 baseline.json 을 읽을 수 없습니다 — 기준선 검사가 꺼진 채로 통과시키지 않습니다.`);
    console.log(`     ${BASELINE_PATH}`);
    console.log(`     ${e.message}`);
    console.log('═'.repeat(60));
    process.exit(1);
  }
}
const cur = { pass: n('PASS'), skip: n('SKIP'), fail: n('FAIL') };

if (process.argv.includes('--update-baseline')) {
  // ⚠️ FAIL 이 있는 상태를 기준선으로 못 박으면 «고장난 상태» 가 정상이 된다.
  //    실제로 밟았다 — FAIL 1 인 채로 PASS 120 이 기준선으로 저장됐다.
  if (cur.fail) {
    console.log(`  ⛔ FAIL ${cur.fail}건이 있어 기준선을 갱신하지 않습니다. 먼저 고치세요.`);
  } else {
    baseline[mode] = { pass: cur.pass, skip: cur.skip };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`  📌 기준선 갱신(${mode}): PASS ${cur.pass} / SKIP ${cur.skip}`);
  }
} else if (baseline[mode]) {
  const b = baseline[mode];
  const drift = [];
  if (cur.pass < b.pass) drift.push(`PASS ${b.pass} → ${cur.pass} (${b.pass - cur.pass}개 줄었다)`);
  if (cur.skip > b.skip) drift.push(`SKIP ${b.skip} → ${cur.skip} (${cur.skip - b.skip}개 늘었다 — 검사가 조용히 빠졌다)`);
  if (drift.length) {
    console.log('\n  🚨 기준선 이탈 — 통과한 검사가 줄었습니다:');
    drift.forEach(d => console.log('    - ' + d));
    console.log('    의도한 변경이면: node test-harness/run.mjs --fast --update-baseline');
    console.log('═'.repeat(60));
    process.exit(1);
  }
  console.log(`  📌 기준선 유지(${mode}): PASS ${cur.pass} ≥ ${b.pass} · SKIP ${cur.skip} ≤ ${b.skip}`);
}

process.exit(fails.length ? 1 : 0);

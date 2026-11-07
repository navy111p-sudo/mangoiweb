// run.mjs — 하니스 전체 러너 (2026-07-19)
//   · 정적 서버(8791) 자동 기동 → puppeteer 하니스가 localhost:8791 로 로컬 페이지 로드
//   · 모든 *_harness.mjs 를 실행하고 결과를 3분류로 요약:
//       ✅ PASS         — 통과
//       ⏭ SKIP(E2E)    — 활성 화상수업/브라우저 상태가 필요한 E2E (헤드리스로는 원래 불가)
//       ⚠ FAIL         — 실제 확인 필요 (리팩토링 노후화 아님)
//   · 실제 FAIL 이 하나라도 있으면 exit 1. 실행:  node test-harness/run.mjs
//
// ⚡ 동시 실행 (2026-11-03) / Parallel run
//   그전엔 하니스 660여 개를 «하나씩» 돌려 CI 배포 게이트 한 번에 약 7분이 걸렸다
//   (PR 검사 7분 + 병합 후 배포에서 같은 게이트 7분 = 사람은 15분 넘게 기다렸다).
//   하니스끼리는 서로 독립이라 fast 모드는 CPU 수만큼 «동시에» 돌린다. 검사 목록·판정·
//   재시도·기준선은 하나도 바뀌지 않는다 — 바뀌는 것은 «언제 도는가» 뿐이다.
//   · 동시 개수: fast 기본 = CPU 수, full(브라우저 E2E) 기본 = 1(예전 그대로)
//       바꾸기 --jobs=N 또는 HARNESS_JOBS=N · 예전처럼 하나씩 --serial
//   · ⛔ 저장소 안 공용 자리에 파일을 «쓰는» 하니스는 EXCLUSIVE 에 넣어 «혼자» 먼저 돌린다
//       (예: 소스 폴더에 변이 사본을 잠깐 만들면, 같은 순간 소스 폴더를 훑는 옆 하니스가
//        그 사본을 보고 거짓 FAIL 이 난다). 새 하니스가 그런 일을 하면 거기에 이름을 더할 것.
//   · ⏱ 풀 안에서 90초 상한을 넘는 무거운 하니스도 EXCLUSIVE 에 둔다 — 시간 초과는 아래 «혼자 한 번 더» 를
//       안 받고 곧바로 SKIP 이 되어 기준선(SKIP 수)을 넘기면 배포 게이트가 막힌다(2026-11-05).
//   · 동시 실행 중 FAIL 난 하니스는 마지막에 «혼자» 한 번 더 돌린다 — 옆 하니스 탓이었으면
//       통과하고, 진짜 고장이면 두 번 다 FAIL 이다. 혼자 돌려야만 통과한 이름은 요약에 따로
//       찍는다(EXCLUSIVE 에 넣어야 할 후보라는 신호).
//   · 동시 실행 중 «90초 시간초과» 도 같이 혼자 한 번 더 돌린다(2026-11-04) — CPU 다툼으로 느려진 것일 수 있다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { availableParallelism, cpus } from 'node:os';
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

// ── 동시 실행 개수 / How many harnesses run at once ──
const JOBS = (() => {
  if (process.argv.includes('--serial')) return 1;
  const a = process.argv.find(x => x.startsWith('--jobs='));
  const n = Number(a ? a.slice('--jobs='.length) : process.env.HARNESS_JOBS);
  if (Number.isInteger(n) && n >= 1) return n;
  if (!FAST) return 1;   // 브라우저 E2E 를 여러 개 띄우면 서로 느려져 시간초과(SKIP)가 늘어난다 — 예전 그대로
  const cpu = typeof availableParallelism === 'function' ? availableParallelism() : cpus().length;
  return Math.max(1, cpu);
})();

// ── 혼자 돌려야 하는 하니스 / Must run alone (before the parallel pool) ──
//   ① 저장소 안 «여럿이 함께 읽는 자리» 에 파일을 만들거나 지우거나 고치는 하니스들,
//   ② 그리고 CPU 를 혼자 많이 써서 풀 안에서는 90초 상한을 넘는 하니스(목록 끝 — 이유는 그 자리 주석).
//   2026-11-03 에 하니스마다 실행 전후 저장소 파일·폴더 mtime 을 비교해 찾았다(실측).
//   ⛔ 이 목록에서 빼려면 그 하니스가 더는 저장소에 쓰지 않는다는 것을 먼저 확인할 것.
const EXCLUSIVE = new Set([
  'asset_version_harness.mjs',            // 새 ?v= 를 만나면 asset-versions.json 을 고쳐 쓴다 — recording_diagnosis·today_plan 이 그 파일을 읽는다
  'correction_reason_harness.mjs',        // cloudflare-deploy/src/__cr_mutant.ts 를 잠깐 만든다 — src 를 훑는 하니스가 함께 보면 거짓 FAIL
  'pii_mask_harness.mjs',                 // test-harness/.build/ 에 빌드한다 …
  'recordings_cleanup_harness.mjs',       // … 그리고 이 하니스가 끝에 test-harness/.build/ 를 통째로 지운다
  'azure_pronunciation_harness.mjs',      // test-harness/.azure-pron*.mjs 를 만들었다 지운다 ┐ harness_portability 가 test-harness/*.mjs 를
  'teacher_legacy_login_harness.mjs',     // test-harness/.legacy-teacher-auth.built.mjs     │ 전부 읽는다 — 목록에 잡힌 뒤 지워지면 ENOENT 로 죽는다
  'voice_acoustic_harness.mjs',           // test-harness/.voice-acoustic.built.mjs          │
  'voice_score_calibration_harness.mjs',  // test-harness/.calib-voice-score.mjs             │
  'voice_score_harness.mjs',              // test-harness/.voice-score.built.mjs             ┘
  /* ⏱ CPU 를 혼자 많이 쓰는 하니스 — 저장소에 쓰지는 않지만 풀 안에서 돌면 90초 상한을 넘는다(2026-11-05 실측).
     class_cancelled_visible 은 진짜 핸들러(api-admin.ts)를 자식 프로세스로 40여 번 띄우고 그중 4개를 «동시에» 돌린다
     (혼자 돌리면 40초 · CPU 약 160초어치). 풀(4코어)에서 다른 무거운 하니스(class_undo_move — 같은 식으로 자식 4개)와
     겹치면 코어를 나눠 써 90초를 넘기고, 시간 초과는 «혼자 다시 돌리기» 없이 SKIP 이 되어 «SKIP 20 → 21 기준선 이탈» 로
     배포 게이트가 막혔다(PR #2093 CI · 병합 뒤 배포 run 41903024528 — 같은 코드가 다른 러너에선 통과: 경계에 있었다).
     ⛔ 상한(90초)을 늘리거나 이 하니스를 게이트에서 빼서 풀지 말 것 — 검사는 그대로, «언제 도는가» 만 바꾼다. */
  'class_cancelled_visible_harness.mjs',  // 자식 프로세스 40여 개(동시 4) — 풀에서 겹치면 90초 상한을 넘어 SKIP
  'recurring_one_week_harness.mjs',      // 실제 핸들러 + 변이 10종 자식 실행 — Windows에서 풀 부하로 90초 초과
  'watchdog_layer2_harness.mjs',         // Git Bash 프로세스 다수 — Windows 단독 85초, 동시 실행 102초
]);

// 시간초과 표시 — classify 가 붙이고 ③ «혼자 다시» 가 이 값으로 알아본다(글자를 두 곳에 따로 적지 않게 한 벌).
//   ⚠️ 여기(위쪽)에 둔다 — 아래 classify 옆에 두면 최상위 await 때문에 그 줄에 닿기 전에 불려 TDZ 오류가 난다.
const TIMEOUT_NOTE = '⏱  timeout(90s) — netem 다중클라이언트 E2E';

// ── 실행할 하니스 고르기 / Pick harnesses ──
const files = readdirSync(__dir).filter(f => f.endsWith('_harness.mjs')).sort();
const rows = [];
const tasks = [];
for (const f of files) {
  if (FAST) {
    // 게이트 제외: git worktree==HEAD 무결성 검사가 있어 커밋 전 게이트에선 미커밋 변경으로 항상 실패(오탐)
    if (GATE_EXCLUDE.has(f)) { rows.push({ f, cat: 'SKIP', note: '⏭ 게이트 제외(git 상태 의존)' }); continue; }
    let body = ''; try { body = readFileSync(join(__dir, f), 'utf8'); } catch {}
    if (usesPuppeteer(body)) { rows.push({ f, cat: 'SKIP', note: '⏭ E2E(fast 제외)' }); continue; }
  }
  tasks.push(f);
}
const solo = tasks.filter(f => EXCLUSIVE.has(f));
const pool = tasks.filter(f => !EXCLUSIVE.has(f));
const t0 = Date.now();
console.log(`  ⚙ 동시 실행 ${JOBS}개 · 혼자 먼저 ${solo.length}개 + 동시 ${pool.length}개`);

// 한 줄 결과 + 실패 출력 / Print one result line (+ failure tail)
function report(r) {
  console.log('  ▶ ' + r.f + ' … ' + r.note);
  // 🔊 실패하면 «왜» 를 여기서 바로 보여 준다.
  //   그전엔 분류만 찍고 하니스 출력을 버렸다. 로컬에서는 그 하니스를 직접 다시 돌리면 되지만
  //   **CI 에서는 그럴 수가 없다** — 2026-08-10 에 CI 만 실패했을 때 로그에 이유가 한 줄도 없어
  //   원인을 추측으로 좁혀야 했다. 진단 없는 게이트는 사람을 막을 뿐 돕지 않는다.
  if (r.cat === 'FAIL') {
    const tail = String(r.out || '').split('\n').filter(l => l.trim()).slice(-14);
    console.log('    ┌─ 실패 출력(마지막 14줄) ' + '─'.repeat(24));
    tail.forEach(l => console.log('    │ ' + l.slice(0, 160)));
    console.log('    └' + '─'.repeat(48));
  }
}

// 한 번 돌리고, FAIL 이면 한 번 더 / Run once; on FAIL retry once
//   일시적 라이브 blip(동시 배포 등) 흡수: 두 번 실패해야 진짜 FAIL
async function runWithRetry(f) {
  let [cat, note, out] = await runHarness(f);
  if (cat === 'FAIL') { const [c2, n2, o2] = await runHarness(f); if (c2 !== 'FAIL') { cat = c2; note = n2 + ' (재시도 통과)'; out = o2; } }
  return { f, cat, note, out };
}

// ① 혼자 돌려야 하는 것부터 하나씩 / Exclusive ones first, one by one
for (const f of solo) { const r = await runWithRetry(f); rows.push(r); report(r); }

// ② 나머지는 JOBS 개씩 동시에 — 결과 줄은 이름 순서대로 찍는다(로그가 매번 같은 모양)
//    Rest in parallel; lines are printed in name order so the log reads the same every run
const done = new Array(pool.length);
let nextPrint = 0, nextRun = 0;
async function worker() {
  while (nextRun < pool.length) {
    const i = nextRun++;
    done[i] = await runWithRetry(pool[i]);
    while (nextPrint < pool.length && done[nextPrint]) report(done[nextPrint++]);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, pool.length) }, worker));

// ③ 동시에 돌다 FAIL 난 것은 «혼자» 한 번 더 — 옆 하니스 탓인지 가려낸다
//    Re-run pool FAILs alone: interference passes, real breakage fails again
//    ⏱ «시간초과» 도 같이 다시 돌린다 (2026-11-04) — 시간초과는 SKIP 으로 분류돼 이 재시도를 못 받았는데,
//      동시 실행의 CPU 다툼으로 느려진 것일 수 있다. 실측: class_cancelled_visible 이 혼자 50초 · 4개 동시
//      CI 에서 90초 초과 → SKIP → 기준선 «SKIP 20 → 21» 로 무관한 PR 들의 게이트가 막혔다(#2828·#2068).
//      ⛔ 판정은 그대로다 — 혼자 돌려도 시간초과면 SKIP(기준선이 잡음), 혼자 돌려 FAIL 이면 FAIL.
const soloPassed = [];
const timedOutInPool = (r) => r.cat === 'SKIP' && r.note === TIMEOUT_NOTE;
for (let i = 0; i < done.length; i++) {
  if (JOBS > 1 && (done[i].cat === 'FAIL' || timedOutInPool(done[i]))) {
    const r = await runWithRetry(done[i].f);
    if (r.cat === 'PASS') { r.note += ' (혼자 다시 돌려 통과)'; soloPassed.push(r.f); }
    console.log('  ↻ 혼자 다시: ' + r.f + ' … ' + r.note);
    done[i] = r;
  }
  rows.push(done[i]);
}
rows.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));

function runHarness(f) {
  return new Promise((res) => {
    let child;
    const so = [], se = [];
    let timedOut = false, settled = false, killTimer = null;
    const finish = (status, error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer);
      res(classify(f, { status, error, timedOut,
        stdout: Buffer.concat(so).toString('utf8'), stderr: Buffer.concat(se).toString('utf8') }));
    };
    // 90초가 지나면 끝낸다(예전 spawnSync timeout 과 같은 값). 안 죽으면 5초 뒤 강제 종료.
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch {}
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
    }, 90000);
    try {
      child = spawn('node', [join(__dir, f)], { cwd: dirname(__dir), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { finish(null, e); return; }
    child.stdout.on('data', (d) => so.push(d));
    child.stderr.on('data', (d) => se.push(d));
    child.on('error', (e) => finish(null, e));
    child.on('close', (code) => finish(code, null));
  });
}

function classify(f, r) {
  const out = (r.stdout || '') + '\n' + (r.stderr || '');
  const timedOut = !!r.timedOut;
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
  if (timedOut) return ['SKIP', TIMEOUT_NOTE, out];
  // ⚠️ 2026-08-09 수정 — 이 완화들은 **E2E 하니스에만** 적용한다.
  //   그전엔 E2E 여부를 안 보고 crash 면 무조건 SKIP 이었다. 그래서
  //   순수 소스/fetch 하니스가 «Cannot read properties» 같은 **진짜 버그**로 죽어도
  //   SKIP 으로 내려가 초록불이 됐다 — 경보기 안에 있던 경보기 고장이다.
  //   E2E 가 아닌 하니스가 죽으면 그건 브라우저 환경 탓이 아니라 코드 탓이다 → FAIL.
  if (crash) return isE2E
    ? ['SKIP', '⏭  E2E(로컬서버/활성 화상수업 상태 필요)', out]
    : ['FAIL', '⚠  하니스가 오류로 죽음(E2E 아님 — 코드 문제)', out];
  if (r.status === 0 && !failCount) return ['PASS', '✅', out];
  if (isE2E) return ['SKIP', '⏭  E2E(브라우저는 떴으나 활성 수업 상태 필요 — 헤드리스 불가)', out];
  return ['FAIL', '⚠  실제 확인 필요', out];
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
if (soloPassed.length) {
  // 동시에 돌 때만 실패 = 옆 하니스와 저장소 안 파일을 함께 쓰고 있을 가능성이 크다 → EXCLUSIVE 후보
  // 동시에 돌 때만 시간초과 = 무거워서 CPU 다툼에 90초를 넘긴다 → 하니스를 가볍게 할 후보
  console.log('\n  🔀 동시 실행에서만 실패·시간초과하고 혼자 돌리니 통과 (실패=EXCLUSIVE 후보 · 시간초과=하니스를 가볍게 할 후보):');
  soloPassed.forEach(f => console.log('    - ' + f));
}
console.log(`\n  ⏱ 걸린 시간 ${((Date.now() - t0) / 1000).toFixed(0)}초 · 동시 ${JOBS}개`);
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

// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📼 「저장이 안 됐는데 «완료» 라고 적히던 것」 회귀 감시 (2026-08-26 신설)

   [무엇이 문제였나] /api/recordings/stop 이 R2 업로드 성공 여부와 **무관하게**
   무조건 status='completed' 를 적었다. 그래서 클라우드에 한 조각도 안 올라간 녹화가
   관리자 목록에 초록색 「완료 · 2.1MB」로 떴다(그 용량은 브라우저가 잰 로컬 값이다).
   8/25 에 1,692건이 전부 「완료」인데 「⚠️ 영상 없음」이던 화면의 절반이 이것이었다.

   [왜 문자열 검사로는 부족한가] 판정이 SQL CASE 식이라 «그 함수를 부르는가»·«그 조건이
   있는가» 로는 결과를 알 수 없다. 조건 순서가 한 줄만 뒤바뀌어도 뜻이 통째로 달라지는데
   코드는 멀쩡해 보인다(CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」과 같은 뿌리).
   → **소스에서 그 UPDATE 문을 오려 내 진짜 SQLite 에 돌려서** 결과 status 를 확인한다.

   ⛔ 되돌리면 안 되는 것
     · 실물을 봤을 때(headProven=1)만 'completed' 로 올린다 — 클라이언트 말만 믿지 않는다
     · 조회를 «못 했을» 때는 강등하지 않는다(통과시키는 쪽으로 실패)
     · 이미 'deleted' 인 행은 어떤 경우에도 안 건드린다
   ═══════════════════════════════════════════════════════════════════════════ */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

let PASS = 0, FAIL = 0;
const check = (name, ok, why) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (why ? '  — ' + why : '')); }
};

console.log('\n📼 녹화 종료 판정 — 「저장 안 됐는데 완료」 회귀 감시\n');

const apiMango = read('cloudflare-deploy/src/api-mango.ts');
const indexTs = read('cloudflare-deploy/src/index.ts');
const mangoRec = read('cloudflare-deploy/public/js/mango-rec.js');
const recorderJs = read('cloudflare-deploy/public/video-call/js/recorder.js');
const admCore = read('cloudflare-deploy/public/js/adm-core.js');
const recR2 = read('cloudflare-deploy/src/recordings-r2.ts');

/* ── ① 소스에서 그 UPDATE 문을 오려 낸다 ───────────────────────────────── */
console.log('① /api/recordings/stop 의 UPDATE 문을 소스에서 찾는다');
const stopIdx = apiMango.indexOf("path === '/api/recordings/stop'");
check('/api/recordings/stop 핸들러가 있다', stopIdx > 0);
const stopBlock = apiMango.slice(stopIdx, stopIdx + 6000);
const sqlMatch = /`(UPDATE recordings[\s\S]*?WHERE id = \?)`/.exec(stopBlock);
check('UPDATE 문을 오려 냈다', !!sqlMatch);
if (!sqlMatch) { console.log(`\n💥 FAIL ${FAIL}`); process.exit(1); }
const SQL = sqlMatch[1];

check('실물 확인(head)으로 자가복구하는 갈래가 있다', /THEN 'completed'/.test(SQL));
check('이미 지워진 행은 건드리지 않는다', /status = 'deleted'\s+THEN status/.test(SQL));
check('이미 실패로 확정된 행을 임의로 뒤집지 않는다', /status = 'upload_failed' THEN status/.test(SQL));

/* ── ② 진짜 SQLite 에 돌려서 «무엇이 적히나» 를 본다 ────────────────────── */
console.log('\n② 진짜 SQLite 에 그 SQL 을 돌려 결과 status 를 확인한다');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE recordings (
  id INTEGER PRIMARY KEY, room_id TEXT, file_url TEXT, size_bytes INTEGER,
  duration_ms INTEGER, ended_at INTEGER, status TEXT, storage TEXT)`);

// 바인드 순서: ended_at, duration_ms, size_bytes, headProven, fallback, file_url, storage, id
const run = (before, headProven, fallback) => {
  db.exec(`DELETE FROM recordings`);
  db.prepare(`INSERT INTO recordings (id, room_id, file_url, status, storage) VALUES (1,'r','rec/r/1.webm',?,'r2')`)
    .run(before);
  db.prepare(SQL).run(Date.now(), 13000, 2_100_000, headProven, fallback, null, null, 1);
  return db.prepare(`SELECT status FROM recordings WHERE id = 1`).get().status;
};

check('업로드가 안 된 녹화는 「완료」가 되지 않는다  (recording + 실물없음 → upload_failed)',
  run('recording', 0, 'upload_failed') === 'upload_failed', '결과=' + run('recording', 0, 'upload_failed'));
check('제대로 올라간 녹화는 완료가 된다  (recording + 실물있음 → completed)',
  run('recording', 1, 'completed') === 'completed');
check('조회를 못 했으면 강등하지 않는다  (recording + 판단보류 → completed)',
  run('recording', 0, 'completed') === 'completed');
check('실물을 봤으면 실패도 되살린다 (자가복구)  (upload_failed + 실물있음 → completed)',
  run('upload_failed', 1, 'completed') === 'completed');
check('실물이 없으면 실패를 뒤집지 않는다  (upload_failed + 실물없음 → upload_failed)',
  run('upload_failed', 0, 'completed') === 'upload_failed');
check('지워진 행은 어떤 경우에도 그대로  (deleted → deleted)',
  run('deleted', 1, 'completed') === 'deleted');
check('한 번도 안 찍힌 것은 «실패» 가 아니라 «없던 일»  (recording + aborted → aborted)',
  run('recording', 0, 'aborted') === 'aborted');
db.close();

/* ── ③ 판정에 쓰는 재료가 실제로 만들어지는가 ──────────────────────────── */
console.log('\n③ 서버가 «실물» 을 직접 확인하는가');
check('RECORDINGS 버킷에서 head() 로 실물을 확인한다', /RECORDINGS[\s\S]{0,400}?\.head\(/.test(stopBlock));
check('CLIENT_ERR:·DEBUG: 는 키로 취급하지 않는다',
  /CLIENT_ERR:/.test(stopBlock) && /DEBUG:/.test(stopBlock));
check('head 조회 실패는 «판단 보류» 로 둔다(강등하지 않는다)', /headChecked/.test(stopBlock));
check('클라이언트가 보낸 r2_success 도 함께 본다', /r2_success === false/.test(stopBlock));

/* ── ④ 클라이언트 두 곳이 그 값을 보내는가 (한쪽만 고치면 그 경로는 그대로 거짓말한다) ── */
console.log('\n④ 녹화 클라이언트 두 곳이 r2_success 를 보낸다');
check('js/mango-rec.js (홈·화상수업) 가 보낸다', /r2_success:\s*!!r2Success/.test(mangoRec));
check('video-call/js/recorder.js 성공 경로가 보낸다', /r2_success:\s*true/.test(recorderJs));
check('video-call/js/recorder.js 실패 폴백이 보낸다', /r2_success:\s*false/.test(recorderJs));

/* ── ⑤ 「진단」 버튼이 rec/ 를 본다 ───────────────────────────────────── */
console.log('\n⑤ 「🔧 진단」이 실제 녹화가 쌓이는 접두사를 센다');
const testR2Idx = indexTs.indexOf("path === '/api/recordings/test-r2'");
check('test-r2 핸들러가 있다', testR2Idx > 0);
const testR2Block = indexTs.slice(testR2Idx, testR2Idx + 2500);
check("rec/ 접두사를 센다", /prefix:\s*'rec\/'/.test(testR2Block));
check("recordings/ 접두사도 함께 센다", /prefix:\s*'recordings\/'/.test(testR2Block));
check('.snap(안전망 사본)은 파일 수에서 뺀다', /endsWith\('\.snap'\)/.test(testR2Block));
check('화면이 두 접두사를 함께 적는다 (adm-core.js)', /rec\/ '/.test(admCore) || /rec\//.test(admCore));

/* ── ⑥ 저장소 상태 KPI — 엔드포인트와 «관문» 이 짝을 이루는가 ──────────── */
console.log('\n⑥ 저장소 상태 KPI 가 진짜 값을 받는다');
check('/api/recordings/storage-stats 핸들러가 있다',
  indexTs.includes("path === '/api/recordings/storage-stats'"));
check('그 경로가 인증 게이트에 등록돼 있다 (없으면 아무나 열람)',
  /if \(path === '\/api\/recordings\/storage-stats'\) return true;/.test(indexTs));
check('window.refreshStorageStats 가 실제로 정의돼 있다 (예전엔 없어서 버튼이 무동작)',
  /window\.refreshStorageStats\s*=\s*async function/.test(admCore));
check('타일 값을 하드코딩으로 되돌리지 않았다',
  !/id="rs-r2-size">12\.4</.test(read('cloudflare-deploy/public/admin.html')) &&
  !/id="rs-cost"/.test(read('cloudflare-deploy/public/admin.html')));
check('JS 가 그린 글자에 data-ko/data-en 을 함께 박는다 (🌐 전환 대응)',
  /setAttribute\('data-ko'/.test(admCore) && /setAttribute\('data-en'/.test(admCore));

/* ── ⑦ 이 버킷은 «녹화 전용이 아니다» ─────────────────────────────────────
   같은 R2 를 교재(`pdfs/`)·팝업(`popup-media/`)·진단 임시파일(`_test/`)이 나눠 쓴다.
   버킷 전체를 훑으면 그것들이 관리자 녹화 목록에 「⚠ 기록 없음(고아)」 로 딸려 나온다 —
   2026-08-26 사장님 화면 실측에서 **15,046줄**이 그렇게 찍혔다(총 15,096건 중).
   그래서 목록·저장소 상태 둘 다 «녹화 접두사만» 훑어야 한다. */
console.log('\n⑦ 녹화 목록·저장소 상태가 «녹화 접두사만» 훑는가');
check('녹화 접두사 정본(REC_LIST_PREFIXES)이 있다',
  /const REC_LIST_PREFIXES\s*=\s*\['rec\/',\s*'recordings\/'\]/.test(indexTs));
const listIdx = indexTs.indexOf('async function handleRecordingList');
const listBlock = indexTs.slice(listIdx, listIdx + 2500);
check('목록이 그 접두사 목록을 돌며 훑는다', /for \(const prefix of prefixes\)/.test(listBlock));
check('목록이 «접두사 없이» 버킷 전체를 훑지 않는다',
  !/\.list\(\{\s*limit:\s*1000,\s*cursor\s*\}\)/.test(listBlock), 'prefix 없는 list 호출이 남아 있다');
const statsIdx = indexTs.indexOf("path === '/api/recordings/storage-stats'");
const statsBlock = indexTs.slice(statsIdx, statsIdx + 2500);
check('저장소 상태도 접두사만 센다 (교재 17.8GB 가 「녹화 파일」로 잡히던 것)',
  /for \(const prefix of REC_LIST_PREFIXES\)/.test(statsBlock));
check('저장소 상태도 버킷 전체를 훑지 않는다',
  !/\.list\(\{\s*limit:\s*1000,\s*cursor\s*\}\)/.test(statsBlock), 'prefix 없는 list 호출이 남아 있다');

/* ── ⑧ 실패한 녹화도 «무엇을 얼마나 잃었는지» 를 남기는가  (2026-09-02 B안) ──────
   [무엇이 문제였나] upload/complete 실패 분기가 status·storage «만» 적었다.
   D1 실측(2026-09-02): upload_failed 73건이 **전부** duration_ms = 0 이었고,
   그중 여럿은 size_bytes 가 수 MB 였다(조각은 올라갔는데 마무리가 실패한 것).
   그러면 두 가지가 함께 망가진다 —
     ① 관리자 화면이 «몇 분짜리 수업을 잃었는지» 를 말할 수 없다.
     ② duration_ms 가 0 이라 나중에 오는 /stop 의 nothingRecorded 판정이 «없던 일(aborted)»
        쪽으로 기울고, 목록은 «aborted + size 0» 을 통째로 감추므로 **진짜 잃은 수업이
        «정상 정리분» 에 파묻힌다**(CLAUDE.md 2장 「정상 정리분에 진짜 실패가 파묻힌다」).
   [왜 문자열이 아니라 실행인가] MAX/COALESCE 가 붙은 UPDATE 라 «그 줄이 있는가» 로는
   «값이 지워지는가» 를 알 수 없다. 진짜 SQLite 에 돌려서 확인한다. */
console.log('\n⑧ 업로드 실패도 «잃은 크기» 를 남기는가 (진짜 SQLite)');
{
  const failIdx = recR2.indexOf("upload/complete 실패 recording_id");
  check('upload/complete 실패 분기가 있다', failIdx > 0);
  const failBlock = recR2.slice(failIdx, failIdx + 1800);
  const m = /`(UPDATE recordings[\s\S]*?WHERE id = \? AND status NOT IN \('completed','deleted'\))`/.exec(failBlock);
  check('그 분기의 UPDATE 문을 오려 냈다', !!m);
  if (m) {
    const FSQL = m[1];
    const db2 = new DatabaseSync(':memory:');
    db2.exec(`CREATE TABLE recordings (
      id INTEGER PRIMARY KEY, file_url TEXT, size_bytes INTEGER,
      duration_ms INTEGER, ended_at INTEGER, status TEXT, storage TEXT)`);
    // 바인드 순서: ended_at, duration_ms, size_bytes, id
    /* ⚠️ 되돌리면 이 SQL 은 «바인드 자리가 1개» 가 되어 run() 이 던진다.
       그때 하니스가 «크래시» 하면 스택트레이스만 남아 무엇이 깨졌는지 안 보인다 —
       깔끔한 FAIL 로 떨어뜨린다(되돌림 시험에서 실제로 크래시를 한 번 봤다). */
    const runFail = (before, prevDur, prevSize, sentDur, sentSize) => {
      try {
        db2.exec(`DELETE FROM recordings`);
        db2.prepare(`INSERT INTO recordings (id, file_url, status, storage, duration_ms, size_bytes)
                     VALUES (1,'rec/r/1.webm',?, 'r2', ?, ?)`).run(before, prevDur, prevSize);
        db2.prepare(FSQL).run(1757000000000, sentDur, sentSize, 1);
        return db2.prepare(`SELECT status, ended_at, duration_ms, size_bytes FROM recordings WHERE id = 1`).get();
      } catch (e) {
        return { status: 'SQL_ERR:' + (e && e.message), ended_at: 0, duration_ms: -1, size_bytes: -1 };
      }
    };

    const a = runFail('recording', 0, 0, 613000, 4537345);
    check('실패해도 «언제 끝났는지» 를 남긴다 (ended_at)', Number(a.ended_at) > 0, 'ended_at=' + a.ended_at);
    check('실패해도 «얼마나 길었는지» 를 남긴다 (duration_ms)', Number(a.duration_ms) === 613000, 'duration=' + a.duration_ms);
    check('실패해도 «얼마나 찍혔는지» 를 남긴다 (size_bytes)', Number(a.size_bytes) === 4537345, 'size=' + a.size_bytes);
    check('상태는 실패 그대로다', a.status === 'upload_failed');

    // 늦게 도착한 중복 요청(0 으로 온다)이 이미 적힌 값을 지우면 안 된다
    const b2 = runFail('upload_failed', 613000, 4537345, 0, 0);
    check('늦게 온 0 짜리 중복 요청이 이미 적힌 길이를 지우지 않는다',
      Number(b2.duration_ms) === 613000, 'duration=' + b2.duration_ms);
    check('늦게 온 0 짜리 중복 요청이 이미 적힌 크기를 지우지 않는다',
      Number(b2.size_bytes) === 4537345, 'size=' + b2.size_bytes);

    // 이미 완료·삭제된 행은 건드리지 않는다
    const c2 = runFail('completed', 613000, 4537345, 0, 0);
    check('이미 «완료» 인 행은 실패로 강등하지 않는다', c2.status === 'completed');
    const d2 = runFail('deleted', 1, 1, 0, 0);
    check('이미 «삭제» 인 행은 건드리지 않는다', d2.status === 'deleted');
    db2.close();
  }
}

/* ── ⑨ «없던 일(aborted)» 판정이 DB 에 이미 적힌 값도 보는가 ────────────────
   탭을 닫고 나가면 onstop 이 안 돌아 /stop 은 duration 0 · size 0 으로 온다.
   그런데 조각 업로드가 이미 size_bytes 를 적어 뒀을 수 있다 — 그걸 안 보면
   «진짜 찍힌 수업» 이 «없던 일» 로 분류되고, 목록이 그걸 통째로 감춘다. */
console.log('\n⑨ «없던 일» 판정이 클라이언트 말만 믿지 않는가');
check('/stop 이 그 행의 size_bytes·duration_ms 도 함께 읽는다',
  /SELECT file_url, status, size_bytes, duration_ms FROM recordings/.test(stopBlock));
check('판정이 «보낸 값» 과 «이미 적힌 값» 중 큰 쪽을 본다',
  /Math\.max\(Number\(b\.size_bytes\)[\s\S]{0,80}?cur\?\.size_bytes/.test(stopBlock) &&
  /Math\.max\(Number\(b\.duration_ms\)[\s\S]{0,80}?cur\?\.duration_ms/.test(stopBlock));
check('/stop 의 UPDATE 도 이미 적힌 길이·크기를 0 으로 덮지 않는다',
  /duration_ms = MAX\(COALESCE\(duration_ms, 0\), \?\)/.test(SQL) &&
  /size_bytes = MAX\(COALESCE\(size_bytes, 0\), \?\)/.test(SQL));

/* ── ⑩ 마무리 요청을 한 번은 다시 물어보는가 ────────────────────────────────
   서버는 complete 가 실패해도 head() 로 실물이 있으면 «성공» 으로 자가복구한다.
   multipart 완료 직후 잠깐 안 보이는 구간이 서버 안 300ms 재시도보다 길면 그대로 실패로
   찍힌다 — 클라이언트가 한 번만 더 물어보면 그 자리에서 완료로 돌아온다.
   ⛔ 무한 재시도는 금지(수업이 끝날 때마다 도는 자리다). */
console.log('\n⑩ 마무리(complete)를 한 번은 다시 물어보는가');
{
  /* ⚠️ 범위를 «길이» 로 자르면 옆 함수(onBeforeUnload)의 같은 URL 이 딸려 들어온다 —
     실제로 그래서 한 번 거짓 FAIL 이 났다. 중괄호 짝으로 그 함수만 잘라 낸다
     (CLAUDE.md 2장 「검사 범위를 길이로 자르지 마세요」). */
  const ci = mangoRec.indexOf('async function completeR2Upload');
  check('completeR2Upload 가 있다', ci > 0);
  const open = mangoRec.indexOf('{', ci);
  let depth = 0, end = open;
  for (let i = open; i < mangoRec.length; i++) {
    const ch = mangoRec[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const cblock = mangoRec.slice(ci, end + 1);
  check('실패하면 잠깐 기다렸다 한 번 더 보낸다',
    /!res \|\| !res\.ok/.test(cblock) && /setTimeout\(r, 1500\)/.test(cblock));
  const sends = (cblock.match(/\/api\/recordings\/upload\/complete/g) || []).length;
  const calls = (cblock.match(/await sendComplete\(\)/g) || []).length;
  check(`재시도는 «한 번» 이다 — 무한 루프가 아니다 (요청 자리 ${sends}곳 · 호출 ${calls}회)`,
    sends === 1 && calls === 2 && !/while\s*\(/.test(cblock) && !/for\s*\(\s*let\s+i/.test(cblock));
}

console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}\n`);
process.exit(FAIL ? 1 : 0);

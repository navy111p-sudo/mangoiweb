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

console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}\n`);
process.exit(FAIL ? 1 : 0);

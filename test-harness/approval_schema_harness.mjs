// -*- coding: utf-8 -*-
// 🗃️ 결재 스키마 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/approval_schema_harness.mjs
//   대상:  cloudflare-deploy/src/api-approval.ts 의 ensureTable() 이 실제로 실행하는 DDL
//
//   이 파일이 지키는 것 —
//     결재 표는 **첫 요청 때** 만들어진다(ensureTable). 여기서 문법이 하나라도 틀리면
//     결재 API 가 통째로 500 이 되는데, 아무도 안 눌러 보면 아무도 모른다.
//     D1 은 SQLite 라, 진짜 SQLite 로 그대로 돌려 보면 배포 전에 잡을 수 있다.
//
//     A. 옛 표(2026-08-05 스키마)에 칸을 더하는 ALTER 가 전부 통하는가
//     B. 같은 DDL 이 두 번 돌아도 안전한가 (isolate 마다 재실행된다)
//     C. 부분 UNIQUE 인덱스 — 재전송이 지출을 두 번 잡지 않게 하는 핵심
//        · 옛 행(client_key NULL)이 여러 개여도 안 걸려야 한다
//        · 같은 사람+같은 열쇠는 막고, 다른 사람이면 통과해야 한다
//     D. 실제로 도는 쿼리들(정렬·ETag 집계·조건부 UPDATE·자동점검)이 문법에 맞는가
//
//   ⚠️ 운영 DB 를 절대 건드리지 않는다 — 메모리 SQLite 다.
//   ⚠️ node:sqlite 가 없는 런타임에서는 «건너뜀» 으로 끝난다(실패로 세지 않는다).

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch {
  console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)');
  process.exit(0);
}
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ⚠️ 절대 경로를 박지 말 것 — 내 컴퓨터에서만 통하고 CI 러너에서는 파일이 없어 죽는다.
//    (2026-08-17 실제로 이렇게 배포 게이트에서 걸렸다. 다른 하니스와 같은 방식으로 맞춘다.)
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-approval.ts'), 'utf8');

let PASS = 0, FAIL = 0;
const t = (name, fn) => {
  try { fn(); PASS++; console.log('  OK   ' + name); }
  catch (e) { FAIL++; console.log('  FAIL ' + name + ' — ' + e.message); }
};

const db = new DatabaseSync(':memory:');

// ── ensureTable 이 실제로 실행하는 문장들 (api-approval.ts 에서 그대로 옮김) ──
const CREATE_REQ =
  `CREATE TABLE IF NOT EXISTS approval_requests (` +
  `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
  `req_type TEXT NOT NULL DEFAULT 'expense', ` +
  `requester_username TEXT NOT NULL, requester_name TEXT, ` +
  `title TEXT NOT NULL, body TEXT, category TEXT, ` +
  `amount REAL, currency TEXT DEFAULT 'PHP', spent_at TEXT, ` +
  `file_key TEXT, file_name TEXT, file_ext TEXT, file_size INTEGER, ` +
  `status TEXT NOT NULL DEFAULT 'pending', ` +
  `decided_by TEXT, decided_at INTEGER, decide_memo TEXT, ` +
  `created_at INTEGER NOT NULL)`;

const ADD_COLS = [
  'stage_seq INTEGER DEFAULT 1', 'stage_total INTEGER DEFAULT 1',
  'deadline_at INTEGER', 'stage_due_at INTEGER',
  'summary_ko TEXT', 'summary_en TEXT', 'ocr_amount REAL', 'flags TEXT',
  'warned_at INTEGER', 'escalated_at INTEGER', 'client_key TEXT',
  'date_from TEXT', 'date_to TEXT', 'linked_id INTEGER',
].map((c) => `ALTER TABLE approval_requests ADD COLUMN ${c}`);

console.log('\n[1] 표 만들기 — 옛 스키마부터');
t('approval_requests 생성', () => db.exec(CREATE_REQ));

console.log('\n[2] 칸 추가 (기존 운영 표에 실제로 일어날 일)');
for (const sql of ADD_COLS) {
  t(sql.replace('ALTER TABLE approval_requests ADD COLUMN ', '+ '), () => db.exec(sql));
}

console.log('\n[3] 같은 DDL 을 두 번 돌려도 안전한가 (isolate 마다 재실행된다)');
t('CREATE 재실행', () => db.exec(CREATE_REQ));
t('ALTER 재실행은 에러 — 코드가 try/catch 로 삼키는 게 맞는지', () => {
  let threw = false;
  try { db.exec(ADD_COLS[0]); } catch { threw = true; }
  if (!threw) throw new Error('두 번째 ALTER 가 에러를 안 냈다(예상과 다름)');
  if (!/try \{ await env\.DB\.exec\(sql\); \} catch/.test(SRC)) {
    throw new Error('소스가 ALTER 를 try/catch 로 감싸지 않았다');
  }
});

console.log('\n[4] 부분 UNIQUE 인덱스 — 멱등성의 핵심');
t('idx_appr_ckey (WHERE client_key IS NOT NULL)', () => db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_appr_ckey ON approval_requests(requester_username, client_key) WHERE client_key IS NOT NULL`
));
t('옛 행(client_key NULL)이 여러 개여도 걸리지 않는다', () => {
  const ins = `INSERT INTO approval_requests (req_type, requester_username, title, created_at) VALUES ('expense','u1','a',1)`;
  db.exec(ins); db.exec(ins); db.exec(ins);   // NULL 3개 — 부분 인덱스라 통과해야 한다
});
t('같은 사람+같은 열쇠는 두 번 안 들어간다 (재전송 중복 방지)', () => {
  db.exec(`INSERT INTO approval_requests (req_type, requester_username, title, created_at, client_key) VALUES ('expense','u1','a',1,'K1')`);
  let threw = false;
  try { db.exec(`INSERT INTO approval_requests (req_type, requester_username, title, created_at, client_key) VALUES ('expense','u1','a',1,'K1')`); }
  catch (e) { threw = /UNIQUE|constraint/i.test(e.message); }
  if (!threw) throw new Error('중복이 그대로 들어갔다 — 지출이 두 번 잡힌다');
});
t('다른 사람이면 같은 열쇠를 써도 된다', () => db.exec(
  `INSERT INTO approval_requests (req_type, requester_username, title, created_at, client_key) VALUES ('expense','u2','a',1,'K1')`
));

console.log('\n[5] 나머지 표');
t('approval_steps', () => db.exec(
  `CREATE TABLE IF NOT EXISTS approval_steps (` +
  `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
  `request_id INTEGER NOT NULL, seq INTEGER NOT NULL, role TEXT NOT NULL, ` +
  `status TEXT NOT NULL DEFAULT 'waiting', ` +
  `decided_by TEXT, decided_at INTEGER, memo TEXT, started_at INTEGER)`
));
t('approval_steps 유니크 인덱스', () => db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_appr_step_uni ON approval_steps(request_id, seq)`
));
t('approval_delegates', () => db.exec(
  `CREATE TABLE IF NOT EXISTS approval_delegates (` +
  `username TEXT PRIMARY KEY, delegate_to TEXT NOT NULL, ` +
  `until_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
));
t('delegates ON CONFLICT 업서트', () => {
  const q = `INSERT INTO approval_delegates (username, delegate_to, until_at, updated_at) VALUES ('a','b',1,1)
             ON CONFLICT(username) DO UPDATE SET delegate_to = excluded.delegate_to,
               until_at = excluded.until_at, updated_at = excluded.updated_at`;
  db.exec(q); db.exec(q);
});

console.log('\n[6] 실제로 도는 쿼리들이 문법에 맞나');
t('결재함 목록 정렬 (시각에 기대지 않는 순서)', () => db.prepare(
  `SELECT * FROM approval_requests WHERE status = 'pending' AND requester_username != ?
    ORDER BY (stage_due_at IS NULL) ASC, stage_due_at ASC, created_at ASC LIMIT 40`
).all('x'));
t('ETag 서명 집계', () => db.prepare(
  `SELECT COUNT(*) AS c, IFNULL(MAX(created_at),0) AS mc, IFNULL(MAX(decided_at),0) AS md,
          IFNULL(MAX(IFNULL(escalated_at,0)),0) AS me2 FROM approval_requests`
).get());
t('조건부 UPDATE (동시 클릭 방어)', () => db.prepare(
  `UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ?, decide_memo = ?,
          stage_seq = ?, stage_due_at = ?
    WHERE id = ? AND status = 'pending' AND IFNULL(stage_seq, 1) = ?`
).run('approved', 'u', 1, null, 2, 1, 1, 1));
t('주간 요약 평균 처리 시간', () => db.prepare(
  `SELECT AVG(decided_at - created_at) AS ms FROM approval_requests
    WHERE created_at >= ? AND decided_at IS NOT NULL`
).get(0));
t('자동 점검 — 중복 청구 조회', () => db.prepare(
  `SELECT COUNT(*) AS c FROM approval_requests
    WHERE requester_username = ? AND req_type = ? AND currency = ?
      AND amount = ? AND created_at >= ? AND status != 'rejected'`
).get('u', 'expense', 'PHP', 1, 0));

db.close();
console.log('\n──────────────────────────────────────');
console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
process.exit(FAIL ? 1 : 0);

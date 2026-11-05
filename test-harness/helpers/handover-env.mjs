// 매일보고 API(cloudflare-deploy/src/daily-handover.ts)를 «진짜 SQLite» 위에서 실제로 돌리는 공용 준비물.
// ⛔ 운영 D1 은 건드리지 않는다 — 메모리 DB 만 쓴다.
// 쓰는 곳: handover_board_harness.mjs(자동) · manual/handover-board-browser.mjs(브라우저).
// 변이시험용으로 정본 경로를 바꿀 수 있다: HANDOVER_SRC · BOARD_SRC (기본은 저장소의 정본).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

export function loadTypescript() {
  const found = [join(ROOT, 'cloudflare-deploy/node_modules/typescript'), '/opt/node22/lib/node_modules/typescript']
    .find(p => { try { require.resolve(p); return true; } catch { return false; } });
  return found ? require(found) : null;
}

/** TS 파일 하나를 CommonJS 로 옮겨 새 vm 문맥에서 돌린다. requireFn 이 없으면 import 0 인 파일만 된다. */
export function loadTsModule(ts, file, { requireFn, globals = {} } = {}) {
  const path = file.startsWith('/') ? file : join(ROOT, file);
  const code = ts.transpileModule(readFileSync(path, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { ...console, warn() {} }, crypto, Date, Request, Response, URL,
    setTimeout, clearTimeout, require: requireFn || (name => { throw new Error('unexpected import ' + name); }), ...globals,
  });
  return module.exports;
}

export const BOARD_SRC = process.env.BOARD_SRC || 'cloudflare-deploy/src/handover-board.ts';
export const HANDOVER_SRC = process.env.HANDOVER_SRC || 'cloudflare-deploy/src/daily-handover.ts';

/** 매일보고 API 를 메모리 SQLite 위에 세운다. 경영진 명단은 정본(approval-policy.ts EXEC_USERNAMES)과 같은 두 사람. */
export function makeHandoverEnv(ts, { now = Date.parse('2026-11-04T10:00:00Z'), execs = ['admin', 'mgr_jjw'] } = {}) {
  const clock = { now };
  class TestDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
    CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
    CREATE TABLE push_queue(endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER);`);
  // D1 처럼: prepare() 와 prepare().bind() 두 층 모두에 first/all/run 이 있다(bind 없이 부르는 질의도 돈다).
  function statement(sql) {
    let args = [];
    return {
      sql,
      bind(...a) { assert.ok(a.length <= 100, 'D1 bind limit'); args = a; return this; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      runSync() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      async run() { return this.runSync(); },
    };
  }
  const env = { DB: { prepare: statement, async batch(items) {
    db.exec('BEGIN');
    try { const out = items.map(s => s.runSync()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
  } } };
  const board = loadTsModule(ts, BOARD_SRC);
  const chunk = loadTsModule(ts, 'cloudflare-deploy/src/d1-chunk.ts');
  const mod = loadTsModule(ts, HANDOVER_SRC, {
    globals: { Date: TestDate },
    requireFn: name => {
      if (name === './d1-chunk') return chunk;
      if (name === './handover-board') return board;
      if (name === './approval-policy') return {
        isHqStaff: a => !!a.ok && !a.isTeacher && ['hq', 'staff'].includes(a.role),
        isExec: a => !!a && !!a.ok && !a.isTeacher && execs.includes(String(a.username || '').toLowerCase()),
      };
      if (name === './once-per-isolate') return { oncePerIsolate: f => f };
      if (name === './handover-routing') return { approvalHints: () => [], APPROVAL_PROMPT_RULE: '' };
      if (name === './auth-admin') return { PH_MANAGERS: [] };
      if (name === './web-push') return { broadcastWebPush: async eps => ({ sent: eps.length }) };
      throw new Error('unexpected import ' + name);
    },
  });
  const actor = u => (typeof u === 'string' ? { ok: true, username: u, name: u, role: 'hq' } : u);
  async function request(method, path, body, who) {
    const url = new URL('https://mangoi.ai/api/approval/handover' + path);
    const req = new Request(url, { method, headers: body ? { 'Content-Type': 'application/json', Origin: 'https://mangoi.ai' } : {},
      body: body ? JSON.stringify(body) : undefined });
    const res = await mod.handleDailyHandover(req, url, env, actor(who));
    return res;
  }
  async function api(path, body, who) {
    const res = await request(body ? 'POST' : 'GET', path, body, who);
    return { status: res.status, ...(await res.json()) };
  }
  return { db, env, clock, mod, board, api, request };
}

/** 팀 보고판 시험용 하루치 자료 — 2026-11-04(수) · KST 19:00. 사람마다 상태가 하나씩 다르다. */
export const DRAFT_SECRET = '초안비밀문장-보이면안됨';
export const DRAFT_FILE = '초안첨부-비밀.pdf';
const LBY_FILE_ID = '11111111-1111-4111-8111-111111111111', DRAFT_FILE_ID = '22222222-2222-4222-8222-222222222222';
export async function seedBoardDay(t) {
  const { db, api } = t;
  const people = [
    ['admin', '대표'], ['mgr_jjw', '장지웅 부장'], ['mgr_lby', '이병엽 이사'], ['mgr_melca', 'Melca'],
    ['staff_a', '본사 직원 A'], ['staff_b', '본사 직원 B'], ['staff_c', '본사 직원 C'], ['staff_x', '본사 직원 X'], ['staff_y', '본사 직원 Y'],
  ];
  const ins = db.prepare('INSERT INTO admin_account(username,name) VALUES(?,?)');
  for (const [u, n] of people) { ins.run(u, n); db.prepare(`INSERT INTO admin_scope VALUES(?, 'hq')`).run(u); }
  assert.equal((await api('/home', null, 'admin')).ok, true); // ensure() — 매일보고 표를 만든다
  const sched = db.prepare(`INSERT INTO daily_handover_schedule(username,enabled,weekdays,due_time,exempt_date,updated_at,holiday_country,mandatory)
    VALUES(?,1,'1,2,3,4,5',?,'',0,?,0)`);
  for (const [u, due, c] of [['mgr_jjw', '18:00', 'KR'], ['mgr_lby', '19:00', 'KR'], ['mgr_melca', '23:00', 'PH'],
    ['staff_a', '19:00', 'KR'], ['staff_b', '19:00', 'KR'], ['staff_c', '19:00', 'KR']]) sched.run(u, due, c);
  const day = '2026-11-04', at = Date.parse('2026-11-04T08:00:00Z');
  const report = db.prepare(`INSERT INTO daily_handovers(report_date,username,staff_name,recipient,payload,status,version,updated_at,submitted_at,
    acknowledged_at,acknowledged_by,feedback,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const p = o => JSON.stringify({ work: '', no_issue: true, issue: '', no_open: true, open: '', owner: '', deadline: '', student: '', class_info: '',
    priority: 'normal', attachments: [], ...o });
  report.run(day, 'mgr_lby', '이병엽 이사', 'mgr_jjw', p({ work: '방문 3곳(A학원 상담 · B학원 시연)\n내근: 계약서 검토', no_issue: false,
    issue: 'B학원이 표준보다 낮은 단가를 요청 → 결재로 올림', no_open: false, open: 'B학원 견적서 보내기', owner: 'mgr_lby', deadline: '2026-11-03T18:00' }),
    'submitted', 2, at, at, null, null, '', 'k1');
  report.run(day, 'mgr_melca', 'Melca', 'mgr_jjw', p({ work: 'Updated teacher schedules for next week' }), 'submitted', 2, at, at, null, null, '', 'k2');
  report.run(day, 'staff_a', '본사 직원 A', 'mgr_jjw', p({ work: '지사 정산 자료 정리' }), 'acknowledged', 3, at, at, at + 60000, 'mgr_jjw', '', 'k3');
  report.run(day, 'staff_b', '본사 직원 B', 'mgr_jjw', p({ work: '교재 배송 확인' }), 'changes_requested', 3, at, at, at + 60000, 'mgr_jjw', '배송 송장 번호를 적어 주세요', 'k4');
  // 첨부 짝: 낸 보고의 첨부는 보이고(«견적서»), 초안의 첨부는 이름조차 안 나가야 한다(DRAFT_FILE).
  //   ⚠️ 초안 첨부가 없으면 «SQL 의 초안 거르기» 가 빠져도 아무 검사도 안 걸린다(함정 대조가 실제로 잡음 — 순수 함수가 본문만 한 번 더 거른다).
  const file = db.prepare(`INSERT INTO daily_handover_files(id,username,report_date,name,mime,size,object_key,created_at) VALUES(?,?,?,?,?,?,?,?)`);
  file.run(LBY_FILE_ID, 'mgr_lby', day, '견적서.pdf', 'application/pdf', 1024, 'daily-handover/' + LBY_FILE_ID, at);
  file.run(DRAFT_FILE_ID, 'staff_c', day, DRAFT_FILE, 'application/pdf', 1024, 'daily-handover/' + DRAFT_FILE_ID, at);
  db.prepare(`UPDATE daily_handovers SET payload=json_set(payload,'$.attachments',json_array(?)) WHERE username='mgr_lby' AND report_date=?`).run(LBY_FILE_ID, day);
  report.run(day, 'staff_c', '본사 직원 C', 'mgr_jjw', p({ work: DRAFT_SECRET, attachments: [DRAFT_FILE_ID] }), 'draft', 1, at, null, null, null, '', 'k5');
  report.run(day, 'staff_y', '본사 직원 Y', 'admin', p({ work: '명단 밖이지만 보고를 냈다', priority: 'urgent' }), 'submitted', 2, at, at, null, null, '', 'k6');
  report.run('2026-11-03', 'mgr_jjw', '장지웅 부장', 'admin', p({ work: '어제 보고' }), 'submitted', 2, at - 86400000, at - 86400000, null, null, '', 'k7');
  db.exec(`CREATE TABLE sales_reps(id INTEGER PRIMARY KEY, name TEXT, admin_username TEXT, active INTEGER DEFAULT 1);
    CREATE TABLE sales_leads(id INTEGER PRIMARY KEY, rep_id INTEGER, name TEXT);
    CREATE TABLE sales_activities(id INTEGER PRIMARY KEY AUTOINCREMENT, rep_id INTEGER, lead_id INTEGER, activity_date TEXT, kind TEXT,
      title TEXT, note TEXT, outcome TEXT);
    INSERT INTO sales_reps VALUES(1,'이병엽','mgr_lby',1),(2,'김성훈','sales_kim',1),(3,'장지웅','mgr_jjw',1);
    INSERT INTO sales_leads VALUES(1,1,'A학원'),(2,2,'다른학원');
    INSERT INTO sales_activities(rep_id,lead_id,activity_date,kind,title,note,outcome) VALUES
      (1,1,'2026-11-04','visit',NULL,NULL,'원장 상담, 다음 주 시연 약속'),
      (1,NULL,'2026-11-04','demo','B학원',NULL,'3개 반 체험 수업'),
      (1,NULL,'2026-11-04','call',NULL,'C학원 재원생 확인',NULL),
      (1,1,'2026-11-03','visit',NULL,NULL,'어제 방문 — 오늘 숫자에 들어가면 안 됨'),
      (2,2,'2026-11-04','visit',NULL,NULL,'다른 담당자');`);
  return { day };
}

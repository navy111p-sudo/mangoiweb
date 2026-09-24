#!/usr/bin/env node
// node --experimental-vm-modules test-harness/lesson_reminder_delivery_harness.mjs
// 실제 TypeScript 경로 + 메모리 SQLite. SOLAPI fetch 만 스텁하므로 실제 문자는 나가지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

// run.mjs 는 각 하니스를 일반 node 로 실행한다. 필요한 플래그는 이 테스트 안에서만 켠다.
if (typeof vm.SourceTextModule !== 'function') {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], { stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
let NOW = Date.parse('2026-09-21T03:00:00Z'); // 월요일 12:00 KST; 수업 12:30
let calls = [], outcomes = [], contacts = {}, failingSql = null;
let PASS = 0;
const FakeDate = class extends Date { static now() { return NOW; } };
const ctx = vm.createContext({ Date: FakeDate, console, crypto, TextEncoder, URL, Uint8Array,
  fetch: async (_url, options) => {
    calls.push(JSON.parse(options.body).message);
    const next = outcomes.shift();
    if (next instanceof Error) throw next;
    const body = next || { statusCode: '2000', messageId: 'fixture-' + calls.length };
    return { status: body.http || 200, text: async () => JSON.stringify(body) };
  },
});
const modules = new Map();
const contactModule = new vm.SyntheticModule(['phonesForStudent'], function () {
  this.setExport('phonesForStudent', async (_env, uid) => contacts[uid] || { parent: '', student: '' });
}, { context: ctx });
modules.set('notify-contacts', contactModule);
for (const name of ['lesson-reminder', 'lesson-reminder-delivery', 'solapi-client', 'site-url', 'owner-sms-mute', 'class-start-date']) {
  const code = stripTypeScriptTypes(readFileSync(resolve(SRC, name + '.ts'), 'utf8'));
  modules.set(name, new vm.SourceTextModule(code, { context: ctx, identifier: name }));
}
const sweepModule = modules.get('lesson-reminder');
await sweepModule.link(spec => modules.get(spec.replace(/^\.\//, '')));
await sweepModule.evaluate();
const sweep = sweepModule.namespace.runLessonReminderSweep;
const { deliverLessonReminder: deliver, ensureLessonReminderDeliveryTable: ensure } = modules.get('lesson-reminder-delivery').namespace;
function fixture(count = 1) {
  NOW = Date.parse('2026-09-21T03:00:00Z');
  calls = []; outcomes = []; contacts = {}; failingSql = null;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT,
    day_of_week INTEGER, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, teacher_id INTEGER, status TEXT);
    CREATE TABLE students_erp (user_id TEXT, login_id TEXT, parent_phone TEXT, student_phone TEXT, phone TEXT);`);
  for (let i = 1; i <= count; i++) {
    db.prepare(`INSERT INTO class_schedules VALUES (?,?,'테스트 학생',1,NULL,'12:30',25,1,'active')`).run(i, 'fixture-' + i);
    contacts['fixture-' + i] = { parent: '01000000001', student: '01000000002' };
  }
  const checkSql = sql => { if (failingSql?.(sql)) throw Error('fixture storage failure'); };
  const env = {
    SOLAPI_API_KEY: 'fixture-key', SOLAPI_API_SECRET: 'fixture-secret', SOLAPI_FROM_PHONE: '0299999999',
    SESSION_STATE: { get: async () => null },
    DB: {
      exec: async sql => { checkSql(sql); db.exec(sql); return {}; },
      prepare: sql => {
        const bind = (...args) => ({
          first: async () => { checkSql(sql); return db.prepare(sql).get(...args) || null; },
          all: async () => { checkSql(sql); return { results: db.prepare(sql).all(...args) }; },
          run: async () => { checkSql(sql); const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        });
        return { bind, ...bind() };
      },
    },
  };
  return { env, db };
}
async function test(name, fn) {
  await fn(); PASS++; console.log('PASS ' + name);
}
await test('대표번호가 실제 SOLAPI 요청에 실리고 재실행은 중복 발송하지 않는다', async () => {
  const { env } = fixture();
  const r = await sweep(env);
  assert.equal(r.sms_sent, 2); assert.equal(r.reminded, 1);
  assert.equal(r.from, '1644-0561'); assert.equal(r.mode, 'real');
  assert.ok(calls.every(c => c.from === '16440561' && c.type === 'LMS'));
  assert.equal((await sweep(env)).sms_sent, 0); assert.equal(calls.length, 2);
});
await test('번호가 없어도 완료 처리하지 않으며 번호 보완 후 알림 창 안에서 발송', async () => {
  const { env, db } = fixture(); contacts = {};
  assert.equal((await sweep(env)).details[0].status, 'no_phone');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_reminder_log').get().n, 0);
  contacts['fixture-1'] = { parent: '01000000001', student: '' };
  assert.equal((await sweep(env)).sms_sent, 1);
});
await test('dry 진단은 문자·장부 생성 없이 가능하고 완료 건수는 0', async () => {
  const { env, db } = fixture();
  const r = await sweep(env, { dry: true });
  assert.equal(r.sms_sent, 0); assert.equal(r.reminded, 0); assert.equal(calls.length, 0);
  assert.equal(r.details[0].status, 'dry_run');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'lesson_reminder_%'").get().n, 0);
});
await test('mock 성공을 실제 발송으로 세지 않고 real 전환 후 정상 발송', async () => {
  const { env, db } = fixture(); env.SOLAPI_TEST_MODE = 'true';
  const r = await sweep(env);
  assert.equal(r.sms_sent, 0); assert.equal(r.reminded, 0); assert.equal(r.details[0].parent_sms, 'mock');
  assert.equal(calls.length, 0); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lesson_reminder_log').get().n, 0);
  env.SOLAPI_TEST_MODE = 'false'; assert.equal((await sweep(env)).sms_sent, 2);
});
await test('API 설정 없음은 disabled 로 남고 설정 뒤 다시 보낼 수 있다', async () => {
  const { env } = fixture(); delete env.SOLAPI_API_KEY;
  const r = await sweep(env); assert.equal(r.mode, 'disabled'); assert.equal(r.reminded, 0); assert.equal(calls.length, 0);
  env.SOLAPI_API_KEY = 'fixture-key'; assert.equal((await sweep(env)).sms_sent, 2);
});
await test('부모 성공·학생 거절이면 성공한 부모를 제외하고 학생만 재시도', async () => {
  const { env } = fixture(); outcomes = [{ statusCode: '2000' }, { http: 403, errorCode: 'InvalidSender' }];
  const r = await sweep(env); assert.equal(r.sms_sent, 1); assert.equal(r.details[0].status, 'partial');
  assert.equal((await sweep(env)).sms_sent, 0); assert.equal(calls.length, 2);
  NOW += 61_000;
  assert.equal((await sweep(env)).sms_sent, 1); assert.equal(calls.length, 3);
  assert.equal(calls[2].to, '01000000002');
});
await test('같은 번호의 하이픈 차이는 1회만 발송', async () => {
  const { env } = fixture(); contacts['fixture-1'] = { parent: '010-0000-0001', student: '01000000001' };
  assert.equal((await sweep(env)).sms_sent, 1); assert.equal(calls.length, 1);
});
await test('동시 실행에도 같은 수신자에게 1회만 발송', async () => {
  const { env } = fixture();
  const rr = await Promise.all([sweep(env), sweep(env)]);
  assert.equal(calls.length, 2); assert.equal(rr.reduce((n, r) => n + r.sms_sent, 0), 2);
});
await test('네트워크 응답 유실은 unknown 으로 보류하며 무조건 재시도하지 않는다', async () => {
  const { env } = fixture(); contacts['fixture-1'].student = ''; outcomes = [Error('fixture timeout')];
  assert.equal((await sweep(env)).details[0].parent_sms, 'unknown');
  NOW += 61_000; await sweep(env); assert.equal(calls.length, 1);
});
await test('2xx 해석 실패와 5xx 도 접수 여부 불명으로 보류', async () => {
  for (const response of [{ statusCode: 'unexpected' }, { http: 503 }]) {
    const { env } = fixture(); contacts['fixture-1'].student = ''; outcomes = [response];
    assert.equal((await sweep(env)).details[0].parent_sms, 'unknown');
    NOW += 61_000; await sweep(env); assert.equal(calls.length, 1);
  }
});
await test('결과 저장 실패 뒤에도 선점 기록으로 중복 방지', async () => {
  const { env } = fixture(); contacts['fixture-1'].student = '';
  failingSql = sql => /SET status=\?, message_id/.test(sql) || /INSERT INTO lesson_reminder_log/.test(sql);
  const r = await sweep(env); assert.equal(r.sms_sent, 1); assert.equal(r.details[0].parent_sms, 'accepted_log_failed');
  failingSql = null; NOW += 61_000; await sweep(env); assert.equal(calls.length, 1);
});
await test('장부 생성·중복 조회 실패는 발송 없이 종료', async () => {
  for (const pattern of [/CREATE TABLE IF NOT EXISTS lesson_reminder_delivery/, /SELECT COUNT\(\*\) AS n/]) {
    const { env } = fixture(); failingSql = sql => pattern.test(sql);
    const r = await sweep(env); assert.equal(r.ok, false); assert.equal(calls.length, 0);
  }
});
await test('재시도는 수신자당 3회, 1회 스윕은 실패 포함 40회 이내', async () => {
  const { env } = fixture(); contacts['fixture-1'].student = '';
  outcomes = Array.from({ length: 4 }, () => ({ http: 402, errorCode: 'NotEnoughBalance' }));
  for (let i = 0; i < 4; i++) { await sweep(env); NOW += 61_000; }
  assert.equal(calls.length, 3);
  const many = fixture(30); outcomes = Array.from({ length: 60 }, () => ({ http: 402, errorCode: 'NotEnoughBalance' }));
  assert.equal((await sweep(many.env)).sms_sent, 0); assert.equal(calls.length, 40);
});
await test('운영자 음소거를 우회하지 않는다', async () => {
  const { env } = fixture(); contacts['fixture-1'].student = ''; env.OWNER_ALERT_PHONE = contacts['fixture-1'].parent;
  const r = await sweep(env); assert.equal(r.sms_sent, 0); assert.equal(calls.length, 0);
  assert.equal(r.details[0].parent_error, 'owner_muted');
});
await test('킬스위치와 알림 시간 범위 유지', async () => {
  const { env } = fixture(); env.SESSION_STATE.get = async key => key === 'lesson_reminder_send' ? 'off' : null;
  assert.equal((await sweep(env)).enabled, false); assert.equal(calls.length, 0);
  env.SESSION_STATE.get = async () => null; NOW += 16 * 60_000;
  assert.equal((await sweep(env)).checked, 0); assert.equal(calls.length, 0);
});
await test('옛 0/0 기록은 성공으로 부르지 않고 접수 여부 미확인으로 보류', async () => {
  const { env, db } = fixture(); contacts = {}; await sweep(env);
  db.exec("INSERT INTO lesson_reminder_log (room_id,sent_parent,sent_student,created_at) VALUES ('class-1-20260921',0,0,1)");
  contacts['fixture-1'] = { parent: '01000000001', student: '' };
  assert.equal((await sweep(env)).details[0].status, 'legacy_unconfirmed'); assert.equal(calls.length, 0);
});
await test('수신자 역할이 바뀌어도 동일 번호 장부로 중복 방지', async () => {
  const { env } = fixture(); await ensure(env);
  const a = await deliver(env, 'fixture-room', 'parent', '01000000001', 'fixture');
  const b = await deliver(env, 'fixture-room', 'student', '01000000001', 'fixture');
  assert.equal(a.accepted, true); assert.equal(b.status, 'already_accepted'); assert.equal(calls.length, 1);
});
console.log(`\n${PASS} behavioral scenarios passed; no external network requests.`);

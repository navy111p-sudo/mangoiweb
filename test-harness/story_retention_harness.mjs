#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 🧹 story_retention_harness — 영어 동화책 바꿔 쓰기 기록(story_write_log) 30일 파기 (2026-10-13)
//   정본 src/retention.ts 의 purgeExpired 를 «실제로» 돌린다(타입 제거 + 진짜 story-correct.ts)
//   · 진짜 SQLite(node:sqlite) 에 무작위 기록을 넣고 수백 번 돌려 불변식을 확인
//     ① 지운 것 = 정확히 «30일보다 오래된 것» (경계 cut-1 · cut · cut+1 포함)
//     ② 남은 것은 한 글자도 안 바뀜 (짝 — «전부 지우기» 도 «하나도 안 지우기» 도 FAIL)
//     ③ dryRun 이면 한 행도 안 지우고 «지울 건수» 만 센다
//     ④ 표가 없으면 0건 · 오류 없음 · 표를 새로 만들지 않음
//     ⑤ 강사 카드(7일)가 읽는 기록은 절대 안 지움
//   변이시험: RETENTION_SRC=<고친 사본> 으로 가리킨다.
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const rd = (p) => readFileSync(p, 'utf8');
const RET_FILE = process.env.RETENTION_SRC || resolve(SRC, 'retention.ts');
const ITER = Number(process.env.STORY_RET_ITER || 400);

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function inject(code, ns) {
  return code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map((n) => n.trim().replace(/^type\s+/, '')).filter(Boolean)
      .map((n) => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
}

/* D1 모양으로 감싼 진짜 SQLite */
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const r = db.prepare(sql).get(...args); return r === undefined ? null : r; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql), exec: async (sql) => { db.exec(sql); return {}; } };
}
function kv() { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, _m: m }; }

console.log('⓪ 정본 불러오기');
let R = null, SC = null;
try {
  const EO = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  const CR = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'correction-reason.ts')))));
  globalThis.__SC = { ...EO, ...CR };
  SC = await import(asData(inject(stripTypeScriptTypes(rd(resolve(SRC, 'story-correct.ts'))), '__SC')));
  globalThis.__RET = { ...SC };
  R = await import(asData(inject(stripTypeScriptTypes(rd(RET_FILE)), '__RET')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }
ok(!!(R && R.purgeExpired), '전제: retention.ts 를 불러왔다');
ok(!!(SC && SC.STORY_LOG_SCHEMA && SC.STORY_LOG_RETENTION_DAYS), '전제: story-correct.ts 의 표 정의·보관기간을 불러왔다');
if (!R || !SC) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

const DAY = 86400000;
const KEEP = SC.STORY_LOG_RETENTION_DAYS;
const handoverSrc = rd(resolve(SRC, 'teacher-handover.ts'));
const hm = handoverSrc.match(/HANDOVER_STORY_DAYS\s*=\s*(\d+)/);
const CARD = hm ? Number(hm[1]) : NaN;
ok(KEEP === 30, '보관기간 30일(AI 영작 첨삭과 같은 기간)');
ok(Number.isFinite(CARD) && KEEP > CARD, `강사 카드가 읽는 기간(${CARD}일)보다 길다`);

/* 결정론 난수 */
let seed = 20261013;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const NOW = Date.UTC(2026, 9, 13, 3, 0, 0);
const realNow = Date.now;
Date.now = () => NOW;
const CUT = NOW - KEEP * DAY;

console.log(`① 무작위 ${ITER}회 (진짜 SQLite)`);
let bad = { delWrong: 0, keepChanged: 0, dryChanged: 0, dryCount: 0, err: 0, cardLost: 0, created: 0, notable: 0, count: 0 };
let stats = { runs: 0, dry: 0, notable: 0, deleted: 0, kept: 0 };
for (let it = 0; it < ITER; it++) {
  const db = new DatabaseSync(':memory:');
  const env = { DB: d1(db), SESSION_STATE: kv() };
  const noTable = rnd() < 0.12;
  const dry = rnd() < 0.3;
  const rows = [];
  if (!noTable) {
    db.exec(SC.STORY_LOG_SCHEMA); db.exec(SC.STORY_LOG_INDEX);
    const n = Math.floor(rnd() * 40);
    const ins = db.prepare('INSERT INTO story_write_log (student_uid, story, sentence, original, fixes, ai, created_at) VALUES (?,?,?,?,?,?,?)');
    for (let i = 0; i < n; i++) {
      const at = pick([
        CUT - 1, CUT, CUT + 1, NOW, NOW - CARD * DAY, NOW - CARD * DAY + 1,
        NOW - Math.floor(rnd() * 400 * DAY), NOW - Math.floor(rnd() * KEEP * DAY), 0,
      ]);
      ins.run(pick(['jeong', 'lee', 'kim_01', 'mby1']), pick(['red-umbrella', 'robot-dance']),
        'I like ' + i + '.', rnd() < 0.5 ? null : 'I likes ' + i, Math.floor(rnd() * 4), pick(['none', 'fixed', 'kept', null]), at);
    }
  }
  const before = noTable ? [] : db.prepare('SELECT * FROM story_write_log ORDER BY id').all();
  let res;
  try { res = await R.purgeExpired(env, { dryRun: dry }); } catch (e) { res = { errors: ['THROW ' + e.message] }; }
  stats.runs++; if (dry) stats.dry++; if (noTable) stats.notable++;
  const storyErr = (res.errors || []).filter((x) => /^story_write|^THROW/.test(x));
  if (storyErr.length) bad.err++;
  const tableNow = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_write_log'").get();
  if (noTable) {
    if (tableNow) bad.created++;
    if (res.story_write !== 0) bad.notable++;
    db.close(); continue;
  }
  const after = db.prepare('SELECT * FROM story_write_log ORDER BY id').all();
  const old = before.filter((r) => r.created_at < CUT);
  const young = before.filter((r) => r.created_at >= CUT);
  if (dry) {
    if (JSON.stringify(after) !== JSON.stringify(before)) bad.dryChanged++;
    if (res.story_write !== old.length) bad.dryCount++;
  } else {
    if (after.length !== young.length || after.some((r) => r.created_at < CUT)) bad.delWrong++;
    if (JSON.stringify(after) !== JSON.stringify(young)) bad.keepChanged++;
    if (res.story_write !== old.length) bad.count++;
    stats.deleted += old.length; stats.kept += young.length;
  }
  const cardRows = before.filter((r) => r.created_at >= NOW - CARD * DAY).map((r) => r.id);
  const afterIds = new Set(after.map((r) => r.id));
  if (cardRows.some((id) => !afterIds.has(id))) bad.cardLost++;
  db.close();
}
Date.now = realNow;
console.log(`  (실행 ${stats.runs}회 · dryRun ${stats.dry} · 표 없음 ${stats.notable} · 지움 ${stats.deleted}행 · 남김 ${stats.kept}행)`);
ok(stats.deleted > 0 && stats.kept > 0, '전제: 지울 것·남길 것이 둘 다 실제로 나왔다');
ok(stats.dry > 0 && stats.notable > 0, '전제: dryRun·표 없음 경우가 실제로 나왔다');
ok(bad.delWrong === 0, '① 30일보다 오래된 것만 정확히 지운다(경계 포함)', JSON.stringify(bad));
ok(bad.keepChanged === 0, '② (짝) 남긴 기록은 한 글자도 안 바뀐다');
ok(bad.count === 0, '① 결과의 story_write 가 실제 지운 건수와 같다');
ok(bad.dryChanged === 0, '③ dryRun 이면 한 행도 안 지운다');
ok(bad.dryCount === 0, '③ (짝) dryRun 은 «지울 건수» 를 정확히 센다');
ok(bad.notable === 0 && bad.created === 0, '④ 표가 없으면 0건이고 표를 새로 만들지 않는다');
ok(bad.err === 0, '오류 없이 돈다(story_write 단계)');
ok(bad.cardLost === 0, '⑤ 강사 카드(7일)가 읽는 기록은 하나도 안 지운다');

console.log('② 정확한 경계 한 번 더');
{
  const db = new DatabaseSync(':memory:');
  db.exec(SC.STORY_LOG_SCHEMA);
  const ins = db.prepare('INSERT INTO story_write_log (student_uid, story, sentence, fixes, created_at) VALUES (?,?,?,?,?)');
  ins.run('a', 's', 'x', 0, CUT - 1); ins.run('a', 's', 'y', 0, CUT); ins.run('a', 's', 'z', 0, CUT + 1);
  Date.now = () => NOW;
  const res = await R.purgeExpired({ DB: d1(db), SESSION_STATE: kv() }, {});
  Date.now = realNow;
  const left = db.prepare('SELECT sentence FROM story_write_log ORDER BY id').all().map((r) => r.sentence).join(',');
  ok(left === 'y,z' && res.story_write === 1, '정확히 30일 전(cut) 기록은 남고, 1ms 더 오래된 것만 지운다', left);
  const kvv = JSON.parse((await (async () => { const k = kv(); Date.now = () => NOW; await R.purgeExpired({ DB: d1(db), SESSION_STATE: k }, {}); Date.now = realNow; return k._m.get('retention:last_run'); })()) || '{}');
  ok(typeof kvv.story_write === 'number', '실행 기록(retention:last_run)에 story_write 가 남는다');
  db.close();
}

console.log(`③ 모든 파기 단계 — dryRun 은 «아무것도» 안 바꾸고, 센 건수 = 실제로 지운 건수 (무작위 ${ITER}회)`);
{
  /* 2026-10-13 전에는 녹화만 dryRun 을 지키고 나머지 단계는 `?dry_run=1` 이어도 실제로 지웠다.
     같은 데이터를 두 벌 만들어 한쪽은 dryRun, 한쪽은 실제로 돌려 «센 것 == 지운 것» 과
     «dryRun 쪽은 한 바이트도 안 바뀜» 을 짝으로 본다. */
  const SCHEMA = `
    CREATE TABLE recordings (id INTEGER PRIMARY KEY, file_url TEXT, expires_at INTEGER, status TEXT);
    CREATE TABLE attendance (id INTEGER PRIMARY KEY, joined_at INTEGER, left_at INTEGER);
    CREATE TABLE rewards (id INTEGER PRIMARY KEY, issued_at INTEGER);
    CREATE TABLE consents (id INTEGER PRIMARY KEY, user_id TEXT, username TEXT, guardian_contact TEXT, kakao_consent INTEGER,
      consented_at INTEGER, withdrawn_at INTEGER, raw_payload TEXT, ip_address TEXT, user_agent TEXT);
    CREATE TABLE kakao_ids (id INTEGER PRIMARY KEY, user_id TEXT, kakao_id TEXT);
    CREATE TABLE emergency_events (id INTEGER PRIMARY KEY, triggered_at INTEGER);
    CREATE TABLE ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);`;
  const TABLES = ['recordings', 'attendance', 'rewards', 'consents', 'kakao_ids', 'emergency_events', 'ai_writing_corrections', 'story_write_log'];
  const FIELD = { attendance: 'attendance', rewards: 'rewards', kakao_ids: 'kakao_ids', emergency_events: 'emergency_events',
    ai_writing_corrections: 'ai_writing', story_write_log: 'story_write', consents: 'consents_masked', recordings: 'recordings' };
  const ago = (d) => NOW - Math.floor(d * DAY);
  const tAny = () => pick([ago(rnd() * 2000), ago(7), ago(30), ago(365), ago(365 * 3), ago(365 * 5), NOW]);
  function fill(db) {
    db.exec(SCHEMA); db.exec(SC.STORY_LOG_SCHEMA);
    const uids = ['u1', 'u2', 'u3', 'u4', 'u5'];
    for (let i = 0; i < 8; i++) db.prepare('INSERT INTO recordings (file_url, expires_at, status) VALUES (?,?,?)')
      .run('rec/' + i + '.webm', pick([ago(1), NOW + DAY]), 'completed');
    for (let i = 0; i < 15; i++) db.prepare('INSERT INTO attendance (joined_at, left_at) VALUES (?,?)').run(tAny(), rnd() < 0.3 ? null : tAny());
    for (let i = 0; i < 10; i++) db.prepare('INSERT INTO rewards (issued_at) VALUES (?)').run(tAny());
    for (let i = 0; i < 10; i++) db.prepare('INSERT INTO emergency_events (triggered_at) VALUES (?)').run(tAny());
    for (let i = 0; i < 10; i++) db.prepare('INSERT INTO ai_writing_corrections (student_uid, original_text, created_at) VALUES (?,?,?)').run('u1', 'x', tAny());
    for (let i = 0; i < 10; i++) db.prepare('INSERT INTO story_write_log (student_uid, story, sentence, fixes, created_at) VALUES (?,?,?,?,?)').run('u1', 's', 'x', 0, tAny());
    for (let i = 0; i < 12; i++) db.prepare('INSERT INTO consents (user_id, username, guardian_contact, kakao_consent, consented_at, withdrawn_at, raw_payload, ip_address, user_agent) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(pick(uids), 'name', '010', pick([0, 1, null]), tAny(), rnd() < 0.4 ? tAny() : null, pick(['{"kakao":false}', '{"recording":1}', null]), '1.2.3.4', 'UA');
    for (let i = 0; i < 8; i++) db.prepare('INSERT INTO kakao_ids (user_id, kakao_id) VALUES (?,?)').run(pick(uids), 'k' + i);
  }
  const snap = (db) => Object.fromEntries(TABLES.map((t) => [t, JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())]));
  let dryTouched = 0, countMismatch = 0, errs = 0, kvOnDry = 0, kvOnReal = 0, realChanged = 0, consentLost = 0, maskWrong = 0, maskedSeen = 0, keepWrong = 0;
  const bad = [];
  for (let it = 0; it < ITER; it++) {
    const dbA = new DatabaseSync(':memory:'), dbB = new DatabaseSync(':memory:');
    const s0 = seed; fill(dbA); seed = s0; fill(dbB);
    const before = snap(dbA);
    const kA = kv(), kB = kv();
    Date.now = () => NOW;
    const rA = await R.purgeExpired({ DB: d1(dbA), SESSION_STATE: kA }, { dryRun: true });
    const rB = await R.purgeExpired({ DB: d1(dbB), SESSION_STATE: kB }, {});
    Date.now = realNow;
    const afterA = snap(dbA), afterB = snap(dbB);
    if (JSON.stringify(afterA) !== JSON.stringify(before)) { dryTouched++; if (bad.length < 3) bad.push('dry touched ' + TABLES.filter((t) => afterA[t] !== before[t]).join(',')); }
    if (JSON.stringify(afterB) !== JSON.stringify(before)) realChanged++;
    for (const t of TABLES) {
      const f = FIELD[t];
      if (rA[f] !== rB[f]) { countMismatch++; if (bad.length < 3) bad.push(`${t}: dry ${rA[f]} / real ${rB[f]}`); }
    }
    if ((rA.errors || []).length || (rB.errors || []).length) { errs++; if (bad.length < 3) bad.push(JSON.stringify((rA.errors || []).concat(rB.errors || []))); }
    /* 단순 기간 표는 «남아야 할 행» 을 JS 로 따로 계산해 실제 결과와 대조한다(SQL 을 베끼지 않는다) */
    const KEEP_RULE = {
      attendance: (r) => (r.left_at ?? r.joined_at) >= NOW - 3 * 365 * DAY,
      rewards: (r) => r.issued_at >= NOW - 5 * 365 * DAY,
      emergency_events: (r) => r.triggered_at >= NOW - 365 * DAY,
      ai_writing_corrections: (r) => r.created_at >= NOW - 30 * DAY,
      story_write_log: (r) => r.created_at >= NOW - KEEP * DAY,
    };
    for (const [t, keep] of Object.entries(KEEP_RULE)) {
      const want = JSON.stringify(dbA.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().filter(keep));
      if (want !== afterB[t]) { keepWrong++; if (bad.length < 3) bad.push('keep ' + t); }
    }
    /* 동의 기록은 «지우지 않고 가린다»(감사 추적) — 실제 실행 뒤에도 행 수가 같고, 바뀐 행은 가린 모양이어야 한다 */
    const cBefore = dbA.prepare('SELECT * FROM consents ORDER BY id').all();
    const cAfter = dbB.prepare('SELECT * FROM consents ORDER BY id').all();
    if (cAfter.length !== cBefore.length) consentLost++;
    cAfter.forEach((r, i) => {
      if (JSON.stringify(r) === JSON.stringify(cBefore[i])) return;
      maskedSeen++;
      if (!(r.username === null && r.raw_payload === '{"masked":true}' && r.ip_address === null && r.user_id === cBefore[i].user_id)) maskWrong++;
    });
    if (kA._m.has('retention:last_run')) kvOnDry++;
    if (kB._m.has('retention:last_run')) kvOnReal++;
    dbA.close(); dbB.close();
  }
  if (bad.length) console.log('    예: ' + bad.join(' | '));
  ok(realChanged > ITER * 0.9, '전제: 실제로 돌린 쪽은 거의 매번 무언가를 바꿨다(시험 데이터가 살아 있다)', String(realChanged));
  ok(dryTouched === 0, 'dryRun 은 8개 표 어디도 한 행도 바꾸지 않는다(출결·보상·카카오·비상·영작·동화책·동의 마스킹·녹화)');
  ok(countMismatch === 0, '(짝) dryRun 이 센 건수 = 같은 데이터에서 실제로 지운/고친 건수 (표마다)');
  ok(errs === 0, '모든 단계가 오류 없이 돈다');
  ok(keepWrong === 0, '실제 실행 뒤 남은 행 = 표마다 보관기간으로 «따로 계산한» 남아야 할 행 (출결 3년·보상 5년·비상 1년·영작·동화책 30일)');
  ok(maskedSeen > 0, '전제: 가려질 동의 기록이 실제로 나왔다', String(maskedSeen));
  ok(consentLost === 0 && maskWrong === 0, '동의 기록은 지우지 않고 가리기만 한다(행 수 그대로 · 이름·IP 비움 · user_id 유지)');
  ok(kvOnDry === 0 && kvOnReal === ITER, 'dryRun 은 «마지막 실행» 기록을 덮지 않고, 실제 실행만 남긴다');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

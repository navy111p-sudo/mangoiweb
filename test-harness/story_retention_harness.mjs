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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

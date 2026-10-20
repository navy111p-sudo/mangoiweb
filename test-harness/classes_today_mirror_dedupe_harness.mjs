/* classes_today_mirror_dedupe_harness.mjs — 매니저 「오늘 수업」 의 카페24 «복사본» 빼기 (2026-10-20)
 *
 * 발단: 매니저 「today's class, still not all schedule have move button」.
 *   /api/admin/classes/today 가 망고아이 줄(class_schedules)과 카페24 줄(attendance c24-*)을 그냥
 *   이어 붙여, 미러가 만든 줄(notes `c24:<id>`)과 그 원본이 **두 줄** 로 나갔다.
 *   [잰 것 — 2026-10-19 운영 D1] 카페24 120줄 중 100줄이 복사본 — 그 줄에는 Move 가 없다.
 *
 * 무엇을 보나
 *   A. 정본 dropMirroredCafe24 를 소스에서 오려 **실제로 돌린다** — 빼는 것 / 남기는 것 짝
 *   B. 핸들러의 그 블록을 오려 **진짜 SQLite** 위에서 돌린다 — 미러 줄(옮김·취소·도장 포함)만 빼고,
 *      미러가 아닌 줄의 notes 는 무시하며, 조회가 실패하면 아무것도 안 뺀다(fail-open)
 *   C. 배선 — 그 블록이 카페24 줄을 «그리기 전» 에 있고, 응답이 뺀 수를 싣는다
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = join(__dir, '..', 'cloudflare-deploy');
const NOW_SRC = readFileSync(process.env.NOW_SRC || join(CF, 'src', 'classes-now.ts'), 'utf8');
const ADM_SRC = readFileSync(process.env.ADMIN_SRC || join(CF, 'src', 'api-admin.ts'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { PASS++; console.log('  ✅ ' + label); }
  else { FAIL++; console.log('  ❌ FAIL ' + label + (extra ? '  ' + extra : '')); }
};

/* ── TS → JS (전역 typescript 를 쓰고, 없으면 이 함수에 필요한 만큼만 걷어낸다) ── */
let ts = null;
for (const p of [join(CF, 'package.json'), '/opt/node22/lib/node_modules/typescript/package.json']) {
  try { ts = createRequire(p)(p.includes('/opt/') ? '/opt/node22/lib/node_modules/typescript' : 'typescript'); break; } catch { /* 다음 */ }
}
const toJs = (src) => ts
  ? ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText
  : src.replace(/<T extends[^>]*>/g, '').replace(/:\s*(T\[\]|Set<string>|\{ kept: T\[\]; hidden: number \})/g, '').replace(/ as any\[\]| as any/g, '');

/* 문자열·주석을 건너뛰며 중괄호 짝을 맞춘다 */
function braceEnd(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { i = s.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = s.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++;
      continue;
    }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}

console.log('\n── A. dropMirroredCafe24 (정본을 실제로 실행) ──');
const fnAt = NOW_SRC.indexOf('export function dropMirroredCafe24');
ok('A-0 정본 함수가 classes-now.ts 에 있다', fnAt >= 0);
let drop = null;
if (fnAt >= 0) {
  const bodyOpen = NOW_SRC.indexOf('{', NOW_SRC.indexOf(')', NOW_SRC.indexOf('(c24', fnAt)) + 1);
  // 반환 타입 `{ kept…; hidden… }` 다음의 «몸통» 여는 중괄호를 찾는다
  const retType = NOW_SRC.indexOf('{', NOW_SRC.indexOf('):', fnAt));
  const retEnd = braceEnd(NOW_SRC, retType);
  const open = NOW_SRC.indexOf('{', retEnd + 1);
  const end = braceEnd(NOW_SRC, open);
  const src = NOW_SRC.slice(fnAt, end + 1).replace(/^export /, '');
  try { drop = new Function(toJs(src) + '\nreturn dropMirroredCafe24;')(); } catch (e) { ok('A-0b 정본을 오려 실행할 수 있다', false, String(e.message)); }
  void bodyOpen;
}
ok('A-0c 정본을 오려 냈다', typeof drop === 'function');
if (typeof drop === 'function') {
  const rows = [{ room_id: 'c24-100' }, { room_id: 'c24-101' }, { room_id: 'c24-102' }, { room_id: 'class-9-20261020' }, { room_id: '' }];
  let r;
  try { r = drop(rows, new Set(['100', '102'])); } catch (e) { r = { kept: [], hidden: -1 }; }
  ok('A-1 미러 줄이 있는 카페24 수업(100·102)은 뺀다', !r.kept.some(x => x.room_id === 'c24-100' || x.room_id === 'c24-102'));
  ok('A-2 (짝) 미러 줄이 없는 카페24 수업(101)은 남긴다', r.kept.some(x => x.room_id === 'c24-101'));
  ok('A-3 (짝) c24- 가 아닌 줄·빈 방 번호는 건드리지 않는다', r.kept.some(x => x.room_id === 'class-9-20261020') && r.kept.some(x => x.room_id === ''));
  ok('A-4 뺀 수를 정확히 센다(2)', r.hidden === 2, 'hidden=' + r.hidden);
  let e;
  try { e = drop(rows, new Set()); } catch { e = { kept: [], hidden: -1 }; }
  ok('A-5 집합이 비면(=못 읽음) 아무것도 안 뺀다', e.kept.length === rows.length && e.hidden === 0);
  ok('A-6 원본 배열을 바꾸지 않는다', rows.length === 5 && r.kept !== rows);
  let p;
  try { p = drop([{ room_id: 'c24-1000' }, { room_id: 'c24-10' }], new Set(['100', '10'])); } catch { p = { kept: [] }; }
  ok('A-7 번호는 «정확히» 맞춘다 — 100 이 1000 을 빼지 않는다', p.kept.length === 1 && p.kept[0].room_id === 'c24-1000');
}

console.log('\n── B. 핸들러 블록을 진짜 SQLite 위에서 실행 ──');
const blkStart = ADM_SRC.indexOf('let c24MirroredHidden = 0;');
const blkIf = blkStart >= 0 ? ADM_SRC.indexOf('if (c24Rows.length)', blkStart) : -1;
const blkEnd = blkIf >= 0 ? braceEnd(ADM_SRC, ADM_SRC.indexOf('{', blkIf)) : -1;
ok('B-0 classes/today 에 복사본 빼기 블록이 있다', blkStart >= 0 && blkEnd > blkStart);
let sqlite = null;
try { sqlite = createRequire(import.meta.url)('node:sqlite'); } catch { /* Node 22 미만 */ }
async function runBlock(c24Rows, setup, { failDb = false } = {}) {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, scheduled_date TEXT, start_time TEXT, source TEXT, status TEXT, notes TEXT)`);
  for (const r of setup) db.prepare(`INSERT INTO class_schedules (user_id, scheduled_date, start_time, source, status, notes) VALUES (?,?,?,?,?,?)`).run(...r);
  const env = { DB: { prepare(sql) {
    if (failDb) throw new Error('D1 down');
    return { bind: (...b) => ({ all: async () => ({ results: db.prepare(sql).all(...b) }) }) };
  } } };
  const selectInChunks = async (DB, items, build) => {
    const out = [];
    for (let i = 0; i < items.length; i += 90) {
      const ch = items.slice(i, i + 90);
      const rs = await DB.prepare(build(ch.map(() => '?').join(','))).bind(...ch).all();
      out.push(...rs.results);
    }
    return out;
  };
  const body = toJs(ADM_SRC.slice(blkStart, blkEnd + 1)) + '\nreturn { c24Rows, c24MirroredHidden };';
  const fn = new Function('env', 'c24Rows', 'selectInChunks', 'dropMirroredCafe24', 'console', `return (async () => { ${body} })();`);
  return fn(env, c24Rows, selectInChunks, drop, { warn() {} });
}
if (!sqlite) console.log('  ⏭ node:sqlite 없음 — B 절 건너뜀');
else if (blkStart >= 0 && blkEnd > blkStart && typeof drop === 'function') {
  const c24 = ['c24-500', 'c24-501', 'c24-502', 'c24-503', 'c24-504', 'c24-505'].map(room_id => ({ room_id, user_id: 'kid' }));
  const setup = [
    ['kid', '2026-10-20', '17:00', 'c24-mirror', 'active', 'c24:500'],          // 그대로인 미러 줄
    ['kid', '2026-10-27', '17:00', 'c24-mirror:manual', 'active', 'c24:501'],   // 사람이 다른 날로 옮김(도장)
    ['kid', '2026-10-20', '18:00', 'c24-mirror:manual', 'cancelled', 'c24:502'],// 사람이 취소
    ['kid', '2026-10-20', '19:00', 'adm-enroll:7', 'active', 'c24:503'],        // 미러 아닌 줄 — notes 가 우연히 같음
  ];
  let r;
  try { r = await runBlock(c24, setup); } catch (e) { r = null; ok('B-1 블록이 실행된다', false, String(e.message)); }
  if (r) {
    const left = r.c24Rows.map(x => x.room_id);
    ok('B-1 그대로인 미러 줄의 원본(500)은 뺀다', !left.includes('c24-500'));
    ok('B-2 다른 날로 옮긴(도장) 미러 줄의 원본(501)도 뺀다', !left.includes('c24-501'));
    ok('B-3 사람이 취소한 미러 줄의 원본(502)도 뺀다', !left.includes('c24-502'));
    ok('B-4 (짝) 미러가 아닌 줄(source adm-enroll)의 notes 는 무시한다(503 남김)', left.includes('c24-503'));
    ok('B-5 (짝) 미러 줄이 없는 수업(504·505)은 남긴다', left.includes('c24-504') && left.includes('c24-505'));
    ok('B-6 뺀 수를 응답용 변수에 담는다(3)', r.c24MirroredHidden === 3, 'hidden=' + r.c24MirroredHidden);
  }
  let f;
  try { f = await runBlock(c24, setup, { failDb: true }); } catch (e) { f = null; ok('B-7 조회가 실패해도 던지지 않는다', false, String(e.message)); }
  if (f) ok('B-7 조회가 실패하면 아무것도 안 뺀다(예전처럼 두 줄 — 수업이 사라지지 않는다)', f.c24Rows.length === 6 && f.c24MirroredHidden === 0);
  const many = Array.from({ length: 230 }, (_, i) => ({ room_id: 'c24-' + (9000 + i) }));
  const manySetup = Array.from({ length: 230 }, (_, i) => ['kid', '2026-10-20', '17:00', 'c24-mirror', 'active', 'c24:' + (9000 + i)]);
  let m;
  try { m = await runBlock(many, manySetup); } catch (e) { m = null; ok('B-8 230줄(바인드 100개 한도 넘음)도 돈다', false, String(e.message)); }
  if (m) ok('B-8 230줄(바인드 100개 한도 넘음)도 전부 맞춘다', m.c24Rows.length === 0 && m.c24MirroredHidden === 230);
}

console.log('\n── C. 배선 ──');
const fetchAt = ADM_SRC.indexOf("WHERE a.room_id LIKE 'c24-%' AND a.date = ?");
const loopAt = ADM_SRC.indexOf('const tmap = await loadCafe24TeacherMap(env as any, c24Rows.map');
ok('C-1 빼기 블록이 카페24 줄 조회 «뒤», 그 줄을 그리기 «앞» 에 있다', fetchAt > 0 && blkStart > fetchAt && loopAt > blkEnd);
ok('C-2 정본을 들여온다(복제하지 않는다)', /import \{[^}]*\bdropMirroredCafe24\b[^}]*\} from '\.\/classes-now'/.test(ADM_SRC)
  && !/function dropMirroredCafe24/.test(ADM_SRC));
ok('C-3 응답 counts 에 뺀 수를 싣는다', /cafe24_mirrored_hidden:\s*c24MirroredHidden/.test(ADM_SRC));

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);

#!/usr/bin/env node
// 🎲 무작위 반복 검사 — 연락처 정본·오늘 수업 연락처·KST 시간 칸·강사 월 보기 (2026-10-28)
//
// 왜 만들었나
//   2026-10-27 세 제안(#1833·#1837·#1842)을 «정해 둔 몇 가지 입력» 으로만 검사했다.
//   사장님 지시 「수백번 샌드박스와 하니스로 테스트」 — 그래서 같은 정본을 **무작위 입력 수백 벌**로 돌리고,
//   코드와 «따로 만든 기준 답(오라클)» 을 대조한다. 오라클은 정본을 베끼지 않고 사양에서 다시 쓴다.
//
// 무엇을 돌리나 (전부 «진짜 소스» 를 실행한다 — 글자 검사 아님)
//   A. notify-contacts.ts loadContactPhones + student-override.ts loadOverridePhones + d1-chunk.ts
//      — 진짜 SQLite, 원천마다 실패 주입(통째·두 번째 청크), 스키마 흔들림, 230명 넘는 청크
//   B. api-admin.ts 「오늘 수업」 연락처 채우기 블록 — A 의 진짜 정본을 물려 끝에서 끝까지
//   C. adm-today-classes.js kstRange — Intl(Asia/Seoul)로 만든 독립 오라클과 대조
//   D. api-teacher.ts 월 칸 만들기 + hitsOn·calendarItemOf — 진짜 class-start-date.ts, 요일 오라클 셋 대조
//   E. teacher.html renderMonth — 칸 수·빈칸·배지·«+N»·이스케이프
//   F. adm-today-classes.js 표 전체 — 머리칸 = 줄칸, 연락처 칸, 안내 문구
//   G. manager.html 연락처 안내 문구
//
// 실행: node test-harness/contact_today_month_fuzz_harness.mjs   (FUZZ_N=1000 FUZZ_SEED=7 로 늘릴 수 있다)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
const N = Math.max(1, Number(process.env.FUZZ_N) || 300);
const SEED0 = Number(process.env.FUZZ_SEED) || 20261028;

let PASS = 0, FAIL = 0;
const fails = new Map();   // 같은 실패를 수백 번 찍지 않게 «규칙별 첫 반례» 만 남긴다
function ok(cond, rule, ex) {
  if (cond) { PASS++; return; }
  FAIL++;
  if (!fails.has(rule)) fails.set(rule, { n: 0, ex });
  fails.get(rule).n++;
}
function section(t) { console.log('\n[ ' + t + ' ]'); }
// 잘라 낸 소스를 돌린다 — 실패하면 «크래시» 가 아니라 깔끔한 FAIL(그 절은 건너뛴다. 결과줄은 끝까지 나온다)
function runSrc(code, ctx, label, opts) {
  try { vm.runInContext(code, ctx, opts); return true; }
  catch (e) { ok(false, label + ' 전제: 잘라 낸 소스가 실행됐다(안 되면 그 절은 아무것도 안 잰다)', e && e.message); return false; }
}
function report(label, before) { console.log(`  ${FAIL === before.fail ? '✅' : '❌'} ${label} — 검사 ${PASS + FAIL - before.pass - before.fail}건`); }
const mark = () => ({ pass: PASS, fail: FAIL });

function rng(seed) {   // mulberry32 — 같은 seed 면 같은 반례가 다시 나온다
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const digits = (r, n) => Array.from({ length: n }, () => int(r, 0, 9)).join('');

function braceBody(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (startIdx < 0 || open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}
const importData = (code) => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const wireImports = (code) => code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
  names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__FZ.${n};`).join('\n'));

/* ── 진짜 정본을 불러온다 ─────────────────────────────────────────────────── */
globalThis.__FZ = { findTeacherContact: async () => null };
const CH = await importData(stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts'))));
globalThis.__FZ.selectInChunks = CH.selectInChunks;
const SO = await importData(wireImports(stripTypeScriptTypes(rd(resolve(SRC, 'student-override.ts')))));
globalThis.__FZ.getOverridePhones = SO.getOverridePhones;
globalThis.__FZ.loadOverridePhones = SO.loadOverridePhones;
const NC = await importData(wireImports(stripTypeScriptTypes(rd(resolve(SRC, 'notify-contacts.ts')))));
const CSD = await importData(stripTypeScriptTypes(rd(resolve(SRC, 'class-start-date.ts'))));
console.log(`🎲 seed ${SEED0} · 무작위 ${N}벌씩`);
const _warn = console.warn; console.warn = () => {};   // 실패 주입이 정본의 경고를 수천 줄 찍는다 — 끝에 되돌린다
if (!NC.loadContactPhones || !SO.loadOverridePhones || !CSD.recurStartedOn) { console.log('❌ 정본을 못 불러왔다'); process.exit(1); }

/* ── A. 연락처 정본 ───────────────────────────────────────────────────────── */
const OV_COLS = 'user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, parent_phone TEXT, student_phone TEXT, phone_by TEXT, phone_at INTEGER, franchise TEXT, shop_name TEXT, org_by TEXT, org_at INTEGER, hidden_by TEXT, hidden_at INTEGER, hidden_reason TEXT';
const normDigits = (v) => { const s = String(v ?? '').replace(/[^0-9]/g, ''); return s.length >= 9 ? s : ''; };
const firstRaw = (...vals) => { for (const v of vals) { const s = String(v ?? '').trim(); if (normDigits(s)) return s; } return ''; };
function genPhone(r) {
  return pick(r, [
    () => '010' + digits(r, 8), () => '010-' + digits(r, 4) + '-' + digits(r, 4), () => ' 010' + digits(r, 8) + ' ',
    () => '+63 9' + digits(r, 2) + ' ' + digits(r, 3) + ' ' + digits(r, 4), () => digits(r, int(r, 1, 8)), () => '010-12',
    () => 'none', () => '', () => '   ', () => null, () => null,
  ])();
}
function genWorld(r, seed) {
  const pool = Array.from({ length: int(r, 1, 40) }, (_, i) => 'k' + seed + '_' + i);
  const big = r() < 0.12;
  const n = big ? int(r, 101, 260) : int(r, 0, 30);
  const uids = [];
  for (let i = 0; i < n; i++) {
    const base = big ? ('k' + seed + '_' + i) : pick(r, pool);
    uids.push(pick(r, [base, base, base, base, base.toUpperCase(), ' ' + base + ' ', '', null, undefined, base]));
  }
  const erpSchema = pick(r, ['full', 'full', 'full', 'noStudentPhone', 'noPhone', 'missing']);
  const retMissing = r() < 0.08;
  const fail = {
    ov: pick(r, ['none', 'none', 'none', 'none', 'all', 'chunk1']),
    erp: pick(r, ['none', 'none', 'none', 'none', 'all', 'chunk1']),
    ret: pick(r, ['none', 'none', 'none', 'none', 'all', 'chunk1']),
  };
  const noDb = r() < 0.03;
  const allIds = big ? uids.map(u => String(u ?? '').trim()).filter(Boolean) : pool.slice();
  const extra = allIds.map(u => r() < 0.1 ? u.toUpperCase() : null).filter(Boolean);   // 대소문자만 다른 «남의 행»
  // 명부·이탈위험에 «공백째 저장된» 행(카페24 실재) — 정본은 trim 한 아이디로 정확일치만 하므로 «못 찾는» 것이 정답
  const spaced = allIds.map(u => r() < 0.1 ? pick(r, [u + ' ', ' ' + u, ' ' + u + ' ']) : null).filter(Boolean);
  const ovRows = [], erpRows = [], retRows = [];
  for (const id of allIds.concat(extra)) {
    if (r() < 0.3) ovRows.push([id, genPhone(r), genPhone(r)]);   // 받아 둔 번호는 저장할 때 trim 된다(setOverridePhones)
  }
  for (const id of allIds.concat(extra, spaced)) {
    if (r() < 0.7) erpRows.push([id, genPhone(r), genPhone(r), genPhone(r)]);
    if (r() < 0.4) retRows.push([id, genPhone(r)]);
  }
  return { uids, erpSchema, retMissing, fail, noDb, ovRows, erpRows, retRows };
}
function buildDb(w) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_erp_override (${OV_COLS})`);
  const ovIns = db.prepare('INSERT OR IGNORE INTO student_erp_override (user_id, student_phone, parent_phone, created_at) VALUES (?,?,?,1)');
  for (const [u, s, p] of w.ovRows) ovIns.run(u, s, p);
  if (w.erpSchema !== 'missing') {
    const cols = ['user_id TEXT PRIMARY KEY'];
    if (w.erpSchema !== 'noStudentPhone') cols.push('student_phone TEXT');
    if (w.erpSchema !== 'noPhone') cols.push('phone TEXT');
    cols.push('parent_phone TEXT', 'shop_name TEXT');
    db.exec(`CREATE TABLE students_erp (${cols.join(', ')})`);
    for (const [u, sp, ph, pp] of w.erpRows) {
      const names = ['user_id'], vals = [u];
      if (w.erpSchema !== 'noStudentPhone') { names.push('student_phone'); vals.push(sp); }
      if (w.erpSchema !== 'noPhone') { names.push('phone'); vals.push(ph); }
      names.push('parent_phone'); vals.push(pp);
      db.prepare(`INSERT OR IGNORE INTO students_erp (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...vals);
    }
  }
  if (!w.retMissing) {
    db.exec('CREATE TABLE student_retention (user_id TEXT PRIMARY KEY, phone TEXT, category TEXT)');
    const ins = db.prepare('INSERT OR IGNORE INTO student_retention (user_id, phone) VALUES (?,?)');
    for (const [u, p] of w.retRows) ins.run(u, p);
  }
  return db;
}
function d1(db, fail, calls) {   // node:sqlite → D1 모양 + 원천별 실패 주입
  const cnt = { ov: 0, erp: 0, ret: 0 };
  const kind = (sql) => /student_erp_override/.test(sql) ? 'ov' : (/FROM students_erp/.test(sql) ? 'erp' : (/student_retention/.test(sql) ? 'ret' : null));
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a),
    all: async () => {
      const k = kind(sql);
      if (k) {
        calls && calls.push(k + ':' + (args || []).length);
        // 정본은 ov → erp → ret 순서로 묻는다. 강사 화면처럼 정본 «앞» 에 같은 명부 조회가 따로 있으면
        // 그 호출이 청크 번호를 먹어 «정본의 첫 청크» 가 실패로 잡힌다 — 정본의 시작(ov)에서 뒤 원천 번호를 되돌린다
        if (k === 'ov') { cnt.erp = 0; cnt.ret = 0; }
        const i = cnt[k]++;
        if (fail[k] === 'all' || (fail[k] === 'chunk1' && i >= 1)) throw new Error('injected ' + k + ' #' + i);
      }
      return { results: db.prepare(sql).all(...(args || [])) };
    },
    first: async () => db.prepare(sql).get(...(args || [])) ?? null,
    run: async () => db.prepare(sql).run(...(args || [])),
  });
  return { prepare: (sql) => mk(sql, []), exec: async (s) => db.exec(s) };
}
const chunksOf = (arr) => { const out = []; for (let i = 0; i < arr.length; i += 100) out.push(arr.slice(i, i + 100)); return out; };
function oracle(w) {
  const want = Array.from(new Set((w.uids || []).map(u => String(u || '').trim()).filter(Boolean)));
  const phones = new Map();
  if (!want.length) return { phones, complete: true, want };
  if (w.noDb) return { phones, complete: false, want };
  // 받아 둔 번호 — 청크마다 따로 실패: 실패한 청크만 비고 받은 청크는 쓴다(받아 둔 값이 명부를 이긴다),
  //   한 청크라도 실패했으면 complete=false(«다 물어봤다» 가 거짓)
  const ov = new Map(); for (const [u, s, p] of w.ovRows) if (!ov.has(u)) ov.set(u, { s: normDigits(s), p: normDigits(p) });
  let ovFailed = false;
  chunksOf(want).forEach((c, i) => {
    if (w.fail.ov === 'all' || (w.fail.ov === 'chunk1' && i >= 1)) { ovFailed = true; return; }
    for (const u of c) { const o = ov.get(u); if (o && (o.s || o.p)) phones.set(u, o.s || o.p); }
  });
  let complete = !ovFailed;
  let rest = want.filter(u => !phones.has(u));
  if (rest.length) {
    const erpFails = w.erpSchema === 'missing' || w.fail.erp === 'all' || (w.fail.erp === 'chunk1' && chunksOf(rest).length >= 2);
    if (erpFails) complete = false;
    else {
      const erp = new Map(); for (const row of w.erpRows) if (!erp.has(row[0])) erp.set(row[0], row);
      for (const u of rest) {
        const row = erp.get(u); if (!row) continue;
        const sp = w.erpSchema === 'noStudentPhone' ? undefined : row[1];
        const ph = w.erpSchema === 'noPhone' ? undefined : row[2];
        const v = firstRaw(sp, ph, row[3]); if (v) phones.set(u, v);
      }
    }
    rest = want.filter(u => !phones.has(u));
  }
  if (rest.length) {
    const retFails = w.retMissing || w.fail.ret === 'all' || (w.fail.ret === 'chunk1' && chunksOf(rest).length >= 2);
    if (retFails) complete = false;
    else {
      const ret = new Map(); for (const [u, p] of w.retRows) if (!ret.has(u)) ret.set(u, p);
      for (const u of rest) { const v = firstRaw(ret.get(u)); if (v) phones.set(u, v); }
    }
  }
  return { phones, complete, ovFailed, want };
}
section('A. 연락처 정본 loadContactPhones — 진짜 SQLite · 실패 주입');
let ovGapSeen = 0;
{
  const m = mark();
  for (let k = 0; k < N; k++) {
    const seed = SEED0 + k, r = rng(seed), w = genWorld(r, seed);
    const db = buildDb(w), calls = [];
    let res, threw = null;
    try { res = await NC.loadContactPhones(w.noDb ? {} : { DB: d1(db, w.fail, calls) }, w.uids); } catch (e) { threw = e; }
    ok(!threw, 'A1 절대 던지지 않는다', { seed, err: threw && threw.message });
    if (threw) continue;
    const o = oracle(w);
    const got = [...res.phones].sort().join('|'), exp = [...o.phones].sort().join('|');
    ok(got === exp, 'A2 찾은 번호가 기준 답과 같다(원천 순서·첫 유효값·정확일치·표기 그대로)', { seed, got: got.slice(0, 300), exp: exp.slice(0, 300) });
    ok(res.complete === o.complete, 'A3 complete 가 기준 답과 같다(받아 둔 번호·명부·이탈위험 어느 조회든 실패 = false)', { seed, got: res.complete, exp: o.complete, fail: w.fail, schema: w.erpSchema });
    for (const v of res.phones.values()) ok(normDigits(v) !== '', 'A4 돌려준 번호는 전부 9자리 이상', { seed, v });
    for (const u of res.phones.keys()) ok(o.want.includes(u), 'A5 물어본 학생 밖의 번호는 없다', { seed, u });
    for (const c of calls) ok(Number(c.split(':')[1]) <= 100, 'A6 한 번에 바인드 100개를 넘지 않는다(D1 한도)', { seed, c });
    if (o.ovFailed && o.want.length) ovGapSeen++;
  }
  report('A 연락처 정본', m);
  // A-D. 기본 호출(report 없음 — 학생 상세 쪽)은 예전 그대로: 실패한 청크만 비고 받은 청크는 돌려주며 던지지 않는다
  const md = mark();
  let adChunkSeen = 0;
  for (let k = 0; k < N; k++) {
    const seed = SEED0 + 30000 + k, r = rng(seed);
    // 넷 중 하나는 100명 넘는 세계 + 청크 실패를 강제(무작위로만 두면 «두 번째 청크만 실패» 가 거의 안 나온다)
    let w = genWorld(r, seed), s2 = seed;
    if (k % 4 === 0) { while (w.uids.length <= 100) { s2 += 1000003; w = genWorld(rng(s2), s2); } w.fail.ov = pick(r, ['chunk1', 'chunk1', 'all', 'none']); }
    const db = buildDb(w), D = d1(db, w.fail);
    const ids = w.uids.filter(Boolean).map(String);
    let got, threw = null;
    try { got = await SO.loadOverridePhones({ DB: D }, ids); } catch (e) { threw = e.message; }
    ok(!threw, 'A-D1 기본 호출은 던지지 않는다', { seed, threw });
    if (threw) continue;
    const want = Array.from(new Set(ids.map(u => u.trim())));
    const ov = new Map(); for (const [u, s, p] of w.ovRows) if (!ov.has(u)) ov.set(u, { s: normDigits(s), p: normDigits(p) });
    const exp = new Map();
    chunksOf(want).forEach((c, i) => {
      if (w.fail.ov === 'all' || (w.fail.ov === 'chunk1' && i >= 1)) return;
      for (const u of c) { const o = ov.get(u); if (o && (o.s || o.p)) exp.set(u, (o.p || '') + '/' + (o.s || '')); }
    });
    if (w.fail.ov === 'chunk1' && chunksOf(want).length >= 2) adChunkSeen++;
    const g = [...got].map(([u, p]) => u + '=' + (p.parent || '') + '/' + (p.student || '')).sort().join('|');
    const e = [...exp].map(([u, v]) => u + '=' + v).sort().join('|');
    ok(g === e, 'A-D2 기본 호출: 실패한 청크만 비고 받은 청크의 번호는 그대로', { seed, fail: w.fail.ov, got: g.slice(0, 200), exp: e.slice(0, 200) });
  }
  ok(adChunkSeen > 0, 'A-D3 전제: «두 번째 청크만 실패» 시나리오가 실제로 나왔다(안 나오면 A-D2 가 헛돈다)', adChunkSeen);
  report('A-D 기본 호출(학생 상세 쪽) 그대로', md);
  ok(ovGapSeen > 0, 'A7 전제: «받아 둔 번호 조회 실패» 시나리오가 실제로 나왔다(안 나오면 A3 의 그 갈래가 헛돈다)', ovGapSeen);
  console.log(`     ℹ 받아 둔 번호 조회 실패 시나리오: ${ovGapSeen}회`);
}

/* ── B. 오늘 수업 연락처 채우기 (api-admin.ts) — 진짜 정본을 물린다 ─────────── */
/* ── A-E. 받아 둔 번호 «표» 를 못 만들 때 — ensureStudentOverrideTable 실패 ────────────
   그 함수는 성공을 모듈 안에 기억한다(_ensured) — 한 번 성공한 모듈로는 «실패» 경로에 원리상 못 닿는다.
   그래서 회차마다 정본 두 파일을 «새로» 불러 그 경로를 실제로 지난다. */
section('A-E. 받아 둔 번호 표를 못 만들 때(표 만들기 실패) — 정본을 회차마다 새로 불러');
{
  const m = mark();
  const soCode = wireImports(stripTypeScriptTypes(rd(resolve(SRC, 'student-override.ts'))));
  const ncCode = wireImports(stripTypeScriptTypes(rd(resolve(SRC, 'notify-contacts.ts'))));
  const keep = globalThis.__FZ.loadOverridePhones;
  const M = Math.min(N, 80);
  for (let k = 0; k < M; k++) {
    const seed = SEED0 + 95000 + k, r = rng(seed), w = genWorld(r, seed);
    w.noDb = false;
    const SO2 = await importData(soCode + `\n// fresh ${seed}`);
    globalThis.__FZ.loadOverridePhones = SO2.loadOverridePhones;
    const NC2 = await importData(ncCode + `\n// fresh ${seed}`);
    globalThis.__FZ.loadOverridePhones = keep;
    const db = buildDb(w), D = d1(db, w.fail);
    const D2 = { prepare: D.prepare, exec: async (q) => { if (/CREATE TABLE IF NOT EXISTS student_erp_override/.test(q)) throw new Error('injected ensure'); return D.exec(q); } };
    let res, threw = null;
    try { res = await NC2.loadContactPhones({ DB: D2 }, w.uids); } catch (e) { threw = e.message; }
    ok(!threw, 'A-E1 표를 못 만들어도 정본은 던지지 않는다', { seed, threw });
    if (threw) continue;
    const o = oracle({ ...w, fail: { ...w.fail, ov: 'all' } });   // 표가 없으면 받아 둔 번호는 «못 물어봄» 과 같다
    const got = [...res.phones].sort().join('|'), exp = [...o.phones].sort().join('|');
    ok(got === exp, 'A-E2 번호는 다음 원천(명부·이탈위험)에서 계속 찾는다', { seed, got: got.slice(0, 200), exp: exp.slice(0, 200) });
    ok(res.complete === o.complete, 'A-E3 표를 못 만들었으면 complete=false(«다 물어봤다» 가 거짓이 된다)', { seed, got: res.complete, exp: o.complete });
    // 기본(엄격하지 않은) 호출은 예전대로 조용히 빈 값 — 학생 상세 화면 등 다른 호출부의 동작을 안 바꾼다
    const SO3 = await importData(soCode + `\n// fresh3 ${seed}`);
    let quiet, qThrew = null;
    try { quiet = await SO3.loadOverridePhones({ DB: D2 }, w.uids.filter(Boolean).map(String)); } catch (e) { qThrew = e.message; }
    ok(!qThrew && quiet instanceof Map && quiet.size === 0, 'A-E4 기본 호출은 표를 못 만들어도 던지지 않고 빈 값', { seed, qThrew });
    const st = { complete: true };
    let loud = null, rep5;
    try { rep5 = await SO3.loadOverridePhones({ DB: D2 }, ['x' + seed], { report: st }); } catch (e) { loud = e.message; }
    ok(!loud && rep5 instanceof Map && st.complete === false, 'A-E5 report 를 넘기면 표를 못 만들 때 «못 물어봤다» 를 알린다(던지지는 않는다)', { seed, loud, st });
  }
  report('A-E 표 만들기 실패', m);
}

section('B. 「오늘 수업」 연락처 채우기 블록 — 진짜 loadContactPhones 와 끝에서 끝까지');
{
  const m = mark();
  const H = rd(resolve(SRC, 'api-admin.ts'));
  const a = H.indexOf('let _ctContactsOk = true;');
  const ifAt = a > 0 ? H.indexOf('if (', a) : -1;
  const block = ifAt > 0 ? (H.slice(a, ifAt) + braceBody(H, ifAt)).replace(/: any/g, '') : '';
  const srcAt = H.indexOf("const contactSource = !_ctSeeContact");
  const srcLine = srcAt > 0 ? H.slice(srcAt, H.indexOf('\n', srcAt)) : '';
  ok(block.length > 100 && srcLine.length > 20, 'B0 전제: 채우기 블록과 contact_source 줄을 잘라 냈다');
  for (let k = 0; k < N; k++) {
    const seed = SEED0 + 50000 + k, r = rng(seed), w = genWorld(r, seed);
    w.noDb = false;
    const db = buildDb(w);
    const see = r() < 0.75;
    const sessions = w.uids.slice(0, 40).map(u => ({ student_uid: u, contact_phone: null }));
    const asked = [];
    const ctx = vm.createContext({ _ctSeeContact: see, sessions, env: { DB: d1(db, w.fail) }, console: { warn() {} },
      loadContactPhones: async (env, uids) => { asked.push(uids.length); return NC.loadContactPhones(env, uids); } });
    let out;
    try { out = await vm.runInContext('(async () => {' + block + '\n' + srcLine + '\n return { ok: _ctContactsOk, src: contactSource }; })()', ctx); }
    catch (e) { out = { threw: e.message }; }
    ok(!out.threw, 'B1 채우기 블록은 던지지 않는다', { seed, err: out.threw });
    if (out.threw) continue;
    if (!see) {
      ok(asked.length === 0 && sessions.every(x => x.contact_phone === null) && out.src === 'restricted', 'B2 지사·대리점: 묻지 않고, 싣지 않고, restricted', { seed, asked, src: out.src });
      continue;
    }
    const o = oracle({ ...w, uids: sessions.map(x => x.student_uid) });
    for (const x of sessions) {
      const exp = o.phones.get(String(x.student_uid || '').trim()) || null;
      ok(x.contact_phone === exp, 'B3 그 줄의 번호 = 정본 답(아이디 앞뒤 공백이 있어도 같은 학생)', { seed, uid: x.student_uid, got: x.contact_phone, exp });
    }
    const expSrc = !sessions.length ? 'lookup' : (o.complete ? 'lookup' : 'failed');
    ok(out.src === expSrc, 'B4 contact_source = lookup(다 물어봄) / failed(조회 실패)', { seed, got: out.src, exp: expSrc });
  }
  report('B 오늘 수업 채우기', m);
}

/* ── B2. 강사 화면 연락처 보강 블록 (api-teacher.ts) — 진짜 정본을 물린다 ──────── */
section('B2. 강사 화면 연락처 보강 — 진짜 loadContactPhones 와 끝에서 끝까지');
{
  const m = mark();
  const T = rd(resolve(SRC, 'api-teacher.ts'));
  const enrichAt = T.indexOf('// Enrich only rows already authorized by the teacher schedule query.');
  const declAt = T.indexOf('let contactsChecked = false', enrichAt);
  const tryAt = T.indexOf('if (!onlyNext) try {', declAt);
  const tryBody = braceBody(T, tryAt);
  const tailEnd = T.indexOf('\n', tryAt + tryBody.length);
  const code = declAt > 0 && tryBody.length > 200 ? stripTypeScriptTypes('async function __t(env, classes, weekDays, onlyNext, selectInChunks, loadContactPhones) {\n'
    + T.slice(declAt, tryAt) + tryBody + T.slice(tryAt + tryBody.length, tailEnd) + '\nreturn { contactsChecked, classes, weekDays };\n}') : '';
  ok(code.length > 300, 'B2-0 전제: 강사 화면 보강 블록을 잘라 냈다');
  const ctx = vm.createContext({});
  const runB2 = !!code && runSrc(code, ctx, 'B2');
  for (let k = 0; runB2 && k < N; k++) {
    const seed = SEED0 + 70000 + k, r = rng(seed), w = genWorld(r, seed);
    w.noDb = false;
    const db = buildDb(w), D = d1(db, w.fail);
    const mkItem = (u) => ({ kind: pick(r, ['class', 'class', 'class', 'lms', 'sample']), student_uid: u });
    const classes = w.uids.slice(0, 20).map(mkItem);
    const weekDays = [{ items: w.uids.slice(20, 40).map(mkItem) }, { items: [] }];
    const onlyNext = r() < 0.15;
    let out, threw = null;
    try { out = await ctx.__t({ DB: D }, classes, weekDays, onlyNext, CH.selectInChunks, NC.loadContactPhones); } catch (e) { threw = e.message; }
    ok(!threw, 'B2-1 보강 블록은 던지지 않는다', { seed, threw });
    if (threw) continue;
    const visible = [...classes, ...weekDays.flatMap(d => d.items)];
    if (onlyNext) { ok(out.contactsChecked === false && visible.every(c => c.student_phone === undefined), 'B2-2 가벼운 경로(다음 수업·월 보기)에선 묻지 않는다', { seed }); continue; }
    const asked = [...new Set(visible.filter(c => c.kind === 'class' && c.student_uid).map(c => String(c.student_uid)))];
    const o = oracle({ ...w, uids: asked });
    for (const c of visible) {
      if (!asked.length) { ok(c.student_phone === undefined, 'B2-3 물어볼 학생이 없으면 손대지 않는다', { seed, c }); continue; }
      const exp = o.phones.get(String(c.student_uid || '').trim()) || null;
      ok(c.student_phone === exp, 'B2-4 그 줄의 번호 = 정본 답(LMS·자리표시 줄도 같은 학생이면 같은 번호, 아이디 공백 무시)', { seed, uid: c.student_uid, kind: c.kind, got: c.student_phone, exp });
    }
    ok(out.contactsChecked === (asked.length ? o.complete : true), 'B2-5 contacts_checked = «다 물어봤다» 일 때만 참', { seed, got: out.contactsChecked, exp: asked.length ? o.complete : true });
  }
  report('B2 강사 화면 보강', m);
}

/* ── C. KST 12시간제 시간 칸 ──────────────────────────────────────────────── */
section('C. 관리자 시간 칸 kstRange — Intl(Asia/Seoul) 독립 오라클');
const TC = rd(resolve(PUB, 'js/adm-today-classes.js'));
const fnSrc = (src, name) => { const at = src.indexOf('  function ' + name + '('); return at < 0 ? '' : braceBody(src, at); };
{
  const m = mark();
  const ctx = vm.createContext({});
  const runC = runSrc(fnSrc(TC, 'kst12') + '\n' + fnSrc(TC, 'kstRange'), ctx, 'C');
  ok(typeof ctx.kstRange === 'function', 'C0 전제: kstRange 를 오려 냈다');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true });
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  const t12 = (ts) => fmt.format(new Date(ts)).replace(/\s?([AP])M$/, (x, p) => p.toLowerCase() + 'm').replace(/ /g, '');
  for (let k = 0; runC && k < N * 4; k++) {
    const r = rng(SEED0 + 90000 + k);
    const start = Date.UTC(int(r, 2024, 2030), int(r, 0, 11), int(r, 1, 28), int(r, 0, 23), int(r, 0, 59));
    const dur = pick(r, [20, 25, 30, 40, 50, 60, 90, int(r, 1, 240)]);
    const shape = pick(r, ['ok', 'ok', 'ok', 'ok', 'noEnd', 'endBefore', 'unknownEnd', 'nanStart', 'undefStart']);
    const s = { start_ts: start, end_ts: start + dur * 60000 };
    if (shape === 'noEnd') delete s.end_ts;
    if (shape === 'endBefore') s.end_ts = start - 60000;
    if (shape === 'unknownEnd') s.end_known = false;
    if (shape === 'nanStart') s.start_ts = NaN;
    if (shape === 'undefStart') delete s.start_ts;
    let exp;
    if (shape === 'nanStart' || shape === 'undefStart') exp = '-';
    else if (shape === 'ok') exp = t12(s.start_ts) + ' – ' + t12(s.end_ts) + (day.format(new Date(s.end_ts)) > day.format(new Date(s.start_ts)) ? ' (+1d)' : '');
    else exp = t12(s.start_ts);
    const got = ctx.kstRange(s);
    ok(got === exp, 'C1 시작–끝(12시간제·KST·+1d)이 Intl 오라클과 같다', { s, got, exp });
    ok(!/\b(1[3-9]|2[0-3]):\d\d/.test(got), 'C2 24시간제(13:00~23:59) 글자가 안 나온다', { got });
  }
  report('C KST 시간 칸', m);
}

/* ── D. 월 칸 만들기 + 날짜 판정 (api-teacher.ts) ─────────────────────────── */
section('D. 강사 월 보기 서버 — 월 칸·hitsOn·calendarItemOf (진짜 class-start-date.ts)');
const TAPI = rd(resolve(SRC, 'api-teacher.ts'));
const AAPI = rd(resolve(SRC, 'api-admin.ts'));
{
  const m = mark();
  const mdAt = TAPI.indexOf('const monthDays: any[] = [];');
  const mdSrc = TAPI.slice(mdAt, TAPI.indexOf('\n  }\n', mdAt) + 4);
  const hitsAt = TAPI.indexOf('const hitsOn = ');
  const hitsSrc = TAPI.slice(hitsAt, TAPI.indexOf(';\n', hitsAt) + 2);
  const itemSrc = braceBody(TAPI, TAPI.indexOf('const calendarItemOf = ')) + ';';
  const dowSrc = braceBody(TAPI, TAPI.indexOf('function dowMatches('));
  const mapSrc = TAPI.slice(TAPI.indexOf('const DOW_MAP'), TAPI.indexOf('};', TAPI.indexOf('const DOW_MAP')) + 2);
  const uidSrc = braceBody(TAPI, TAPI.indexOf('const studentUidOf = ')) + ';';
  const admDow = braceBody(AAPI, AAPI.indexOf('function admDowMatches('));
  const admMap = AAPI.slice(AAPI.indexOf('const ADM_DOW_MAP'), AAPI.indexOf('};', AAPI.indexOf('const ADM_DOW_MAP')) + 2);
  ok(mdAt > 0 && hitsAt > 0 && itemSrc.length > 100 && admDow.length > 50 && admMap.length > 50, 'D0 전제: 월 칸·판정·요일 정본 둘을 오려 냈다');
  const todayStr = '2026-10-27';
  const ctx = vm.createContext({ todayStr, pad: n => String(n).padStart(2, '0'), recurStartedOn: CSD.recurStartedOn,
    classKindOf: s => (s.class_type === 'level_test' ? 'level_test' : 'regular') });
  const runD = runSrc(stripTypeScriptTypes([mapSrc, dowSrc, uidSrc, hitsSrc, itemSrc, admMap, admDow].join('\n')).replace(/^const (\w+) =/gm, 'var $1 ='), ctx, 'D');
  const KO = ['일', '월', '화', '수', '목', '금', '토'], EN3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const myDow = (raw, target) => {   // 독립 오라클 — 사양: 숫자·영문 3자·영문 전체·한글·한글요일, 대소문자 무시, , 공백 / · 로 나열
    for (const t of String(raw ?? '').split(/[,\s/·]+/).map(x => x.trim()).filter(Boolean)) {
      if (/^\d+$/.test(t)) { if (Number(t) === target) return true; continue; }
      const l = t.toLowerCase();
      for (let d = 0; d < 7; d++) if (d === target && (l === EN3[d] || l === EN[d] || t === KO[d] || t === KO[d] + '요일')) return true;
    }
    return false;
  };
  const genDow = (r) => {
    const one = () => { const d = int(r, 0, 6); return pick(r, [String(d), EN3[d], EN3[d].toUpperCase(), EN[d], KO[d], KO[d] + '요일', EN3[d][0].toUpperCase() + EN3[d].slice(1)]); };
    return pick(r, [one, one, one, () => [one(), one()].join(','), () => [one(), one(), one()].join(pick(r, [',', ' ', '/', '·', ', '])), () => '7', () => 'x', () => '', () => null])();
  };
  const genYmd = (r, y, mo) => `${y}-${String(mo).padStart(2, '0')}-${String(int(r, 1, 28)).padStart(2, '0')}`;
  for (let k = 0; runD && k < N; k++) {
    const r = rng(SEED0 + 130000 + k);
    const y = int(r, 2000, 2099), mo = int(r, 1, 12), monthParam = `${y}-${String(mo).padStart(2, '0')}`;
    const c2 = vm.createContext({ monthMode: true, monthParam, todayStr, pad: n => String(n).padStart(2, '0') });
    if (!runSrc(stripTypeScriptTypes(mdSrc).replace('const monthDays', 'var monthDays'), c2, 'D-월칸')) break;
    const md = c2.monthDays;
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    ok(md.length === dim, 'D1 월 칸 수 = 그 달 날 수', { monthParam, got: md.length, dim });
    ok(md.every((d, i) => d.date === `${monthParam}-${String(i + 1).padStart(2, '0')}` && d.dow === new Date(Date.UTC(y, mo - 1, i + 1)).getUTCDay()), 'D2 날짜·요일이 달력과 같다', { monthParam });
    ok(md.filter(d => d.is_today).length === (monthParam === '2026-10' ? 1 : 0) && md.every(d => !!d.is_today === (d.date === todayStr)), 'D3 오늘 표시는 오늘 칸 하나', { monthParam });
    // 무작위 수업으로 날짜 판정을 대조한다
    for (let j = 0; j < 12; j++) {
      const dated = r() < 0.3;
      const s = { id: int(r, 1, 99999), user_id: pick(r, ['kid1', 'LMS', 'lms', 'type_seed', 'abc', '']), start_time: pick(r, ['16:00', '9:5', '23:40', '', null, 'abc', '0:00']),
        duration_min: pick(r, [20, 30, 40, '', null, '25']), student_name: pick(r, ['김선우', null, '<b>x</b>']), class_type: pick(r, ['regular', 'level_test', null]) };
      if (dated) s.scheduled_date = pick(r, [genYmd(r, y, mo), genYmd(r, y, mo) + ' 00:00', genYmd(r, y, mo) + 'T09:00:00', genYmd(r, y === 2099 ? y : y + 1, mo)]);
      else {
        s.day_of_week = genDow(r);
        if (r() < 0.3) s.starts_on = pick(r, [genYmd(r, y, mo), '', null, 'abc', `${y - 1}-01-01`, `${y + 1}-01-01`]);
        if (r() < 0.2) s.skip_dates = [genYmd(r, y, mo), genYmd(r, y, mo)].join(',');
      }
      for (const d of md) {
        const got = ctx.hitsOn(s, d.date, d.dow);
        const exp = s.scheduled_date ? String(s.scheduled_date).slice(0, 10) === d.date
          : (s.day_of_week != null && s.day_of_week !== '' && myDow(s.day_of_week, d.dow) && CSD.recurStartedOn(s, d.date));
        ok(got === exp, 'D4 그 날 수업인가 = 오라클(일회성은 그 날만 · 반복은 요일+시작일+건너뛴 날)', { s, date: d.date, got, exp });
        if (!s.scheduled_date && s.day_of_week) ok(ctx.dowMatches(s.day_of_week, d.dow) === ctx.admDowMatches(s.day_of_week, d.dow), 'D5 강사 화면 요일 판정 = 관리자 정본 admDowMatches', { dow: s.day_of_week, d: d.dow });
        if (!got) continue;
        const pp = r() < 0.1;
        const it = ctx.calendarItemOf(s, d.date, pp);
        ok(it.room_id === 'class-' + s.id + '-' + d.date.replace(/-/g, ''), 'D6 방 번호 = class-{예약id}-{YYYYMMDD}', { it });
        ok(/^\d{2}:\d{2}$/.test(it.start_time) && Number.isFinite(it.start_ts), 'D7 시작 시각이 HH:MM 이고 start_ts 가 숫자', { st: s.start_time, it: it.start_time, ts: it.start_ts });
        ok(it.status === (pp ? 'postponed' : (d.date > todayStr ? 'early' : 'done')) && (it.class_state === (pp ? 'postponed' : undefined)), 'D8 상태(연기·앞으로·지남)', { it, pp });
        ok(it.kind === (String(s.user_id || '').toLowerCase() === 'lms' ? 'lms' : (String(s.user_id || '').toLowerCase() === 'type_seed' ? 'sample' : 'class')), 'D9 LMS·시드 자리표시 구분', { u: s.user_id, k: it.kind });
        ok(it.duration_min === (Number(s.duration_min) || 30), 'D10 길이(없으면 30분)', { d: s.duration_min, got: it.duration_min });
      }
    }
  }
  report('D 월 보기 서버', m);
}

/* ── E. 강사 화면 월 달력 그리기 (teacher.html) ───────────────────────────── */
section('E. teacher.html renderMonth — 무작위 달·수업');
const TH = rd(resolve(PUB, 'teacher.html'));
{
  const m = mark();
  const els = new Map();
  const el = (id) => { if (!els.has(id)) { const cls = new Set(); els.set(id, { id, hidden: false, innerHTML: '', textContent: '', attrs: {}, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) }, setAttribute(k, v) { this.attrs[k] = v; } }); } return els.get(id); };
  const ctx = vm.createContext({ LANG: 'en', document: { getElementById: el }, localStorage: { getItem: () => null, setItem() {} }, console: { warn() {} },
    MangoiClassDisplay: { time: t => String(t), range: c => String(c.start_time) }, fetch: () => new Promise(() => {}) });
  ctx.EN = () => ctx.LANG !== 'ko'; ctx.T = (en, ko) => ctx.LANG === 'ko' ? ko : en;
  const names = ['esc', 'stuName', 'stuUid', 'stuParts', 'stuLabelText', 'clsToday', 'clsDayLabel', 'moThisMonth', 'moShift', 'moLabel', 'moItemHtml', 'renderMonth'];
  const missing = names.filter(n => !fnSrc(TH, n));
  ok(!missing.length, 'E0 전제: 달력 그리기 함수들을 오려 냈다', missing);
  const runE = runSrc('var MO = { view: "month", month: null, data: null, read: 0, err: false, me: null }; function now(){ return Date.parse("2026-10-27T03:00:00Z"); }\n'
    + names.map(n => fnSrc(TH, n)).filter(Boolean).join('\n'), ctx, 'E');
  for (let k = 0; runE && k < N; k++) {
    const r = rng(SEED0 + 170000 + k);
    const y = int(r, 2024, 2030), mo = int(r, 1, 12), ym = `${y}-${String(mo).padStart(2, '0')}`;
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const days = Array.from({ length: dim }, (_, i) => {
      const n = r() < 0.6 ? 0 : int(r, 1, 7);
      return { date: `${ym}-${String(i + 1).padStart(2, '0')}`, dow: new Date(Date.UTC(y, mo - 1, i + 1)).getUTCDay(), is_today: false,
        items: Array.from({ length: n }, () => ({ kind: pick(r, ['class', 'class', 'class', 'lms', 'sample']), start_time: pick(r, ['16:00', '09:05', '23:40']),
          student_name: pick(r, ['김선우', 'Kim', '<img src=x onerror=alert(1)>', '"q"', null]), student_uid: pick(r, ['kid1', '', null]),
          class_state: r() < 0.15 ? 'postponed' : undefined, status: r() < 0.1 ? 'holiday' : 'early', holiday_name: r() < 0.1 ? pick(r, ['Hangeul Day', '<i>x</i>']) : undefined,
          is_level_test: r() < 0.2 })) };
    });
    ctx.LANG = r() < 0.5 ? 'ko' : 'en';
    ctx.MO.month = ym; ctx.MO.data = { month: ym, days }; ctx.MO.err = false; ctx.MO.me = null;
    let threw = null;
    try { ctx.renderMonth(); } catch (e) { threw = e.message; }
    ok(!threw, 'E1 그리다 죽지 않는다', { ym, threw });
    if (threw) continue;
    const h = el('month').innerHTML;
    ok((h.match(/data-mo-day="/g) || []).length === dim, 'E2 누를 수 있는 날짜 칸 = 그 달 날 수', { ym });
    const lead = (h.slice(0, h.indexOf('data-mo-day=')).match(/mo-blank/g) || []).length;
    ok(lead === days[0].dow, 'E3 1일 앞 빈칸 = 1일의 요일', { ym, lead, dow: days[0].dow });
    ok(((h.match(/class="mo-c[ "]/g) || []).length) % 7 === 0, 'E4 칸 수가 7의 배수(줄이 안 밀린다)', { ym });
    ok(!/<img src=x/.test(h) && !/<i>x<\/i>/.test(h), 'E5 이름·공휴일 이름이 이스케이프된다', { ym });
    for (const d of days) {
      const at = h.indexOf(`data-mo-day="${d.date}"`), cell = h.slice(at, h.indexOf('</button>', at));
      const real = d.items.filter(it => it.kind === 'class' && it.class_state !== 'postponed' && it.status !== 'holiday').length;
      const badge = (cell.match(/class="mo-n">(\d+)</) || [])[1];
      ok(real ? badge === String(real) : badge === undefined, 'E6 배지 = 열리는 수업 수(연기·휴강·점유 제외, 0이면 없음)', { date: d.date, real, badge });
      ok((cell.match(/class="mo-i/g) || []).length === Math.min(4, d.items.length), 'E7 한 칸에 최대 4줄', { date: d.date });
      ok(d.items.length > 4 ? cell.includes('+' + (d.items.length - 4) + '</span>') : !/mo-more/.test(cell), 'E8 넘치면 «+N»', { date: d.date, n: d.items.length });
    }
  }
  report('E 월 달력 그리기', m);
}

/* ── F. 관리자 「오늘 수업」 표 전체 (adm-today-classes.js) ─────────────────── */
section('F. adm-today-classes.js 표 — 머리칸 = 줄칸 · 연락처 칸 · 안내 문구');
function renderOnce(sessions, contactSource, lang) {
  const els = {};
  const mk = (id) => (els[id] || (els[id] = { id, innerHTML: '', textContent: '', value: '', checked: false, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} }));
  mk('tc-body'); mk('tc-count');
  const doc = { getElementById: (id) => els[id] || null, dispatchEvent: () => true, addEventListener() {} };
  const win = { adminLang: lang, addEventListener() {}, removeEventListener() {} };
  win.document = doc;
  const ctx = { window: win, document: doc, localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sessions, date: '2026-10-27', counts: {}, contact_source: contactSource }) }),
    console: { log() {}, warn() {}, error() {} },
    Date, Number, String, Math, JSON, Array, Object, RegExp, encodeURIComponent, decodeURIComponent, setTimeout };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(TC, ctx, { filename: 'adm-today-classes.js' });
  return win.tcLoadToday().then(() => els['tc-body'].innerHTML);
}
{
  const m = mark();
  const base = Date.parse('2026-10-27T00:00:00Z');
  for (let k = 0; k < N; k++) {
    const r = rng(SEED0 + 210000 + k);
    const n = int(r, 1, 18);
    const sessions = Array.from({ length: n }, (_, i) => {
      const st = base + int(r, 0, 47) * 1800000;
      return { schedule_id: i + 1, source: pick(r, ['mangoi', 'cafe24']), observable: r() < 0.5, room_id: 'class-' + (i + 1) + '-20261027',
        student_uid: 'u' + k + '_' + i, student_name: pick(r, ['김선우', 'Kim', '<script>x</script>', null]), academy: pick(r, ['분당학원', null]),
        contact_phone: r() < 0.4 ? pick(r, ['01012345678', '010-2222-3333', '+63 917 123 4567']) : null,
        level: null, textbook: null, textbook_assigned: false, teacher_name: pick(r, ['KRYSTEL', 'Teacher Shas', null]),
        start_ts: st, end_ts: st + pick(r, [20, 30, 40]) * 60000, end_known: r() < 0.85, status: pick(r, ['early', 'open', 'live', 'done']), join_open: r() < 0.3, is_level_test: r() < 0.1 };
    });
    const src = pick(r, ['lookup', 'failed', 'restricted', undefined, 'retention']);
    const lang = pick(r, ['ko', 'en']);
    let html, threw = null;
    try { html = await renderOnce(sessions, src, lang); } catch (e) { threw = e.message; }
    ok(!threw && typeof html === 'string' && html.length > 100, 'F1 표를 그린다(죽지 않는다)', { k, threw });
    if (threw) continue;
    const thN = (html.match(/<th[ >]/g) || []).length;
    const trs = html.split('<tr>').slice(2);
    const tdN = trs.map(x => (x.match(/<td[ >]/g) || []).length);
    ok(thN > 0 && tdN.length === n && tdN.every(x => x === thN), 'F2 머리칸 수 = 모든 줄의 칸 수, 줄 수 = 수업 수', { k, thN, tdN, n });
    ok(!/<script>x<\/script>/.test(html), 'F3 학생 이름이 이스케이프된다', { k });
    const telN = (html.match(/href="tel:/g) || []).length, withPhone = sessions.filter(s => s.contact_phone).length;
    ok(telN === withPhone, 'F4 번호가 있는 줄만 tel: 링크', { k, telN, withPhone });
    const missing = n - withPhone;
    const say = { lookup: /관리 대상|at-risk/, failed: /확인하지 못했습니다|Could not check/, restricted: /본사 계정에서만|HQ accounts only/ };
    for (const [key, re] of Object.entries(say)) {
      const expect = missing > 0 && src === key;
      ok(re.test(html) === expect, 'F5 안내 문구는 서버 근거·빈칸이 있을 때만(옛 retention·근거 없음은 말 안 함)', { k, src, key, missing, shown: re.test(html) });
    }
    ok(!/\b(1[3-9]|2[0-3]):\d\d\b/.test(html.replace(/title="[^"]*"/g, '')), 'F6 시간 칸에 24시간제 글자가 없다', { k });
  }
  report('F 관리자 표', m);
}

/* ── G. manager.html 안내 문구 ─────────────────────────────────────────────── */
section('G. manager.html 연락처 안내 — 무작위 줄·근거');
{
  const m = mark();
  const MG = rd(resolve(PUB, 'manager.html'));
  const a = MG.indexOf('    var noMobile = rows.filter(');
  const b = MG.indexOf('    /* 🏫 거르는 중이면', a);
  const snip = a > 0 && b > a ? MG.slice(a, b) : '';
  ok(snip.length > 200, 'G0 전제: 안내 문구 조각을 오려 냈다');
  for (let k = 0; k < N; k++) {
    const r = rng(SEED0 + 250000 + k);
    const rows = Array.from({ length: int(r, 0, 15) }, () => ({ contact_phone: r() < 0.4 ? '01012345678' : pick(r, [null, '']) }));
    const j = { contact_source: pick(r, ['lookup', 'failed', 'restricted', undefined, 'retention']) };
    const lang = pick(r, ['ko', 'en']);
    const ctx = vm.createContext({ rows, j, T: (en, ko) => lang === 'ko' ? ko : en });
    let cnote, threw = null;
    try { cnote = vm.runInContext(snip + '\ncnote;', ctx); } catch (e) { threw = e.message; }
    ok(!threw, 'G1 조각이 돈다', { threw });
    if (threw) continue;
    const miss = rows.filter(x => !x.contact_phone).length;
    const exp = !miss ? '' : (j.contact_source === 'restricted' ? 'r' : (j.contact_source === 'failed' ? 'f' : (j.contact_source === 'lookup' ? 'l' : '')));
    const got = !cnote ? '' : (/본사 계정|HQ accounts/.test(cnote) ? 'r' : (/확인하지 못했습니다|Could not check/.test(cnote) ? 'f' : (/관리 대상|at-risk/.test(cnote) ? 'l' : '?')));
    ok(got === exp, 'G2 근거별 문구(관리자 화면과 같은 판정)', { src: j.contact_source, miss, got, exp });
    if (exp === 'l') ok(cnote.includes(String(miss)) && cnote.includes(String(rows.length)), 'G3 «N of M» 숫자가 실제 빈칸 수', { cnote, miss, total: rows.length });
  }
  report('G 매니저 안내', m);
}

console.warn = _warn;
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
for (const [rule, { n, ex }] of fails) console.log(`  ❌ ${rule} — ${n}회, 첫 반례: ${JSON.stringify(ex).slice(0, 600)}`);
process.exit(FAIL ? 1 : 0);

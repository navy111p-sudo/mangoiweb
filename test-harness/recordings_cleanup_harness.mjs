// -*- coding: utf-8 -*-
// 🧪 R2 고아 파일 청소 로직 — 실제 실행 통합 테스트 (가짜 D1/R2 주입)
//   실행:  node test-harness/recordings_cleanup_harness.mjs
//   방식:  src/recordings-cleanup.ts 를 esbuild 로 즉석 트랜스파일 → import → 실제 호출
//          (스펙 미러가 아니라 진짜 코드 경로를 태워 버그를 잡는다)
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src/recordings-cleanup.ts');
const OUTDIR = resolve(__dir, '.build');
const OUT = resolve(OUTDIR, 'recordings-cleanup.mjs');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
function eq(name, a, b){ check(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a)===JSON.stringify(b)); }

// ── 0) TS → ESM 트랜스파일 ────────────────────────────────────────────
mkdirSync(OUTDIR, { recursive: true });
execSync('npx --yes esbuild "' + SRC + '" --bundle --format=esm --platform=node --log-level=warning --outfile="' + OUT + '"', { stdio: 'pipe' });
const { purgeOrphanedRecordings } = await import(pathToFileURL(OUT).href + '?t=' + Date.now());

// ── 가짜 D1 / R2 / KV 팩토리 ──────────────────────────────────────────
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const NOW = Date.now();

function fakeDB(keys, { fail = false } = {}) {
  return {
    prepare(sql) {
      return {
        async all() {
          if (fail) throw new Error('D1 connection lost');
          return { results: keys.map(k => ({ file_url: k })) };
        }
      };
    }
  };
}
// objects: [{key,size,ageDays}] ageDays=업로드 경과일. pageSize 로 페이지네이션 흉내.
function fakeR2(objects, { pageSize = 1000, throwOnList = false } = {}) {
  const all = objects.map(o => ({
    key: o.key,
    size: o.size ?? 0,
    uploaded: new Date(NOW - (o.ageDays ?? 30) * DAY),
  }));
  const deleted = [];
  return {
    _deleted: deleted,
    async list({ limit = 1000, cursor, prefix } = {}) {
      if (throwOnList) throw new Error('R2 list failed');
      let pool = prefix ? all.filter(o => o.key.startsWith(prefix)) : all;
      const start = cursor ? parseInt(cursor, 10) : 0;
      const slice = pool.slice(start, start + pageSize);
      const next = start + pageSize;
      const truncated = next < pool.length;
      return { objects: slice, truncated, cursor: truncated ? String(next) : undefined };
    },
    async delete(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) deleted.push(k);
    },
  };
}
const fakeKV = () => ({ _store: {}, async put(k, v) { this._store[k] = v; }, async get(k) { return this._store[k] ?? null; } });

// ── 1) 기본 고아 탐지: D1에 없는 R2 객체만 삭제 ───────────────────────
console.log('\n[1] 기본 고아 탐지 (D1=A,B,C / R2=A,B,C,D → D만 삭제)');
{
  const R2 = fakeR2([
    { key: 'rec/r1/A.webm', size: 100 }, { key: 'rec/r1/B.webm', size: 200 },
    { key: 'rec/r2/C.webm', size: 300 }, { key: 'rec/r2/D.webm', size: 400 },
  ]);
  const env = { DB: fakeDB(['rec/r1/A.webm','rec/r1/B.webm','rec/r2/C.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('총 객체 4', r.total_objects, 4);
  eq('known 3', r.known_keys, 3);
  eq('고아 1', r.orphan_count, 1);
  eq('삭제 1', r.deleted_count, 1);
  eq('삭제된 key = D', R2._deleted, ['rec/r2/D.webm']);
  eq('A,B,C 보존(미삭제)', R2._deleted.includes('rec/r1/A.webm'), false);
  eq('삭제 용량 400B', r.deleted_bytes, 400);
  eq('안전장치 미발동', r.aborted_by_guard, false);
}

// ── 2) cursor 페이지네이션: 여러 페이지 전부 순회 ─────────────────────
console.log('\n[2] 페이지네이션 (10객체, pageSize=3 → 4페이지 전수 스캔)');
{
  const objs = Array.from({ length: 10 }, (_, i) => ({ key: `rec/p/${i}.webm`, size: 10 }));
  const R2 = fakeR2(objs, { pageSize: 3 });
  // D1엔 0~7만 등록 → 8,9가 고아 (2/10=20% < 50% 통과)
  const known = objs.slice(0, 8).map(o => o.key);
  const env = { DB: fakeDB(known), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('총 객체 10 (모든 페이지 순회)', r.total_objects, 10);
  eq('고아 2', r.orphan_count, 2);
  eq('삭제된 key = 8,9', R2._deleted.sort(), ['rec/p/8.webm','rec/p/9.webm']);
}

// ── 3) 안전장치: 고아 ≥ 50% → 중단, 한 건도 삭제 안 함 ────────────────
console.log('\n[3] 안전장치 (D1 비어있음 → 100% 고아 → 전량삭제 차단)');
{
  const R2 = fakeR2([{ key: 'rec/x/1.webm', size: 1 }, { key: 'rec/x/2.webm', size: 1 }]);
  const env = { DB: fakeDB([]), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('안전장치 발동', r.aborted_by_guard, true);
  eq('삭제 0 (사고 방지)', r.deleted_count, 0);
  eq('R2 실제 삭제 0', R2._deleted.length, 0);
  check('경고 메시지 존재', r.errors.some(e => e.includes('안전장치')));
}
console.log('   └ 경계값: 정확히 50%도 차단되어야 함 (2객체 중 1고아)');
{
  const R2 = fakeR2([{ key: 'rec/y/keep.webm' }, { key: 'rec/y/orphan.webm' }]);
  const env = { DB: fakeDB(['rec/y/keep.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('50% 경계 차단', r.aborted_by_guard, true);
  eq('삭제 0', R2._deleted.length, 0);
}

// ── 4) grace period: 최근 업로드(24h 이내)는 보호 ─────────────────────
console.log('\n[4] grace period (방금 올라온 미완료 업로드 보호)');
{
  const R2 = fakeR2([
    { key: 'rec/g/old.webm', size: 50, ageDays: 10 },     // 오래된 고아 → 삭제
    { key: 'rec/g/fresh.webm', size: 50, ageDays: 0 },    // 방금(<24h) → 보호
    { key: 'rec/g/keep.webm', size: 50, ageDays: 10 },    // D1 등록 → 보존
    { key: 'rec/g/keep2.webm', size: 50, ageDays: 10 },
  ]);
  const env = { DB: fakeDB(['rec/g/keep.webm','rec/g/keep2.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('최근건 skip 1', r.skipped_recent, 1);
  eq('삭제 1 (old만)', r.deleted_count, 1);
  eq('fresh 보호됨', R2._deleted.includes('rec/g/fresh.webm'), false);
  eq('old 삭제됨', R2._deleted, ['rec/g/old.webm']);
}

// ── 5) dry-run: 분석만, 실제 R2 삭제 없음 ─────────────────────────────
console.log('\n[5] dry-run (미리보기 — 카운트는 잡되 실제 삭제 0)');
{
  const R2 = fakeR2([
    { key: 'rec/d/A.webm', size: 100 }, { key: 'rec/d/B.webm', size: 100 },
    { key: 'rec/d/C.webm', size: 100 }, { key: 'rec/d/orphan.webm', size: 100 },
  ]);
  const env = { DB: fakeDB(['rec/d/A.webm','rec/d/B.webm','rec/d/C.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  // dryRun + deleteOrphans → «지운다면 몇 건인지» 를 보고한다(실제로는 안 지움)
  const r = await purgeOrphanedRecordings(env, { dryRun: true, deleteOrphans: true });
  eq('dry_run 플래그', r.dry_run, true);
  eq('고아 카운트는 보고(1)', r.orphan_count, 1);
  eq('deleted_count 보고(1)', r.deleted_count, 1);

  // 🔴 기본값 확인 — 플래그 없이 부르면 «분석만» 하고 한 건도 안 지운다(2026-08-05 사장님 지시)
  const r0 = await purgeOrphanedRecordings(env, {});
  eq('기본값: 고아는 세지만', r0.orphan_count, 1);
  eq('기본값: 삭제는 0', r0.deleted_count, 0);
  eq('기본값: 지운 용량도 0', r0.deleted_bytes, 0);
  check('기본값: «삭제 안 함» 안내가 남는다', r0.errors.some(e => e.includes('삭제 안 함')));
  eq('🔒 실제 R2 삭제 0', R2._deleted.length, 0);
}

// ── 6) D1 조회 실패 → 절대 삭제 금지(중단) ────────────────────────────
console.log('\n[6] D1 실패 안전 (조회 에러 시 전부 고아 오판 방지)');
{
  const R2 = fakeR2([{ key: 'rec/f/1.webm' }, { key: 'rec/f/2.webm' }]);
  const env = { DB: fakeDB([], { fail: true }), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('중단됨', r.aborted_by_guard, true);
  eq('R2 삭제 0', R2._deleted.length, 0);
  check('D1 에러 기록', r.errors.some(e => e.includes('D1')));
}

// ── 7) R2 바인딩 없음 → 조용히 스킵(크래시 X) ─────────────────────────
console.log('\n[7] R2 바인딩 없음 (로컬 환경 graceful)');
{
  const env = { DB: fakeDB(['x']), SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { deleteOrphans: true });
  eq('삭제 0', r.deleted_count, 0);
  check('스킵 메시지', r.errors.some(e => e.includes('바인딩')));
}

// ── 8) prefix 한정 청소 + KV 마지막 실행 기록 ─────────────────────────
console.log('\n[8] prefix 한정 + KV last_run 기록');
{
  const R2 = fakeR2([
    { key: 'rec/keepzone/a.webm' }, { key: 'rec/keepzone/b.webm' },
    { key: 'tmp/junk1.webm' }, { key: 'tmp/junk2.webm' }, { key: 'tmp/junk3.webm' },
  ]);
  const kv = fakeKV();
  const env = { DB: fakeDB(['tmp/junk1.webm']), RECORDINGS: R2, SESSION_STATE: kv };
  // prefix='tmp/' 만 대상 → junk2,junk3 고아 (2/3=66%지만 prefix 한정 풀이라 차단). 의도 검증용으로 known 늘림
  const env2 = { DB: fakeDB(['tmp/junk1.webm','tmp/junk2.webm']), RECORDINGS: fakeR2([
    { key: 'rec/keepzone/a.webm' }, { key: 'tmp/junk1.webm' }, { key: 'tmp/junk2.webm' }, { key: 'tmp/junk3.webm' },
  ]), SESSION_STATE: kv };
  const r = await purgeOrphanedRecordings(env2, { prefix: 'tmp/', deleteOrphans: true });
  eq('prefix 범위만 카운트(3)', r.total_objects, 3);
  eq('keepzone 무시', r.deleted_keys.includes('rec/keepzone/a.webm'), false);
  eq('junk3 삭제', r.deleted_keys, ['tmp/junk3.webm']);
  const saved = await kv.get('recordings-cleanup:last_run');
  check('KV last_run 저장됨', !!saved && JSON.parse(saved).deleted_count === 1);
}

// ── 9) 🔴 기본 청소 범위는 «rec/ 안» 이다 (2026-08-05 사장님 지시) ────────
//   왜 못박는가: 예전 기본값은 «전 버킷» 이었다. 이 버킷에는 녹화가 아닌 파일도 들어 있고
//   (레거시 업로드가 «방번호/날짜/…» 로 D1 기록 없이 저장한다), 실제 운영에서
//   42,264개 중 41,880개(99.1%)가 고아로 잡혀 50% 안전장치가 삭제를 막았다.
//   그 장치 하나가 4만 개를 지켰다. 기본 범위가 다시 «전체» 로 돌아가면 그 위험이 되살아난다.
console.log('\n[9] 기본 범위 = rec/ (녹화 아닌 파일은 후보에도 안 든다)');
{
  const R2 = fakeR2([
    { key: 'rec/class-1/a.webm' },        // 녹화 · D1 등록 → 보존
    { key: 'rec/class-1/c.webm' },        // 녹화 · D1 등록 → 보존
    { key: 'rec/class-1/d.webm' },        // 녹화 · D1 등록 → 보존
    { key: 'rec/class-1/b.webm' },        // 녹화 · 미등록  → 고아 (1/4=25%, 안전장치 미발동)
    { key: '850/2026-08-05/textbook.pdf' }, // 레거시 업로드(수업 자료) → 후보에 들면 안 됨
    { key: '850/2026-08-05/photo.png' },    // 〃
    { key: '_test/ping.txt' },              // 연결 테스트 파일 → 후보에 들면 안 됨
  ]);
  const env = { DB: fakeDB(['rec/class-1/a.webm','rec/class-1/c.webm','rec/class-1/d.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { dryRun: true });
  eq('rec/ 안의 객체만 센다(4)', r.total_objects, 4);
  eq('고아는 rec/ 안에서만(1)', r.orphan_count, 1);
  check('수업 자료(textbook.pdf)는 후보에 없다', !r.deleted_keys.includes('850/2026-08-05/textbook.pdf'));
  check('사진(photo.png)도 후보에 없다', !r.deleted_keys.includes('850/2026-08-05/photo.png'));
  check('테스트 파일(_test/)도 후보에 없다', !r.deleted_keys.includes('_test/ping.txt'));
  check('안전장치에 기대지 않는다 — 애초에 후보가 아니다', r.aborted_by_guard === false);
}

// ── 10) 전 버킷 청소는 «명시적으로만» 가능 ───────────────────────────────
console.log('\n[10] 전 버킷은 prefix:"" 를 «직접» 넣어야만 열린다');
{
  const R2 = fakeR2([
    { key: 'rec/class-1/a.webm' }, { key: '850/2026-08-05/textbook.pdf' },
  ]);
  const env = { DB: fakeDB(['rec/class-1/a.webm']), RECORDINGS: R2, SESSION_STATE: fakeKV() };
  const r = await purgeOrphanedRecordings(env, { dryRun: true, prefix: '' });
  eq('prefix:"" 면 전체를 본다(2)', r.total_objects, 2);
}

// ── 정리 ──────────────────────────────────────────────────────────────
try { rmSync(OUTDIR, { recursive: true, force: true }); } catch {}

console.log('\n' + '='.repeat(52));
console.log(`🎯 총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exitCode = 1; }
else console.log('🎉 R2 고아 청소 로직 — 모든 경로 정상 (탐지·페이지네이션·안전장치·grace·dry-run·실패안전)');
console.log('='.repeat(52));

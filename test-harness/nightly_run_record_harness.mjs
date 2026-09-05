/* ═══════════════════════════════════════════════════════════════════════════
   🌙 야간 배치 «어디까지 갔나» 기록 감시 (2026-08-31 신설)

   [무엇을 막나] 야간 작업 16개가 하나의 `ctx.waitUntil` 안에서 **순차로** 돈다.
   각 작업은 try/catch 로 감싸여 있지만, 그건 «던진 에러» 만 잡는다.
   CPU·subrequest 한도를 넘겨 **격리(isolate)가 종료되면** try/catch 는 아무것도 못 본다 —
   그 뒤 작업들은 **로그 한 줄 없이** 안 돌고, 성공한 밤과 겉모습이 똑같다.

   ⚠️ «블록 전체가 몇 분 걸리는가» 는 아직 아무도 모릅니다 — 그것을 재려고 만든 기록입니다.
   (2026-08-31 에 잰 것은 decision_growth_snapshots 의 마지막 시각 하나뿐이고,
    그 행이 cron 것이라는 보장이 없어 «약 9.5분» 은 측정이 아니라 추론입니다.)

   [검사 방법] 문자열만 보지 않는다 — 기록 모듈을 실제로 컴파일해 가짜 D1 로 돌리고,
   «판 도중에 죽은 상태» 를 그대로 만들어 다음 판이 그것을 **알아채는지** 확인한다.
   되돌리면 실제로 FAIL 난다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위 주석 제거 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시» 하나에
 *  코드가 통째로 함께 사라진다(이 저장소 index.ts 에서 실측 8만자). */
function strip(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw;
  }).join('\n');
}

const idx = strip(readFileSync(join(SRC, 'index.ts'), 'utf8'));

/* cron 블록을 «중괄호 짝» 으로 자른다. 길이로 자르면 옆 cron 블록이 딸려 온다.
   ⚠️ (2026-09-04) `block18()` 이던 것을 일반화했다 — learning-snapshot 을 `0 0` 으로 옮기면서
      그 블록에도 계측을 붙였는데, 18시만 검사하면 **앞으로 그 블록에 작업을 더하고 표시를
      빠뜨려도 초록불**이다. 고치려던 «조용히 잘리는» 문제를 자리만 바꿔 되살리는 셈이다. */
function blockOf(cron) {
  const s = idx.indexOf(`cronIs('${cron}')`);
  if (s < 0) return '';
  let d = 0, started = false;
  for (let i = s; i < idx.length; i++) {
    if (idx[i] === '{') { d++; started = true; }
    else if (idx[i] === '}') { d--; if (started && d === 0) return idx.slice(s, i + 1); }
  }
  return '';
}
const B = blockOf('0 18 * * *');

console.log('\n[ A. 18시 블록이 «판 시작 → 단계 → 종료» 를 남긴다 ]');
check('18시 블록을 찾았다', B.length > 2000, "cronIs('0 18 * * *') 블록이 없다 — 구조가 바뀌었나?");
check('판 시작(beginNightlyRun)이 블록 «맨 앞» 에 있다',
  /const _nightly = await beginNightlyRun\(/.test(B)
  && B.indexOf('beginNightlyRun') < B.indexOf('markNightlyStep'),
  '시작 기록이 없거나 작업들 뒤에 있다 — 앞쪽 작업에서 죽으면 아무 기록도 안 남는다');
check('판 종료(endNightlyRun)가 블록 «맨 끝» 에 있다',
  /await endNightlyRun\(/.test(B) && B.lastIndexOf('endNightlyRun') > B.lastIndexOf('markNightlyStep'),
  '종료 기록이 없거나 중간에 있다 — «끝까지 갔다» 를 증명하지 못한다');

console.log('\n[ B. 모든 작업이 단계 표시를 남긴다 — 하나라도 빠지면 그 구간이 사각지대 ]');
function checkStepCoverage(B, label, runVar, tailTags) {
  /* try 개수(= 작업 수)와 표시 개수가 같아야 한다. 「대충 몇 개 이상」으로 두면
     작업을 새로 넣고 표시를 빠뜨려도 초록불이 된다. */
  const tries = (B.match(/\n\s{8,10}try \{/g) || []).length;
  const marks = (B.match(/markNightlyStep\(/g) || []).length;
  check(`${label}: 작업 ${tries}개에 표시 ${marks}개 — 하나도 안 빠졌다`, tries > 0 && tries === marks,
    `try ${tries}개인데 표시가 ${marks}개다. 새 작업을 넣었으면 그 뒤에도 markNightlyStep 을 붙일 것`);
  /* 🔴 개수만 세면 «어디에 있는가» 를 못 본다. 실제로 표시 16개가 전부 catch 블록 «안» 에
     들어간 채로 이 검사가 초록불이었다(2026-08-31 trap-check 가 잡음). catch 안에 있으면
     정상적인 밤에는 기록이 한 줄도 안 남고, 남은 기록의 뜻도 «그 작업이 에러를 던졌다» 로
     뒤집힌다. 그래서 catch 블록을 «중괄호 짝» 으로 잘라 그 안에 표시가 없는지 본다. */
  const inCatch = [];
  {
    const lines = B.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const at = lines[i].indexOf('} catch');
      if (at < 0) continue;
      /* ⚠️ 그 줄부터 통째로 세면 안 된다 — `} catch (err) {` 는 그 줄 안에서 다시 0 이 되어
         본문을 한 줄도 안 보고 멈춘다(처음에 그렇게 짜서 이 검사가 헛돌았다).
         catch 의 여는 중괄호부터 센다. */
      let d = 0;
      for (const c of lines[i].slice(at + 1)) { if (c === '{') d++; else if (c === '}') d--; }
      for (let j = i + 1; j < lines.length && d > 0; j++) {
        if (/markNightlyStep/.test(lines[j])) inCatch.push(j + 1);
        for (const c of lines[j]) { if (c === '{') d++; else if (c === '}') d--; }
      }
    }
  }
  check(`${label}: 표시가 catch 블록 «밖» 에 있다 — 성공한 작업만 남긴다`, inCatch.length === 0,
    'catch 안에 있는 표시: 블록 내 ' + inCatch.join(',') + '번째 줄.\n'
    + '       그러면 정상적인 밤에는 기록이 한 줄도 안 남고, 남은 것의 뜻은 «끝났다» 가 아니라 «에러가 났다» 다');

  const tags = [...B.matchAll(new RegExp(`markNightlyStep\\(env as any, ${runVar}, '([\\w-]+)'\\)`, 'g'))].map((m) => m[1]);
  check(`${label}: 표시 이름이 전부 다르다(로그 꼬리표 기준)`, tags.length > 0 && new Set(tags).size === tags.length,
    '같은 이름이 둘 이상이면 «어디서 죽었는지» 를 가릴 수 없다: ' + tags.join(','));
  /* 꼬리 두 개를 콕 집어 확인한다. auto-schedule 은 월요일에만 도는 «진짜 마지막» 이라
     growth-snapshot 만 보면 월요일 밤의 꼬리가 사각지대로 남는다. */
  check(`${label}: 꼬리 작업(${tailTags.join('·')})까지 표시가 있다`,
    tailTags.every((t) => tags.includes(t)),
    '꼬리 작업에 표시가 없으면 «뒤가 잘렸는지» 를 영영 모른다');
}
checkStepCoverage(B, '03시', '_nightly', ['growth-snapshot', 'auto-schedule']);

/* 🌙 (2026-09-04) 09시 블록 — learning-snapshot 을 여기로 옮기면서 계측을 붙였다.
   ⛔ 이 절을 지우지 말 것. 지우면 그 블록이 다시 «아무도 재지 않는 곳» 이 된다.
   ⚠️ 꼬리는 learning-snapshot 이다(순서: billing → briefing → snapshot).
      그 순서는 «잘려도 돈이 나가는 쪽이 아니라 꼬리가 잘리도록» 일부러 둔 것이다. */
{
  const M = blockOf('0 0 * * *');
  check('09시 블록을 찾았다', M.length > 500, "cronIs('0 0 * * *') 블록이 없다 — 구조가 바뀌었나?");
  check('09시: 판 시작이 블록 «맨 앞» 에 있다',
    /const _morning = await beginNightlyRun\(/.test(M)
    && M.indexOf('beginNightlyRun') < M.indexOf('markNightlyStep'),
    '시작 기록이 없거나 작업들 뒤에 있다');
  check('09시: 판 종료가 블록 «맨 끝» 에 있다',
    /await endNightlyRun\(/.test(M) && M.lastIndexOf('endNightlyRun') > M.lastIndexOf('markNightlyStep'),
    '종료 기록이 없거나 중간에 있다');
  checkStepCoverage(M, '09시', '_morning', ['learning-snapshot']);
}

console.log('\n[ C. 기록이 실패해도 야간 작업은 계속된다 — 감시가 감시 대상을 죽이면 안 된다 ]');
{
  const modRaw = readFileSync(join(SRC, 'nightly-run.ts'), 'utf8');
  const mod = strip(modRaw);   // 부정 검사는 «주석 벗긴 사본» 으로 — 안 그러면 자기 설명 주석을 잡는다
  /* ⚠️ «쓰기가 try 안인가» 를 문자열로 재려다 거짓 양성을 두 번 냈다 — 브레이스를 세는 것으로는
     객체 리터럴의 여는 중괄호와 블록의 여는 중괄호를 가를 수 없다(2026-08-31).
     그 계약은 D절에서 «전부 던지는 DB» 를 넣어 실제로 확인한다. 여기서 낱말 대조를 하지 않는다. */
  check('내보낸 함수가 3종이다(시작·단계·종료)',
    (modRaw.match(/export async function /g) || []).length === 3,
    '함수가 늘거나 줄면 index.ts 배선과 짝이 안 맞는다');
  check('새 표를 만들지 않고 기존 키-값 표를 쓴다',
    /from '\.\/corpcard-sync'/.test(mod) && !/CREATE TABLE/.test(mod),
    '표를 새로 만들면 스키마가 또 하나 늘어난다 — metaSet/metaGet 을 쓸 것');
}

console.log('\n[ D. 실제로 돌려 본다 — «중간에 죽은 판» 을 다음 판이 알아채는가 ]');
{
  /* 문자열 검사만으로는 «알아채는가» 를 못 본다. 컴파일해서 가짜 D1 로 실제로 돌린다.
     ⚠️ esbuild 는 bin/ 경로를 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API 를 쓴다. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'nightly-'));
  const out = join(dir, 'm.mjs');
  buildSync({ entryPoints: [join(SRC, 'nightly-run.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  const db = new DatabaseSync(':memory:');
  const env = { DB: {
    exec: (q) => db.exec(q),
    prepare: (q) => ({
      bind: (...a) => ({
        run: async () => { db.prepare(q).run(...a); return { meta: {} }; },
        first: async () => db.prepare(q).get(...a) ?? null,
        all: async () => ({ results: db.prepare(q).all(...a) }),
      }),
      run: async () => { db.prepare(q).run(); return { meta: {} }; },
      first: async () => db.prepare(q).get() ?? null,
      all: async () => ({ results: db.prepare(q).all() }),
    }),
  } };

  const errs = [];
  const realErr = console.error, realLog = console.log;
  console.error = (...a) => errs.push(a.join(' '));
  console.log = () => {};

  // ① 정상적으로 끝까지 간 판
  const run = await M.beginNightlyRun(env, '0 18 * * *');
  await M.markNightlyStep(env, run, 'retention');
  await M.markNightlyStep(env, run, 'growth-snapshot');
  await M.endNightlyRun(env, run);
  const okRow = db.prepare("SELECT v FROM corpcard_meta WHERE k='nightly:0 18 * * *:last_ok'").get();

  // ② 다음 판 — 앞 판이 «끝까지 갔으므로» 경고가 없어야 한다
  const before = errs.length;
  await M.beginNightlyRun(env, '0 18 * * *');
  const quiet = errs.length === before;

  // ③ 중간에 죽은 판을 그대로 만든다(격리 종료 = endNightlyRun 이 못 불린 상태).
  //    31분 전에 시작한 것으로 두어 «지금 돌고 있는 판» 과 구분되게 한다
  const dead = JSON.stringify({ cron: '0 18 * * *', startedAt: Date.now() - 31 * 60000,
    step: 'absence-sweep', steps: [] });
  db.prepare("UPDATE corpcard_meta SET v=? WHERE k='nightly:0 18 * * *:run'").run(dead);
  const before2 = errs.length;
  await M.beginNightlyRun(env, '0 18 * * *');
  const noticed = errs.slice(before2).join('\n');

  // ④ 오래 걸리면 미리 경고 — 벽시계 15분을 넘기기 «전에» 알아야 한다
  const before3 = errs.length;
  const slow = await M.beginNightlyRun(env, '0 18 * * *');
  slow.startedAt = Date.now() - 11 * 60000;
  await M.markNightlyStep(env, slow, 'cafe24-sync');
  await M.endNightlyRun(env, slow);
  const warned = errs.slice(before3).some((e) => /넘겼습니다/.test(e));

  console.error = realErr; console.log = realLog;

  check('끝까지 간 판은 요약(last_ok)을 남긴다', !!okRow && JSON.parse(okRow.v).steps.length === 2,
    '완주 기록이 없으면 «평소 몇 분 걸리는지» 기준선이 안 생긴다');
  check('정상 판 다음에는 경고를 내지 않는다', quiet,
    '매일 경고가 뜨면 진짜 사고 때 아무도 안 본다');
  check('중간에 죽은 판을 다음 판이 알아챈다', /끝까지 가지 못했습니다/.test(noticed),
    '이 검사가 이 모듈의 존재 이유다 — 죽어도 아무도 모르는 상태로 되돌아간 것');
  check('어디까지 갔었는지(마지막 단계)를 함께 알려 준다', /absence-sweep/.test(noticed),
    '«죽었다» 만으로는 어느 작업이 범인인지 모른다');
  check('벽시계 한도(15분)에 닿기 전에 미리 경고한다', warned,
    '넘긴 뒤에 알면 이미 뒤 작업이 잘린 뒤다');

  /* ⑤ 기록이 «전부 실패하는» DB 를 넣어도 세 함수 모두 던지지 않아야 한다.
     감시 장치가 감시 대상(야간 작업 16개)을 죽이면 안 된다 — 이 계약이 깨지면
     D1 이 잠깐 흔들리는 밤에 그날 야간 배치가 통째로 멈춘다.
     판 시작이 실패해 null 이 넘어오는 경우까지 함께 확인한다. */
  const boom = { DB: {
    exec: () => { throw new Error('D1 down'); },
    prepare: () => { throw new Error('D1 down'); },
  } };
  const rE = console.error, rW = console.warn, rL = console.log;
  console.error = () => {}; console.warn = () => {}; console.log = () => {};
  let threw = null;
  try {
    const r = await M.beginNightlyRun(boom, '0 18 * * *');
    await M.markNightlyStep(boom, r, 'retention');
    await M.endNightlyRun(boom, r);
    await M.markNightlyStep(boom, null, 'retention');
    await M.endNightlyRun(boom, null);
  } catch (e) { threw = e; }
  console.error = rE; console.warn = rW; console.log = rL;
  check('D1 이 전부 실패해도 기록 함수가 던지지 않는다', threw === null,
    '던진 예외: ' + (threw && threw.message) + ' — 기록이 야간 배치를 죽인다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 nightly_run_record_harness 실패'); process.exit(1); }
console.log('🎉 nightly_run_record_harness — 전부 통과');

/**
 * ai_write_guard_harness.mjs — AI 영작 첨삭 «실패 몰림» 문자 감시 (2026-11-11)
 * ════════════════════════════════════════════════════════════════════════
 *  왜: 엘리더잼 «수정본이 원문과 똑같고 75점» — 실패가 성공처럼 꾸며져 몇 주간 아무도 몰랐다.
 *      고친 뒤엔 실패가 ai_failure_log('write-correct')에 남지만 읽는 곳이 없어 또 모를 수 있다.
 *      사장님 「실패 알림 만들어줘」 → 15분 감시견이 세어 문자.
 *  정본: cloudflare-deploy/src/ai-write-guard.ts  ·  배선: api-uptime.ts runSiteWatchdog
 *
 *  A. 상태가 바뀔 때만 문자 — 3건↑ 첫 감지 1통 · 계속이면 침묵 · 1~2건은 침묵(오락가락 방지) · 0건이면 «정상» 1통
 *  B. 절대 던지지 않는다 — 표 없음(=실패 0) · 다른 DB 오류(=모름, 문자 없음) · KV·문자 고장
 *  C. 세는 범위가 맞다 — 'write-correct' 만 · 최근 1시간만(실제 행을 넣어 센다) · 문자 종류 'ai-write' · 학생 글 없음
 *  D. 배선 — 감시견이 .catch 로 부르고 결과를 돌려준다 · 첨삭이 남기는 feature 이름과 감시가 세는 이름이 같다
 *  E. 변이시험 — 정본을 고장 내면 위 검사가 실제로 FAIL 나는가
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const GUARD = readFileSync(join(SRC, 'ai-write-guard.ts'), 'utf8');
const UPTIME = readFileSync(join(SRC, 'api-uptime.ts'), 'utf8');
const WRITING = readFileSync(join(SRC, 'api-ai-writing.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`);
}

// ── 정본 적재: 타입 제거 + solapi-client 대신 가짜 문자(보낸 것을 기록) ──
const TMP = mkdtempSync(join(tmpdir(), 'awg-'));
writeFileSync(join(TMP, 'fake-sms.mjs'), `export const SENT = []; export let MODE = { throws: false };
export async function sendPlainSms(env, phone, text, opts) { if (MODE.throws) throw new Error('sms down'); SENT.push({ phone, text, kind: opts && opts.kind }); return { ok: true }; }`);
const SMS = await import(pathToFileURL(join(TMP, 'fake-sms.mjs')).href);
let seq = 0;
async function load(src) {
  const p = join(TMP, `guard-${++seq}.mjs`);
  writeFileSync(p, stripTypeScriptTypes(src).replace(/from '\.\/solapi-client'/, `from './fake-sms.mjs'`));
  return import(pathToFileURL(p).href);
}

/** 가짜 D1 — 실제 행을 들고 있고, 감시가 보낸 SQL·바인딩으로 «진짜로» 센다(문자열만 보는 검사가 아니다). */
function fakeEnv({ rows = [], writes = 0, noTable = false, dbError = false, kvBroken = false, phone = '01012345678', alerted = false } = {}) {
  const kvMap = new Map(alerted ? [['aiwrite:alerted', '1']] : []);
  const env = {
    OWNER_ALERT_PHONE: phone,
    DB: { prepare(sql) { return { bind(...args) { return { async first() {
      if (/FROM ai_failure_log/.test(sql)) {
        if (noTable) throw new Error('D1_ERROR: no such table: ai_failure_log');
        if (dbError) throw new Error('D1_ERROR: network connection lost');
        const feat = (sql.match(/feature\s*=\s*'([^']+)'/) || [])[1];
        const since = Number(args[0]);
        return { n: rows.filter((r) => r.feature === feat && r.created_at >= since).length };
      }
      if (/FROM ai_writing_corrections/.test(sql)) return { n: writes };
      return null;
    } }; } }; } },
    SESSION_STATE: kvBroken
      ? { get: () => { throw new Error('kv down'); }, put: () => { throw new Error('kv down'); }, delete: () => { throw new Error('kv down'); } }
      : { get: async (k) => kvMap.get(k) ?? null, put: async (k, v) => { kvMap.set(k, v); }, delete: async (k) => { kvMap.delete(k); } },
  };
  return { env, kvMap };
}
const now = Date.now();
const fails = (n, ago = 5 * 60 * 1000, feature = 'write-correct') => Array.from({ length: n }, () => ({ feature, created_at: now - ago }));

async function sectionA(M, quiet = false) {
  const bad = [];
  const t = (name, cond, extra) => { if (!cond) bad.push(name); if (!quiet) check(name, cond, extra); };
  SMS.SENT.length = 0;
  const a1 = fakeEnv({ rows: fails(3), writes: 7 });
  const r1 = await M.checkWriteCorrectFailures(a1.env);
  t('A1 최근 1시간 3건 실패 → 문자 1통 · failing · 표시 남김', r1.state === 'failing' && SMS.SENT.length === 1 && a1.kvMap.get('aiwrite:alerted') === '1');
  t('A2 문자에 숫자(3건·성공 7건)가 있고 «다시 눌러 주세요» 상황을 말한다', SMS.SENT[0] && /3건/.test(SMS.SENT[0].text) && /성공 7건/.test(SMS.SENT[0].text));
  const r2 = await M.checkWriteCorrectFailures(a1.env);
  t('A3 다음 15분에도 실패 중이면 또 보내지 않는다(스팸 방지)', r2.state === 'failing' && SMS.SENT.length === 1);
  SMS.SENT.length = 0;
  const a4 = fakeEnv({ rows: fails(2), alerted: true });
  await M.checkWriteCorrectFailures(a4.env);
  t('A4 알린 뒤 1~2건으로 줄면 조용히 둔다(오락가락 문자 방지) · 표시 유지', SMS.SENT.length === 0 && a4.kvMap.has('aiwrite:alerted'));
  const a5 = fakeEnv({ rows: [], alerted: true });
  const r5 = await M.checkWriteCorrectFailures(a5.env);
  t('A5 0건이 되면 «정상» 문자 1통 · 표시 지움', r5.state === 'ok' && SMS.SENT.length === 1 && /정상/.test(SMS.SENT[0].text) && !a5.kvMap.has('aiwrite:alerted'));
  SMS.SENT.length = 0;
  await M.checkWriteCorrectFailures(fakeEnv({ rows: fails(2) }).env);
  await M.checkWriteCorrectFailures(fakeEnv({ rows: [] }).env);
  t('A6 2건 이하(알린 적 없음) · 0건(알린 적 없음)은 아무 문자 없음', SMS.SENT.length === 0);
  return bad;
}

console.log('\nA. 상태가 바뀔 때만 문자');
const M = await load(GUARD);
await sectionA(M);

console.log('\nB. 절대 던지지 않는다');
SMS.SENT.length = 0;
let threw = false, r;
try { r = await M.checkWriteCorrectFailures(fakeEnv({ noTable: true }).env); } catch { threw = true; }
check('B1 ai_failure_log 표가 아직 없음 = 실패 0건 → ok, 문자 없음', !threw && r.state === 'ok' && r.failures === 0 && SMS.SENT.length === 0);
const b2 = fakeEnv({ dbError: true, alerted: true });
try { r = await M.checkWriteCorrectFailures(b2.env); } catch { threw = true; }
check('B2 그 밖의 DB 오류 = «모름» → 문자 없음 · «정상» 이라고도 안 함 · 표시 그대로', !threw && r.state === 'unknown' && SMS.SENT.length === 0 && b2.kvMap.has('aiwrite:alerted'));
try { r = await M.checkWriteCorrectFailures(fakeEnv({ rows: fails(5), kvBroken: true }).env); } catch { threw = true; }
check('B3 KV 가 통째로 던져도 던지지 않는다', !threw && r.state === 'failing');
SMS.MODE.throws = true;
try { r = await M.checkWriteCorrectFailures(fakeEnv({ rows: fails(5) }).env); } catch { threw = true; }
SMS.MODE.throws = false;
check('B4 문자 발송이 던져도 던지지 않는다 · smsSent=false', !threw && r.smsSent === false);
SMS.SENT.length = 0;
try { r = await M.checkWriteCorrectFailures(fakeEnv({ rows: fails(5), phone: '' }).env); } catch { threw = true; }
check('B5 사장님 번호가 없으면 보내지 않는다', !threw && SMS.SENT.length === 0);
for (const bad of [null, undefined, {}, { DB: null }, { SESSION_STATE: {} }]) {
  try { r = await M.checkWriteCorrectFailures(bad); } catch { threw = true; }
}
check('B6 env 가 비었거나 이상해도 «모름» 으로 돌아온다', !threw && r.state === 'unknown');

console.log('\nC. 세는 범위');
SMS.SENT.length = 0;
const c1 = fakeEnv({ rows: [...fails(2), ...fails(5, 2 * 60 * 60 * 1000), ...fails(5, 60 * 1000, 'chat-friend')] });
r = await M.checkWriteCorrectFailures(c1.env);
check('C1 2시간 전 실패·다른 기능(chat-friend) 실패는 안 센다 (실제 행으로 센 값 2)', r.failures === 2 && SMS.SENT.length === 0);
r = await M.checkWriteCorrectFailures(fakeEnv({ rows: fails(3, 59 * 60 * 1000) }).env);
check('C2 59분 전 실패까지는 센다', r.failures === 3);
check('C3 문자 종류는 ai-write(음소거 예외 목록에 있는 이름)', SMS.SENT.length === 1 && SMS.SENT[0].kind === 'ai-write');
check('C4 문자에 학생 글·이름이 들어갈 자리가 없다(숫자만)', !/\$\{[^}]*(text|name|student|original)/i.test(GUARD));

console.log('\nD. 배선');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const up = strip(UPTIME);
check('D1 감시견이 import 하고 .catch 로 감싸 부른다', /import \{ checkWriteCorrectFailures \} from '\.\/ai-write-guard'/.test(up) && /await checkWriteCorrectFailures\(env\)\.catch\(\(\) => undefined\)/.test(up));
check('D2 감시견 결과에 aiWrite 가 실린다', /return \{[^}]*\baiWrite\b[^}]*\}/.test(up));
const featWrite = (strip(WRITING).match(/recordAiFailure\(env, \{ feature: '([^']+)'/) || [])[1];
const featGuard = (GUARD.match(/feature = '([^']+)'/) || [])[1];
check(`D3 첨삭이 남기는 이름(${featWrite})과 감시가 세는 이름(${featGuard})이 같다`, !!featWrite && featWrite === featGuard);

console.log('\nE. 변이시험');
const mutants = [
  ['«이미 알렸으면 안 보냄» 제거(15분마다 스팸)', GUARD.replace('if (failures >= AW_FAIL_ALERT_MIN && !alerted) {', 'if (failures >= AW_FAIL_ALERT_MIN) {')],
  ['«0건일 때만 정상» → «기준 미만이면 정상»(오락가락)', GUARD.replace('} else if (failures === 0 && alerted) {', '} else if (failures < AW_FAIL_ALERT_MIN && alerted) {')],
  ['기준을 1건으로', GUARD.replace('export const AW_FAIL_ALERT_MIN = 3;', 'export const AW_FAIL_ALERT_MIN = 1;')],
  ['정상 문자 뒤 표시를 안 지움', GUARD.replace("try { await kv.delete(AW_ALERT_KEY); }", 'try { }')],
];
for (const [name, src] of mutants) {
  if (src === GUARD) { check(`E 변이 «${name}» 적용됨`, false, '치환 대상 못 찾음 — 정본이 바뀌었으면 하니스도 맞출 것'); continue; }
  const bad = await sectionA(await load(src), true);
  check(`E 변이 «${name}» → A 가 FAIL 로 잡는다`, bad.length > 0);
}
const featMut = await load(GUARD.replace("feature = 'write-correct'", "feature = 'write_correct'"));
r = await featMut.checkWriteCorrectFailures(fakeEnv({ rows: fails(3) }).env);
check('E 변이 «세는 이름 오타» → 실패를 못 센다(C1·D3 이 지키는 자리)', r.failures === 0);

/* F. 끝에서 끝까지 — 실제 첨삭 코드가 실패를 남기고 → 실제 감시가 세고 → 실제 문자 함수(음소거 정책 포함)가
      문자 업체로 요청을 낸다. 가짜는 «AI 답» 과 «문자 업체 응답» 둘뿐(DB 는 진짜 SQLite).
      ⚠️ 이름만 맞춰 보는 D3 로는 «남기는 쪽 시각 단위가 초인데 세는 쪽이 밀리초» 같은 어긋남을 못 본다. */
console.log('\nF. 끝에서 끝까지 (실제 첨삭 → 실제 기록 → 실제 감시 → 실제 문자 함수)');
{
  const { DatabaseSync } = await import('node:sqlite');
  const { createRequire } = await import('node:module');
  const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
  const out = join(TMP, 'e2e.mjs');
  buildSync({ stdin: { contents: "export { handleWritingApi } from './api-ai-writing'; export { checkWriteCorrectFailures } from './ai-write-guard';", resolveDir: SRC, loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const E = await import(pathToFileURL(out).href);
  const raw = new DatabaseSync(':memory:');
  const db = {
    prepare(sql) { const st = raw.prepare(sql); const b = (args) => ({
      async first() { return st.get(...args) || null; }, async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } });
      return { ...b([]), bind: (...a) => b(a) }; },
    async exec(sql) { raw.exec(sql); },
  };
  const kv = new Map();
  const env = { DB: db, SESSION_STATE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } },
    AI: { run: async () => ({ response: 'Sorry, I cannot do that.' }) },
    OWNER_ALERT_PHONE: '010-1234-5678', SOLAPI_API_KEY: 'synthetic-key', SOLAPI_API_SECRET: 'synthetic-secret', SOLAPI_FROM_PHONE: '02-123-4567' };
  const sent = [];
  const realFetch = globalThis.fetch, realNow = Date.now, realWarn = console.warn, realErr = console.error;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.solapi.com/')) { sent.push(JSON.parse(init.body).message); return new Response(JSON.stringify({ statusCode: '2000', messageId: 'm1' }), { status: 200 }); }
    throw new Error('unexpected network ' + u);
  };
  console.warn = () => {}; console.error = () => {};
  try {
    const url = new URL('https://mangoi.ai/api/ai/write-correct');
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await E.handleWritingApi(new Request(url, { method: 'POST', body: JSON.stringify({ text: 'I go school yesterday.\nIt was fun.', level: 'A1', uid: '' }) }), url, env);
      statuses.push(res.status);
    }
    const logged = raw.prepare("SELECT COUNT(*) n FROM ai_failure_log WHERE feature='write-correct'").get().n;
    check('F1 (전제) 실제 첨삭 3번이 502 로 솔직히 실패하고 ai_failure_log 에 3건 남는다', statuses.every((s) => s === 502) && logged === 3, `${statuses} · ${logged}`);
    const g1 = await E.checkWriteCorrectFailures(env);
    check('F2 실제 감시가 그 3건을 세어 failing', g1.state === 'failing' && g1.failures === 3);
    check('F3 실제 문자 함수가 음소거를 지나 문자 업체로 1통 보낸다(사장님 번호)', sent.length === 1 && sent[0].to === '01012345678' && /3건/.test(sent[0].text), JSON.stringify(sent));
    await E.checkWriteCorrectFailures(env);
    check('F4 15분 뒤 다시 돌아도 더 안 보낸다', sent.length === 1);
    Date.now = () => realNow() + 61 * 60 * 1000;   // 1시간이 지나 실패가 범위 밖으로
    const g3 = await E.checkWriteCorrectFailures(env);
    check('F5 1시간이 지나 0건이면 «정상» 1통', g3.state === 'ok' && sent.length === 2 && /정상/.test(sent[1].text));
    kv.set('owner_alert_mute', 'all');
    Date.now = realNow;
    raw.exec("DELETE FROM ai_failure_log"); kv.delete('aiwrite:alerted');
    for (let i = 0; i < 3; i++) await E.handleWritingApi(new Request(url, { method: 'POST', body: JSON.stringify({ text: 'I go school yesterday.', level: 'A1', uid: '' }) }), url, env);
    await E.checkWriteCorrectFailures(env);
    check('F6 사장님이 «완전 침묵»(owner_alert_mute=all)이면 이 알림도 안 나간다', sent.length === 2);
  } finally { globalThis.fetch = realFetch; Date.now = realNow; console.warn = realWarn; console.error = realErr; raw.close(); }
}

console.log(`\n${FAIL ? '❌' : '✅'} ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('   ' + FAILS.join('\n   ')); process.exit(1); }

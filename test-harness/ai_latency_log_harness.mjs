/* AI 응답 지연 기록 (A-3) — «학생이 얼마나 기다리는가» 를 실제로 남기는가.
 *
 * [왜 있나 — 2026-09-11]
 * A.i 친구하기 학생 121명 중 41명(34%)이 딱 한 턴만 하고 나갑니다(D1 실측).
 * 그것이 «느려서» 인지 가리려면 지연을 재야 하는데, 재는 곳이 한 군데도 없었습니다.
 * ⛔ Workers 로그는 head_sampling_rate = 0.05 라 20번 중 19번이 버려집니다.
 * ⛔ warmup_session_log.first_reply_at 은 «학생이 첫마디를 뗀» 시각(사람 반응 시간)이라
 *    지연이 아닙니다 — 그것을 지연으로 읽는 것이 이 검사가 막으려는 오독입니다.
 *
 * 이 검사는 «그 줄이 있는가» 로 묻지 않습니다 — 정본을 **가짜 D1 로 실제로 돌려**
 * 무엇이 INSERT 되는지 봅니다(문자열 검사로는 «무슨 값이 들어가는가» 를 못 봅니다).
 */
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../cloudflare-deploy/src/ai-latency-log.ts', import.meta.url), 'utf8');
const API = readFileSync(new URL('../cloudflare-deploy/src/api-ai.ts', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/** 여는 중괄호부터 «짝이 맞는» 닫는 중괄호까지. ⚠️ 길이로 자르면 옆 블록이 딸려 옵니다. */
function blockAt(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}
/** 주석을 벗겨 낸 사본 — 부정 검사는 반드시 이것으로 판정합니다(자기 주석을 잡습니다). */
function strip(t) {
  let out = '', inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = l.indexOf('/*');
      if (b < 0) break;
      const e = l.indexOf('*/', b + 2);
      if (e < 0) { l = l.slice(0, b); inBlock = true; break; }
      l = l.slice(0, b) + l.slice(e + 2);
    }
    l = l.replace(/^[ \t]*\/\/.*$/, '');
    out += l + '\n';
  }
  return out;
}

/* ── 정본을 «실제로» 돌리기 위한 타입 제거 ──────────────────────────────────
   ⛔ 타입 이름을 하나씩 적어 지우지 마세요 — 정본에 새 타입이 생기면 검사가 조용히
      사라집니다(이 저장소에서 실제로 5건이 그렇게 없어졌습니다). «자리» 로 지웁니다. */
function toJs(ts) {
  return ts
    .replace(/^export type [\s\S]*?^};$/gm, '')          // type 선언 블록
    .replace(/:\s*Promise<[^>]*>/g, '')                   // 반환 타입
    .replace(/\(env:\s*any,\s*f:\s*AiLatency\)/g, '(env, f)')
    .replace(/\(v:\s*any\)/g, '(v)')
    .replace(/:\s*number(?=\s*[){=,])/g, '')
    .replace(/^export /gm, '');
}

console.log('\n① 정본을 실제로 돌린다 — 무엇이 INSERT 되는가');

const js = toJs(SRC);
let mod = null;
try {
  mod = await import('data:text/javascript;base64,' + Buffer.from(js + '\nexport { recordAiLatency };').toString('base64'));
} catch (e) {
  ok('정본을 오려 내 실행할 수 있다', false, String(e && e.message));
}
ok('정본을 오려 내 실행할 수 있다 (전제)', !!(mod && mod.recordAiLatency));

/** 가짜 D1 — prepare/bind/run 두 층 모두에 응답을 둡니다.
 *  ⚠️ bind 아래에만 두면 .bind() 없는 질의에서 예외가 나고, 그러면 «안 남는다» 가
 *     정답인 검사들이 전부 거짓 통과합니다(CLAUDE.md 2장). */
function fakeDB() {
  const calls = [];
  const mk = (sql) => ({
    bind: (...args) => { calls.push({ sql, args }); return { run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; },
    run: async () => { calls.push({ sql, args: null }); return {}; },
    first: async () => null,
  });
  return { env: { DB: { prepare: (sql) => mk(sql) } }, calls };
}

if (mod && mod.recordAiLatency) {
  const { env, calls } = fakeDB();
  await mod.recordAiLatency(env, {
    feature: 'chat-friend', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ms: 1234, model_ms: 1100, tries: 2, chars: 87, level: 'S3', rf: 1, ok: 1,
  });
  const ins = calls.find(c => /INSERT INTO ai_latency_log/.test(c.sql));
  const cre = calls.find(c => /CREATE TABLE IF NOT EXISTS ai_latency_log/.test(c.sql));
  ok('표를 런타임에 만든다 (CREATE TABLE IF NOT EXISTS)', !!cre);
  ok('한 줄을 INSERT 한다', !!ins);
  if (ins) {
    ok('ms 를 그대로 남긴다', ins.args[2] === 1234, String(ins.args[2]));
    ok('model_ms 를 «따로» 남긴다 (우리 코드가 쓴 시간을 뺄 수 있게)', ins.args[3] === 1100, String(ins.args[3]));
    ok('tries 를 남긴다 (폴백이 몇 번 돌았나)', ins.args[4] === 2, String(ins.args[4]));
    ok('답변 «길이» 를 남긴다', ins.args[5] === 87, String(ins.args[5]));
    /* ⛔ 본문 유출 방지 — 이 표는 진단용이지 개인정보를 담는 곳이 아닙니다. */
    const joined = ins.args.map(a => String(a)).join('\u0001');
    ok('학생 발화·답변 «본문» 이 인자에 없다', !/Hi there|dinosaur|안녕/.test(joined));
    ok('INSERT 인자 수 = 자리표시자 수', (ins.sql.match(/\?/g) || []).length === ins.args.length,
       `${(ins.sql.match(/\?/g) || []).length} vs ${ins.args.length}`);
  }

  /* ⚠️ «모름» 은 0 이 아닙니다 — 0 으로 적으면 못 잰 것이 «가장 빠른 것» 으로 뒤집혀
     이 표를 만든 이유가 통째로 사라집니다(규칙서 2장 「0 으로 적지 마세요」). */
  const b = fakeDB();
  await mod.recordAiLatency(b.env, { feature: 'x', model: 'm', ms: -5, model_ms: NaN, tries: 0, chars: 0, rf: 0, ok: 0 });
  const ins2 = b.calls.find(c => /INSERT INTO ai_latency_log/.test(c.sql));
  ok('음수 ms 는 «모름»(-1) 으로 (0 아님)', ins2 && ins2.args[2] === -1, ins2 && String(ins2.args[2]));
  ok('NaN model_ms 도 «모름»(-1) 으로', ins2 && ins2.args[3] === -1, ins2 && String(ins2.args[3]));

  /* DB 가 없으면 조용히 넘어갑니다 — 기록이 대화를 죽이면 안 됩니다. */
  let threw = false;
  try { await mod.recordAiLatency({}, { feature: 'x', model: 'm', ms: 1, model_ms: 1, tries: 1, chars: 1, rf: 1, ok: 1 }); }
  catch { threw = true; }
  ok('DB 가 없어도 던지지 않는다', !threw);
}

console.log('\n② 배선 — chat-friend 가 실제로 부르는가');

const S = strip(API);
ok('정본을 import 한다', /import \{ recordAiLatency \} from '\.\/ai-latency-log'/.test(S));

const hIdx = S.indexOf("path === '/api/ai/chat-friend'");
ok('chat-friend 핸들러를 찾았다 (전제)', hIdx > 0);
const handler = hIdx > 0 ? blockAt(S, S.indexOf('{', hIdx)) : '';
ok('핸들러를 중괄호 짝으로 잘라 냈다 (전제)', handler.length > 2000, String(handler.length));

ok('핸들러 안에서 recordAiLatency 를 부른다', /recordAiLatency\(/.test(handler));
/* ⛔ 기록이 대화를 막으면 안 됩니다 — 그 호출이 try 블록 «범위 안» 인지 위치로 봅니다.
   ⚠️ «근처에 catch 가 있나» 로 물으면 바깥 try 를 통째로 지워도 통과합니다(실측). */
const callAt = handler.indexOf('recordAiLatency(');
let guarded = false;
for (let i = 0; i < handler.length && i < callAt; i++) {
  if (handler.startsWith('try {', i)) {
    const blk = blockAt(handler, handler.indexOf('{', i));
    if (i + blk.length > callAt) { guarded = true; break; }
  }
}
ok('그 호출이 try 블록 «안» 에 있다', guarded);

/* ⏱ 시각 기준점이 «핸들러 시작» 에 있어야 학생이 기다린 시간이 됩니다.
   모델 호출 직전에 두면 우리 코드가 쓴 시간이 통째로 빠집니다. */
const t0At = handler.indexOf('const latT0 = Date.now()');
const aiRunAt = handler.indexOf('env.AI.run(');
ok('계측 시작이 모델 호출보다 «앞» 이다', t0At > 0 && aiRunAt > 0 && t0At < aiRunAt);

/* 폴백(실패) 턴도 남겨야 «느린 턴이 곧 실패 턴인가» 를 볼 수 있습니다. */
/* ⚠️ 범위를 «길이» 로 자르면 바로 뒤의 return json({... reply ...}) 가 딸려 들어와
   「본문을 안 넘긴다」가 거짓 FAIL 납니다(이 검사를 처음 쓸 때 실제로 밟았습니다).
   호출의 «괄호 짝» 으로 자릅니다. */
function argsOf(src, callIdx) {
  const open = src.indexOf('(', callIdx);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') d++;
    else if (src[i] === ')') { d--; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}
const callBlock = callAt > 0 ? argsOf(handler, callAt) : '';
ok('그 호출의 인자를 괄호 짝으로 잘라 냈다 (전제)', callBlock.length > 80 && callBlock.length < 600, String(callBlock.length));
ok('성공/실패를 ok 칸으로 가른다', /ok:\s*usedFallback \? 0 : 1/.test(callBlock));
ok('모델 호출 횟수를 latTries 로 넘긴다', /tries:\s*latTries/.test(callBlock));
ok('답변 «길이» 만 넘긴다 (본문 아님)', /chars:\s*\(reply \|\| ''\)\.length/.test(callBlock));
/* ⛔ 본문을 싣는 회귀 방지 — reply 그대로를 넘기면 안 됩니다. */
ok('reply 본문을 인자로 넘기지 않는다', !/\breply,/.test(callBlock) && !/content:\s*reply/.test(callBlock));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

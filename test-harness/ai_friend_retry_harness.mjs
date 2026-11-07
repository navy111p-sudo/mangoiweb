/* AI 영어친구 — 모델이 «전부» 실패한 턴을 같은 요청 안에서 한 번 더 시도하는가.
 *    AI friend — does the server retry a turn once when every model failed?
 *
 * [왜 있나 — 2026-11-04 사장님 「자동 재시도 기능 만들어서 PR 올려줘」]
 *   사장님 화면에 「⚠️ 지금은 답을 만들지 못했어요. 잠시 뒤 다시 보내 주세요.」가 떴고, 바로 다음 턴은
 *   정상이었습니다(«잠깐» 의 실패). 정본 src/friend-retry.ts 가 잠깐 기다렸다 모델 목록을 한 번 더 돕니다.
 *
 * 무엇을 «실제로 돌려» 보나
 *   A. 정본(friend-retry.ts)을 타입만 벗겨 그대로 실행 — 예산·순서·멈춤·던지지 않음
 *   B. api-ai.ts 의 배선 블록을 «오려 내» 가짜 모델로 실행 — 살아난 답이 그대로 쓰이는가,
 *      정상 턴은 안 건드리는가(짝), 기록에 발화·답변이 안 실리는가
 *   C. 자리 — 첫 시도 «뒤», 교정·같은 질문 다시 뽑기·폴백 «앞»
 *
 * ⚠️ 문자열만 보는 검사는 «조건 뒤집기» 를 못 잡습니다(CLAUDE.md 2장) — 그래서 A·B 는 전부 실행입니다.
 * ℹ️ 파일을 쓰지 않습니다(동시 실행 안전 — data: URL 로 불러옵니다).
 */
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const SRC_RETRY = readFileSync(new URL('../cloudflare-deploy/src/friend-retry.ts', import.meta.url), 'utf8');
const SRV = readFileSync(new URL('../cloudflare-deploy/src/api-ai.ts', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/** 여는 중괄호부터 «짝이 맞는» 닫는 중괄호까지(길이로 자르면 옆 블록이 딸려 옵니다). */
function blockAt(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return { text: src.slice(openIdx, i + 1), end: i + 1 }; }
  }
  return { text: '', end: -1 };
}
/** 블록주석·줄주석을 벗긴 사본(부정 검사용 — 자기 설명 주석을 잡지 않게). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ───────────────────────── A. 정본 실행 ───────────────────────── */
console.log('\nA. 정본 friend-retry.ts 를 실제로 돌린다');

let R = null;
try {
  const js = stripTypeScriptTypes(SRC_RETRY);
  R = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
} catch (e) { console.log('  (불러오기 실패: ' + (e && e.message) + ')'); }
ok('전제: 정본을 불러왔다', !!(R && typeof R.retryFriendModels === 'function' && typeof R.friendRetryAllowed === 'function'));
ok('전제: 정본은 import 가 없다(그대로 실행 가능)', !/^\s*import\s/m.test(SRC_RETRY));

if (R) {
  const { friendRetryAllowed: allow, retryFriendModels: retry, FRIEND_RETRY_BUDGET_MS: B, FRIEND_RETRY_DELAY_MS: D } = R;
  ok('전제: 예산·대기 상수가 숫자다', Number.isFinite(B) && Number.isFinite(D) && B > 0 && D > 0, 'B=' + B + ' D=' + D);
  ok('대기는 예산보다 짧다(안 그러면 한 번도 못 부른다)', D < B, 'D=' + D + ' B=' + B);

  // A-1 예산 경계 — 앞뒤를 실제로 넣어 봅니다(조건 뒤집기·상수 부풀리기를 잡습니다).
  ok('A-1 0ms 는 된다', allow(0) === true);
  ok('A-1 예산 그 값은 된다', allow(B) === true);
  ok('A-1 예산 +1ms 는 안 된다', allow(B + 1) === false);
  ok('A-1 훨씬 넘으면 안 된다', allow(B * 3) === false);
  for (const bad of [NaN, -1, undefined, null, '100', Infinity]) {
    ok('A-1 모르면 안 한다(' + String(bad) + ')', allow(bad) === false);
  }

  // 가짜 시계·대기 — 무엇이 어떤 순서로 일어났나 기록합니다.
  const mk = (o = {}) => {
    const log = [];
    let t = o.t0 ?? 1000;
    const startedAt = o.startedAt ?? 0;
    const base = {
      models: o.models ?? ['m1', 'm2', 'm3'],
      startedAt,
      now: () => t,
      sleep: async (ms) => { log.push('sleep:' + ms); t += ms; },
      call: async (m) => {
        log.push('call:' + m); t += (o.callMs ?? 200);
        const v = (o.answers || {})[m];
        if (v instanceof Error) throw v;
        return { response: v ?? '' };
      },
      take: (r) => { log.push('take'); return String(r && r.response || ''); },
      onError: (m, e) => { log.push('err:' + m); if (o.onErrorThrows) throw new Error('logger down'); },
    };
    return { base, log, get t() { return t; } };
  };

  // A-2 빨리 실패한 턴 — 기다렸다가, 순서대로, 처음 살아난 것에서 멈춘다
  {
    const h = mk({ answers: { m1: new Error('3040 capacity'), m2: 'Hi again!', m3: 'never' } });
    const r = await retry(h.base);
    ok('A-2 살아난 답을 돌려준다', r.reply === 'Hi again!', JSON.stringify(r));
    ok('A-2 어느 모델이 살렸는지 알려 준다', r.model === 'm2');
    ok('A-2 살아나면 거기서 멈춘다(뒤 모델을 안 부른다)', !h.log.includes('call:m3') && r.tried === 2, h.log.join(' '));
    ok('A-2 «기다린 뒤» 부른다(대기가 첫 호출보다 앞)', h.log[0] === 'sleep:' + D && h.log[1] === 'call:m1', h.log.join(' '));
    ok('A-2 모델 순서를 지킨다', h.log.indexOf('call:m1') < h.log.indexOf('call:m2'));
    ok('A-2 던진 모델은 onError 로 알린다', h.log.includes('err:m1'));
    ok('A-2 응답은 반드시 take(정본 파서)를 지난다', h.log.filter(x => x === 'take').length === 1, h.log.join(' '));
    ok('A-2 예산 안에서는 건너뛰었다고 안 한다', r.skipped === '');
  }
  // A-3 빈 답(깨진 JSON)도 «실패» 로 보고 다음 모델로 간다
  {
    const h = mk({ answers: { m1: '', m2: '', m3: 'Third time!' } });
    const r = await retry(h.base);
    ok('A-3 빈 답은 넘기고 다음 모델을 부른다', r.reply === 'Third time!' && r.tried === 3, JSON.stringify(r));
  }
  // A-4 끝내 못 살리면 빈 답 — 부르는 쪽이 예전 안내로 간다
  {
    const h = mk({ answers: { m1: new Error('a'), m2: '', m3: new Error('c') } });
    const r = await retry(h.base);
    ok('A-4 다 실패하면 빈 답', r.reply === '' && r.model === '' && r.tried === 3, JSON.stringify(r));
  }
  // A-5 이미 오래 걸린 턴은 기다리지도 부르지도 않는다(짝: A-2)
  {
    const h = mk({ t0: B - D + 1, answers: { m1: 'x' } });
    const r = await retry(h.base);
    ok('A-5 «기다린 뒤 예산 초과» 면 아예 안 한다', r.skipped === 'budget' && r.tried === 0 && h.log.length === 0, JSON.stringify(r) + ' ' + h.log.join(' '));
  }
  {
    const h = mk({ t0: B - D, answers: { m1: 'Just in time' } });
    const r = await retry(h.base);
    ok('A-5 경계 바로 안쪽이면 한다(짝)', r.reply === 'Just in time', JSON.stringify(r));
  }
  // A-6 다시 도는 중에 예산을 넘으면 거기서 멈춘다(느린 모델 셋을 줄줄이 기다리지 않게)
  {
    const h = mk({ t0: 0, callMs: B, answers: { m1: '', m2: 'too late', m3: 'too late' } });
    const r = await retry(h.base);
    ok('A-6 예산을 넘긴 뒤에는 다음 모델을 안 부른다', r.tried === 1 && !h.log.includes('call:m2'), JSON.stringify(r) + ' ' + h.log.join(' '));
    ok('A-6 한 번이라도 불렀으면 «건너뜀» 이 아니다', r.skipped === '');
  }
  // A-7 절대 던지지 않는다 — 대기·기록·파서가 던져도
  {
    const h = mk({ answers: { m1: new Error('x'), m2: 'ok' }, onErrorThrows: true });
    let r = null, threw = false;
    try { r = await retry(h.base); } catch { threw = true; }
    ok('A-7 기록(onError)이 던져도 계속 간다', !threw && r && r.reply === 'ok', JSON.stringify(r));
  }
  {
    const h = mk({ answers: { m1: 'x' } });
    let r = null, threw = false;
    try { r = await retry({ ...h.base, sleep: async () => { throw new Error('timer'); } }); } catch { threw = true; }
    ok('A-7 대기가 던져도 던지지 않고 빈 답', !threw && r && r.reply === '', JSON.stringify(r));
  }
  {
    const h = mk({ answers: { m1: 'x', m2: 'y' } });
    let r = null, threw = false, n = 0;
    try { r = await retry({ ...h.base, take: () => { if (++n === 1) throw new Error('parse'); return 'parsed'; } }); } catch { threw = true; }
    ok('A-7 파서가 던지면 그 모델만 실패로 보고 다음으로', !threw && r && r.reply === 'parsed' && r.model === 'm2', JSON.stringify(r));
  }
  {
    let r = null, threw = false;
    try { r = await retry({ models: [], startedAt: 0, now: () => 0, sleep: async () => {}, call: async () => 'x', take: () => 'x' }); } catch { threw = true; }
    ok('A-7 모델 목록이 비면 아무것도 안 하고 빈 답', !threw && r && r.reply === '' && r.tried === 0);
  }
}

/* ───────────────────────── B. 배선 실행 ───────────────────────── */
console.log('\nB. api-ai.ts 의 배선을 오려 내 가짜 모델로 돌린다');

ok('B-0 정본을 import 한다', /import\s*\{[^}]*\bretryFriendModels\b[^}]*\}\s*from\s*'\.\/friend-retry'/.test(SRV));
const declIdx = SRV.indexOf('let friendRetry');
const ifIdx = declIdx > 0 ? SRV.indexOf('if (!reply) {', declIdx) : -1;
const ifBlk = ifIdx > 0 ? blockAt(SRV, SRV.indexOf('{', ifIdx)) : { text: '', end: -1 };
const wiring = (declIdx > 0 && ifBlk.end > 0) ? SRV.slice(declIdx, ifBlk.end) : '';
ok('B-0 전제: 배선 블록을 오려 냈다', wiring.length > 100 && wiring.includes('retryFriendModels('), 'len=' + wiring.length);
ok('B-0 전제: 선언과 if 가 붙어 있다(사이에 딴 코드 없음)', declIdx > 0 && ifIdx > 0 && ifIdx - declIdx < 120);

// 첫 시도의 maxTokens·temperature 를 소스에서 읽습니다(재시도도 «같은 조건» 이어야 합니다).
const mainCall = SRV.match(/^[ \t]*const runMainReply = [^\r\n]+/m)?.[0] || '';
const firstCall = /=> run\(model, messages, (\d+), ([\d.]+)\)/.exec(mainCall);
ok('B-0 전제: 첫 시도와 스트리밍이 공통 호출 조건을 쓴다', !!firstCall && SRV.includes('await runMainReply(m);') && SRV.includes('await runMainReply(m, runFriendStreaming);'));

let runWiring = null;
if (wiring) {
  try {
    const wrapped = '(async (ctx) => {\n'
      + '  let reply = ctx.reply, usedModel = ctx.usedModel, lastErr = ctx.lastErr;\n'
      + '  const { models, latT0, runFriend, messages, takeFriendReply, commitFix, recordAiFailure, env,'
      + ' friendRF, friendPlain, friendEmpty, level, retryFriendModels } = ctx;\n'
      + mainCall + '\n' + wiring + '\n'
      + '  return { reply, usedModel, lastErr, friendRetry };\n'
      + '})';
    // ⚠️ 함수로 «감싼 뒤» 타입을 벗깁니다(블록만 벗기면 실패해 검사가 헛돕니다 — CLAUDE.md 2장).
    runWiring = new Function('return ' + stripTypeScriptTypes(wrapped))();
  } catch (e) { console.log('  (배선 변환 실패: ' + (e && e.message) + ')'); }
}
ok('B-0 전제: 배선을 실행할 수 있게 만들었다', typeof runWiring === 'function');

const scenario = async (o) => {
  const calls = [], takes = [], records = [], retryArgs = [];
  let commits = 0;
  const MESSAGES = [{ role: 'system', content: 'S' }, { role: 'user', content: 'Yeah, I really liked it yesterday.' }];
  const ctx = {
    reply: o.reply, usedModel: o.usedModel ?? '', lastErr: o.lastErr ?? null,
    models: ['m1', 'm2', 'm3'], latT0: 5000, messages: MESSAGES,
    env: { DB: {} }, friendRF: true, friendPlain: 0, friendEmpty: 3, level: 'S3',
    runFriend: async (m, msgs, max, temp) => {
      calls.push({ m, msgs, max, temp });
      const v = (o.answers || {})[m];
      if (v instanceof Error) throw v;
      return { response: 'RAW:' + (v ?? '') };
    },
    takeFriendReply: (r) => { takes.push(r); const s = String(r && r.response || ''); return s.startsWith('RAW:') ? s.slice(4) : ''; },
    commitFix: () => { commits++; },
    recordAiFailure: async (env, f) => { records.push(f); if (o.recordThrows) throw new Error('D1 down'); },
    // 진짜 정본을 쓰되 대기·시계만 가짜로(1.5초씩 안 기다리게). 넘겨받은 인자는 기록합니다.
    retryFriendModels: (a) => { retryArgs.push(a); return R.retryFriendModels({ ...a, sleep: async () => {}, now: () => a.startedAt + 100 }); },
  };
  let out = null, threw = null;
  try { out = await runWiring(ctx); } catch (e) { threw = e; }
  return { out, threw, calls, takes, records, retryArgs, commits, MESSAGES };
};

if (runWiring && R) {
  // B-1 첫 시도가 다 실패 → 재시도로 살아남
  {
    const s = await scenario({ reply: '', lastErr: new Error('3040: Capacity temporarily exceeded'), answers: { m1: new Error('again'), m2: 'Did you like it?' } });
    ok('B-1 던지지 않는다', !s.threw, String(s.threw));
    ok('B-1 살아난 답이 그 턴의 답이 된다', s.out && s.out.reply === 'Did you like it?', JSON.stringify(s.out));
    ok('B-1 그 답을 준 모델이 usedModel 이 된다(뒤 교정·다시 뽑기가 그 모델을 쓴다)', s.out && s.out.usedModel === 'm2');
    ok('B-1 교정 후보를 확정한다(commitFix 1회)', s.commits === 1, 'commits=' + s.commits);
    ok('B-1 응답이 정본 파서(takeFriendReply)를 지난다', s.takes.length >= 1 && s.takes.every(t => t && String(t.response).startsWith('RAW:')));
    ok('B-1 같은 대화(messages)로 다시 부른다', s.calls.length >= 1 && s.calls.every(c => c.msgs === s.MESSAGES));
    if (firstCall) {
      ok('B-1 첫 시도와 같은 길이·온도로 부른다', s.calls.every(c => c.max === Number(firstCall[1]) && c.temp === Number(firstCall[2])),
        JSON.stringify(s.calls.map(c => [c.max, c.temp])) + ' vs ' + firstCall[1] + ',' + firstCall[2]);
    }
    ok('B-1 턴 시작 시각(latT0)과 같은 모델 목록을 넘긴다', s.retryArgs.length === 1 && s.retryArgs[0].startedAt === 5000
      && Array.isArray(s.retryArgs[0].models) && s.retryArgs[0].models.join() === 'm1,m2,m3');
    ok('B-1 재시도 중 던진 오류를 lastErr 로 기억한다', s.out && s.out.lastErr && String(s.out.lastErr.message) === 'again');
    const rec = s.records.find(f => f && f.feature === 'chat-friend-rescued');
    ok('B-1 «살아남» 을 실패 기록표에 남긴다(첫 시도 실패가 안 사라지게)', !!rec, JSON.stringify(s.records));
    ok('B-1 그 기록에 학생 발화·AI 답변이 없다',
      !!rec && !JSON.stringify(rec).includes('Did you like it?') && !JSON.stringify(rec).includes('liked it yesterday')
      && !('reply' in rec) && !('msg' in rec), JSON.stringify(rec));
  }
  // B-2 짝 — 첫 시도가 성공한 턴은 아무것도 안 건드린다
  {
    const s = await scenario({ reply: 'You had steak!', usedModel: 'm1', answers: { m1: 'SHOULD NOT' } });
    ok('B-2 정상 턴은 모델을 다시 안 부른다', s.calls.length === 0 && s.retryArgs.length === 0, 'calls=' + s.calls.length);
    ok('B-2 정상 턴의 답·모델이 그대로다', s.out && s.out.reply === 'You had steak!' && s.out.usedModel === 'm1');
    ok('B-2 정상 턴은 기록을 안 남긴다', s.records.length === 0);
    ok('B-2 정상 턴은 교정 확정을 다시 안 한다', s.commits === 0);
  }
  // B-3 끝내 못 살리면 답이 빈 채로 남는다 → 뒤의 폴백(ai_unavailable 안내)이 받는다
  {
    const s = await scenario({ reply: '', answers: { m1: '', m2: new Error('x'), m3: '' } });
    ok('B-3 못 살리면 답은 빈 채다(폴백으로 간다)', !s.threw && s.out && s.out.reply === '' && s.out.usedModel === '', JSON.stringify(s.out));
    ok('B-3 못 살렸으면 «살아남» 기록은 없다(끝내 실패는 폴백 블록이 남긴다)', !s.records.some(f => f && f.feature === 'chat-friend-rescued'));
    ok('B-3 못 살렸으면 교정 확정도 없다', s.commits === 0);
    ok('B-3 재시도 결과를 폴백이 볼 수 있게 남긴다', s.out && s.out.friendRetry && s.out.friendRetry.tried === 3, JSON.stringify(s.out && s.out.friendRetry));
  }
  // B-4 기록이 던져도 살아난 답은 그대로 나간다
  {
    const s = await scenario({ reply: '', recordThrows: true, answers: { m1: 'Still here!' } });
    ok('B-4 기록 실패가 대화를 막지 않는다', !s.threw && s.out && s.out.reply === 'Still here!', String(s.threw) + ' ' + JSON.stringify(s.out));
  }
}

/* ───────────────────────── C. 자리 ───────────────────────── */
console.log('\nC. 자리 — 첫 시도 «뒤», 교정·다시 뽑기·폴백 «앞»');

const loopIdx = SRV.indexOf('for (const m of models) {');
const loopEnd = loopIdx > 0 ? blockAt(SRV, SRV.indexOf('{', loopIdx)).end : -1;
const focusIdx = SRV.indexOf('if (reply && usedModel && immediateFix)');
const repeatIdx = SRV.indexOf('retryRepeatedQuestion({');
const fbIdx = SRV.indexOf('all models failed, using fallback');
ok('C-0 전제: 기준 자리를 다 찾았다', loopEnd > 0 && focusIdx > 0 && repeatIdx > 0 && fbIdx > 0,
  [loopEnd, focusIdx, repeatIdx, fbIdx].join(','));
ok('C-1 재시도는 첫 시도(모델 루프) «뒤» 다', declIdx > loopEnd);
ok('C-2 재시도는 집중교정 «앞» 이다(살아난 답도 교정을 지난다)', declIdx < focusIdx);
ok('C-3 재시도는 같은 질문 다시 뽑기 «앞» 이다', declIdx < repeatIdx);
ok('C-4 재시도는 폴백 «앞» 이다', declIdx < fbIdx);
ok('C-5 재시도는 스트리밍을 쓰지 않는다(첫 모델 한 번만 규칙)', !/runFriendStreaming/.test(strip(wiring)));
ok('C-6 재시도는 env.AI.run 을 직접 부르지 않는다(정본 래퍼만)', !/env\.AI\.run/.test(strip(wiring)));

// 끝내 실패한 기록에 «재시도를 했는가» 가 실리는가 — 기록을 읽는 사람이 «재시도 뒤 실패» 와 «예산 초과로 안 함» 을 가르게.
const fbStart = SRV.lastIndexOf('if (!reply) {', fbIdx);
const fbBlock = fbStart > 0 ? blockAt(SRV, SRV.indexOf('{', fbStart)).text : '';
ok('C-7 끝내 실패한 기록에 재시도 결과를 싣는다', /friendRetry/.test(strip(fbBlock)));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

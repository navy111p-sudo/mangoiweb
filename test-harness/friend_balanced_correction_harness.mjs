/* A.i 친구하기 — 교정 모드별 «말로 들려주기» · 균형 «다시 묻기» · 정직한 칭찬 · 미리듣기 문
 *   / A.i Friend — per-mode spoken correction, balanced recheck, honest praise, preview gate.
 *
 * [왜 있나 — 2026-11-03 사장님 화면]
 *   균형 모드에서 "My birthday was tomorrow." 라고 했는데 교정 카드도 교정 음성도 없이
 *   "Wait, that's not possible! 🤔" 로만 받았다. 그리고 "Chocolate cake tomorrow." 류의 문장에도
 *   "Great job!" 이 붙었다. 정본은 src/friend-correction-flow.ts.
 *
 * [무엇을 보나 — 문자열이 아니라 «실제로 돌려서»]
 *   A. finishFriendReply 를 실제로 돌린다 — 모드별로 «무엇을 말하는가» 와 «무엇을 말하지 않는가» 를 짝으로.
 *   B. planFriendTurn — 다시 묻기를 «할 때» 와 «안 할 때» 를 짝으로.
 *   C. recheckBalancedFix — 가짜 모델로 실제로 돌린다(지어낸 교정·실패·던짐 포함).
 *   D. 미리듣기 문(createFriendPreviewGate) — 균형/자유/집중, 교정 있음/없음.
 *   E. 진짜 Worker 라우트(/api/ai/chat-friend)를 메모리 D1 + 정해진 답을 주는 가짜 모델로 돌린다
 *      (⛔ 운영 서비스·운영 D1 을 부르지 않는다). 사장님 화면의 그 문장으로.
 *   F. 배선 — 최종 조립이 «저장 전» 에 한 번 불리는가, 모델 교정이 «먼저» 인가.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(ROOT, 'cloudflare-deploy');
const require = createRequire(path.join(CF, 'package.json'));
const esbuild = require('esbuild');
function load(file) {
  const js = esbuild.buildSync({ entryPoints: [path.join(CF, 'src', file)], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['cloudflare:*'] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', js)(module, module.exports, require);
  return module.exports;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== '' ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const count = (hay, needle) => String(hay).split(needle).length - 1;

const F = load('friend-correction-flow.ts');
const API = fs.readFileSync(path.join(CF, 'src/api-ai.ts'), 'utf8').replace(/\r\n/g, '\n');

/* 사장님 화면의 그 문장 / The sentence from the owner's screen */
const SAID = 'My birthday was tomorrow.';
const FIX = { was: 'My birthday was tomorrow.', now: 'My birthday is tomorrow.', why_ko: '내일 일은 현재형으로 말해요.', tag: 'past_tense', severity: 'major' };
const Q = 'Is it your birthday tomorrow?';

console.log('\nA. 최종 답장 조립(finishFriendReply) — 실제로 돌린다');
{
  const fin = (mode, o) => F.finishFriendReply(o.reply ?? Q, { mode, verified: o.verified ?? null, shown: o.shown ?? null, msg: o.msg ?? SAID, fallback: !!o.fallback });
  const bal = fin('balanced', { verified: FIX, shown: FIX });
  ok('A-1 균형: 고친 문장을 말한다', bal.includes(FIX.now), bal);
  ok('A-2 균형: 고친 문장은 «한 번» 만', count(bal, FIX.now) === 1, bal);
  ok('A-3 균형: 고친 문장이 질문보다 «먼저»', bal.indexOf(FIX.now) >= 0 && bal.indexOf(FIX.now) < bal.indexOf('?'), bal);
  ok('A-4 균형: 원래 질문도 그대로 이어진다(대화를 끊지 않는다)', bal.endsWith(Q), bal);
  const free = fin('free_talk', { verified: FIX, shown: FIX });
  ok('A-5 자유대화(짝): 고친 문장을 «말하지 않는다» — 카드만', !free.includes(FIX.now) && free === Q, free);
  const foc = fin('focused', { verified: FIX, shown: FIX });
  ok('A-6 집중교정: 고친 문장 3번 (기존 그대로)', count(foc, FIX.now) === 3 && /^You can say/.test(foc), foc);
  const balHidden = fin('balanced', { verified: FIX, shown: null });
  ok('A-7 균형: 카드를 안 보여 주는 턴(간격 게이트)에는 말하지도 않는다', !balHidden.includes(FIX.now), balHidden);
  const already = fin('balanced', { reply: 'Let\'s say it like this: "' + FIX.now + '" ' + Q, verified: FIX, shown: FIX });
  ok('A-8 균형: 이미 앞에 있으면 두 번 붙이지 않는다', count(already, FIX.now) === 1, already);
  // 정직한 칭찬 / honest praise
  const praised = fin('balanced', { reply: 'Great job! ' + Q, verified: FIX, shown: FIX });
  ok('A-9 틀린 문장에는 «Great job!» 을 뗀다', !/great job/i.test(praised) && praised.includes(FIX.now), praised);
  const goodMsg = 'I like chocolate cake very much.';
  const kept = fin('balanced', { reply: 'Great job! What else do you like?', msg: goodMsg });
  ok('A-10 짝: 맞는 문장(3낱말 이상·교정 없음)에는 칭찬을 그대로 둔다', kept === 'Great job! What else do you like?', kept);
  const freePraise = fin('free_talk', { reply: 'Great job! ' + Q, verified: FIX, shown: null });
  ok('A-11 자유대화도 틀린 문장이면 칭찬을 뗀다(카드를 안 보여 주는 턴이어도)', !/great job/i.test(freePraise), freePraise);
  const short = fin('balanced', { reply: 'Great job! Tell me more.', msg: 'Yes.' });
  ok('A-12 짝: 짧은 대답(«Yes.»)이라도 틀린 게 없으면 칭찬을 그대로 둔다(자유 대화 — 교재 연습 규칙과 다름)', short === 'Great job! Tell me more.', short);
  const named = fin('balanced', { reply: 'Yay, Amy! ' + Q, verified: FIX, shown: null });
  ok('A-15 «Yay, Amy!» 를 뗄 때 «Amy!» 조각이 덩그러니 남지 않는다', named === Q, named);
  const namedOk = fin('balanced', { reply: 'Yay, Amy! ' + Q, msg: 'My dog is very cute.' });
  ok('A-16 짝: 맞는 문장이면 «Yay, Amy!» 그대로', namedOk === 'Yay, Amy! ' + Q, namedOk);
  const nameInQ = F.stripPraiseLead('Great! Amy, what did you do?');
  ok('A-17 이름이 질문 안에 있으면(«Amy, what…») 이름은 두고 칭찬만 뗀다', nameInQ === 'Amy, what did you do?', nameInQ);
  const fb = fin('balanced', { reply: 'Hello! Let\'s practice.', verified: FIX, shown: FIX, fallback: true });
  ok('A-13 폴백 고정 문구는 손대지 않는다', fb === 'Hello! Let\'s practice.', fb);
  let threw = false; try { F.finishFriendReply(null, { mode: 'balanced', verified: null, shown: null, msg: null, fallback: false }); } catch { threw = true; }
  ok('A-14 이상한 입력에도 던지지 않는다', !threw);
}

console.log('\nB. 한 턴의 계획(planFriendTurn) — 다시 묻기를 할 때 / 안 할 때');
{
  const p = (mode, msg, cut = false) => F.planFriendTurn(mode, msg, { cut });
  ok('B-1 균형 + 영어 문장 → 다시 묻기 한다', p('balanced', SAID).recheck === true);
  ok('B-2 짝: 자유대화는 다시 묻지 않는다', p('free_talk', SAID).recheck === false);
  ok('B-3 짝: 집중교정은 자기 경로가 따로 있어 다시 묻지 않는다', p('focused', SAID).recheck === false);
  ok('B-4 잘린 말·부탁(cut)이면 다시 묻지 않는다', p('balanced', SAID, true).recheck === false);
  ok('B-5 낱말 2개 이하는 다시 묻지 않는다', p('balanced', 'Chocolate cake.').recheck === false);
  ok('B-6 한글이 섞이면 다시 묻지 않는다', p('balanced', 'My birthday 내일이야 tomorrow').recheck === false);
  const det = p('balanced', 'I eat pizza yesterday.');
  ok('B-7 규칙으로 이미 잡힌 교정이 있으면(과거형 보완) 다시 묻지 않는다', !!det.detFix && det.detFix.now === 'I ate pizza yesterday.' && det.recheck === false, det);
}

console.log('\nC. 균형 «다시 묻기»(recheckBalancedFix) — 가짜 모델로 실제로 돌린다');
{
  let calls = 0, seen = null;
  const asker = (resp) => async (msgs) => { calls++; seen = msgs; if (resp instanceof Error) throw resp; return { response: typeof resp === 'string' ? resp : JSON.stringify(resp) }; };
  const got = await F.recheckBalancedFix(SAID, asker({ reply: 'Checked.', fix: FIX }));
  ok('C-1 모델이 교정을 주면 검증을 거쳐 돌려준다', got && got.now === FIX.now, got);
  ok('C-2 학생 문장은 «user» 로 따로 — 시스템 지시는 고정 문구(학생 말로 만들지 않는다)', seen && seen[0].role === 'system' && seen[0].content === F.BALANCED_RECHECK_RULE && seen[1].role === 'user' && seen[1].content === SAID);
  ok('C-3 지시에 «시간 낱말과 어긋난 시제» 를 명시한다', /tomorrow/.test(F.BALANCED_RECHECK_RULE) && /time word/.test(F.BALANCED_RECHECK_RULE));
  ok('C-4 교정이 없으면 null', (await F.recheckBalancedFix(SAID, asker({ reply: 'Checked.', fix: null }))) === null);
  ok('C-5 지어낸 교정(학생이 안 한 말)은 버린다', (await F.recheckBalancedFix(SAID, asker({ reply: 'Checked.', fix: { ...FIX, was: 'I went to the moon.' } }))) === null);
  let threw = false, r6 = 'x';
  try { r6 = await F.recheckBalancedFix(SAID, asker(new Error('AI down'))); } catch { threw = true; }
  ok('C-6 모델이 던져도 던지지 않고 null', !threw && r6 === null);
  ok('C-7 평문·깨진 JSON 이면 null', (await F.recheckBalancedFix(SAID, asker('Sorry, I cannot.'))) === null);
  calls = 0;
  await F.recheckBalancedFix('Yes.', asker({ reply: 'Checked.', fix: FIX }));
  ok('C-8 다시 물을 문장이 아니면 모델을 부르지도 않는다(비용)', calls === 0, String(calls));
  const art = { was: 'I have a dog and cat at home.', now: 'I have a dog and a cat at home.', why_ko: '셀 수 있는 낱말 앞에는 a 를 붙여요.', severity: 'major' };
  ok('C-9 태그 other + severity major(사소한 실수)는 받지 않는다', (await F.recheckBalancedFix(art.was, asker({ reply: 'Checked.', fix: { ...art, tag: 'other' } }))) === null);
  ok('C-10 태그 article 도 받지 않는다(뜻이 달라지는 넷만)', (await F.recheckBalancedFix(art.was, asker({ reply: 'Checked.', fix: { ...art, tag: 'article' } }))) === null);
  const garbled = await F.recheckBalancedFix(SAID, asker({ reply: 'Checked.', fix: { ...FIX, why_ko: '지도 알는 어 지도 었다 알 지도 었다.' } }));
  ok('C-11 설명이 깨진 한국어면 태그별 결정론 설명으로 바꾼다', !!garbled && garbled.now === FIX.now && garbled.why_ko === '언제 일어난 일인지에 맞게 동사의 때를 바꿔요.', garbled);
  const clean = await F.recheckBalancedFix(SAID, asker({ reply: 'Checked.', fix: FIX }));
  ok('C-12 짝: 읽을 수 있는 설명은 그대로 둔다', !!clean && clean.why_ko === FIX.why_ko, clean);
  ok('C-13 지시에 severity 를 묻지 않는다(판정은 태그로 — 모델의 major 를 안 믿는다)', !/severity/.test(F.BALANCED_RECHECK_RULE) && !/\|other/.test(F.BALANCED_RECHECK_RULE));
}

console.log('\nD. 미리듣기 문(createFriendPreviewGate)');
{
  const run = (plan, steps) => {
    const sent = [];
    const g = F.createFriendPreviewGate(plan, (s) => sent.push(s));
    for (const [k, v] of steps) g[k](v);
    return { sent, g };
  };
  const plan = (mode, extra = {}) => ({ mode, detFix: null, recheck: mode === 'balanced', ...extra });
  const s1 = 'Wait, that is not possible!', s2 = Q;
  let r = run(plan('balanced'), [['push', s1], ['push', s2], ['raw', '{"reply":"x","fix":null}']]);
  ok('D-1 균형: 다시 묻기 결과 전에는 한 문장도 안 보낸다(잡아 둔다)', r.sent.length === 0 && r.g.held() === 2, r.sent);
  r.g.recheck(false);
  ok('D-2 균형: 교정이 없다고 정해지면 잡아 둔 문장을 «순서대로» 보낸다', JSON.stringify(r.sent) === JSON.stringify([s1, s2]), r.sent);
  r.g.push('Tell me more.');
  ok('D-3 균형: 열린 뒤 문장은 바로 보낸다', r.sent.length === 3);
  r = run(plan('balanced'), [['push', s1], ['raw', '{"reply":"x","fix":{"was"'], ['push', s2], ['recheck', false]]);
  ok('D-4 균형: 모델 교정(fix 가 객체)이 보이면 미리듣기를 접는다', r.sent.length === 0 && r.g.halted() === 'correction', [r.sent, r.g.halted()]);
  r = run(plan('balanced'), [['push', s1], ['recheck', true], ['raw', '{"fix":null}']]);
  ok('D-5 균형: 다시 묻기가 교정을 찾으면 미리듣기를 접는다', r.sent.length === 0 && r.g.halted() === 'correction', [r.sent, r.g.halted()]);
  r = run(plan('balanced', { detFix: FIX, recheck: false }), [['push', s1]]);
  ok('D-6 균형: 규칙 교정이 이미 있으면 첫 문장부터 안 보낸다', r.sent.length === 0 && r.g.halted() === 'correction');
  r = run(plan('balanced', { recheck: false }), [['push', s1], ['streamEnd', 'plain text, no json']]);
  ok('D-7 균형: fix 칸이 끝내 안 보이면 «없음» 으로 보고 보낸다(다시 묻기 없는 턴)', r.sent.length === 1, r.sent);
  r = run(plan('free_talk'), [['push', s2]]);
  ok('D-8 자유대화: 칭찬 말머리가 아니면 기다리지 않고 바로 보낸다(속도 유지)', r.sent.length === 1);
  r = run(plan('free_talk'), [['push', 'Great job!'], ['push', s2], ['raw', '{"fix":{"was"']]);
  ok('D-9 자유대화: 칭찬으로 시작 + 교정 있음 → 미리듣기를 접는다(칭찬을 먼저 들려주지 않게)', r.sent.length === 0 && r.g.halted() === 'praise', [r.sent, r.g.halted()]);
  r = run(plan('free_talk'), [['push', 'Great job!'], ['push', s2], ['raw', '{"fix":null}']]);
  ok('D-10 짝: 칭찬으로 시작해도 교정이 없고 온전한 문장이면 그대로 보낸다', r.sent.length === 2, r.sent);
  r = run(plan('free_talk', { detFix: FIX }), [['push', 'Great job!'], ['raw', '{"fix":null}']]);
  ok('D-11 규칙 교정이 이미 있으면 칭찬으로 시작하는 문장을 보내지 않는다(자유대화)', r.sent.length === 0 && r.g.halted() === 'praise');
  r = run(plan('focused'), [['push', s1], ['raw', '{"fix":null}'], ['streamEnd', '']]);
  ok('D-12 집중교정: 미리듣기를 하지 않는다(기존 그대로)', r.sent.length === 0 && r.g.halted() === 'focused');
  let threw = false;
  try { const g = F.createFriendPreviewGate(plan('balanced'), () => { throw new Error('socket closed'); }); g.push(s1); g.raw('{"fix":null}'); g.recheck(false); } catch { threw = true; }
  ok('D-13 보내기가 던져도 문은 던지지 않는다', !threw);
}

console.log('\nE. 진짜 Worker 라우트(/api/ai/chat-friend) — 메모리 D1 + 정해진 답의 가짜 모델');
{
  const worker = load('index.ts').default;
  const raw = new DatabaseSync(':memory:');
  const statement = (sql) => {
    const mk = (args) => ({
      all: async () => ({ results: raw.prepare(sql).all(...args), success: true }),
      first: async (col) => { const r = raw.prepare(sql).get(...args) ?? null; return col && r ? r[col] : r; },
      run: async () => { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
    });
    return { ...mk([]), bind: (...args) => mk(args.map((x) => (x === undefined ? null : typeof x === 'boolean' ? Number(x) : x))) };
  };
  const DB = { prepare(sql) {
    try { raw.prepare(sql); return statement(sql); }
    catch { const z = { all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 0 } }) }; return { ...z, bind: () => z }; }
  }, exec: d1ExecLikeProd(raw), batch: async (ss) => Promise.all(ss.map((s) => s.run())) };
  const cache = new Map();
  let main = null, recheckFix = null, rechecks = 0, recheckDelay = 0, recheckTag = null, retryDelay = 0, retryEndAt = 0;
  const evs = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const env = { DB, ROOM_JWT_SECRET: 'balanced-local-fixture-only',
    SESSION_STATE: { get: async (k) => cache.get(k) ?? null, put: async (k, v) => cache.set(k, String(v)), list: async () => ({ keys: [] }) },
    AI: { run: async (_model, opts) => {
      const sys = String(opts.messages?.[0]?.content || '');
      if (sys.includes('BALANCED_CORRECTION_CHECK')) {
        rechecks++;
        evs.push('rc:start');
        if (recheckDelay) await sleep(recheckDelay);
        evs.push('rc:end');
        return { response: JSON.stringify({ reply: 'Checked.', fix: recheckTag ? { ...recheckFix, tag: recheckTag } : recheckFix }) };
      }
      evs.push('main:start');
      if (main === 'THROW') throw new Error('fixture: model unavailable');
      /* 본 답 «뒤» 의 다시 뽑기(눈높이·이름 등 — 마지막 user 가 괄호 지시)는 retryDelay 만큼 늦게 끝낸다. */
      if (retryDelay && /^\(/.test(String(opts.messages?.at(-1)?.content || ''))) { await sleep(retryDelay); retryEndAt = Date.now(); }
      const response = JSON.stringify(main);
      if (!opts.stream) return { response };
      return new ReadableStream({ start(c) {
        for (let i = 0; i < response.length; i += 9) c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ response: response.slice(i, i + 9) }) + '\n\n'));
        c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close();
      } });
    } } };
  const post = (route, body, token) => worker.fetch(new Request('https://mangoi.ai' + route, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: 'https://mangoi.ai', ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: JSON.stringify(body) }), env, { waitUntil() {}, passThroughOnException() {} });
  async function turn(mode, msg, stream, level = 'S6') {
    rechecks = 0; evs.length = 0;
    const t0 = Date.now();
    const auth = await (await post('/api/ai/chat-guest-token', {})).json();
    const res = await post('/api/ai/chat-friend', { uid: auth.uid, msg, correction_mode: mode, stream, level }, auth.token);
    let body, events = [], firstTAt = 0;
    if (stream) {
      /* 이벤트가 «도착한 시각» 도 잰다 — 미리듣기가 다른 처리보다 먼저 나갔는지 보려고. */
      const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const e = JSON.parse(line.slice(5));
          if (e.t && !firstTAt) firstTAt = Date.now();
          events.push(e);
        }
      }
      body = events.find((e) => e.done);
    } else body = await res.json();
    const saved = raw.prepare("SELECT content FROM ai_friend_chats WHERE student_uid=? AND role='assistant' ORDER BY id DESC").get(auth.uid)?.content;
    return { status: res.status, body: body || {}, t: events.filter((e) => e.t).map((e) => e.t), saved, uid: auth.uid, ms: Date.now() - t0, firstTAt };
  }
  // ① 사장님 화면 — 모델이 교정을 놓쳤다(fix:null) → 균형 다시 묻기가 줍는다
  main = { reply: "Wait, that's not possible! " + Q, fix: null };
  recheckFix = FIX;
  for (const stream of [0, 1]) {
    const r = await turn('balanced', SAID, stream);
    const tag = stream ? 'SSE' : 'JSON';
    ok(`E-1 [${tag}] 균형: 모델이 놓친 교정을 다시 묻기로 줍는다(카드)`, r.status === 200 && r.body.fix && r.body.fix.now === FIX.now, r.body.fix);
    ok(`E-2 [${tag}] 균형: 고친 문장을 질문보다 먼저 «한 번» 말한다`, count(r.body.reply, FIX.now) === 1 && r.body.reply.indexOf(FIX.now) < r.body.reply.indexOf('?'), r.body.reply);
    ok(`E-3 [${tag}] 다시 묻기는 한 번만 부른다`, rechecks === 1, String(rechecks));
    ok(`E-4 [${tag}] 학생이 들은 문장 그대로 저장된다(다음 턴 기록)`, r.saved === r.body.reply, r.saved);
    if (stream) ok('E-5 [SSE] 교정 턴에는 질문을 먼저 흘려보내지 않는다(미리듣기 0문장)', r.t.length === 0, r.t);
  }
  // ② 맞는 문장 — 다시 묻기도 «없음» → 미리듣기는 그대로 나가고, 답장도 그대로(칭찬 포함)
  //    ⚠️ 학생 문장은 기존 답장 손질(공감·눈높이)이 칭찬을 따로 떼지 않는 것으로 고른다 —
  //       "I like chocolate cake very much." 는 origin/main 에서도 칭찬이 떨어져(이 변경과 무관) 짝 검사가 헛돈다.
  main = { reply: 'Great job! What else do you like?', fix: null };
  recheckFix = null;
  {
    const good = 'My dog is very cute.';
    const r = await turn('balanced', good, 1);
    ok('E-6 [SSE] 짝: 교정이 없으면 미리듣기가 그대로 나간다', r.t.length >= 1 && r.t.join(' ') === main.reply, r.t);
    ok('E-7 짝: 교정이 없으면 카드 없음·답장 그대로(칭찬 포함)', r.body.fix === null && r.body.reply === main.reply, [r.body.fix, r.body.reply]);
    ok('E-8 짝: 미리듣기와 최종본이 같아 다시 읽지 않는다(replaced 0)', r.body.replaced === 0, String(r.body.replaced));
  }
  // ③ 모델이 교정을 «준» 경우 — 그것이 먼저(다시 묻기 결과보다)
  main = { reply: 'Great job! ' + Q, fix: FIX };
  recheckFix = { ...FIX, now: 'My birthday will be tomorrow.' };
  {
    const r = await turn('balanced', SAID, 1);
    ok('E-9 모델 교정이 있으면 그것을 쓴다(다시 묻기보다 먼저)', r.body.fix && r.body.fix.now === FIX.now, r.body.fix);
    ok('E-10 틀린 문장에 붙은 «Great job!» 을 뗀다', !/great job/i.test(r.body.reply) && r.body.reply.includes(FIX.now), r.body.reply);
  }
  // ④ 자유대화 — 카드만, 말로는 안 함
  main = { reply: 'Great job! ' + Q, fix: FIX };
  {
    const r = await turn('free_talk', SAID, 1);
    ok('E-11 자유대화: 교정 카드는 준다', r.body.fix && r.body.fix.now === FIX.now, r.body.fix);
    ok('E-12 자유대화: 고친 문장을 말하지 않는다', !r.body.reply.includes(FIX.now), r.body.reply);
    ok('E-13 자유대화: 다시 묻기를 부르지 않는다', rechecks === 0, String(rechecks));
    ok('E-14 자유대화도 틀린 문장이면 칭찬을 뗀다', !/great job/i.test(r.body.reply), r.body.reply);
  }
  // ⑤ 집중교정 — 기존 그대로 3번
  main = { reply: Q, fix: FIX };
  {
    const r = await turn('focused', SAID, 1);
    ok('E-15 집중교정: 고친 문장 3번 (기존 그대로)', count(r.body.reply, FIX.now) === 3, r.body.reply);
    ok('E-16 집중교정: 균형 다시 묻기는 안 부른다', rechecks === 0, String(rechecks));
  }
  // ⑥ 동시 실행 — 다시 묻기가 끝나기 «전에» 본 호출이 시작한다(차례로 돌면 기다림이 «합» 이 된다)
  main = { reply: "Wait, that's not possible! " + Q, fix: null };
  recheckFix = FIX; recheckDelay = 150;
  {
    const r = await turn('balanced', SAID, 0);
    ok('E-17 다시 묻기와 본 호출이 «동시에» 돈다(본 호출 시작이 다시 묻기 끝보다 먼저)', evs.indexOf('main:start') >= 0 && evs.indexOf('main:start') < evs.indexOf('rc:end'), evs.join(','));
    const lat = raw.prepare("SELECT ms, model_ms FROM ai_latency_log WHERE feature='chat-friend' ORDER BY rowid DESC LIMIT 1").get();
    ok('E-18 지연 기록: 모델 시간이 전체 시간을 넘지 않는다(겹친 시간을 두 번 안 셈)', !!lat && lat.model_ms <= lat.ms, lat);
    ok('E-19 지연 기록: 다시 묻기를 «기다린» 시간은 모델 시간에 들어간다', !!lat && lat.model_ms >= 100, lat);
    ok('E-20 그 턴도 교정은 그대로 준다', r.body.fix && r.body.fix.now === FIX.now, r.body.fix);
  }
  // ⑦ 잘린 말 — 교정할 문장이 아니라 다시 묻지 않는다(배선: 잘린 말 판정이 계획에 실제로 들어가는가)
  recheckDelay = 0;
  {
    const r = await turn('balanced', 'My birthday was', 0);
    ok('E-21 잘린 말("My birthday was")에는 다시 묻기를 부르지 않는다', rechecks === 0, String(rechecks));
  }
  // ⑧ 기다림 상한 — 다시 묻기만 느리면 상한만큼만 기다리고 «교정 없음» 으로 간다
  recheckDelay = F.RECHECK_EXTRA_WAIT_MS + 2500;
  {
    const r = await turn('balanced', SAID, 1);
    ok('E-22 다시 묻기가 느리면 상한(RECHECK_EXTRA_WAIT_MS)만큼만 기다린다', r.ms < F.RECHECK_EXTRA_WAIT_MS + 1500 && r.body.fix === null, { ms: r.ms, fix: r.body.fix });
    ok('E-23 상한이 지나면 잡아 둔 미리듣기를 놓아준다', r.t.length >= 1, r.t);
  }
  // ⑨ 모델이 다 실패한 폴백 턴 — 다시 묻기를 기다리지 않고, 학생이 못 볼 교정을 «보여 줬다» 로 남기지 않는다
  main = 'THROW'; recheckDelay = 300;
  {
    const r = await turn('balanced', SAID, 0);
    ok('E-24 폴백 턴: 안내만, 교정 카드 없음', r.body.ai_unavailable === true && r.body.fix === null, r.body);
    ok('E-25 폴백 턴: 다시 묻기 결과로 «보여 준 교정» 기억(KV)을 남기지 않는다', !cache.get('aifriendfix:' + r.uid), cache.get('aifriendfix:' + r.uid));
  }
  // ⑪ 다시 묻기가 «교정 없음» 으로 끝나는 순간 미리듣기를 놓아준다 — 본 답 뒤 다시 뽑기(눈높이)가 길어도 그걸 기다리지 않는다
  main = { reply: "That sounds like a fun day for you and your family. Is it your birthday tomorrow? Tell me about your party plans and your friends.", fix: null };
  recheckFix = null; recheckDelay = 100; retryDelay = 600; retryEndAt = 0;
  {
    const r = await turn('balanced', 'My dog is very cute.', 1, 'S1');
    ok('E-27 (전제) 본 답 뒤 다시 뽑기가 실제로 돌았다', retryEndAt > 0, String(retryEndAt));
    ok('E-28 다시 묻기 결과가 오면 «바로» 미리듣기를 흘린다(뒤 처리 끝까지 안 기다림)', r.firstTAt > 0 && retryEndAt > 0 && r.firstTAt < retryEndAt, { firstTAt: r.firstTAt, retryEndAt });
  }
  retryDelay = 0;
  // ⑩ 사소한 실수(관사)를 모델이 major 로 달아도 다시 묻기로는 받지 않는다(균형의 «작은 실수 간격» 을 지킨다)
  main = { reply: 'Do you walk them?', fix: null }; recheckDelay = 0;
  recheckFix = { was: 'I have a dog and cat at home.', now: 'I have a dog and a cat at home.', why_ko: '셀 수 있는 낱말 앞에는 a 를 붙여요.', tag: 'other', severity: 'major' };
  {
    const r = await turn('balanced', 'I have a dog and cat at home.', 0);
    ok('E-26 관사 같은 사소한 실수는 다시 묻기로 카드·음성을 만들지 않는다', r.body.fix === null && !r.body.reply.includes('a cat'), [r.body.fix, r.body.reply]);
  }
  raw.close();
}

console.log('\nF. 배선 — 한 곳에서, 저장 전에');
{
  // 🏅 (2026-11-04) 인자 끝에 suspect(모델이 교정을 내놓은 턴 — 칭찬을 뗀다)가 붙었다 — 인자 «모양» 이 아니라 «저장 전에 부르는가» 를 본다
  const call = API.indexOf('reply = finishFriendReply(reply, { mode: friendMode, verified: verifiedFix, shown: showFix, msg, fallback: usedFallback');
  const save = API.indexOf(".bind(uid, 'assistant', reply");
  ok('F-1 최종 조립을 «저장 전» 에 부른다', call > 0 && save > call, [call, save]);
  ok('F-2 최종 조립은 한 번만 부른다', count(API, 'finishFriendReply(reply') === 1);
  const m = API.match(/const verified = (.+);\n/);
  ok('F-3 모델 교정이 «먼저», 규칙 보완 → 다시 묻기 순', !!m && /^verifyWarmupFix\(rawFix, msg\)\s*\|\|\s*turnPlan\.detFix\s*\|\|\s*\(recheckP \? await waitRecheck\(\) : null\)$/.test(m[1].trim()), m && m[1]);
  ok('F-4 미리듣기는 문을 지난다(liveSend 가 직접 보내지 않는다)', /const liveSend = \(sen: string\) => \{[\s\S]*?previewGate\.push\(sen\);\s*\};/.test(API) && !/const liveSend = \(sen: string\) => \{[^}]*sseSend\(/.test(API));
  ok('F-5 다시 묻기는 본 호출 «전에» 시작한다(동시 실행)', API.indexOf('const recheckP') > 0 && API.indexOf('const recheckP') < API.indexOf('for (const m of models) {', API.indexOf('const runFriendStreaming')));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

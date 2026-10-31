// ai_friend_no_repeat_question_harness.mjs — AI 영어친구 «같은 질문 두 번 금지» (2026-10-28)
//
// 왜: 일반 A.i 말하기(웜업)에 넣은 «같은 질문 두 번 금지»(warmup_no_repeat_question_harness)를 AI 영어친구
//     (`POST /api/ai/chat-friend`, src/api-ai.ts)에도 넣었다. 그 통로의 반복 검사(aiFriendIsRepeat)는
//     «글자가 거의 같은 답» 만 잡아서 「Is your dog big?」 → (작아요) → 「Is your dog small?」 같은
//     «말만 바꾼 같은 질문» 이 그대로 학생에게 나갔다.
//
// 무엇을 보나 — «실제 핸들러» 를 그대로 돌린다(esbuild 로 handleAiApi 를 묶어 가짜 D1·KV·AI 에 물림).
//   ⓪ 전제: 배선 자리가 «주석 밖에 살아 있는가»
//   ① 장면: 지시 줄 · 영어 힌트로 다시 뽑기 · 두 번까지 · 시간 예산 · 1시간 쉬면 대화 끊김 · 20줄 밖 기억 ·
//          미리듣기(SSE) 멈춤 · 이름/짧게 다시 뽑기가 같은 질문을 «새로 들여오지 않는가» · 모델 전부 실패
//   ② 샌드박스: 대화 수백 번(절반은 스트리밍)을 실제 핸들러로 돌려, 정답 표(helpers/question-pool.mjs — 판정 코드와
//      «따로» 적은 것)로 «학생에게 나간 같은 질문» 을 센다. 예전 방식(글자 비교 한 번)과 같은 씨앗으로 견준다.
//   ③ 변이시험은 AIF_SRC_DIR=<고친 src 사본> 으로 이 하니스를 그 사본에 돌린다(저장소 파일은 안 건드린다).
//
// ⚠️ esbuild(cloudflare-deploy/node_modules)가 없으면 ①② 를 못 돈다 — 그때는 «건너뜀» 이 아니라 FAIL 로 말한다
//    (확인 안 한 것을 «문제없음» 으로 위장하지 않으려고. CI 는 npm ci 뒤라 있다).
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';
import { deadAt } from './helpers/live-code.mjs';
import { TOPIC_SETS, MODES, talkKit } from './helpers/question-pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC_DIR = process.env.AIF_SRC_DIR ? path.resolve(process.env.AIF_SRC_DIR) : path.join(root, 'cloudflare-deploy', 'src');
const SEEDS = Math.max(1, Math.floor(Number(process.env.AIF_SEEDS) || 8));   // 묶음(10)마다 대화 수 — 기본 4×10×8 = 320 대화
const QUIET = !!process.env.AIF_QUIET;

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; if (!QUIET) console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, info === undefined ? '' : '— ' + JSON.stringify(info).slice(0, 500)); }
};
const finish = () => {
  console.log(`ai_friend_no_repeat_question_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
};

// ─── ⓪ 전제: 배선이 살아 있는가 ───────────────────────────────────────────────
const src = fs.readFileSync(path.join(SRC_DIR, 'api-ai.ts'), 'utf8');
const hStart = src.indexOf("path === '/api/ai/chat-friend'");
ok('⓪ chat-friend 핸들러를 찾았다(전제)', hStart > 0);
const live = (needle, label) => {
  const at = src.indexOf(needle, hStart);
  const why = at < 0 ? 'missing' : deadAt(src, at, hStart);
  ok(`⓪ ${label} — 주석 밖에 살아 있다`, why === '', { needle, why });
};
live('questionMemory(questionSession(historyAll, latT0), msg, { reask: reaskTurn })', '기억은 «지금 이어지는 대화» 로 만든다(요청 턴이면 방금 질문은 뺀다)');
live('const reaskTurn = isReaskRequest(msg) || (aiFriendLooksCut(msg) && !aiFriendJustAskedAgain(history))', '«요청 턴» 판정은 정본 + cutHint 와 같은 조건이다');
live('${askedLine}', '지시에 «이미 물은 질문» 줄을 싣는다');
{
  // 웜업(index.ts)·엘리더잼(eleader-l1.ts)도 «이번 학생 말» 을 넘겨 같은 정본 판정(isReaskRequest)을 탄다 — 그 두 하니스에는 되묻기 표본이 없다.
  const idx = fs.readFileSync(path.join(SRC_DIR, 'index.ts'), 'utf8'), el = fs.readFileSync(path.join(SRC_DIR, 'eleader-l1.ts'), 'utf8');
  const a0 = idx.indexOf("const hkey = 'warmup:' + sessionId;"), a1 = idx.indexOf('questionMemory(history, studentInput)', a0);
  const b1 = el.indexOf('export const eleaderL1Memory = questionMemory;'), b2 = el.indexOf('eleaderL1Memory(JSON.parse(raw), said)');
  ok('⓪ 웜업·엘리더잼도 이번 학생 말을 넘겨 같은 정본을 부른다 — 주석 밖에 살아 있다', a0 > 0 && deadAt(idx, a1, a0) === '' && deadAt(el, b1) === '' && deadAt(el, b2, b1) === '', { a0, a1, b1, b2 });
}
live('hintFor: repeatQuestionHintEn', '다시 뽑을 때 영어 힌트를 쓴다');
live('repN(rn) <= repN(reply)', '이름 다시 뽑기가 같은 질문을 새로 들여오지 않는다');
live('repN(st2) <= repN(reply)', '짧게 다시 뽑기가 같은 질문을 새로 들여오지 않는다');

// ─── 실제 핸들러 묶기 ────────────────────────────────────────────────────────
const require = createRequire(path.join(root, 'cloudflare-deploy', 'package.json'));
let esbuild = null;
try { esbuild = require('esbuild'); } catch { esbuild = null; }
if (!esbuild) {
  ok('esbuild 가 있어 실제 핸들러를 돌렸다(전제 — 없으면 이 하니스의 핵심을 못 잰다 · cd cloudflare-deploy && npm ci)', false);
  finish();
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-norep-'));
const outFile = path.join(tmp, 'bundle.mjs');
try {
  await esbuild.build({
    stdin: {
      contents: "export { handleAiApi } from './api-ai'; export * from './question-memory'; export { wrongSelfName } from './ai-friends'; export { aiFriendMeasureReply } from './ai-friend-level';",
      resolveDir: SRC_DIR,
    },
    bundle: true, platform: 'node', format: 'esm', outfile: outFile, logLevel: 'silent',
    nodePaths: [path.join(root, 'cloudflare-deploy', 'node_modules')],
  });
} catch (e) {
  ok('실제 핸들러를 묶었다(전제)', false, String(e?.message || e).slice(0, 300));
  finish();
}
const M = await import(pathToFileURL(outFile).href);
fs.rmSync(tmp, { recursive: true, force: true });

// 예전 검사(글자 비교) — 소스에서 오려 낸다. 하니스에 베끼면 «자기가 적은 것» 을 검사하게 된다.
let aiIsRepeat = null;
{
  const a = src.indexOf('const aiFriendNorm =');
  const b = src.indexOf('const aiFriendIsRepeat =', a);
  const open = b > 0 ? src.indexOf('{', src.indexOf('=>', b)) : -1;
  let depth = 0, end = -1;
  for (let i = open; open > 0 && i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  try {
    const js = src.slice(a, end).replace(/\((\w+): string\)/g, '($1)').replace(/\((\w+): string, (\w+): any\[\]\)/g, '($1, $2)');
    aiIsRepeat = new Function(js + '\nreturn aiFriendIsRepeat;')();
  } catch (e) { aiIsRepeat = null; }
  ok('⓪ 예전 검사(aiFriendIsRepeat)를 소스에서 오려 냈다(전제)', typeof aiIsRepeat === 'function' && aiIsRepeat('Nice! Do you have a dog at home?', [{ role: 'assistant', content: 'Nice! Do you have a dog at home?' }]) === true);
}

// ─── 가짜 D1 · KV · AI ───────────────────────────────────────────────────────
const raw = new DatabaseSync(':memory:');
const bindable = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const stmt = (sql) => {
  const mk = (args) => ({
    all: async () => ({ results: raw.prepare(sql).all(...args), success: true }),
    first: async (col) => { const r = raw.prepare(sql).get(...args) ?? null; return col && r ? r[col] : r; },
    run: async () => { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { ...mk([]), bind: (...a) => mk(a.map(bindable)) };
};
const DB = { prepare: stmt, exec: d1ExecLikeProd(raw), batch: async (ss) => { const o = []; for (const s of ss) o.push(await s.run()); return o; } };
const kvMap = new Map();
const KV = { get: async (k) => kvMap.get(k) ?? null, put: async (k, v) => { kvMap.set(k, String(v)); }, delete: async (k) => { kvMap.delete(k); } };

let script = () => 'Hi! 😊 Do you like games?';
const calls = [];
let clockSkew = 0;
const realNow = Date.now.bind(Date);
Date.now = () => realNow() + clockSkew;

const sse = (body) => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (let i = 0; i < body.length; i += 7) c.enqueue(enc.encode('data: ' + JSON.stringify({ response: body.slice(i, i + 7) }) + '\n\n'));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
};
const AI = {
  run: async (model, o) => {
    calls.push({ model, o });
    const r = await script(o, calls.length, model);
    if (r instanceof Error) throw r;
    const body = JSON.stringify({ reply: String(r), fix: null });
    return o && o.stream ? sse(body) : { response: body };
  },
};
const env = { DB, AI, SESSION_STATE: KV, ROOM_JWT_SECRET: 'harness-secret-ai-friend-norepeat' };
const U = (p) => new URL('https://harness.local' + p);
const req = (p, body, tok) => new Request('https://harness.local' + p, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body),
});
const lastUser = (o) => String(o?.messages?.[o.messages.length - 1]?.content || '');
const kindOf = (o) => {
  const t = lastUser(o);
  if (/was already asked in this chat/.test(t)) return 'repeat';
  if (/^\(You already said that\./.test(t)) return 'generic';
  if (/^\(You said your name is /.test(t)) return 'name';
  if (/^\(That reply does not work for this student/.test(t)) return 'shorten';
  return 'first';
};
async function guest() {
  const r = await M.handleAiApi(req('/api/ai/chat-guest-token', {}), U('/api/ai/chat-guest-token'), env);
  return r.json();
}
async function chat(g, msg, extra = {}) {
  calls.length = 0;
  // These cases exercise incremental preview. Focused mode holds it until validation.
  const body = { uid: g.uid, msg, level: 'S6', friend: 'lily', correction_mode: 'balanced', ...extra };
  const r = await M.handleAiApi(req('/api/ai/chat-friend', body, g.token), U('/api/ai/chat-friend'), env);
  if (body.stream) {
    const txt = await r.text();
    const evs = txt.split('\n\n').map((s) => s.trim()).filter((s) => s.startsWith('data:')).map((s) => { try { return JSON.parse(s.slice(5).trim()); } catch { return {}; } });
    const done = evs.find((e) => e && e.done) || {};
    return { ...done, sent: evs.filter((e) => e && typeof e.t === 'string').map((e) => e.t), calls: calls.slice() };
  }
  const j = await r.json();
  return { ...j, sent: [], calls: calls.slice() };
}
const seq = (arr) => (o) => { const k = Math.min(calls.length - 1, arr.length - 1); const v = arr[k]; return typeof v === 'function' ? v(o) : v; };
const MIN = 60000;
const seedRows = (uid, rows) => {
  const now = Date.now();
  for (const [role, content, ago] of rows) raw.prepare('INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)').run(uid, role, content, 'S6', now - ago);
};
const rowsOf = (uid) => raw.prepare('SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id').all(uid);
const kinds = (res) => res.calls.map((c) => kindOf(c.o));

// 표를 만든다(첫 호출이 ensureChatSchema 를 돈다)
await chat(await guest(), 'Hi!');

// 강아지 대화: 크기를 이미 물었고 학생이 방금 「작아요」라고 답했다.
const DOG = (shift = 0) => [
  ['user', 'Hi!', 6 * MIN + shift], ['assistant', 'Hi! 😊 Do you have a dog?', 5.9 * MIN + shift],
  ['user', 'Yes, I have one.', 5 * MIN + shift], ['assistant', 'Nice! Is your dog big?', 4.9 * MIN + shift],
];
const SAID = "It's small, 7 kg.";
async function dogTalk(arr, extra, shift = 0) {
  const g = await guest();
  seedRows(g.uid, DOG(shift));
  script = seq(arr);
  const res = await chat(g, SAID, extra);
  return { g, res };
}

// ─── ① 장면 ──────────────────────────────────────────────────────────────────
console.log('① 장면 — 실제 핸들러');
{
  const { g, res } = await dogTalk(['Wow! Is your dog small?', 'Cool! What color is your dog?']);
  const sys = String(res.calls[0]?.o?.messages?.[0]?.content || '');
  ok('①-1 지시에 «이미 물은 질문 → 학생 답» 줄이 실린다', sys.includes(M.ASKED_LINE_HEAD) && sys.includes('Is your dog big?') && sys.includes("It's small"), sys.slice(-600));
  ok('①-1 반대말로 바꾼 같은 질문(big→small)이면 한 번 다시 뽑아 새 질문을 낸다', res.ok === true && res.reply === 'Cool! What color is your dog?' && res.calls.length === 2, { reply: res.reply, kinds: kinds(res) });
  const hint = lastUser(res.calls[1]?.o);
  ok('①-1 다시 뽑을 때의 힌트는 영어이고 앞서 물은 질문과 학생 답을 함께 말한다', kindOf(res.calls[1]?.o) === 'repeat' && !/[가-힣]/.test(hint) && hint.includes('Is your dog big?') && hint.includes("It's small"), hint);
  const prevAssist = res.calls[1]?.o?.messages?.[res.calls[1].o.messages.length - 2]?.content;
  ok('①-1 힌트 앞에 «방금 낸 답» 을 그대로 붙인다', prevAssist === 'Wow! Is your dog small?', prevAssist);
  const rows = rowsOf(g.uid);
  ok('①-1 저장된 AI 말은 학생이 받은 새 답이다(같은 질문은 기록에도 안 남는다)', rows[rows.length - 1].role === 'assistant' && rows[rows.length - 1].content === 'Cool! What color is your dog?' && !rows.some((r) => r.content === 'Wow! Is your dog small?'), rows.slice(-2));
}
{
  const { res } = await dogTalk(['Wow! Is your dog small?', 'Nice! Is your dog little?', 'Great! What does your dog eat?']);
  ok('①-2 첫 재시도가 또 같은 질문이면 두 번째로 다시 뽑는다', res.reply === 'Great! What does your dog eat?' && res.calls.length === 3 && kinds(res).filter((k) => k === 'repeat').length === 2, { reply: res.reply, kinds: kinds(res) });
}
{
  const { res } = await dogTalk(['Wow! Is your dog small?', 'Nice! Is your dog little?', 'Hmm! Is your dog big or small?', 'Never! What does your dog eat?']);
  ok('①-3 다시 뽑기는 «최대 두 번» — 그래도 같으면 처음 답으로 대화를 잇는다(끊지 않음)', res.ok === true && res.calls.length === 3 && res.reply === 'Wow! Is your dog small?', { reply: res.reply, n: res.calls.length });
}
{
  const { res } = await dogTalk([(o) => { clockSkew += 10000; return 'Wow! Is your dog small?'; }, 'Cool! What color is your dog?']);
  clockSkew = 0;
  ok('①-4 시간 예산(9초)을 넘긴 턴은 다시 뽑지 않는다(지연을 더 늘리지 않음)', res.calls.length === 1 && res.reply === 'Wow! Is your dog small?', { n: res.calls.length, reply: res.reply });
}
{
  const { res } = await dogTalk([(o) => { clockSkew += 10000; return 'Wow! Is your dog small?'; }, 'Cool! What color is your dog?'], { stream: 1 });
  clockSkew = 0;
  ok('①-4b 시간 예산을 넘긴 턴은 미리듣기도 멈추지 않는다(다시 안 뽑으니 멈추면 소리가 끊긴다)', res.sent.join(' ') === 'Wow! Is your dog small?' && res.replaced === 0, { sent: res.sent, replaced: res.replaced });
}
{
  // 마지막 AI 말이 61분 전 → 새 대화. 같은 말이 아니므로 예전 검사에도 안 걸린다.
  const g = await guest();
  seedRows(g.uid, DOG(56.2 * MIN));   // 마지막 줄 = 4.9+56.2 = 61.1분 전
  script = seq(['Wow! Is your dog small?', 'Cool! What color is your dog?']);
  const res = await chat(g, SAID);
  const sys = String(res.calls[0]?.o?.messages?.[0]?.content || '');
  ok('①-5 1시간 넘게 쉬고 다시 온 대화는 새 대화 — 옛 질문으로 막지 않는다', res.calls.length === 1 && res.reply === 'Wow! Is your dog small?' && !sys.includes(M.ASKED_LINE_HEAD), { n: res.calls.length, reply: res.reply });
}
{
  const g = await guest();
  seedRows(g.uid, DOG(54 * MIN));   // 마지막 줄 = 58.9분 전
  script = seq(['Wow! Is your dog small?', 'Cool! What color is your dog?']);
  const res = await chat(g, SAID);
  ok('①-5b 59분 전이면 같은 대화 — 그대로 막는다(짝)', res.calls.length === 2 && res.reply === 'Cool! What color is your dog?', { n: res.calls.length, reply: res.reply });
}
{
  // 어제 크기를 물었고, 오늘(5분 전) 다른 것을 물었다 → 어제 질문은 기억하지 않는다.
  const g = await guest();
  seedRows(g.uid, [
    ['user', 'Hi!', 26 * 60 * MIN], ['assistant', 'Hi! Is your dog big?', 25.9 * 60 * MIN], ['user', 'Yes, very big.', 25.8 * 60 * MIN],
    ['assistant', 'Cool! Do you like pizza?', 5 * MIN],
  ]);
  script = seq(['Yum! Is your dog small?', 'Cool! What color is your dog?']);
  const res = await chat(g, 'Yes, I love it.');
  ok('①-5c 중간에 1시간 넘게 쉰 곳이 있으면 그 앞(어제)은 다른 대화다', res.calls.length === 1 && res.reply === 'Yum! Is your dog small?', { n: res.calls.length, reply: res.reply });
}
{
  // 크기 질문 뒤로 다른 이야기 12번(24줄) → 모델에게 보여 주는 최근 20줄 «밖» 이지만 기억(40줄)에는 남는다.
  const g = await guest();
  const rows = [['user', 'Hi!', 30 * MIN], ['assistant', 'Hi! Is your dog big?', 29.5 * MIN], ['user', 'No, he is small.', 29 * MIN]];
  const others = ['Do you like pizza?', 'Do you play soccer?', 'Do you like math?', 'Do you have a brother?', 'Do you like rain?', 'Do you like summer?',
    'Do you play the piano?', 'Do you like cats?', 'Do you read books?', 'Do you like apples?', 'Do you swim?', 'Do you like movies?'];
  others.forEach((q, k) => { rows.push(['assistant', 'Nice! ' + q, (28 - k * 2) * MIN], ['user', 'Yes.', (27.5 - k * 2) * MIN]); });
  seedRows(g.uid, rows.slice(0, -1));   // 마지막 학생 답은 이번 말
  script = seq(['Great! Is your dog little?', 'Cool! What color is your dog?']);
  const res = await chat(g, 'Yes.');
  ok('①-6 최근 20줄 밖(같은 대화 40줄 안)에서 물은 질문도 기억한다', res.calls.length === 2 && res.reply === 'Cool! What color is your dog?', { n: res.calls.length, reply: res.reply, rows: rows.length });
  const sent = res.calls[0]?.o?.messages || [];
  ok('①-6b 그래도 모델에게 보여 주는 대화는 최근 20줄 그대로다(지시 1 + 대화 20 + 이번 말 1)', sent.length === 22 && sent.filter((m) => m.role === 'system').length === 1, { n: sent.length });
}
{
  const { res } = await dogTalk(['Wow! Is your dog small?', 'Cool! What color is your dog?'], { stream: 1 });
  ok('①-7 미리듣기(SSE)는 같은 질문 앞에서 멈춘다 — 학생은 그 질문을 먼저 듣지 않는다', res.sent.length === 1 && res.sent[0] === 'Wow!' && !res.sent.some((s) => /small/i.test(s)), res.sent);
  ok('①-7 멈춘 뒤 정본(새 답)이 done 으로 가고 replaced:1 로 화면이 다시 읽는다', res.done === 1 && res.reply === 'Cool! What color is your dog?' && res.replaced === 1, { reply: res.reply, replaced: res.replaced });
}
{
  const { res } = await dogTalk(['Nice! What color is your dog?'], { stream: 1 });
  ok('①-7b 새 질문이면 미리듣기가 끝까지 나가고 다시 읽지 않는다(짝)', res.sent.join(' ') === 'Nice! What color is your dog?' && res.replaced === 0 && res.calls.length === 1, { sent: res.sent, replaced: res.replaced });
}
{
  const { res } = await dogTalk(['Wow! Is your dog small?', 'Cool! What color is your dog?'], { stream: 1, correction_mode: 'focused' });
  ok('집중교정: 미리듣기를 보류해도 반복 질문은 정본에서 다시 뽑힌다', res.sent.length === 0 && res.reply === 'Cool! What color is your dog?' && res.replaced === 0, { sent: res.sent, reply: res.reply });
}

{
  const { res } = await dogTalk(["Hi, I'm Roy! What color is your dog?", "I'm Lily! Is your dog small?"]);
  ok('①-8 이름 다시 뽑기가 «이미 물은 질문» 을 새로 들여오면 받지 않는다', kinds(res).includes('name') && !/small/i.test(res.reply), { reply: res.reply, kinds: kinds(res) });
}
{
  const { res } = await dogTalk(["Hi, I'm Roy! What color is your dog?", "I'm Lily! Do you walk your dog?"]);
  ok('①-8b 이름을 바로잡은 새 질문이면 받는다(짝)', kinds(res).includes('name') && res.reply === "I'm Lily! Do you walk your dog?", { reply: res.reply, kinds: kinds(res) });
}
{
  const long = 'That sounds really fun and exciting for you and your family! What color is your dog?';
  const { res } = await dogTalk([long, 'Nice! Is your dog small?'], { level: 'S1' });
  ok('①-9 짧게 다시 뽑기가 «이미 물은 질문» 을 새로 들여오면 받지 않는다', kinds(res).includes('shorten') && !/small/i.test(res.reply), { reply: res.reply, kinds: kinds(res) });
}
{
  const long = 'That sounds really fun and exciting for you and your family! What color is your dog?';
  const { res } = await dogTalk([long, 'Nice! What color is your dog?'], { level: 'S1' });
  ok('①-9b 짧게 다시 뽑은 새 답이면 받는다(짝)', kinds(res).includes('shorten') && res.reply === 'Nice! What color is your dog?', { reply: res.reply, kinds: kinds(res) });
}
{
  const { res } = await dogTalk([new Error('model down')]);
  ok('①-10 모델이 전부 실패해도 죽지 않고 «AI 를 못 불렀다» 고 밝힌다', res.ok === true && res.ai_unavailable === true && res.calls.length === 3, { ok: res.ok, un: res.ai_unavailable, n: res.calls.length });
}
{
  const { res } = await dogTalk(['Nice! What does your dog eat?']);
  ok('①-11 새 질문이면 다시 뽑지 않는다(거짓 경보 없음)', res.calls.length === 1 && res.reply === 'Nice! What does your dog eat?', { n: res.calls.length });
}
{
  const { res } = await dogTalk(['Nice! How about you?']);
  ok('①-11b 맞장구(How about you?)는 같은 질문으로 보지 않는다', res.calls.length === 1, { n: res.calls.length });
}
{
  const g = await guest();
  seedRows(g.uid, [['user', 'I like games.', 2 * MIN], ['assistant', 'That sounds so fun, I love playing games with my friends too!', 1.9 * MIN]]);
  script = seq(['That sounds so fun, I love playing games with my friends too!', 'Cool! What game do you play?']);
  const res = await chat(g, 'Yes.');
  ok('①-12 글자 그대로 되풀이한 답(질문 없음)은 예전처럼 «You already said that» 으로 다시 뽑는다', kinds(res)[1] === 'generic' && res.reply === 'Cool! What game do you play?', { kinds: kinds(res), reply: res.reply });
}

{
  // ③ 다시 뽑은 것이 «새 질문» 인데 앞 답장과 첫머리가 거의 같아(글자 반복) 떨어지면 일반 힌트로 한 번 더 묻는다.
  const g = await guest();
  seedRows(g.uid, [['user', 'Hi!', 6 * MIN], ['assistant', 'That sounds really fun! Do you like pizza?', 5.9 * MIN], ['user', 'Yes.', 5.5 * MIN],
    ['assistant', 'Nice! Is your dog big?', 4.9 * MIN]]);
  script = seq(['Wow! Is your dog small?', 'That sounds really fun! Do you like apples?', 'Cool! What color is your dog?']);
  const res = await chat(g, SAID);
  ok('①-13 새 질문인데 첫머리가 앞 답장과 같아 떨어지면 «You already said that» 으로 한 번 더 묻고 받는다', res.reply === 'Cool! What color is your dog?' && kinds(res).join() === 'first,repeat,generic', { reply: res.reply, kinds: kinds(res) });
}

{
  // 글자 반복만 있던 턴에서 다시 뽑은 것도 글자 반복이면 «한 번만» — 같은 질문이 없으면 ③(한 번 더)는 안 돈다.
  const g = await guest();
  seedRows(g.uid, [['user', 'I like games.', 2 * MIN], ['assistant', 'That sounds so fun, I love playing games with my friends too!', 1.9 * MIN]]);
  const same = 'That sounds so fun, I love playing games with my friends too!';
  script = seq([same, same, 'Cool! What game do you play?']);
  const res = await chat(g, 'Me too.');
  ok('①-12b 글자 반복만 있던 턴은 다시 뽑기가 또 반복이어도 한 번에서 멈춘다(③은 같은 질문이 있을 때만)', res.calls.length === 2 && kinds(res).join() === 'first,generic', { kinds: kinds(res), reply: res.reply });
}
{
  // 처음 답에 같은 질문이 둘, 다시 뽑은 것에는 하나 → «줄었으니» 받는다(받는 조건 «없거나 줄었고»).
  const { res } = await dogTalk(['Wow! Do you have a dog? Is your dog small?', 'Cool! Is your dog small?', 'Okay! Is your dog little?']);
  ok('①-14 같은 질문이 줄면 받는다(둘 → 하나) — 그다음 재시도가 안 줄면 앞의 것을 둔다', res.reply === 'Cool! Is your dog small?' && res.calls.length === 3, { reply: res.reply, kinds: kinds(res) });
}
{
  // 처음엔 1시간 넘게 이어진 대화 — 이웃 메시지 간격은 모두 1시간 안이라 «같은 대화» 다.
  const g = await guest();
  seedRows(g.uid, [
    ['user', 'Hi!', 100 * MIN], ['assistant', 'Hi! Is your dog big?', 99.5 * MIN], ['user', 'No, he is small.', 99 * MIN],
    ['assistant', 'Cute! Do you like pizza?', 60 * MIN], ['user', 'Yes.', 59.5 * MIN],
    ['assistant', 'Yum! Do you play soccer?', 25 * MIN],
  ]);
  script = seq(['Great! Is your dog little?', 'Cool! What color is your dog?']);
  const res = await chat(g, 'Yes.');
  ok('①-5d 간격마다 1시간 안이면 처음부터 같은 대화 — 99분 전에 물은 질문도 기억한다', res.calls.length === 2 && res.reply === 'Cool! What color is your dog?', { n: res.calls.length, reply: res.reply });
}

// ── 🐢 «다시·천천히·모르겠어요» — 그때 방금 질문을 다시 묻는 것은 반복이 아니라 요청을 들어주는 것(2026-10-28 함정 대조 실측) ──
// (2026-10-28 사장님 「what?·huh? 같은 되묻기도 요청으로 처리해줘」) «그 말만» 한 되묻기(What?·Huh?·뭐라고?)도 같은 요청이다.
for (const [say, reply] of [['Can you say that again slowly?', 'Sure! Is your dog big?'], ['천천히 말해줘', 'Okay! Is your dog big?'], ["I don't understand.", 'Sorry! Is your dog big?'],
  ['What?', 'Sure! Is your dog big?'], ['huh', 'Okay! Is your dog big?'], ['뭐라고?', 'Sorry! Is your dog big?']]) {
  const g = await guest();
  seedRows(g.uid, DOG());
  script = seq([reply, 'Okay! What color is your dog?']);
  const res = await chat(g, say);
  const sys = String(res.calls[0]?.o?.messages?.[0]?.content || '');
  ok(`①-15 «${say}» 에 방금 질문을 다시 물으면 그대로 둔다(새 질문으로 안 바꾼다)`, res.calls.length === 1 && res.reply === reply, { n: res.calls.length, reply: res.reply, kinds: kinds(res) });
  ok(`①-15 «${say}» 턴의 지시 줄에는 방금 질문이 없고 그 앞 질문은 있다`, sys.includes(M.ASKED_LINE_HEAD) && !sys.includes('"Nice! Is your dog big?"') && !sys.includes('"Is your dog big?"') && sys.includes('Do you have a dog?'), sys.slice(-500));
  const msgs = res.calls[0]?.o?.messages || [];
  ok(`①-15 «${say}» 턴에는 «다시·천천히 해 달라» 지시(metaHint)도 실린다(판정과 지시가 안 갈린다)`, String(msgs[msgs.length - 1]?.content || '').includes('[The student is asking you to slow down'), String(msgs[msgs.length - 1]?.content || '').slice(-200));
}
for (const say of ['What about you?', '네', 'What is that?', "No, he can't catch it.", '그 노래 못 들었어요', "Let's play one more time!", 'A snail is slow.', '천천히 걸어요', '얼룩말이 너무 빨라요', 'Excuse me.']) {
  // 짝: 문장 속 what·물음표 없는 «네(=yes)» 는 되묻기가 아니라 답이다 — 방금 질문을 또 물으면 막는다.
  const g = await guest();
  seedRows(g.uid, DOG());
  script = seq(['Me too! Is your dog big?', 'Okay! What color is your dog?']);
  const res = await chat(g, say);
  ok(`①-15f «${say}» 는 답이다 — 방금 질문을 또 물으면 막는다(짝)`, res.calls.length === 2 && res.reply === 'Okay! What color is your dog?', { n: res.calls.length, reply: res.reply });
}
{
  // 짝 — 요청 턴이어도 «그 앞에» 물어 답을 들은 질문을 다시 물으면 막는다(전부 풀어 주기 금지).
  const g = await guest();
  seedRows(g.uid, DOG());
  script = seq(['Sure! Do you have a dog?', 'Okay! What color is your dog?']);
  const res = await chat(g, 'Can you say that again slowly?');
  ok('①-15b 요청 턴이어도 그 앞에 물은 질문(Do you have a dog?)은 그대로 막는다(짝)', res.calls.length === 2 && res.reply === 'Okay! What color is your dog?', { n: res.calls.length, reply: res.reply });
}
{
  const g = await guest();
  seedRows(g.uid, DOG());
  script = seq(['Sure! Is your dog big?', 'Okay! What color is your dog?']);
  const res = await chat(g, 'Can you say that again slowly?', { stream: 1 });
  ok('①-15c 요청 턴의 미리듣기는 방금 질문까지 끝까지 나간다(멈추지 않음)', res.sent.join(' ') === 'Sure! Is your dog big?' && res.replaced === 0 && res.calls.length === 1, { sent: res.sent, replaced: res.replaced });
}
{
  // 요청 «뒤» 에 학생이 답했으면 그 질문은 다시 «다룬 것» — 다음 턴에 또 물으면 막는다.
  const g = await guest();
  seedRows(g.uid, [...DOG(2 * MIN), ['user', 'Can you say that again slowly?', 2.5 * MIN], ['assistant', 'Sure! Is your dog big?', 2.4 * MIN]]);
  script = seq(['Wow! Is your dog small?', 'Cool! What color is your dog?']);
  const res = await chat(g, SAID);
  ok('①-15d 다시 물은 질문에 학생이 답한 뒤에는 그 질문을 또 막는다', res.calls.length === 2 && res.reply === 'Cool! What color is your dog?', { n: res.calls.length, reply: res.reply });
}
for (const [ans, blocked] of [['Can you say that again slowly?', false], ['No, he is small.', true]]) {
  // 크기를 물었고 학생이 그때 «다시·천천히» 만 부탁하고 AI 가 다른 이야기로 넘어갔다 → 크기 질문은 아직 답을 안 들었다.
  const g = await guest();
  seedRows(g.uid, [['user', 'Hi!', 8 * MIN], ['assistant', 'Hi! Is your dog big?', 7.9 * MIN], ['user', ans, 7.5 * MIN], ['assistant', 'Sure! Do you like pizza?', 7.4 * MIN]]);
  script = seq(['Yum! Is your dog big?', 'Cool! What color is your dog?']);
  const res = await chat(g, 'Yes.');
  ok(blocked ? '①-15e 그때 학생이 답했으면(No, he is small.) 나중에 다시 물어도 막는다(짝)' : '①-15e 그때 학생이 «다시·천천히» 만 했으면 그 질문은 아직 안 다룬 것 — 나중에 물어도 막지 않는다',
    blocked ? (res.calls.length === 2 && res.reply === 'Cool! What color is your dog?') : (res.calls.length === 1 && res.reply === 'Yum! Is your dog big?'), { n: res.calls.length, reply: res.reply });
}
{
  // 잘린 말 — «다시 말해 줄래?» 는 내용 없는 되묻기라 앞서 한 번 했어도 반복이 아니다.
  const g = await guest();
  seedRows(g.uid, [
    ['user', 'Hi!', 8 * MIN], ['assistant', 'Hi! Do you have a dog?', 7.9 * MIN], ['user', 'I', 7.5 * MIN],
    ['assistant', 'Oops! Can you say the whole sentence again?', 7.4 * MIN], ['user', 'I have a dog.', 7 * MIN],
    ['assistant', 'Nice! Is your dog big?', 6.9 * MIN],
  ]);
  script = seq(['Sorry, can you say the whole sentence again?', 'Okay! What color is your dog?']);
  const res = await chat(g, 'and my');
  ok('①-16 잘린 말에 «다시 말해 줄래?» 를 또 묻는 것은 그대로 둔다(앞서 한 번 했어도)', res.calls.length === 1 && res.reply === 'Sorry, can you say the whole sentence again?', { n: res.calls.length, reply: res.reply, kinds: kinds(res) });
}
{
  const g = await guest();
  seedRows(g.uid, DOG());
  script = seq(['Sorry! Is your dog big?', 'Okay! What color is your dog?']);
  const res = await chat(g, 'and my');
  ok('①-16b 잘린 말 턴에 방금 질문을 다시 물으면 그대로 둔다', res.calls.length === 1 && res.reply === 'Sorry! Is your dog big?', { n: res.calls.length, reply: res.reply });
}
{
  // 정본 판정의 짝: 요청이 아닌 평범한 답이면 예전처럼 기억한다.
  const mem = M.questionMemory([{ role: 'assistant', content: 'Is your dog big?' }], 'No, small.');
  const memR = M.questionMemory([{ role: 'assistant', content: 'Is your dog big?' }], 'Say it again please.');
  const memO = M.questionMemory([{ role: 'assistant', content: 'Is your dog big?' }], 'No, small.', { reask: true });
  ok('①-17 정본: 평범한 답이면 기억하고 · 요청이면 빼고 · opts.reask 가 이번 말 판정을 덮어쓴다', !!mem && mem.items.length === 1 && memR === null && memO === null, { mem: mem && mem.items.length, memR, memO });
  ok('①-17 정본: «다시 말해 줄래?» 류는 기억도 판정도 안 한다', M.questionMemory([{ role: 'assistant', content: 'Oops! Can you say it again?' }], 'I have a dog.') === null
    && M.repeatedQuestions('Sorry, can you say that again?', mem).length === 0 && M.isAskAgainQuestion("Sorry, I didn't catch that — can you say it again?") === true, '');
}
{
  // 두 곳(정본 isReaskRequest · api-ai.ts aiFriendIsMetaAsk)이 어긋나지 않는가 — 정본이 «요청» 이면 지시(metaHint)도 반드시 켜져야 한다.
  const at = src.indexOf('const aiFriendIsMetaAsk');
  const body = at > 0 ? src.slice(at, src.indexOf('\n    /*', at)) : '';
  const lits = [...body.matchAll(/\/(.+?)\/([a-z]*)\.test\(/g)].map((m) => new RegExp(m[1], m[2]));
  const meta = (t) => lits.some((re) => re.test(t));
  const ECHOES = ['What?', 'what', 'Huh?', 'huh', 'Eh?', 'Sorry?', 'Excuse me?', 'Pardon?', 'Pardon me?', 'Come again?', 'Say what?', 'Wait, what?', 'Um, what?', 'What was that?', 'WHAT?!',
    'What did you say?', 'What do you mean?', "I didn't hear you.", "I can't hear you", "Sorry, I didn't catch that.", 'Can you say again?', 'One more time, please.',
    '뭐라고?', '뭐라고요?', '뭐?', '뭐요?', '네?', '응?', '예?', '뭐라고 하셨어요?', '잘 안 들려요', '못 들었어요',
    // 함정 대조(2026-10-28)가 놓친다고 짚은 되묻기
    'Again?', 'Again, please.', 'Once more?', 'Tell me again.', 'What? What?', 'Huh? What?', 'Huh, what?', 'What did you said?', 'What you say?', 'What did you ask?',
    'What was the question?', 'What does that mean?', 'Slower please.', 'Speak slower.', 'Louder please.', 'Speak up please.', "I can't hear.", "I can't hear well.",
    "Sorry, I didn't hear.", "I don't hear you.", 'I do not understand.', "Don't understand.", "I can't understand you.", 'What? 😅', 'Whaaat?',
    '어?', '에?', '엥?', '다시요?', '다시 한번요', '한 번 더요', '네? 뭐라고요?', '응? 뭐?', '뭐라고 하셨죠?', '뭐라고 했니?', '무슨 말이에요?', '무슨 뜻이에요?',
    '이해가 안 돼요', '이해 못 했어요', '소리가 작아요', '안 들려요', '소리가 안 들려요',
    // «요청하는 모양» 으로 좁힌 뒤에도 잡혀야 하는 것(2026-10-28 원래부터 있던 오판 수리)
    '천천히', '천천히요', '느리게', '짧게', '천천히 해 주세요', '너무 빠르게 말해요', '너무 빨라요', '크게 말해줘', '짧게 말해 주세요',
    'Repeat.', 'Can you repeat?', 'Please repeat that.', 'Sorry, say it again.', 'Speak more slowly please', 'Easier please', 'Use easy words, please', "I can't understand you 😅"];
  const ANSWERS = ['What about you?', 'What is that?', 'What is your name?', "I don't know what to say.", 'What a big dog!', 'Sorry, I mean small.', 'I like what you said.', 'What I like is pizza.',
    '네', '응', '예', '영어로 뭐라고 해요?', '개 이름을 뭐라고 해요?', "I didn't hear about it.", "I'm sorry.", 'Guess what?', 'I like it, huh.',   // 끝에만 그 말이 오는 답(앞 ^ 를 풀면 걸린다)
    // 함정 대조(2026-10-28)가 실제 정본으로 재현한 «진짜 답» — 듣기·잡기·한 번 더를 문장 어디서나 받으면 걸린다(그 질문이 기억에서 빠진다)
    "No, I can't catch it.", "My dog can't catch it.", "I didn't catch it.", "No, I didn't catch that fish.", "He couldn't catch it.", "I can't catch you!",
    "No, I didn't hear it.", "I couldn't hear it, it was quiet.", "No, I didn't hear that song.", "I can't hear it.", 'One more time!', "Let's play one more time!",
    'I want to try one more time.', 'I watched it one more time.', 'Yes! One more time please!', 'What do you say to your mom?', 'I know what do you mean.', 'Pardon is a nice word.',
    '아니요, 안 들려요', '새 소리가 안 들려요', '아니요 못 들었어요', '그 노래 못 들었어요', '잘 안 들렸어요 그래서 다시 물어봤어요',
    'What color?', '네.', '에', '어', 'eh', '뭐든지 좋아요', 'Uh...', 'Um, pizza.', 'Wait.', 'Oh!', 'Hmm, blue.',
    // 원래부터(#1871 이전) 되묻기로 잘못 걸리던 진짜 답 — slow·천천히·빠르·easier·다시 해·say it again 을 낱말 하나로 받으면 걸린다
    'A snail is slow.', "No, it's slow.", 'My turtle walks slowly.', '천천히 걸어요', '빠르게 달려요', '네 다시 해요', 'Math is easier.', 'My hair is shorter.', '쉽게 했어요',
    'My bird can say it again.', "No, I don't understand math.", 'Slow.', 'Slowly.', 'Easier.', 'My dog runs too fast.', 'My mom talks too fast.', 'Cars go slow in the snow.',
    'Can we play again, please?', '천천히 해요', 'He reads slowly.', 'I repeat the words every day.', 'Shorter is better.',
    // 함정 대조 2회차(2026-10-28) — 넓힌 줄이 새로 만들던 오판(말=동물 · 크게 말해요 · so fast · 고르기 답)
    '네, 말이 빨라요', '얼룩말이 너무 빨라요', '조랑말이 빨라요', '말 빨라요', '할머니한테 크게 말해요', '도서관에서 크게 말하면 안 돼요', '크게 말했어요', '크게 해 줘서 좋았어요',
    '간단히 말하면 좋아요', '또박또박 말해요', 'They are talking so fast.', 'People on TV talk so fast.', 'Easy, please. I like easy games.', 'Easy please.', 'Short, please.',
    'Simple, please.', 'I can explain it simply.',
    // 엘리더잼 책 문항의 짧은 답(b08-q13·b12-q09·b18-q06·b08-q20·b20) — 그리고 주어가 따로 있는 진술
    'Excuse me.', 'Excuse me!', 'Um, excuse me.', 'Sorry.', 'Sorry!', 'Oh, sorry!', '다시 해 봐요', 'They slow down and look.', 'Walk slowly, please.',
    'I speak slowly.', 'I say it slowly.', 'I read it slowly.', 'I talk more slowly to babies.', '선생님이 천천히 말했어요', '아빠는 천천히 말해요', '다시 말했어요',
    '친구랑 다시 얘기했어요', 'I repeat it every day.', 'My sister is talking too fast.', "No, he can't understand.", "My dog can't understand.",
    'My baby brother does not understand.', 'Cars slow down at school.', '말이 빠르게 달려요', '천천히 말을 타요', '다시 말을 탔어요', '한 번만 말을 타 봤어요',
    '쉽게 해 줄 수 있어요', '엄마 얼굴 못 알아봤어요',
    // 함정 대조 3회차 — 엘리더잼 책 질문에 아이가 할 법한 답(주어 없는 명령형 포함)·칭찬·진술(«말해요·줘야·줘서»)·뒤에 이야기가 이어지는 말
    'Slow down and look.', 'Yes. Slow down and look.', 'No, slow down.', 'Talk slowly.', 'Talk slowly and quietly.', 'Speak slowly to babies.', 'Yes, say it slowly!', 'Yes! Say it again!',
    'Repeat the words.', 'Repeat, repeat!', 'Make it easier!', 'Make it short.', 'I can make it easier.', 'You are so fast!', "You're so fast!", "I didn't understand it, but it was fun.",
    "I don't understand it but it is fun.", 'Excuse me, please.', 'I say excuse me.', 'Sorry, sorry!', 'Excuse me, excuse me.', 'Sorry, I mean slow.', 'Slow!', 'So slow!', 'Very slow.',
    "It's slow.", 'Slow, slow.', 'Short.', 'I am short.', 'Short!', 'Yes, easy games.', 'Easy games, please.', 'Yes, slowly.', 'Yes, slowly and quietly.', 'Please help me.', 'Help me, fast!',
    '느려요', '천천히 가요', '네, 천천히요', '아니요 천천히', '네, 너무 빨라요', '아기한테는 천천히 말해 줘야 돼요', '할머니한테 크게 말해 줘야 해요', '형은 빠르게 말해요', '아빠는 빠르게 말해요',
    '빠르게 말하면 재밌어요', '우리 강아지는 제 말을 못 알아들어요', '할머니가 영어를 못 알아들어요', '몰라요', '다시 해 볼게요', '다시 해요', '다시 써요', '한 번 더 말해요', '또박또박 말해요', 'I speak up in class.', 'My dad can speak louder than me.', 'We repeat it every day.'];
  // «요청이다» 를 단언하는 목록 — 이것이 없으면 요청 모양을 통째로 지워도 초록이다(함정 대조 2회차 변이 실측 12종 통과).
  const REQUESTS = ['Can you say that again slowly?', 'slow down please', 'Can you slow down?', 'too fast!', 'say it again', 'again please', 'Repeat please.', "I don't understand.",
    'I dont understand', 'simpler please', 'shorter please', '천천히 말해줘', '느리게', '너무 빠르다', '다시 말해줘', '다시 해줘', '못 알아들었어', '모르겠어요', '쉽게 말해줘', '짧게',
    'Slow please', 'Slow, please.', '좀 천천히', '좀 천천히요', '더 천천히', '더 천천히요', '조금 천천히', '조금만 천천히', '천천히 좀', '더 느리게', '좀 느리게', '더 쉽게', '좀 쉽게', '더 짧게',
    'Louder', "I don't understand it", "I don't understand this", "I don't understand English", "I don't understand your question", "I don't understand the word",
    "I don't understand what you're saying", "I can't understand English", "I can't understand it", 'Repeat again', 'Repeat again please', 'Repeat one more time',
    'Repeat the sentence', 'Once again please', "You're too fast", 'You are too fast.', 'Too fast, slow please', 'Your voice is too fast', 'More slowly', 'Can you make it easier?',
    'um say it again', 'sorry say it again', '천천히 해', '천천히 읽어 줘', '천천히 다시', '다시 천천히', '다시 천천히요', '느리게 해', '쉽게 설명해 줘', '쉽게 설명해 주세요',
    '너무 빨라요 천천히요', 'A little slower please', 'You talk so fast', 'Simple words please', 'Explain it simply', '간단히', '한 번 더 말해 주세요', '빠르게 말해서 못 알아들었어요',
    'Please speak slowly.', 'Speak up please.', "I didn't hear you.",
    // 함정 대조 3회차 — 반말·말씀·듣·줄 수·주시겠어요·빨리·a bit more slowly 등 새로 놓치던 요청, 그리고 지워도 초록이던 요청 모양
    '천천히 말해', '다시 말해', '다시 말해 봐', '다시 말해봐요', '천천히 말씀해 주세요', '다시 말씀해 주세요', '다시 한 번 말씀해 주세요', '못 알아듣겠어요', '잘 못 알아듣겠어',
    '못 알아 듣겠어요', '알아듣기 힘들어요', '못 알아들어요', '천천히 말해 줄 수 있어요?', '다시 말해 줄 수 있어요?', '천천히 말해 주실 수 있어요?', '다시 말해 주시겠어요?',
    '너무 빨리 말해요', '이해가 안 가요', '쉬운 말로 해 주세요', '다시 말해 줄래?', '천천히 말해줘요', '다시 한 번 말해 주세요', '또박또박 말해 주세요', '간단히 말해 주세요',
    'Can you speak a little slower?', 'Can you speak a bit more slowly?', 'Could you talk a little slower?', 'Can you go slower?', 'Go slower, please.', 'Can you say it a little slower?',
    'Too fast for me!', 'Too fast, teacher!', 'Talking too fast.', 'You speak very fast.', 'You talk really fast.', 'Can you say that one more time?', "I don't understand anything.",
    "I don't really understand.", "Don't understand, sorry.", 'Not understand.', "I don't understand what that means.", 'Too hard, easier please.', 'Can you use easy words?',
    'Use simple words.', 'Please speak English slowly.', 'Huh? Slow down.', 'Speak slowly, please.', 'Can you repeat that?', 'I don’t understand.', 'I can’t hear you', 'Sorry, louder.',
    'Sorry, what?', 'Excuse me, what?', 'Can you talk slowly?', "I didn't understand.", 'ok say it again', 'oh say it again', 'Please slower', 'Sorry, say it again.',
    'Too fast, slow please', 'What? Too fast!', 'Speak slower.', 'Say again.'];
  const SAMPLES = ['Can you say that again slowly?', 'slow down please', 'too fast!', 'say it again', 'again please', 'Repeat please.', "I don't understand.", 'I dont understand',
    'simpler please', 'easier', 'shorter please', '천천히 말해줘', '느리게', '너무 빠르다', '다시 말해줘', '다시 해줘', '못 알아들었어', '모르겠어요', '쉽게 말해줘', '짧게',
    "I don't know.", 'Yes.', 'No, small.', 'I like it a lot.', 'Because it is fun.', 'Every day!', '작아요', 'My dog is white.', ...ECHOES, ...REQUESTS, ...ANSWERS];
  const bad = SAMPLES.filter((t) => M.isReaskRequest(t) && !meta(t));
  ok('①-18 정본이 «요청» 이라 하면 aiFriendIsMetaAsk 도 요청이다(지시와 판정이 안 갈린다)', lits.length === 3 && bad.length === 0, { n: lits.length, bad });
  /* 표본 대조만으로는 표본에 없는 낱말로 두 곳이 갈라져도 초록이다(함정 대조 변이 실측: 정본에만 louder·again 을 더해도 통과).
     그래서 정규식 «원문» 을 직접 견준다 — 한국어·«그 말만» 줄은 글자 그대로 같고, 영어 줄은 «I don't know» 하나만 더 받는다. */
  const same = (a, b) => !!a && !!b && a.source === b.source && a.flags === b.flags;
  const enMeta = lits[1] ? new RegExp(lits[1].source.replace("\\bi don['’]?t know\\b|", ''), lits[1].flags) : null;   // 지시 쪽 영어 줄 = «I don't know» + 정본
  ok('①-18 두 곳의 정규식 원문이 같다(한국어·그 말만 = 그대로 · 영어 = «I don\'t know» 만 더)', same(lits[0], M.QM_REASK_KO) && same(enMeta, M.QM_REASK_EN) && same(lits[2], M.QM_REASK_ECHO)
    && lits[1].source !== enMeta.source, { ko: same(lits[0], M.QM_REASK_KO), en: same(enMeta, M.QM_REASK_EN), echo: same(lits[2], M.QM_REASK_ECHO) });
  const missed = [...ECHOES, ...REQUESTS].filter((t) => !M.isReaskRequest(t)), wrong = ANSWERS.filter((t) => M.isReaskRequest(t) || (meta(t) && !/i don'?t know/i.test(t)));   // 지시 쪽은 «I don't know» 만 더 받는다
  ok('①-18 «What?·Huh?·뭐라고?·네?» 같은 되묻기는 요청이고 · 문장 속 what·물음표 없는 «네»·«영어로 뭐라고 해요?» 는 답이다(짝)', missed.length === 0 && wrong.length === 0, { missed, wrong });
  ok('①-18 «I don\'t know»·평범한 답은 요청이 아니고 · «I don\'t understand»·「모르겠어요」·「천천히」는 요청이다(짝)',
    !M.isReaskRequest("I don't know.") && !M.isReaskRequest('No, small.') && !M.isReaskRequest('My dog is white.')
    && M.isReaskRequest("I don't understand.") && M.isReaskRequest('모르겠어요') && M.isReaskRequest('천천히 말해줘'), '');
  /* 속도 — 정규식은 길이에 비례해야 한다(함정 대조 3회차 실측: 「(말)\s*해?\s*(줘)」 꼴이 «천천히 말» + 공백 14만 자에 8초).
     isReaskRequest 는 1,000자에서 자르므로 «정규식 자체» 를 정본·지시 쪽 모두 직접 잰다. 선형이면 5만 자에 수십 ms, 제곱이면 1초가 넘는다. */
  const KEYS = ['천천히 말', '천천히 말해', '천천히', '다시', '못 알아', '너무', '한 번', '쉬운 말로', 'you', 'please', 'sorry', 'too fast', 'what', '네?', "i don't understand", 'say it', 'speak'];
  const RES = [M.QM_REASK_KO, M.QM_REASK_EN, M.QM_REASK_ECHO, ...lits];
  let worst = 0, worstAt = '';
  for (const k of KEYS) for (const sep of [' ', ', ', '?']) {
    const t = k + sep.repeat(50000) + 'x', t0 = performance.now();
    for (const re of RES) re.test(t);
    const d = performance.now() - t0;
    if (d > worst) { worst = d; worstAt = JSON.stringify(k) + ' + ' + JSON.stringify(sep) + ' × 50000'; }
  }
  ok('①-18 되묻기 정규식이 긴 입력에서도 빠르다(키워드 × 공백 5만 자 — 정본·지시 쪽 모두 1초 안)', worst < 1000, { ms: Math.round(worst), at: worstAt });
  ok('①-18 1,000자가 넘는 말은 되묻기로 안 본다 · 그 안이면 본다(짝)', M.isReaskRequest('천천히 말해 줘' + ' '.repeat(990)) && !M.isReaskRequest('천천히 말해 줘' + ' '.repeat(1000)) && M.QM_REASK_MAX_LEN === 1000, '');
}

// ─── ② 샌드박스 ──────────────────────────────────────────────────────────────
console.log('② 샌드박스 — 실제 핸들러로 대화 수백 번');
const GENERIC_HINT = '(You already said that. Say something completely different in new words, and ask a different question. Keep it to 1-2 short sentences.)';
ok('② 예전 방식 흉내의 힌트가 지금 소스의 글자 힌트와 같다(전제)', src.includes(GENERIC_HINT));
const kit = talkKit(M, /was already asked in this chat|You already said that/);
const t0 = realNow();
const stat = MODES.map(() => ({ convs: 0, streamConvs: 0, turns: 0, first: 0, oldFinal: 0, newFinal: 0, retries: 0, retryTurns: 0, needTurns: 0, fa: 0, miss: 0, promptMiss: 0, streamRep: 0, replacedBad: 0, notDone: 0, maxPerTurn: 0, notOk: 0 }));
for (let mi = 0; mi < MODES.length; mi++) {
  const { drift, obey } = MODES[mi];
  const S = stat[mi];
  for (let ti = 0; ti < TOPIC_SETS.length; ti++) for (let seed = 1; seed <= SEEDS; seed++) {
    const seedNo = seed * 7919 + ti * 131 + mi;
    const talk = kit.makeTalk(seedNo, TOPIC_SETS[ti], drift, obey);
    const talkOld = kit.makeTalk(seedNo, TOPIC_SETS[ti], drift, obey);
    const g = await guest();
    const stream = (seed + ti) % 2 === 1;
    const level = seed % 3 === 0 ? 'S4' : 'S6';
    let hist = [], histOld = [], said = 'Hi!', saidOld = 'Hi!';
    const turns = 14 + (seed % 7);
    S.convs++;
    if (stream) S.streamConvs++;
    for (let t = 0; t < turns; t++) {
      S.turns++;
      let first = null, sys = '';
      script = (o) => {
        const k = kindOf(o);
        if (k === 'first') { first = talk.first(); sys = String(o.messages[0].content || ''); return first; }
        if (k === 'repeat' || k === 'generic') return talk.retry(o.messages);
        return String(o.messages[o.messages.length - 2].content || '');   // 이름·짧게: 같은 답을 돌려줌(바꾸지 않음)
      };
      const res = await chat(g, said, { level, ...(stream ? { stream: 1 } : {}) });
      if (res.ok !== true || typeof res.reply !== 'string') { S.notOk++; break; }
      const firstRep = kit.repeatsIn(first, talk.covered);
      const oldRep = aiIsRepeat(first, hist.slice(-20));
      const rk = kinds(res).filter((k) => k === 'repeat' || k === 'generic').length;
      if (firstRep) S.first++;
      S.retries += rk;
      if (rk) S.retryTurns++;
      S.maxPerTurn = Math.max(S.maxPerTurn, rk);
      if (firstRep || oldRep) S.needTurns++;
      if (rk && !firstRep && !oldRep) S.fa++;
      if (firstRep && !rk) S.miss++;
      if (t > 0 && !sys.includes(M.ASKED_LINE_HEAD)) S.promptMiss++;
      if (kit.repeatsIn(res.reply, talk.covered)) {
        S.newFinal++;
        if (process.env.AIF_DEBUG) console.log('    [debug]', JSON.stringify({ mode: mi, ti, seed, t, stream, level, said, first, reply: res.reply, kinds: kinds(res), covered: [...talk.covered], qs: M.questionsIn(res.reply) }));
      }
      if (stream) {
        if (res.done !== 1) S.notDone++;
        for (const s of res.sent) if (kit.repeatsIn(s, talk.covered)) S.streamRep++;
        const st = res.sent.join(' ').trim();
        if (st && st !== res.reply.trim() && res.replaced !== 1) S.replacedBad++;
      }
      hist = hist.concat([{ role: 'user', content: said }, { role: 'assistant', content: res.reply }]);
      said = talk.answer(res.reply);
      // 예전 방식 — 같은 씨앗, 글자 비교 한 번(main 의 옛 코드)
      const f0 = talkOld.first();
      let res0 = f0;
      if (aiIsRepeat(f0, histOld.slice(-20))) {
        const r0 = talkOld.retry([{ role: 'user', content: GENERIC_HINT }]);
        if (r0 && !aiIsRepeat(r0, histOld.slice(-20))) res0 = r0;
      }
      if (kit.repeatsIn(res0, talkOld.covered)) S.oldFinal++;
      histOld = histOld.concat([{ role: 'user', content: saidOld }, { role: 'assistant', content: res0 }]);
      saidOld = talkOld.answer(res0);
    }
  }
}
let convs = 0, turns = 0;
MODES.forEach((m, k) => {
  const S = stat[k];
  convs += S.convs; turns += S.turns;
  const label = `drift ${m.drift} · 다시 뽑을 때 따름 ${m.obey}`;
  console.log(`  · ${label}: 대화 ${S.convs}(스트리밍 ${S.streamConvs}) · 턴 ${S.turns} · 처음 답의 같은 질문 ${S.first} · 예전 방식이면 학생에게 나감 ${S.oldFinal} → 지금 ${S.newFinal} · 다시 뽑기 ${S.retries}회(${S.retryTurns}턴)`);
  ok(`②(${label}) 핸들러가 매 턴 정상으로 답했다`, S.notOk === 0, S.notOk);
  ok(`②(${label}) 거짓 경보 없음 — 새 질문을 «같다» 며 다시 뽑지 않는다`, S.fa === 0, S.fa);
  ok(`②(${label}) 놓침 없음 — 같은 질문이면 다시 뽑는다`, S.miss === 0, S.miss);
  ok(`②(${label}) 둘째 턴부터 지시에 «이미 물은 질문» 줄이 늘 실린다`, S.promptMiss === 0, S.promptMiss);
  ok(`②(${label}) 예전 방식이면 같은 질문이 학생에게 나간다(전제 — 시험이 헛돌지 않게)`, S.oldFinal > 0, S.oldFinal);
  if (m.obey === 1) ok(`②(${label}) 같은 질문이 학생에게 한 번도 안 나간다`, S.newFinal === 0, S.newFinal);
  else {
    ok(`②(${label}) 다시 뽑기를 어겨도 예전보다 크게 줄어든다(≤ 예전의 10%)`, S.newFinal <= Math.ceil(S.oldFinal * 0.10), { old: S.oldFinal, now: S.newFinal });
    ok(`②(${label}) 첫 재시도가 또 같으면 두 번째 재시도가 실제로 돈다(전제)`, S.retries > S.retryTurns, { retries: S.retries, retryTurns: S.retryTurns });
  }
  ok(`②(${label}) 다시 뽑기는 같은 질문(또는 글자 반복)이 있는 턴에만 한다`, S.retryTurns <= S.needTurns, { retryTurns: S.retryTurns, needTurns: S.needTurns });
  ok(`②(${label}) 한 턴에 다시 뽑기는 최대 두 번`, S.maxPerTurn <= 2, S.maxPerTurn);
  ok(`②(${label}) 스트리밍 대화를 실제로 돌렸다(전제)`, S.streamConvs > 0, S.streamConvs);
  ok(`②(${label}) 미리듣기로 같은 질문이 한 번도 안 나간다`, S.streamRep === 0, S.streamRep);
  ok(`②(${label}) 미리듣기와 정본이 다르면 언제나 replaced:1 이다`, S.replacedBad === 0 && S.notDone === 0, { replacedBad: S.replacedBad, notDone: S.notDone });
});
ok(`② 대화 수백 번을 실제 핸들러로 돌렸다(전제) — 대화 ${convs} · 턴 ${turns}`, convs >= 300 && turns >= 4000, { convs, turns });
console.log(`  (샌드박스 ${((realNow() - t0) / 1000).toFixed(1)}초)`);
finish();

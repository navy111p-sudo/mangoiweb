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
live('questionMemory(questionSession(historyAll, latT0), msg)', '기억은 «지금 이어지는 대화» 로 만든다');
live('${askedLine}', '지시에 «이미 물은 질문» 줄을 싣는다');
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
  const body = { uid: g.uid, msg, level: 'S6', friend: 'lily', ...extra };
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

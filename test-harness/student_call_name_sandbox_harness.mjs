#!/usr/bin/env node
/* 🧪 AI 영어친구가 학생을 «아이디» 로 부르지 않는가 — 실제 처리기 샌드박스 (2026-11-01 「Yay, ysyt01!」)
   EN: Run the REAL /api/ai/chat-friend handler hundreds of times; the student's login ID must never reach the model or the reply.

   무엇을 보나
   - esbuild 로 handleAiApi 를 묶어 «진짜 SQLite» 위 가짜 D1 · 가짜 KV · «앵무새 AI» 에 물린다.
   - 앵무새 AI = 최악의 모델: 지난 답장의 「Yay, X!」 를 그대로 따라 하고, 없으면 프롬프트의 이름을 부른다.
     ⟹ 아이디가 모델에게 «한 글자라도» 닿으면 답장에 새어 나온다.
   - 무작위 학생 수백 명(씨앗 고정): 영어 이름 칸에 아이디(대소문자·공백 변형) · 빈 값 · 다른 아이디 모양 값 ·
     한글 이름만 · 정상 이름 — 그리고 절반은 «사고 직후» 처럼 예전 답장에 아이디가 박힌 기록으로 시작.
   - 기대값은 정본을 부르지 않고 «독립 오라클» 로 따로 계산한다(정본으로 정본을 검사하지 않게).
   검사(턴마다): 200·ok · 모델이 메시지를 받음 · 모델에게 보낸 글에 아이디 없음 · 답장에 아이디 없음 ·
                이름이 있으면 그 이름으로 부름 / 없으면 이름 없이(지어내지 않음).
   ⚠️ 수정 전 main 을 같은 샌드박스로 돌리면 학생 500명에 FAIL 2,038건(「Yay, PEORG72X0!」 재현) — 2026-11-01 실측.
   ⚠️ esbuild(cloudflare-deploy/node_modules)가 없으면 FAIL 로 말한다(건너뜀 아님 — 핵심을 못 잰 것).
   환경변수: CALLNAME_N(학생 수, 기본 300) · CALLNAME_SEED(씨앗) · CALLNAME_SRC_DIR(다른 소스로 돌리기 — 수정 전 대조용)
*/
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const SRC_DIR = process.env.CALLNAME_SRC_DIR ? path.resolve(process.env.CALLNAME_SRC_DIR) : path.join(root, 'cloudflare-deploy', 'src');
const N = Math.max(1, Math.floor(Number(process.env.CALLNAME_N) || 300));

let pass = 0, fail = 0;
const shown = [];
const ok = (name, cond, info) => {
  if (cond) { pass++; return; }
  fail++;
  if (shown.length < 12) { shown.push(name); console.log('  ❌ FAIL', name, info === undefined ? '' : '— ' + JSON.stringify(info).slice(0, 400)); }
};
const finish = () => {
  console.log(`student_call_name_sandbox_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
};

// ─── 실제 핸들러 묶기 ────────────────────────────────────────────────────────
const require = createRequire(path.join(root, 'cloudflare-deploy', 'package.json'));
let esbuild = null;
try { esbuild = require('esbuild'); } catch { esbuild = null; }
if (!esbuild) {
  ok('esbuild 가 있어 실제 핸들러를 돌렸다(전제 — cd cloudflare-deploy && npm ci)', false);
  finish();
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'callname-'));
const outFile = path.join(tmp, 'bundle.mjs');
try {
  await esbuild.build({
    stdin: { contents: "export { handleAiApi } from './api-ai'; export { signUidToken } from './auth-token';", resolveDir: SRC_DIR },
    bundle: true, platform: 'node', format: 'esm', outfile: outFile, logLevel: 'silent',
    nodePaths: [path.join(root, 'cloudflare-deploy', 'node_modules')],
  });
} catch (e) {
  ok('실제 핸들러를 묶었다(전제)', false, String(e?.message || e).slice(0, 300));
  finish();
}
const { handleAiApi, signUidToken } = await import(pathToFileURL(outFile).href);
fs.rmSync(tmp, { recursive: true, force: true });

// ─── 가짜 D1(진짜 SQLite) · KV · 앵무새 AI ───────────────────────────────────
const raw = new DatabaseSync(':memory:');
raw.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, english_name TEXT, korean_name TEXT, textbook TEXT, level TEXT)`);
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

let lastMessages = null;
const AI = {
  run: async (_model, opts) => {
    const msgs = (opts && opts.messages) || [];
    lastMessages = msgs;
    let name = '';
    for (let i = msgs.length - 1; i > 0 && !name; i--) {   // 지난 답장의 「Yay, X!」 를 따라 한다(사고가 굳던 방식)
      if (msgs[i].role !== 'assistant') continue;
      const m = /Yay, ([^!]+)!/.exec(String(msgs[i].content));
      if (m) name = m[1];
    }
    if (!name) { const m = /Their name is "([^"]+)"/.exec(String(msgs[0]?.content || '')); if (m) name = m[1]; }
    const reply = name ? `Yay, ${name}! Nice sentence! What did you play with your family?` : 'Great job! Nice sentence! What did you play with your family?';
    return { response: JSON.stringify({ reply, fix: null }) };
  },
};
const SECRET = 'harness-secret-0123456789abcdef-callname';
const env = { DB, AI, SESSION_STATE: KV, ROOM_JWT_SECRET: SECRET, JWT_SECRET: SECRET };

// ─── 무작위 학생(씨앗 고정) ──────────────────────────────────────────────────
let seed = Number(process.env.CALLNAME_SEED || 20261101) >>> 0;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const letters = 'abcdefghijklmnopqrstuvwxyz';
const mkUid = (i) => {
  const w = Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => pick(letters)).join('');
  const k = rnd();
  const base = k < 0.7 ? w + String(Math.floor(rnd() * 100)).padStart(2, '0') : k < 0.85 ? 'lt' + Math.floor(rnd() * 999) : w + '_' + Math.floor(rnd() * 9);
  return base + 'x' + i;   // 학생끼리 겹치지 않게
};
const EN = ['Amy', 'Brian', 'Chloe', 'Daniel', 'Emily', 'Mary Jane', 'Leo', 'Sophia', 'Noah', "O'Neil"];
const KO = ['김민서', '이서준', '박지우', '최하윤', '정우영'];
const caseVar = (s) => pick([s, s.toUpperCase(), s[0].toUpperCase() + s.slice(1), '  ' + s + '  ']);
const mkStudent = (uid) => ({
  en: pick([() => pick(EN), () => caseVar(uid), () => '', () => null, () => pick(['abc01', 'lt18', 'kid2024']), () => '  ' + pick(EN) + '  '])(),
  ko: pick([() => pick(KO), () => caseVar(uid), () => '', () => null, () => '민서01'])(),
});
// 독립 오라클 — 영어 답장이라 로마자 이름만, 아이디·아이디 모양은 버림, 없으면 이름 없이
const expectName = (uid, en, ko) => {
  for (const v of [en, ko]) {
    const n = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!n || n.toLowerCase() === uid.toLowerCase()) continue;
    if (/[0-9]/.test(n) && /[A-Za-z가-힣]/.test(n)) continue;
    if (!/^[A-Za-z][A-Za-z .'-]*$/.test(n)) continue;
    return n;
  }
  return '';
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasUid = (text, uid) => new RegExp('(^|[^A-Za-z0-9_])' + esc(uid) + '(?![A-Za-z0-9_])', 'i').test(String(text));

async function call(uid, msg) {
  const tok = await signUidToken(uid, env);
  const req = new Request('https://mangoi.ai/api/ai/chat-friend', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({ uid, msg, level: 'S4', persona: 'friendly', friend: 'Emma', correction_mode: 'free', topic: '', via: 'text' }),
  });
  lastMessages = null;
  const res = await handleAiApi(req, new URL(req.url), env);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const cw = console.warn, ce = console.error;
console.warn = () => {}; console.error = () => {};   // 처리기가 스스로 삼키는 경고(가짜 DB 에 없는 표 등)는 숨긴다
const stats = { named: 0, nameless: 0, poisoned: 0, turns: 0 };
try {
  await call('warmup00', 'Hello');   // ai_friend_chats 표를 처리기가 직접 만들게 한다
  const MSGS = ['I played soccer with my brother.', 'I like pizza!', 'Yes.', 'My dog is big.', 'We went to the park.'];
  for (let i = 0; i < N; i++) {
    const uid = mkUid(i);
    const { en, ko } = mkStudent(uid);
    raw.prepare('INSERT INTO students_erp (user_id, english_name, korean_name, textbook, level) VALUES (?,?,?,?,?)').run(uid, en, ko, 'BTS 3', 'S4');
    const poisoned = rnd() < 0.5;
    if (poisoned) {
      stats.poisoned++;
      const t = Date.now() - 60000;
      raw.prepare('INSERT INTO ai_friend_chats (student_uid, role, content, created_at) VALUES (?,?,?,?)').run(uid, 'user', 'I played games.', t);
      raw.prepare('INSERT INTO ai_friend_chats (student_uid, role, content, created_at) VALUES (?,?,?,?)').run(uid, 'assistant', `Yay, ${pick([uid, uid.toUpperCase()])}! Nice sentence! What did you play with your family?`, t + 1);
    }
    const want = expectName(uid, en, ko);
    want ? stats.named++ : stats.nameless++;
    const turns = 1 + Math.floor(rnd() * 3);
    for (let t = 0; t < turns; t++) {
      stats.turns++;
      const r = await call(uid, pick(MSGS));
      const reply = String(r.body?.reply || '');
      const sent = JSON.stringify(lastMessages || []);
      const info = { i, t, uid, en, ko, want, poisoned, reply, status: r.status, err: r.body?.error };
      ok('응답 200·ok', r.status === 200 && r.body?.ok !== false, info);
      ok('모델이 메시지를 받음', Array.isArray(lastMessages) && lastMessages.length > 0, info);
      ok('모델에게 보낸 글에 아이디 없음', !hasUid(sent, uid), info);
      ok('학생 답장에 아이디 없음', !hasUid(reply, uid), info);
      if (want) ok('이름이 있으면 그 이름으로 부름', reply.includes(`Yay, ${want}!`), info);
      else ok('이름이 없으면 이름 없이(지어내지 않음)', reply.startsWith('Great job!') || reply.startsWith('Yay, friend!'), info);
    }
  }
} catch (e) {
  ok('샌드박스가 끝까지 돌았다', false, String(e?.stack || e).slice(0, 400));
} finally {
  console.warn = cw; console.error = ce;
}
// 표본이 «양쪽 다» 충분히 있어야 이 검사가 뜻이 있다(씨앗이 한쪽만 만들면 헛돈다)
ok('전제: 이름 있는 학생·없는 학생·오염된 기록이 모두 충분히 섞였다', stats.named >= N * 0.1 && stats.nameless >= N * 0.1 && stats.poisoned >= N * 0.2, stats);
console.log(`학생 ${N}명 · 턴 ${stats.turns} · 이름 있음 ${stats.named} · 이름 없음 ${stats.nameless} · 오염된 기록으로 시작 ${stats.poisoned}`);
finish();

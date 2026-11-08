// ai-friend-sandbox.mjs — AI 영어친구 «실제 핸들러» 를 가짜 D1·KV·AI 에 물려 돌리는 준비물 (2026-11-08)
//   AI friend sandbox: run the real handleAiApi against fake D1/KV/AI so a harness can drive hundreds of chats.
//
// 왜 따로 두나: 반복 검사(ai_friend_reply_fuzz_harness)가 대화 수백~수천 번을 «진짜 handleAiApi» 로 돌린다.
//   esbuild 로 src 를 묶고, node:sqlite 로 D1 을, Map 으로 KV 를, 대본 함수로 Workers AI 를 흉내 낸다.
// ⚠️ 가짜 D1 의 exec 는 운영처럼 «줄마다» 실행한다(helpers/d1-exec-faithful.mjs — CLAUDE.md 「D1 exec 여러 줄」).
// ⚠️ 교정만 다시 묻기 호출(BALANCED_CORRECTION_CHECK · FOCUSED_CORRECTION_CHECK)은 대화 답이 아니라 따로 센다 —
//    대본으로 넘기면 그 호출이 «첫 호출» 로 잡혀 대본이 한 칸 밀린다(CLAUDE.md 2장 «새 모델 호출을 더하면…»).
// ⛔ 이 파일은 저장소의 src 를 «읽기만» 한다 — srcDir 로 사본을 넘기면 그 사본을 묶는다(변이시험).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { d1ExecLikeProd } from './d1-exec-faithful.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

/** 묶기 — 실패하면 { error } 를 돌려준다(던지지 않는다: 부르는 하니스가 «확인 못 함» 을 FAIL 로 말한다). */
export async function bundleAiFriend(srcDir) {
  const require = createRequire(path.join(root, 'cloudflare-deploy', 'package.json'));
  let esbuild = null;
  try { esbuild = require('esbuild'); } catch { return { error: 'esbuild_missing (cd cloudflare-deploy && npm ci)' }; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aif-sandbox-'));
  const outFile = path.join(tmp, 'bundle.mjs');
  try {
    await esbuild.build({
      stdin: {
        contents: "export { handleAiApi } from './api-ai'; export * from './question-memory'; export { aiFriendStudentAsked } from './ai-friend-level';",
        resolveDir: srcDir,
      },
      bundle: true, platform: 'node', format: 'esm', outfile: outFile, logLevel: 'silent',
      nodePaths: [path.join(root, 'cloudflare-deploy', 'node_modules')],
    });
    const M = await import(pathToFileURL(outFile).href);
    return { M };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 300) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const CHECK_MARKS = { BALANCED_CORRECTION_CHECK: 'balanced', FOCUSED_CORRECTION_CHECK: 'focused' };

/** 가짜 환경 + 대화 함수. st.script(o, n, model) 이 모델 답을 정한다(문자열 · Error). */
export function makeSandbox(M) {
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

  const st = { script: () => 'Nice! Do you like games?', calls: [], rechecks: { balanced: 0, focused: 0 } };
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
      const sys0 = String(o?.messages?.[0]?.content || '');
      for (const [mark, kind] of Object.entries(CHECK_MARKS)) {
        if (sys0.includes(mark)) {
          st.rechecks[kind]++;
          return { response: JSON.stringify({ reply: 'Checked.', fix: null }) };
        }
      }
      st.calls.push({ model, o });
      const r = await st.script(o, st.calls.length, model);
      if (r instanceof Error) throw r;
      const body = JSON.stringify({ reply: String(r), fix: null });
      return o && o.stream ? sse(body) : { response: body };
    },
  };
  const env = { DB, AI, SESSION_STATE: KV, ROOM_JWT_SECRET: 'harness-secret-ai-friend-sandbox' };
  const U = (p) => new URL('https://harness.local' + p);
  const req = (p, body, tok) => new Request('https://harness.local' + p, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body),
  });
  async function guest() {
    const r = await M.handleAiApi(req('/api/ai/chat-guest-token', {}), U('/api/ai/chat-guest-token'), env);
    return r.json();
  }
  /** 한 턴. 첫 모델 호출(= 대화 답)의 지시(sys)·학생 줄(user)과 호출 수·다시 묻기 수를 함께 돌려준다. */
  async function chat(g, msg, extra = {}) {
    st.calls.length = 0;
    st.rechecks = { balanced: 0, focused: 0 };
    const body = { uid: g.uid, msg, level: 'S6', friend: 'lily', correction_mode: 'balanced', ...extra };
    const r = await M.handleAiApi(req('/api/ai/chat-friend', body, g.token), U('/api/ai/chat-friend'), env);
    let res;
    if (body.stream) {
      const txt = await r.text();
      const evs = txt.split('\n\n').map((s) => s.trim()).filter((s) => s.startsWith('data:')).map((s) => { try { return JSON.parse(s.slice(5).trim()); } catch { return {}; } });
      const done = evs.find((e) => e && e.done) || {};
      res = { ...done, sent: evs.filter((e) => e && typeof e.t === 'string').map((e) => e.t), status: r.status };
    } else {
      const j = await r.json();
      res = { ...j, sent: [], status: r.status };
    }
    const first = st.calls[0]?.o;
    const msgs = first?.messages || [];
    return {
      ...res,
      calls: st.calls.length,
      rechecks: { ...st.rechecks },
      sys: String(msgs[0]?.content || ''),
      user: String(msgs[msgs.length - 1]?.content || ''),
    };
  }
  const rowsOf = (uid) => raw.prepare('SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id').all(uid);
  return { env, raw, kvMap, st, guest, chat, rowsOf };
}

/** 씨앗이 같으면 같은 수열 — 실패를 그대로 다시 재현할 수 있게(Math.random 금지). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

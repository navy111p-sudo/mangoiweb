/**
 * 🧪 recent_mistakes_reuse_harness 의 «웜업 최근 실수 본인 확인» 절 변이시험 (2026-10-19) — 사람이 부릅니다.
 *
 *   node test-harness/manual/recent-mistakes-owner-mutations.mjs
 *
 * src/index.ts «사본» 을 임시 폴더에 고쳐 써서 하니스의 IDX_SRC 로 가리킨다 — 저장소 파일은 안 건드린다.
 * 각 변이마다 «하니스가 실제로 FAIL(종료코드 1 + ❌ 줄) 했는가» 를 찍는다.
 * 앵커가 정확히 한 곳이 아니면 «안 돌림» 으로 찍는다 — 그 줄은 «잡았다» 로 세지 마세요.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const HARNESS = path.join(ROOT, 'test-harness/recent_mistakes_reuse_harness.mjs');
const IDX = path.join(ROOT, 'cloudflare-deploy/src/index.ts');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-mut-'));

// 약점 낱말 블록에도 같은 게이트 줄이 있으므로 «그 다음 줄(rkey)» 까지 앵커로 써서 정확히 한 곳을 고른다
const G = "        if (await vocabWeakCallerVerified(request, env, ctxUserId, body)) {\n          const rkey = ";
const M = [
  ['게이트를 if (true) 로', G, "        if (true) {\n          const rkey = "],
  ['조건 뒤집기(!)', G, "        if (!await vocabWeakCallerVerified(request, env, ctxUserId, body)) {\n          const rkey = "],
  ['항상 참으로(true ||)', G, "        if (true || await vocabWeakCallerVerified(request, env, ctxUserId, body)) {\n          const rkey = "],
  ['본문을 안 넘김', G, "        if (await vocabWeakCallerVerified(request, env, ctxUserId, {})) {\n          const rkey = "],
  ['다른 아이디로 판정', G, "        if (await vocabWeakCallerVerified(request, env, 'x' + ctxUserId, body)) {\n          const rkey = "],
  ['판정을 다시 적기(토큰 직접 비교)', G, "        if ((await authUidFromRequest(request, new URL(request.url), env, body)) === ctxUserId) {\n          const rkey = "],
  ['캐시 읽기 뒤로 게이트 옮기기', "        if (await vocabWeakCallerVerified(request, env, ctxUserId, body)) {\n          const rkey = 'warmupmistake:' + sessionId + ':' + ctxUserId;\n          let past: any[] | null = null;\n          try { const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(rkey) : null; if (raw != null) past = JSON.parse(raw); } catch {}\n",
    "        const rkey = 'warmupmistake:' + sessionId + ':' + ctxUserId;\n        let past: any[] | null = null;\n        try { const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(rkey) : null; if (raw != null) past = JSON.parse(raw); } catch {}\n        if (Array.isArray(past) || await vocabWeakCallerVerified(request, env, ctxUserId, body)) {\n"],
  // ↓ 함정 대조(2026-10-19)가 «블록 하나만 오려 내므로 가드 없는 옛 블록이 뒤에 붙으면 통과한다» 고 잡은 뒤 더한 것
  ['가드 없는 옛 블록을 뒤에 한 벌 더', "      } catch (e: any) { console.warn('[warmup] recent mistakes skipped:', e?.message || e); }\n    }\n",
    "      } catch (e: any) { console.warn('[warmup] recent mistakes skipped:', e?.message || e); }\n    }\n"
    + "    if (ctxUserId && ctxLang !== 'zh') {\n      try {\n        const line2 = recentMistakesPromptLine(await loadRecentMistakes(env.DB, ctxUserId, Date.now()), ctxDifficulty <= 2);\n        if (line2) sys += line2;\n      } catch {}\n    }\n"],
];
// 무해한 변형 — 이건 «통과» 해야 한다(부정 검사가 자기 주석을 잡지 않는가)
const OK = [
  ['블록 안 설명 주석에 판정 이름을 적기', "          const rkey = 'warmupmistake:'", "          // (설명) weakWordsCallerOk · authUidFromRequest 를 여기서 다시 부르지 않는다\n          const rkey = 'warmupmistake:'"],
];

let caught = 0, missed = 0, skipped = 0, okPass = 0, okFail = 0;
const src = fs.readFileSync(IDX, 'utf8');
for (const [name, a, b] of M) {
  const n = src.split(a).length - 1;
  if (n !== 1) { skipped++; console.log(`??  안 돌림 — ${name}: 앵커 ${n}곳`); continue; }
  const out = path.join(TMP, 'index.ts');
  fs.writeFileSync(out, src.replace(a, b));
  let txt = '', code = 0;
  try {
    txt = execFileSync('node', [HARNESS], { env: { ...process.env, IDX_SRC: out }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { code = e.status; txt = (e.stdout || '') + (e.stderr || ''); }
  const fails = (txt.match(/❌ FAIL/g) || []).length;
  const crashed = !/결과: PASS/.test(txt);
  if (code === 1 && fails > 0) { caught++; console.log(`✅ 잡음 — ${name}: FAIL ${fails}`); }
  else { missed++; console.log(`❌ 못 잡음 — ${name}: exit=${code} FAIL ${fails}${crashed ? ' (크래시 — 결과줄 없음)' : ''}`); }
}
for (const [name, a, b] of OK) {
  const n = src.split(a).length - 1;
  if (n !== 1) { skipped++; console.log(`??  안 돌림(무해) — ${name}: 앵커 ${n}곳`); continue; }
  const out = path.join(TMP, 'index.ts');
  fs.writeFileSync(out, src.replace(a, b));
  let code = 0;
  try { execFileSync('node', [HARNESS], { env: { ...process.env, IDX_SRC: out }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = e.status; }
  if (code === 0) { okPass++; console.log(`✅ 무해 통과 — ${name}`); } else { okFail++; console.log(`❌ 무해한데 FAIL — ${name}: exit=${code}`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n변이 ${M.length}종: 잡음 ${caught} · 못 잡음 ${missed} · 안 돌림 ${skipped} | 무해 ${OK.length}종: 통과 ${okPass} · 거짓 FAIL ${okFail}`);
process.exit(missed || skipped || okFail ? 1 : 0);

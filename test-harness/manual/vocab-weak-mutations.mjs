/**
 * 🧪 vocab_weak_reuse_harness 변이시험 러너 (2026-10-18) — 사람이 부릅니다(게이트가 물어 가지 않음).
 *
 *   node test-harness/manual/vocab-weak-mutations.mjs
 *
 * 소스 «사본» 을 임시 폴더에 고쳐 써서 하니스의 VW_* 환경변수로 가리킨다 — 저장소 파일은 안 건드린다.
 * 각 변이마다 «하니스가 실제로 FAIL(종료코드 1 + ❌ 줄) 했는가» 를 찍는다.
 * 앵커가 정확히 한 곳이 아니면 «안 돌림» 으로 찍는다 — 그 줄은 «잡았다» 로 세지 마세요.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const HARNESS = path.join(ROOT, 'test-harness/vocab_weak_reuse_harness.mjs');
const F = { MOD: 'cloudflare-deploy/src/vocab-weak.ts', IDX: 'cloudflare-deploy/src/index.ts', HUB: 'cloudflare-deploy/public/student-games.html' };
const ENV = { MOD: 'VW_MOD', IDX: 'VW_IDX', HUB: 'VW_HUB' };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-mut-'));

const M = [
  ['level 0 조건을 >= 0 으로', 'MOD', 'COALESCE(level, 0) = 0', 'COALESCE(level, 0) >= 0'],
  ['조건 뒤집기: wrong_count > 0 → = 0', 'MOD', '`wrong_count > 0 AND COALESCE(level', '`wrong_count = 0 AND COALESCE(level'],
  ['오답 ≥ 정답 조건 삭제', 'MOD', ' AND wrong_count >= COALESCE(correct_count, 0)', ''],
  ['토큰 비교 === → !==', 'MOD', 'String(tokUid) === u', 'String(tokUid) !== u'],
  ['관리자 이름 비교 삭제', 'MOD', 'if (sesUsername != null && String(sesUsername) === u) return true;', 'if (sesUsername != null) return true;'],
  ['기초 1개 ↔ 3개 맞바꾸기', 'MOD', 'const max = beginner ? WEAK_WORDS_MAX_BEGINNER : WEAK_WORDS_MAX;', 'const max = beginner ? WEAK_WORDS_MAX : WEAK_WORDS_MAX_BEGINNER;'],
  ['기초 경계 <= 2 → === 1', 'IDX', 'weakWordsPromptLine(words, ctxDifficulty <= 2)', 'weakWordsPromptLine(words, ctxDifficulty === 1)'],
  ['웜업 본인 확인 게이트 삭제', 'IDX', 'if (await vocabWeakCallerVerified(request, env, ctxUserId, body)) {', 'if (true) {'],
  ['웜업 zh 건너뛰기 삭제', 'IDX', "if (ctxUserId && ctxLang !== 'zh') {\n      try {\n        if (await vocabWeakCallerVerified", "if (ctxUserId && true) {\n      try {\n        if (await vocabWeakCallerVerified"],
  ['본인 확인: 토큰 쪽 결과를 늘 참으로', 'IDX', "try { if (weakWordsCallerOk(uid, await authUidFromRequest(request, new URL(request.url), env, body), null)) return true; } catch {}", "try { await authUidFromRequest(request, new URL(request.url), env, body); return true; } catch {}"],
  ['본인 확인: 실패를 true 로', 'IDX', "ses.username : null); } catch { return false; }\n}", "ses.username : null); } catch { return true; }\n}"],
  ['games/vocab 약점 먼저 빼기', 'IDX', 'mergeWeakFirst<any>(weakRows, ', 'mergeWeakFirst<any>([], '],
  ['games/weak 의 weak 배열에 push', 'IDX', '    return new Response(JSON.stringify({ ok: true, lang, weak, vocab_weak: vocabWeak })', '    for (const v of vocabWeak) (weak as any).push({ item: v.item });\n    return new Response(JSON.stringify({ ok: true, lang, weak, vocab_weak: vocabWeak })'],
  ['games/weak 응답에서 섞기(concat)', 'IDX', 'JSON.stringify({ ok: true, lang, weak, vocab_weak: vocabWeak })', 'JSON.stringify({ ok: true, lang, weak: weak.concat(vocabWeak), vocab_weak: vocabWeak })'],
  ['games/weak 언어 게이트 삭제', 'IDX', "if (lang === 'en' && await vocabWeakCallerVerified(request, env, userId)) {", 'if (await vocabWeakCallerVerified(request, env, userId)) {'],
  ['games/weak 본인 확인 삭제', 'IDX', "if (lang === 'en' && await vocabWeakCallerVerified(request, env, userId)) {", "if (lang === 'en') {"],
  ['허브: 목록에 없는 낱말도 지어 넣기', 'HUB', "    if(inW && !_missQueue.some(function(x){ return x.id===id&&x.kind==='word'; })) _missQueue.push({kind:'word',id:id,item:inW});", "    if(!_missQueue.some(function(x){ return x.id===id&&x.kind==='word'; })) _missQueue.push({kind:'word',id:id,item:inW||{en:id,ko:''}});"],
  ['허브: «목록에 있으면» 조건 뒤집기', 'HUB', "    var inW=_GAME_WORDS.find(function(x){ return x.en===id; });\n    if(inW && !", "    var inW=_GAME_WORDS.find(function(x){ return x.en===id; });\n    if(!inW && !"],
  ['허브: 맞춤 어휘 도착 뒤 다시 맞추기 삭제', 'HUB', '    try{ _applyServerWeak(); }catch(_){}', '    '],
  ['허브: 영어 게이트 삭제', 'HUB', "  if(GAME_LANG!=='en') return;\n  (d.vocab_weak", '  (d.vocab_weak'],
  ['허브: 언어 바뀜 가드 삭제', 'HUB', '      if(lang!==GAME_LANG) return;', '      '],
  ['허브: 다시 시딩할 때 옛 응답 비우기 삭제', 'HUB', '_seededMiss=true; _serverWeak=null;', '_seededMiss=true;'],
  ['허브: 토큰을 안 싣기', 'HUB', "tk?{headers:{Authorization:'Bearer '+tk}}:{})", '{})'],
];

let caught = 0, missed = 0, skipped = 0;
for (const [name, key, a, b] of M) {
  const src = fs.readFileSync(path.join(ROOT, F[key]), 'utf8');
  const n = src.split(a).length - 1;
  if (n !== 1) { skipped++; console.log(`??  안 돌림 — ${name}: 앵커 ${n}곳`); continue; }
  const out = path.join(TMP, key + path.extname(F[key]));
  fs.writeFileSync(out, src.replace(a, b));
  let txt = '', code = 0;
  try {
    txt = execFileSync('node', [HARNESS], { env: { ...process.env, [ENV[key]]: out }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { code = e.status; txt = (e.stdout || '') + (e.stderr || ''); }
  const fails = (txt.match(/❌ FAIL/g) || []).length;
  const crashed = !/결과: PASS/.test(txt);
  if (code === 1 && fails > 0) { caught++; console.log(`✅ 잡음 — ${name}: FAIL ${fails}`); }
  else { missed++; console.log(`❌ 못 잡음 — ${name}: exit=${code} FAIL ${fails}${crashed ? ' (크래시 — 결과줄 없음)' : ''}`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n변이 ${M.length}종: 잡음 ${caught} · 못 잡음 ${missed} · 안 돌림 ${skipped}`);
process.exit(missed || skipped ? 1 : 0);

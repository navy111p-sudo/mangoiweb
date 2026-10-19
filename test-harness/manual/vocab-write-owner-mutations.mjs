/**
 * 🧪 vocab_write_owner_gate_harness 변이시험 러너 (2026-10-19) — 사람이 부릅니다(게이트가 물어 가지 않음).
 *
 *   node test-harness/manual/vocab-write-owner-mutations.mjs
 *
 * 소스 «사본» 을 임시 폴더에 고쳐 써서 하니스의 VWG_* 환경변수로 가리킨다 — 저장소 파일은 안 건드린다.
 * 각 변이마다 «하니스가 실제로 FAIL(종료코드 1 + ❌ 줄) 했는가» 를 찍는다.
 * 앵커가 정확히 한 곳이 아니면 «안 돌림» 으로 찍는다 — 그 줄은 «잡았다» 로 세지 마세요.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const HARNESS = path.join(ROOT, 'test-harness/vocab_write_owner_gate_harness.mjs');
const F = { G: 'cloudflare-deploy/src/api-games.ts', MQ: 'cloudflare-deploy/public/micro-quiz.html', V: 'cloudflare-deploy/public/vocab.html' };
const ENV = { G: 'VWG_GAMES', MQ: 'VWG_MQ', V: 'VWG_VOCAB' };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vwg-mut-'));

const GATE = '{ const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }';
const M = [
  // ── 판정 정본
  ['판정 뒤집기: !== deny → === deny', 'G', "body)) !== 'deny') return null;", "body)) === 'deny') return null;"],
  ['판정을 늘 통과(return null)', 'G', "  if ((await resolveOwnerScope(request, url, env, String(ownerUid || ''), body)) !== 'deny') return null;\n", '  return null;\n'],
  ['본문을 안 넘김(토큰을 못 읽게)', 'G', "String(ownerUid || ''), body)) !== 'deny'", "String(ownerUid || ''), {})) !== 'deny'"],
  ['막힐 때 영어 안내 빼기', 'G', "    message_en: '🔑 Your login has expired. Please log in again.',\n", ''],
  ['막힐 때 200 으로', 'G', "    message_en: '🔑 Your login has expired. Please log in again.',\n  }, 401);", "    message_en: '🔑 Your login has expired. Please log in again.',\n  }, 200);"],
  // ── 라우트별 게이트 삭제(앵커는 그 줄 «뒤 주석» 까지 써서 정확히 한 곳)
  ['add 게이트 삭제', 'G', GATE + '   // 🔐 AI 호출(비용) 전에\n      let korean', 'let korean'],
  ['bulk-add 게이트 삭제', 'G', GATE + '\n      // 정규화 + 배치 내 중복 제거', '// 정규화 + 배치 내 중복 제거'],
  ['add-with-ai 게이트 삭제', 'G', GATE + '   // 🔐 AI 호출(비용) 전에\n\n      let korean', '\n      let korean'],
  ['auto-generate 게이트 삭제', 'G', GATE + '   // 🔐 AI 호출(비용) 전에\n      if (!env.AI)', 'if (!env.AI)'],
  // ⚠️ «AI 바인딩 확인 뒤로» 옮기는 변이는 등가입니다 — 바인딩이 없으면 어느 쪽이든 쓰기·비용이 0 이고 오류 코드만 달라집니다(2026-10-19 실측 안 잡힘).
  //    대신 «DB 를 먼저 읽고 나서 막는» 변이로 «막히면 아무것도 안 건드린다» 를 잽니다.
  ['auto-generate 게이트를 기존 단어 조회 뒤로', 'G', GATE + "   // 🔐 AI 호출(비용) 전에\n      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);\n\n      // 기존 단어 (중복 방지)\n      const existRs: any = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ?`).bind(userId).all();", "if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);\n\n      // 기존 단어 (중복 방지)\n      const existRs: any = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ?`).bind(userId).all();\n      " + GATE],
  ['gen-quiz 게이트 삭제', 'G', '단어장을 «읽는» 것이기도 하다(/api/vocab/list 와 같은 본인 확인 — 단 게스트 체험 시간 제한은 안 건다).\n      ' + GATE, '단어장을 «읽는» 것이기도 하다(/api/vocab/list 와 같은 본인 확인 — 단 게스트 체험 시간 제한은 안 건다).\n'],
  ['gen-quiz 게이트를 if (false) 로', 'G', '단어장을 «읽는» 것이기도 하다(/api/vocab/list 와 같은 본인 확인 — 단 게스트 체험 시간 제한은 안 건다).\n      { const deny', '단어장을 «읽는» 것이기도 하다(/api/vocab/list 와 같은 본인 확인 — 단 게스트 체험 시간 제한은 안 건다).\n      if (false) { const deny'],
  ['quiz-submit 게이트 삭제', 'G', "{ const deny = await vocabWriteDenied(request, url, env, String(row.user_id || ''), b); if (deny) return deny; }", ''],
  ['quiz-submit: 퀴즈 주인 대신 본문 user_id 로', 'G', "vocabWriteDenied(request, url, env, String(row.user_id || ''), b)", "vocabWriteDenied(request, url, env, String(b.user_id || row.user_id || ''), b)"],
  ['quiz-submit: 응답을 무시(부르기만)', 'G', "String(row.user_id || ''), b); if (deny) return deny; }", "String(row.user_id || ''), b); }"],
  // ── 화면
  ['micro-quiz: auto-generate 토큰 빼기', 'MQ', 'uid: getUid(), token: __mgTok(), level: curLevel', 'uid: getUid(), level: curLevel'],
  ['micro-quiz: gen-quiz 토큰 빼기', 'MQ', 'uid: getUid(), token: __mgTok(), count: 5', 'uid: getUid(), count: 5'],
  ['micro-quiz: quiz-submit 토큰 빼기', 'MQ', 'answer: serverAns, token: __mgTok() })', 'answer: serverAns })'],
  ['micro-quiz: quiz-submit 토큰을 빈 문자열로', 'MQ', 'answer: serverAns, token: __mgTok() })', "answer: serverAns, token: '' })"],
  ['micro-quiz: 실패 안내를 오류 코드로 되돌리기', 'MQ', "(tt(d.message, d.message_en || d.message) || d.error || 'unknown')", "(d.error || 'unknown')"],
  ['vocab: 언어 고르기 뒤집기', 'V', "((_isEn() && d.message_en) || d.message || '')", "((!_isEn() && d.message_en) || d.message || '')"],
  ['vocab: 영어 안내 안 쓰기', 'V', "((_isEn() && d.message_en) || d.message || '')", "(d.message || '')"],
  ['vocab: 추가 실패를 오류 코드로', 'V', '    if (!d.ok) throw new Error(_vocMsg(d) || d.error);\n', '    if (!d.ok) throw new Error(d.error);\n'],
  // ↓ 함정 대조(2026-10-19)가 «토큰 줄을 주석으로 남기고 새 줄을 넣으면 통과» 를 실측한 뒤 더한 것(주석 벗기기가 정규식 리터럴을 몰랐음)
  ['micro-quiz: auto-generate 토큰 줄을 주석 처리 + 새 줄', 'MQ', "          body: JSON.stringify({ uid: getUid(), token: __mgTok(), level: curLevel, topic: curTopic, count: 10 })", "          // body: JSON.stringify({ uid: getUid(), token: __mgTok(), level: curLevel, topic: curTopic, count: 10 })\n          body: JSON.stringify({ uid: getUid(), level: curLevel, topic: curTopic, count: 10 })"],
  ['micro-quiz: gen-quiz 토큰 줄을 주석 처리 + 새 줄', 'MQ', "          body: JSON.stringify({ uid: getUid(), token: __mgTok(), count: 5, source: curSource })", "          // body: JSON.stringify({ uid: getUid(), token: __mgTok(), count: 5, source: curSource })\n          body: JSON.stringify({ uid: getUid(), count: 5, source: curSource })"],
  ['vocab: 추가 실패 줄을 주석 처리 + 옛 줄', 'V', '    if (!d.ok) throw new Error(_vocMsg(d) || d.error);\n', '    // if (!d.ok) throw new Error(_vocMsg(d) || d.error);\n    if (!d.ok) throw new Error(d.error);\n'],
  ['vocab: 두 번째 /api/vocab/add 토큰 빼기', 'V', "body: JSON.stringify({ user_id: UID, token: __mgTok(), word, korean: ko }) });", "body: JSON.stringify({ user_id: UID, word, korean: ko }) });"],
  ['vocab: 미리보기 안내 빼기', 'V', "if (d.error === 'auth_required') alert(_vocMsg(d) ||", "if (false) alert(_vocMsg(d) ||"],
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

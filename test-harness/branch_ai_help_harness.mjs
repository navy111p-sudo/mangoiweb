// 🤖 지사 화면 통합 검색 AI 도우미 (2026-10-14) — 정본 src/branch-ai-help.ts 를 «실제로 돌려» 봅니다.
//   ① 계정 게이트(testbranch 만 · 짝: 다른 계정은 막힘)  ② 모델 응답 읽기(문자열·객체·지어낸 카드 id)
//   ③ 실행 경로(막히면 모델 안 부름 · 상한 · 실패 폴백)  ④ 카드 id 가 branch.html 에 실재하는가
//   ⑤ 라우트 배선(모르는 action 거절 · GET 보다 앞) ⑥ 화면 목록 == 서버 목록
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };

const SRC = process.env.BAH_SRC || join(ROOT, 'src', 'branch-ai-help.ts');
const tsSrc = readFileSync(SRC, 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'bah-'));
writeFileSync(join(tmp, 'm.mjs'), stripTypeScriptTypes(tsSrc));
const M = await import(pathToFileURL(join(tmp, 'm.mjs')).href);

// ① 게이트
ok('① testbranch 통과', M.branchAiAllowed('testbranch') === true);
ok('① 대소문자 무시', M.branchAiAllowed('TestBranch') === true);
ok('① 다른 계정은 막힘(admin)', M.branchAiAllowed('admin') === false);
ok('① 앞가리 이름은 막힘', M.branchAiAllowed('testbranch2') === false && M.branchAiAllowed('test') === false);
ok('① 빈 값은 막힘', M.branchAiAllowed('') === false && M.branchAiAllowed(null) === false);

// ② 응답 읽기
const ids = M.BRANCH_AI_CARDS.map(c => c.id);
let r = M.parseBranchAiReply('{"answer":"정산 카드에 있어요.","cards":["c-settle","c-fake","c-settle","c-trend","c-org","c-me"]}');
ok('② 문자열 JSON 의 답', r.answer === '정산 카드에 있어요.', r);
ok('② 지어낸 id·중복 제거, 최대 3', JSON.stringify(r.cards) === JSON.stringify(['c-settle', 'c-trend', 'c-org']), r.cards);
r = M.parseBranchAiReply({ answer: '오늘 수업은 여기서 봅니다.', cards: ['c-today'] });
ok('② 이미 파싱된 객체도 읽음', r.answer.startsWith('오늘 수업') && r.cards[0] === 'c-today', r);
r = M.parseBranchAiReply('[object Object]');
ok('② [object Object] 는 내보내지 않음', r.answer === '', r);
r = M.parseBranchAiReply({ answer: '[object Object]', cards: [] });
ok('② 답 칸의 [object Object] 도 안 냄', r.answer === '', r);
r = M.parseBranchAiReply('```json\n{"answer":"A","cards":["c-me"]}\n```');
ok('② 코드펜스 벗김', r.answer === 'A' && r.cards[0] === 'c-me', r);
r = M.parseBranchAiReply('{"answer":"잘린');
ok('② 잘린 JSON 은 빈 답', r.answer === '', r);
r = M.parseBranchAiReply({ answer: 'x'.repeat(5000), cards: 'c-me' });
ok('② 답 길이 상한 · cards 가 배열이 아니면 무시', r.answer.length <= M.BRANCH_AI_MAX_ANSWER + 1 && r.cards.length === 0);
ok('② 낱말 폴백: 정산', M.keywordCards('이번 달 정산은 어디서 봐?').includes('c-settle'));
ok('② 낱말 폴백: 빈 질문은 없음', M.keywordCards('').length === 0);
ok('② 낱말 폴백도 목록 안의 id 만', M.keywordCards('학생 출석 정산 비밀번호 수업').every(id => ids.includes(id)));

// ③ 실행 경로 — 가짜 env
function mkEnv(aiImpl, kvStart) {
  const kv = new Map(); if (kvStart !== undefined) kv.set('__start', kvStart);
  const calls = { ai: 0, put: 0 };
  return { calls, kv, env: {
    AI: aiImpl === null ? undefined : { run: async (...a) => { calls.ai++; return aiImpl(...a); } },
    SESSION_STATE: {
      get: async (k) => (kv.has(k) ? kv.get(k) : (kv.has('__start') ? kv.get('__start') : null)),
      put: async (k, v) => { calls.put++; kv.set(k, v); },
    },
  } };
}
let E = mkEnv(async () => ({ response: { answer: 'hi', cards: ['c-settle'] } }));
let out = await M.runBranchAiHelp(E.env, 'admin', { q: '정산' });
ok('③ 다른 계정 → 403 · 모델 안 부름', out.status === 403 && E.calls.ai === 0 && E.calls.put === 0, out);
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '정산 어디?' });
ok('③ testbranch → AI 답(객체 응답)', out.status === 200 && out.body.used_ai === true && out.body.answer === 'hi' && out.body.cards[0] === 'c-settle', out);
ok('③ 상한 카운터를 올림', E.calls.put === 1 && [...E.kv.values()].includes('1'));
E = mkEnv(async () => ({ response: '{"answer":"출석은 학원별 출석 현황에서 봅니다.","cards":["c-attn"]}' }));
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '출석', lang: 'en' });
ok('③ 문자열 응답도', out.body.used_ai === true && out.body.cards[0] === 'c-attn', out);
E = mkEnv(async () => { throw new Error('neurons'); });
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '이번 달 정산' });
ok('③ 모델 실패 → 지어내지 않고 낱말 폴백', out.status === 200 && out.body.used_ai === false && out.body.cards.includes('c-settle'), out);
E = mkEnv(null);
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '비밀번호' });
ok('③ AI 바인딩 없음 → 폴백', out.body.used_ai === false && out.body.cards.includes('c-me'), out);
E = mkEnv(async () => ({ response: { answer: 'x', cards: [] } }), String(M.BRANCH_AI_DAILY_CAP));
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '정산' });
ok('③ 상한 도달 → 모델 안 부름', out.body.capped === true && E.calls.ai === 0, out);
E = mkEnv(async () => ({ response: { answer: 'x', cards: [] } }), String(M.BRANCH_AI_DAILY_CAP - 1));
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '정산' });
ok('③ 상한 직전은 부름(짝)', E.calls.ai === 1 && out.body.used_ai === true, out);
E = mkEnv(async () => ({ response: { answer: 'x', cards: [] } }));
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: 'a'.repeat(M.BRANCH_AI_MAX_Q + 1) });
ok('③ 너무 긴 질문 → 400 · 모델 안 부름', out.status === 400 && E.calls.ai === 0, out);
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '   ' });
ok('③ 빈 질문 → 400', out.status === 400 && E.calls.ai === 0, out);
E = mkEnv(async () => ({ response: { answer: 'x', cards: [] } }));
E.env.SESSION_STATE.get = async () => { throw new Error('kv down'); };
out = await M.runBranchAiHelp(E.env, 'testbranch', { q: '정산' });
ok('③ KV 못 읽어도 막지 않음', out.status === 200 && E.calls.ai === 1, out);

// ④ 카드 id 실재
const html = readFileSync(join(ROOT, 'public', 'branch.html'), 'utf8');
for (const id of ids) ok('④ branch.html 에 카드 ' + id, new RegExp('<details[^>]*\\bid="' + id + '"').test(html));
ok('④ 목록이 비지 않음(전제)', ids.length >= 5);

// ⑤ 라우트 배선
const mango = readFileSync(join(ROOT, 'src', 'api-mango.ts'), 'utf8');
const pi = mango.indexOf("method === 'POST' && path === '/api/admin/omnisearch'");
const gi = mango.indexOf("method === 'GET' && path === '/api/admin/omnisearch'");
ok('⑤ POST 갈래가 있음', pi > 0);
ok('⑤ GET 갈래보다 앞', pi > 0 && gi > pi);
const blk = mango.slice(pi, gi);
const ua = blk.indexOf("body.action !== 'ai_help'"), ac = blk.indexOf('getAdminActor('), rb = blk.indexOf('runBranchAiHelp(');
ok('⑤ 모르는 action 은 400 으로 거절', ua > 0 && /unknown_action'\s*\}\s*,\s*400\)/.test(blk));
ok('⑤ 거절이 실행보다 앞', ua > 0 && rb > ua);
ok('⑤ 세션 계정(actor.username)으로 실행', /runBranchAiHelp\(\s*env[^,]*,\s*actor\.username\s*,/.test(blk) && ac > 0 && ac < rb);
ok('⑤ 미로그인은 401', /if \(!actor\.ok\) return json\(\{[^}]*\}, 401\)/.test(blk));

// ⑥ 화면 목록 == 서버 목록
const m6 = html.match(/var AI_HELP_USERS = \{([^}]*)\}/);
const clientUsers = m6 ? [...m6[1].matchAll(/(\w+)\s*:/g)].map(x => x[1].toLowerCase()).sort() : [];
ok('⑥ 화면 AI_HELP_USERS == 서버 BRANCH_AI_USERS', JSON.stringify(clientUsers) === JSON.stringify([...M.BRANCH_AI_USERS].map(s => s.toLowerCase()).sort()), clientUsers);
ok('⑥ 버튼은 기본 hidden', /id="aiHelpBtn"[^>]*\bhidden\b/.test(html));
ok('⑥ 감춘 카드는 안내 안 함', /closest\('\[hidden\]'\)\)\s*return null/.test(html));
ok('⑥ 시연 가로채기는 POST omnisearch 를 안 잡음(진짜 서버로)', !/method === 'POST'[\s\S]{0,400}\/api\/admin\/omnisearch/.test(html.slice(html.indexOf('function handler('), html.indexOf("case '/api/admin/omnisearch'"))));

console.log(`branch_ai_help_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

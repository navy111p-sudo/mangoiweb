// 2026-10-18 — «지난번 실수를 다음 AI 친구 대화에 다시 가져오기» (개선안 1순위 ②)
//   정본 src/recent-mistakes.ts 를 타입만 벗겨 «진짜 SQLite» 로 돌리고, api-ai.ts 배선을 위치로 확인합니다.
//   짝: «넣는다» 옆에 «안 넣는다»(남의 계정·오래된 것·한글 섞임·게스트·표 없음) 를 둡니다.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(process.env.RM_SRC || path.join(ROOT, 'cloudflare-deploy/src/recent-mistakes.ts'), 'utf8');
const AI = fs.readFileSync(process.env.AI_SRC || path.join(ROOT, 'cloudflare-deploy/src/api-ai.ts'), 'utf8');
const IDX = fs.readFileSync(process.env.IDX_SRC || path.join(ROOT, 'cloudflare-deploy/src/index.ts'), 'utf8');
const WP = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/warmup-parent.ts'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

// ── 정본 모듈 로드 ──
let M = null;
try {
  const js = stripTypeScriptTypes(SRC).replace(/^export\s+/gm, '');
  M = new Function(js + '\nreturn { AIFRIEND_FIX_DDL, RECENT_MISTAKE_DAYS, RECENT_MISTAKE_MAX, logAiFriendFix, loadRecentMistakes, recentMistakesPromptLine, isPromptSafeEnglish };')();
} catch (e) { check('정본 모듈 로드', false, e.message); }
check('정본 모듈을 읽었다(전제)', !!M);

function wrap(db) {
  return {
    prepare: (sql) => {
      const st = db.prepare(sql); let a = [];
      const api = {
        bind: (...x) => { a = x; return api; },
        first: async () => st.get(...a) ?? null,
        all: async () => ({ results: st.all(...a) }),
        run: async () => { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; },
      };
      return api;
    },
  };
}
// warmup_fix_log 스키마는 정본(warmup-parent.ts)에서 읽는다
const wpDdl = (() => { try { const m = WP.match(/export const WARMUP_FIX_DDL: string\[\] = (\[[\s\S]*?\n\]);/); return m ? new Function('return ' + m[1])() : null; } catch { return null; } })();
check('warmup_fix_log 스키마를 정본에서 읽었다(전제)', Array.isArray(wpDdl) && wpDdl.length >= 1);

async function run() {
  if (!M || !wpDdl) return;
  const NOW = Date.UTC(2026, 9, 18, 7, 0, 0);
  const DAY = 86400000;
  const db = new DatabaseSync(':memory:');
  for (const s of wpDdl) db.exec(s);
  const ins = db.prepare(`INSERT INTO warmup_fix_log (session_id, user_id, was, fixed, lang, created_at) VALUES (?,?,?,?,?,?)`);
  ins.run('s1', 'kid1', 'I go to school yesterday.', 'I went to school yesterday.', 'en', NOW - 2 * DAY);
  ins.run('s1', 'kid1', 'He like pizza.', 'He likes pizza.', 'en', NOW - 1 * DAY);
  ins.run('s2', 'kid1', 'old one', 'Old one fixed now.', 'en', NOW - 30 * DAY);           // 오래됨
  ins.run('s3', 'kid1', '我去', '我去了学校', 'zh', NOW - 1 * DAY);                         // 중국어
  ins.run('s4', 'kid1', 'I like 사과.', 'I like apples 사과.', 'en', NOW - 1 * DAY);       // 한글 섞임
  ins.run('s5', 'Kid1', 'She go home.', 'She goes home.', 'en', NOW - 1 * DAY);            // 대소문자만 다른 남의 계정
  const D = wrap(db);

  // AI 친구 교정 기록
  const ok1 = await M.logAiFriendFix(D, 'kid1', { was: 'I have two dog.', now: 'I have two dogs.', tag: 'plural', severity: 'minor' }, NOW - 3600000);
  const ok2 = await M.logAiFriendFix(D, 'kid1', { was: 'I have two dog.', now: 'I have two dogs.' }, NOW - 1800000);   // 같은 날 중복
  const okG = await M.logAiFriendFix(D, 'guest_ab12', { was: 'a b', now: 'A b c.' }, NOW);
  const okSame = await M.logAiFriendFix(D, 'kid1', { was: 'Hi.', now: 'hi' }, NOW);
  check('AI 친구 교정을 기록한다', ok1 === true);
  check('같은 날 같은 문장은 한 줄만', db.prepare(`SELECT COUNT(*) n FROM ai_friend_fix_log WHERE was='I have two dog.'`).get().n === 1, ok2);
  check('게스트는 기록하지 않는다', okG === false);
  check('고친 문장이 사실상 같으면 기록하지 않는다', okSame === false);

  const list = await M.loadRecentMistakes(D, 'kid1', NOW);
  const fixed = list.map((x) => x.fixed);
  check('최근 웜업·AI 친구 교정을 함께 읽는다', fixed.includes('He likes pizza.') && fixed.includes('I have two dogs.') && fixed.includes('I went to school yesterday.'), fixed);
  check('최신 순이다', fixed[0] === 'I have two dogs.', fixed);
  check('최대 개수를 넘지 않는다', list.length <= M.RECENT_MISTAKE_MAX, list.length);
  // 개수 상한에 가려지지 않게 넉넉히 받아 «기간» 만 본다
  const wide = (await M.loadRecentMistakes(D, 'kid1', NOW, 50)).map((x) => x.fixed);
  check('오래된 것은 안 넣는다(상한 무관)', wide.length >= 3 && !wide.includes('Old one fixed now.'), wide);
  check('짝: 기간 안이면 넣는다', wide.includes('I went to school yesterday.'));
  check('중국어는 안 넣는다', !fixed.some((f) => /[一-鿿]/.test(f)));
  check('한글 섞인 것은 안 넣는다', !fixed.some((f) => /[가-힣]/.test(f)));
  check('대소문자만 다른 남의 계정 것은 안 넣는다', !fixed.includes('She goes home.'));
  const other = await M.loadRecentMistakes(D, 'kid2', NOW);
  check('짝: 기록 없는 학생은 빈 목록', Array.isArray(other) && other.length === 0);

  // 표가 없어도 던지지 않는다
  const empty = wrap(new DatabaseSync(':memory:'));
  let threw = false, r0 = null;
  try { r0 = await M.loadRecentMistakes(empty, 'kid1', NOW); } catch { threw = true; }
  check('표가 없으면 던지지 않고 빈 목록', !threw && Array.isArray(r0) && r0.length === 0);
  const half = new DatabaseSync(':memory:'); for (const s of wpDdl) half.exec(s);
  half.prepare(`INSERT INTO warmup_fix_log (session_id, user_id, was, fixed, lang, created_at) VALUES ('x','kid1','I is ok.','I am OK.','en',?)`).run(NOW - DAY);
  const rHalf = await M.loadRecentMistakes(wrap(half), 'kid1', NOW);
  check('한쪽 표만 있어도 그쪽은 쓴다', rHalf.length === 1 && rHalf[0].fixed === 'I am OK.', rHalf);
  let threwLog = false; try { await M.logAiFriendFix({ prepare: () => { throw new Error('d1 down'); } }, 'kid9', { was: 'a', now: 'A b.' }, NOW); } catch { threwLog = true; }
  check('기록이 실패해도 던지지 않는다', !threwLog);

  // 프롬프트 한 줄
  const line = M.recentMistakesPromptLine(list, false);
  const linePlain = M.recentMistakesPromptLine(list, true);
  check('프롬프트에 고친 문장을 싣는다', line.includes('"I have two dogs."') && line.includes('"He likes pizza."'));
  check('기초 단계는 1개만', (linePlain.match(/correct: "/g) || []).length === 1, linePlain);
  check('짝: 상급은 여러 개', (line.match(/correct: "/g) || []).length === list.length);
  check('«틀렸다고 말하지 마라» 를 싣는다', /Never mention the old mistake/.test(line));
  check('프롬프트 줄에 한글이 없다', !/[가-힣]/.test(line));
  check('목록이 비면 빈 문자열', M.recentMistakesPromptLine([], false) === '' && M.recentMistakesPromptLine(null, true) === '');
}
await run();

// ── api-ai.ts 배선 (주석 벗긴 사본으로) ──
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const A = strip(AI);
const cfStart = A.indexOf("path === '/api/ai/chat-friend'");
check('chat-friend 라우트를 찾았다(전제)', cfStart > 0);
const cf = A.slice(cfStart);
const pa = cf.indexOf('await Promise.all([');
const paEnd = cf.indexOf(']);', pa);
check('병렬 조회에서 loadRecentMistakes(env.DB, uid, …) 를 부른다', pa > 0 && /loadRecentMistakes\(env\.DB,\s*uid,/.test(cf.slice(pa, paEnd)));
const destr = cf.slice(0, pa).match(/const \[([^\]]+)\]: any\[\] = $/m) || cf.slice(Math.max(0, pa - 200), pa).match(/const \[([^\]]+)\]/);
const names = destr ? destr[1].split(',').map((s) => s.trim()) : [];
const callsInAll = (cf.slice(pa, paEnd).match(/^\s{8}[A-Za-z]/gm) || []).length;
// 「맨 끝 자리」로 못 박지 않는다 — 병렬 조회는 늘어난다(2026-10-18 단어장 약점이 뒤에 붙음). 그 호출이 «몇 번째 줄인가» 로 찾는다.
const callLines = cf.slice(pa, paEnd).match(/^\s{8}[A-Za-z].*$/gm) || [];
const idx = callLines.findIndex((l) => /^\s*loadRecentMistakes\(/.test(l));
check('구조분해 개수 == 병렬 조회 개수(그 자리의 값을 받는다)', names.length === callsInAll, { names, callsInAll });
const fixVar = names[idx];
check('그 값을 프롬프트 함수에 넘긴다', !!fixVar && new RegExp('recentMistakesPromptLine\\(' + fixVar + '\\b').test(cf), fixVar);
const sysAt = cf.indexOf('const system = `');
const sysLine = cf.slice(sysAt, cf.indexOf('\n', sysAt));
const mc = (cf.match(/const (\w+) = recentMistakesPromptLine\(/) || [])[1];
check('그 결과를 시스템 프롬프트 첫 줄에 넣는다', !!mc && sysLine.includes('${' + mc + '}'), sysLine.slice(0, 200));
check('기초 단계 여부를 lvSpec.plain 으로 넘긴다', /recentMistakesPromptLine\([^)]*lvSpec\.plain/.test(cf));
const logAt = cf.indexOf('logAiFriendFix(');
const showAt = cf.indexOf('showFix = decided.show;');
check('보여 준 교정을 기록한다(showFix 를 정한 뒤)', logAt > showAt && showAt > 0);
check('기록은 showFix 가 있을 때만', /if \(showFix\) await logAiFriendFix\(env\.DB, uid, showFix,/.test(cf));
check('warmup_fix_log 에 섞어 적지 않는다', !/INSERT[^`]*warmup_fix_log/.test(strip(SRC)));

// ── 웜업(src/index.ts handleWarmupChat) 배선 ──
const I = strip(IDX);
const wStart = I.indexOf('async function handleWarmupChat(');
const wEnd = wStart > 0 ? I.indexOf('\nasync function ', wStart + 10) : -1;
const W = wStart > 0 ? I.slice(wStart, wEnd > 0 ? wEnd : undefined) : '';
check('웜업 핸들러를 잘라 냈다(전제)', W.length > 1000);
const ldAt = W.indexOf('loadRecentMistakes(env.DB, ctxUserId,');
const msgAt = W.indexOf("const messages = [{ role: 'system', content: sys }]");
check('웜업도 loadRecentMistakes(env.DB, ctxUserId, …) 를 부른다', ldAt > 0);
check('메시지를 만들기 «전» 에 넣는다', ldAt > 0 && msgAt > ldAt);
const wl = (W.match(/const (\w+) = recentMistakesPromptLine\(/) || [])[1];
check('그 줄을 sys 에 더한다', !!wl && new RegExp('sys \\+= ' + wl + '\\b').test(W), wl);
const gate = W.slice(Math.max(0, ldAt - 900), ldAt);
check('영어 대화일 때만(중국어 제외)', /if \(ctxUserId && ctxLang !== 'zh'\)/.test(gate));
check('세션당 캐시(KV)를 거친다', /warmupmistake:/.test(W) && /expirationTtl: 1800/.test(W.slice(ldAt, ldAt + 400)));
check('웜업 조립이 try 로 감싸여 있다(던지지 않음)', /try \{[\s\S]{0,200}warmupmistake:/.test(gate + W.slice(ldAt, ldAt + 50)));


// ── 🔐 (2026-10-19) 웜업 «최근 실수» 블록 본인 확인 — 블록을 오려 내 가짜 부품으로 «실제로» 돌린다 ──
//   짝: «본인이면 붙는다» ↔ «남·토큰 없음이면 안 붙고 DB·캐시도 안 건드린다» · «캐시가 있어도 본인 확인이 먼저»
function blockBefore(src, opener, anchor) {
  const a = src.indexOf(anchor);
  if (a < 0) return '';
  const i = src.lastIndexOf(opener, a);
  if (i < 0) return '';
  const b = src.indexOf('{', i + opener.length - 1);
  let d = 0;
  for (let k = b; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const rblk = blockBefore(IDX, "if (ctxUserId && ctxLang !== 'zh') {", "'warmupmistake:'");
check('전제: 웜업 «최근 실수» 블록을 오려 냈다', rblk.length > 200 && rblk.includes('loadRecentMistakes(env.DB, ctxUserId'), rblk.length);
// 부정 검사는 주석을 벗긴 사본으로(블록 안 설명 주석에 그 이름이 들어가도 거짓 FAIL 이 안 나게) — 블록 하나만 벗긴다
check('웜업 «최근 실수» 는 판정을 다시 적지 않고 정본 vocabWeakCallerVerified 를 부른다',
  /vocabWeakCallerVerified\(request, env, ctxUserId, body\)/.test(rblk) && !/weakWordsCallerOk|authUidFromRequest|checkAdminSession/.test(strip(rblk)));
// 사각지대 막기: 블록을 «첫 앵커» 로 고르므로, 가드 없는 옛 블록이 «뒤» 에 한 벌 더 붙으면 위 실행 검사는 앞의 것만 본다.
//   → 핸들러 안에서 조회·줄 만들기 호출이 «정확히 한 번» 이고 그 한 번이 가드 블록 안인지 짝으로 본다.
const hrS = IDX.indexOf('async function handleWarmupChat(');
const hrE = hrS > 0 ? IDX.indexOf('\nasync function ', hrS + 10) : -1;
const HR = hrS > 0 ? strip(IDX.slice(hrS, hrE > 0 ? hrE : undefined)) : '';
const RB = strip(rblk);
const nLoad = HR.split('loadRecentMistakes(').length - 1, nLine = HR.split('recentMistakesPromptLine(').length - 1;
check('웜업 핸들러에서 최근 실수 조회·줄 만들기는 각각 정확히 한 번(가드 밖 옛 블록이 없다)', nLoad === 1 && nLine === 1, { nLoad, nLine });
check('그 한 번이 본인 확인 블록 «안» 이다', RB.includes('loadRecentMistakes(') && RB.includes('recentMistakesPromptLine('));
check('본인 확인이 캐시를 읽기 «전» 이다', rblk.indexOf('vocabWeakCallerVerified') > 0 && rblk.indexOf('vocabWeakCallerVerified') < rblk.indexOf('SESSION_STATE.get'));
let runRm = null;
try {
  const ts = `async function __rm(ctxUserId: any, ctxLang: any, sessionId: any, env: any, request: any, body: any, ctxDifficulty: any,
    vocabWeakCallerVerified: any, loadRecentMistakes: any, recentMistakesPromptLine: any, console: any) {
    let sys = ''; ${rblk}; return sys; }`;
  runRm = new Function(stripTypeScriptTypes(ts) + '\nreturn __rm;')();
} catch (e) { check('웜업 «최근 실수» 블록 실행 준비', false, e.message); }
// 정본 RecentMistake 모양 그대로({ was, fixed, at })
const PAST = [{ was: 'I go to school yesterday', fixed: 'I went to school yesterday', at: Date.now() }];
function rmKv() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
async function rmCase({ uid = 'kim01', lang = 'en', who = 'kim01', verifyThrows = false, store = rmKv(), sid = 's1', diff = 5, body = { user_id: 'kim01', t: 1 } } = {}) {
  const seen = { verify: [], load: [] };
  const verify = async (req, env, u, b) => { seen.verify.push({ u, b }); if (verifyThrows) throw new Error('verify boom'); return who === u; };
  const load = async (db, u) => { seen.load.push(u); return PAST; };
  let sys = '', threw = false;
  try { sys = await runRm(uid, lang, sid, { DB: {}, SESSION_STATE: store }, { url: 'https://x.test/api/warmup/chat' }, body, diff, verify, load, M.recentMistakesPromptLine, { warn() {} }); }
  catch (e) { threw = true; }
  return { sys, threw, seen, store };
}
if (runRm && M) {
  const own = await rmCase();
  check('본인이면 교정 문장이 프롬프트에 붙는다', /I went to school yesterday/.test(own.sys) && own.seen.load[0] === 'kim01', own.sys);
  check('붙은 줄에 옛 실수·고친 꼴이 둘 다 제대로 찍힌다(undefined 없음)', /they said "I go to school yesterday"/.test(own.sys) && !/undefined/.test(own.sys), own.sys);
  check('판정에 «화면이 보낸 아이디» 와 요청 본문을 그대로 넘긴다', own.seen.verify.length === 1 && own.seen.verify[0].u === 'kim01' && own.seen.verify[0].b && own.seen.verify[0].b.t === 1, own.seen.verify);
  const other = await rmCase({ who: 'lee02' });
  check('짝: 본인이 아니면 안 붙는다', other.sys === '', other.sys);
  check('짝: 본인이 아니면 교정 기록을 읽지도 않는다', other.seen.load.length === 0, other.seen.load);
  check('짝: 본인이 아니면 캐시를 만들지 않는다', other.store.m.size === 0, [...other.store.m.keys()]);
  const store = rmKv();
  await rmCase({ store });
  check('전제: 본인 요청이 캐시를 만든다(세션+학생 칸)', [...store.m.keys()].join() === 'warmupmistake:s1:kim01', [...store.m.keys()]);
  const cachedOther = await rmCase({ who: 'lee02', store });
  check('캐시가 있어도 본인 확인이 안 되면 안 붙는다(캐시 칸만 맞춰 남의 문장을 못 붙임)', cachedOther.sys === '', cachedOther.sys);
  const cachedOwn = await rmCase({ store });
  check('짝: 본인이면 두 번째는 캐시에서 읽는다(기록 조회 0회)', /I went to school yesterday/.test(cachedOwn.sys) && cachedOwn.seen.load.length === 0, cachedOwn.seen);
  const zh = await rmCase({ lang: 'zh' });
  check('중국어 대화는 판정도 조회도 안 한다(예전 그대로)', zh.sys === '' && zh.seen.verify.length === 0 && zh.seen.load.length === 0, zh.seen);
  const thr = await rmCase({ verifyThrows: true });
  check('본인 확인이 던져도 대화는 안 깨진다(안 붙을 뿐)', !thr.threw && thr.sys === '', thr);
  const blank = await rmCase({ uid: '' });
  check('아이디가 비면 판정을 부르지 않는다', blank.sys === '' && blank.seen.verify.length === 0, blank.seen);
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

// 2026-10-18 — «한 단계 올려(내려) 볼까요?» 제안 (개선안 2순위 ⑤)
//   src/level-suggest.ts 를 타입만 벗겨 진짜 SQLite 로 돌리고, AI 친구 서버·화면 배선을 봅니다.
//   짝: «제안한다» 옆에 «근거가 모자라면·최근에 답했으면·끝 단계면 제안하지 않는다».
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const SRC = P('cloudflare-deploy/src/level-suggest.ts', 'LS_SRC');
const AI = P('cloudflare-deploy/src/api-ai.ts', 'AI_SRC');
const HTML = P('cloudflare-deploy/public/ai-friend.html', 'AF_SRC');
const LV = P('cloudflare-deploy/src/ai-friend-level.ts', 'LV_SRC');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

let L = null;
try {
  const js = stripTypeScriptTypes(SRC).replace(/^export\s+/gm, '');
  L = new Function(js + '\nreturn { decideLevelSuggestion, loadSuggestEvidence, recentlyAnswered, recordSuggestAnswer, englishWordCount, LEVEL_SUGGEST_DDL, SUGGEST_MIN_TURNS };')();
} catch (e) { check('모듈 실행', false, e.message); }
check('모듈을 실제로 실행했다(전제)', !!L);
if (!L) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

// 단계별 AI 문장 목표 — 정본(ai-friend-level.ts)에서 «읽어» 온다(하니스에 베끼지 않음)
const T = {};
for (const m of LV.matchAll(/\n\s*(S[1-8]):\s*\{\s*\n?\s*maxWordsPerSentence:\s*(\d+)/g)) T[m[1]] = Number(m[2]);
check('정본에서 단계 목표를 8개 읽었다(전제)', Object.keys(T).length === 8 && T.S1 === 5 && T.S8 === 0, T);

const D = L.decideLevelSuggestion;
const ev = (turns, avgWords, majorRate) => ({ turns, avgWords, majorRate });
const up = D('S2', ev(20, 6, 0.05), T);
check('잘하면 한 단계 올림 제안(S2 → S3)', up && up.dir === 'up' && up.to === 'S3', up);
const dn = D('S4', ev(20, 9, 0.5), T);
check('교정이 잦으면 한 단계 내림 제안(S4 → S3)', dn && dn.dir === 'down' && dn.to === 'S3', dn);
check('너무 짧게만 말하면 내림(평균 1.5낱말)', (D('S3', ev(20, 1.5, 0), T) || {}).to === 'S2');
check('짝: 근거가 모자라면 아무 말도 안 한다(턴 < 최소)', D('S2', ev(L.SUGGEST_MIN_TURNS - 1, 9, 0), T) === null);
check('경계: 최소 턴 딱 맞으면 판정한다', !!D('S2', ev(L.SUGGEST_MIN_TURNS, 9, 0), T));
check('짝: 중간이면 제안 없음', D('S4', ev(30, 5, 0.2), T) === null);
check('짝: 맨 아래(S1)는 내림 없음', D('S1', ev(30, 1, 0.9), T) === null);
check('짝: 맨 위(S8)는 올림 없음', D('S8', ev(30, 40, 0), T) === null);
check('짝: 잘 말해도 교정이 잦으면 올림 아님', D('S2', ev(30, 9, 0.3), T) === null);
check('내림이 올림보다 먼저(둘 다 걸리면 내림)', (D('S3', ev(30, 1, 0.5), T) || {}).dir === 'down');
check('모르는 단계·숫자 아닌 근거는 null', D('A1', ev(30, 9, 0), T) === null && D('S2', ev('x', 9, 0), T) === null && D('S2', null, T) === null);
check('언제나 한 단계만', !!up && !!dn && [up, dn].every(s => Math.abs(['S1','S2','S3','S4','S5','S6','S7','S8'].indexOf(s.from) - ['S1','S2','S3','S4','S5','S6','S7','S8'].indexOf(s.to)) === 1));
check('영어 낱말만 센다', L.englishWordCount("I don't like 사과 123") === 3 && L.englishWordCount('') === 0 && L.englishWordCount(null) === 0);

// ── 진짜 SQLite ──
const NOW = Date.UTC(2026, 9, 18), DAY = 86400000;
const sq = new DatabaseSync(':memory:');
sq.exec(`CREATE TABLE ai_friend_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, level TEXT, created_at INTEGER NOT NULL)`);
sq.exec(`CREATE TABLE ai_friend_fix_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, was TEXT NOT NULL, fixed TEXT NOT NULL, tag TEXT, severity TEXT, day TEXT NOT NULL, created_at INTEGER NOT NULL)`);
const db = { prepare: (sql) => { const st = sq.prepare(sql); const at = (...a) => ({ all: async () => ({ results: st.all(...a) }), run: async () => st.run(...a), first: async () => st.get(...a) }); return { ...at(), bind: at }; } };
const ins = sq.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`);
for (let i = 0; i < 15; i++) ins.run('kid', 'user', 'I played soccer with my friends', 'S2', NOW - DAY);   // 6낱말
for (let i = 0; i < 15; i++) ins.run('kid', 'assistant', 'Wow that sounds really fun to play', 'S2', NOW - DAY);
for (let i = 0; i < 30; i++) ins.run('kid', 'user', 'yes', 'S5', NOW - DAY);                              // 다른 단계
for (let i = 0; i < 30; i++) ins.run('kid', 'user', 'yes', 'S2', NOW - 30 * DAY);                         // 창 밖
for (let i = 0; i < 30; i++) ins.run('other', 'user', 'no', 'S2', NOW - DAY);                             // 남의 기록
sq.prepare(`INSERT INTO ai_friend_fix_log (user_id, was, fixed, tag, severity, day, created_at) VALUES (?,?,?,?,?,?,?)`).run('kid', 'a', 'b', 'past_tense', 'major', 'x', NOW - DAY);
const e1 = await L.loadSuggestEvidence(db, 'kid', 'S2', NOW);
check('근거: 지금 단계·14일·내 마디·학생 마디만', e1 && e1.turns === 15 && Math.abs(e1.avgWords - 6) < 1e-9, e1);
check('근거: major 교정 비율', e1 && Math.abs(e1.majorRate - 1 / 15) < 1e-9, e1);
check('끝에서 끝까지: 그 학생에게 S3 제안', (D('S2', e1, T) || {}).to === 'S3');
check('던지지 않는다(db 없음·표 없음)', (await L.loadSuggestEvidence(null, 'kid', 'S2', NOW)) === null
  && (await L.loadSuggestEvidence({ prepare: () => { throw new Error('x'); } }, 'kid', 'S2', NOW)) === null);

check('아직 답한 적 없음', (await L.recentlyAnswered(db, 'kid', 'aifriend', NOW)) === false);
check('답 기록: 한 단계짜리만', (await L.recordSuggestAnswer(db, 'kid', 'aifriend', { from: 'S2', to: 'S4', decision: 'accept' }, NOW)) === false);
check('답 기록: 모르는 결정은 거절', (await L.recordSuggestAnswer(db, 'kid', 'aifriend', { from: 'S2', to: 'S3', decision: 'maybe' }, NOW)) === false);
check('답 기록: 정상', (await L.recordSuggestAnswer(db, 'kid', 'aifriend', { from: 'S2', to: 'S3', decision: 'dismiss', evidence: e1 }, NOW)) === true);
check('답한 뒤 7일은 다시 안 묻는다', (await L.recentlyAnswered(db, 'kid', 'aifriend', NOW + 6 * DAY)) === true);
check('짝: 7일 지나면 다시 물을 수 있다', (await L.recentlyAnswered(db, 'kid', 'aifriend', NOW + 8 * DAY)) === false);
check('짝: 남의 답은 내게 안 걸린다', (await L.recentlyAnswered(db, 'other', 'aifriend', NOW)) === false);
check('못 읽으면 «답했다» 로(묻지 않는 쪽)', (await L.recentlyAnswered({ prepare: () => { throw new Error('x'); } }, 'kid', 'aifriend', NOW)) === true);

// ── 배선: 서버 ──
{
  const g = AI.indexOf("if (method === 'GET' && path === '/api/ai/chat-history')");
  const p = AI.indexOf("if (method === 'POST' && path === '/api/ai/chat-history')");
  check('서버: GET·POST 갈래가 있다(전제)', g > 0 && p > g);
  const gBody = AI.slice(g, p);
  check('서버: 최근 답했으면 계산하지 않는다', /if \(!\(await recentlyAnswered\(env\.DB, uid, 'aifriend', nowS\)\)\)/.test(gBody));
  check('서버: 판정 결과를 응답에 싣는다', /level_suggest: levelSuggest/.test(gBody) && /levelSuggest = decideLevelSuggestion\(lv, ev, targets\)/.test(gBody));
  check('서버: 목표는 정본 표에서 만든다', /AI_FRIEND_LEVELS as any\)\[k\]\.maxWordsPerSentence/.test(gBody));
  const pBody = AI.slice(p, p + 1400);
  check('서버 POST: 모르는 action 거절', /!== 'level_suggest'\) return json\(\{ ok: false, error: 'unknown_action' \}, 400\)/.test(pBody));
  check('서버 POST: 토큰 uid 일치 검사(IDOR)', /if \(authUid !== uid\) return json\(\{ ok: false, error: 'uid_mismatch' \}, 403\)/.test(pBody));
  check('서버 POST: 인증 검사가 기록보다 먼저', pBody.indexOf('uid_mismatch') > 0 && pBody.indexOf('uid_mismatch') < pBody.indexOf('recordSuggestAnswer('));
}
// ── 배선: 화면 ──
{
  check('화면: 지금 단계를 실어 묻는다', /chat-history\?uid=' \+ encodeURIComponent\(auth\.uid\) \+ '&level=' \+ encodeURIComponent\(currentLevel\)/.test(HTML));
  check('화면: 받으면 그린다', /if \(d\.ok && d\.level_suggest\) showLevelSuggest\(d\.level_suggest, auth\)/.test(HTML));
  const s = HTML.indexOf('function showLevelSuggest(sg, auth) {');
  let e = -1, d = 0;
  if (s > 0) for (let i = HTML.indexOf('{', s); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}') { d--; if (d === 0) { e = i + 1; break; } } }
  check('화면: showLevelSuggest 를 오려 냈다(전제)', s > 0 && e > s);
  // 가짜 DOM 으로 실제로 돌린다
  const run = (sg, cur) => {
    const made = []; let clicked = 0; const posts = [];
    const lvBtn = { textContent: 'S3 · A2+', click: () => { clicked++; } };
    const chat = { parentNode: { insertBefore: (b) => made.push(b) } };
    const document = {
      getElementById: (id) => id === 'chat' ? chat : (id === 'lvSuggest' ? (made[0] || null) : null),
      querySelector: (q) => (q === '.opt[data-level="S3"]' ? lvBtn : null),
      createElement: () => { const el = { style: {}, attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; } }; return el; },
    };
    const fetch = (u, o) => { posts.push(JSON.parse(o.body)); return Promise.resolve({}); };
    new Function('document', 'fetch', 'currentLevel', 'isEn', 'escapeHtml', HTML.slice(s, e) + '\nshowLevelSuggest(arguments[5], { uid: "kid", token: "t" });')(
      document, fetch, cur, () => false, (x) => String(x), sg);
    return { made, clicked: () => clicked, posts, lvBtn };
  };
  const sg = { from: 'S2', to: 'S3', dir: 'up', evidence: { turns: 15 } };
  const r = run(sg, 'S2');
  check('화면: 제안 상자를 그린다(한국어)', r.made.length === 1 && /한 단계 올려 볼까요/.test(r.made[0].innerHTML) && /S3 · A2\+ 로 바꾸기/.test(r.made[0].innerHTML));
  check('화면: 그리기만 하고 단계를 몰래 바꾸지 않는다', r.clicked() === 0 && r.posts.length === 0);
  const click = (a) => r.made[0].listeners.click({ target: { closest: () => ({ getAttribute: () => a }) } });
  click('accept');
  check('화면: «바꾸기» 를 누르면 기존 단계 버튼을 누르고 답을 남긴다', r.clicked() === 1 && r.posts[0] && r.posts[0].decision === 'accept' && r.posts[0].action === 'level_suggest' && r.made[0].removed);
  const r2 = run(sg, 'S2');
  r2.made[0].listeners.click({ target: { closest: () => ({ getAttribute: () => 'dismiss' }) } });
  check('화면 짝: «그대로» 는 단계를 안 바꾸고 답만 남긴다', r2.clicked() === 0 && r2.posts[0].decision === 'dismiss');
  check('화면 짝: 그 사이 단계를 바꿨으면(어긋남) 안 그린다', run(sg, 'S4').made.length === 0);
}
check('화면: 상자 글자색이 배경과 대비가 있다(#7c2d12 on #fff7ed)', /background:#fff7ed;border:1px solid #fdba74;color:#7c2d12/.test(HTML));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);

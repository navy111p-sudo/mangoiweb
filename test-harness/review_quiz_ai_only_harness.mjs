// review_quiz_ai_only_harness.mjs — «AI 학습만 하는 학생에게 복습퀴즈 대신 단어장» (2026-09-23)
//
//   제안: AI 학습 컨텐츠만 하는 학생은 복습퀴즈가 의미가 없다(수업에서 배운 것을 묻는데 수업이 없다).
//   한 일:
//     ① 전체 메뉴(js/idx-allmenu.js)가 그 학생에게 「복습퀴즈」 칸을 감춘다 → 단어장이 앞으로 온다.
//     ② «오늘의 A.i 학습»(src/today-plan.ts)이 집에서 하는 날의 복습퀴즈를 단어장으로 바꾼다.
//   판정 정본은 서버 src/student-track.ts(활성 예약 0건 = ai_only). 화면은 /api/student/today?track=1 로 묻기만.
//
//   ⚠️ 문자열 검사로는 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은 «무엇이 나오는가» 뿐.
//      그래서 정본을 번들해 «실제로 돌리고», 메뉴 판정·필터도 소스에서 오려 내 «실제로 돌린다».
//   ✅ 「감춘다」 옆에 「모르면·수업 학생이면 그대로 보인다」를 짝으로 둔다
//      (짝이 없으면 «전부 감추기» 도 통과한다).
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
function check(name, cond, info) {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
}
/** 선언 뒤 첫 `{` 부터 짝이 맞는 `}` 까지 (JS — 반환 타입이 없으니 꺾쇠를 세지 않는다) */
function blockFrom(src, needle) {
  const at = src.indexOf(needle); if (at < 0) return null;
  const open = src.indexOf('{', at); if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// ═══ ① 정본(today-plan.ts)을 번들해 실제로 돌린다 ═══
console.log('\n[ ① 오늘의 A.i 학습 — 복습퀴즈 → 단어장 ]');
const ESB = join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild');
if (!existsSync(ESB)) {
  console.log('  ⏭  esbuild 없음(node_modules 미설치) — ①절만 건너뜀');
} else {
  const tmp = mkdtempSync(join(tmpdir(), 'rq-aionly-'));
  const out = join(tmp, 'tp.mjs');
  let mod = null;
  try {
    execFileSync(process.platform === 'win32' ? process.execPath : ESB,
      (process.platform === 'win32' ? [ESB] : []).concat([join(CF, 'src', 'today-plan.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']));
    mod = await import(pathToFileURL(out).href);
  } catch (e) { check('정본 번들', false, e && e.message); }
  if (mod) {
    const { buildTodayPlan, HOME_WEEK } = mod;
    const tueHasReview = (HOME_WEEK[2] || []).includes('review');
    check('전제: 화요일 집 묶음에 복습퀴즈가 있다(이 검사가 헛돌지 않게)', tueHasReview, HOME_WEEK[2]);
    const base = { band: 3, textbook: null, dow: 2, nowMin: 600, classes: [], weekClassDows: [], done: {} };
    let p, keys;
    try {
      p = buildTodayPlan({ ...base, aiOnly: true }); keys = p.steps.map(s => s.key);
      check('aiOnly 면 집에서 하는 날 복습퀴즈가 빠진다', !keys.includes('review'), keys);
      check('aiOnly 면 그 자리에 단어장이 들어온다', keys.includes('vocab'), keys);
      const v = p.steps.find(s => s.key === 'vocab');
      check('단어장 설명이 «복습» 이라고 말한다', !!v && /복습/.test(v.whyKo), v && v.whyKo);
      const wk = p.week.find(d => d.dow === 4);
      check('주간표(목요일)에도 복습퀴즈 대신 단어장', !!wk && !wk.tools.includes('review') && wk.tools.includes('vocab'), wk && wk.tools);
    } catch (e) { check('aiOnly 실행', false, e && e.message); }
    try {
      p = buildTodayPlan({ ...base, aiOnly: false }); keys = p.steps.map(s => s.key);
      check('짝: aiOnly 가 아니면 예전 그대로 복습퀴즈', keys.includes('review') && !keys.includes('vocab'), keys);
      p = buildTodayPlan({ ...base }); keys = p.steps.map(s => s.key);
      check('짝: 값이 없으면(모름) 예전 그대로 복습퀴즈', keys.includes('review'), keys);
      p = buildTodayPlan({ ...base, aiOnly: true, classes: [{ start: '19:00', minutes: 20, source: 'cafe24' }], weekClassDows: [2] });
      keys = p.steps.map(s => s.key);
      check('짝: 오늘 수업이 잡힌 날은 aiOnly 여도 수업 뒤 복습퀴즈를 그대로 둔다', keys.includes('review'), keys);
    } catch (e) { check('짝 실행', false, e && e.message); }
  }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ═══ ② 서버 배선 ═══
console.log('\n[ ② /api/student/today — ?track=1 · aiOnly 배선 ]');
{
  const s = rd(join(CF, 'src', 'api-students.ts'));
  const body = blockFrom(s, "if (method === 'GET' && path === '/api/student/today')") || '';
  check('전제: 라우트 몸통을 잘라 냈다', body.length > 1000, body.length);
  const gate = body.indexOf('resolveOwnerScope(');
  const tr = body.indexOf("searchParams.get('track')");
  check('?track=1 갈래가 있다', tr > 0);
  check('?track=1 갈래가 본인 확인 게이트 «뒤» 다(남의 수강 여부를 캐지 못함)', gate > 0 && tr > gate, { gate, tr });
  const trBlock = blockFrom(body, "searchParams.get('track')") || '';
  check('?track=1 은 정본 resolveStudentTrack 을 부른다', /resolveStudentTrack\(/.test(trBlock));
  check('?track=1 응답은 캐시 금지', /no-store/.test(trBlock));
  check('계획에 aiOnly 를 «ai_only 일 때만» 넘긴다', /aiOnly:\s*track\s*===\s*'ai_only'/.test(body));
}

// ═══ ③ 전체 메뉴 — 판정·필터를 오려 내 실제로 돌린다 ═══
console.log('\n[ ③ 전체 메뉴 — 복습퀴즈 칸 감추기 ]');
{
  const m = rd(join(CF, 'public', 'js', 'idx-allmenu.js'));
  const pieces = ['function mangoiIsStaff()', 'function _trackUid()', 'function mangoiTrackCached(', 'function mangoiTrackHide()']
    .map(n => blockFrom(m, n));
  check('전제: 판정 함수 넷을 오려 냈다', pieces.every(Boolean));
  const keyDecl = (m.match(/var TRACK_KEY = [^;]+;/) || [''])[0];
  check('전제: 캐시 키 선언을 읽었다', !!keyDecl);
  const arr = (() => { const a = m.indexOf('var ALLMENU_ITEMS = ['); const e = m.indexOf('];', a); return a > 0 && e > a ? m.slice(a, e + 2) : ''; })();
  const loopStart = m.indexOf('ALLMENU_ITEMS.forEach(function(m){');
  const loopHead = loopStart > 0 ? m.slice(loopStart, m.indexOf('var ico', loopStart)) : '';
  check('전제: 메뉴 표와 필터 머리를 오려 냈다', !!arr && /liveOnly/.test(loopHead));

  function run({ uid, staff, cached }) {
    const store = {}; const sess = {};
    if (staff) store.mangoi_admin_session = 'x';
    if (cached) sess.mangoi_track_v1 = JSON.stringify({ uid: cached.uid, track: cached.track, t: Date.now() - (cached.age || 0) });
    const mk = (o) => ({ getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
    const win = { getCurrentUser: () => (uid ? { uid, name: '' } : null) };
    const code = keyDecl + '\n' + pieces.join('\n') + '\n' + arr + `
      var _zhOk = true, _staff = mangoiIsStaff(), _aiOnly = mangoiTrackHide(), names = [];
      ${loopHead.replace('ALLMENU_ITEMS.forEach(function(m){', 'ALLMENU_ITEMS.forEach(function(m){')}
        names.push(m.name); });
      return names;`;
    try { return new Function('window', 'localStorage', 'sessionStorage', code)(win, mk(store), mk(sess)); }
    catch (e) { return 'ERR ' + e.message; }
  }
  const has = (r, n) => Array.isArray(r) && r.includes(n);
  let r = run({ uid: 'kid1', cached: { uid: 'kid1', track: 'ai_only' } });
  check('AI 전용 학생: 복습퀴즈가 안 보인다', Array.isArray(r) && !has(r, '복습퀴즈'), r);
  check('AI 전용 학생: 중국어 복습퀴즈도 안 보인다', Array.isArray(r) && !has(r, '중국어 복습퀴즈'), r);
  check('AI 전용 학생: 단어장은 그대로 보인다', has(r, '단어장'));
  if (Array.isArray(r)) check('AI 전용 학생: 단어장·AI 단어 퀴즈 다음 칸이 MBTI 매칭(복습퀴즈 자리가 당겨짐)',
    r[r.indexOf('AI 단어 퀴즈') + 1] === 'MBTI 매칭', r.slice(r.indexOf('단어장'), r.indexOf('단어장') + 3));
  r = run({ uid: 'kid1', cached: { uid: 'kid1', track: 'live_ai' } });
  check('짝: 화상수업 학생은 복습퀴즈가 보인다', has(r, '복습퀴즈'), r);
  r = run({ uid: 'kid1', cached: { uid: 'kid1', track: 'unknown' } });
  check('짝: 모름(unknown)이면 보인다', has(r, '복습퀴즈'), r);
  r = run({ uid: 'kid1' });
  check('짝: 아직 답이 없으면(캐시 없음) 보인다', has(r, '복습퀴즈'), r);
  r = run({ uid: '' , cached: { uid: '', track: 'ai_only' } });
  check('짝: 비로그인은 보인다', has(r, '복습퀴즈'), r);
  r = run({ uid: 'kid1', staff: true, cached: { uid: 'kid1', track: 'ai_only' } });
  check('짝: 직원 세션이면 보인다', has(r, '복습퀴즈'), r);
  r = run({ uid: 'kid2', cached: { uid: 'kid1', track: 'ai_only' } });
  check('짝: 다른 학생의 캐시로는 감추지 않는다', has(r, '복습퀴즈'), r);
  r = run({ uid: 'kid1', cached: { uid: 'kid1', track: 'ai_only', age: 11 * 60 * 1000 } });
  check('짝: 캐시가 10분을 넘으면 믿지 않는다(보인다)', has(r, '복습퀴즈'), r);

  // 늦게 온 답 — 열린 그리드에서 그 칸만 뺀다
  const openBody = blockFrom(m, 'function openAllMenuOverlay()') || '';
  check('메뉴를 열 때 서버에 묻는다(mangoiTrackFetch)', /mangoiTrackFetch\(function\(\)\{/.test(openBody));
  check('답이 늦게 오면 data-live-only 칸을 지운다', /querySelectorAll\('a\[data-live-only\]'\)[\s\S]{0,120}removeChild/.test(openBody));
  check('복습퀴즈 칸에 data-live-only 표식을 단다', /m\.liveOnly \? ' data-live-only="1"'/.test(openBody));
  const fetchFn = blockFrom(m, 'function mangoiTrackFetch(') || '';
  check('fetch 는 «성공이라고 말했을 때만» 믿는다(d.ok === true)', /d\.ok !== true/.test(fetchFn));
  check('fetch 는 ai_only 일 때만 칸을 뺀다', /d\.track === 'ai_only' && onAiOnly/.test(fetchFn));
  check('중국어 복습퀴즈도 같은 규칙(liveOnly)이고 zh 규칙은 그대로다',
    /name:'중국어 복습퀴즈'[^}]*zh:true[^}]*liveOnly:true/.test(arr));
}

// ═══ ④ 캐시 번호 ═══
console.log('\n[ ④ index.html 이 새 번호로 부른다 ]');
{
  const idx = rd(join(CF, 'public', 'index.html'));
  const v = (idx.match(/idx-allmenu\.js\?v=(\d+)/) || [])[1];
  check('idx-allmenu.js 를 v=15 이상으로 부른다', Number(v) >= 15, v);
}

console.log(`\n🧠 review_quiz_ai_only_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);

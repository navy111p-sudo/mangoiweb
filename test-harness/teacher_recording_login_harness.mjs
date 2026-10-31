// ═══════════════════════════════════════════════════════════════════════
// 🧑‍🏫 「Double Login Issue」 회귀 하니스 (2026-08-13, 필리핀 IT매니저 Karl 제보)
//
//   [사고] 상단바에 «Teacher Win» 으로 이미 로그인한 강사가 메뉴 → 「녹화 보기」를
//          누르면 로그인 창이 **한 번 더** 떴다.
//   [원인] 교사·본사·지사 로그인은 `mangoi_admin_session` 만 만들고 학생 키
//          (`mangoi_logged_user`)는 일부러 만들지 않는데(idx-user-session.js 116줄),
//          flow.js 의 studentUid() 는 학생 키만 봐서 «미로그인» 으로 판정했다.
//
//   여기서 지키는 것:
//     ① 교사·관리자 세션만 있어도 녹화가 바로 재생된다 (로그인 창이 안 뜬다)
//     ② 그 경로에서 /api/student/login 을 부르지 않는다 (교사는 학생계정이 없어 404 만 난다)
//     ③ 아무 세션도 없으면 예전처럼 로그인 안내가 뜬다 (권한이 넓어지지 않았다)
//     ④ 학생 로그인 경로는 그대로다
//     ⑤ 서버(api-mango.ts)도 목록 API 에서 관리자·교사 세션 쿠키를 인정한다
//
//   브라우저 없이 window/document/localStorage/fetch 를 흉내 내어 **실제 flow.js 를 실행**한다.
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FLOW = path.join(HERE, '..', 'cloudflare-deploy', 'public', 'js', 'flow.js');
const APIM = path.join(HERE, '..', 'cloudflare-deploy', 'src', 'api-mango.ts');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }

console.log('═'.repeat(66));
console.log('  🧑‍🏫 녹화 보기 — 교사·관리자 세션 재로그인 방지 (Karl «Double Login»)');
console.log('═'.repeat(66));

const SOURCE = fs.readFileSync(FLOW, 'utf8');

const REC_ROW = {
  id: 77, date: '2026-08-12', topic: '방 class-9 수업', teacher: 'Teacher Win',
  duration: '25분', size: '31 MB', url: '/api/recording/play?id=77', status: 'completed',
  storage: 'r2', failed: false,
};

/** 최소한의 브라우저 흉내 — 실제 flow.js 를 그대로 실행한다. */
function makeEnv(seed) {
  const store = new Map(Object.entries(seed || {}));
  const ls = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const appended = [];                       // body 에 붙은 오버레이(마지막 것이 현재 화면)
  const calls = [];                          // fetch 로 나간 요청 [{url, opts}]
  const videoEl = { src: '', addEventListener() {}, load() {}, pause() {} };

  function el(tag) {
    const e = {
      tagName: tag, id: '', innerHTML: '', children: [], parentNode: null,
      style: { cssText: '' },
      setAttribute() {}, addEventListener() {},
      appendChild(c) { e.children.push(c); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    return e;
  }

  const body = el('body');
  body.appendChild = c => { c.parentNode = body; body.children.push(c); appended.push(c); };
  body.removeChild = c => { const i = body.children.indexOf(c); if (i >= 0) body.children.splice(i, 1); };

  const doc = {
    body,
    head: el('head'),           // flow.js 가 애니메이션 <style> 을 심는다
    createElement: el,
    addEventListener() {}, removeEventListener() {},
    getElementById(id) { return body.children.filter(c => c.id === id)[0] || null; },
    // recShowPlayer 가 찾는 <video>
    querySelector(sel) { return /data-rec-video/.test(String(sel)) ? videoEl : null; },
  };

  const win = {
    document: doc,
    localStorage: ls,
    location: { pathname: '/', search: '', href: '/' },
  };
  win.top = win; win.self = win; win.window = win;

  async function fetchStub(url, opts) {
    const u = String(url);
    calls.push({ url: u, opts: opts || {} });
    if (u.indexOf('/api/student/login') >= 0) {
      // 교사 아이디는 students_erp 에 없다 — 실제 서버도 404 를 준다
      return { ok: false, status: 404, async json() { return { ok: false, error: 'user_not_found' }; } };
    }
    if (u.indexOf('/api/student/recordings') >= 0) {
      const hasCookie = (opts && opts.credentials) === 'include';
      if (!hasCookie) return { ok: false, status: 401, async json() { return { ok: false, error: 'auth_required' }; } };
      return { ok: true, status: 200, async json() { return { ok: true, rows: [REC_ROW], count: 1 }; } };
    }
    return { ok: false, status: 404, async json() { return { ok: false }; } };
  }

  // flow.js 는 window/document 를 인자로 받고 fetch 는 전역처럼 쓴다 → 셋 다 주입
  new Function('window', 'document', 'fetch', SOURCE)(win, doc, fetchStub);

  return { win, ls, store, appended, calls, videoEl, flow: win.MangoFlow };
}

const screen = env => (env.appended.length ? env.appended[env.appended.length - 1].innerHTML : '');
const settle = () => new Promise(r => setTimeout(r, 20));

// ── ① 교사·관리자 세션만 있을 때 — 로그인 창이 뜨면 안 된다 ──────────────
console.log('\n[ ① 교사 세션(mangoi_admin_session)만 있는 브라우저 ]');
{
  const env = makeEnv({
    mangoi_admin_session: JSON.stringify({ uid: 'win', name: 'Teacher Win', role: 'hq_teacher' }),
  });
  ok(!!env.flow && typeof env.flow.playRecording === 'function', 'MangoFlow.playRecording 노출');
  env.flow.playRecording();
  await settle();

  const html = screen(env);
  ok(!/data-rec-login/.test(html), '재로그인 안내가 뜨지 않는다 (Karl 제보의 그 화면)');
  ok(/data-rec-video/.test(html), '녹화 플레이어가 열린다');
  ok(env.videoEl.src === REC_ROW.url, '재생 URL 이 서버가 준 값 그대로 (' + env.videoEl.src + ')');

  const recCalls = env.calls.filter(c => c.url.indexOf('/api/student/recordings') >= 0);
  ok(recCalls.length > 0, '녹화 목록 API 를 호출한다');
  ok(recCalls.every(c => c.opts.credentials === 'include'),
    '관리자 세션 쿠키를 함께 보낸다 (credentials:include)');
  ok(env.calls.every(c => c.url.indexOf('/api/student/login') < 0),
    '/api/student/login 을 부르지 않는다 (교사는 학생계정이 없다)');
  ok(recCalls.some(c => /uid=win\b/.test(c.url)) || recCalls.some(c => /uid=Teacher(%20|\+)Win/.test(c.url)),
    '계정 아이디 또는 표시이름으로 조회한다');
}

// ── ② 학생 신분을 몰래 만들지 않는다 ─────────────────────────────────────
console.log('\n[ ② 교사 계정이 학생 신분을 얻지 않는다 ]');
{
  const env = makeEnv({
    mangoi_admin_session: JSON.stringify({ uid: 'win', name: 'Teacher Win', role: 'hq_teacher' }),
  });
  env.flow.playRecording();
  await settle();
  ok(!env.store.has('mangoi_logged_user'), 'mangoi_logged_user 를 만들지 않는다');
  ok(!env.store.has('mango_user'), 'mango_user 를 만들지 않는다');
  ok(!env.store.has('mangoi_uid'), 'mangoi_uid 를 만들지 않는다');
}

// ── ③ 아무 세션도 없으면 예전대로 로그인 안내 ────────────────────────────
console.log('\n[ ③ 미로그인 — 권한이 넓어지지 않았다 ]');
{
  const env = makeEnv({});
  env.flow.playRecording();
  await settle();
  const html = screen(env);
  ok(/data-rec-login/.test(html), '로그인 안내가 뜬다');
  ok(!/data-rec-video/.test(html), '플레이어는 열리지 않는다');
  ok(env.calls.length === 0, '서버를 부르지도 않는다');
}

// ── ④ 학생 로그인 경로는 그대로 ──────────────────────────────────────────
console.log('\n[ ④ 학생 로그인 경로 회귀 ]');
{
  const env = makeEnv({
    mangoi_logged_user: JSON.stringify({ uid: 'navy111p', name: '정우영', role: 'student' }),
  });
  env.flow.playRecording();
  await settle();
  const html = screen(env);
  ok(/data-rec-video/.test(html), '학생도 그대로 재생된다');
  ok(env.calls.some(c => /\/api\/student\/recordings\?.*uid=navy111p/.test(c.url)),
    '학생 uid 로 조회한다');
  ok(env.calls.some(c => c.url.indexOf('/api/student/login') >= 0),
    '학생은 토큰 재발급(/api/student/login)을 그대로 시도한다');
}

// ── ⑤ 전체 목록 화면도 같은 신원을 쓴다 ──────────────────────────────────
console.log('\n[ ⑤ 전체 녹화 목록(📚)도 교사 세션으로 열린다 ]');
{
  const env = makeEnv({
    mangoi_admin_session: JSON.stringify({ uid: 'win', name: 'Teacher Win', role: 'hq_teacher' }),
  });
  env.flow.showList();
  await settle();
  const html = screen(env);
  ok(!/data-rec-login/.test(html), '목록 화면에서도 재로그인을 요구하지 않는다');
  ok(/data-rec-play=/.test(html), '녹화 행이 그려진다');
}

// ── ⑦ 영어 강사가 읽을 수 있어야 한다 (이 화면은 통째로 한국어였다) ──────
console.log('\n[ ⑦ 영어 화면 — 강사 다수가 필리핀 ]');
{
  const env = makeEnv({
    mangoi_lang: 'en',
    mangoi_admin_session: JSON.stringify({ uid: 'win', name: 'Teacher Win', role: 'hq_teacher' }),
  });
  env.flow.showList();
  await settle();
  const html = screen(env);
  ok(/My recorded classes/.test(html), '목록 제목이 영어로 나온다');
  ok(/▶ Play/.test(html), '재생 배지가 영어로 나온다');
  ok(!/내 녹화 수업|▶ 재생/.test(html), '한국어 원문이 남아 있지 않다');
  ok(/Room class-9 class/.test(html), "서버가 준 '방 X 수업' 도 영어로 바뀐다");
  ok(/25 min/.test(html), "수업 길이 '25분' 도 영어로 바뀐다");

  const ko = makeEnv({
    mangoi_lang: 'ko',
    mangoi_admin_session: JSON.stringify({ uid: 'win', name: 'Teacher Win', role: 'hq_teacher' }),
  });
  ko.flow.showList();
  await settle();
  ok(/내 녹화 수업/.test(screen(ko)), '한국어는 그대로다 (회귀 없음)');
}

// ── ⑥ 서버도 같은 판정을 한다 (한쪽만 고치면 반쪽짜리다) ──────────────────
console.log('\n[ ⑥ 서버 /api/student/recordings — 관리자·교사 세션 인정 ]');
{
  const src = fs.readFileSync(APIM, 'utf8');
  const i = src.indexOf("path === '/api/student/recordings'");
  const block = i >= 0 ? src.slice(i, i + 4000) : '';
  ok(i >= 0, '핸들러를 찾았다');
  ok(/checkAdminSession\(/.test(block),
    '토큰이 없을 때 관리자·교사 세션 쿠키를 확인한다');
  ok(/recAuthUid && recAuthUid !== uid/.test(block),
    '학생 토큰 소유자 검증은 그대로 남아 있다 (IDOR 방지)');
  ok(/!recAuthUid && !recAdminSess\.ok/.test(block),
    '둘 다 없으면 여전히 401 이다');
}

console.log('\n' + '─'.repeat(66));
console.log(`  결과: ${pass} 통과, ${fail} 실패`);
if (fail) process.exit(1);

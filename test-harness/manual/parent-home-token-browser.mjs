/* manual/parent-home-token-browser.mjs — 마이페이지(parent.html)가 «홈 로그인» 을 알아보는가 (2026-09-14)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  cd cloudflare-deploy/public && python3 -m http.server 8892
 *          /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *            --remote-debugging-port=9222 --user-data-dir=/tmp/cd-parent about:blank &
 *   실행:  node test-harness/manual/parent-home-token-browser.mjs
 *
 * [왜] 2026-09-14 사장님 「로그인 하면 다시 로그인 안 해도 바로 마이페이지 내용들이 모두 보이게 해줘」.
 *      홈에서 로그인한 학생은 mango_token(서버 서명 토큰)을 이미 갖고 있고 그 토큰은 마이페이지의
 *      30일 토큰과 같은 함수(signUidToken)로 발급·검증되는데, 화면이 mangoi_parent_token 만 보고 있어
 *      ID 만 채워 주고 비밀번호를 «또» 물었다.
 *
 * [무엇을 재나] 서버는 안 띄우고 fetch 를 가짜로 물린다(D1 에 아무것도 안 쓴다).
 *   ① 홈 토큰만 있고 같은 계정 → 비밀번호 없이 대시보드가 «보이는가» + 그 토큰으로 조회했는가
 *   ② 홈 토큰은 있는데 비밀번호 미설정 계정 → «설정 단계» 가 바로 열리는가(경고창 0)
 *   ③ 홈 토큰이 만료 → 조용히 입력화면(경고창 0) — ID 는 채워져 있는가
 *   ④ 「다른 ID 로 조회」 뒤 새로고침 → 자동 조회를 «쉬는가»(짝: 없으면 되돌아올 길이 없다)
 *   ⑤ 홈 로그인은 jeong 인데 ?uid=다른사람 → 홈 토큰을 «쓰지 않는가»(짝: 없으면 «언제나 자동» 도 통과)
 *      ⑤-2 대소문자만 다른 uid 도 «남» — ⑤-3 옛 모양(user_id)의 mangoi_logged_user 도 알아봄
 *      ①-2 자동으로 열리면 «홈에서 로그아웃해야 잠김» 안내(짝: 직접 로그인 때는 없음) — ③-2 네트워크 예외도 조용히
 *   ⑥ 홈 로그인 없음 → 옛 동작 그대로(입력화면·경고창 0)
 * ⚠️ 캐시를 «두 겹» 다 끈다 — 서비스워커는 setCacheDisabled 로 안 꺼진다(CLAUDE.md).
 */
const PORT = Number(process.env.CDP_PORT || 9222);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8892';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.log('페이지 대상이 없습니다 — 크로미움을 먼저 띄우세요'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waits = new Map(); let dialogs = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; waits.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id);
    m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  if (m.method === 'Page.javascriptDialogOpening') {
    dialogs.push(m.params.message);
    send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
  }
});
const evalJs = async (expr) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('EVAL-TIMEOUT')), 12000))
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (_) {}

/* 가짜 fetch — 동작은 localStorage.__stubmode 로 고른다(스크립트는 한 번만 깐다: 쌓이면 재선언으로 죽는다) */
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){
  var real = window.fetch; window.__calls = [];
  function J(o, st){ return Promise.resolve(new Response(JSON.stringify(o), { status: st||200, headers: {'Content-Type':'application/json'} })); }
  window.fetch = function(u, o){
    var url = String(u); var mode = localStorage.getItem('__stubmode') || 'ok';
    if (url.indexOf('/api/') !== 0 && url.indexOf(location.origin + '/api/') !== 0) return real.apply(this, arguments);
    window.__calls.push(url);
    if (url.indexOf('/api/parent/dashboard') === 0) {
      var q = new URL(url, location.origin).searchParams, tok = q.get('token'), cu = q.get('child_uid');
      if (mode === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
      if (mode === 'nopw') return J({ ok:false, error:'password_not_set' }, 401);
      if (mode === 'stale' || !tok || tok === 'DEAD' || cu !== 'jeong') return J({ ok:false, error:'auth_required' }, 401);
      return J({ ok:true, child:{ user_id:'jeong', student_name:'정우영', program:'Regular' }, points:{ balance:120, lifetime_earned:200, lifetime_spent:80, recent_tx:[] }, evaluations:[], attendance:[], payments:[], next_class:null });
    }
    if (url.indexOf('/api/student/login') === 0) {
      var b = {}; try { b = JSON.parse(o && o.body || '{}'); } catch(e){}
      if (!b.password) return J({ ok:false, error:'password_required' }, 401);
      return J({ ok:true, token:'NEW_TOK', user:{ user_id:'jeong', has_password:true } });
    }
    if (url.indexOf('/api/student/set-password') === 0) return J({ ok:true });
    return J({ ok:true, items:[], list:[] });
  };
})();` });

const go = async (q) => { await send('Page.navigate', { url: BASE + '/parent.html' + q });
                          await new Promise(r => setTimeout(r, 2500)); };
/* 같은 오리진에서 저장소를 «먼저» 심어 두고 여는 헬퍼 (about:blank 에서는 다른 오리진이라 못 심는다) */
const prep = async (ls, ss) => {
  await send('Page.navigate', { url: BASE + '/precheck.html?_nc=' + Date.now() }); await new Promise(r => setTimeout(r, 800));
  await evalJs(`(function(){ localStorage.clear(); sessionStorage.clear();
    var ls=${JSON.stringify(ls)}; for (var k in ls) localStorage.setItem(k, ls[k]);
    var ss=${JSON.stringify(ss||{})}; for (var k in ss) sessionStorage.setItem(k, ss[k]); return 1; })()`);
  dialogs = [];
};
let P = 0, F = 0;
const t = (name, got, want) => { const okk = String(got) === String(want); okk ? P++ : F++;
  console.log(`  ${okk ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${okk ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`); };
const state = () => evalJs(`(function(){
  var e=document.getElementById('entry'), d=document.getElementById('dashboard'), p=document.getElementById('pw-step');
  var vis=function(x){ return !!(x && x.offsetParent); };
  return { entry: vis(e), dash: vis(d), pw: vis(p), uid: (document.getElementById('uid-input')||{}).value||'',
           pwLabel: (document.getElementById('pw-label')||{}).textContent||'', name: (document.getElementById('pd-name')||{}).textContent||'',
           dashCalls: (window.__calls||[]).filter(function(u){ return u.indexOf('/api/parent/dashboard')===0; }) }; })()`);
const HOME = { mangoi_logged_user: JSON.stringify({ uid:'jeong', name:'정우영', role:'student' }), mango_token:'HOME_TOK' };

console.log('① 홈 로그인 + 홈 토큰 — 비밀번호 없이 대시보드가 보이는가');
await prep({ ...HOME, __stubmode:'ok' }); await go('?_nc=' + Date.now());
let s = await state();
t('대시보드가 보인다', s.dash, true);
t('입력화면은 숨는다', s.entry, false);
t('홈 토큰으로 조회했다', s.dashCalls.some(u => u.includes('token=HOME_TOK') && u.includes('child_uid=jeong')), true);
t('이름이 그려졌다', s.name, '정우영');
t('경고창 0', dialogs.length, 0);

console.log('\n② 홈 토큰은 있는데 비밀번호 미설정 — 설정 단계가 «바로» 열리는가');
await prep({ ...HOME, __stubmode:'nopw' }); await go('?_nc=' + Date.now());
s = await state();
t('입력화면', s.entry, true); t('대시보드 숨김', s.dash, false);
t('비밀번호 단계가 보인다', s.pw, true);
t('«설정» 모드 라벨', /설정/.test(s.pwLabel), true);
t('ID 가 채워져 있다', s.uid, 'jeong');
t('경고창 0(자동 시도는 조용히)', dialogs.length, 0);

console.log('\n③ 홈 토큰이 만료(auth_required) — 조용히 입력화면');
await prep({ ...HOME, __stubmode:'stale' }); await go('?_nc=' + Date.now());
s = await state();
t('입력화면', s.entry, true); t('대시보드 숨김', s.dash, false); t('비밀번호 단계는 아직 아님', s.pw, false);
t('ID 는 채워져 있다', s.uid, 'jeong'); t('경고창 0', dialogs.length, 0);

console.log('\n④ 「다른 ID 로 조회」 뒤 새로고침 — 자동 조회를 쉬는가 / 직접 로그인하면 다시 켜지는가');
await prep({ ...HOME, __stubmode:'ok' }); await go('?_nc=' + Date.now());
s = await state(); t('(전제) 자동으로 열렸다', s.dash, true);
await evalJs(`(pdLogout(), 1)`); await new Promise(r => setTimeout(r, 2500));
s = await state();
t('새로고침 뒤 입력화면', s.entry, true); t('대시보드 숨김', s.dash, false);
t('탭 표시가 남았다', await evalJs(`sessionStorage.getItem('mangoi_parent_switch')`), '1');
await evalJs(`(document.getElementById('uid-input').value='jeong', pdGo())`); await new Promise(r => setTimeout(r, 800));
await evalJs(`(document.getElementById('pw-input').value='1234', pdPwGo())`); await new Promise(r => setTimeout(r, 1500));
s = await state();
t('비밀번호로 직접 들어가면 대시보드', s.dash, true);
t('직접 로그인이 탭 표시를 지운다', await evalJs(`sessionStorage.getItem('mangoi_parent_switch')`), null);

console.log('\n⑤ 홈 로그인은 jeong 인데 ?uid=다른 사람 — 홈 토큰을 «쓰지 않는가»');
await prep({ ...HOME, __stubmode:'ok' }); await go('?uid=other_kid&_nc=' + Date.now());
s = await state();
t('입력화면(자동 조회 없음)', s.entry, true);
t('dashboard 호출 0건', s.dashCalls.length, 0);
t('ID 는 URL 의 것', s.uid, 'other_kid');

console.log('\n⑥ 홈 로그인 없음 — 옛 동작 그대로');
await prep({ __stubmode:'ok' }); await go('?_nc=' + Date.now());
s = await state();
t('입력화면', s.entry, true); t('dashboard 호출 0건', s.dashCalls.length, 0); t('경고창 0', dialogs.length, 0);

console.log('\n⑤-2 대소문자만 다른 uid(?uid=Jeong) — 홈 토큰을 쓰지 않는가(Kim/kim 처럼 다른 계정이 실재)');
await prep({ ...HOME, __stubmode:'ok' }); await go('?uid=Jeong&_nc=' + Date.now());
s = await state();
t('입력화면(자동 조회 없음)', s.entry, true); t('dashboard 호출 0건', s.dashCalls.length, 0);

console.log('\n⑤-3 옛 모양(user_id 만 있는 mangoi_logged_user)도 홈 로그인으로 알아보는가');
await prep({ mangoi_logged_user: JSON.stringify({ user_id:'jeong', name:'정우영' }), mango_token:'HOME_TOK', __stubmode:'ok' }); await go('?_nc=' + Date.now());
s = await state();
t('대시보드', s.dash, true); t('홈 토큰으로 조회', s.dashCalls.some(u => u.includes('token=HOME_TOK')), true);

console.log('\n①-2 자동으로 열렸을 때 «홈에서 로그아웃해야 잠긴다» 안내가 보이는가 / 직접 로그인 때는 안 보이는가');
await prep({ ...HOME, __stubmode:'ok' }); await go('?_nc=' + Date.now());
t('자동 열림 → 안내 보임', await evalJs(`!!(document.getElementById('pd-home-note')||{}).offsetParent`), true);
await prep({ __stubmode:'ok' }); await go('?_nc=' + Date.now());
await evalJs(`(document.getElementById('uid-input').value='jeong', pdGo())`); await new Promise(r => setTimeout(r, 800));
await evalJs(`(document.getElementById('pw-input').value='1234', pdPwGo())`); await new Promise(r => setTimeout(r, 1500));
s = await state(); t('(전제) 직접 로그인으로 열렸다', s.dash, true);
t('직접 로그인 → 안내 숨김', await evalJs(`!!(document.getElementById('pd-home-note')||{}).offsetParent`), false);

console.log('\n③-2 자동 시도 중 네트워크 예외 — 경고창 없이 입력화면');
await prep({ ...HOME, __stubmode:'throw' }); await go('?_nc=' + Date.now());
s = await state(); t('입력화면', s.entry, true); t('경고창 0', dialogs.length, 0);

console.log('\n⑦ 저장된 30일 토큰(옛 방식)은 여전히 먼저 쓰인다');
await prep({ ...HOME, mangoi_parent_uid:'jeong', mangoi_parent_token:'PARENT_TOK', __stubmode:'ok' }); await go('?_nc=' + Date.now());
s = await state();
t('대시보드', s.dash, true);
t('30일 토큰으로 조회', s.dashCalls.some(u => u.includes('token=PARENT_TOK')), true);

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
ws.close(); process.exit(F ? 1 : 0);

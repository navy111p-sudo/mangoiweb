/* 🗑️ 교재 묶음 삭제 UI — 브라우저 검사 (사람이 부릅니다. 자동으로 안 돕니다)
   실행:  cd cloudflare-deploy/public && python3 -m http.server 8899 &
          node test-harness/manual/textbook-purge-browser.mjs
   [왜 브라우저인가] 문자열 하니스는 «그 버튼이 있는가» 까지만 본다.
     ⛔ 🗑 버튼이 <label> «안» 에 있으면 누를 때마다 숨김 체크박스가 함께 토글된다 —
        마크업만 봐서는 안 보이고, 실제로 눌러 봐야 드러난다. */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (t, c, why='') => { c ? (pass++, console.log('  ✅ ' + t)) : (fail++, console.log('  ❌ ' + t + (why ? ' — ' + why : ''))); };

const proc = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--remote-debugging-port=9222','--window-size=1280,900','about:blank'], { stdio: 'ignore' });
await sleep(2500);

const listRes = await fetch('http://127.0.0.1:9222/json/list');
const tabs = await listRes.json();
/* ⚠️ /json/new?<url> 로 «새 탭» 을 만들면 이 컨테이너에서는 페이지 스크립트가
   하나도 실행되지 않는다(예외도 없다). 반드시 «이미 있는 탭» 을 잡아 Page.navigate 한다. */
const target = tabs.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
/* ⚠️ 네이티브 confirm()/prompt() 가 열리면 **CDP 가 통째로 멈춘다** — Input.dispatchMouseEvent
   조차 안 돌아온다(실측: 검사가 110초 타임아웃). window.confirm 스텁만으로는 확실하지 않아
   («왜 안 먹었는지» 를 재지 못했다) 이벤트로도 한 번 더 닫는다. */
const dialogSeen = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Page.javascriptDialogOpening') {
    dialogSeen.push([m.params.type, String(m.params.message || '')]);
    ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: false } }));
    return;
  }
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
await new Promise(r => ws.onopen = r);
const send = (method, params={}) => new Promise(r => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
/* ⚠️ 서비스워커가 cache-first 로 옛 사본을 준다 — setCacheDisabled 만으로는 안 꺼진다. */
await send('Network.setBypassServiceWorker', { bypass: true });

// API 스텁: 로그인됨 + 묶음 3개
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__calls = [];
  const _f = window.fetch;
  window.fetch = function(u, o){
    const url = String(u);
    window.__calls.push({ url, method: (o && o.method) || 'GET', body: (o && o.body) || null });
    if (url.includes('/api/admin/me'))
      return Promise.resolve(new Response(JSON.stringify({ ok:true, user:{username:'mgr_maimai',name:'Mai'}, roleLabel:'본사' }), {status:200,headers:{'Content-Type':'application/json'}}));
    if (url.includes('/api/admin/textbook-hidden-books'))
      return Promise.resolve(new Response(JSON.stringify({ ok:true, books:[
        { book:'BTS 2 001 (Shapes and colors)', files:19, hidden:false },
        { book:'Mangoi Books', files:2394, hidden:true },
        { book:'(기타)', files:12, hidden:false }] }), {status:200,headers:{'Content-Type':'application/json'}}));
    if (url.includes('/api/admin/textbook-files'))
      return Promise.resolve(new Response(JSON.stringify({ ok:true, dry_run:true, book:'BTS 2 001 (Shapes and colors)', files:19, bytes:1800000, sample:['Slide1.JPG'] }), {status:200,headers:{'Content-Type':'application/json'}}));
    return _f.apply(this, arguments);
  };
` });

await send('Page.navigate', { url: BASE + '/textbook-uploader.html?_nc=' + Date.now() });
await sleep(3000);

console.log('[ 화면이 사실을 말하는가 ]');
ok('페이지 JS 에러가 없다', (await evalJs(`(window.__err||[]).length===0 || true`)) !== false);
ok('로그인됨 배너가 보인다(스텁 로그인)', await evalJs(`getComputedStyle(document.getElementById('auth-ok')).display !== 'none'`));
ok('미로그인 경고는 숨어 있다', await evalJs(`getComputedStyle(document.getElementById('auth-bar')).display === 'none'`));
ok('로그인한 사람 이름이 뜬다', /Mai/.test(String(await evalJs(`document.getElementById('auth-who').textContent`))));
ok('«이 컴퓨터에 저장된 교재» 제목이 있다', await evalJs(`!!document.body.innerText.includes('이 컴퓨터에 저장된 교재')`));
ok('«공용 자료실 교재» 제목이 있다', await evalJs(`!!document.body.innerText.includes('공용 자료실 교재')`));

console.log('\n[ 공용 자료실 목록 · 🗑 버튼 ]');
ok('서버 묶음 3개가 그려졌다', (await evalJs(`document.querySelectorAll('[data-hide-book]').length`)) === 3);
ok('묶음마다 🗑 삭제 버튼이 있다', (await evalJs(`document.querySelectorAll('[data-del-book]').length`)) === 3);
ok('파일 수가 보인다', await evalJs(`document.getElementById('hide-list').innerText.includes('19개 파일')`));

/* 🔴 핵심 — 🗑 를 눌러도 숨김 체크박스가 «토글되지 않아야» 한다. */
console.log('\n[ 🗑 를 눌러도 숨김이 켜졌다 꺼졌다 하지 않는가 ]');
const before = await evalJs(`document.querySelector('[data-hide-book]').checked`);
/* ⚠️ 이 구역은 화면 아래라 그냥 재면 좌표가 뷰포트 밖이고 elementFromPoint 가 null 이다
   — 「덮여 있다」로 오독하기 쉽다(실측). 먼저 화면 안으로 굴린 뒤 다시 잰다. */
await evalJs(`(function(){ document.querySelector('[data-del-book]').scrollIntoView({block:'center'}); return 1; })()`);
await sleep(400);
await evalJs(`(function(){ const b=document.querySelector('[data-del-book]'); const r=b.getBoundingClientRect();
  window.__cx=Math.round(r.left+r.width/2); window.__cy=Math.round(r.top+r.height/2); return 1; })()`);
const cx = await evalJs('window.__cx'), cy = await evalJs('window.__cy');
ok('🗑 버튼이 화면 안에 있다', cx > 0 && cy > 0);
/* ⚠️ 「보인다」와 「눌린다」는 다르다 — 그 좌표의 «맨 위» 가 그 버튼인지 잰다. */
ok('그 자리의 맨 위 요소가 🗑 버튼이다',
   await evalJs(`document.elementFromPoint(${cx},${cy})?.hasAttribute('data-del-book') === true`));
await send('Input.dispatchMouseEvent', { type:'mousePressed', x:cx, y:cy, button:'left', clickCount:1 });
await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:cx, y:cy, button:'left', clickCount:1 });
await sleep(900);
const after = await evalJs(`document.querySelector('[data-hide-book]').checked`);
ok('🗑 클릭이 숨김 체크박스를 건드리지 않았다', before === after, `before=${before} after=${after}`);
const calls = await evalJs(`JSON.stringify(window.__calls.filter(c=>c.method==='DELETE'))`);
const dels = JSON.parse(calls || '[]');
ok('🗑 가 1단계(dry_run)로 DELETE 를 부른다', dels.length >= 1);
ok('1단계 요청에 dry_run:false 가 없다(세기만 한다)',
   dels.every(c => !/dry_run/.test(String(c.body))), calls.slice(0,160));
ok('1단계 요청에 confirm_name 이 없다',
   dels.every(c => !/confirm_name/.test(String(c.body))));
ok('action 이 purge_book 이다', dels.some(c => /"action":"purge_book"/.test(String(c.body))));

/* 확인창이 «무엇을 얼마나» 지우는지 말하는가 — 숫자만 없는 경고는 사람이 안 읽는다. */
console.log('\n[ 확인창이 사실을 말하는가 ]');
const dlg = dialogSeen;
ok('확인창이 실제로 떴다', dlg.length >= 1, JSON.stringify(dlg).slice(0, 120));
ok('건수를 먼저 보여 준다(19장)', dlg.some(d => /19장/.test(d[1])));
ok('용량도 보여 준다', dlg.some(d => /MB/.test(d[1])));
ok('«되돌릴 수 없습니다» 라고 말한다', dlg.some(d => /되돌릴 수 없습니다/.test(d[1])));
ok('«숨기기» 를 대안으로 안내한다', dlg.some(d => /숨기기/.test(d[1])));
ok('영어로도 말한다(필리핀 매니저)', dlg.some(d => /cannot be undone/i.test(d[1])));
/* 🔴 취소하면 2단계(이름 확인 prompt)로 절대 넘어가면 안 된다. */
ok('취소하면 이름 확인 단계로 안 간다', !dlg.some(d => d[0] === 'prompt'));

console.log('\n──────────────────────────────');
console.log(`PASS ${pass} / FAIL ${fail}`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);

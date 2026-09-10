/**
 * inapp-notice-camoff-browser.mjs — 브라우저로 «실제로 그려지는가» 를 잰다 (사람이 부름)
 *
 * 왜 브라우저인가: 두 고침 다 «함수도 값도 있고» 틀릴 수 있는 것은
 *   «무슨 글자가 나오는가»·«그 배너가 무엇을 덮는가» 뿐이라 문자열 하니스가 원리상 못 본다.
 *
 * ① 얼굴칸 안내 한/영 병기 (idx-main.js vcApplyRemoteCamHint + css/vc-refresh.css .vc-camoff-hint i)
 *    — 자기 화면 토스트(vcAAONotify)는 2026-08-08 사장님 지시로 이미 병기인데 «상대 타일» 만
 *      한 언어였다. class-1896-20260910 에서 한국인 원장님이 영어 안내를 받았다.
 * ② 인앱 브라우저 안내 (js/inapp-escape.js showBanner 내보내기 + idx-vc-mobilefix.js ⓬절)
 *    — 배너는 «이미» 있었는데 선제 조건이 MANGO_VIDEO_PAGE 이고 그 값이 precheck.html 한 곳뿐이라
 *      수업 화면(=/)에서는 getUserMedia 가 실패할 때만 떴다.
 *
 * ⚠️ «짝으로» 묻는다 — 한쪽만 두면 «전부 감추기»·«전부 띄우기» 도 통과한다.
 * 돌리는 법: node test-harness/manual/inapp-notice-camoff-browser.mjs
 *   (서버·크로미움을 이 파일이 직접 띄운다. 준비물이 없으면 «건너뜀» 으로 끝난다)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8931, CDP = 9341;
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
if (!CHROME) { console.log('⏭ 건너뜀 — 크로미움 없음'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: PUB, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--no-sandbox',
  '--disable-dev-shm-usage', '--window-size=430,900', 'about:blank'
], { stdio: 'ignore' });
const bye = (code) => { try { chrome.kill(); } catch {} try { srv.kill(); } catch {} process.exit(code); };

await new Promise(r => setTimeout(r, 1800));

let list;
for (let i = 0; i < 25 && !list; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); }
  catch { await new Promise(r => setTimeout(r, 400)); }
}
const target = (list || []).find(t => t.type === 'page');
if (!target) { console.log('⏭ 건너뜀 — CDP 탭 없음'); bye(0); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let mid = 0; const waits = new Map(); let navCount = 0;
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) navCount++;
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
function send(method, params = {}) {
  return new Promise((res, rej) => { const i = ++mid; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
}
const js = async (expr) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('EVAL-TIMEOUT')), 15000))
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
/* ⚠️ 캐시를 두 겹 다 꺼야 한다 — setCacheDisabled 만으로는 서비스워커가 옛 사본을 준다
   (2026-09-02 실측: 되돌려도 «통과» 하는 거짓 초록) */
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch {}
/* 🔴 «자동 이동을 안 한다» 를 Page.frameNavigated 나 location.href 로 재면 «원리상 실패할 수 없는»
   헛도는 검사가 된다 — openExternal 이 쓰는 kakaotalk:// · intent:// 는 사용자 스킴이라
   main-frame 탐색을 한 건도 안 내고 location.href 도 안 바뀐다(함정 대조 실측).
   → 페이지 스크립트보다 «먼저» 돌려 openExternal 을 세는 스텁으로 갈아 끼운다. */
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
(function(){
  window.__mgOpenExtCalls = 0;
  var _v;
  Object.defineProperty(window, 'MangoEscape', {
    configurable: true,
    get: function(){ return _v; },
    set: function(v){
      try { if (v && typeof v.openExternal === 'function') {
        v.openExternal = function(){ window.__mgOpenExtCalls++; return false; };
      } } catch (e) {}
      _v = v;
    }
  });
})();
` });

const KAKAO = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.4.5';
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function open(ua) {
  await send('Emulation.setUserAgentOverride', { userAgent: ua });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?_nc=${Date.now()}` });
  await new Promise(r => setTimeout(r, 3500));
}

console.log('\n════════ ① 얼굴칸 안내 한/영 병기 ════════');
await open(CHROME_UA);
const hint = await js(`(function(){
  var g = document.getElementById('vc-video-grid') || document.body;
  var box = document.createElement('div'); box.id='vc-video-TEST'; box.className='video-box';
  box.style.cssText='position:relative;width:150px;height:110px';   /* 좁은 타일에서 넘치는지 */
  g.appendChild(box);
  window.vcRemoteCamOff = { TEST: 'aao' };
  vcApplyRemoteCamHint('TEST');
  var h = box.querySelector('.vc-camoff-hint'), i = h && h.querySelector('i');
  var cs = i ? getComputedStyle(i) : null, hs = h ? getComputedStyle(h) : null;
  var r = { txt: h ? h.textContent : '', hasI: !!i,
            iDisplay: cs ? cs.display : '', iPx: cs ? parseFloat(cs.fontSize) : 0,
            hPx: hs ? parseFloat(hs.fontSize) : 0, overflowY: hs ? hs.overflowY : '',
            over: h ? (h.scrollHeight - h.clientHeight) : -1,
            clientH: h ? h.clientHeight : -1, scrollH: h ? h.scrollHeight : -1 };
  window.vcRemoteCamOff = { TEST: 'user' };
  vcApplyRemoteCamHint('TEST');
  r.camTxt = box.querySelector('.vc-camoff-hint').textContent;
  return r;
})()`);
ok('음성전용 안내에 한국어가 있다', hint.txt.includes('음성만'), hint.txt.slice(0, 60));
ok('음성전용 안내에 영어가 있다 (병기)', hint.txt.includes('audio only for now'), hint.txt.slice(0, 60));
ok('영어 줄이 <i> 로 따로 있다', hint.hasI);
ok('영어 줄이 블록(한 줄 차지)', hint.iDisplay === 'block', hint.iDisplay);
ok('영어 줄이 한국어보다 작다', hint.iPx > 0 && hint.iPx < hint.hPx, `${hint.iPx}px < ${hint.hPx}px`);
ok('상자에 overflow:hidden 이 걸려 있다', hint.overflowY === 'hidden', hint.overflowY);
ok('좁은 타일(150×110)에서 글자가 잘리지 않는다', hint.over <= 0,
  `넘침 ${hint.over}px (상자 ${hint.clientH}px / 내용 ${hint.scrollH}px)`);
ok('카메라 꺼짐 안내도 한/영 병기',
  hint.camTxt.includes('카메라를 껐어요') && hint.camTxt.includes('Camera is off'), hint.camTxt);

/* 짝 — 언어가 EN 이어도 «한국어가 사라지지 않는다»(그게 이번 사고였다) */
const enSide = await js(`(function(){
  try { localStorage.setItem('mangoi_lang','en'); } catch(e){}
  window.vcRemoteCamOff = { TEST: 'aao' };
  var box = document.getElementById('vc-video-TEST');
  var old = box.querySelector('.vc-camoff-hint'); if (old) old.remove();
  vcApplyRemoteCamHint('TEST');
  var t = box.querySelector('.vc-camoff-hint').textContent;
  try { localStorage.removeItem('mangoi_lang'); } catch(e){}
  return t;
})()`);
ok('EN 설정에서도 한국어가 함께 나온다', enSide.includes('음성만') && enSide.includes('audio only'), enSide.slice(0, 60));

console.log('\n════════ ② 인앱 브라우저 안내 ════════');
/* 짝(먼저) — 보통 브라우저에서는 «안» 뜬다 */
const plain = await js(`!!document.getElementById('mango-inapp-banner')`);
ok('보통 브라우저에서는 배너가 안 뜬다', plain === false);

await open(KAKAO);
const b1 = await js(`(function(){
  var b = document.getElementById('mango-inapp-banner');
  var row = document.getElementById('ph50-chip-row');
  var rb = b ? b.getBoundingClientRect() : null, rr = row ? row.getBoundingClientRect() : null;
  /* ⚠️ 칩 줄 «한가운데 한 점» 만 보면 칩 사이 빈틈을 잡는다 — 칩을 하나하나 훑는다
     (CLAUDE.md 「그 상자 안의 조작들을 하나하나 훑어 그 자리의 elementFromPoint 를 본다」) */
  var topMost = 'chip', chips = row ? row.querySelectorAll(':scope > *') : [];
  if (!chips.length) topMost = 'none';
  for (var ci = 0; ci < chips.length; ci++) {
    var cr = chips[ci].getBoundingClientRect();
    if (cr.width < 2 || cr.height < 2) continue;
    var el = document.elementFromPoint(cr.left + cr.width/2, cr.top + cr.height/2);
    if (el && el.closest('#mango-inapp-banner')) { topMost = 'banner:' + (chips[ci].id || ci); break; }
    if (!el || !el.closest('#ph50-chip-row')) { topMost = 'other:' + (chips[ci].id || ci) + ':' + (el ? (el.id || el.tagName) : 'none'); break; }
  }
  return { has: !!b, h: rb ? Math.round(rb.height) : 0, hasRow: !!row,
           rowTop: rr ? Math.round(rr.top) : -1, topMost: topMost,
           href: location.href, hasClose: !!document.getElementById('mango-inapp-close'),
           openExt: window.__mgOpenExtCalls };
})()`);
ok('카톡 인앱이면 홈에서 배너가 뜬다', b1.has);
ok('배너가 화면에 실제로 그려졌다', b1.h > 0, `높이 ${b1.h}px`);
ok('⛔ 자동 이동(openExternal)을 부르지 않았다 — 로그인이 안 넘어감',
  b1.openExt === 0, `openExternal ${b1.openExt}회 · ${b1.href.slice(0, 45)}`);
/* 짝 — «위치» 로도 본다(스텁이 헛돌아도 이쪽이 잡는다). ⓬절만 중괄호 짝으로 오려 낸다 */
{
  const src = readFileSync(join(PUB, 'js', 'idx-vc-mobilefix.js'), 'utf8');
  const at = src.indexOf('function mgInAppNotice');
  let d = 0, end = -1;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  const body = at >= 0 && end > at ? src.slice(at, end) : '';
  ok('⓬절을 오려 냈다 (전제)', body.length > 200, `${body.length}자`);
  ok('⓬절 소스에 openExternal 호출이 없다', body.length > 200 && !/openExternal/.test(body));
}
if (b1.hasRow) {
  ok('우상단 칩 줄을 배너 밑으로 내렸다', b1.rowTop >= b1.h, `칩 top ${b1.rowTop} ≥ 배너 ${b1.h}`);
  ok('칩 줄이 배너에 안 가린다 (맨 위가 칩)', b1.topMost === 'chip', b1.topMost);
} else { ok('홈에 우상단 칩 줄(#ph50-chip-row)이 있다 (전제)', false, '없으면 아래 두 검사가 조용히 사라진다'); }

/* 짝 — 로비에서는 «남아야» 한다. 카톡 링크로 들어온 사람에게는 로비가 그것을 읽을 유일한 시간이고,
   덮어서 곤란한 것은 «수업 화면» 의 36px 툴바뿐이다(로비까지 치우면 0.6초만 보인다 — 함정 대조 실측). */
const lob = await js(`(function(){ showView('view-videocall-lobby'); return !!document.getElementById('mango-inapp-banner'); })()`);
ok('로비에서는 배너가 남는다 (카톡 링크로 온 사람이 읽을 시간)', lob === true);

/* 수업에 들어가면 사라진다 — 배너는 top:0 고정인데 수업 툴바는 36px 이라 「나가기」를 덮는다 */
const b2 = await js(`(function(){
  showView('view-videocall-call');
  var b = document.getElementById('mango-inapp-banner');
  var row = document.getElementById('ph50-chip-row');
  return { has: !!b, pad: document.body.style.paddingTop || '',
           rowTop: row ? row.style.top : 'none' };
})()`);
ok('수업에 들어가면 배너가 사라진다 (툴바를 안 덮음)', b2.has === false);
ok('본문 밀어내기(paddingTop)도 되돌린다', b2.pad === '');
ok('칩 줄 위치도 되돌린다', b2.rowTop === '', b2.rowTop);

/* 닫으면 그 세션 동안 다시 안 뜬다 */
await open(KAKAO);
const b3 = await js(`(function(){
  var x = document.getElementById('mango-inapp-close');
  if (!x) return { closed:false };
  x.click();
  var gone = !document.getElementById('mango-inapp-banner');
  var row = document.getElementById('ph50-chip-row');
  return { closed:true, gone: gone, rowTop: row ? row.style.top : '',
           flag: (function(){ try { return sessionStorage.getItem('mangoi_inapp_notice_off'); } catch(e){ return null; } })() };
})()`);
ok('닫기를 누르면 배너가 사라진다', b3.closed && b3.gone);
ok('닫으면 칩 줄이 제자리로 돌아온다', b3.rowTop === '', String(b3.rowTop));
ok('닫았다고 기억한다(그 세션 동안 다시 안 뜸)', b3.flag === '1', String(b3.flag));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
bye(fail ? 1 : 0);

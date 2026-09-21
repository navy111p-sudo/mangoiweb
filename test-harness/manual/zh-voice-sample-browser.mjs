/* zh-voice-sample-browser.mjs — 중국어 성우 견본 화면 «진짜 브라우저» 검사 (2026-09-14)
 *
 * 왜 필요한가 — 사장님 「이거 4개 모두 여자 목소리야.」
 *   사슬이 셋이었고 셋 다 문자열 하니스로는 «원리상» 못 본다(함수도 값도 다 «있었다»).
 *     ⓐ gtts 폴백이 «요청» 키(azure:윈시)에 여성 음성을 써 넣었다(캐시 오염).
 *     ⓑ 캐시 적중 헤더가 «요청이 azure 였나» 로 판정해 그 여성 음성을 «azure» 라고 말했다
 *        → 화면이 경고를 못 하고 그대로 들려줬다.  (ⓐⓑ 는 azure_tts_zh_harness 가 봅니다)
 *     ⓒ 성우 버튼을 차례로 누르면 눌렀던 버튼이 전부 «■ 멈추기» 인 채 남았다
 *        (그 절이 «지금 눌린 버튼» 을 공용 _curBtn 이 아니라 지역 변수로 들고 있었다).
 *   ⓒ 는 «무엇이 그려지는가» 라 여기서만 잽니다.
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      node test-harness/manual/zh-voice-sample-browser.mjs
 *
 * ⚠️ 이 검사의 가짜 MP3 는 진짜 오디오가 아니라 재생 직후 onerror 가 납니다(정직한 실패 분기).
 *    그래서 «마지막 글자» 가 아니라 «지나간 글자» 로 묻습니다 — 안 그러면 멀쩡한 코드가
 *    빨간불이 되어 다음 사람이 없는 버그를 쫓습니다(실제로 밟았습니다).
 *
 * 변이시험(실제로 고쳐서 돌림 — 전부 진짜 FAIL)
 *   Ⓖ 버튼을 지역 변수 cur 로 되돌리기 → ❌ 2건 (사장님 사진의 증상 그대로 재현)
 *   Ⓕ 폴백 경고를 끄기(조건 항상거짓)  → ❌ 3건
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8941, CDP = 9333;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (m, c, x) => { c ? (PASS++, console.log('  ✅ ' + m)) : (FAIL++, FAILS.push(m), console.log('  ❌ ' + m + (x ? '\n       · ' + x : ''))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(CHROME)) { console.log('⏭ 크로미움이 없어 건너뜁니다: ' + CHROME); process.exit(0); }

/* ── public/ 을 그대로 주고 /api/voice/tts 만 흉내 내는 임시 서버 ─────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const FAKE = Buffer.alloc(4000, 0x11);
let MODE = 'azure';
const srv = http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x'); const p = u.pathname;
  if (p === '/__mode') { MODE = u.searchParams.get('m') || 'azure'; r.end('ok'); return; }
  if (p === '/api/voice/tts') {
    q.resume(); await new Promise((s) => q.on('end', s));
    if (MODE === 'slow') await new Promise((s) => setTimeout(s, 4000));
    const h = { 'Content-Type': 'audio/mpeg', 'X-TTS-Engine': MODE === 'fallback' ? 'gtts' : 'azure', 'X-TTS-Speaker': 'zh-cn-yunxineural' };
    if (MODE === 'fallback') h['X-TTS-Fallback'] = 'http_401';
    r.writeHead(200, h); r.end(FAKE); return;
  }
  const f = join(PUB, p === '/' ? 'index.html' : p.slice(1));
  if (!existsSync(f) || !f.startsWith(PUB)) { r.writeHead(404); r.end('nf'); return; }
  r.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PORT, r));
const BASE = 'http://127.0.0.1:' + PORT;

const ch = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + CDP, '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'zhv-')), 'about:blank'],
  { stdio: 'ignore' });
const bye = (code) => { try { ch.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} process.exit(code); };
await sleep(3000);

/* ⚠️ /json/new 로 «새 탭» 을 만들면 이 컨테이너에서는 페이지 스크립트가 아예 안 돕니다
   (CLAUDE.md 2장). 이미 있는 탭을 잡아 Page.navigate 로 엽니다. */
let page = null;
try { page = (await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json()).find((t) => t.type === 'page'); } catch {}
if (!page) { console.log('⏭ CDP 에 붙지 못해 건너뜁니다'); bye(0); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const waiters = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.result?.value;

await cdp('Network.enable'); await cdp('Page.enable');
await cdp('Network.setCacheDisabled', { cacheDisabled: true });
/* ⚠️ HTTP 캐시만 끄면 부족합니다 — 서비스워커가 옛 사본을 줍니다(CLAUDE.md 2장). */
await cdp('Network.setBypassServiceWorker', { bypass: true });
const B = "document.querySelectorAll('#azcards .card button')";
const open = async (mode) => {
  await fetch(BASE + '/__mode?m=' + mode);
  await cdp('Page.navigate', { url: BASE + '/zh-voice-sample.html?_nc=' + Date.now() });
  await sleep(1400);
};

console.log('■ 중국어 성우 견본 — 버튼·폴백 안내');
console.log('\n[ ① 성우를 차례로 누르면 앞 버튼이 돌아오는가 ]');
await open('slow');
ok('전제: 성우 카드가 4개 그려졌다', (await ev(B + '.length')) === 4, '실제: ' + await ev(B + '.length'));
await ev(B + '[0].click()'); await sleep(200);
ok('전제: 첫 버튼이 «멈추기» 로 바뀌었다', String(await ev(B + '[0].textContent')).includes('멈추기'));
await ev(B + '[1].click()'); await sleep(200);
const t0 = String(await ev(B + '[0].textContent')), t1 = String(await ev(B + '[1].textContent'));
ok('다음 성우를 누르면 앞 버튼이 «듣기» 로 돌아온다', t0.includes('듣기'), '실제: ' + t0);
ok('그때 누른 버튼만 «멈추기» 다 (짝)', t1.includes('멈추기'), '실제: ' + t1);
await ev(B + '[2].click()'); await ev(B + '[3].click()'); await sleep(200);
const stuck = await ev('[...' + B + '].filter(b=>b.textContent.indexOf("멈추기")>=0).length');
ok('넷을 차례로 눌러도 «멈추기» 는 하나뿐이다', stuck === 1, '실제: ' + stuck + '개');

const spy = "window.__played=0; Audio.prototype.play=function(){window.__played++; return Promise.resolve();};"
  + "window.__log=[]; var _t=document.getElementById('azst');"
  + "new MutationObserver(function(){window.__log.push(_t.textContent);}).observe(_t,{childList:true,characterData:true,subtree:true});";

console.log('\n[ ② 폴백(여자 목소리)이면 경고하고 소리를 내지 않는가 ]');
await open('fallback'); await ev(spy);
await ev(B + '[0].click()'); await sleep(900);
const msg = String(await ev("document.getElementById('azst').textContent"));
ok('폴백이면 «못 받았습니다» 라고 말한다', msg.includes('못 받았습니다'), '실제: ' + msg);
ok('그 사유(http_401)를 화면에 적는다', msg.includes('http_401'), '실제: ' + msg);
ok('폴백이면 소리를 내지 않는다', (await ev('window.__played')) === 0, '재생 ' + await ev('window.__played') + '회');
ok('폴백이면 버튼이 «듣기» 로 돌아온다', String(await ev(B + '[0].textContent')).includes('듣기'));

/* 🔴 짝 — 없으면 «전부 경고» 도 통과해 성우가 나와도 못 듣게 됩니다 */
console.log('\n[ ③ 진짜 성우면 그대로 들려주는가 (짝) ]');
await open('azure'); await ev(spy);
await ev(B + '[0].click()'); await sleep(900);
const log3 = String((await ev('JSON.stringify(window.__log||[])')) || '[]');
ok('성우가 오면 «재생 중» 이라고 말한다 (짝)', log3.includes('재생 중'), '실제: ' + log3);
ok('성우가 오면 «못 받았습니다» 라고 하지 않는다 (짝)', !log3.includes('못 받았습니다'), '실제: ' + log3);
ok('성우가 오면 실제로 소리를 낸다 (짝)', (await ev('window.__played')) >= 1, '재생 ' + await ev('window.__played') + '회');

console.log('\n─────────────────────────────');
console.log('  통과 ' + PASS + ' · 실패 ' + FAIL);
if (FAIL) { FAILS.forEach((f) => console.log('   · ' + f)); bye(1); }
bye(0);

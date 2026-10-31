// -*- coding: utf-8 -*-
// p38-radio-live-heard-browser.mjs — P-38 3D 조종석 「무전 교신」이 듣는 동안 «지금 들리는 말» 을 그리고,
//   떨어졌을 때 «왜» 를 말하는가.
//
//   [왜 필요한가]  2026-09-13 사장님 제보 「말을 해도 반응이 없어」.
//     마이크·인식은 멀쩡했다 — 듣는 동안 카운트다운 말고는 아무것도 안 그렸고,
//     불합격 문구가 「다시 한 번!」뿐이라 «Hello» 를 못 알아들었다는 사실이 화면에 없었다.
//   ⚠️ 이런 «무엇이 그려지는가» 는 문자열 하니스로 안 보인다 — 함수도 값도 다 «있다».
//      그래서 진짜 브라우저에 가짜 SpeechRecognition 을 심고 조각을 흘려 넣어 글자를 읽는다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   listenOnce·spSpeakStep·spHeard 를 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/p38-radio-live-heard-browser.mjs
//
//   ⚠️ 게임 전체를 돌리지 않는다(three.js 씬·적기 없이) — 무전 교신 카드의 함수를 직접 부른다.
//      그래서 «정상 문장은 여전히 통과한다» 를 짝으로 두어 «전부 실패로 만들기» 변이도 잡는다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 가짜 음성인식 — 페이지가 만든 인스턴스를 window.__sr 에 두고, 검사가 조각을 흘려 넣는다 */
const FAKE_SR = `
  (function(){
    function FakeSR(){ this.started=0; window.__sr=this; }
    FakeSR.prototype.start=function(){ this.started++; };
    FakeSR.prototype.stop=function(){ this.stopped=(this.stopped||0)+1; };
    FakeSR.prototype.abort=function(){ this.stopped=(this.stopped||0)+1; };
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
    /* 조각 흘려 넣기: 세션 하나에 (transcript, isFinal) 목록 */
    window.__feed = function(list){
      var results = list.map(function(it){ var r=[{transcript:it.t}]; r.isFinal=!!it.f; return r; });
      if (window.__sr && window.__sr.onresult) window.__sr.onresult({ resultIndex:0, results: results });
    };
  })();
`;

const browser = await chromium.launch({ executablePath: exe, args: [
  '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function freshPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(FAKE_SR);
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-game-p38-3d.html?glang=en', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // 무전 교신 카드만 연다 — 게임 씬 없이 함수 직접 호출
  await page.evaluate(() => {
    window.G = { pronTry: 0, pronOk: 0, score: 0, kills: 0, sentences: 0, speaking: true,
                 sent: { w: ['Hello', 'I', 'am', 'a', 'student'], ko: '안녕 나는 학생이야' } };
    window.SP = { w: G.sent.w.slice(), ko: G.sent.ko, listen: 1, spoke: 0, need: 3, tryBase: G.pronTry };
    document.getElementById('spSent').textContent = spFull();
    document.getElementById('ovSpeak').classList.remove('hide');
    spDots(0, 'speak');
  });
  return page;
}
const txt = (page, id) => page.evaluate((i) => (document.getElementById(i).textContent || '').trim(), id);

/* 전제 — 정본이 잘려 나왔는가 */
{
  console.log('\n▶ ⓪ 전제');
  const page = await freshPage();
  const ok = await page.evaluate(() => typeof spSpeakStep === 'function' && typeof listenOnce === 'function' && !!window.MangoiScore);
  check('spSpeakStep·listenOnce·MangoiScore 가 실재한다', ok);
  await page.close();
}

/* ① 듣는 동안 «지금 들리는 말» 이 실시간으로 그려진다 */
{
  console.log('\n▶ ① 듣는 동안 실시간 자막');
  const page = await freshPage();
  await page.evaluate(() => spSpeakStep());
  await page.waitForTimeout(150);
  const h0 = await txt(page, 'spHeard');
  check('시작 직후 지난 「들린 말」이 지워져 있다(🎧 …)', /🎧/.test(h0) && !/들린 말/.test(h0), h0);
  const started = await page.evaluate(() => window.__sr && window.__sr.started);
  check('가짜 인식기가 시작됐다(검사 전제)', started >= 1, String(started));

  await page.evaluate(() => window.__feed([{ t: 'I must', f: false }]));
  const h1 = await txt(page, 'spHeard');
  check('중간 조각이 «지금 들리는 말» 로 바로 보인다', /지금 들리는 말/.test(h1) && /I must/.test(h1), h1);

  await page.evaluate(() => window.__feed([{ t: 'I must do then', f: true }, { t: "I'm a student", f: false }]));
  const h2 = await txt(page, 'spHeard');
  check('확정 조각 + 중간 조각이 이어 붙어 보인다', /I must do then I'm a student/.test(h2), h2);
  const st = await txt(page, 'spState');
  check('아직 판정 전 — 상태 줄은 «듣는 중» 그대로', /듣는 중/.test(st), st);
  await page.close();
}

/* ② 떨어지면 «왜» 를 말한다 — Hello 를 빠뜨린 경우 */
{
  console.log('\n▶ ② 불합격 사유');
  const page = await freshPage();
  await page.evaluate(() => spSpeakStep());
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__feed([{ t: 'I am a student', f: true }]));
  await page.waitForTimeout(900);                  // 시작 0.8초 안의 제출은 무시되므로
  await page.evaluate(() => _listenSubmit && _listenSubmit());
  await page.waitForTimeout(150);
  const st = await txt(page, 'spState'), h = await txt(page, 'spHeard');
  check('불합격 — 카드가 남아 있다', await page.evaluate(() => !document.getElementById('ovSpeak').classList.contains('hide')));
  check('상태 줄이 빠뜨린 낱말을 말한다(“hello”)', /hello/i.test(st) && /빠뜨렸/.test(st), st);
  check('「다시 한 번」만 있는 옛 문구가 아니다', !/^다시 한 번!/.test(st), st);
  check('「들린 말」이 최종 결과로 바뀐다', /들린 말/.test(h) && /I am a student/.test(h), h);
  await page.close();
}

/* ③ 아무 말도 못 들었으면 그렇게 말한다 */
{
  console.log('\n▶ ③ 무발화');
  const page = await freshPage();
  await page.evaluate(() => spSpeakStep());
  await page.waitForTimeout(900);
  await page.evaluate(() => _listenSubmit && _listenSubmit());
  await page.waitForTimeout(150);
  const st = await txt(page, 'spState');
  check('«아무 말도 못 들었어요» 를 말한다', /못 들었어요/.test(st) && /No speech/i.test(st), st);
  await page.close();
}

/* ④ 짝 — 정상 문장은 여전히 그 자리에서 통과한다 */
{
  console.log('\n▶ ④ 정상 통과(짝)');
  const page = await freshPage();
  await page.evaluate(() => spSpeakStep());
  await page.waitForTimeout(150);
  await page.evaluate(() => { try { window.__feed([{ t: 'hello I am a student', f: false }]); } catch (e) { window.__err = String(e); } });
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ hide: document.getElementById('ovSpeak').classList.contains('hide'), ok: G.pronOk, tries: G.pronTry }));
  check('첫 시도 100점 → 카드가 닫힌다(퍼펙트 통과)', r.hide && r.ok === 1, JSON.stringify(r));
  await page.close();
}

await browser.close();
server.close();
console.log('\n결과: ✅ PASS ' + pass + '  ❌ FAIL ' + fail);
process.exit(fail ? 1 : 0);

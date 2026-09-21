// -*- coding: utf-8 -*-
// escape-step-art-browser.mjs — 방탈출 「단계가 올라가면 그림이 실제로 바뀌는가」를
//   **진짜 브라우저에 그려서** 잰다.
//
//   [왜 필요한가]  2026-09-21 사장님: 「캐비닛을 열라고 했을 때 클릭하면 캐비닛이 열린 그림으로
//     바뀌는 줄 알았는데 그대로에요.」 이건 «무엇이 화면에 칠해졌는가» 문제라 문자열 하니스로는
//     원리상 못 본다 — 표도 함수도 다 «있고» 틀린 것은 「그려지는가」 뿐이다(CLAUDE.md 2장).
//
//   [자동으로 안 돕니다]  manual/ 규약상 게이트가 물어 가지 않는다. 방탈출 장면을 건드리면
//   **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/escape-step-art-browser.mjs
//
//   ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 게임이 통째로 죽는다(CLAUDE.md 2장).
//      그래서 작은 http 서버를 직접 띄운다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB  = join(ROOT, 'cloudflare-deploy', 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
               '.jpg':'image/jpeg', '.png':'image/png', '.mp3':'audio/mpeg', '.json':'application/json' };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? '✅' : '❌'} ${m}`); };

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) { console.log('⏭  playwright 또는 Chromium 없음 — 건너뜀'); process.exit(0); }

const missed = [];                                   // 404 난 그림
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(PUB, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { if (/\.(jpg|png)$/.test(p)) missed.push(p); res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 620 } });
const page = await ctx.newPage();
page.on('response', r => { if (r.status() === 404 && /\.(jpg|png)$/.test(r.url())) missed.push(r.url()); });

/* ── 한 장소를 끝까지 걸어 보며 단계마다 배경을 잰다 ───────────────────── */
async function walk(loc) {
  await page.goto(`${base}/student-game-escape-voice.html?uid=test`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.startGame === 'function' || document.getElementById('startOv'));
  // 장소를 고정한다 — newGame() 이 무작위로 고르므로 고른 뒤 그 장소로 갈아 끼운다
  return await page.evaluate((locId) => {
    // ⚠️ getComputedStyle 은 CSS transition(background-image .35s) 중이면 «전환 전» 값을 준다.
    //    그래서 「무슨 그림을 걸었는가」는 인라인 style 로 읽는다(실제 칠은 ⑥절이 따로 확인).
    const bg = () => (document.getElementById('scene').style.backgroundImage.match(/escape-[\w-]+\.jpg/) || ['?'])[0];
    startGame();
    const L = LOCATIONS.find(x => x.id === locId);
    G.loc = L; G.steps = L.build(G.code); G.i = 0;
    showStep();
    const out = [];
    for (let i = 0; i < G.steps.length; i++) {
      G.i = i; G.busy = false; showStep();
      const before = bg();
      // advance() 는 TTS·타이머가 얽혀 있어 화면 전환 부분만 그대로 흉내낸다
      const s = G.steps[i], key = artFor(G.loc.id, s.id, 'after');
      setScene(key);
      out.push({ step: s.id, before, after: bg() });
    }
    return out;
  }, loc);
}

console.log('\n① 음성 방탈출 — 장소마다 단계를 걸으며 배경을 잰다');
const LOCS = ['classroom', 'restroom', 'storage', 'rooftop', 'playground', 'study'];
for (const loc of LOCS) {
  const rows = await walk(loc);
  const drawer = rows.find(r => r.step === 'drawer');
  const code   = rows.find(r => r.step === 'code');
  const door   = rows.find(r => r.step === 'door');
  // 핵심 — 「보관함을 열면」 그림이 실제로 달라지는가
  ok(drawer && drawer.before !== drawer.after,
     `${loc}: 보관함을 열면 그림이 바뀐다 (${drawer?.before} → ${drawer?.after})`);
  ok(code && code.before !== code.after, `${loc}: 금고가 열리면 그림이 바뀐다`);
  ok(door && door.before !== door.after, `${loc}: 문이 열리면 그림이 바뀐다`);
  // 짝 — 한 판에서 쓰인 그림이 네 종류 이상인가(사진 1장으로 되돌아가지 않았는가)
  const kinds = new Set(rows.flatMap(r => [r.before, r.after]));
  ok(kinds.size >= 4, `${loc}: 한 판에 ${kinds.size}종의 그림이 쓰인다 (4종 이상)`);
}

console.log('\n② 핫스팟을 클릭하면 그림이 반응하는가');
{
  await page.goto(`${base}/student-game-escape-voice.html?uid=test`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(() => {
    startGame();
    const L = LOCATIONS.find(x => x.id === 'classroom');
    G.loc = L; G.steps = L.build(G.code); G.i = 1; showStep();   // drawer 단계
    const el = document.getElementById('scene');
    const was = { size: el.style.backgroundSize || 'cover', img: el.style.backgroundImage };
    // 맞는 핫스팟을 찾아 누른다
    const want = (OBJECT_LABELS[stepObject(curStep())] || '');
    const btns = [...document.querySelectorAll('#exploreZone .hotspot')];
    const hit = btns.find(b => b.getAttribute('aria-label') === want);
    hit && hit.click();
    const now = { size: el.style.backgroundSize || 'cover', img: el.style.backgroundImage };
    return { found: !!hit, btns: btns.length, was, now };
  });
  ok(r.btns >= 3, `클릭할 곳이 화면에 있다 (${r.btns}개)`);
  ok(r.found, '그 단계의 «맞는» 물건이 목록에 있다');
  ok(r.was.size !== r.now.size, `클릭하면 그림이 그 물건 쪽으로 확대된다 (${r.was.size} → ${r.now.size})`);
  // ⛔ 짝 — 클릭만으로 «열린» 그림이 되면 안 된다(열리는 것은 영어로 말한 뒤)
  ok(r.was.img === r.now.img, '클릭만으로는 아직 열리지 않는다 (영어로 말해야 열린다)');
}

console.log('\n③ 학교 탈출 — 성공이 교실 전체로 되돌아가지 않는가');
{
  await page.goto(`${base}/student-game-escape-school.html?uid=test`, { waitUntil: 'domcontentloaded' });
  const rows = await page.evaluate(() => {
    const bg = () => (document.getElementById('scene').style.backgroundImage.match(/escape-[\w-]+\.jpg/) || ['?'])[0];
    startGame();
    const out = [];
    for (let i = 0; i < STEPS.length; i++) {
      G.i = i; G.busy = false; showStep();
      const before = bg();
      const s = STEPS[i];
      setScene(artFor(s.id, 'after', s.scene));
      out.push({ step: s.id, before, after: bg() });
    }
    return out;
  });
  const backs = rows.filter(r => r.step !== 'classroom' && /classroom\.jpg$/.test(r.after));
  ok(backs.length === 0, `성공 후 교실 전체 사진으로 되돌아가는 단계가 없다${backs.length ? ' — ' + backs.map(b => b.step).join(', ') : ''}`);
  const changed = rows.filter(r => r.step !== 'classroom' && r.before !== r.after).length;
  ok(changed >= 5, `일곱 단계 중 ${changed}단계에서 성공하면 화면이 달라진다`);
}

console.log('\n④ 좀비 실험실 — 캐비닛을 열면 열린 그림이 뜨는가');
{
  await page.goto(`${base}/student-game-escape-zombie.html?uid=test`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(() => {
    const bg = () => (document.getElementById('scene').style.backgroundImage.match(/escape-[\w-]+\.jpg/) || ['?'])[0];
    startGame();
    G.i = 1; showStep();                       // cabinet 단계
    const before = bg();
    setScene('cabinetOpen');
    return { before, after: bg() };
  });
  ok(r.before !== r.after, `캐비닛 단계에서 그림이 바뀐다 (${r.before} → ${r.after})`);
  ok(/cabinet-open/.test(r.after), '바뀐 그림이 「열린 캐비닛」이다');
}

console.log('\n⑥ 건 그림이 실제로 화면에 칠해지는가(전환이 끝난 뒤)');
{
  await page.goto(`${base}/student-game-escape-voice.html?uid=test`, { waitUntil: 'load' });
  await page.evaluate(() => {
    startGame();
    const L = LOCATIONS.find(x => x.id === 'classroom');
    G.loc = L; G.steps = L.build(G.code); G.i = 1; showStep();
    setScene('classroomOpen');                       // 「캐비닛을 연」 그림
  });
  await page.waitForTimeout(700);                    // CSS transition .35s 가 끝나기를 기다린다
  const painted = await page.evaluate(() =>
    getComputedStyle(document.getElementById('scene')).backgroundImage);
  ok(/classroom-open\.jpg/.test(painted), `열린 캐비닛 그림이 실제로 칠해진다 (${(painted.match(/escape-[\w-]+\.jpg/)||['?'])[0]})`);
}

console.log('\n⑤ 빠진 그림이 없는가(404)');
ok(missed.length === 0, `그림 404 가 0건이다${missed.length ? ' — ' + [...new Set(missed)].slice(0, 5).join(', ') : ''}`);

await browser.close(); server.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) { console.log('⚠ 실제 확인 필요'); process.exit(1); }

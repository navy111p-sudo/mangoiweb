import { chromium } from 'playwright-core';
import path from 'node:path';
const OUT = path.join(process.cwd(), 'shots21');
const BASE = 'http://127.0.0.1:8899';
const MODES = [['g13_brick','brick'],['g14_match','match'],['g15_fill','fill'],['g16_balloon','balloon']];

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor:2, locale:'ko-KR' });
// 캡처용 브라우저에만 적용 — 모든 게임이 열린 상태로 두어 잠금 화면 대신 게임을 찍는다
await ctx.addInitScript(() => {
  try {
    const clears = {};
    ['spacemonster','avatar','pizza','escape','escapezombie','escapeschool','tank','langace','p383d',
     'battle3d','fish','shooter','brick','match','fill','balloon','suspect','speaking','wordfighter',
     'tetris','rescue'].forEach(m => clears[m] = 3);
    localStorage.setItem('mangoi_game_clears', JSON.stringify(clears));
    localStorage.setItem('mangoi_game_lang', 'en');
  } catch (e) {}
});

for (const [key, mode] of MODES) {
  const p = await ctx.newPage();
  p.on('dialog', d => d.dismiss().catch(()=>{}));
  try {
    await p.goto(BASE + '/student-games.html', { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(3800);
    await p.evaluate(()=>{ [...document.querySelectorAll('button')].filter(e=>/^(✕|×)$/.test((e.textContent||'').trim())).forEach(e=>{try{e.click()}catch{}}); });
    await p.waitForTimeout(600);
    await p.evaluate(m => { try { hubOpenGame(m); } catch (e) { console.log(String(e)); } }, mode);
    await p.waitForTimeout(3800);
    const active = await p.evaluate(()=> !!document.querySelector('#hub-game.active'));
    await p.screenshot({ path: path.join(OUT, key + '.png') });
    console.log(active ? 'OK  ' : 'HUB ', key, mode);
  } catch (e) { console.log('FAIL', key, String(e).split('\n')[0]); }
  await p.close();
}
await b.close();

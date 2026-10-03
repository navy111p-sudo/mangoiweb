// 🌐 A.i 말하기 화면 KO/EN — 브라우저 검사 (자동으로 안 돕니다, 사람이 부릅니다)
// 사용: cd cloudflare-deploy/public && python3 -m http.server 8947 & 후 node test-harness/manual/warmup-ui-lang-browser.mjs
// EN 으로 바꾼 뒤 연령·수준·교재를 골라도 설정 화면에 한국어 줄이 0 이어야 하고, 새로고침해도 유지돼야 합니다.
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/node_modules/');
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pg = await b.newPage({ viewport:{width:390,height:844} });
await pg.route('**/api/**', r => r.fulfill({status:200, contentType:'application/json', body:'{"ok":false}'}));
await pg.goto('http://127.0.0.1:8947/warmup.html');
await pg.waitForTimeout(800);
const vis = await pg.evaluate(()=>!document.getElementById('wuSetup').hidden);
console.log('setup visible', vis);
const txt = async () => pg.evaluate(()=>document.getElementById('wusMain').innerText.slice(0,400).replace(/\n+/g,' | '));
console.log('KO:', (await txt()).slice(0,160));
await pg.click('#wuSetup .wu-langbtn');
await pg.waitForTimeout(200);
console.log('EN:', (await txt()).slice(0,260));
await pg.click('#wusAges [data-age="adult"]');
await pg.click('#wusLevels [data-lvl="5"]');
await pg.click('#wusTwoWay [data-way="book"]').catch(e=>console.log('book click', e.message.slice(0,80)));
await pg.waitForTimeout(200);
const after = await txt();
const hangul = (await pg.evaluate(()=>document.getElementById('wusMain').innerText)).match(/[가-힣]+/g)||[];
console.log('AFTER picks:', after.slice(0,300));
console.log("SETUP_KO:", (await pg.evaluate(()=>document.getElementById("wusMain").innerText)).split("\n").filter(l=>/[가-힣]/.test(l)).join(" || "));
console.log('lang key', await pg.evaluate(()=>localStorage.getItem('mangoi_lang')));
await pg.reload(); await pg.waitForTimeout(800);
console.log('after reload:', (await txt()).slice(0,120));
// menu
await pg.evaluate(()=>{ document.getElementById('wuSetup').hidden=true; });
await pg.click('#wuSetup .wu-langbtn').catch(()=>{});
await b.close();
console.log("MENU_KO:", "(see above)");

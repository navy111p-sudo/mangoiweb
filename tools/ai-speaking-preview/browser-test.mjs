import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {previewServer} from './server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW_DIR?resolve(process.env.PW_DIR,'node_modules/playwright-core'):'playwright-core');
const server=previewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
let count=0;
function ck(value,name){assert.ok(value,name);count++;console.log(('PASS '+name).trimEnd());}
try{
  ck((await fetch(base+'/api/warmup/chat')).status===403,'preview denies API access');
  const orig=await (await fetch(base+'/js/mango-avatar.js')).text();
  const lily=await (await fetch(base+'/js/mango-avatar-lily-preview.js')).text();
  ck(lily===orig.replace("still:'/img/lily-closed.webp?v=4', rect:{ l:0.05, t:0.02, r:0.95, b:0.92 },","still:'/img/lily-closed.webp?v=4', rect:{ l:0, t:0, r:1, b:1 },"),'Lily only source crop changes, existing eye/mouth/head logic preserved');
  for(const variant of ['index','lily','jake'])for(const [width,height]of [[390,844],[768,1024],[1366,900]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
    const label=variant+' '+width;
    await page.goto(base+'/'+variant+'.html');await page.waitForTimeout(900);
    ck(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' no horizontal overflow');
    ck(await page.locator('#tavatar-canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(x=>x)),label+' existing avatar renders');
    ck(await page.evaluate(()=>Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length).every(e=>{let r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;})),label+' visible targets at least 44px');
    if(variant==='jake')ck(await page.evaluate(()=>document.querySelector('#tavatar-ring').getBoundingClientRect().bottom<=document.querySelector('.dialogue').getBoundingClientRect().top),label+' portrait not covered by dialogue');
    await page.locator('#askOpen').click();await page.locator('#sampleAnswer').click();
    ck(await page.locator('#answer').isVisible(),label+' authored example opens');await page.keyboard.press('Escape');
    ck(await page.locator('#askOpen').evaluate(e=>e===document.activeElement),label+' Escape restores focus');
    await page.locator('#meaning').click();ck(await page.locator('#translation').isVisible(),label+' translation expands');
    await page.locator('#settingsOpen').click();await page.locator('#pace').selectOption('0.65');await page.locator('#settingsClose').click();
    ck(await page.locator('#pace').inputValue()==='0.65',label+' demo speed setting retained');
    const before=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.evaluate(()=>MangoAvatar.mouth('wide'));await page.waitForTimeout(300);
    ck(before!==await page.locator('canvas').evaluate(c=>c.toDataURL()),label+' original mouth rendering changes after help');await page.evaluate(()=>MangoAvatar.plainStop());
    if(width===390){
      const frames=await page.evaluate(async()=>{const c=document.querySelector('canvas'),s=new Set();for(let i=0;i<65;i++){const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let j=0;j<a.length;j+=64)n=(n*31+a[j])|0;s.add(n);await new Promise(r=>setTimeout(r,120));}return s.size;});
      ck(frames>1,label+' original idle animation continues');
    }
    ck(errors.length===0,label+' no JavaScript errors: '+errors.join(';'));
    ck(external.length===0,label+' no external requests');await page.close();
  }
  console.log('PASS total '+count);
}finally{await browser.close();await new Promise(r=>server.close(r));}

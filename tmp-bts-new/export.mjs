// 수업 뷰어용 슬라이드 JPG 내보내기: node export.mjs NN [outRoot]
// 결과: <outRoot>/bts-NN/<레슨번호 0..>/SlideK.jpg  (K=1부터)
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const NN = process.argv[2], OUT = (process.argv[3] || 'exp') + '/bts-' + NN;
const port = 9300 + Math.floor(Math.random() * 600);
const ch = spawn(process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,'--window-size=1000,800','about:blank'],{stdio:'ignore'});
// 크롬이 디버그 포트를 열 때까지 기다림(고정 2초는 러너가 바쁠 때 ECONNREFUSED 로 죽었음)
let list;
for (let t=0;t<60&&!list;t++){ await new Promise(r=>setTimeout(r,500)); try{ const l=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if(l.some(x=>x.type==='page')) list=l; }catch{} }
if(!list) throw new Error('chrome devtools 포트가 30초 안에 안 열림');
const ws = new WebSocket(list.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id];}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
await send('Page.enable');
await send('Page.navigate',{url:'file://'+(process.env.HTML_DIR||(process.cwd()+'/out'))+'/bts-'+NN+'.html'});
await new Promise(r=>setTimeout(r,4000));
const ev=async(e)=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.result.value;
await ev(`(async()=>{document.querySelectorAll('[data-l]').forEach(l=>{if(l.tagName!=='BUTTON')l.hidden=false});
 const st=document.createElement('style');st.textContent='.snd,.notes,.tabs,.no-print{display:none!important} body{background:#fff}';document.head.appendChild(st);
 await Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r})));
 await new Promise(r=>setTimeout(r,1000));return 1})()`);
const plan = await ev(`[...document.querySelectorAll('[data-l]')].filter(l=>l.tagName!=='BUTTON').map(l=>({l:+l.dataset.l,n:l.querySelectorAll('.slide').length}))`);
let total=0;
for (const {l,n} of plan) {
  fs.mkdirSync(`${OUT}/${l}`, {recursive:true});
  for (let k=0;k<n;k++) {
    const r = await ev(`(()=>{const s=document.querySelectorAll('[data-l="${l}"]:not(button) .slide')[${k}];s.scrollIntoView();const b=s.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height}})()`);
    const sh = await send('Page.captureScreenshot',{format:'jpeg',quality:86,clip:{...r,scale:2},captureBeyondViewport:true});
    fs.writeFileSync(`${OUT}/${l}/Slide${k+1}.jpg`, Buffer.from(sh.result.data,'base64')); total++;
  }
}
console.log(JSON.stringify({NN, lessons:plan.length, total}));
ws.close(); ch.kill();

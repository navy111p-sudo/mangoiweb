import fs from 'fs'; import {spawn} from 'child_process';
const a2 = process.argv[2]||''; const HTML = a2.endsWith('.html') ? a2 : 'slides.html'; const out = (a2.endsWith('.html') ? process.argv[3] : a2) || 'jpg';
fs.mkdirSync(out,{recursive:true});
const C = fs.readdirSync('/opt/pw-browsers').find(d=>d.startsWith('chromium-'));
const ch = spawn(`/opt/pw-browsers/${C}/chrome-linux/chrome`,['--headless','--no-sandbox','--remote-debugging-port='+(process.env.PORT||9333),'--allow-file-access-from-files','--hide-scrollbars','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1500));
const tabs = await (await fetch('http://127.0.0.1:'+(process.env.PORT||9333)+'/json/list')).json();
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend={};
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m.result||m); delete pend[m.id];}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.enable');
await send('Page.navigate',{url:'file://'+(HTML.startsWith('/')?HTML:process.cwd()+'/'+HTML)});
await new Promise(r=>setTimeout(r,3500));
const n = (await send('Runtime.evaluate',{expression:'document.querySelectorAll("section.s").length',returnByValue:true})).result.value;
const overflow = (await send('Runtime.evaluate',{returnByValue:true,expression:`[...document.querySelectorAll('section.s')].map((s,i)=>{const b=s.querySelector('.bd7');const r=b&&!s.classList.contains('dark')?b.getBoundingClientRect():s.getBoundingClientRect();const bad=[...(b||s).querySelectorAll('*')].filter(e=>{const q=e.getBoundingClientRect();return q.width&&(q.bottom>r.bottom+1||q.right>r.right+1)}).length;return bad?('s'+(i+1)+':'+bad):''}).filter(Boolean).join(' ')`})).result.value;
console.log('overflow:', overflow||'none');
for(let i=1;i<=n;i++){
  const y=(await send('Runtime.evaluate',{expression:`document.getElementById('s${i}').getBoundingClientRect().top+scrollY`,returnByValue:true})).result.value;
  const r=await send('Page.captureScreenshot',{format:'jpeg',quality:88,clip:{x:0,y,width:1280,height:720,scale:1},captureBeyondViewport:true});
  fs.writeFileSync(`${out}/Slide${i}.JPG`,Buffer.from(r.data,'base64'));
}
ws.close(); ch.kill(); console.log('saved',n);

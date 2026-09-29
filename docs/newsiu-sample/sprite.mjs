// 미리보기용 «한 장짜리 띠» — 단원·판마다 20쪽을 세로로 이어 붙인 JPEG 한 장(폭 960).
// 아티팩트 한 판에 파일이 511개까지라 1,200장을 낱장으로 못 올려서 띠로 묶습니다(교재 원본 JPG 는 그대로).
// 사용: node sprite.mjs 001 002 …  → sp/001-easy.jpg · sp/001-hard.jpg
import fs from 'fs'; import {spawn} from 'child_process';
const HERE = new URL('.', import.meta.url).pathname, W = 960, H = 540, PORT = process.env.PORT || 9399;
fs.mkdirSync(HERE+'sp', {recursive:true});
const C = fs.readdirSync('/opt/pw-browsers').find(d=>d.startsWith('chromium-'));
const ch = spawn(`/opt/pw-browsers/${C}/chrome-linux/chrome`,['--headless','--no-sandbox','--remote-debugging-port='+PORT,'--allow-file-access-from-files','--hide-scrollbars','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1500));
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend={}; ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m.result||m); delete pend[m.id];}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}));});
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
for (const no of process.argv.slice(2)) for (const m of ['easy','hard']) {
  const dir = `${HERE}u/${no}/jpg-${m}`; if (!fs.existsSync(dir)) { console.log('skip', no, m); continue; }
  const n = fs.readdirSync(dir).filter(f=>/^Slide\d+\.JPG$/.test(f)).length;
  const page = `${HERE}sp/_tmp${PORT}.html`;
  fs.writeFileSync(page, `<style>html,body{margin:0}img{display:block;width:${W}px;height:${H}px}</style>` + Array.from({length:n},(_, i)=>`<img src="file://${dir}/Slide${i+1}.JPG">`).join(''));
  await send('Page.navigate',{url:'file://'+page}); await new Promise(r=>setTimeout(r,1200));
  const r = await send('Page.captureScreenshot',{format:'jpeg',quality:78,clip:{x:0,y:0,width:W,height:H*n,scale:1},captureBeyondViewport:true});
  fs.writeFileSync(`${HERE}sp/${no}-${m}.jpg`, Buffer.from(r.data,'base64')); console.log(no, m, n);
}
fs.rmSync(`${HERE}sp/_tmp${PORT}.html`, {force:true}); ws.close(); ch.kill();

// -*- coding: utf-8 -*-
// 👩‍🏫 중국어 발음 연습(speech-coach-cn) 선생님 얼굴 — 2026-09-23 사장님 «중국어 발음 연습 화면에도 선생님 얼굴».
//   재는 것: ① 폭별 크기·4:5·화면 안·안 가려짐·카드/메뉴 손잡이와 안 겹침
//            ② 메이 얼굴(mei-closed.webp)이 실제로 그려지는가
//            ③ «원어민 발음 듣기» 를 누르면 «말하는 중» 이 되고, 멈추면 풀리는가 — 두 번째 재생도
//               (오디오 요소를 매번 새로 만들면 attach 가 첫 요소에만 물려 두 번째부터 입이 안 움직인다)
//   자동으로 안 돕니다 — 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/speech-coach-cn-avatar-browser.mjs
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const reqs=[];
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);reqs.push(p);const b=await readFile(join(root,p==='/'?'index.html':p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
// 1.2초짜리 440Hz WAV (서버 중국어 TTS 대신)
function wav(sec=1.2,rate=16000){const n=Math.floor(sec*rate),b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*12000),44+i*2);return b;}
const WAV=wav();
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe,args:['--autoplay-policy=no-user-gesture-required']});
const SIZES=[[390,844,145,'폰 세로'],[412,780,125,'폰 중간'],[360,640,100,'작은 폰'],[844,390,68,'폰 가로'],[768,1024,175,'태블릿'],
  [1024,768,175,'작은 노트북'],[1366,768,175,'노트북 1366'],[1440,900,190,'PC 1440'],[1920,1080,290,'PC 1920']];
async function open(w,h){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  const page=await ctx.newPage();
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(u.pathname==='/api/voice/tts'){await route.fulfill({status:200,headers:{'content-type':'audio/wav'},body:WAV});return;}
    if(u.pathname.startsWith('/api/')){await route.fulfill({json:{ok:true}});return;}
    await route.continue();});
  await page.goto(base+'/speech-coach-cn.html?_nc='+Date.now());
  await page.waitForTimeout(2500);
  return {ctx,page};
}
for(const [w,h,minW,name] of SIZES){
  const {ctx,page}=await open(w,h);
  const m=await page.evaluate(()=>{
    const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
    const wrapEl=document.getElementById('tavatar-wrap'), ring=document.getElementById('tavatar-ring');
    const fixed=getComputedStyle(wrapEl).position==='fixed';
    if(!fixed) ring.scrollIntoView({block:'center'});
    const rr=R(ring), card=R(document.querySelector('.main-card')), cn=R(document.getElementById('cn-text'));
    const top=document.elementFromPoint(rr.l+rr.w/2, rr.t+rr.h/2);
    const tab=document.getElementById('mg-drawer-tab'); const tr=tab?R(tab):null;
    const st=document.querySelector('#tavatar-status .ts-idle'); const lh=parseFloat(getComputedStyle(st).lineHeight)||16;
    return {rr,card,cn,fixed,tr,onTop:!!(top&&ring.contains(top)),stLines:Math.round(st.getBoundingClientRect().height/lh),innerH:innerHeight,innerW:innerWidth};
  });
  console.log(`▶ ${name} ${w}x${h} — 얼굴 ${Math.round(m.rr.w)}x${Math.round(m.rr.h)} · ${m.fixed?'오른쪽 여백(고정)':'카드 맨 위'}`);
  ok(name+': 얼굴 폭 ≥ '+minW, m.rr.w>=minW, Math.round(m.rr.w)+'px');
  ok(name+': 4:5 비율', Math.abs(m.rr.h/m.rr.w-1.25)<0.03, (m.rr.h/m.rr.w).toFixed(3));
  ok(name+': 얼굴이 화면 안', m.rr.t>=0 && m.rr.b<=m.innerH+1 && m.rr.l>=0 && m.rr.r<=m.innerW+1);
  ok(name+': 얼굴 가운데가 맨 위(안 가려짐)', m.onTop);
  if(m.fixed) ok(name+': 카드(900px)와 안 겹침', m.rr.l>=m.card.r+8, `얼굴 왼쪽 ${Math.round(m.rr.l)} · 카드 오른쪽 ${Math.round(m.card.r)}`);
  else ok(name+': 중국어 문장 위에 놓임(문장을 안 가림)', m.rr.b<=m.cn.t+1, `얼굴 아래 ${Math.round(m.rr.b)} · 문장 위 ${Math.round(m.cn.t)}`);
  if(m.tr) ok(name+': 메뉴 손잡이와 안 겹침', m.rr.l>=m.tr.r || m.rr.b<=m.tr.t || m.rr.t>=m.tr.b);
  ok(name+': 상태 글자 한 줄', m.stLines<=1, String(m.stLines));
  await page.screenshot({path:`/tmp/claude-0/-home-user-mangoiweb/11708116-d8f5-581d-b17e-b8e1f5a4c520/scratchpad/cn-${w}x${h}.png`});
  await ctx.close();
}
// ② 메이 얼굴 · ③ 말하는 중
{
  reqs.length=0;
  const {ctx,page}=await open(1440,900);
  ok('메이 얼굴 그림을 받는다(mei-closed.webp)', reqs.some(p=>p==='/img/mei-closed.webp'));
  ok('옛 영어 선생님 영상은 안 받는다', !reqs.some(p=>/teacher-avatar\.(webm|mp4)/.test(p)));
  const painted=await page.evaluate(()=>{const c=document.getElementById('tavatar-canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>200)n++;return +(n/(d.length/4)).toFixed(3);});
  ok('얼굴이 캔버스에 실제로 그려짐', painted>0.3, 'opaque '+painted);
  const sp=()=>page.evaluate(()=>document.getElementById('tavatar-wrap').classList.contains('speaking'));
  ok('누르기 전엔 말하는 중 아님', !(await sp()));
  await page.click('#btn-tts'); await page.waitForTimeout(500);
  ok('1회째 듣기: 말하는 중', await sp());
  await page.waitForTimeout(2000);
  ok('1회째 끝나면 말하는 중 풀림', !(await sp()));
  await page.click('#btn-tts'); await page.waitForTimeout(500);
  ok('2회째 듣기도 말하는 중(오디오 요소 재사용)', await sp());
  const same=await page.evaluate(()=>typeof cnAudio!=='undefined' && cnAudio instanceof HTMLAudioElement);
  ok('오디오 요소가 하나로 유지됨', same);
  await page.click('#btn-tts'); await page.waitForTimeout(300);
  ok('멈추기 누르면 말하는 중 풀림', !(await sp()));
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);

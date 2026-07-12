import puppeteer from 'puppeteer-core';
const INDEX = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/index.html';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new', args:['--no-sandbox'] });
const swMock = () => { try { const m={register:()=>Promise.resolve({update(){},unregister(){return Promise.resolve(true)}}),getRegistrations:()=>Promise.resolve([]),getRegistration:()=>Promise.resolve(),ready:Promise.resolve({}),addEventListener(){},controller:null}; Object.defineProperty(navigator,'serviceWorker',{get:()=>m,configurable:true}); } catch(_){}
  window.WebSocket = class{constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen()},0)}send(){}close(){}addEventListener(){}};
  window.RTCPeerConnection = class{constructor(){}createOffer(){return Promise.resolve({})}setLocalDescription(){return Promise.resolve()}addEventListener(){}addTrack(){}close(){}createDataChannel(){return{}}}; };

async function join(vw, vh){
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(swMock);
  await page.setViewport({ width:vw, height:vh, isMobile:true, hasTouch:true });
  await page.goto('file:///' + INDEX, { waitUntil:'domcontentloaded' });
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate(async ()=>{
    window.fetch = () => Promise.resolve({ ok:true, json:()=>Promise.resolve({sessions:[]}), text:()=>Promise.resolve('') });
    try{ navigator.mediaDevices=navigator.mediaDevices||{}; navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('nocam')); }catch(_){}
    const ni=document.getElementById('vc-name-input'); if(ni) ni.value='김민수';
    const ri=document.getElementById('vc-roomcode-input'); if(ri) ri.value='mangoi-class';
    try{ window.vcJoinRoom && window.vcJoinRoom(); }catch(_){}
  });
  await new Promise(r=>setTimeout(r,2400));  // 모든 타이머 발화 대기
  const rc = await page.evaluate(()=>document.querySelector('.vc-main-row').className);
  return { page, rc };
}

const results = [];
function check(name, ok, detail){ results.push(ok); console.log(`${ok?'✅':'❌'} ${name}${detail?' — '+detail:''}`); }

// 1) 세로 입장 → video-pip 단독 (조합 없음)
{
  const { page, rc } = await join(390, 844);
  check('세로 입장 기본 = video-pip 단독', rc==='vc-main-row video-pip', rc);
  check('세로: video-threequarter 조합 없음', !rc.includes('threequarter'), rc);
  // 세로에서 사이즈바 3/4 누르면 pip 제거(상호배타)
  const rc2 = await page.evaluate(()=>{ var b=document.querySelector('.video-size-bar button[onclick*="threequarter"]'); window.vcSetVideoSize('threequarter', b); return document.querySelector('.vc-main-row').className; });
  check('세로: 사이즈바 3/4 → pip 제거(상호배타)', rc2.includes('threequarter') && !rc2.includes('video-pip'), rc2);
  await page.close();
}
// 2) 가로 입장 → 3/4 유지 (phero pip 아님)
{
  const { page, rc } = await join(844, 390);
  check('가로 입장 기본 = video-threequarter', rc.includes('threequarter') && !rc.includes('video-pip') && !rc.includes('facepip'), rc);
  await page.close();
}

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} PASS`);
process.exit(passed===results.length?0:1);

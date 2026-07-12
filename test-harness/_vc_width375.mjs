import puppeteer from 'puppeteer-core';
const INDEX = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/index.html';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new', args:['--no-sandbox'] });
async function test(vw){
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(()=>{ try{const m={register:()=>Promise.resolve({update(){},unregister(){return Promise.resolve(true)}}),getRegistrations:()=>Promise.resolve([]),getRegistration:()=>Promise.resolve(),ready:Promise.resolve({}),addEventListener(){},controller:null};Object.defineProperty(navigator,'serviceWorker',{get:()=>m,configurable:true});}catch(_){}
    window.WebSocket=class{constructor(){this.readyState=0;setTimeout(()=>{this.readyState=1;this.onopen&&this.onopen()},0)}send(){}close(){}addEventListener(){}};
    window.RTCPeerConnection=class{constructor(){}createOffer(){return Promise.resolve({})}setLocalDescription(){return Promise.resolve()}addEventListener(){}addTrack(){}close(){}createDataChannel(){return{}}}; });
  await page.setViewport({ width:vw, height:812, isMobile:true, hasTouch:true });
  await page.goto('file:///' + INDEX, { waitUntil:'domcontentloaded' });
  await new Promise(r=>setTimeout(r,900));
  const w = await page.evaluate(async ()=>{
    window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({sessions:[]}),text:()=>Promise.resolve('')});
    try{navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('nocam'));}catch(_){}
    const ni=document.getElementById('vc-name-input'); if(ni)ni.value='김민수';
    const ri=document.getElementById('vc-roomcode-input'); if(ri)ri.value='mangoi-class';
    try{window.vcJoinRoom&&window.vcJoinRoom();}catch(_){}
    await new Promise(r=>setTimeout(r,2200));
    window.vcPortraitSwap && window.vcPortraitSwap();
    await new Promise(r=>setTimeout(r,700));
    const vp=document.getElementById('vc-video-pane');
    return { rowClass:document.querySelector('.vc-main-row').className, w:Math.round(vp.getBoundingClientRect().width), parentW:Math.round(vp.parentElement.getBoundingClientRect().width) };
  });
  await page.close();
  return w;
}
console.log('375px:', JSON.stringify(await test(375)));
console.log('390px:', JSON.stringify(await test(390)));
await browser.close();

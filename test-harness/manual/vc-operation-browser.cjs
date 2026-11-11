// Offline layout check. Requires Playwright and Chromium; run from repository root.
const {chromium}=require(process.env.PW_DIR ? process.env.PW_DIR+'/node_modules/playwright' : (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright'));
const fs=require('fs');
(async()=>{
 const root=process.cwd()+'/cloudflare-deploy/public';
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 // Actual production HTML/CSS; suppress executable page scripts and all remote traffic.
 let html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 await page.route('**/*',async r=>{const u=new URL(r.request().url());const p=root+u.pathname; if(u.hostname==='fixture.test'&&fs.existsSync(p)&&fs.statSync(p).isFile())return r.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.css')?'text/css':'text/plain'});return r.fulfill({body:'',status:404});});
 await page.goto('http://fixture.test/');await page.setContent(html);
 await page.evaluate(()=>{document.body.classList.add('vc-in-call','vc-orientation-dismissed'); document.querySelectorAll('[id^="view-"]').forEach(e=>e.style.display='none'); const v=document.getElementById('view-videocall-call');v.style.display='flex';v.classList.add('active');window.vcSetVideoSize=()=>{};window.vcMicLockToggle=()=>window.__clicked='mic';window.vcDrawLockToggle=()=>window.__clicked='draw';window.vcFocusLockToggle=()=>window.__clicked='focus';localStorage.setItem('mangoi_lang','en');});
 await page.addScriptTag({path:root+'/js/idx-vc-qlog.js'});await page.addScriptTag({path:root+'/js/idx-vc-sizebar.js'});
 await page.evaluate(()=>['vc-studentctl-label','vc-miclock-btn','vc-drawlock-btn','vc-focuslock-btn'].forEach(id=>document.getElementById(id).style.display='inline-flex'));
 for(const [w,h] of [[1366,768],[1024,768],[390,844]]){
  await page.setViewportSize({width:w,height:h});
  for(const id of ['vc-miclock-btn','vc-drawlock-btn','vc-focuslock-btn','vc-operation-open']){
   const result=await page.locator('#'+id).evaluate(e=>{let r=e.getBoundingClientRect();let hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x,y:r.y,w:r.width,h:r.height,hit:e===hit||e.contains(hit)};});
   if(!result.hit||result.w<=0||result.x<0||result.x+result.w>w)throw Error(w+' '+id+' '+JSON.stringify(result));
  }
  await page.locator('#vc-miclock-btn').click();if(await page.evaluate(()=>window.__clicked)!=='mic')throw Error('handler');
  await page.locator('#vc-operation-open').click(); await page.getByRole('dialog').waitFor({state:'visible'});
  if(!(await page.locator('#vc-operation-data').innerText()).includes('Waiting for a peer'))throw Error('unknown status');
  await page.screenshot({path:'/tmp/vc-operation-'+w+'.png'});
  await page.keyboard.press('Escape');
  console.log('PASS',w,h,'controls clickable, diagnostic dialog, unknown state, Escape');
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

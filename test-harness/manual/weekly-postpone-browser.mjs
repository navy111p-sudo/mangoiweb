import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync, readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(resolve(process.env.PW_DIR||'.','node_modules/playwright'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),args:['--no-sandbox']});
const html=readFileSync(new URL('../../cloudflare-deploy/public/lesson-postpone-demo.html',import.meta.url),'utf8');
const out=process.env.BROWSER_OUTPUT||join(tmpdir(),'mangoi-browser-results');mkdirSync(out,{recursive:true});
let checks=0;
try{
for(const width of [390,1360]){
 const context=await browser.newContext({viewport:{width,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const lessons=[0,7,14].map((days,i)=>{let d=new Date('2027-01-06T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return{schedule_id:i+1,scheduled_date:d.toISOString().slice(0,10),next_date:d.toISOString().slice(0,10),start_time:'16:30',teacher_name:'Sandbox Teacher'};});
 const items=lessons.map(c=>{let d=new Date(c.next_date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+7);return{id:c.schedule_id,from_date:c.next_date,from_time:'16:30',to_date:d.toISOString().slice(0,10),to_time:'16:30'};});
 let posts=[],fail=false;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());let data={ok:true,items:[]},status=200;
  if(url.pathname==='/lesson-postpone-demo.html')return route.fulfill({contentType:'text/html',body:html});
  if(url.pathname==='/api/class/schedule/mine')data={ok:true,schedules:lessons};
  else if(url.pathname==='/api/class/schedule/weekly-postpone')data={ok:true,items,count:3,snapshot:'sandbox-snapshot'};
  else if(url.pathname==='/api/class/schedule/request'){posts.push(route.request().postDataJSON());data=fail?{ok:false,error:'series_changed'}:{ok:true,id:1};status=fail?409:200;await new Promise(r=>setTimeout(r,30));}
  else if(!url.pathname.startsWith('/api/'))return route.fulfill({status:204,body:''});
  return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{localStorage.setItem('mangoi_logged_user',JSON.stringify({uid:'sandbox_ui',name:'Sandbox Student'}));localStorage.setItem('mango_token','sandbox-token');});
 await page.goto('http://127.0.0.1/lesson-postpone-demo.html');
 await page.waitForFunction(()=>typeof __MOB_REAL!=='undefined'&&__MOB_REAL===true);
 await page.screenshot({path:out+'/main-'+width+'.jpg',type:'jpeg',quality:70});
 for(let round=0;round<20;round++){
  fail=round%2===1;posts=[];
  await page.evaluate(()=>_goMode('postpone'));
  await page.locator('#pushBtn').click();
  await page.waitForFunction(()=>state.cart.length===1&&state.cart[0].seriesItems.length===3);
  assert.match(await page.locator('#detail-body').innerText(),/연기 전 → 연기 후 · 3회/);checks++;
  assert.equal(await page.locator('#segment').isVisible(),false);checks++;
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);checks++;
  await page.locator('#confirm-btn').click({trial:true});
  if(round===0)await page.screenshot({path:out+'/postpone-'+width+'.jpg',type:'jpeg',quality:70});
  await page.locator('#confirm-btn').dblclick();
  await page.waitForFunction(()=>!state.saving);
  assert.equal(posts.length,1);assert.equal(posts[0].request_scope,'weekly_postpone');assert.equal(posts[0].request_type,'postpone');checks+=3;
  assert.match(await page.locator('#done-title').innerText(),fail?/저장되지/:/요청을 보냈/);checks++;
  await page.evaluate(()=>_goMode('change'));
  assert.equal(await page.locator('#pushBtn').count(),0);assert.match(await page.locator('#detail-title').innerText(),/변경/);checks+=2;
 }
 assert.deepEqual(errors,[]);checks++;await context.close();
}
console.log(JSON.stringify({checks,failures:0,viewports:[390,1360],scope:'shipped browser UI with synthetic API responses; backend covered separately'}));
}finally{
 for(const name of readdirSync(out).filter(n=>n.endsWith('.jpg'))) console.log('BROWSER_IMAGE '+name+' '+readFileSync(resolve(out,name)).toString('base64'));
 await browser.close();
}

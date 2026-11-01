// Real Chrome, production HTML, isolated fixture APIs: never writes production data.
// PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node test-harness/manual/teacher-action-stability-browser.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright-core');
const OUT = resolve(process.env.TEACHER_TEST_OUTPUT || resolve(ROOT, '../../teacher-browser-results'));
mkdirSync(OUT, {recursive:true});
let html = readFileSync(resolve(ROOT,'cloudflare-deploy/public/teacher.html'),'utf8').replace(/\r\n/g,'\n');
// Test-only access to closure functions; these hooks are never saved in production HTML.
html = html.replace('  scheduleAutoRefresh(AR_MIN);\n})();', `  scheduleAutoRefresh(AR_MIN);
  window.__teacherTest = {
    tick: function(){ renderClasses(DATA.classes || []); },
    refresh: autoRefreshTick,
    change: function(){ DATA.classes[0].textbook = 'Updated textbook'; renderClasses(DATA.classes || []); },
    state: function(){ return { pending:reportPendingCount, deferred:classRenderDeferred, data:DATA }; }
  };
})();`);
assert.ok(html.includes('window.__teacherTest'));
const server = createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(req.url.startsWith('/teacher.html') ? html : '<!doctype html><title>Fixture destination</title>Fixture destination');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log('Fixture:',BASE);
const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const checks=[];
let scenarioLabel='';
function check(name, condition){ name=scenarioLabel+' '+name; assert.ok(condition,name); checks.push(name); console.log('PASS',name); }
const ts=Date.now(), today=new Date(ts+9*3600e3).toISOString().slice(0,10);
function monday(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
function mk(id,offset,extra={}){
  return {kind:'class',schedule_id:id,room_id:'class-fixture-'+id,student_uid:'fixture-'+id,student_name:'테스트 학생 '+id,
    start_time:id===1?'19:20':'06:00', start_ts:ts+offset*60000,open_at_ts:ts+(offset-10)*60000,close_at_ts:ts+(offset+35)*60000,
    end_ts:ts+(offset+20)*60000,enter_from_ts:ts-86400000,enter_until_ts:ts+86400000,date:today,duration_min:20,
    level:'Lv 31',textbook:'최상급 교재', class_state:offset<0?'done':'scheduled', ...extra};
}
function data(weekStart=monday(today)){
  return {ok:true,now:ts,today,me:{name:'테스트 강사',username:'fixture-teacher',lang:'ko'},
    classes:[mk(1,-100),mk(2,100,{absence_hold:true})], upcoming:[], notices:[], resources:[], rating:{},
    goal_options:[{key:'speaking',en:'Speak confidently',ko:'자신 있게 말하기'}],
    week:{start:weekStart,end:new Date(Date.parse(weekStart)+6*86400000).toISOString().slice(0,10),days:Array.from({length:7},(_,i)=>({date:new Date(Date.parse(weekStart)+i*86400000).toISOString().slice(0,10),items:[]}))}};
}
try {
  const full=process.env.TEACHER_TEST_MATRIX==='full';
  const scenarios=(full?[1280,1024,800,700,430,390,360,320]:[1280,800,390,320])
    .flatMap(width=>(full?['ko','en']:['ko']).flatMap(lang=>(full?['light','dark']:['light']).map(theme=>({width,lang,theme}))));
  for(const {width,lang,theme} of scenarios){
    scenarioLabel=lang+'/'+theme;
    const context=await browser.newContext({viewport:{width,height:1000}});
    await context.addInitScript(theme=>localStorage.setItem('mangoi_teacher_theme',theme),theme);
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    let model=data(),reportCalls=0,reportMode='hold',releaseReport,releaseLog,logCalls=0,logMode='hold',goalMode='ok',holdPortal=false,releasePortal;
    model.me.lang=lang;
    const fulfill=(route,obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
    await page.route('**/api/**',async route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/api/teacher/portal'){
        if(u.searchParams.get('part')==='goal'){
          if(goalMode==='fail') return fulfill(route,{ok:false,error:'test failure'},500);
          model.classes[0].student_goal={key:'speaking',en:'Speak confidently',ko:'자신 있게 말하기',day:1,days:28};
          return fulfill(route,{ok:true,goal:model.classes[0].student_goal});
        }
        const copy=structuredClone(model); const start=u.searchParams.get('week');if(start) copy.week=data(start).week;
        if(holdPortal){ holdPortal=false; await new Promise(r=>{releasePortal=r;}); }
        return fulfill(route,copy);
      }
      if(u.pathname.endsWith('/report-request')){
        reportCalls++;
        if(reportMode==='hold') await new Promise(r=>{releaseReport=r;});
        return fulfill(route,reportMode==='fail'?{ok:false,error:'test failure'}:{ok:true},reportMode==='fail'?500:200);
      }
      if(u.pathname==='/api/translate') return fulfill(route,{ok:true,en:'The student spoke well.',ko:'오늘 학생이 자신 있게 잘 말했습니다.'});
      if(u.pathname==='/api/eval/manual-create'){
        logCalls++; if(logMode==='hold') await new Promise(r=>{releaseLog=r;});
        if(logMode==='fail') return fulfill(route,{ok:false,error:'test failure'},500);
        model.classes[0].eval_written=true;model.classes[0].eval_id='fixture-log';return fulfill(route,{ok:true,id:'fixture-log'});
      }
      return fulfill(route,{ok:true,items:[],rows:[],reports:[],drafts:[],active:[],requests:[],lessons:[]});
    });
    await page.goto(BASE+'/teacher.html');
    await page.locator('#boot').waitFor({state:'hidden'});
    await page.locator('#classes [data-rep]').waitFor();
    check(width+'px actual HTML renders classes',await page.locator('#classes .cls').count()===2);
    const layout=await page.locator('#classes .cls-act .btn').evaluateAll(bs=>bs.map(b=>({text:b.textContent.trim(),w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height,clip:getComputedStyle(b).textOverflow,over:b.scrollWidth>b.clientWidth+1})));
    check(width+'px full labels and touch sizes',layout.every(b=>b.w>=44&&b.h>=44&&!b.over&&b.clip!=='ellipsis'));
    check(width+'px no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    reportMode='fail';
    await page.locator('#classes [data-rep]').click();
    await page.waitForFunction(term=>document.querySelector('#classes [data-rep]').textContent.includes(term),lang==='ko'?'다시':'Try again');
    check(width+'px report failure enables retry',await page.locator('#classes [data-rep]').isEnabled());
    reportMode='hold';
    // Real pointer, deferred render and blur: the control cannot disappear mid-click.
    const report=page.locator('#classes [data-rep]');
    await report.scrollIntoViewIfNeeded();const rect=await report.boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
    await page.evaluate(()=>{window.savedButton=document.querySelector('#classes [data-rep]');window.__teacherTest.change();});
    check(width+'px pointerdown preserves same button',await page.evaluate(()=>savedButton===document.querySelector('#classes [data-rep]')));
    await page.mouse.up();
    await page.waitForFunction(()=>window.__teacherTest.state().pending===1);
    check(width+'px report retry sends once',reportCalls===2);
    await page.evaluate(()=>window.__teacherTest.tick());
    check(width+'px in-flight report remains disabled',await report.isDisabled());
    releaseReport();await page.waitForFunction(()=>window.__teacherTest.state().pending===0);
    await page.locator('#hi').click();
    await page.waitForFunction(term=>document.querySelector('#classes').textContent.includes(term),lang==='ko'?'요청됨':'Requested');
    check(width+'px report success survives redraw',await page.locator('#classes .btn-ask').isDisabled());
    goalMode='fail';
    await page.locator('#classes select.goal-pick').first().selectOption('speaking');
    await page.waitForFunction(term=>document.querySelector('#classes .cls-goal-msg').textContent.includes(term),lang==='ko'?'저장 안 됨':'Not saved');
    check(width+'px goal failure restores selection and control',await page.locator('#classes select.goal-pick').first().isEnabled()&&(await page.locator('#classes select.goal-pick').first().inputValue())==='');
    goalMode='ok';
    // A portal read started before a local save must not undo the completed write.
    holdPortal=true; await page.evaluate(()=>window.__teacherTest.refresh());
    await page.waitForTimeout(50);assert.ok(releasePortal);
    const goal=page.locator('#classes select.goal-pick').first();
    await goal.selectOption('speaking');
    await page.waitForFunction(()=>document.querySelector('#classes select.goal-pick').disabled===false&&document.querySelector('#classes').textContent.includes('1/28'));
    releasePortal();await page.waitForTimeout(75);
    check(width+'px stale poll does not undo goal save',await page.locator('#classes select.goal-pick').first().inputValue()==='speaking');
    // Modal + actual form save: failure keeps the draft; success changes the row.
    await page.locator('#classes [data-eval]').first().click();
    await page.locator('#ev-raw').fill('The student spoke well.');
    await page.locator('#ev-tr').click();await page.locator('#ev-out').waitFor({state:'visible'});
    await page.locator('#ev-ok').click();
    await page.waitForFunction(()=>document.querySelector('#ev-ok').disabled);
    check(width+'px saving log stays visible',await page.locator('#ev-raw').inputValue()==='The student spoke well.');
    logMode='fail';releaseLog();
    await page.waitForFunction(()=>document.querySelector('#ev-ok')&&!document.querySelector('#ev-ok').disabled);
    check(width+'px failed save retains draft and retry',await page.locator('#ev-raw').inputValue()==='The student spoke well.'&&(await page.locator('#ev-msg').innerText()).includes(lang==='ko'?'그대로':'still here'));
    logMode='ok';await page.locator('#ev-ok').click();await page.locator('#ev-ok').waitFor({state:'detached'});
    check(width+'px successful retry opens saved-log action',await page.locator('#classes [data-evview]').count()===1&&logCalls===2);
    // Screenshot before navigating away.
    await page.locator('#c-classes').scrollIntoViewIfNeeded();
    await page.locator('#c-classes').screenshot({path:resolve(OUT,'teacher-actions-'+width+'-'+lang+'-'+theme+'.png')});
    await page.locator('#lang').click();
    check(width+'px language button updates actions',(await page.locator('#classes').innerText()).includes(lang==='ko'?'Re-enter':'다시 입장'));
    await page.locator('#theme').click();
    check(width+'px dark theme button works',await page.locator('html').getAttribute('data-t')===(theme==='dark'?'light':'dark'));
    await page.locator('#theme').click();await page.locator('#lang').click();
    await page.locator('#class-time-sort').selectOption('desc');
    const held=page.locator('#classes .cls-hold [data-join]');
    await held.click();await page.waitForURL(u=>u.searchParams.get('vc_room')==='class-fixture-2');
    check(width+'px sorted hold-row button opens correct room',new URL(page.url()).searchParams.get('vc_role')==='teacher');
    check(width+'px no JavaScript errors',errors.length===0);
    await context.close();
  }
  writeFileSync(resolve(OUT,'results.json'),JSON.stringify({passed:checks.length,checks},null,2));
  console.log('PASS TOTAL',checks.length);
} finally {await browser.close();server.close();}

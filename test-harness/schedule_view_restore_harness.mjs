import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../cloudflare-deploy/public/admin/weekly-schedule.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('var scheduleViewRestored='),html.indexOf('var demoNames='));
function page(url){
  const controls={};
  const c={URL,URLSearchParams,Date,location:new URL(url),history:{state:null},
    currentWeekStart:new Date(2026,10,2),curDow:0,viewMode:'week',searchQuery:'',activeCategory:'all',sortMode:'name',freeMode:false,
    fmtISO:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    startOfWeek:d=>{d=new Date(d);d.setDate(d.getDate()-(d.getDay()+6)%7);return d;},
    document:{getElementById:id=>controls[id]||=( {value:'',classList:{toggle(){}}} ),querySelectorAll:()=>[]}};
  c.history.replaceState=(_state,_title,path)=>{c.location=new URL(path,c.location);};
  vm.createContext(c);vm.runInContext(code,c);return c;
}
const first=page('https://example.test/admin/weekly-schedule.html?preset=today&demo=1#schedule');
Object.assign(first,{currentWeekStart:new Date(2026,9,19),curDow:4,viewMode:'day',searchQuery:'Teacher Win',activeCategory:'native',sortMode:'least',freeMode:true});
first.saveScheduleView();
const refreshed=page(first.location.href);refreshed.restoreScheduleView();
assert.equal(refreshed.fmtISO(refreshed.currentWeekStart),'2026-10-19');
for(const key of ['curDow','viewMode','searchQuery','activeCategory','sortMode','freeMode'])assert.equal(refreshed[key],first[key],key);
assert.equal(refreshed.scheduleViewRestored,true);
assert.equal(refreshed.location.searchParams.get('demo'),'1');assert.equal(refreshed.location.hash,'#schedule');
refreshed.searchQuery='';refreshed.saveScheduleView();
const cleared=page(refreshed.location.href);cleared.restoreScheduleView();assert.equal(cleared.searchQuery,'');
const invalid=page('https://example.test/?wsDate=2026-02-31&wsView=day');invalid.restoreScheduleView();assert.equal(invalid.scheduleViewRestored,false);
const blocked=page(first.location.href);blocked.history.replaceState=()=>{throw Error('blocked');};assert.doesNotThrow(()=>blocked.saveScheduleView());
assert.match(html,/function render\(\)\{\s*saveScheduleView\(\)/);
assert.match(html,/restoreScheduleView\(\);\s*reloadAndRender\(\);/);
assert.match(html,/if\(scheduleViewRestored\)return;/);
console.log('PASS: refresh restores date, teacher search and view; clear, invalid date, URL preservation and unavailable history checked.');

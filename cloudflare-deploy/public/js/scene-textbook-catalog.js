/* Read the same published textbook groups as the student/teacher library.
 * Catalog membership is not proof that generated practice matches a lesson.
 * No admin API, OCR job, student data or database write is used here. */
(function(root){
  'use strict';
  function classify(name){
    var match=String(name||'').match(/^(BTS|SIU(?:\s+(?:BASIC|ADVANCE(?:D)?))?)\s+(\d+)\b/i);
    if(!match)return null;
    return {series:/^BTS$/i.test(match[1])?'bts':'siu',book:match[1].toUpperCase().replace(/\s+/g,' ')+' '+Number(match[2])};
  }
  function groups(data){
    if(!data||data.ok!==true||!Array.isArray(data.groups))throw Error('Invalid catalog');
    var seen=new Set();
    return data.groups.flatMap(function(row){
      var c=classify(row.book);
      if(!c||!Number.isInteger(row.files)||row.files<1||seen.has(row.book))return [];
      seen.add(row.book);
      return [{name:row.book,level:typeof row.level==='string'?row.level:'',files:row.files,series:c.series,book:c.book}];
    }).sort(function(a,b){return a.name.localeCompare(b.name,'en',{numeric:true});});
  }
  function pages(data,name){
    if(!data||data.ok!==true||!Array.isArray(data.items))throw Error('Invalid pages');
    return data.items.filter(function(p){return Number.isSafeInteger(p.id)&&p.id>0&&typeof p.name==='string'&&p.name.indexOf('['+name+']')===0;})
      .sort(function(a,b){return (Number(a.unit_no)||0)-(Number(b.unit_no)||0)||a.name.localeCompare(b.name,'en',{numeric:true});});
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={classify:classify,groups:groups,pages:pages};return;}
  var $=function(id){return document.getElementById('ct-'+id);},rows=[],controller=null,epoch=0,loaded=false;
  function tr(ko,en){return document.documentElement.lang==='en'?en:ko;}
  function status(ko,en){$('status').textContent=tr(ko,en);}
  function cancel(){epoch++;if(controller)controller.abort();controller=null;$('load').disabled=false;}
  async function get(url,signal){
    var timer=setTimeout(function(){if(controller&&controller.signal===signal)controller.abort();},15000);
    try{var response=await fetch(url,{credentials:'same-origin',signal:signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}finally{clearTimeout(timer);}
  }
  function options(el,list,placeholder){
    el.replaceChildren();var first=document.createElement('option');first.value='';first.textContent=placeholder;el.append(first);
    list.forEach(function(x){var o=document.createElement('option');o.value=x.value;o.textContent=x.label;el.append(o);});el.value='';
  }
  function clearPages(){cancel();$('pages').replaceChildren();$('open').disabled=true;}
  function books(){
    clearPages();var list=rows.filter(function(r){return r.series===$('series').value&&(!$('level').value||r.level===$('level').value);});
    options($('book'),[...new Set(list.map(function(r){return r.book;}))].map(function(v){return {value:v,label:v};}),tr('교재 선택','Choose a book'));
    options($('lesson'),[],tr('교재를 먼저 선택하세요','Choose a book first'));
  }
  function levels(){
    var list=rows.filter(function(r){return r.series===$('series').value;});
    options($('level'),[...new Set(list.map(function(r){return r.level;}).filter(Boolean))].sort(function(a,b){return a.localeCompare(b,'en',{numeric:true});}).map(function(v){return {value:v,label:v};}),tr('모든 등록 레벨','All registered levels'));books();
  }
  function lessons(){
    clearPages();var list=rows.filter(function(r){return r.series===$('series').value&&r.book===$('book').value&&(!$('level').value||r.level===$('level').value);});
    options($('lesson'),list.map(function(r){return {value:r.name,label:r.name+' · '+(r.level||tr('레벨 미등록','No registered level'))+' · '+r.files+tr('쪽',' pages')};}),tr('실제 레슨 선택','Choose a registered lesson'));
  }
  async function load(){
    cancel();controller=new AbortController();var token=epoch;$('load').disabled=true;status('등록 교재 목록을 불러오는 중…','Loading the registered textbook catalog…');
    try{var data=await get('/api/textbook-files?group=1',controller.signal);if(token!==epoch)return;rows=groups(data);loaded=true;$('selectors').hidden=false;levels();status(rows.length?'등록된 교재명·레슨명·레벨입니다. 레슨을 선택해 원문을 확인하세요.':'공개된 BTS·SIU 교재가 없습니다.',rows.length?'Registered book names, lessons and levels. Choose a lesson to view its original pages.':'No published BTS/SIU textbooks found.');}
    catch(e){if(token!==epoch)return;status('교재 목록을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.','Could not load the catalog. Please retry.');}
    finally{if(token===epoch)$('load').disabled=false;}
  }
  async function openPages(){
    var name=$('lesson').value;if(!rows.some(function(r){return r.name===name;}))return;
    clearPages();controller=new AbortController();var token=epoch;status('선택한 레슨의 페이지 목록을 불러오는 중…','Loading the selected lesson page list…');
    try{var list=pages(await get('/api/textbook-files?book='+encodeURIComponent(name)+'&limit=1000',controller.signal),name);if(token!==epoch)return;
      list.forEach(function(p){var a=document.createElement('a');a.href='/api/textbook-files/'+p.id+'/raw';a.target='_blank';a.rel='noopener noreferrer';a.textContent=p.name.slice(name.length+2).trim()||String(p.unit_no||p.id);$('pages').append(a);});
      status(list.length?'원문 페이지를 누르면 새 창에서 열립니다. 아래 그림·영상은 별도의 보충 연습입니다.':'이 레슨의 공개 원문 페이지가 없습니다.',list.length?'Open an original page in a new tab. Picture/video exercises below are separate supplementary practice.':'This lesson has no published source pages.');
    }catch(e){if(token!==epoch)return;status('페이지 목록을 불러오지 못했어요. 원문 보기를 다시 눌러 주세요.','Could not load the page list. Press View source again.');}
    finally{if(token===epoch)$('open').disabled=false;}
  }
  $('load').addEventListener('click',load);$('series').addEventListener('change',levels);$('level').addEventListener('change',books);$('book').addEventListener('change',lessons);
  $('lesson').addEventListener('change',function(){clearPages();$('open').disabled=!$('lesson').value;});$('open').addEventListener('click',openPages);
  ['cq-close','back'].forEach(function(id){document.getElementById(id).addEventListener('click',cancel);});root.addEventListener('pagehide',cancel);
  document.getElementById('ui-lang').addEventListener('click',function(){if(loaded)status('교재명·레슨명·레벨은 등록된 원문 표기를 유지합니다.','Book names, lessons and levels retain their registered labels.');});
})(typeof window!=='undefined'?window:this);

/* Authenticated handover alerts. Web Audio failures remain visible; no acknowledgement on view. */
(function(){
  'use strict';
  var host=document.getElementById('handover-inbox-banner');if(!host)return;
  var shadow=host.attachShadow({mode:'open'}),pending=false,stopped=false,last=null,failed=false,mine=[];
  var audio=null,blocked=false,ringing=false,lastSignature='',lastRing=0,ringCount=0;
  shadow.innerHTML='<style>:host([hidden]){display:none!important}:host{display:block;margin:0 0 18px;color-scheme:light dark}*{box-sizing:border-box}.box{background:light-dark(#eef4ff,#20334e);color:light-dark(#193351,#edf4ff);border:2px solid light-dark(#b8cbe6,#4a6688);border-radius:12px;padding:18px 22px;font:18px/1.5 system-ui,sans-serif;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.box.warning{border-color:#c23425;background:light-dark(#fff0ec,#4b2020)}.title{font-size:23px;font-weight:700;margin:0}.note,.permission{font-size:16px;margin:6px 0 0}a,button{font:inherit;color:light-dark(#214faf,#bdd3ff);font-weight:650;display:inline-block;padding:10px;min-height:44px}button{cursor:pointer;border:1px solid currentColor;border-radius:8px;background:transparent}.actions{display:flex;gap:12px;flex-wrap:wrap}.primary{background:light-dark(#244fad,#b9d1ff);color:light-dark(#fff,#14243c);border-radius:8px;padding:12px 18px;text-decoration:none}[hidden]{display:none!important}.writer{display:flex;flex-direction:column;gap:10px;margin:0 0 12px}.wline{background:light-dark(#fff7e8,#3d2f14);color:light-dark(#4a3305,#fbe8c4);border:2px solid light-dark(#d39b2a,#b3842c);border-radius:12px;padding:14px 18px;font:18px/1.5 system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.wline.bad{border-color:#c23425;background:light-dark(#fff0ec,#4b2020);color:light-dark(#5b1a12,#ffe1da)}.wline b{font-size:19px}.wline button.push-allow,.wline a{background:light-dark(#9a5b00,#f2c46d);color:light-dark(#fff,#2a1d05);border-radius:8px;padding:10px 16px;text-decoration:none}@media(max-width:600px){.box{padding:16px}.title{font-size:22px}}</style><div class="writer" hidden></div><section class="box"><div><p class="title"></p><p class="note" role="status"></p><p class="permission"></p><p class="sound-status" role="status"></p></div><div class="actions"><a class="primary" href="/daily-handover.html"></a><a class="sent" href="/daily-handover.html?view=mine"></a><a class="appr" href="/work"></a><button class="sound" type="button"></button><button class="snooze" type="button"></button></div></section>';
  var box=shadow.querySelector('.box'),title=shadow.querySelector('.title'),note=shadow.querySelector('.note'),permission=shadow.querySelector('.permission'),link=shadow.querySelector('.primary'),sent=shadow.querySelector('.sent'),appr=shadow.querySelector('.appr'),sound=shadow.querySelector('.sound'),snooze=shadow.querySelector('.snooze'),soundStatus=shadow.querySelector('.sound-status'),writer=shadow.querySelector('.writer');
  function en(){var l=window.adminLang;if(l!=='en'&&l!=='ko')l=(document.documentElement.lang||'').slice(0,2);return l==='en';}
  function t(ko,e){return en()?e:ko;}
  function get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function put(k,v){try{localStorage.setItem(k,String(v));}catch(e){}}
  function key(s){return 'mangoi_handover_'+s+':'+(last&&last.me?last.me.username:'');}
  function enabled(){return get('mangoi_work_sound_v1')!=='0';}
  function eligible(){return !last?[]:last.reports.filter(function(r){return !(r.followup&&r.followup.hold_until>Date.now());});}
  // ✍️ 내 보고(2026-10-06) — 오늘 미작성·지난 근무일 미제출은 쓸 때까지 남는다(닫기 없음). 대표님 화면엔 미제출 명단.
  function line(cls,txt,href,btn){var d=document.createElement('div');d.className='wline'+(cls?' '+cls:'');var b=document.createElement('b');b.textContent=txt;d.append(b);if(href){var a=document.createElement('a');a.href=href;a.textContent=btn;d.append(a);}return d;}
  function kstNow(){return new Date(Date.now()+9*3600000).toISOString();}
  function renderWriter(){
    var w=last&&last.writer,ms=last&&last.missed_staff,out=[];
    if(w&&w.required){
      if(w.prev_missed)out.push(line('bad',t('⚠️ 지난 근무일('+w.prev_day+') 매일보고 미제출 — 지금 작성해 주세요','⚠️ Daily handover for '+w.prev_day+' was not submitted — please write it now'),'/daily-handover.html?write='+encodeURIComponent(w.prev_day),t('지난 보고 쓰기','Write it now')));
      if(w.today_required&&!w.today_submitted){var late=kstNow().slice(11,16)>=w.due_time;out.push(line(late?'bad':'',late?t('🔴 오늘 매일보고 마감('+w.due_time+' KST) 지남 — 아직 제출 안 함','🔴 Today\'s daily handover is past due ('+w.due_time+' KST) — not submitted'):t('📝 오늘 매일보고 반드시 작성 · 마감 '+w.due_time+' (KST)','📝 Daily handover required today · due '+w.due_time+' KST'),'/daily-handover.html?write='+encodeURIComponent(w.day||''),t('오늘 보고 쓰기','Write today\'s report')));}
    }
    if(ms&&ms.length)out.push(line('bad',t('📋 매일보고 미제출: ','📋 Not submitted: ')+ms.map(function(m){return m.name+' ('+m.prev_day.slice(5)+')';}).join(', '),'/daily-handover.html?date='+encodeURIComponent(ms[0].prev_day),t('보고 보기','Open reports')));
    if(w&&w.required){var pl=pushLine();if(pl)out.push(pl);}
    writer.replaceChildren.apply(writer,out);writer.hidden=!out.length;return out.length;
  }
  // 🔔 기기 알림 자동 켜기(2026-10-07 사장님 지시: 매일보고 대상은 알림이 «저절로» 켜지게).
  //   브라우저 규칙상 허락 창은 «사람의 클릭» 없이 못 띄운다 — 서버가 대신 켤 방법은 없다.
  //   그래서: 허락됨 → 조용히 등록 · 아직 안 물음 → 이 화면의 첫 클릭/키 입력 때 허락 창 · 차단됨 → 푸는 법을 줄로.
  //   ⚠️ 매일보고 «필수 대상»(writer.required)에게만 건다 — 다른 사람에게 허락 창을 띄우지 않는다.
  //   ⚠️ 등록 실패는 삼키지 않고 줄로 말한다(«켜졌겠지» 로 믿으면 알림이 안 간다).
  var pushState='',pushBusy=false,pushAsked=false;
  // 배너 전체를 숨긴 채 줄만 바뀌면 안 보인다 — 등록 결과가 나오면 숨김 여부도 다시 정한다(Codex P1).
  function reshow(){render();if(last)host.hidden=box.hidden&&!renderWriter();}
  function pushOk(){return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window;}
  function pushWanted(){return !!(last&&last.writer&&last.writer.required&&last.me&&last.me.username&&pushOk());}
  function b64u8(b){var r=atob((b+'='.repeat((4-b.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/')),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}
  async function pushSubscribe(){
    var r=await fetch('/api/push/vapid-public-key',{credentials:'same-origin'});if(!r.ok)throw Error('http');
    var j=await r.json();if(!j||!j.key)throw Error('no_key');
    var reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u8(j.key)});
    var s=sub.toJSON?sub.toJSON():sub;
    var x=await fetch('/api/push/subscribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:s,user_id:last.me.username,ua:navigator.userAgent})});
    var k=await x.json().catch(function(){return null;});if(!x.ok||!k||!k.ok)throw Error('save');
  }
  function autoPush(){
    if(!pushWanted()||pushBusy||pushState==='on')return;
    var p=Notification.permission;
    if(p==='denied'){pushState='denied';return;}
    if(p!=='granted'){pushState='ask';return;}
    if(pushState==='fail')return; // 같은 화면에서 계속 다시 하지 않는다(다시 열면 재시도)
    pushBusy=true;pushSubscribe().then(function(){pushState='on';}).catch(function(e){pushState='fail';try{console.warn('[handover-push] 등록 실패',e);}catch(_){}}).then(function(){pushBusy=false;reshow();});
  }
  function askPush(){
    if(!pushWanted()||pushBusy||pushState!=='ask')return;
    pushBusy=true;pushAsked=true;var q;try{q=Notification.requestPermission();}catch(e){q=null;}
    Promise.resolve(q).then(function(){pushBusy=false;pushState='';autoPush();reshow();}).catch(function(){pushBusy=false;reshow();});
  }
  // 화면 아무 곳 첫 클릭·키 입력은 «한 번만» 묻는다 — 창을 닫았으면 그 뒤엔 «알림 허용» 버튼으로만(Codex P2).
  function askPushOnce(){if(!pushAsked)askPush();}
  function pushLine(){
    if(pushState==='ask'){var d=document.createElement('div');d.className='wline';var b=document.createElement('b');b.textContent=t('🔔 매일보고 알림을 받으려면 기기 알림을 허용해 주세요','🔔 Allow device notifications to get daily-report reminders');var k=document.createElement('button');k.type='button';k.className='push-allow';k.textContent=t('알림 허용','Allow notifications');k.onclick=askPush;d.append(b,k);return d;}
    if(pushState==='denied')return line('bad',t('🔕 이 브라우저는 알림이 차단돼 있습니다 — 주소창 왼쪽 자물쇠 → 알림 → 허용','🔕 Notifications are blocked in this browser — lock icon left of the address bar → Notifications → Allow'));
    if(pushState==='fail')return line('bad',t('⚠️ 기기 알림 등록에 실패했습니다 — 결재함의 «알림 받기» 를 눌러 주세요','⚠️ Could not register device notifications — press «Notify me» in Approvals'),'/work#pushBtn',t('결재함 열기','Open Approvals'));
    return null;
  }
  function render(){
    box.setAttribute('aria-label',t('받은 매일보고','Handover inbox'));link.textContent=t('보고 읽고 응답하기','Read and respond');appr.textContent=t('결재함','Approvals');
    sound.textContent=blocked?t('🔊 알람 소리 켜기','Enable alarm sound'):enabled()?t('🔊 소리 끄기','Mute sound'):t('🔇 소리 켜기','Enable sound');
    snooze.textContent=t('30분간 소리 쉬기','Silence for 30 min');snooze.hidden=!last||!last.total;
    soundStatus.textContent=blocked?t('브라우저가 자동 소리를 막았습니다. ‘알람 소리 켜기’를 눌러 주세요.','Autoplay was blocked. Click Enable alarm sound.'):Number(get(key('snooze')))>Date.now()?t('소리는 잠시 쉬는 중 · 미응답 상태는 유지됩니다.','Sound is paused; reports still need a response.'):'';
    renderWriter();
    if(!last){if(failed)note.textContent=t('새 보고 확인이 지연됩니다. 보고함을 열어 주세요.','Unable to refresh. Open the inbox.');return;}
    title.textContent=t('매일보고 · 미응답 '+last.total+'건','Daily reports · '+last.total+' awaiting response');
    var alerts=eligible(),urgent=alerts.some(function(r){return r.payload.priority==='urgent'||(r.followup&&r.followup.warning_level>0);}),overdue=alerts.filter(function(r){return r.followup&&r.followup.due_at&&r.followup.due_at<Date.now();}).length;
    box.classList.toggle('warning',urgent||overdue>0);
    note.textContent=failed?t('최신 상태 확인 실패 · 보고함을 열어 확인해 주세요.','Refresh failed; open the inbox to verify.'):last.total?(overdue?t('🔴 기한 초과 '+overdue+'건 · ','Overdue '+overdue+' · '):'')+t('확인 완료·보완 요청·사유 있는 보류 중 하나로 응답해 주세요.','Acknowledge, request changes, or give a hold reason.'):t('받은 보고를 모두 확인했습니다.','All received reports acknowledged.');
    var count=mine.filter(function(r){return r.status==='submitted';}).length;
    sent.textContent=t('내가 보낸 보고 · 미응답 '+count+'건 (최근 30일)','My sent reports · '+count+' pending (last 30 days)');
    permission.replaceChildren();var a=document.createElement('a');a.href='/work#pushBtn';a.textContent=typeof Notification==='undefined'||Notification.permission!=='granted'?t('기기 알림 켜기','Enable device notifications'):t('기기 푸시 등록 확인','Check device push registration');permission.append(a);
  }
  function ring(){
    if(!last||failed||stopped||document.hidden||!enabled()||ringing||Number(get(key('snooze')))>Date.now())return;
    var alerts=eligible();if(!alerts.length){blocked=false;render();return;}
    var sig=alerts.map(function(r){var f=r.followup||{};return r.id+':'+r.version+':'+(f.warning_level||0)+':'+(f.last_request_at||0);}).sort().join('|');
    var urgent=alerts.some(function(r){return r.payload.priority==='urgent'||(r.followup&&r.followup.warning_level>0);});
    if(sig===lastSignature&&(!urgent||ringCount>=3||Date.now()-lastRing<300000))return;
    if(Date.now()-Number(get(key('last_sound'))||0)<60000)return;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC){blocked=true;render();return;}
      if(!audio)audio=new AC();
      if(audio.state!=='running'){
        blocked=true;render();
        // Never schedule oscillators on a suspended context: they could sound after reports were resolved.
        var resume=audio.resume();if(resume&&resume.then)resume.then(function(){if(audio.state==='running')ring();}).catch(function(){blocked=true;render();});return;
      }
      ringing=true;
      for(var i=0;i<3;i++){var o=audio.createOscillator(),g=audio.createGain(),start=audio.currentTime+i*0.35;o.type='sine';o.frequency.value=urgent?980:740;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(0.13,start+0.03);g.gain.linearRampToValueAtTime(0,start+0.22);o.connect(g);g.connect(audio.destination);o.onended=(function(osc,gain){return function(){osc.disconnect();gain.disconnect();};})(o,g);o.start(start);o.stop(start+0.24);}
      if(sig!==lastSignature)ringCount=0;lastSignature=sig;ringCount++;lastRing=Date.now();put(key('last_sound'),lastRing);blocked=false;render();setTimeout(function(){ringing=false;},1200);
    }catch(e){ringing=false;blocked=true;render();}
  }
  function setSound(on){if(enabled()!==on&&typeof window.toggleSound==='function')window.toggleSound();put('mangoi_work_sound_v1',on?'1':'0');}
  sound.onclick=function(){if(blocked||!enabled()){setSound(true);blocked=false;put(key('snooze'),0);lastSignature='';ring();}else setSound(false);render();};
  snooze.onclick=function(){put(key('snooze'),Date.now()+1800000);blocked=false;render();};
  // A browser may require this gesture again after every login/navigation.
  function wake(e){if(e&&e.composedPath&&e.composedPath().some(function(n){return n===sound||n===snooze;}))return;if(blocked&&enabled())ring();}
  document.addEventListener('pointerdown',wake,{passive:true});document.addEventListener('keydown',wake);
  document.addEventListener('click',askPushOnce,true);document.addEventListener('keydown',askPushOnce,true);
  async function refresh(){
    if(pending||stopped||document.hidden)return;pending=true;var c=new AbortController(),timer=setTimeout(function(){c.abort();},10000);
    try{
      var r=await fetch('/api/approval/handover/inbox',{credentials:'same-origin',cache:'no-store',signal:c.signal});
      if(r.status===401||r.status===403){stopped=true;last=null;host.hidden=true;if(audio)audio.close().catch(function(){});return;}
      if(!r.ok)throw Error('unavailable');var j=await r.json();if(!j.ok)throw Error('unavailable');
      var m=await fetch('/api/approval/handover/mine',{credentials:'same-origin',cache:'no-store',signal:c.signal});if(!m.ok)throw Error('mine unavailable');var data=await m.json();if(!data.ok)throw Error('mine unavailable');mine=data.reports||[];
      var inbox=!!(j.reader_mode||j.total||mine.some(function(x){return x.status==='submitted';}));box.hidden=!inbox;
      var first=j.reports[0];link.href=first?'/daily-handover.html?date='+encodeURIComponent(first.report_date)+'&report='+first.id:'/daily-handover.html';
      last=j;failed=false;autoPush();render();host.hidden=!inbox&&!renderWriter();ring();
    }catch(e){failed=true;render();}finally{clearTimeout(timer);pending=false;}
  }
  render();refresh();setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('storage',render);
  document.addEventListener('mangoi:lang-changed',render);window.addEventListener('mangoi:lang-changed',render);
  try{new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}catch(e){}
})();

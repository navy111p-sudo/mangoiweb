/* Authenticated handover alerts. Web Audio failures remain visible; no acknowledgement on view. */
(function(){
  'use strict';
  var host=document.getElementById('handover-inbox-banner');if(!host)return;
  var shadow=host.attachShadow({mode:'open'}),pending=false,stopped=false,last=null,failed=false,mine=[];
  var audio=null,blocked=false,ringing=false,lastSignature='',lastRing=0,ringCount=0;
  shadow.innerHTML='<style>:host([hidden]){display:none!important}:host{display:block;margin:0 0 18px;color-scheme:light dark}*{box-sizing:border-box}.box{background:light-dark(#eef4ff,#20334e);color:light-dark(#193351,#edf4ff);border:2px solid light-dark(#b8cbe6,#4a6688);border-radius:12px;padding:18px 22px;font:18px/1.5 system-ui,sans-serif;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.box.warning{border-color:#c23425;background:light-dark(#fff0ec,#4b2020)}.title{font-size:23px;font-weight:700;margin:0}.note,.permission{font-size:16px;margin:6px 0 0}a,button{font:inherit;color:light-dark(#214faf,#bdd3ff);font-weight:650;display:inline-block;padding:10px;min-height:44px}button{cursor:pointer;border:1px solid currentColor;border-radius:8px;background:transparent}.actions{display:flex;gap:12px;flex-wrap:wrap}.primary{background:light-dark(#244fad,#b9d1ff);color:light-dark(#fff,#14243c);border-radius:8px;padding:12px 18px;text-decoration:none}[hidden]{display:none!important}@media(max-width:600px){.box{padding:16px}.title{font-size:22px}}</style><section class="box"><div><p class="title"></p><p class="note" role="status"></p><p class="permission"></p><p class="sound-status" role="status"></p></div><div class="actions"><a class="primary" href="/daily-handover.html"></a><a class="sent" href="/daily-handover.html?view=mine"></a><a class="appr" href="/work"></a><button class="sound" type="button"></button><button class="snooze" type="button"></button></div></section>';
  var box=shadow.querySelector('.box'),title=shadow.querySelector('.title'),note=shadow.querySelector('.note'),permission=shadow.querySelector('.permission'),link=shadow.querySelector('.primary'),sent=shadow.querySelector('.sent'),appr=shadow.querySelector('.appr'),sound=shadow.querySelector('.sound'),snooze=shadow.querySelector('.snooze'),soundStatus=shadow.querySelector('.sound-status');
  function en(){var l=window.adminLang;if(l!=='en'&&l!=='ko')l=(document.documentElement.lang||'').slice(0,2);return l==='en';}
  function t(ko,e){return en()?e:ko;}
  function get(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function put(k,v){try{localStorage.setItem(k,String(v));}catch(e){}}
  function key(s){return 'mangoi_handover_'+s+':'+(last&&last.me?last.me.username:'');}
  function enabled(){return get('mangoi_work_sound_v1')!=='0';}
  function eligible(){return !last?[]:last.reports.filter(function(r){return !(r.followup&&r.followup.hold_until>Date.now());});}
  function render(){
    box.setAttribute('aria-label',t('받은 매일보고','Handover inbox'));link.textContent=t('보고 읽고 응답하기','Read and respond');appr.textContent=t('결재함','Approvals');
    sound.textContent=blocked?t('🔊 알람 소리 켜기','Enable alarm sound'):enabled()?t('🔊 소리 끄기','Mute sound'):t('🔇 소리 켜기','Enable sound');
    snooze.textContent=t('30분간 소리 쉬기','Silence for 30 min');snooze.hidden=!last||!last.total;
    soundStatus.textContent=blocked?t('브라우저가 자동 소리를 막았습니다. ‘알람 소리 켜기’를 눌러 주세요.','Autoplay was blocked. Click Enable alarm sound.'):Number(get(key('snooze')))>Date.now()?t('소리는 잠시 쉬는 중 · 미응답 상태는 유지됩니다.','Sound is paused; reports still need a response.'):'';
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
  async function refresh(){
    if(pending||stopped||document.hidden)return;pending=true;var c=new AbortController(),timer=setTimeout(function(){c.abort();},10000);
    try{
      var r=await fetch('/api/approval/handover/inbox',{credentials:'same-origin',cache:'no-store',signal:c.signal});
      if(r.status===401||r.status===403){stopped=true;last=null;host.hidden=true;if(audio)audio.close().catch(function(){});return;}
      if(!r.ok)throw Error('unavailable');var j=await r.json();if(!j.ok)throw Error('unavailable');
      var m=await fetch('/api/approval/handover/mine',{credentials:'same-origin',cache:'no-store',signal:c.signal});if(!m.ok)throw Error('mine unavailable');var data=await m.json();if(!data.ok)throw Error('mine unavailable');mine=data.reports||[];
      host.hidden=!j.reader_mode&&!j.total&&!mine.some(function(x){return x.status==='submitted';});
      var first=j.reports[0];link.href=first?'/daily-handover.html?date='+encodeURIComponent(first.report_date)+'&report='+first.id:'/daily-handover.html';
      last=j;failed=false;render();ring();
    }catch(e){failed=true;render();}finally{clearTimeout(timer);pending=false;}
  }
  render();refresh();setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('storage',render);
  document.addEventListener('mangoi:lang-changed',render);window.addEventListener('mangoi:lang-changed',render);
  try{new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}catch(e){}
})();

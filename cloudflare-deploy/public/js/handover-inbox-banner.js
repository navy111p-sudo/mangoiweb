/* Persistent, authenticated unread handover entry. No service-worker registration on admin. */
(function(){
  'use strict';
  var host=document.getElementById('handover-inbox-banner');if(!host)return;
  var shadow=host.attachShadow({mode:'open'}),pending=false,stopped=false;
  shadow.innerHTML='<style>:host([hidden]){display:none!important}:host{display:block;margin:0 0 18px;color-scheme:light dark}*{box-sizing:border-box}.box{background:light-dark(#eef4ff,#20334e);color:light-dark(#193351,#edf4ff);border:1px solid light-dark(#b8cbe6,#4a6688);border-radius:12px;padding:18px 22px;font:18px/1.5 system-ui,sans-serif;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}.title{font-size:23px;font-weight:700;margin:0}.note{font-size:16px;margin:6px 0 0}a{color:light-dark(#214faf,#bdd3ff);font-weight:650;display:inline-block;padding:10px 0;min-height:44px}.actions{display:flex;gap:18px;flex-wrap:wrap}.primary{background:light-dark(#244fad,#b9d1ff);color:light-dark(#fff,#14243c);border-radius:8px;padding:12px 18px;text-decoration:none}.permission{font-size:15px;margin:6px 0 0}@media(max-width:600px){.box{padding:16px}.title{font-size:22px}}</style><section class="box" aria-label="받은 매일보고 / Handover inbox"><div><p class="title"></p><p class="note" role="status"></p><p class="permission"></p></div><div class="actions"><a class="primary" href="/daily-handover.html">보고 읽기 / Read reports</a><a href="/work">결재함 / Approvals</a></div></section>';
  var title=shadow.querySelector('.title'),note=shadow.querySelector('.note'),permission=shadow.querySelector('.permission'),link=shadow.querySelector('.primary');
  async function refresh(){
    if(pending||stopped||document.hidden)return;pending=true;var c=new AbortController(),timer=setTimeout(function(){c.abort();},10000);
    try{var r=await fetch('/api/approval/handover/inbox',{credentials:'same-origin',cache:'no-store',signal:c.signal});if(r.status===403){stopped=true;host.hidden=true;return;}if(!r.ok)throw Error('unavailable');var j=await r.json();if(!j.ok)throw Error('unavailable');
      host.hidden=!j.reader_mode&&!j.total;
      title.textContent='매일보고 · 미확인 '+j.total+'건 / '+j.total+' unread';
      var urgent=j.reports.filter(function(x){return x.payload.priority==='urgent';}).length;
      note.textContent=j.total?(urgent?'긴급 '+urgent+'건 · ':'')+'보고를 읽고 ‘내용 확인 완료’를 눌러 주세요. / Read and acknowledge your reports.':'받은 보고를 모두 확인했습니다. / All received reports acknowledged.';
      var first=j.reports[0];link.href=first?'/daily-handover.html?date='+encodeURIComponent(first.report_date)+'&report='+first.id:'/daily-handover.html';
      permission.replaceChildren();
      var a=document.createElement('a');a.href='/work#pushBtn';a.textContent=typeof Notification==='undefined'||Notification.permission!=='granted'?'기기 알림 켜기 / Enable device notifications':'기기 푸시 등록 확인 / Check device push registration';permission.append(a);
    }catch(e){if(!host.hidden)note.textContent='새 보고 확인이 지연됩니다. 보고함을 열어 확인해 주세요. / Open the inbox to refresh.';}
    finally{clearTimeout(timer);pending=false;}
  }
  refresh();setInterval(refresh,60000);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);
})();

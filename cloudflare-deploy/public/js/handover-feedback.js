/* Report replies are independent of report approval and survive revisions. */
(function(){
  'use strict';
  var API='/api/approval/handover',drafts={};
  async function call(path,body){
    var r=await fetch(API+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    var j=await r.json();if(!r.ok||!j.ok)throw Error('처리하지 못했습니다. 다시 시도해 주세요. / Could not complete. Please retry.');return j;
  }
  function el(tag,text){var n=document.createElement(tag);if(text)n.textContent=text;return n;}
  function time(ms){return new Date(ms).toLocaleString([], {timeZone:'Asia/Seoul'})+' KST';}
  function mount(host,report){
    var panel=el('section');panel.className='mh-feedback';panel.setAttribute('aria-label','보고 피드백 / Report feedback');host.append(panel);
    async function load(){
      panel.replaceChildren(el('p','피드백을 불러오는 중… / Loading feedback…'));
      try{
        var j=await call('/replies?id='+report.id);panel.replaceChildren(el('h3','보고 피드백 / Report feedback'));
        if(!j.replies.length)panel.append(el('p','아직 답글이 없습니다. / No feedback yet.'));
        j.replies.forEach(function(f){
          var card=el('article');card.className='mh-feedback-card';card.append(el('b',f.author_name+' · '+time(f.created_at)));
          var body=el('p',f.body);body.className='mh-feedback-body';card.append(body);
          card.append(el('p',f.confirmed_at?'매니저 확인 / Confirmed: '+time(f.confirmed_at):'매니저 미확인 / Awaiting manager confirmation'));
          if(j.can_write){var states={sent:'푸시 발송됨 / Push sent',queued:'푸시 대기 / Push queued',no_subscription:'기기 알림 미등록 / No device subscription',failed:'푸시 실패 / Push failed',pending:'알림 처리 중 / Notification pending'};card.append(el('small',(states[f.push_state]||f.push_state)+' · 접속 시 확인 안내 / Confirmation required on sign-in'));}
          panel.append(card);
        });
        if(j.can_write){
          var d=drafts[report.id]||(drafts[report.id]={body:'',key:crypto.randomUUID(),busy:false});
          var form=el('form'),label=el('label','매니저에게 보낼 답글 / Feedback for the manager'),input=el('textarea'),send=el('button','피드백 보내기 / Send feedback'),status=el('p');
          input.rows=5;input.maxLength=3000;input.required=true;input.value=d.body;input.setAttribute('aria-label',label.textContent);input.oninput=function(){d.body=input.value;};
          status.setAttribute('role','status');send.type='submit';send.disabled=d.busy;input.disabled=d.busy;label.append(input);form.append(label,send,status);panel.append(form);
          form.onsubmit=async function(e){e.preventDefault();if(d.busy||!input.value.trim())return;d.busy=true;send.disabled=true;input.disabled=true;
            try{await call('/reply',{id:report.id,body:input.value,request_key:d.key});delete drafts[report.id];await load();document.dispatchEvent(new CustomEvent('mh:feedback-changed'));}
            catch(e){status.textContent=e.message;}finally{d.busy=false;send.disabled=false;input.disabled=false;}
          };
        }
      }catch(e){panel.replaceChildren(el('p',e.message));var retry=el('button','다시 불러오기 / Retry');retry.type='button';retry.onclick=load;panel.append(retry);}
    }
    load();
  }
  mount.requestChanges=function(){return new Promise(function(resolve){
    var dialog=el('dialog'),form=el('form'),title=el('h2','보완 요청 / Request changes'),label=el('label','보완할 내용을 적어 주세요 / What needs clarification?'),input=el('textarea'),send=el('button','보완 요청 보내기 / Send request'),cancel=el('button','취소 / Cancel');
    dialog.className='mh-feedback';dialog.style.cssText='width:min(600px,calc(100% - 24px));max-height:90dvh;overflow:auto';input.rows=6;input.maxLength=500;input.required=true;input.setAttribute('aria-label',label.textContent);label.append(input);send.type='submit';cancel.type='button';cancel.onclick=function(){dialog.close();};form.append(title,label,send,cancel);dialog.append(form);document.body.append(dialog);
    var answer='';form.onsubmit=function(e){e.preventDefault();if(!input.value.trim())return;answer=input.value.trim();dialog.close();};dialog.onclose=function(){dialog.remove();resolve(answer);};dialog.showModal();input.focus();
  });};
  window.MangoiHandoverFeedback=mount;
})();

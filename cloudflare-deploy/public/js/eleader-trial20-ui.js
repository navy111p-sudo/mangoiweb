/* Owner trial UI preparation. Production mount stays disabled. No credential persistence. */
(function(root){
 'use strict';
 function mount({element,books,getToken,enabled=false,mode='disabled',startSession,services,now=()=>Date.now()}){
  let controller=null,disposed=false,pending=false,finished=false,epoch=0,activeBook=null,identity=getToken(),timer;
  const doc=element.ownerDocument;
  element.replaceChildren();
  function node(tag,text){const n=doc.createElement(tag);if(text)n.textContent=text;return n;}
  const title=node('h3','성인 소유자 · 한 권 20문항 시험');
  const notice=node('p',mode==='cloudflare'?'성인 소유자 전용 · Cloudflare 음성 전송 · 61회/$0.40 한도 · 1시간 · 내용 저장 없음.':mode==='mock-only'?'로컬 모의 시험 · 실제 AI 음성/마이크 없음 · 합성 기록이며 운영 자료가 아닙니다.':'실제 음성 시험은 아직 잠겨 있습니다. 요금제·보안 설정·활성화 검증 후에만 사용할 수 있습니다.');
  const form=node('form'),select=node('select');select.setAttribute('aria-label','시험할 책');
  books.filter(b=>b.questions.length===20).forEach(b=>{const o=node('option',b.title);o.value=b.id;select.append(o);});
  const code=node('input');code.type='password';code.autocomplete='off';code.maxLength=32;code.setAttribute('aria-label','일회용 시작 코드');
  const consent=node('input');consent.type='checkbox';const label=node('label');label.append(consent,doc.createTextNode('성인 본인만 사용하며 음성·답변의 Cloudflare 전송에 동의합니다. 앱에는 내용을 저장하지 않습니다.'));
  const submit=node('button','선택한 책으로 시작');submit.type='submit';
  form.append(select,code,label,submit);
  const status=node('p');status.setAttribute('role','status');status.dataset.trialStatus='';
  const question=node('p'),hint=node('p');hint.hidden=true;
  const controls=node('div'),buttons={};
  for(const [name,text] of Object.entries({answer:'답변 녹음',finishAnswer:'녹음 끝내기',repeat:'다시 듣기',skip:'건너뛰기',hint:'한글 힌트',cancel:'시험 종료'})){const b=node('button',text);b.type='button';b.dataset.trialAction=name;buttons[name]=b;controls.append(b);}
  element.append(title,notice,form,status,question,hint,controls);
  const ready=enabled&&['mock-only','cloudflare'].includes(mode)&&typeof startSession==='function'&&services;
  const labels={idle:'시작 준비',permission:'마이크 권한 확인 중',recording:'답변을 기다려요 · 최대 15초',processing:'답변 처리 중 · 다시 누르지 마세요',playing:'아바타 말하기 중',waiting:'답변하거나 힌트를 확인하세요',complete:'20문항 시험을 마쳤습니다. 내용은 저장하지 않았습니다.',error:'시험이 중단되었습니다. 자동 재시도하지 않습니다.',canceled:'시험을 종료했습니다.',expired:'시험 시간이 끝났거나 로그인이 변경되었습니다.',disabled:'음성 시험 비활성'};
  function update(state={phase:'disabled',step:0}){
   if(disposed)return;
   const terminal=['complete','error','canceled','expired'].includes(state.phase);
   status.textContent=(mode==='mock-only'?'[모의] ':'')+(labels[state.phase]||'시험 준비')+(state.step>0&&state.step<=20?' · '+state.step+'/20':'');
   submit.disabled=!ready||finished||pending||!!controller;select.disabled=pending||!!controller;code.disabled=pending||!!controller;consent.disabled=pending||!!controller;
   for(const [k,b] of Object.entries(buttons))b.disabled=k==='cancel'?!controller||terminal:k==='finishAnswer'?state.phase!=='recording':state.phase!=='waiting';
   if(activeBook&&state.step>0&&state.step<=20){const q=activeBook.questions[state.step-1];question.textContent=q.question;hint.textContent=q.hint;}
   if(terminal){clearInterval(timer);hint.hidden=true;question.textContent='';}
  }
  function expire(){finished=true;epoch++;code.value='';controller?.expire();if(!controller)update({phase:'expired',step:0});}
  function identityOK(){if(getToken()!==identity||!identity){expire();return false;}return true;}
  form.onsubmit=async e=>{
   e.preventDefault();if(!ready||finished||pending||controller||!identityOK())return;
   if(!consent.checked||!/^[a-f0-9]{32}$/.test(code.value)){status.textContent='동의 확인과 32자리 시작 코드가 필요합니다.';return;}
   activeBook=books.find(b=>b.id===select.value);if(!activeBook||activeBook.questions.length!==20)return;
   pending=true;const ticket=++epoch;update();
   const payload={code:code.value,book:activeBook.id,adult:true,processing:true,policy:'adult-trial20-v1'};code.value='';
   try{
    const session=await startSession(payload);payload.code='';
    if(disposed||ticket!==epoch||!identityOK())return;
    if(session.mode!==mode||session.book!==activeBook.id||!Number.isSafeInteger(session.expires_at)||session.expires_at<=now()||session.expires_at-now()>3600000)throw Error('session');
    controller=root.EleaderTrial20Client.create({enabled:true,expiresAt:session.expires_at,now,services,onChange:update});
    pending=false;await controller.start();
   }catch{payload.code='';if(!disposed&&ticket===epoch){pending=false;finished=true;status.textContent='시작에 실패했습니다. 자동 재시도하지 않습니다.';submit.disabled=true;}}
  };
  for(const [name,b] of Object.entries(buttons))b.onclick=()=>{if(!controller||b.disabled||!identityOK())return;hint.hidden=true;if(name==='hint'){hint.hidden=false;return;}void controller[name]();};
  const changed=()=>{if(!disposed)identityOK();};
  root.addEventListener('storage',changed);root.addEventListener('pagehide',expire);timer=setInterval(changed,500);
  update();
  return {dispose(){if(disposed)return;expire();disposed=true;clearInterval(timer);root.removeEventListener('storage',changed);root.removeEventListener('pagehide',expire);element.replaceChildren();},refresh(){update(controller?.snapshot());}};
 }
 root.EleaderTrial20UI={mount};
})(globalThis);

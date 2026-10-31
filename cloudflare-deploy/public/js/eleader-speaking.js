/* v2: Existing recorder, scoped server bridge, and MangoAvatar. No automatic AI calls. */
(function(){
 'use strict';
 const el=id=>document.getElementById(id);
 let context,epoch=0,controller,audio,audioUrl,busy=false,allowed=false,reply='';
 const actionIds=['recordLive','finishRecording','chatLive','emmaRead'];
 function controls(){actionIds.forEach(id=>{el(id).disabled=!allowed||(busy&&id!=='finishRecording');});el('liveConfirm').disabled=!allowed;}
 function cancel(message){epoch++;controller?.abort();controller=null;window.MangoiVoice?.cancel();window.speechSynthesis?.cancel();if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}window.MangoAvatar?.plainStop();busy=false;controls();if(message)el('liveStatus').textContent=message;}
 function reset(){cancel();reply='';el('liveReply').textContent='';el('liveConfirm').checked=false;}
 function configure(live){allowed=!!live?.allowed;el('policyNotice').textContent=live?.notice||'';if(!allowed){el('liveConfirm').checked=false;el('liveStatus').textContent=live?.reason==='guardian_consent_required'?'서버에 확인된 보호자 동의가 필요합니다.':'음성·AI 연결은 기본 비활성입니다. 실제 호출은 검증하지 않았습니다.';}else if(!busy){el('liveStatus').textContent='서버 승인 확인됨 · 처리 안내 확인 후 직접 기능을 시작하세요.';}controls();}
 function capture(){if(!allowed||!el('liveConfirm').checked)throw Error('처리 안내와 이번 기기 이용 확인을 먼저 선택해 주세요.');return context();}
 function same(c,e){if(e!==epoch)return false;try{const now=context();return ['academy','unit','question','subject','token','policy'].every(k=>now[k]===c[k])&&el('liveConfirm').checked;}catch{return false;}}
 async function request(action,body,c,e){
   if(!same(c,e))throw Error('canceled');
   controller=new AbortController();
   const headers={Authorization:'Bearer '+c.token,'X-Eleader-Subject':c.subject,'X-Eleader-Policy':c.policy,'X-Eleader-Confirm':'yes','X-Eleader-Request':crypto.randomUUID()};
   const isForm=body instanceof FormData;if(!isForm)headers['Content-Type']='application/json';
   const query=new URLSearchParams({academy:c.academy,unit:c.unit,question:c.question});
   const r=await fetch('/api/ai/eleader/'+action+'?'+query,{method:'POST',headers,credentials:'same-origin',cache:'no-store',signal:controller.signal,body:isForm?body:JSON.stringify(body)});
   if(!same(c,e))throw Error('canceled');
   if(!r.ok){if([401,403,409].includes(r.status)){allowed=false;reset();}throw Error('요청을 완료하지 못했습니다. 승인·배정을 새로고침한 뒤 다시 시도해 주세요.');}
   return r;
 }
 async function begin(fn){if(busy)return;let c;try{c=capture();}catch(e){el('liveStatus').textContent=e.message;return;}cancel();busy=true;controls();const e=epoch;
   try{await fn(c,e);}catch(error){if(e===epoch)el('liveStatus').textContent=error.name==='AbortError'?'요청을 취소했습니다.':error.message;}finally{if(e===epoch){busy=false;controls();}}
 }
 el('recordLive').onclick=()=>begin(async(c,e)=>{
   if(!window.MangoiVoice?.supported())throw Error('마이크를 지원하지 않습니다. 텍스트로 답해 주세요.');
   el('liveStatus').textContent='마이크 권한을 확인하고 있습니다.';
   const text=await window.MangoiVoice.record({lang:'en',maxMs:20000,firstMs:20000,silenceMs:20000,
     transcribe:async fd=>{const r=await request('transcribe',fd,c,e);return r.json();},
     onState:(s,info)=>{if(!same(c,e))return;el('liveStatus').textContent=s==='error'?(info?.reason==='denied'?'마이크 권한이 거절됐습니다. 텍스트로 답해 주세요.':'음성 처리에 실패했습니다. 텍스트로 답해 주세요.'):s==='thinking'?'받아쓰는 중…':'말한 뒤 녹음 끝내기를 눌러 주세요.';}
   });
   if(!same(c,e))return;if(text){el('answer').value=text;el('liveStatus').textContent='받아쓴 내용을 확인하고 AI에게 보내기를 눌러 주세요.';}else{el('liveStatus').textContent='인식된 말이 없습니다. 다시 말하거나 텍스트로 답해 주세요.';}
 });
 el('finishRecording').onclick=()=>window.MangoiVoice?.stop();
 el('chatLive').onclick=()=>begin(async(c,e)=>{const text=el('answer').value.trim();if(!text)throw Error('답을 먼저 말하거나 입력해 주세요.');el('liveStatus').textContent='기존 말하기 엔진에 답을 보내고 있습니다…';const r=await request('chat',{text,previous_reply:reply.slice(0,400)},c,e);const d=await r.json();if(!same(c,e))return;reply=d.text;el('liveReply').textContent=reply;el('liveStatus').textContent='기존 말하기 엔진의 응답입니다. Emma 목소리로 듣기를 누를 수 있어요.';});
 el('emmaRead').onclick=()=>begin(async(c,e)=>{
   const text=reply||c.questionText;el('liveStatus').textContent='Emma 음성을 준비하고 있습니다…';const r=await request('tts',{text},c,e);const blob=await r.blob();if(!same(c,e))return;
   audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);const playing=audio;
   window.MangoAvatar?.setCharacter('emma');window.MangoAvatar?.attach(playing);await window.MangoAvatar?.prepare(playing);if(!same(c,e))return;
   playing.onerror=()=>{if(e===epoch)cancel('음성 재생에 실패했습니다. 텍스트로 읽어 주세요.');};
   playing.onended=()=>{if(e===epoch)cancel('Emma 음성 재생이 끝났습니다.');};
   await playing.play();if(!same(c,e)){playing.pause();return;}
   el('liveStatus').textContent=r.headers.get('X-TTS-Speaker')==='asteria'?'Emma 음성 재생 중':'기존 엔진의 대체 음성 재생 중 (Emma 음성과 다를 수 있습니다)';
 });
 el('cancelLive').onclick=()=>cancel('녹음·요청·재생을 취소했습니다. 이미 전송된 처리는 회수할 수 없습니다.');
 el('liveConfirm').onchange=()=>{if(!el('liveConfirm').checked)cancel('이번 기기 이용 확인을 해제했습니다.');};
 window.EleaderSpeaking={connect(fn){context=fn;},configure,cancel,reset};configure();
})();

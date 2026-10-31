/* Disabled-by-default adapter controller. No built-in fetch/mic/camera/storage.
 * Real activation requires an authenticated server gate; client flags never authorize it. */
(function(root){
 'use strict';
 function create({enabled=false,expiresAt=0,now=()=>Date.now(),services,onChange=()=>{}}){
  let phase=enabled&&Number.isSafeInteger(expiresAt)&&expiresAt>now()&&expiresAt-now()<=3600000?'idle':'disabled',step=0,epoch=0,abort=null,audio=null,expiryTimer;
  const emit=()=>onChange({phase,step});
  function stop(){abort?.abort();services.stopCapture?.();services.stopPlayback?.();services.avatar?.('stop');}
  function expire(){clearTimeout(expiryTimer);epoch++;stop();audio=null;phase='expired';emit();}
  async function play(ticket){phase='playing';emit();try{await services.play(audio,{onStart:()=>{if(ticket===epoch&&phase==='playing')services.avatar?.('start');}});if(ticket!==epoch)return false;services.avatar?.('stop');phase=step>20?'complete':'waiting';emit();return true;}catch{if(ticket===epoch){services.avatar?.('stop');phase='error';emit();}return false;}}
  async function send(kind,body,ticket){
   if(ticket!==epoch)return false;phase='processing';emit();abort=new AbortController();
   try{const response=await services.request({kind,step,body,requestId:crypto.randomUUID(),signal:abort.signal});
    if(ticket!==epoch){await response.body?.cancel();return false;}if(!response.ok)throw Error('response');
    const next=Number(response.headers.get('X-Trial20-Next'));if(next!==step+1||!response.headers.get('Content-Type')?.startsWith('audio/'))throw Error('contract');
    const bytes=new Uint8Array(await response.arrayBuffer());if(ticket!==epoch)return false;
    audio=bytes;step=next;return await play(ticket);
   }catch{if(ticket===epoch){stop();audio=null;phase='error';emit();}return false;}
  }
  async function start(){if(phase!=='idle')return false;const t=++epoch;stop();return send('question',null,t);}
  async function answer(){if(phase!=='waiting')return false;const t=++epoch;stop();audio=null;phase='permission';emit();
   try{if(!await services.permission()||t!==epoch){if(t===epoch){phase='waiting';emit();}return false;}
    phase='recording';emit();abort=new AbortController();const wav=await services.record({maxMillis:15000,signal:abort.signal});services.stopCapture?.();
    if(t!==epoch)return false;return send('turn',wav,t);
   }catch{if(t===epoch){stop();phase='error';emit();}return false;}
  }
  async function skip(){if(phase!=='waiting')return false;const t=++epoch;stop();audio=null;return send('turn',{skip:true},t);}
  async function repeat(){if(phase!=='waiting'||!audio)return false;const t=++epoch;stop();return play(t);}
  function cancel(){if(['expired','disabled'].includes(phase))return;epoch++;stop();audio=null;phase='canceled';emit();}
  if(phase==='idle'){expiryTimer=setTimeout(expire,Math.max(0,expiresAt-now()));expiryTimer.unref?.();}
  return {start,answer,skip,repeat,cancel,expire,finishAnswer(){if(phase!=='recording')return false;services.finishCapture?.();return true;},snapshot:()=>({phase,step})};
 }
 root.EleaderTrial20Client={create};
})(globalThis);

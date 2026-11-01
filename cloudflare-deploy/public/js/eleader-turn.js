/* Local turn coordinator. No fetch, microphone, camera, provider or storage access.
 * Adapters are injected; the shipped pilot adapter is TEXT-ONLY simulation. */
(function(root){
 'use strict';
 function create({questions,adapter,onChange=()=>{},timeoutMs=15000}){
  let index=0,phase='idle',epoch=0,controller=null,lastError='',lastText='';
  const progress=questions.map(()=> 'unseen');
  const snapshot=()=>({index,phase,question:questions[index]||null,progress:progress.slice(),error:lastError,text:lastText});
  const emit=()=>onChange(snapshot());
  function stop(){controller?.abort();controller=null;adapter.stopCapture?.();adapter.stop?.();adapter.avatar?.('stop');}
  function cancel(expired=false){if(phase==='expired')return;epoch++;stop();phase=expired?'expired':'waiting';lastText='';lastError='';emit();}
  async function say(text,ticket){
   phase='speaking';emit();
   try{await adapter.speak(text,{rate:0.8,onStart:()=>{if(ticket===epoch&&phase==='speaking')adapter.avatar?.('start');}});}
   finally{if(ticket===epoch)adapter.avatar?.('stop');}
  }
  async function start(at=0){
   if(phase==='expired')return false;
   if(!Number.isInteger(at)||at<0||at>=questions.length)return false;
   epoch++;stop();index=at;lastText='';lastError='';const ticket=epoch;
   try{await say(questions[index].question,ticket);if(ticket!==epoch)return false;phase='waiting';emit();return true;}
   catch{if(ticket===epoch){phase='error';lastError='audio';emit();}return false;}
  }
  async function submit(raw){
   if(phase!=='waiting')return false;
   const answer=typeof raw==='string'?raw.trim():'';
   if(!answer){lastError='silence';emit();return false;}
   if(answer.length>120||/@|\d{3,}|[<>]|ignore.{0,20}instructions|system prompt/i.test(answer)){lastError='unsafe_input';emit();return false;}
   epoch++;stop();const ticket=epoch;controller=new AbortController();phase='thinking';lastError='';emit();let timer;
   try{
    const response=await Promise.race([adapter.respond({question:questions[index],answer,signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);
    if(ticket!==epoch)return false;
    if(!response||typeof response.text!=='string'||response.text.length>400||/[<>]/.test(response.text))throw Error('invalid_reply');
    lastText=response.text;
    // Only adapter-confirmed understanding marks answered. The local mock never claims it.
    if(response.understood===true)progress[index]='answered';
    else lastError='not_understood';
    await say(lastText,ticket);if(ticket!==epoch)return false;phase='waiting';emit();return true;
   }catch(e){if(ticket===epoch){controller?.abort();stop();phase='error';lastError=e.message==='timeout'?'timeout':'response_or_audio';emit();}return false;}
   finally{clearTimeout(timer);}
  }
  function hint(){if(phase==='expired'||phase==='complete')return null;return questions[index]?.hint||null;}
  async function repeat(){if(phase!=='waiting')return false;return start(index);}
  async function skip(){if(phase==='expired'||phase==='complete')return false;epoch++;stop();if(progress[index]!=='answered')progress[index]='skipped';if(index+1>=questions.length){phase='complete';lastText='';emit();return true;}return start(index+1);}
  function retry(){if(phase!=='error'||adapter.canRetry?.(lastError)!==true)return false;phase='waiting';lastError='';emit();return true;}
  return {start,submit,hint,repeat,skip,retry,cancel:()=>cancel(false),expire:()=>cancel(true),snapshot};
 }
 root.EleaderTurn={create};
})(globalThis);

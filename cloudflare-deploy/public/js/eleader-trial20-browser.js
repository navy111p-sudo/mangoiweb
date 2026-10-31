/* Prepared browser services; no automatic initialization or credential storage.
 * The released server route is still denied. Call only from an approved owner UI. */
(function(root){
 'use strict';
 function makeWav(samples,sourceRate){
  if(!Number.isFinite(sourceRate)||sourceRate<16000||sourceRate>192000)throw Error('sample_rate');
  const count=Math.min(240000,Math.floor(samples.length*16000/sourceRate));if(count<1)throw Error('empty_audio');
  const data=new Uint8Array(44+count*2),v=new DataView(data.buffer),put=(s,o)=>{for(let i=0;i<s.length;i++)data[o+i]=s.charCodeAt(i);};
  put('RIFF',0);v.setUint32(4,data.length-8,true);put('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put('data',36);v.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const at=i*sourceRate/16000,lo=Math.floor(at),fraction=at-lo;const sample=Math.max(-1,Math.min(1,samples[lo]*(1-fraction)+(samples[Math.min(lo+1,samples.length-1)]||0)*fraction));v.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}return data;
 }
 function create({getToken,avatar=()=>{},browser=root}){
  let stream=null,context=null,node=null,source=null,timer=null,recordReject=null,recordFinish=null,playback=null,playURL=null,playResolve=null,generation=0;
  function stopCapture(){recordFinish=null;generation++;clearTimeout(timer);node?.disconnect();source?.disconnect();node=null;source=null;void context?.close().catch(()=>{});context=null;stream?.getTracks().forEach(t=>t.stop());stream=null;if(recordReject){const reject=recordReject;recordReject=null;reject(Error('capture_canceled'));}}
  function stopPlayback(){playback?.pause();if(playback){playback.onplay=playback.onended=playback.onerror=null;}playback=null;if(playURL)browser.URL.revokeObjectURL(playURL);playURL=null;if(playResolve){const resolve=playResolve;playResolve=null;resolve();}}
  return {stopCapture,stopPlayback,avatar,
   async startSession(body){
    if(!body||!/^[a-f0-9]{32}$/.test(body.code)||body.policy!=='adult-trial20-v1'||body.adult!==true||body.processing!==true)throw Error('start_contract');
    const response=await browser.fetch('/api/ai/eleader/trial20/start',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{Authorization:'Bearer '+getToken(),'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok)throw Error('start_denied');return await response.json();
   },finishCapture(){recordFinish?.();},
   async permission(){const before=generation;const media=await browser.navigator.mediaDevices.getUserMedia({audio:{channelCount:1},video:false});if(before!==generation){media.getTracks().forEach(t=>t.stop());return false;}stream=media;return true;},
   async record({maxMillis,signal}){if(maxMillis!==15000||!stream||signal.aborted)throw Error('capture_not_ready');
    const AudioContext=browser.AudioContext||browser.webkitAudioContext;context=new AudioContext();const sampleRate=context.sampleRate;await context.resume();
    if(signal.aborted||!stream){stopCapture();throw Error('capture_canceled');}
    source=context.createMediaStreamSource(stream);node=context.createScriptProcessor(2048,1,1);source.connect(node);node.connect(context.destination);const parts=[];let count=0;
    return await new Promise((resolve,reject)=>{
     recordReject=reject;const finish=()=>{if(!recordReject)return;recordReject=null;signal.removeEventListener('abort',abort);const all=new Float32Array(count);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}stopCapture();try{resolve(makeWav(all,sampleRate));}catch(e){reject(e);}};
     recordFinish=finish;
     const abort=()=>{signal.removeEventListener('abort',abort);stopCapture();};signal.addEventListener('abort',abort,{once:true});
     node.onaudioprocess=e=>{const input=e.inputBuffer.getChannelData(0);const left=Math.max(0,Math.floor(sampleRate*15)-count);if(left){const part=new Float32Array(input.subarray(0,left));parts.push(part);count+=part.length;}if(count>=sampleRate*15)finish();};timer=setTimeout(finish,15000);
    });
   },
   async request({kind,step,body,requestId,signal}){
    if(!['question','turn'].includes(kind))throw Error('route');
    const headers={Authorization:'Bearer '+getToken(),'X-Trial20-Step':String(step),'X-Trial20-Request':requestId,'X-Trial20-Policy':'adult-trial20-v1','X-Trial20-Confirm':'yes'};
    let payload;if(body instanceof Uint8Array){headers['Content-Type']='audio/wav';payload=body;}else if(body){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    return browser.fetch('/api/ai/eleader/trial20/'+kind,{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:payload,signal});
   },
   async play(bytes,{onStart}){stopPlayback();playURL=browser.URL.createObjectURL(new browser.Blob([bytes],{type:'audio/mpeg'}));playback=new browser.Audio(playURL);playback.playbackRate=0.8;
    return await new Promise((resolve,reject)=>{playResolve=resolve;playback.onplay=onStart;playback.onended=()=>{stopPlayback();resolve();};playback.onerror=()=>{playResolve=null;stopPlayback();reject(Error('playback'));};playback.play().catch(e=>{playResolve=null;stopPlayback();reject(e);});});
   }
  };
 }
 root.EleaderTrial20Browser={create,makeWav};
})(globalThis);

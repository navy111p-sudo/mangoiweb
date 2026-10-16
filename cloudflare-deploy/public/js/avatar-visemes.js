/* Audio-derived mouth cues. Does not change voice or upload audio.
   Callers await preparation before playing; failures retain amplitude animation. */
(function(){
  'use strict';
  var worker=null, ready=false, failed=false, next=0, decode=null;
  var waiting=new Map(), cache=new Map(), jobs=new Map(), readyResolve, bootTimer;
  var readyPromise=new Promise(function(resolve){readyResolve=resolve;});
  var MAX_SECONDS=45, MAX_CACHE=12;
  function boot(){
    if(worker || failed || !window.Worker) return;
    try{
      worker=new Worker('/js/avatar-viseme-worker.js?v=1');
      worker.onmessage=function(e){
        var m=e.data;
        if(m.type==='ready'){ready=true;clearTimeout(bootTimer);readyResolve(true);return;}
        var job=waiting.get(m.id); if(!job) return;
        waiting.delete(m.id);clearTimeout(job.timer);
        job.resolve(m.type==='result' ? valid(m.cues) : null);
      };
      worker.onerror=function(){failed=true;ready=false;clearTimeout(bootTimer);readyResolve(false);worker.terminate();worker=null;
        waiting.forEach(function(j){clearTimeout(j.timer);j.resolve(null);});waiting.clear();};
      worker.postMessage({type:'init'});
      bootTimer=setTimeout(function(){if(!ready){failed=true;worker.terminate();worker=null;readyResolve(false);}},30000);
    }catch(e){failed=true;readyResolve(false);}
  }
  function valid(cues){
    if(!Array.isArray(cues) || cues.length>4000) return null;
    var last=0;
    for(var i=0;i<cues.length;i++){
      var c=cues[i];
      if(!c || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start<last || c.end<=c.start || c.end>MAX_SECONDS+.1 || !/^[XABCDEFGH]$/.test(c.value)) return null;
      last=c.end;
    }
    return cues.length ? cues : null;
  }
  async function analyze(url){
    if(!ready || !worker || failed) return null;
    try{
      if(!decode){var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;decode=new AC();}
      // Only app-generated blob URLs and same-origin audio; never fetch arbitrary links.
      var u=new URL(url,location.href);
      if(u.protocol!=='blob:' && u.origin!==location.origin) return null;
      var controller=new AbortController();var timer=setTimeout(function(){controller.abort();},8000);
      var bytes;
      try{var r=await fetch(url,{signal:controller.signal});if(!r.ok)return null;
        var blob=await r.blob();if(blob.size>8*1024*1024)return null;bytes=await blob.arrayBuffer();}
      finally{clearTimeout(timer);}
      var audio=await decode.decodeAudioData(bytes);
      if(audio.duration>MAX_SECONDS || audio.duration<.08) return null;
      var offline=new OfflineAudioContext(1,Math.ceil(audio.duration*16000),16000);
      var source=offline.createBufferSource();source.buffer=audio;source.connect(offline.destination);source.start();
      var mono=(await offline.startRendering()).getChannelData(0),pcm=new Int16Array(mono.length);
      for(var i=0;i<mono.length;i++)pcm[i]=Math.round(Math.max(-1,Math.min(1,mono[i]))*32767);
      return await new Promise(function(resolve){
        var id=++next;
        var timer=setTimeout(function(){waiting.delete(id);failed=true;ready=false;worker.terminate();worker=null;resolve(null);},12000);
        waiting.set(id,{resolve:resolve,timer:timer});worker.postMessage({type:'analyze',id:id,pcm:pcm},[pcm.buffer]);
      });
    }catch(e){return null;}
  }
  function prepare(url){
    boot();if(!url || failed || !worker)return Promise.resolve(null);
    if(cache.has(url))return Promise.resolve(cache.get(url));
    if(jobs.has(url))return jobs.get(url);
    // One bounded analysis at a time; no unbounded backlog during rapid replies.
    if(jobs.size)return Promise.resolve(null);
    var p=readyPromise.then(function(ok){return ok ? analyze(url) : null;}).then(function(cues){
      jobs.delete(url);
      if(cues){if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);cache.set(url,cues);}
      return cues;
    });jobs.set(url,p);return p;
  }
  function at(cues,time){
    if(!cues || !Number.isFinite(time))return 'X';
    var low=0,high=cues.length-1;
    while(low<=high){var mid=(low+high)>>1,c=cues[mid];if(time<c.start)high=mid-1;else if(time>=c.end)low=mid+1;else return c.value;}
    return 'X';
  }
  // Pure audio-clock sampling: no wall-clock tween to drift after pause/seek/rate changes.
  // Silence and bilabial closures remain exact. Other neighboring vowels/consonants
  // share a short coarticulation window, bounded by both cue lengths.
  function frame(cues,time){
    var pose=at(cues,time),anchor={pose:pose,tile:-1};
    if(pose==='X' || !cues)return anchor;
    var lo=0,hi=cues.length-1,index=-1;
    while(lo<=hi){var m=(lo+hi)>>1,c=cues[m];if(time<c.start)hi=m-1;else if(time>=c.end)lo=m+1;else{index=m;break;}}
    if(index<0)return anchor;
    function between(a,b){
      if(!a||!b||a.value===b.value||a.value==='X'||b.value==='X'||b.value==='A'||Math.abs(a.end-b.start)>.002)return null;
      var width=Math.min(.08,(a.end-a.start)*.4,(b.end-b.start)*.4);
      var start=b.start-width/2,end=b.start+width/2;
      // A = M/B/P: do not open lips before the closure has finished.
      if(a.value==='A'){start=b.start;end=b.start+Math.min(.04,(b.end-b.start)*.25);}
      if(time<=start||time>=end)return null;
      var t=(time-start)/(end-start),step=Math.round(t*5);
      if(step<=0||step>=5)return {pose:step<=0?a.value:b.value,tile:-1};
      var from='XABCDEFGH'.indexOf(a.value),to='XABCDEFGH'.indexOf(b.value);
      return {pose:pose,tile:(from*8+(to<from?to:to-1))*4+step-1};
    }
    return between(cues[index-1],cues[index])||between(cues[index],cues[index+1])||anchor;
  }
  window.AvatarVisemes={prepare:prepare,at:at,frame:frame,valid:valid,boot:boot};
})();

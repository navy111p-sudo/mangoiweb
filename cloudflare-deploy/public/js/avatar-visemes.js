/* Audio-derived mouth cues. Does not change voice or upload audio.
   Playback no longer waits for analysis (MangoAvatar.prepare caps the wait); late cues
   attach mid-clip by the audio clock. Failures retain amplitude animation.
   ⚡ 2026-10-20 「A.i 말하기·A.i 친구 대답을 더 빠르게」 — 실측(크로미움): 3초 문장 분석 2.3초,
      6초 문장 5.1초, 첫 부팅 5~6초(+모델 37.8MB 다운로드). 예전에는 이것이 끝나야 소리가 났다.
   ⚡ 분석은 «한 줄로 차례대로» 최대 MAX_PENDING 개까지 받는다(예전: 바쁘면 즉시 null) —
      미리 받은 다음 문장을 앞 문장이 재생되는 동안 분석해 두려는 것이다.
      ⛔ 동시에 돌리지 마세요 — 작업별 타이머가 앞 작업 시간까지 세어 워커를 죽입니다. */
(function(){
  'use strict';
  var worker=null, ready=false, failed=false, next=0, decode=null;
  var waiting=new Map(), cache=new Map(), jobs=new Map(), readyResolve, bootTimer;
  var readyPromise=new Promise(function(resolve){readyResolve=resolve;});
  var MAX_SECONDS=45, MAX_CACHE=12, MAX_PENDING=3, STALE_MS=20000, tail=Promise.resolve();
  function fail(){
    failed=true;ready=false;clearTimeout(bootTimer);readyResolve(false);if(worker){worker.terminate();worker=null;}
    waiting.forEach(function(j){clearTimeout(j.timer);j.resolve(null);});waiting.clear();
  }
  function boot(){
    if(worker || failed || !window.Worker) return;
    try{
      worker=new Worker('/js/avatar-viseme-worker.js?v=2');
      worker.onmessage=function(e){
        var m=e.data;
        if(m.type==='ready'){ready=true;clearTimeout(bootTimer);readyResolve(true);return;}
        if(m.type==='boot_failed'){fail();return;}
        var job=waiting.get(m.id); if(!job) return;
        waiting.delete(m.id);clearTimeout(job.timer);
        job.resolve(m.type==='result' ? valid(m.cues) : null);
      };
      // 엔진을 못 받아도(CDN 차단·끊김) 음량 입모양으로 넘어가므로 «처리한 오류» — 페이지 오류로 올리지 않는다
      worker.onerror=function(e){if(e&&e.preventDefault)e.preventDefault();fail();};
      worker.postMessage({type:'init'});
      // ⏳ 재생이 부팅을 기다리지 않으므로 느린 회선도 끝까지 받아 캐시되게 넉넉히(예전 30초 — 그 안에 못 받으면 매 방문 처음부터 다시 받았다)
      bootTimer=setTimeout(function(){if(!ready)fail();},180000);
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
        // 분석은 실시간에 가까운 속도라(실측 6초 문장 5.1초) 긴 문장에 12초 고정이면 멀쩡한 워커가 죽는다
        var timer=setTimeout(function(){waiting.delete(id);failed=true;ready=false;if(worker)worker.terminate();worker=null;resolve(null);},Math.max(12000,Math.round(audio.duration*2500)+4000));
        waiting.set(id,{resolve:resolve,timer:timer});worker.postMessage({type:'analyze',id:id,pcm:pcm},[pcm.buffer]);
      });
    }catch(e){return null;}
  }
  function prepare(url){
    boot();if(!url || failed || !worker)return Promise.resolve(null);
    if(cache.has(url))return Promise.resolve(cache.get(url));
    if(jobs.has(url))return jobs.get(url);
    // One analysis at a time, in order; a short bounded queue (no unbounded backlog during rapid replies).
    if(jobs.size>=MAX_PENDING)return Promise.resolve(null);
    var queuedAt=Date.now();
    // 차례가 왔을 때 이미 오래된 소리(부팅을 오래 기다린 것)는 건너뛴다 — 지금 말하는 문장이 밀리지 않게.
    var p=tail.then(function(){return readyPromise;}).then(function(ok){return ok && !failed && Date.now()-queuedAt<STALE_MS ? analyze(url) : null;}).then(function(cues){
      jobs.delete(url);
      if(cues){if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value);cache.set(url,cues);}
      return cues;
    },function(){jobs.delete(url);return null;});
    tail=p;jobs.set(url,p);return p;
  }
  function at(cues,time){
    if(!cues || !Number.isFinite(time))return 'X';
    var low=0,high=cues.length-1;
    while(low<=high){var mid=(low+high)>>1,c=cues[mid];if(time<c.start)high=mid-1;else if(time>=c.end)low=mid+1;else return c.value;}
    return 'X';
  }
  // Pure audio-clock sampling: no wall-clock tween to drift after pause/seek/rate changes.
  // Ease into closures before their onset and release only after speech resumes.
  // Silence and M/B/P stay fully closed; all movement uses the audio clock.
  function frame(cues,time){
    var pose=at(cues,time),anchor={pose:pose,tile:-1};
    if(pose==='X' || !cues)return anchor;
    var lo=0,hi=cues.length-1,index=-1;
    while(lo<=hi){var m=(lo+hi)>>1,c=cues[m];if(time<c.start)hi=m-1;else if(time>=c.end)lo=m+1;else{index=m;break;}}
    if(index<0)return anchor;
    function between(a,b){
      if(!a||!b||a.value===b.value||Math.abs(a.end-b.start)>.002)return null;
      var aClosed=a.value==='A'||a.value==='X',bClosed=b.value==='A'||b.value==='X';
      if(aClosed&&bClosed)return null;
      var width=Math.min(.08,(a.end-a.start)*.4,(b.end-b.start)*.4);
      var start=b.start-width/2,end=b.start+width/2;
      // Reach a closed pose AT onset, never animate inside its cue.
      if(bClosed){end=b.start;start=end-Math.min(.06,(a.end-a.start)*.3);}
      // Do not open lips before M/B/P or silence has finished.
      if(aClosed){start=b.start;end=start+Math.min(.05,(b.end-b.start)*.3);}
      if(time<=start||time>=end)return null;
      var t=(time-start)/(end-start);
      t=t*t*(3-2*t); // smoothstep: gentle start/arrival, no wall-clock lag
      var step=Math.round(t*5);
      if(step<=0||step>=5)return {pose:step<=0?a.value:b.value,tile:-1};
      var from='XABCDEFGH'.indexOf(a.value),to='XABCDEFGH'.indexOf(b.value);
      return {pose:pose,from:a.value,to:b.value,tile:(from*8+(to<from?to:to-1))*4+step-1};
    }
    var current=cues[index],previous=cues[index-1],next=cues[index+1];
    // Missing cues are silence too, including the first/last speech boundary.
    if(!previous||current.start-previous.end>.002)previous={start:current.start,end:current.start,value:'X'};
    if(!next||next.start-current.end>.002)next={start:current.end,end:current.end,value:'X'};
    return between(previous,current)||between(current,next)||anchor;
  }
  window.AvatarVisemes={prepare:prepare,at:at,frame:frame,valid:valid,boot:boot};
})();

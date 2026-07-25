/* 👩‍🏫 MangoAvatar — 공용 강사 아바타(캔버스 실시간 크로마키) v2 (2026-07-25)
   초록 배경 영상을 <canvas>에 그리며 초록을 픽셀 단위로 제거 → '진짜 투명'.
   v2: 음량 기반 입 움직임 추가 — attach(audioEl) 로 TTS 오디오를 물리면, 실제 음성의
       크기(RMS)에 맞춰 입을 여닫는다(소리↑=입 벌림, 공백=닫힘, 세기=벌어짐). 발음 모양
       까지는 아니지만 말하는 리듬에 입이 맞는다. 오디오를 못 물리는 경우(브라우저 음성합성)
       는 연속 재생으로 폴백. 키잉은 말하는 동안만 rAF(정지 시 1프레임).

   마크업: <div id="tavatar-wrap"><div id="tavatar-ring">
             <canvas id="tavatar-canvas" width="320" height="320"></canvas>
             <video id="tavatar-video" muted loop playsinline preload="auto"
                    crossorigin="anonymous">
               <source src="/img/teacher-avatar.webm" type="video/webm">
               <source src="/img/teacher-avatar.mp4"  type="video/mp4"></video>
           </div></div>
   API: plainStart()/plainStop()  — 말하기 시작/끝(음성합성 등 분석 불가 음성)
        attach(audioEl)           — TTS 오디오를 물려 음량 립싱크(요소당 1회 바인딩)
        playClip(id)              — 미리 만든 클립 재생(음성코치 전용) */
(function(){
  function noop(){}
  if(!window.MangoAvatar){
    window.MangoAvatar = { plainStart:noop, plainStop:noop, attach:noop,
      playClip:function(){ return Promise.reject(new Error('avatar_not_ready')); } };
  }

  function build(){
    var video  = document.getElementById('tavatar-video');
    var canvas = document.getElementById('tavatar-canvas');
    var wrap   = document.getElementById('tavatar-wrap');
    if(!video || !canvas) return;
    var ctx = canvas.getContext('2d', { willReadFrequently:true });
    var W = canvas.width, H = canvas.height;
    var raf = 0, drawing = false, IDLE = null;

    // ── 음량 분석(Web Audio) — attach 로 오디오를 물릴 때 1회 그래프 생성 ──
    var actx=null, boundEl=null, analyser=null, lipData=null, audioFailed=false;
    function ensureCtx(){
      if(actx) return true; if(audioFailed) return false;
      try{ var AC=window.AudioContext||window.webkitAudioContext; if(!AC) throw 0;
        actx=new AC(); analyser=actx.createAnalyser(); analyser.fftSize=512;
        lipData=new Uint8Array(analyser.fftSize); return true;
      }catch(e){ audioFailed=true; return false; }
    }
    function rmsLevel(){
      if(!analyser) return 0;
      analyser.getByteTimeDomainData(lipData);
      var sum=0; for(var i=0;i<lipData.length;i++){ var v=(lipData[i]-128)/128; sum+=v*v; }
      return Math.sqrt(sum/lipData.length);
    }

    function setSpeaking(on){ if (wrap) wrap.classList.toggle('speaking', !!on); }
    function ensureIdle(){ if(!IDLE) IDLE = video.currentSrc || '/img/teacher-avatar.webm'; }

    // 초록 제거 크로마키: 초록 우세도(g - max(r,b)) 판정 + 가장자리 페더 + 스필 억제
    function keyFrame(){
      if (video.readyState < 2) return;
      try { ctx.drawImage(video, 0, 0, W, H); } catch(e){ return; }
      var im; try { im = ctx.getImageData(0,0,W,H); } catch(e){ return; }
      var d = im.data;
      for (var i=0;i<d.length;i+=4){
        var r=d[i], g=d[i+1], b=d[i+2];
        var mx = r>b?r:b;
        var diff = g - mx;
        if (diff > 38){ d[i+3]=0; }
        else if (diff > 10){ d[i+3] = ((38-diff)*255/28)|0; d[i+1] = mx + 8; }
      }
      ctx.putImageData(im,0,0);
    }
    function loop(){
      if(!drawing){ raf=0; return; }
      // 물린 오디오가 실제 재생 중이면 음량으로 입 여닫기, 아니면 연속 재생
      if(boundEl && analyser && !boundEl.paused && !boundEl.ended){
        var level=rmsLevel();
        if(level>0.04){ if(video.paused){ try{ video.play(); }catch(e){} } try{ video.playbackRate=0.75+level*1.2; }catch(e){} }
        else { if(!video.paused){ try{ video.pause(); }catch(e){} } }
      } else {
        if(video.paused){ try{ video.playbackRate=1; video.play(); }catch(e){} }
      }
      keyFrame();
      raf=requestAnimationFrame(loop);
    }
    function startDraw(){ drawing=true; if(!raf) raf=requestAnimationFrame(loop); }
    function stopDraw(){ drawing=false; if(raf){ try{cancelAnimationFrame(raf);}catch(e){} raf=0; } }
    function drawStill(){ keyFrame(); }
    video.addEventListener('loadeddata', function(){ if(!drawing) drawStill(); });
    video.addEventListener('seeked',     function(){ if(!drawing) drawStill(); });
    (function(){ try{ var im=new Image(); im.onload=function(){ if(!drawing){ try{ ctx.clearRect(0,0,W,H); ctx.drawImage(im,0,0,W,H); }catch(e){} } }; im.src='/img/teacher-avatar.png'; }catch(e){} })();

    window.MangoAvatar = {
      // TTS 오디오(HTMLAudioElement)를 물려 음량 립싱크. 요소당 MediaElementSource 1회.
      //   소리 경로(destination) 연결 필수 — 안 하면 음소거됨.
      attach: function(audioEl){
        if(!audioEl || audioEl===boundEl) return;
        if(!ensureCtx()) return;                       // WebAudio 불가 → 연속 재생 폴백 유지
        try{
          var src=actx.createMediaElementSource(audioEl);
          src.connect(actx.destination);               // 1) 소리 그대로 출력(필수)
          src.connect(analyser);                       // 2) 분석 탭
          boundEl=audioEl;
          try{ if(actx.state==='suspended') actx.resume(); }catch(e){}
        }catch(e){ /* 이미 물렸거나 실패 → 연속 재생 폴백 */ }
      },
      // 말하기 시작: 그리기 루프 시작(오디오가 물려 재생 중이면 자동으로 음량 립싱크)
      plainStart: function(){ ensureIdle(); setSpeaking(true); try{ if(actx&&actx.state==='suspended') actx.resume(); }catch(e){} startDraw(); },
      plainStop:  function(){ setSpeaking(false); stopDraw(); try{ video.pause(); }catch(e){} drawStill(); },
      // 미리 만든 립싱크 클립 재생(음성코치 전용) → 캔버스 키잉. 끝나면 idle 복귀.
      playClip: function(id){
        return new Promise(function(resolve, reject){
          ensureIdle();
          var useWebm = (video.currentSrc||'').indexOf('.webm')>=0 ||
                        (video.canPlayType && video.canPlayType('video/webm')!=='');
          var url = '/img/teacher-say-' + id + (useWebm ? '.webm' : '.mp4');
          var done=false;
          function end(ok, err){
            if(done) return; done=true;
            video.removeEventListener('ended', onEnd);
            video.removeEventListener('error', onErr);
            stopDraw(); setSpeaking(false);
            try{ video.muted=true; video.loop=true; video.src=IDLE; video.load(); }catch(e){}
            ok ? resolve() : reject(err||new Error('clip_failed'));
          }
          var onEnd=function(){ end(true); };
          var onErr=function(){ end(false, new Error('clip_load_error')); };
          video.addEventListener('ended', onEnd);
          video.addEventListener('error', onErr);
          try{
            setSpeaking(true);
            video.loop=false; video.muted=false; video.src=url; video.currentTime=0;
            var p=video.play(); startDraw();
            if(p&&p.catch) p.catch(function(e){ end(false, e); });
          }catch(e){ end(false, e); }
        });
      }
    };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

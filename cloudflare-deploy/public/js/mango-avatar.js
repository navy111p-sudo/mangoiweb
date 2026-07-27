/* 👩‍🏫 MangoAvatar — 공용 강사 아바타(캔버스 실시간 크로마키) v4 (2026-07-26)
   초록 배경 영상을 <canvas>에 그리며 초록을 픽셀 단위로 제거 → '진짜 투명'.
   v2: 음량 기반 입 움직임 추가 — attach(audioEl) 로 TTS 오디오를 물리면, 실제 음성의
       크기(RMS)에 맞춰 입을 여닫는다(소리↑=입 벌림, 공백=닫힘, 세기=벌어짐). 발음 모양
       까지는 아니지만 말하는 리듬에 입이 맞는다. 오디오를 못 물리는 경우(브라우저 음성합성)
       는 연속 재생으로 폴백. 키잉은 말하는 동안만 rAF(정지 시 1프레임).
   v3: 캐릭터 전환 — setCharacter('female'|'male') 로 강사(여) ↔ 히어로(남) 얼굴 영상을
       바꿔 끼운다(남자 목소리 선택 시 히어로 아바타).
   v4: 얼굴만이 아니라 어깨·옷깃까지 보이는 "상반신" 프레임. cropTop(위만 자르기) 대신
       캐릭터별 crop 사각형(left,top,right,bottom, 0~1 비율)을 쓴다 — 캐릭터마다 원본
       프레임 속 인물 위치·구도가 달라 화면비도 다를 수 있어, setCharacter() 가 캔버스
       해상도와 카드 화면비(CSS aspect-ratio)를 캐릭터에 맞게 함께 바꾼다(왜곡 없이).
       강사(female)는 alpha 채널 실측(teacher-avatar.png)으로 계산한 4:5 상반신 크롭.
       히어로(male)는 기존 cropTop=16/512 그대로 유지(원본 이미지가 이미 어깨까지 나옴).

   마크업: <div id="tavatar-wrap"><div id="tavatar-ring">
             <canvas id="tavatar-canvas" width="320" height="400"></canvas>
             <video id="tavatar-video" muted loop playsinline preload="auto"
                    crossorigin="anonymous">
               <source src="/img/teacher-avatar.webm" type="video/webm">
               <source src="/img/teacher-avatar.mp4"  type="video/mp4"></video>
           </div></div>
   API: plainStart()/plainStop()  — 말하기 시작/끝(음성합성 등 분석 불가 음성)
        attach(audioEl)           — TTS 오디오를 물려 음량 립싱크(요소당 1회 바인딩)
        playClip(id)              — 미리 만든 클립 재생(음성코치 전용)
        setCharacter(name)        — 표시 캐릭터 전환('female' 기본 / 'male') */
(function(){
  function noop(){}
  if(!window.MangoAvatar){
    window.MangoAvatar = { plainStart:noop, plainStop:noop, attach:noop, setCharacter:noop,
      playClip:function(){ return Promise.reject(new Error('avatar_not_ready')); } };
  }

  // 캐릭터별 영상/스틸 소스 + crop 사각형(0~1 비율, 원본 프레임 기준).
  //   female: teacher-avatar.png 의 alpha 채널을 실측해 계산(머리 위 여백만 트림 + 어깨/옷깃까지 포함).
  //   male(히어로): 기존 동작 그대로 보존(원본 상단 ~3% 검정 띠만 제거, 좌우/아래는 풀프레임).
  // 🗣 (2026-07-27) 입모양 3단계(poses) — 소리 크기에 매번 새로 만든 영상이 아니라, 같은
  //   루프 영상 안에서 이미 자연스럽게 나오는 "다문/중간/크게 벌린" 순간을 골라 그 프레임에
  //   멈춰 보여준다(초 단위 타임스탬프). 같은 인물이라 어색한 합성 없이 정체성이 그대로 유지되고,
  //   소리 크기가 바뀔 때만 그 타임스탬프로 seek 하므로 추가 지연이 없다. 발음(비셈) 자체를
  //   맞추는 건 아니고 "조용함/보통/큼"에 맞는 입모양을 고르는 근사치다.
  var CHARACTERS = {
    female: { sources:[['/img/teacher-avatar.webm','video/webm'],['/img/teacher-avatar.mp4','video/mp4']],
              still:'/img/teacher-avatar.png', rect:{ l:67/512, t:40/512, r:445/512, b:1 },
              poses:{ closed:3.3, medium:0.2, wide:4.0 } },
    male:   { sources:[['/img/hero-avatar.mp4','video/mp4']],
              still:'/img/hero-avatar.png', rect:{ l:0, t:16/512, r:1, b:1 },
              poses:{ closed:3.2, medium:7.1, wide:3.5 } }
  };
  var BASE_W = 320;   // 캔버스 내부 해상도 기준 폭(캐릭터별 비율에 맞춰 높이만 재계산)

  function build(){
    var video  = document.getElementById('tavatar-video');
    var canvas = document.getElementById('tavatar-canvas');
    var wrap   = document.getElementById('tavatar-wrap');
    var ring   = document.getElementById('tavatar-ring');
    if(!video || !canvas) return;
    var ctx = canvas.getContext('2d', { willReadFrequently:true });
    var raf = 0, drawing = false, IDLE = null, clipActive = false;
    var curChar = 'female', cropRect = CHARACTERS.female.rect;
    var curPoses = CHARACTERS.female.poses, curTier = null;   // 🗣 현재 캐릭터의 입모양 타임스탬프 + 지금 보여주는 단계
    // 캐릭터의 crop 사각형에 맞춰 캔버스 해상도 + 카드 화면비를 함께 갱신(왜곡 방지).
    //   같은 <canvas> 를 여러 캐릭터가 공유하므로, 비율이 다른 캐릭터로 바뀌어도
    //   "캔버스 내부 해상도"와 "화면에 보이는 CSS 박스"가 항상 같은 비율을 유지해야 늘어나 보이지 않는다.
    function applyFrame(name){
      var c = CHARACTERS[name]; if(!c) return;
      cropRect = c.rect;
      curPoses = c.poses; curTier = null;   // 🗣 캐릭터가 바뀌면 타임스탬프도 바뀌므로 다음 프레임에 새로 seek
      var aspect = (cropRect.r - cropRect.l) / (cropRect.b - cropRect.t);
      canvas.width = BASE_W; canvas.height = Math.round(BASE_W / aspect);
      // CSS aspect-ratio 로 카드 높이를 자동 계산하려 했으나, 전환(transition) 시 실제
      // 레이아웃에 반영 안 되는 문제가 있어 폭(고정 CSS 값)을 읽어 높이를 직접 px 로 계산해 덮어쓴다.
      if (ring){
        var ringW = ring.getBoundingClientRect().width || parseFloat(getComputedStyle(ring).width) || BASE_W;
        ring.style.height = Math.round(ringW / aspect) + 'px';
      }
    }
    applyFrame(curChar);

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
    function ensureIdle(){ if(!IDLE) IDLE = video.currentSrc || CHARACTERS[curChar].sources[0][0]; }
    function preloadStill(url){
      try{ var im=new Image(); im.onload=function(){ if(!drawing){ try{ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(im,0,0,canvas.width,canvas.height); }catch(e){} } }; im.src=url; }catch(e){}
    }

    // 초록 제거 크로마키: 초록 우세도(g - max(r,b)) 판정 + 가장자리 페더 + 스필 억제.
    // cropRect(l,t,r,b, 0~1 비율)만큼만 원본에서 잘라 캔버스 전체 크기로 확대해 그린다
    // (캔버스 해상도가 applyFrame() 에서 이미 이 crop 과 같은 비율로 맞춰져 있어 왜곡 없음).
    function keyFrame(){
      if (video.readyState < 2) return;
      var vw = video.videoWidth||canvas.width, vh = video.videoHeight||canvas.height;
      var sx = Math.round(vw*cropRect.l), sy = Math.round(vh*cropRect.t);
      var sw = Math.round(vw*(cropRect.r-cropRect.l)), sh = Math.round(vh*(cropRect.b-cropRect.t));
      try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); } catch(e){ return; }
      var im; try { im = ctx.getImageData(0,0,canvas.width,canvas.height); } catch(e){ return; }
      var d = im.data;
      // (2026-07-26) 상반신 크롭이 프레임 가장자리에 가까워지며, 머리카락 올올이
      // 초록 배경빛을 살짝 반사한 픽셀(diff 가 작아 기존엔 완전 불투명 그대로 통과)이
      // 드러나 초록 잔광으로 보였다 — diff>0 인 모든 픽셀은 알파는 그대로 두고
      // 초록만 mx 로 눌러 색만 지운다(디테일 보존 + 잔광 제거).
      for (var i=0;i<d.length;i+=4){
        var r=d[i], g=d[i+1], b=d[i+2];
        var mx = r>b?r:b;
        var diff = g - mx;
        if (diff > 38){ d[i+3]=0; }
        else if (diff > 10){ d[i+3] = ((38-diff)*255/28)|0; d[i+1] = mx; }
        else if (diff > 0){ d[i+1] = mx; }
      }
      ctx.putImageData(im,0,0);
    }
    // 발화가 끝났는데도(onended 유실 등) 그리기가 안 멈춰 계속 움직이는 사고를 막는 안전망 —
    // "물린 오디오가 멈춰/끝나 있다"가 이 프레임 수만큼 연속되면 그리기 자체를 종료(자원 정리용).
    // (2026-07-26 2차) 예전엔 이 대기 구간(서버 TTS 네트워크 응답을 기다리는 동안 등)에도 입을
    // 계속 움직여서 "말은 안 하는데 입만 움직인다"로 보였다 — 실제로 소리가 안 나오는 동안은
    // (오디오가 멈춰/끝나 있으면) **바로** 입을 다물고, 안전망은 그리기를 끝내 rAF 자원만
    // 정리하는 역할로 좁힌다.
    var idleTicks = 0;
    // 🗣 (2026-07-27) 소리 크기 → 입모양 3단계. 임계값은 실제 목소리로 다시 들어보며 조정 가능.
    function tierFor(level){
      if(level <= 0.04) return 'closed';
      if(level <= 0.09) return 'medium';
      return 'wide';
    }
    function showTier(tier){
      if(tier === curTier || !curPoses) return;
      // 🔴 (2026-07-27 3차) setCharacter() 직후(video.load() 로 리로드 중) 는 readyState 가
      //   낮아 seek 이 조용히 씹힌다. 그런데도 curTier 를 먼저 확정해버려서, 나중에 영상이
      //   다 준비돼도 "이미 그 단계다"라고 믿고 다시는 seek 을 시도하지 않았다 — 남자(히어로)
      //   아바타로 바꾼 뒤 첫 발화의 입이 영원히 멈춰 있던 원인. 여자는 페이지 로드시 이미
      //   기본 캐릭터라 이 리로드 경합이 없어서 안 걸렸다. → 준비 전이면 curTier 를 그대로 두고
      //   다음 프레임에 다시 시도한다(성공했을 때만 확정).
      if(video.readyState < 2) return;
      var t = curPoses[tier];
      if(typeof t !== 'number') return;
      curTier = tier;
      try{ if(!video.paused) video.pause(); video.currentTime = t; }catch(e){}
    }
    function loop(){
      if(!drawing){ raf=0; return; }
      if(boundEl && analyser && !clipActive){
        if(boundEl.paused || boundEl.ended){
          showTier('closed');                              // 말 안 하는 중 → 다문 입 프레임에 고정
          idleTicks++;
          if(idleTicks > 300){ doStop(); return; }         // 5초 넘게 안 멈춰지면 plainStop() 유실로 보고 안전 종료
        } else {
          idleTicks = 0;
          showTier(tierFor(rmsLevel()));
        }
      } else {
        // 🔇 분석 불가능한 음성(브라우저 speechSynthesis) — 실제 음량을 모르니 poses 대신
        //    기존처럼 루프를 계속 재생해 "말하는 느낌"만 흉내낸다.
        idleTicks = 0; curTier = null;
        if(video.paused){ try{ video.playbackRate=1; video.play(); }catch(e){} }
      }
      keyFrame();
      raf=requestAnimationFrame(loop);
    }
    function startDraw(){ idleTicks=0; curTier=null; drawing=true; if(!raf) raf=requestAnimationFrame(loop); }
    function stopDraw(){ drawing=false; if(raf){ try{cancelAnimationFrame(raf);}catch(e){} raf=0; } }
    function drawStill(){ keyFrame(); }
    function doStop(){ setSpeaking(false); stopDraw(); try{ video.pause(); }catch(e){} drawStill(); }
    video.addEventListener('loadeddata', function(){ if(!drawing) drawStill(); });
    video.addEventListener('seeked',     function(){ if(!drawing) drawStill(); });
    preloadStill(CHARACTERS[curChar].still);

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
      // 캐릭터 전환('female' 기본 / 'male'=히어로). 목소리 성별 선택에 맞춰 얼굴 교체.
      setCharacter: function(name){
        var c = CHARACTERS[name]; if(!c || name===curChar) return;
        curChar = name; IDLE = null;
        applyFrame(name);
        try{
          while(video.firstChild) video.removeChild(video.firstChild);
          for(var i=0;i<c.sources.length;i++){
            var so=document.createElement('source'); so.src=c.sources[i][0]; so.type=c.sources[i][1];
            video.appendChild(so);
          }
          video.loop=true; video.muted=true; video.load();
        }catch(e){}
        preloadStill(c.still);   // 새 영상 디코드 전에도 곧바로 정지 얼굴을 보여줌
      },
      // 말하기 시작: 그리기 루프 시작(오디오가 물려 재생 중이면 자동으로 음량 립싱크)
      plainStart: function(){ ensureIdle(); setSpeaking(true); try{ if(actx&&actx.state==='suspended') actx.resume(); }catch(e){} startDraw(); },
      plainStop:  function(){ doStop(); },
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
            clipActive=false;
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
            clipActive=true;                    // 클립 재생 중엔 TTS 무음 감시 타이머(idleTicks)가 끼어들지 않게
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

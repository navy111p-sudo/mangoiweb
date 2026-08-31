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
   v5: (2026-07-29) "남자 아바타가 한 번 움직이다가 이후 계속 멈춘다" 재현 — 원본 mp4/webm이
       8초 전체에 키프레임이 딱 1개뿐이었다(ffprobe 확인: I프레임 1개 + P/B프레임 199개).
       입모양 단계 전환마다 하는 seek(showTier)이 그 하나뿐인 키프레임부터 매번 수백 프레임을
       순차 디코드해야 했고, 자연스러운 말소리는 단계가 수시로 바뀌므로 seek 요청이 서로
       겹쳐 끝나지 않았다 — 결국 캔버스가 seek 시작 시점 프레임에 멈춰버렸다(정지 화면처럼
       보임). 여자 쪽 포즈 타임스탬프(0.2~4.0초)는 우연히 파일 앞쪽이라 잘 견뎠고, 남자
       쪽 'medium'(7.1초, 8초짜리 파일의 거의 끝)이 특히 취약했다. 근본 수정 = 세 영상을
       짧은 GOP(키프레임 8프레임=0.32초 간격)로 재인코딩 — 어느 타임스탬프로 seek 해도
       디코드가 즉시 끝나 더 이상 밀리지 않는다(화질 동일, 파일 용량만 2~3배 커짐, 8초
       클립이라 여전히 1.3MB 이하).

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
        setCharacter(name)        — 표시 캐릭터 전환('female' 기본 / 'male')

   v6: (2026-08-31) 「아바타를 더 어리게」 지시로 19세 안팎 Emma·Jake 로 교체하면서,
       캐릭터가 «영상» 말고 «입모양 정지 이미지 3장» 도 될 수 있게 넓혔다(frames).
       왜 영상이 아닌가 — ① v5 사고(입이 멈춤)의 뿌리가 «영상 seek» 이었는데 이미지는
       seek 이 아예 없어 그 사고 유형이 구조적으로 사라진다. ② 8초 영상(1.3MB) 대신
       장당 수백 KB 라 필리핀 회선에서 가볍다. ③ 배경이 이미 투명(alpha)이라 크로마키
       픽셀 루프를 통째로 건너뛴다(keyed:false).
       ⚠️ 투명 PNG 는 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 — keyFrame() 이 매번
          clearRect 로 지우고 그린다. 초록 영상(불투명)일 때는 원래 동작과 같다.
       ⚠️ 이미지 파일이 없으면(아직 안 올렸거나 깨졌으면) fallback 캐릭터(옛 영상)로
          조용히 되돌아간다 — 얼굴 자리가 «빈 카드» 로 남는 것이 제일 나쁘기 때문.

   v7: (2026-08-31) 고를 수 있는 친구가 «둘»(여자·남자)에서 «넷» 이 되면서 캐릭터를
       성별이 아니라 이름으로 부른다 — emma·jake(성인, 기존) / lily·noah(19세, 새 얼굴).
       옛 이름('female'|'male')은 CHAR_ALIAS 로 계속 받는다. */
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
  // 🧑 (2026-08-31) 캐릭터를 «성별» 이 아니라 «사람 이름» 으로 부릅니다 — 사장님 지시로
  //   고를 수 있는 친구가 둘(여자·남자)에서 넷이 되었기 때문입니다. 이름과 얼굴이 어긋나면
  //   「Lily 를 골랐는데 Emma 가 나온다」가 되고, 그건 화면만 봐서는 원인이 안 보입니다.
  //     Emma·Jake = 지금까지 쓰던 성인 얼굴(초록 배경 영상 크로마키). 그대로 둡니다.
  //     Lily·Noah = 새로 만든 19세 얼굴(입모양 이미지 3장, 배경이 지워진 투명 PNG).
  //   ⛔ Emma·Jake 를 지우지 마세요: Lily·Noah 의 PNG 가 없을 때의 폴백이고,
  //      playClip() 의 미리 만든 립싱크 클립(teacher-say-*)이 Emma 얼굴과 짝입니다.
  var CHARACTERS = {
    emma: { sources:[['/img/teacher-avatar.webm','video/webm'],['/img/teacher-avatar.mp4','video/mp4']],
            still:'/img/teacher-avatar.png', rect:{ l:67/512, t:40/512, r:445/512, b:1 },
            poses:{ closed:3.3, medium:0.2, wide:4.0 } },
    jake: { sources:[['/img/hero-avatar.mp4','video/mp4']],
            still:'/img/hero-avatar.png', rect:{ l:0, t:16/512, r:1, b:1 },
            poses:{ closed:3.2, medium:7.1, wide:3.5 } },
    lily: { frames:{ closed:'/img/lily-closed.webp', medium:'/img/lily-mid.webp', wide:'/img/lily-wide.webp' },
            still:'/img/lily-closed.webp', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'emma' },
    noah: { frames:{ closed:'/img/noah-closed.webp', medium:'/img/noah-mid.webp', wide:'/img/noah-wide.webp' },
            still:'/img/noah-closed.webp', rect:{ l:0, t:0, r:1, b:1 },
            aspect:0.8, keyed:false, fallback:'jake' }
  };
  // 옛 이름으로 부르는 코드가 남아 있어도 조용히 죽지 않게 — setCharacter 가 먼저 풀어 준다.
  // ⚠️ 화면이 새 이름으로만 부르도록 고쳤지만, 이 표를 지우면 옛 호출이 «아무 일도 안 일어남» 이 됩니다.
  var CHAR_ALIAS = { female:'emma', male:'jake', female_classic:'emma', male_classic:'jake' };
  var BASE_W = 320;   // 캔버스 내부 해상도 기준 폭(캐릭터별 비율에 맞춰 높이만 재계산)

  function build(){
    var video  = document.getElementById('tavatar-video');
    var canvas = document.getElementById('tavatar-canvas');
    var wrap   = document.getElementById('tavatar-wrap');
    var ring   = document.getElementById('tavatar-ring');
    if(!video || !canvas) return;
    var ctx = canvas.getContext('2d', { willReadFrequently:true });
    var raf = 0, drawing = false, IDLE = null, clipActive = false;
    var curChar = 'emma', cropRect = CHARACTERS.emma.rect;
    var curPoses = CHARACTERS.emma.poses || CHARACTERS.emma.frames, curTier = null;   // 🗣 현재 캐릭터의 입모양 타임스탬프(영상) 또는 장 목록(이미지) + 지금 보여주는 단계
    // 🖼 v6 이미지 캐릭터 상태 — imgFrames 가 null 이 아니면 «영상이 아니라 그림» 을 그리는 중이다.
    var imgFrames = null, imgCur = null, imgAspectDone = false;
    var keyedNow = (CHARACTERS.emma.keyed !== false);   // 초록 제거가 필요한 캐릭터인가
    // 캐릭터의 crop 사각형에 맞춰 캔버스 해상도 + 카드 화면비를 함께 갱신(왜곡 방지).
    //   같은 <canvas> 를 여러 캐릭터가 공유하므로, 비율이 다른 캐릭터로 바뀌어도
    //   "캔버스 내부 해상도"와 "화면에 보이는 CSS 박스"가 항상 같은 비율을 유지해야 늘어나 보이지 않는다.
    function setAspect(aspect){
      if(!(aspect > 0)) return;
      canvas.width = BASE_W; canvas.height = Math.round(BASE_W / aspect);
      // CSS aspect-ratio 로 카드 높이를 자동 계산하려 했으나, 전환(transition) 시 실제
      // 레이아웃에 반영 안 되는 문제가 있어 폭(고정 CSS 값)을 읽어 높이를 직접 px 로 계산해 덮어쓴다.
      if (ring){
        var ringW = ring.getBoundingClientRect().width || parseFloat(getComputedStyle(ring).width) || BASE_W;
        ring.style.height = Math.round(ringW / aspect) + 'px';
      }
    }
    function applyFrame(name){
      var c = CHARACTERS[name]; if(!c) return;
      cropRect = c.rect;
      curPoses = c.poses || c.frames; curTier = null;   // 🗣 캐릭터가 바뀌면 타임스탬프도 바뀌므로 다음 프레임에 새로 seek
      fadeData = null;                      // 🎞 캔버스 크기가 바뀌므로 이전 스냅샷은 버린다
      // ⚠️ 영상 캐릭터의 rect 는 «정사각 원본» 기준이라 rect 만으로 화면비가 나온다.
      //    이미지 캐릭터는 원본이 정사각이 아니므로 c.aspect 로 시작해 두고, 'closed' 장이
      //    실제로 로드된 뒤 naturalWidth/Height 로 다시 정확히 맞춘다(mountImages) —
      //    파일을 다른 비율로 갈아 끼워도 저절로 따라오게 하려는 것.
      setAspect(c.aspect || ((cropRect.r - cropRect.l) / (cropRect.b - cropRect.t)));
    }
    applyFrame(curChar);

    // 캐릭터를 실제로 «장착» 한다 — 영상이면 <video> 소스 교체, 이미지면 입모양 3장 미리 받기.
    function mountCharacter(name){
      var c = CHARACTERS[name]; if(!c) return;
      keyedNow = (c.keyed !== false);
      if (c.frames){ mountImages(name, c); return; }
      imgFrames = null; imgCur = null;
      try{
        while(video.firstChild) video.removeChild(video.firstChild);
        for(var i=0;i<c.sources.length;i++){
          var so=document.createElement('source'); so.src=c.sources[i][0]; so.type=c.sources[i][1];
          video.appendChild(so);
        }
        video.loop=true; video.muted=true; video.load();
      }catch(e){}
      preloadStill(c.still);   // 새 영상 디코드 전에도 곧바로 정지 얼굴을 보여줌
    }
    // 🖼 이미지 캐릭터 장착 — 입모양 3장을 미리 받아 두고 showTier 가 갈아 끼운다.
    function mountImages(name, c){
      try{ video.pause();
           while(video.firstChild) video.removeChild(video.firstChild);
           video.removeAttribute('src'); video.load(); }catch(e){}   // 영상은 확실히 세워 둔다
      imgFrames = {}; imgCur = null; imgAspectDone = false;
      var failed = false;
      ['closed','medium','wide'].forEach(function(k){
        var im = new Image();
        im.onload = function(){
          if(name !== curChar) return;            // 그 사이 캐릭터가 또 바뀌었으면 버린다
          if(k === 'closed' && !imgAspectDone && im.naturalWidth && im.naturalHeight){
            imgAspectDone = true;                 // 실측 비율로 카드 높이를 정확히 다시 맞춘다
            setAspect((im.naturalWidth  * (cropRect.r - cropRect.l)) /
                      (im.naturalHeight * (cropRect.b - cropRect.t)));
          }
          // 쉬는 얼굴(다문 입)이 오면 그것을 우선한다 — 다른 장이 먼저 도착해도 첫 화면은 입을 다문 얼굴.
          if(k === 'closed' || !imgCur){ imgCur = im; curTier = k; }
          if(!drawing) drawStill();
        };
        im.onerror = function(){
          // 🔴 파일이 아직 안 올라왔거나 깨졌을 때 «빈 얼굴 카드» 로 남지 않게 성인 얼굴로 되돌린다.
          //    「얼굴이 옛날 것이다」 = 그 PNG 가 /img/ 에 없다는 뜻이다.
          // ⚠️ 되돌리는 것은 «쉬는 얼굴(closed)» 이 없을 때만이다 — medium·wide 는 말할 때만 쓰는
          //    보조 장이라, 그것 하나가 없다고 얼굴 전체를 옛것으로 되돌리면 잃는 것이 더 크다
          //    (그 단계만 안 쓰고 나머지로 말한다). 2026-08-31 실제로 한 장이 늦게 도착했다.
          if(k !== 'closed') { imgFrames[k] = null; return; }
          if(failed || name !== curChar) return;
          failed = true;
          var fb = c.fallback;
          if(!fb || !CHARACTERS[fb] || fb === name) return;
          curChar = fb; IDLE = null; applyFrame(fb); mountCharacter(fb);
        };
        im.src = c.frames[k];
        imgFrames[k] = im;
      });
    }

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
    // ⚠️ 이미지 캐릭터에는 sources 가 없다 — 예전처럼 sources[0][0] 을 바로 읽으면 여기서 죽는다.
    function ensureIdle(){ if(IDLE) return; var c = CHARACTERS[curChar] || {};
      IDLE = video.currentSrc || (c.sources && c.sources[0] && c.sources[0][0]) || ''; }
    function preloadStill(url){
      try{ var im=new Image(); im.onload=function(){ if(!drawing){ try{ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(im,0,0,canvas.width,canvas.height); }catch(e){} } }; im.src=url; }catch(e){}
    }

    // 초록 제거 크로마키: 초록 우세도(g - max(r,b)) 판정 + 가장자리 페더 + 스필 억제.
    // cropRect(l,t,r,b, 0~1 비율)만큼만 원본에서 잘라 캔버스 전체 크기로 확대해 그린다
    // (캔버스 해상도가 applyFrame() 에서 이미 이 crop 과 같은 비율로 맞춰져 있어 왜곡 없음).
    // 🎞 (2026-07-27 4차) 입모양 단계가 바뀔 때 프레임이 뚝 끊겨 보이던 것을 완화 —
    //   전환 직전 화면을 스냅샷(fadeData)해두고, 짧은 시간(FADE_MS) 동안 새 프레임과 섞어
    //   부드럽게 넘어가게 한다(showTier 에서 스냅샷을 남김).
    var fadeData = null, fadeT0 = 0;
    var FADE_MS = 130;
    function keyFrame(){
      var srcEl, vw, vh;
      if (imgFrames){
        srcEl = imgCur;
        if (!srcEl || !srcEl.complete || !srcEl.naturalWidth) return;   // 아직 안 받았으면 다음 프레임에
        vw = srcEl.naturalWidth; vh = srcEl.naturalHeight;
      } else {
        if (video.readyState < 2) return;
        srcEl = video; vw = video.videoWidth||canvas.width; vh = video.videoHeight||canvas.height;
      }
      var sx = Math.round(vw*cropRect.l), sy = Math.round(vh*cropRect.t);
      var sw = Math.round(vw*(cropRect.r-cropRect.l)), sh = Math.round(vh*(cropRect.b-cropRect.t));
      // 🖼 배경이 이미 투명한 PNG 는 «겹쳐 그리면» 앞 입모양이 유령처럼 남는다 — 항상 지우고 그린다.
      //    (초록 영상은 불투명이라 지우든 안 지우든 결과가 같다)
      try { ctx.clearRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(srcEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); } catch(e){ return; }
      // 초록을 지울 필요도 없고(이미 투명) 섞을 것도 없으면 픽셀을 아예 만지지 않는다 —
      // getImageData/putImageData 가 폰에서 제일 비싼 구간이라 그만큼 가벼워진다.
      if (!keyedNow && !fadeData) return;
      var im; try { im = ctx.getImageData(0,0,canvas.width,canvas.height); } catch(e){ return; }
      var d = im.data;
      // (2026-07-26) 상반신 크롭이 프레임 가장자리에 가까워지며, 머리카락 올올이
      // 초록 배경빛을 살짝 반사한 픽셀(diff 가 작아 기존엔 완전 불투명 그대로 통과)이
      // 드러나 초록 잔광으로 보였다 — diff>0 인 모든 픽셀은 알파는 그대로 두고
      // 초록만 mx 로 눌러 색만 지운다(디테일 보존 + 잔광 제거).
      if (keyedNow) for (var i=0;i<d.length;i+=4){
        var r=d[i], g=d[i+1], b=d[i+2];
        var mx = r>b?r:b;
        var diff = g - mx;
        if (diff > 38){ d[i+3]=0; }
        else if (diff > 10){ d[i+3] = ((38-diff)*255/28)|0; d[i+1] = mx; }
        else if (diff > 0){ d[i+1] = mx; }
      }
      if (fadeData && fadeData.data.length === d.length){
        var a = (Date.now() - fadeT0) / FADE_MS;
        if (a >= 1) { fadeData = null; }
        else {
          var fd = fadeData.data;
          for (var j=0;j<d.length;j+=4){
            d[j]   = fd[j]   + (d[j]   - fd[j])   * a;
            d[j+1] = fd[j+1] + (d[j+1] - fd[j+1]) * a;
            d[j+2] = fd[j+2] + (d[j+2] - fd[j+2]) * a;
            d[j+3] = fd[j+3] + (d[j+3] - fd[j+3]) * a;
          }
        }
      } else if (fadeData) { fadeData = null; }   // 캔버스 크기가 바뀌었으면(캐릭터 전환) 안전하게 버림
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
    var lastSwitchAt = 0;
    var MIN_SWITCH_MS = 90;   // 🎞 잡음성 순간 변동으로 너무 자주(덜덜) 바뀌는 것 방지 — 한 음절 정도의 최소 유지시간
    function showTier(tier){
      if(tier === curTier || !curPoses) return;
      // 🔴 (2026-07-27 3차) setCharacter() 직후(video.load() 로 리로드 중) 는 readyState 가
      //   낮아 seek 이 조용히 씹힌다. 그런데도 curTier 를 먼저 확정해버려서, 나중에 영상이
      //   다 준비돼도 "이미 그 단계다"라고 믿고 다시는 seek 을 시도하지 않았다 — 남자(히어로)
      //   아바타로 바꾼 뒤 첫 발화의 입이 영원히 멈춰 있던 원인. 여자는 페이지 로드시 이미
      //   기본 캐릭터라 이 리로드 경합이 없어서 안 걸렸다. → 준비 전이면 curTier 를 그대로 두고
      //   다음 프레임에 다시 시도한다(성공했을 때만 확정).
      var now = Date.now();
      if(imgFrames){
        // 🖼 이미지 캐릭터 — seek 이 없으므로 v5 사고(입이 멈춤)가 구조적으로 안 난다.
        //    아직 안 받은 장이면 curTier 를 «확정하지 않고» 다음 프레임에 다시 시도한다
        //    (v3 사고와 같은 자리 — 확정해버리면 다 받은 뒤에도 영영 안 바꾼다).
        var imN = imgFrames[tier];
        if(!imN || !imN.complete || !imN.naturalWidth) return;
        if(now - lastSwitchAt < MIN_SWITCH_MS) return;
        try { fadeData = ctx.getImageData(0,0,canvas.width,canvas.height); fadeT0 = now; } catch(e){ fadeData = null; }
        curTier = tier; lastSwitchAt = now; imgCur = imN;
        return;
      }
      if(video.readyState < 2) return;
      if(now - lastSwitchAt < MIN_SWITCH_MS) return;
      var t = curPoses[tier];
      if(typeof t !== 'number') return;
      // 🎞 전환 직전 화면을 스냅샷해서 keyFrame() 이 새 프레임과 부드럽게 섞도록 넘겨준다.
      try { fadeData = ctx.getImageData(0,0,canvas.width,canvas.height); fadeT0 = now; } catch(e){ fadeData = null; }
      curTier = tier; lastSwitchAt = now;
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
        idleTicks = 0;
        if(imgFrames){
          // 🖼 이미지 캐릭터는 '재생' 이 없으므로 세 장을 일정 간격으로 번갈아 보여 준다.
          //    ⚠️ 간격은 MIN_SWITCH_MS(90) 보다 커야 한다 — 작으면 showTier 가 매번 되돌아가
          //       입이 한 장에 굳는다.
          var SEQ = ['closed','medium','wide','medium'];
          showTier(SEQ[Math.floor(Date.now() / 150) % SEQ.length]);
        } else {
          curTier = null;
          if(video.paused){ try{ video.playbackRate=1; video.play(); }catch(e){} }
        }
      }
      keyFrame();
      raf=requestAnimationFrame(loop);
    }
    function startDraw(){ idleTicks=0; curTier=null; lastSwitchAt=0; fadeData=null; drawing=true; if(!raf) raf=requestAnimationFrame(loop); }
    function stopDraw(){ drawing=false; if(raf){ try{cancelAnimationFrame(raf);}catch(e){} raf=0; } }
    function drawStill(){ keyFrame(); }
    function doStop(){ setSpeaking(false); stopDraw(); try{ video.pause(); }catch(e){} drawStill(); }
    video.addEventListener('loadeddata', function(){ if(!drawing) drawStill(); });
    video.addEventListener('seeked',     function(){ if(!drawing) drawStill(); });
    mountCharacter(curChar);   // 🖼 이미지 캐릭터면 입모양 3장을 여기서 받기 시작한다(영상이면 옛 동작 그대로)

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
      // 캐릭터 전환 — 'emma'|'jake'|'lily'|'noah' (옛 'female'|'male' 도 받습니다).
      setCharacter: function(name){
        name = CHAR_ALIAS[name] || name;
        var c = CHARACTERS[name]; if(!c || name===curChar) return;
        curChar = name; IDLE = null;
        applyFrame(name);
        mountCharacter(name);
      },
      // 말하기 시작: 그리기 루프 시작(오디오가 물려 재생 중이면 자동으로 음량 립싱크)
      plainStart: function(){ ensureIdle(); setSpeaking(true); try{ if(actx&&actx.state==='suspended') actx.resume(); }catch(e){} startDraw(); },
      plainStop:  function(){ doStop(); },
      // 미리 만든 립싱크 클립 재생(음성코치 전용) → 캔버스 키잉. 끝나면 idle 복귀.
      playClip: function(id){
        return new Promise(function(resolve, reject){
          // ⚠️ 미리 만든 립싱크 클립(teacher-say-*)은 «옛 강사 얼굴» 과 짝이다 —
          //    이미지 캐릭터 위에 틀면 다른 사람 얼굴이 튀어나온다. 쓰려면 female_classic 으로 바꿔서.
          if(imgFrames){ reject(new Error('clip_needs_video_character')); return; }
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

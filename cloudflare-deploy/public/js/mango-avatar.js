/* 👩‍🏫 MangoAvatar — 공용 강사 아바타(캔버스 실시간 크로마키) v1 (2026-07-25)
   음성코치(speech-coach.html)에서 검증한 방식을 여러 페이지가 함께 쓰도록 공용화.
   초록 배경 영상(idle 루프 + 선택적 문장 클립)을 <canvas>에 그리며 초록을 픽셀 단위로
   제거 → '진짜 투명'. 알파 코덱(webm alpha)이 이 환경 ffmpeg에서 안 만들어져, 런타임
   키잉으로 모든 기기에서 투명 배경을 보장한다. 키잉은 말하는 동안만 rAF(정지 시 1프레임)
   라 저사양에도 부담이 적다.

   필요한 마크업(각 페이지):
     <div id="tavatar-wrap"><div id="tavatar-ring">
       <canvas id="tavatar-canvas" width="320" height="320"></canvas>
       <video id="tavatar-video" muted loop playsinline preload="auto"
              crossorigin="anonymous">
         <source src="/img/teacher-avatar.webm" type="video/webm">
         <source src="/img/teacher-avatar.mp4"  type="video/mp4">
       </video>
     </div></div>
   API: MangoAvatar.plainStart() / plainStop() / attach(audioEl) / playClip(id)
        (playClip 는 /img/teacher-say-<id> 클립이 있을 때만. 웜업·친구는 안 씀) */
(function(){
  function noop(){}
  // build 전 호출 대비 stub
  if(!window.MangoAvatar){
    window.MangoAvatar = { plainStart:noop, plainStop:noop, attach:noop,
      playClip:function(){ return Promise.reject(new Error('avatar_not_ready')); } };
  }

  function build(){
    var video  = document.getElementById('tavatar-video');
    var canvas = document.getElementById('tavatar-canvas');
    var wrap   = document.getElementById('tavatar-wrap');
    if(!video || !canvas) return;                 // 이 페이지엔 아바타 마크업 없음 → stub 유지
    var ctx = canvas.getContext('2d', { willReadFrequently:true });
    var W = canvas.width, H = canvas.height;
    var raf = 0, drawing = false, IDLE = null;
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
    function loop(){ if(!drawing){ raf=0; return; } keyFrame(); raf=requestAnimationFrame(loop); }
    function startDraw(){ drawing=true; if(!raf) raf=requestAnimationFrame(loop); }
    function stopDraw(){ drawing=false; if(raf){ try{cancelAnimationFrame(raf);}catch(e){} raf=0; } }
    function drawStill(){ keyFrame(); }
    video.addEventListener('loadeddata', function(){ if(!drawing) drawStill(); });
    video.addEventListener('seeked',     function(){ if(!drawing) drawStill(); });
    // 초기 정지 얼굴(투명 포스터) — 영상 디코드 전 잠깐
    (function(){ try{ var im=new Image(); im.onload=function(){ if(!drawing){ try{ ctx.clearRect(0,0,W,H); ctx.drawImage(im,0,0,W,H); }catch(e){} } }; im.src='/img/teacher-avatar.png'; }catch(e){} })();

    window.MangoAvatar = {
      // 미리 만든 립싱크 클립 재생(정확 립싱크+음성) → 캔버스 키잉. 끝나면 idle 복귀.
      //   (음성코치 전용. 웜업·친구는 고정문장이 없어 사용 안 함.)
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
      },
      // 자유 대화(서버 TTS/HTMLAudio): idle 영상을 재생하며 키잉(일반 말하기 모션).
      attach: function(audioEl){
        if (!audioEl) return;
        audioEl.addEventListener('playing', function(){ ensureIdle(); setSpeaking(true); try{ video.muted=true; video.loop=true; video.play(); }catch(e){} startDraw(); });
        var stop=function(){ setSpeaking(false); stopDraw(); try{ video.pause(); }catch(e){} drawStill(); };
        audioEl.addEventListener('ended', stop);
        audioEl.addEventListener('pause', stop);
        audioEl.addEventListener('error', stop);
      },
      // 말하기 시작/끝을 직접 알려주는 방식(SpeechSynthesis·MangoiTTS 등 분석 불가 음성용)
      plainStart: function(){ ensureIdle(); setSpeaking(true); try{ video.muted=true; video.play(); }catch(e){} startDraw(); },
      plainStop:  function(){ setSpeaking(false); stopDraw(); try{ video.pause(); }catch(e){} drawStill(); }
    };
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

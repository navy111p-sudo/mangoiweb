/* AI speaking: torso layer behind the face canvas / AI 말하기: 얼굴 캔버스 뒤 몸통 레이어
   EN: The face canvas (mango-avatar.js) stops at the chest. This module puts a drawn
       torso with arms (img/bodies/<friend>-body.webp, built by
       cloudflare-deploy/build-avatar-bodies.py) *behind* the canvas so the friend reads
       as an upper body. It never touches the face engine, its images, the mouth atlas,
       lip sync, speech, mic or conversation code. It only follows which friend is shown.
   KO: 얼굴 캔버스는 가슴에서 끝납니다. 이 모듈은 그 «뒤» 에 어깨·팔이 있는 몸통 그림을
       깔아 상반신으로 보이게 합니다. 얼굴 엔진·원본 이미지·입모양·음성·마이크·대화
       코드는 건드리지 않고, 지금 어느 친구가 보이는지만 따라갑니다.
   Fallbacks / 실패 시: unknown friend, image error, or the video fallback face
       → the layer hides and the original card layout returns unchanged. */
(function(){
  'use strict';
  if(window.MangoWarmupBody)return;
  var VERSION=2;
  var FRIENDS={emma:1,lily:1,noah:1,jake:1,mei:1,long:1};
  var ALIAS={female:'emma',male:'jake'};
  var ring=null, canvas=null, video=null, img=null, wanted='', loadSeq=0;

  function friendName(name){ name=ALIAS[name]||name; return FRIENDS[name]?name:''; }
  function videoFaceShown(){
    try{ return !!video && parseFloat(getComputedStyle(video).opacity||'0')>0.05; }catch(e){ return false; }
  }
  function hide(){ if(ring)ring.classList.remove('wf-has-body'); if(img)img.removeAttribute('data-friend'); }

  function show(name){
    wanted=friendName(name);
    if(!ring||!img||!wanted||videoFaceShown()){ hide(); return; }
    if(img.getAttribute('data-friend')===wanted && img.complete && img.naturalWidth){ ring.classList.add('wf-has-body'); return; }
    var seq=++loadSeq, friend=wanted;
    hide();                                     // never show the previous friend's body / 이전 친구 몸통을 남기지 않음
    img.onload=function(){ if(seq!==loadSeq||friend!==wanted)return; img.setAttribute('data-friend',friend); if(!videoFaceShown())ring.classList.add('wf-has-body'); };
    img.onerror=function(){ if(seq===loadSeq)hide(); };
    img.src='/img/bodies/'+friend+'-body.webp?v='+VERSION;
  }

  function follow(){
    var A=window.MangoAvatar;
    if(!A||typeof A.setCharacter!=='function'||A.setCharacter.__wfBody)return;
    var original=A.setCharacter;
    var wrapped=function(name){
      var result=original.apply(this,arguments);   // face engine first, unchanged / 얼굴 엔진 먼저, 그대로
      try{
        // Mirror the engine: a known friend switches; the old video faces (*_classic) get no body;
        // an unknown name is ignored by the engine, so the current body stays too.
        // 엔진과 똑같이: 아는 친구는 전환, 옛 영상 얼굴(*_classic)은 몸통 없음, 모르는 이름은 무시.
        var key=String(name||'');
        if(friendName(key))show(key);
        else if(/_classic$/.test(key)){ wanted=''; hide(); }
      }catch(e){}
      return result;
    };
    wrapped.__wfBody=true;
    A.setCharacter=wrapped;
  }

  function init(){
    ring=document.getElementById('tavatar-ring');
    canvas=document.getElementById('tavatar-canvas');
    video=document.getElementById('tavatar-video');
    if(!ring||!canvas)return;
    img=document.createElement('img');
    img.className='wf-body'; img.alt=''; img.setAttribute('aria-hidden','true');
    img.decoding='async'; img.draggable=false;
    ring.insertBefore(img,canvas);
    if(video){
      video.addEventListener('playing',function(){ if(videoFaceShown())hide(); });
      ['pause','emptied','ended'].forEach(function(ev){ video.addEventListener(ev,function(){ show(wanted); }); });
    }
    follow();
    show(window.__mgAvatarWant||'');
  }

  window.MangoWarmupBody={ refresh:function(){ show(window.__mgAvatarWant||wanted); }, current:function(){ return ring&&ring.classList.contains('wf-has-body')?wanted:''; } };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init); else init();
})();

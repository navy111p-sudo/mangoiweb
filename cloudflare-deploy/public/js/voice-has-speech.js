/*!
 * 🎤 voice-has-speech.js — 녹음 파일에 «말소리» 가 있는가 (웜업·A.i 친구하기 공용 정본)
 *
 * 왜 (2026-10-07 MAIMAI 제보 — 수업 안 A.i 말하기 연습):
 *   mangoi-voice-input.js 의 소리크기 판정(peak>8/128)이 «작은 목소리» 를 못 보면, Whisper 가
 *   받아 적은 글자까지 «안 들렸다» 로 버렸다. 수업 중에는 화상수업(교사 사무실 모드 = 자동게인 끔)이
 *   같은 마이크를 먼저 쥐고 있어 녹음이 작게 들어온다(추론).
 *   → 버리기 전에 녹음 파일을 디코드해 «바닥 소음 대비» 로 다시 잰다.
 *
 * MangoiVoiceCheck.inSamples(Float32Array, sampleRate) -> true | false | null
 * MangoiVoiceCheck.blobHasVoice(blob) -> Promise<true | false | null>   null = 모름(부르는 쪽은 예전대로 버린다)
 * ⛔ 판정을 화면에 복제하지 마세요 — 두 화면이 서로 다른 답을 하게 됩니다.
 */
(function () {
  'use strict';
/* 🎤 녹음 파일에 «말소리» 가 있는가 — true / false / null(모름: 디코드 불가).
   소리 크기만이 아니라 «바닥 소음 대비» 로 본다: 완전 무음·일정한 잡음에서 Whisper 가 지어낸 글자는 계속 버린다. */
function _voiceInSamples(x, sr){
  if(!x || !x.length || !sr) return null;
  var n=Math.max(1, Math.round(sr*0.02)), fr=[];
  for(var i=0;i+n<=x.length;i+=n){ var s=0; for(var j=i;j<i+n;j++) s+=x[j]*x[j]; fr.push(Math.sqrt(s/n)); }
  if(fr.length<5) return false;
  var srt=fr.slice().sort(function(a,b){return a-b;});
  var floor=srt[Math.floor(srt.length*0.02)], top=srt[srt.length-1];   // 하위 2% — 쉬지 않고 길게 말해도 말소리를 바닥으로 잡지 않게
  var th=Math.max(0.006, floor*3), loud=0;
  for(var k=0;k<fr.length;k++) if(fr[k]>th) loud++;
  return top>=0.008 && top>=floor*4 && loud>=8;    // 8칸 = 160ms 이상 — 딸깍 한 번은 말이 아니다
}
function _blobHasVoice(blob){
  return new Promise(function(res){
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC || !blob || !blob.arrayBuffer) return res(null);
      blob.arrayBuffer().then(function(ab){
        var ac=new AC(), done=false;
        function end(v){ if(done)return; done=true; try{ ac.close(); }catch(e){} res(v); }
        var ok=function(buf){ try{ end(_voiceInSamples(buf.getChannelData(0), buf.sampleRate)); }catch(e){ end(null); } };
        try{ var pr=ac.decodeAudioData(ab, ok, function(){ end(null); }); if(pr && pr.catch) pr.catch(function(){ end(null); }); }catch(e){ end(null); }
        setTimeout(function(){ end(null); }, 4000);
      }).catch(function(){ res(null); });
    }catch(e){ res(null); }
  });
}
  window.MangoiVoiceCheck = { inSamples: _voiceInSamples, blobHasVoice: _blobHasVoice };
})();

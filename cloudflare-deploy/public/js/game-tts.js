/* ════════════════════════════════════════════════════════════════════════
 *  🔊 MangoiTTS — 게임 공용 원어민 발음 모듈
 *  1순위: 사이트 클라우드 TTS(POST /api/voice/tts, Deepgram Aura-1 → MeloTTS)
 *         → 기기와 상관없이 동일한 원어민급 발음. blob URL 캐시로 재생 즉시.
 *  2순위(폴백): 브라우저 speechSynthesis — 자연스러운 영어 보이스 점수화 선택.
 *  사용: MangoiTTS.speak('He plays soccer.')  /  MangoiTTS.prefetch(text)
 *        rate(재생 속도, 1=보통)는 클라우드 재생엔 playbackRate 로 적용.
 * ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var TTS_URL = '/api/voice/tts';
  var cache = {}, audioEl = null, enVoice = null;

  /* ── 폴백용 브라우저 보이스 선택 (자연스러운 음성 우선, 로봇 음성 회피) ── */
  function scoreVoice(v){
    var n=(v.name||'').toLowerCase(), lang=(v.lang||'').toLowerCase(), s=0;
    if(lang==='en-us') s+=40; else if(lang==='en-gb'||lang==='en-au') s+=28;
    else if(lang.slice(0,2)==='en') s+=18; else s-=120;
    if(/natural|neural/.test(n)) s+=70;
    if(/google/.test(n)) s+=60;
    if(/\b(aria|jenny|guy|ava|emma|libby|michelle|jane|nova|sara|brian|christopher)\b/.test(n)) s+=48;
    if(/\b(samantha|alex|allison|tom|siri|nicky|evan|joelle|nathan)\b/.test(n)) s+=46;
    if(/online|premium|enhanced|plus/.test(n)) s+=24;
    if(v.localService===false) s+=30;
    if(/zira|david|mark|hazel|george|susan|catherine|linda|richard|sean|heera|ravi/.test(n)) s-=55;
    if(/desktop|compact|espeak|pico|microsoft server/.test(n)) s-=45;
    return s;
  }
  function pickVoice(){
    try{
      var vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      if(!vs.length) return;
      var en = vs.filter(function(v){ return (v.lang||'').slice(0,2).toLowerCase()==='en'; });
      if(!en.length){ enVoice=null; return; }
      var best=null, bs=-1e9;
      en.forEach(function(v){ var sc=scoreVoice(v); if(sc>bs){ bs=sc; best=v; } });
      enVoice=best;
    }catch(_){}
  }
  try{ if(window.speechSynthesis){ pickVoice(); window.speechSynthesis.onvoiceschanged=pickVoice; } }catch(_){}

  function synthSpeak(text, rate, onend){
    try{
      if(!window.speechSynthesis){ if(onend) onend(); return; }
      if(!enVoice) pickVoice();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang=(enVoice&&enVoice.lang)||'en-US'; u.rate=rate||0.95; u.pitch=1.02;
      if(enVoice) u.voice=enVoice;
      if(onend){ var done=false, fin=function(){ if(!done){ done=true; onend(); } };
        u.onend=fin; u.onerror=fin; setTimeout(fin, 4000); }
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch(_){ if(onend) onend(); }
  }

  /* ── 클라우드 원어민 TTS ── */
  function fetchTTS(text){
    return fetch(TTS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text:text, lang:'en' }) })
      .then(function(r){ var ct=r.headers.get('content-type')||''; if(!r.ok || ct.indexOf('audio')<0) throw new Error('tts'); return r.blob(); })
      .then(function(b){ var u=URL.createObjectURL(b); cache[text]=u; return u; });
  }
  function prefetch(text){
    text=String(text||'').trim(); if(!text || cache[text]) return;
    fetchTTS(text).catch(function(){});
  }
  function playUrl(u, rate, onend){
    try{
      if(!audioEl) audioEl = new Audio();
      var done=false, fin=function(){ if(!done){ done=true; if(onend) onend(); } };
      if(onend){ audioEl.onended=fin; audioEl.onerror=fin; setTimeout(fin, 8000); }
      else { audioEl.onended=null; audioEl.onerror=null; }
      audioEl.src=u; audioEl.playbackRate = rate||1;
      audioEl.play().catch(function(){ fin(); });
    }catch(_){ if(onend) onend(); }
  }
  // speak(text, rate?, onend?) — onend 는 재생이 끝나면 1회 호출 (말하기 미션 등 흐름 연결용)
  function speak(text, rate, onend){
    text=String(text||'').trim(); if(!text){ if(onend) onend(); return; }
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    if(cache[text]){ playUrl(cache[text], rate, onend); return; }
    fetchTTS(text).then(function(u){ playUrl(u, rate, onend); })
      .catch(function(){ synthSpeak(text, rate ? Math.min(1.4, 0.95*rate) : 0.95, onend); });
  }

  window.MangoiTTS = { speak: speak, prefetch: prefetch };
})();

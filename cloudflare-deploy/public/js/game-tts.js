/* ════════════════════════════════════════════════════════════════════════
 *  🔊 MangoiTTS — 게임 공용 원어민 발음 모듈 (영어/중국어 지원)
 *  1순위: 사이트 클라우드 TTS(POST /api/voice/tts)
 *         · 영어(en) → Deepgram Aura-1 → MeloTTS(en)
 *         · 중국어(zh) → MeloTTS(zh) 원어민 만다린
 *  2순위(폴백): 브라우저 speechSynthesis — 언어별 자연스러운 보이스 점수화 선택.
 *  사용: MangoiTTS.setLang('zh'|'en');  MangoiTTS.speak('你好');  MangoiTTS.prefetch(text)
 *        rate(재생 속도, 1=보통)는 클라우드 재생엔 playbackRate 로 적용.
 * ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var TTS_URL = '/api/voice/tts';
  var cache = {}, audioEl = null, curVoice = null;
  // 현재 발음 언어: 'en'(기본) | 'zh'(중국어). localStorage 로 페이지 간 공유.
  var curLang = (function(){ try{ var l=localStorage.getItem('mangoi_game_lang'); return (l==='zh')?'zh':'en'; }catch(_){ return 'en'; } })();
  // 🎙 서버 화자(Aura-2 speaker) — setSpeaker('orion'|'asteria'|null). null=서버 기본(여성 asteria).
  var curSpeaker = null, genderHint = null;
  var MALE_SPEAKERS = { apollo:1, arcas:1, aries:1, atlas:1, draco:1, hermes:1, hyperion:1, janus:1, jupiter:1, mars:1, neptune:1, odysseus:1, orion:1, orpheus:1, pluto:1, saturn:1, zeus:1 };

  // 🙊 이모지 제거 — TTS 가 이모지를 "orange" "smiling face" 처럼 읽어버리는 문제 방지 (26-07-21)
  //   일반 문장부호(따옴표·물음표 등)는 건드리지 않도록 픽토그램 영역만 제거한다.
  var EMOJI_RE = null;
  try { EMOJI_RE = new RegExp('[\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2300}-\\u{23FF}\\u{2190}-\\u{21FF}\\u{FE00}-\\u{FE0F}\\u{200D}\\u{20E3}\\u{2139}\\u{3030}\\u{303D}\\u{3297}\\u{3299}]', 'gu'); } catch(_){}
  function stripEmoji(t){
    t = String(t || '');
    if (EMOJI_RE) { try { t = t.replace(EMOJI_RE, ' '); } catch(_){} }
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  /* ── 폴백용 브라우저 보이스 선택 (자연스러운 음성 우선, 로봇 음성 회피) ── */
  function scoreVoice(v){
    var n=(v.name||'').toLowerCase(), lang=(v.lang||'').toLowerCase(), s=0;
    if(curLang==='zh'){
      // 중국어(만다린) 보이스 점수화
      if(lang==='zh-cn'||lang==='zh_cn') s+=40; else if(lang.slice(0,2)==='zh') s+=28; else s-=120;
      if(/natural|neural/.test(n)) s+=70;
      if(/google/.test(n)) s+=60;
      if(/\b(xiaoxiao|xiaoyi|yunxi|yunyang|xiaochen|huihui|kangkang|yaoyao|tingting|sinji|mei|zhang)\b/.test(n)) s+=46;
      if(/online|premium|enhanced|plus/.test(n)) s+=24;
      if(v.localService===false) s+=30;
      if(/desktop|compact|espeak|pico|microsoft server/.test(n)) s-=45;
      return s;
    }
    // 영어 보이스 점수화
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
    // 🎙 성별 힌트(브라우저 폴백에서도 남/여 선택 반영 — 확실할 때만 가감)
    if(genderHint==='male'){
      if(/\b(guy|brian|christopher|tom|alex|evan|nathan|ryan|aaron|matthew|davis|tony|eric|male)\b/.test(n)) s+=90;
      if(/\b(aria|jenny|ava|emma|libby|michelle|jane|nova|sara|samantha|allison|nicky|joelle|female)\b/.test(n)) s-=90;
    } else if(genderHint==='female'){
      if(/\b(aria|jenny|ava|emma|libby|michelle|jane|nova|sara|samantha|allison|nicky|joelle|female)\b/.test(n)) s+=90;
      if(/\b(guy|brian|christopher|tom|evan|nathan|ryan|aaron|matthew|davis|tony|eric|male)\b/.test(n)) s-=90;
    }
    return s;
  }
  function pickVoice(){
    try{
      var vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      if(!vs.length) return;
      var pref = (curLang==='zh') ? 'zh' : 'en';
      var cand = vs.filter(function(v){ return (v.lang||'').slice(0,2).toLowerCase()===pref; });
      if(!cand.length){ curVoice=null; return; }
      var best=null, bs=-1e9;
      cand.forEach(function(v){ var sc=scoreVoice(v); if(sc>bs){ bs=sc; best=v; } });
      curVoice=best;
    }catch(_){}
  }
  try{ if(window.speechSynthesis){ pickVoice(); window.speechSynthesis.onvoiceschanged=pickVoice; } }catch(_){}

  function defaultLangTag(){ return curLang==='zh' ? 'zh-CN' : 'en-US'; }

  function synthSpeak(text, rate, onend){
    try{
      if(!window.speechSynthesis){ if(onend) onend(); return; }
      if(!curVoice) pickVoice();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang=(curVoice&&curVoice.lang)||defaultLangTag(); u.rate=rate||0.95; u.pitch=1.02;
      if(curVoice) u.voice=curVoice;
      if(onend){ var done=false, fin=function(){ if(!done){ done=true; onend(); } };
        u.onend=fin; u.onerror=fin; setTimeout(fin, 4000); }
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch(_){ if(onend) onend(); }
  }

  /* ── 클라우드 원어민 TTS ── */
  function ckey(text){ return curLang + '|' + (curSpeaker||'') + '|' + text; }   // 언어·화자별 캐시 키
  function fetchTTS(text){
    var key = ckey(text);
    var body = { text:text, lang:curLang };
    if (curSpeaker) body.speaker = curSpeaker;
    return fetch(TTS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){ var ct=r.headers.get('content-type')||''; if(!r.ok || ct.indexOf('audio')<0) throw new Error('tts'); return r.blob(); })
      .then(function(b){ var u=URL.createObjectURL(b); cache[key]=u; return u; });
  }
  function prefetch(text){
    text=stripEmoji(text); if(!text || cache[ckey(text)]) return;
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
  //   클라우드 우선(en=Deepgram Aura-1, zh=서버가 진짜 만다린 반환) → 실패 시 브라우저 폴백
  function speak(text, rate, onend){
    text=stripEmoji(text); if(!text){ if(onend) onend(); return; }
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    var key = ckey(text);
    if(cache[key]){ playUrl(cache[key], rate, onend); return; }
    fetchTTS(text).then(function(u){ playUrl(u, rate, onend); })
      .catch(function(){ synthSpeak(text, rate ? Math.min(1.4, 0.95*rate) : 0.95, onend); });
  }

  // 발음 언어 전환 — 'zh' 중국어 / 'en' 영어. 보이스 재선택 + localStorage 저장.
  function setLang(l){
    curLang = (l==='zh') ? 'zh' : 'en';
    try{ localStorage.setItem('mangoi_game_lang', curLang); }catch(_){}
    curVoice = null; pickVoice();
  }
  function getLang(){ return curLang; }

  // 🎙 화자 전환 — setSpeaker('orion'|'asteria'|…|null). 브라우저 폴백에도 성별 힌트 반영.
  function setSpeaker(s){
    curSpeaker = s ? String(s).toLowerCase() : null;
    genderHint = curSpeaker ? (MALE_SPEAKERS[curSpeaker] ? 'male' : 'female') : null;
    curVoice = null; pickVoice();
  }
  function getSpeaker(){ return curSpeaker; }

  /* 🔇 낭독 즉시 중단 — 마이크를 켜기 전에 반드시 호출할 것.
     (2026-07-23) 그동안 화면들은 speechSynthesis.cancel() 만 불렀는데, 영어는 **클라우드 TTS라
     <audio> 로 재생**된다. 그래서 AI 목소리가 스피커로 계속 나오는 채로 마이크가 열렸고,
     음성인식이 AI 목소리를 학생 말로 받아 적어 엉뚱한 문장이 전송됐다. */
  function stop(){
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    try{ if(audioEl){ audioEl.onended=null; audioEl.onerror=null; audioEl.pause(); try{ audioEl.currentTime=0; }catch(_2){} } }catch(_){}
  }

  window.MangoiTTS = { speak: speak, prefetch: prefetch, setLang: setLang, getLang: getLang, setSpeaker: setSpeaker, getSpeaker: getSpeaker, stop: stop };
})();

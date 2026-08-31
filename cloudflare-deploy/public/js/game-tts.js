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
  /* 🔢 «지금 몇 번째 발화인가» — stop()·setSpeaker()·setLang()·새 speak() 가 올린다.
     아래 speak() 은 서버가 한 번 실패하면 400ms 뒤 다시 물어보는데, 그 사이에
     화면이 stop() 을 부르거나(마이크를 켜기 직전!) 다음 문장을 시작하면
     늦게 도착한 소리가 그 위로 재생된다. 그러면 «AI 목소리가 나오는 채로 마이크가
     열려 음성인식이 AI 말을 받아 적던» 2026-07-23 사고가 그대로 되살아난다.
     그래서 늦게 온 응답은 이 번호를 보고 스스로 물러난다. */
  var seq = 0;
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
    var key = ckey(text), want = curSpeaker || '';   // 키·요청 화자는 «지금» 값으로 고정
    var body = { text:text, lang:curLang };
    if (curSpeaker) body.speaker = curSpeaker;
    return fetch(TTS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){
        var ct=r.headers.get('content-type')||'';
        if(!r.ok || ct.indexOf('audio')<0){
          // 뉴런 소진(429·503)은 다시 물어도 같은 답이다 — 재시도하지 않는다
          var e=new Error('tts'); e.noRetry=(r.status===429||r.status===503); throw e;
        }
        var got=''; try{ got=String(r.headers.get('X-TTS-Speaker')||'').toLowerCase(); }catch(_){}
        return r.blob().then(function(b){ return { blob:b, got:got }; });
      })
      .then(function(o){
        var u=URL.createObjectURL(o.blob);
        /* 🎙️ 서버가 «다른 화자» 로 대체한 음성은 캐시하지 않는다.
           Aura-2 가 한 번 흔들리면 서버는 Aura-1 로 떨어지는데 화자가 바뀐다
           (Noah aries → orion). 그것을 요청 화자 키로 캐시하면 그 문장은
           세션 내내 남의 목소리로 굳는다 — 서버 R2 캐시가 «실제로 쓴 화자» 키만
           쓰는 것과 같은 이유다(2026-08-31). 헤더가 없으면(옛 배포·중국어 경로)
           판정하지 않고 예전처럼 캐시한다 — 모르는 것을 단정하지 않는다. */
        if(!want || !o.got || o.got===want) cache[key]=u;
        return u;
      });
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
    /* 🎙️ 한 번 실패했다고 곧바로 «기기 목소리» 로 가지 않는다 — 원어민 음성과 전혀 달라
       「목소리가 계속 변해」로 제일 크게 들린다(2026-08-31 사장님 제보). 400ms 뒤 한 번 더
       물어보면 일시적 흔들림은 여기서 끝난다.
       ⛔ 기기 목소리 폴백 자체는 없애지 마세요 — 소리가 아예 안 나는 것이 더 나쁩니다
          (앱 WebView·뉴런 소진 때는 그것뿐입니다). 「한 번 더」 뒤에만 갑니다. */
    var mine = ++seq;
    var attempt = function(tryNo){
      fetchTTS(text).then(function(u){
        if(mine!==seq) return;            // 멈췄거나 다음 발화가 시작됐다 — 물러난다
        playUrl(u, rate, onend);
      }).catch(function(err){
        if(mine!==seq) return;
        if(tryNo===0 && !(err&&err.noRetry)){
          setTimeout(function(){ if(mine===seq) attempt(1); }, 400);
          return;
        }
        synthSpeak(text, rate ? Math.min(1.4, 0.95*rate) : 0.95, onend);
      });
    };
    attempt(0);
  }

  // 발음 언어 전환 — 'zh' 중국어 / 'en' 영어. 보이스 재선택 + localStorage 저장.
  function setLang(l){
    seq++;                                   // 진행 중인 요청이 옛 언어로 재생되지 않게
    curLang = (l==='zh') ? 'zh' : 'en';
    try{ localStorage.setItem('mangoi_game_lang', curLang); }catch(_){}
    curVoice = null; pickVoice();
  }
  function getLang(){ return curLang; }

  // 🎙 화자 전환 — setSpeaker('orion'|'asteria'|…|null). 브라우저 폴백에도 성별 힌트 반영.
  function setSpeaker(s){
    seq++;                                   // 진행 중인 요청이 옛 화자로 재생되지 않게
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
    seq++;   // ⚠️ 재시도가 «멈춘 뒤» 도착해 마이크 옆에서 재생되지 않게(위 seq 주석)
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    try{ if(audioEl){ audioEl.onended=null; audioEl.onerror=null; audioEl.pause(); try{ audioEl.currentTime=0; }catch(_2){} } }catch(_){}
  }

  // 👩‍🏫 아바타 음량 립싱크용 — 재생에 쓰는 <audio> 를 노출(없으면 생성). 다른 페이지엔 영향 없음.
  function getAudioEl(){ if(!audioEl){ try{ audioEl = new Audio(); }catch(_){} } return audioEl; }
  // 🙊 (2026-08-03) stripEmoji 공개 — 이모지 정제 규칙의 **단일 출처**.
  //   게임 4종(language-ace·tank-battle·tetris·p38-3d)은 TTS 스택을 각자 인라인으로
  //   복사해 갖고 있어서 이 규칙만 빠져 있었다(공용 모듈은 2026-07-21 에 고쳤다).
  //   파이프라인 전체 통합은 반복횟수·Android 브리지·시퀀스 토큰 등 구조가 달라 별건이고,
  //   오디오 검증(Whisper 전사)이 필요하다. 우선 갈라진 규칙만 여기로 모은다.
  window.MangoiTTS = { speak: speak, prefetch: prefetch, setLang: setLang, getLang: getLang, setSpeaker: setSpeaker, getSpeaker: getSpeaker, stop: stop, getAudioEl: getAudioEl, stripEmoji: stripEmoji };
})();

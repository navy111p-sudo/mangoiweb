/* MangoiTTS: cloud English/Chinese speech with device fallback.
 * speak(text, rate?, onend?, {onTiming}?), prefetch(text), stop().
 * Historical rationale: docs/game-tts-history.md (repository root). */
(function(){
  'use strict';
  var TTS_URL = '/api/voice/tts';
  var cache = {}, audioEl = null, curVoice = null;
  // Invalidate stale fetches, retries and playback callbacks on stop or a new voice.
  var seq = 0, activeCleanup = null, active = false;
  function clearActive() { if (activeCleanup) activeCleanup(); activeCleanup = null; active = false; }
  function report(opts, stage) { try { if (opts && typeof opts.onTiming === 'function') opts.onTiming(stage); } catch (_) {} }
  // Persist language across pages: en (default) or zh.
  var curLang = (function(){ try{ var l=localStorage.getItem('mangoi_game_lang'); return (l==='zh')?'zh':'en'; }catch(_){ return 'en'; } })();
  // null speaker uses the server default.
  var curSpeaker = null, genderHint = null;
  var MALE_SPEAKERS = { apollo:1, arcas:1, aries:1, atlas:1, draco:1, hermes:1, hyperion:1, janus:1, jupiter:1, mars:1, neptune:1, odysseus:1, orion:1, orpheus:1, pluto:1, saturn:1, zeus:1 };

  // Remove pictograms so TTS does not pronounce emoji names.
  // Keep punctuation.
  var EMOJI_RE = null;
  try { EMOJI_RE = new RegExp('[\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2300}-\\u{23FF}\\u{2190}-\\u{21FF}\\u{FE00}-\\u{FE0F}\\u{200D}\\u{20E3}\\u{2139}\\u{3030}\\u{303D}\\u{3297}\\u{3299}]', 'gu'); } catch(_){}
  function stripEmoji(t){
    t = String(t || '');
    if (EMOJI_RE) { try { t = t.replace(EMOJI_RE, ' '); } catch(_){} }
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  // Prefer natural device voices.
  function scoreVoice(v){
    var n=(v.name||'').toLowerCase(), lang=(v.lang||'').toLowerCase(), s=0;
    if(curLang==='zh'){
      // Mandarin.
      if(lang==='zh-cn'||lang==='zh_cn') s+=40; else if(lang.slice(0,2)==='zh') s+=28; else s-=120;
      if(/natural|neural/.test(n)) s+=70;
      if(/google/.test(n)) s+=60;
      if(/\b(xiaoxiao|xiaoyi|yunxi|yunyang|xiaochen|huihui|kangkang|yaoyao|tingting|sinji|mei|zhang)\b/.test(n)) s+=46;
      if(/online|premium|enhanced|plus/.test(n)) s+=24;
      if(v.localService===false) s+=30;
      if(/desktop|compact|espeak|pico|microsoft server/.test(n)) s-=45;
      return s;
    }
    // English.
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
    // Apply gender preference only to recognized voices.
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

  function synthSpeak(text, rate, onend, mine, opts){
    try{
      if(!window.speechSynthesis){ active=false; if(onend) onend(); return; }
      if(!curVoice) pickVoice();
      var u = new SpeechSynthesisUtterance(String(text));
      u.lang=(curVoice&&curVoice.lang)||defaultLangTag(); u.rate=rate||0.95; u.pitch=1.02;
      if(curVoice) u.voice=curVoice;
      var done=false, timer=null, waits=0;
      var fin=function(){ if(done || mine!==seq) return; done=true; clearTimeout(timer); active=false; report(opts,'output_finished'); if(onend) onend(); };
      u.onstart=function(){ if(mine===seq) report(opts,'output_started'); };
      u.onend=fin; u.onerror=fin;
      // Never finish over a still-speaking voice.
      function watch(){
        if(mine!==seq || done) return;
        if(window.speechSynthesis.speaking && ++waits < 30){ timer=setTimeout(watch,4000); return; }
        try { window.speechSynthesis.cancel(); } catch (_) {}
        fin();
      }
      activeCleanup=function(){ clearTimeout(timer); u.onstart=u.onend=u.onerror=null; };
      timer=setTimeout(watch,4000);
      report(opts,'tts_ready');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }catch(_){ if(mine===seq){active=false;if(onend) onend();} }
  }

  // Cloud speech.
  function ckey(text){ return curLang + '|' + (curSpeaker||'') + '|' + text; }   // Language/speaker cache key.
  function fetchTTS(text){
    var key = ckey(text), want = curSpeaker || '';   // Snapshot the requested speaker.
    var body = { text:text, lang:curLang };
    if (curSpeaker) body.speaker = curSpeaker;
    // Bound stalled requests.
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout;
    var timed = new Promise(function (_, reject) {
      timeout = setTimeout(function () {
        if (controller) controller.abort();
        var error = new Error('tts_timeout'); error.noRetry = true; reject(error);
      }, 15000);
    });
    var request = fetch(TTS_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), signal: controller ? controller.signal : undefined })
      .then(function(r){
        var ct=r.headers.get('content-type')||'';
        if(!r.ok || ct.indexOf('audio')<0){
          // Quota exhaustion must not retry.
          var e=new Error('tts'); e.noRetry=(r.status===429||r.status===503); throw e;
        }
        var got=''; try{ got=String(r.headers.get('X-TTS-Speaker')||'').toLowerCase(); }catch(_){}
        return r.blob().then(function(b){ return { blob:b, got:got }; });
      });
    return Promise.race([request, timed]).finally(function () { clearTimeout(timeout); })
      .then(function(o){
        var u=URL.createObjectURL(o.blob);
        // Never cache a known substituted voice under the requested speaker. Missing header stays compatible.
        if(!want || !o.got || o.got===want) cache[key]=u;
        return u;
      });
  }
  function prefetch(text){
    text=stripEmoji(text); if(!text || cache[ckey(text)]) return;
    fetchTTS(text).catch(function(){});
  }
  function playUrl(u, rate, onend, mine, opts){
    try{
      if(!audioEl) audioEl = new Audio();
      var done=false, timer=null, lastTime=-1;
      var fin=function(){ if(done || mine!==seq) return; done=true; clearTimeout(timer); active=false; report(opts,'output_finished'); if(onend) onend(); };
      var started=function(){ if(mine===seq) report(opts,'output_started'); };
      audioEl.addEventListener('playing',started);
      audioEl.onended=fin; audioEl.onerror=fin;
      // Allow long audio; stop stalled playback before finishing.
      function watch(){
        if(mine!==seq || done) return;
        if(!audioEl.paused && !audioEl.ended && audioEl.currentTime > lastTime){
          lastTime=audioEl.currentTime; timer=setTimeout(watch,8000); return;
        }
        try { audioEl.pause(); } catch (_) {}
        fin();
      }
      activeCleanup=function(){ clearTimeout(timer); audioEl.removeEventListener('playing',started); audioEl.onended=audioEl.onerror=null; };
      timer=setTimeout(watch,8000);
      audioEl.src=u; audioEl.playbackRate = rate||1;
      audioEl.play().catch(function(){ fin(); });
    }catch(_){ if(mine===seq){active=false;if(onend) onend();} }
  }

  // Completion fires once for the current voice.
  // Cloud first, device fallback.
  function speak(text, rate, onend, opts){
    text=stripEmoji(text); if(!text){ if(onend) onend(); return; }
    var mine = ++seq;
    clearActive();
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    try { if (audioEl) audioEl.pause(); } catch (_) {}
    active=true;
    report(opts,'tts_started');
    var key = ckey(text);
    if(cache[key]){ report(opts,'tts_ready'); playUrl(cache[key], rate, onend, mine, opts); return; }
    // Retry transient failures once after 400ms. Keep device fallback for WebViews and quota exhaustion.
    var attempt = function(tryNo){
      fetchTTS(text).then(function(u){
        if(mine!==seq) return;            // Ignore superseded speech.
        report(opts,'tts_ready');
        playUrl(u, rate, onend, mine, opts);
      }).catch(function(err){
        if(mine!==seq) return;
        if(tryNo===0 && !(err&&err.noRetry)){
          setTimeout(function(){ if(mine===seq) attempt(1); }, 400);
          return;
        }
        report(opts,'tts_failed');
        synthSpeak(text, rate ? Math.min(1.4, 0.95*rate) : 0.95, onend, mine, opts);
      });
    };
    attempt(0);
  }

  // Change language, reselect voice and persist.
  function setLang(l){
    seq++;                                   // Invalidate old-language requests.
    curLang = (l==='zh') ? 'zh' : 'en';
    try{ localStorage.setItem('mangoi_game_lang', curLang); }catch(_){}
    curVoice = null; pickVoice();
  }
  function getLang(){ return curLang; }

  // Change speaker and device gender hint.
  function setSpeaker(s){
    seq++;                                   // Invalidate old-speaker requests.
    curSpeaker = s ? String(s).toLowerCase() : null;
    genderHint = curSpeaker ? (MALE_SPEAKERS[curSpeaker] ? 'male' : 'female') : null;
    curVoice = null; pickVoice();
  }
  function getSpeaker(){ return curSpeaker; }

  // Call before opening the mic: stop BOTH cloud audio and device speech to avoid transcribing AI output.
  function stop(){
    seq++;   // Invalidate retries.
    clearActive();
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    try{ if(audioEl){ audioEl.onended=null; audioEl.onerror=null; audioEl.pause(); try{ audioEl.currentTime=0; }catch(_2){} } }catch(_){}
  }

  // Expose audio for avatar lip sync.
  function getAudioEl(){ if(!audioEl){ try{ audioEl = new Audio(); }catch(_){} } return audioEl; }
  // Share emoji sanitization with legacy game TTS stacks.




  window.MangoiTTS = { speak: speak, prefetch: prefetch, setLang: setLang, getLang: getLang, setSpeaker: setSpeaker, getSpeaker: getSpeaker, stop: stop, busy: function(){ return active; }, getAudioEl: getAudioEl, stripEmoji: stripEmoji };
})();

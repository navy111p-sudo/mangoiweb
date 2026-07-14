// ═══════════════════════════════════════════════════════════════
// adm-r15.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  if (!('speechSynthesis' in window)) return;
  var synth = window.speechSynthesis;
  var LS = 'ph85VoiceOn';
  function isOn(){ try { return localStorage.getItem(LS) !== '0'; } catch(e){ return true; } }
  function setOn(v){ try { localStorage.setItem(LS, v ? '1' : '0'); } catch(e){} }

  // 음성 캐시 (voiceschanged 는 비동기 로드) — 한국어/영어 둘 다
  var koVoice = null, enVoice = null;
  function loadVoice(){
    try {
      var vs = synth.getVoices() || [];
      koVoice = vs.filter(function(v){ return /ko(-|_)?KR/i.test(v.lang); })[0]
             || vs.filter(function(v){ return /^ko/i.test(v.lang); })[0] || null;
      enVoice = vs.filter(function(v){ return /en(-|_)?US/i.test(v.lang); })[0]
             || vs.filter(function(v){ return /^en/i.test(v.lang); })[0] || null;
    } catch(e){}
  }
  // 🌐 현재 관리자 UI 언어(EN 토글 시 'en') — 영어면 음성·안내문을 영어로 낸다.
  function isEnUI(){ try { return window.adminLang === 'en'; } catch(e){ return false; } }
  loadVoice();
  try { synth.addEventListener('voiceschanged', loadVoice); } catch(e){ try { synth.onvoiceschanged = loadVoice; } catch(_){} }

  // 🔊 사이드바 음성 안내 — 무료 서버 '기계음'(/api/tts-free = Google TTS, 크레딧 0원) 1순위.
  //    · Typecast(유료) 는 절대 안 씀. 이 PC 처럼 OS 에 한국어 음성이 없어도 항상 소리가 나도록 서버 기계음을 먼저 쓴다.
  //    · 서버 실패/오프라인 시에만 브라우저 speechSynthesis 로 폴백.
  var FREE_TTS = '/api/tts-free';
  var SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  var audioEl = null, _seq = 0, _primed = false;
  function ensureAudio(){ if (audioEl) return audioEl; try { audioEl = new Audio(); audioEl.preload = 'auto'; } catch(e){ audioEl = null; } return audioEl; }
  // 첫 사용자 제스처(클릭)에서 오디오 요소를 '무음'으로 한 번 재생해 잠금해제 →
  //   이후 비동기 fetch→blob→play 가 모바일에서도 허용됨(제스처로 blessed 된 엘리먼트라서).
  function prime(){
    if (_primed) return; _primed = true;
    var a = ensureAudio();
    try { if (a){ a.src = SILENT_WAV; var p = a.play(); if (p && p.then) p.then(function(){ try{ a.pause(); a.currentTime = 0; }catch(_){} }).catch(function(){}); } } catch(e){}
    try { synth.resume(); var w = new SpeechSynthesisUtterance(' '); w.volume = 0; synth.speak(w); } catch(e){}
  }

  var _lastU = null;   // 발화 중 GC 로 utterance 가 수거돼 소리가 끊기는 브라우저 버그 방지(참조 유지)
  function _browserSpeak(text){    // 폴백: 브라우저 내장 음성(OS 에 해당 언어 음성 있을 때만 소리남)
    try {
      var u = new SpeechSynthesisUtterance(text);
      if (isEnUI()){ u.lang = 'en-US'; if (enVoice) u.voice = enVoice; }
      else { u.lang = 'ko-KR'; if (koVoice) u.voice = koVoice; }
      u.rate = 1.05; u.pitch = 1;
      _lastU = u;
      try { synth.resume(); } catch(_){}
      synth.speak(u);
    } catch(e){}
  }
  function speak(text){
    if (!text || !isOn()) return;
    var mySeq = ++_seq, served = false;   // 연타 시 이전 안내 무효화
    try { synth.cancel(); } catch(_){}    // 진행 중이던 브라우저 폴백음성 중단
    try { if (audioEl) audioEl.pause(); } catch(_){}
    var a = ensureAudio();
    // 1순위: 무료 서버 기계음 — fetch→blob→play (AI 운영비서와 동일한 방식).
    //   ※ audio.src 에 URL 직접 스트리밍은 SW/Range 상호작용으로 일부 환경서 재생이 stall(무음) 됨.
    //     blob(URL.createObjectURL)로 재생하면 그 문제를 완전히 회피 → 확실히 소리남. 실브라우저 검증완료.
    try {
      fetch(FREE_TTS + '?q=' + encodeURIComponent(text.slice(0, 600)) + '&lang=' + (isEnUI() ? 'en' : 'ko'))
        .then(function(r){ if(!r.ok) throw new Error('tts '+r.status); return r.blob(); })
        .then(function(b){ if(mySeq!==_seq) return; if(!b || b.size<200) throw new Error('empty'); served = true;
          if(!a){ _browserSpeak(text); return; }
          try { if(a.src && a.src.indexOf('blob:')===0) URL.revokeObjectURL(a.src); } catch(_){}
          a.src = URL.createObjectURL(b);
          var p = a.play(); if(p && p.catch) p.catch(function(){ if(mySeq===_seq) _browserSpeak(text); });
        })
        .catch(function(){ if(mySeq===_seq && !served) _browserSpeak(text); });   // 서버 실패 → 브라우저음성 폴백
    } catch(e){ _browserSpeak(text); }
  }

  // 이모지/⭐신규 등 제거 → 자연스러운 낭독
  function clean(t){
    return (t || '')
      .replace(/⭐\s*(신규|New)/gi, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu, '')
      .replace(/\s*\/\s*/g, ' ')          // "학생 / 학부모" → "학생 학부모" (슬래시 낭독 방지)
      .replace(/\s+/g, ' ').trim();
  }

  // 그룹(부모) 한 줄 설명 — 제목 키워드 매칭. 미매칭이면 '안의 항목'만 안내.
  var DESC = [
    [/AI/i,          'AI가 학원 운영을 돕는 자동화 기능 모음입니다'],
    [/평가/,         '학생 평가서와 수업 리포트를 만들고 관리하는 곳입니다'],
    [/알림/,         '학생과 학부모에게 보내는 알림을 관리하는 곳입니다'],
    [/강사/,         '강사 정보와 급여, 수업 평가를 관리하는 곳입니다'],
    [/통계|KPI/i,    '학원 운영 지표와 통계를 보는 곳입니다'],
    [/회계|포인트/,  '결제와 정산, 포인트를 관리하는 곳입니다'],
    [/학생|학부모/,  '학생과 학부모 정보를 관리하는 곳입니다'],
    [/교육|콘텐츠/,  '교재와 학습 콘텐츠를 관리하는 곳입니다'],
    [/시스템/,       '권한과 출결 등 시스템 설정을 관리하는 곳입니다']
  ];
  // 영어 UI(EN 토글) 일 때 그룹 설명 — 영어로 번역된 제목 키워드로 매칭. (값은 마침표 포함 완성문장)
  var DESC_EN = [
    [/AI/i,                      'This is a set of automation features where AI helps run the academy.'],
    [/eval/i,                    'This is where you create and manage student report cards and lesson reports.'],
    [/notif|alert/i,             'This is where you manage the alerts sent to students and parents.'],
    [/teacher/i,                 'This is where you manage teacher info, payroll, and lesson evaluations.'],
    [/stat|kpi/i,                'This is where you view the academy operating metrics and statistics.'],
    [/account|point|payment/i,   'This is where you manage payments, settlement, and points.'],
    [/student|parent/i,          'This is where you manage student and parent information.'],
    [/education|content/i,       'This is where you manage textbooks and learning content.'],
    [/system/i,                  'This is where you manage system settings like permissions and attendance.']
  ];
  function descFor(title){
    var list = isEnUI() ? DESC_EN : DESC;
    for (var i = 0; i < list.length; i++){ if (list[i][0].test(title)) return list[i][1]; }
    return '';
  }

  function describeHead(head){
    var group = head.parentElement;
    var title = clean((head.querySelector('.ph85-title') || {}).textContent);
    var subs = [].map.call(group.querySelectorAll('.ph85-sub'), function(s){ return clean(s.textContent); })
                 .filter(Boolean);
    var d = descFor(title);
    var msg;
    if (isEnUI()){
      msg = 'The ' + title + ' menu.';
      if (d) msg += ' ' + d;   // DESC_EN 값은 마침표 포함
      if (subs.length){
        msg += ' It contains ' + subs.slice(0, 6).join(', ')
             + (subs.length > 6 ? (', and ' + subs.length + ' menus in total.') : '.');
      }
    } else {
      msg = title + ' 메뉴입니다.';
      if (d) msg += ' ' + d + '.';
      if (subs.length){
        msg += ' 이 안에는 ' + subs.slice(0, 6).join(', ')
             + (subs.length > 6 ? (' 등 총 ' + subs.length + '개 메뉴가') : ' 메뉴가') + ' 있습니다.';
      }
    }
    speak(msg);
  }
  function describeSub(sub){
    var title = clean(sub.textContent);
    var tip;
    if (isEnUI()){
      // 영어 도움말 — 카드 id 로 TIP_EN 사전 조회(admin-tip-i18n.js)
      try { tip = (window.TIP_EN && window.TIP_EN[sub.getAttribute('data-card')]) || ''; } catch(e){ tip = ''; }
    } else {
      tip = sub.getAttribute('data-tip-ko') || '';
    }
    speak(title + (tip ? '. ' + tip : ''));
  }

  // ▶ 캡처 단계 청취 — ★window★ 에 붙임(중요): 어떤 스크립트가 window 캡처에서 stopPropagation() 을
  //   호출해 document 까지 이벤트가 안 내려오는 경우가 있어(그래서 메뉴 클릭이 무반응이었음),
  //   document 대신 window 캡처에 붙여야 메뉴 클릭을 확실히 잡는다. 원래 동작(펼치기 등)은 그대로 유지.
  window.addEventListener('click', function(e){
    if (!isOn()) return;
    var t = e.target; if (!t || !t.closest) return;
    if (!t.closest('#ph85-sidebar')) return;
    if (t.closest('#ph85-voice-toggle')) return;   // 토글 버튼은 제외
    prime();                                        // 첫 클릭에서 오디오 잠금해제
    var sub = t.closest('.ph85-sub');   if (sub){ describeSub(sub); return; }
    var head = t.closest('.ph85-head'); if (head){ describeHead(head); return; }
  }, true);

  // 🔊 켜기/끄기 토글 버튼 (검색창/브랜드 아래에 삽입)
  function insertToggle(){
    var sb = document.getElementById('ph85-sidebar');
    if (!sb || document.getElementById('ph85-voice-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'ph85-voice-toggle';
    function paint(){
      var on = isOn(), en = isEnUI();
      btn.className = on ? '' : 'off';
      var label = en ? ('Voice guide ' + (on ? 'ON' : 'OFF')) : ('음성 안내 ' + (on ? '켜짐' : '꺼짐'));
      btn.innerHTML = (on ? '🔊' : '🔇') + ' <span>' + label + '</span>';
    }
    paint();
    btn.addEventListener('click', function(ev){
      ev.stopPropagation();
      prime();                               // 토글 클릭(사용자 제스처)에서 오디오 잠금해제
      var next = !isOn(); setOn(next); paint();
      if (next) speak(isEnUI() ? 'Voice guidance is on. Tap any menu and I will explain it.' : '음성 안내를 켰습니다. 메뉴를 누르면 설명해 드려요.');
      else { _seq++; try { synth.cancel(); } catch(_){} try { if(audioEl){ audioEl.pause(); audioEl.currentTime = 0; } } catch(_){} }
    });
    // 🌐 언어 토글(문서 lang 속성 변경) 시 버튼 라벨을 즉시 영어/한국어로 다시 그림
    try { new MutationObserver(paint).observe(document.documentElement, { attributes:true, attributeFilter:['lang'] }); } catch(e){}
    var anchor = sb.querySelector('.ph85-search-wrap') || sb.querySelector('.ph85-brand');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else sb.insertBefore(btn, sb.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertToggle);
  else insertToggle();
  setTimeout(insertToggle, 800);
  setTimeout(insertToggle, 2200);   // ph86 사이드바 보강(2000ms) 이후 재삽입 보장
})();

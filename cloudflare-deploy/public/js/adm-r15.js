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
  function _browserSpeak(text, onDone){    // 폴백: 브라우저 내장 음성(OS 에 해당 언어 음성 있을 때만 소리남)
    try {
      var u = new SpeechSynthesisUtterance(text);
      if (isEnUI()){ u.lang = 'en-US'; if (enVoice) u.voice = enVoice; }
      else { u.lang = 'ko-KR'; if (koVoice) u.voice = koVoice; }
      u.rate = 1.05; u.pitch = 1;
      if (onDone){ u.onend = onDone; u.onerror = onDone; }
      _lastU = u;
      try { synth.resume(); } catch(_){}
      synth.speak(u);
    } catch(e){ if (onDone) onDone(); }
  }
  /* 🗺 (2026-08-15 사장님) 「메뉴 지도에 무엇이 들어 있는지 음성이 안 나온다」
     이 함수는 지금까지 «말하고 끝» 이었다. 그런데 메뉴 지도는 누르면 **다른 페이지로 옮겨 간다** —
     말을 시작해 놓고 페이지를 옮기면 그 순간 소리가 끊긴다(오디오 재생도, 브라우저 음성도).
     → «다 읽으면 알려 주는» 창구(onDone)를 연다. 부르는 쪽(adm-ia6)이 다 읽은 뒤에 페이지를 옮긴다.
     ⚠️ onDone 은 어떤 경우에도 «한 번은» 불려야 한다 — 소리가 안 나와도, 서버가 죽어도, 음성이
        꺼져 있어도 부른다. 안 그러면 「눌렀는데 아무 데도 안 가는」 화면이 된다(그게 더 나쁘다).
     ⚠️ 그래서 9초 안전장치를 둔다. 말이 길거나 브라우저가 onend 를 안 주는 경우가 실제로 있다. */
  function speak(text, onDone){
    var fired = false;
    var done = function(){ if (fired) return; fired = true; if (onDone){ try { onDone(); } catch(e){} } };
    if (!text || !isOn()){ done(); return false; }
    var mySeq = ++_seq, served = false;   // 연타 시 이전 안내 무효화
    try { synth.cancel(); } catch(_){}    // 진행 중이던 브라우저 폴백음성 중단
    try { if (audioEl) audioEl.pause(); } catch(_){}
    var a = ensureAudio();
    if (onDone) setTimeout(done, 9000);   // 안전장치 — 무슨 일이 있어도 여기서 넘어간다
    // 1순위: 무료 서버 기계음 — fetch→blob→play (AI 운영비서와 동일한 방식).
    //   ※ audio.src 에 URL 직접 스트리밍은 SW/Range 상호작용으로 일부 환경서 재생이 stall(무음) 됨.
    //     blob(URL.createObjectURL)로 재생하면 그 문제를 완전히 회피 → 확실히 소리남. 실브라우저 검증완료.
    try {
      fetch(FREE_TTS + '?q=' + encodeURIComponent(text.slice(0, 600)) + '&lang=' + (isEnUI() ? 'en' : 'ko'))
        .then(function(r){ if(!r.ok) throw new Error('tts '+r.status); return r.blob(); })
        .then(function(b){ if(mySeq!==_seq){ done(); return; } if(!b || b.size<200) throw new Error('empty'); served = true;
          if(!a){ _browserSpeak(text, done); return; }
          try { if(a.src && a.src.indexOf('blob:')===0) URL.revokeObjectURL(a.src); } catch(_){}
          a.src = URL.createObjectURL(b);
          a.onended = function(){ if (mySeq === _seq) done(); };
          a.onerror  = function(){ if (mySeq === _seq) done(); };
          var p = a.play(); if(p && p.catch) p.catch(function(){ if(mySeq===_seq) _browserSpeak(text, done); else done(); });
        })
        .catch(function(){ if(mySeq===_seq && !served) _browserSpeak(text, done); else done(); });   // 서버 실패 → 브라우저음성 폴백
    } catch(e){ _browserSpeak(text, done); }
    return true;
  }
  /* 다른 스크립트가 «읽고 나서 무언가 하기» 를 할 수 있게 최소한만 연다.
     반환값 true = 읽기 시작함(끝나면 onDone). false = 음성이 꺼져 있거나 읽을 말이 없음(onDone 은 이미 불렸다). */
  window.admVoiceSay = function(text, onDone){ prime(); return speak(text, onDone); };
  window.admVoiceIsOn = isOn;

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

    /* 🔴 (2026-08-08) 「수업 종료 / 연장」을 눌렀는데 «오늘의 수업»이라고 읽던 것 —
       「⚡ 자주 쓰는 기능」(ph161)은 ia6 가 카드를 감추는 문제 때문에 직접 스크롤하지 않고
       **해당 카드를 담당하는 ia6 사이드바 항목을 대신 눌러서** 맡긴다(adm-quick-access.js).
       그 «대신 누른» 클릭도 #ph85-sidebar 안이라 여기까지 올라오고, 우리는 그 항목의 이름을
       읽어 버렸다. 「수업 종료 / 연장」의 카드(card-active-rooms)를 담당하는 항목 이름이
       하필 「오늘의 수업」이라, 누른 것과 전혀 다른 이름이 들렸다.
       → 사람이 실제로 누른 클릭만 읽는다. 코드가 만든 클릭(isTrusted=false)은 읽지 않는다.
       ⚠️ 되돌리지 말 것 — 앞으로 어떤 위임이 생겨도 «남의 이름을 읽는» 사고가 재발한다. */
    if (e.isTrusted === false) return;

    prime();                                        // 첫 클릭에서 오디오 잠금해제

    /* ⚡ 자주 쓰는 기능 항목은 .ph85-sub 가 아니라서 지금까지 아무 안내도 없었다.
       (그리고 위임된 클릭이 엉뚱한 이름을 대신 읽고 있었다) → 자기 이름으로 안내한다. */
    var q = t.closest('.ph161-q');
    if (q) {
      var qlabel = clean(isEnUI() ? (q.getAttribute('data-en') || q.textContent)
                                  : (q.getAttribute('data-ko') || q.textContent));
      if (qlabel) speak(qlabel);
      return;
    }

    var sub = t.closest('.ph85-sub');   if (sub){ describeSub(sub); return; }
    var head = t.closest('.ph85-head');
    if (head){
      /* 🗺 「메뉴 지도」는 adm-ia6 가 «설명을 읽고 → 다 읽으면 지도를 여는» 순서로 직접 처리한다.
         여기서도 읽으면 두 번 말하게 되고, 나중 것이 앞의 것을 취소해 «말하다 끊기는» 소리가 난다. */
      if (head.getAttribute('data-ia6-head') === '__all') return;
      describeHead(head); return;
    }
  }, true);

  /* 🔊 켜기/끄기 토글 — 사이드바 «아래 도크»(🩺진단 · 🌐EN 옆)로 (2026-08-15 사장님)
     [왜 옮겼나] 「음성 켜짐과 꺼짐이 사이드바에서 이렇게 큰 자리를 차지 하지 않아도 될 것 같아」
       옛 자리는 메뉴 한 줄을 통째로 썼다(높이 48px). 실측: 사이드바 세로 1203 → 1157px 회수.
     [왜 도크인가] 조사해 보니 업계 관행이 둘로 갈린다 —
       «무엇을 어떻게 읽을지»는 설정 메뉴 깊숙이, «켜기/끄기 스위치»는 도구 줄의 작은 자리.
       (구글 접근성·안드로이드 Select to Speak·워드/엣지 «소리내어 읽기»·유튜브 자막 모두 이 형태)
       우리 도크에는 이미 🩺진단·🌐EN 이라는 «개인 설정» 무리가 있고, 스크롤과 무관하게 늘 바닥에
       붙어 있어 어디서든 한 번에 닿는다. 그래서 세 번째 칸으로 넣는다(도크 높이는 그대로).
     ⚠️ 아이콘만 두지 않는다. 「음성 켜짐/꺼짐」을 글자로 적는다 —
        컴퓨터가 익숙하지 않은 직원이 «지금 켜져 있나»를 한눈에 알아야 한다.
     ⚠️ 이모지(🔊/🔇) 대신 SVG 를 쓴다. 도크의 다른 칸(진단·EN)이 SVG 라 톤이 맞고,
        Win10 에서 이모지가 두부로 깨지는 함정(CLAUDE.md)도 피한다.
     ⚠️ id 는 ph85-voice-toggle 그대로 둔다 — 이 id 를 보는 곳이 셋 있다(위 클릭 핸들러의 제외 조건,
        adm-ia6 의 사이드바 순서 조정, admin-inline-c.css 의 옛 스타일). 이름을 바꾸면 그 셋이 조용히 끊긴다. */
  var SPK_ON  = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
              + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
              + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
              + '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var SPK_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
              + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
              + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>'
              + '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';

  /* 도크에 들어가면 옛 «가로 한 줄» 스타일(admin-inline-c.css)을 벗겨야 한다.
     그리고 칸을 2 → 3 으로 늘린다. 토글이 못 붙는 환경(음성 미지원 브라우저)에서는
     클래스가 안 붙으므로 도크는 예전처럼 2칸으로 남는다 — 빈 칸이 생기지 않는다. */
  function dockCss(){
    if (document.getElementById('ph162-voice-css')) return;
    var st = document.createElement('style');
    st.id = 'ph162-voice-css';
    st.textContent =
      '#ph162-dock.has-voice{grid-template-columns:1fr 1fr 1fr !important}' +
      '#ph162-dock #ph85-voice-toggle{width:auto !important;margin:0 !important;padding:8px 6px !important;' +
      '  font-size:11.5px !important;border-radius:9px !important;gap:5px !important;white-space:nowrap !important}' +
      '#ph162-dock #ph85-voice-toggle.off{opacity:.55}';
    document.head.appendChild(st);
  }

  function insertToggle(){
    var sb = document.getElementById('ph85-sidebar');
    if (!sb) return;
    var made = document.getElementById('ph85-voice-toggle');
    if (made) { placeToggle(made); return; }   // 이미 있으면 «자리만» 다시 잡는다(위 함정 참조)
    dockCss();
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'ph85-voice-toggle';
    function paint(){
      var on = isOn(), en = isEnUI();
      /* ⚠️ className 을 통째로 대입하지 않는다 — 도크에 붙을 때 얻은 .ph162-pill 이 지워져
         언어를 바꾸거나 한 번 누르는 순간 버튼 모양이 무너진다(옛 코드가 그랬다). */
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      // 마우스를 올리면 «누르면 어떻게 되는지» 를 알려 준다(상태만으로는 다음 동작을 모른다)
      btn.title = en ? (on ? 'Voice guide is on — click to turn off' : 'Voice guide is off — click to turn on')
                     : (on ? '음성 안내 켜짐 — 누르면 끕니다' : '음성 안내 꺼짐 — 누르면 켭니다');
      var label = en ? ('Voice ' + (on ? 'on' : 'off')) : ('음성 ' + (on ? '켜짐' : '꺼짐'));
      btn.innerHTML = (on ? SPK_ON : SPK_OFF) + '<span>' + label + '</span>';
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
    if (placeToggle(btn)) return;
    var anchor = sb.querySelector('.ph85-search-wrap') || sb.querySelector('.ph85-brand');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    else sb.insertBefore(btn, sb.firstChild);
  }

  /* 자리: 아래 도크의 «🩺진단 · 🌐EN» 다음, 계정 카드 «앞» = 첫 줄 세 번째 칸.
     🔴 (2026-08-15 실측으로 잡은 함정) 계정 카드(#ph115-user)는 **런타임에 #ph162-lang 바로 뒤로**
        끼어든다(admin.html 주석 참조). 그래서 «lang 다음»에 한 번 붙여 두면, 나중에 그 카드가
        우리 앞으로 들어와 버튼이 **셋째 줄로 밀린다** — 도크가 12px 높아지고 그만큼
        「메뉴 지도」가 도크에 가려졌다(실측: 지도 바닥 566 vs 도크 위 561).
     → 자리를 «한 번 붙이고 끝»이 아니라 **재시도마다 다시 잡는다.** 계정 카드가 이미 있으면 그 앞,
       아직 없으면 lang 다음. 어느 쪽이든 결과는 같은 자리(첫 줄 세 번째 칸)다.
     ⚠️ 도크가 없는 옛 화면에서는 false 를 돌려 옛 자리(검색줄 아래)로 되돌아간다. */
  function placeToggle(btn){
    var dock = document.getElementById('ph162-dock');
    var lang = document.getElementById('ph162-lang');
    if (!dock || !lang || lang.parentNode !== dock) return false;
    var user = document.getElementById('ph115-user');
    var ref = (user && user.parentNode === dock) ? user : lang.nextSibling;
    if (btn.parentNode !== dock || btn.nextSibling !== ref) dock.insertBefore(btn, ref);
    btn.classList.add('ph162-pill');          // 진단·EN 과 같은 모양으로
    dock.classList.add('has-voice');          // 도크를 2칸 → 3칸으로 (위 CSS)
    return true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertToggle);
  else insertToggle();
  setTimeout(insertToggle, 800);
  setTimeout(insertToggle, 2200);   // ph86 사이드바 보강(2000ms) 이후 재삽입 보장
})();

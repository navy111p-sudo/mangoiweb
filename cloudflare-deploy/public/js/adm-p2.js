// ═══════════════════════════════════════════════════════════════
// adm-p2.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  if(document.getElementById('mi-asst-panel')) return;

  // 🌐 현재 언어 (admin.html 의 window.adminLang 사용, 기본 ko)
  function curLang(){ try{ return (window.adminLang==='en')?'en':'ko'; }catch(e){ return 'ko'; } }
  function isEn(){ return curLang()==='en'; }
  function L(ko,en){ return isEn()?en:ko; }

  var st=document.createElement('style');
  st.textContent='@keyframes miAsstSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}'
    +'.mi-dot{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;background:#94a3b8;animation:miDot 1s infinite}'
    +'.mi-dot:nth-child(2){animation-delay:.15s}.mi-dot:nth-child(3){animation-delay:.3s}'
    +'@keyframes miDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}'
    +'#mi-asst-chips button:hover{background:rgba(99,102,241,.18)}'
    +'#mi-asst-fab:hover{transform:scale(1.06)}'
    +'.mi-nav-item{cursor:pointer;border-radius:8px;padding:3px 6px;margin:1px -6px;transition:background .15s ease}'
    +'.mi-nav-item:hover{background:rgba(99,102,241,.22)}'
    +'.mi-nav-item:after{content:" ↗";opacity:.55;font-size:11px}'+'.mi-kw{color:#93c5fd;cursor:pointer;border-bottom:1px dashed rgba(147,197,253,.6);font-weight:600}'+'.mi-kw:hover{color:#bfdbfe;background:rgba(99,102,241,.18);border-radius:4px}'
    +'@keyframes miAsstGlow{0%,100%{box-shadow:-2px 0 20px rgba(99,102,241,.7),-10px 0 52px rgba(56,189,248,.45),-12px 0 40px -12px rgba(0,0,0,.6)}50%{box-shadow:-3px 0 34px rgba(129,140,248,1),-18px 0 90px rgba(56,189,248,.9),-12px 0 40px -12px rgba(0,0,0,.6)}}'
    +'#mi-asst-ava{position:relative}'
    +'#mi-asst-ava .mi-ring{position:absolute;inset:-4px;border-radius:50%;background:conic-gradient(from 0deg,#fbbf24,#fff7c2,#f59e0b,#fff7c2,#fbbf24);filter:blur(3px);opacity:0;transition:opacity .25s;z-index:0;pointer-events:none}'
    +'#mi-asst-ava.mi-speaking .mi-ring{opacity:.95;animation:miAvaSpin 3s linear infinite}'
    +'@keyframes miAvaSpin{to{transform:rotate(360deg)}}'
    +'#mi-asst-face{position:relative;z-index:1;transition:box-shadow .2s ease}'
    +'#mi-asst-ava.mi-speaking #mi-asst-face{box-shadow:0 0 0 2px #fbbf24,0 0 18px 5px rgba(251,191,36,.6)!important}'
    +'.mi-asst-hbtn{width:34px;height:34px;border-radius:50%;border:1px solid rgba(148,163,184,.35);background:rgba(30,41,59,.85);color:#cbd5e1;font-size:15px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex:none}'
    +'.mi-asst-hbtn:hover{background:rgba(51,65,85,.95);color:#fff}'
    +'@media (prefers-reduced-motion:reduce){#mi-asst-ava.mi-speaking .mi-ring{animation:none}}'
    +'@media (prefers-reduced-motion:reduce){#mi-asst-panel{box-shadow:-3px 0 30px rgba(129,140,248,.95),-16px 0 80px rgba(56,189,248,.75),-12px 0 40px -12px rgba(0,0,0,.6) !important}}';
  document.head.appendChild(st);

  var box=document.createElement('div');
  box.innerHTML=''
   +'<div id="mi-asst-back" style="display:none;position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.5);backdrop-filter:blur(2px)"></div>'
   +'<aside id="mi-asst-panel" role="dialog" aria-label="AI Ops Assistant" style="display:none;position:fixed;top:0;right:0;z-index:9999;height:100vh;width:390px;max-width:94vw;background:#0f172a;border-left:2px solid rgba(129,140,248,.9);box-shadow:-3px 0 26px rgba(99,102,241,.85),-14px 0 70px rgba(56,189,248,.55),-12px 0 40px -12px rgba(0,0,0,.6);flex-direction:column;animation:miAsstSlide .28s ease both, miAsstGlow 2.6s ease-in-out .35s infinite">'
   +'  <div style="display:flex;align-items:center;gap:11px;padding:12px 14px;border-bottom:1px solid rgba(99,102,241,.18);background:linear-gradient(180deg,rgba(99,102,241,.14),rgba(15,23,42,0))">'
   +'    <div id="mi-asst-ava" style="width:60px;height:60px;flex:none">'
   +'      <div class="mi-ring"></div>'
   +'      <video id="mi-asst-face" src="/video/ai-ops-greeting.mp4" muted loop playsinline preload="auto" style="width:60px;height:60px;border-radius:50%;object-fit:cover;object-position:center 20%;border:2.5px solid #fbbf24;background:#0b1220;display:block"></video>'
   +'    </div>'
   +'    <div style="line-height:1.25;min-width:0;flex:1">'
   +'      <div id="mi-asst-title" style="font-weight:800;color:#e6ecff;font-size:15px"></div>'
   +'      <div id="mi-asst-status" style="font-size:11px;color:#34d399"></div>'
   +'    </div>'
   +'    <button id="mi-asst-voice" class="mi-asst-hbtn" type="button" title="음성 켜기/끄기" aria-label="음성 켜기/끄기">🔊</button>'
   +'    <button id="mi-asst-replay" class="mi-asst-hbtn" type="button" title="다시 듣기" aria-label="다시 듣기">🔁</button>'
   +'    <button id="mi-asst-close" aria-label="Close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:6px;flex:none">✕</button>'
   +'  </div>'
   +'  <div id="mi-asst-body" role="log" aria-live="polite" aria-label="AI Ops Assistant chat" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px"></div>'
   +'  <div id="mi-asst-chips" style="display:flex;gap:8px;overflow-x:auto;padding:0 14px 8px"></div>'
   +'  <form id="mi-asst-form" style="display:flex;gap:8px;padding:12px;border-top:1px solid rgba(99,102,241,.18)">'
   +'    <input id="mi-asst-input" autocomplete="off" style="flex:1;height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(99,102,241,.25);background:#0c1a3a;color:#e6ecff;outline:none;font-size:14px"/>'
   +'    <button type="submit" aria-label="Send" style="width:44px;height:44px;border:none;border-radius:12px;background:#2563eb;color:#fff;font-size:18px;cursor:pointer">➤</button>'
   +'  </form>'
   +'</aside>';
  document.body.appendChild(box);

  var panel=document.getElementById('mi-asst-panel'), back=document.getElementById('mi-asst-back'), body=document.getElementById('mi-asst-body');
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

  // === 🗣️ 말하는 원형 아바타: 답변을 음성(브라우저 TTS, 한국어)으로 읽고 영상으로 입 움직임 ===
  var face=document.getElementById('mi-asst-face');
  var ava=document.getElementById('mi-asst-ava');
  try{ if(face){ face.addEventListener('loadeddata',function(){ try{ face.pause(); face.currentTime=0.05; }catch(e){} }); face.addEventListener('error',function(){ if(ava)ava.style.opacity='0.85'; }); } }catch(e){}
  var voiceOn=true; try{ voiceOn=(localStorage.getItem('mi_asst_voice')!=='off'); }catch(e){}
  // 한국어 서버음성 — 같은 도메인 프록시(/api/ops-tts → 아바타 Worker /api/tts). 실패 시 브라우저 음성 폴백
  var TTS_URL='/api/ops-tts';
  var audioEl=new Audio(); audioEl.preload='auto';
  try{ audioEl.addEventListener('playing',function(){ mouthOn(); }); audioEl.addEventListener('ended',function(){ mouthOff(); }); audioEl.addEventListener('pause',function(){ mouthOff(); }); audioEl.addEventListener('error',function(){ mouthOff(); }); }catch(e){}
  // 첫 사용자 제스처에서 오디오/음성엔진 잠금해제 → 비동기 응답 뒤에도 소리가 남(무음 방지)
  var _primed=false;
  function primeVoice(){ if(_primed) return; _primed=true;
    try{ var p=audioEl.play(); if(p&&p.then)p.then(function(){ try{audioEl.pause();audioEl.currentTime=0;}catch(e){} }).catch(function(){}); }catch(e){}
    try{ if(window.speechSynthesis){ speechSynthesis.resume(); var w=new SpeechSynthesisUtterance(' '); w.volume=0; speechSynthesis.speak(w); } }catch(e){}
  }
  window.miAsstPrimeVoice=primeVoice;
  var koVoice=null,enVoice=null;
  // 🎀 관리자 비서는 항상 '여성' 목소리로. 폴백 브라우저 음성도 여성 한국어 음성을 우선 선택하고 남성 음성은 회피.
  function pickVoice(){ try{
    var vs=window.speechSynthesis?speechSynthesis.getVoices():[];
    var ko=vs.filter(function(v){return /ko/i.test(v.lang);});
    var FEMALE=/heami|sun\s*-?hi|sunhi|yuna|seoyeon|jiyoung|ji\s*-?won|jiwon|nara|kyuri|female|여성|woman|google\s*한국/i;
    var MALE=/in\s*-?joon|injoon|minsang|male|남성|man/i;
    koVoice = ko.filter(function(v){return FEMALE.test(v.name);})[0]
           || ko.filter(function(v){return !MALE.test(v.name);})[0]
           || ko[0] || null;
    enVoice=vs.filter(function(v){return /^en/i.test(v.lang);})[0]||null;
  }catch(e){} }
  if(window.speechSynthesis){ pickVoice(); try{ speechSynthesis.onvoiceschanged=pickVoice; }catch(e){} }
  function setStatus(speaking){ var s=document.getElementById('mi-asst-status'); if(!s)return; s.textContent= speaking ? L('🔊 말하는 중…','🔊 Speaking…') : L('● 온라인','● Online'); s.style.color= speaking ? '#fbbf24' : '#34d399'; }
  function mouthOn(){ if(ava)ava.classList.add('mi-speaking'); try{ if(face){ face.currentTime=0; var p=face.play(); if(p&&p.catch)p.catch(function(){}); } }catch(e){} setStatus(true); }
  function mouthOff(){ if(ava)ava.classList.remove('mi-speaking'); try{ if(face)face.pause(); }catch(e){} setStatus(false); }
  function stripText(html){ try{ var d=document.createElement('div'); d.innerHTML=String(html==null?'':html).replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' '); return (d.textContent||d.innerText||'').replace(/\s+/g,' ').trim(); }catch(e){ return ''; } }
  var lastSpoken='', _utts=[], speakSeq=0;
  // 브라우저 내장 음성(폴백) — Chrome 무음 버그 대비: 발화 객체 참조 유지(GC 방지) + resume
  function speakBrowser(text){
    if(!window.speechSynthesis){ mouthOn(); setTimeout(mouthOff, Math.min(8000,Math.max(1500,text.length*80))); return; }
    try{ speechSynthesis.resume(); }catch(e){}
    var u=new SpeechSynthesisUtterance(text.slice(0,600));
    if(/[가-힣]/.test(text)){ u.lang='ko-KR'; if(koVoice)u.voice=koVoice; u.rate=1.03; u.pitch=1.06; }
    else { u.lang='en-US'; if(enVoice)u.voice=enVoice; u.rate=1.0; u.pitch=1.0; }
    u.onstart=mouthOn; u.onend=function(){ mouthOff(); var i=_utts.indexOf(u); if(i>=0)_utts.splice(i,1); }; u.onerror=u.onend;
    _utts.push(u);
    try{ speechSynthesis.speak(u); }catch(e){ mouthOff(); }
  }
  function speak(html){
    var text=stripText(html); if(!text) return; lastSpoken=text;
    if(!voiceOn) return;
    var mySeq=++speakSeq, served=false;
    var isKo = /[가-힣]/.test(text);
    // 언어별 서버음성: 한국어=아바타 Typecast 여성(/api/ops-tts), 영어=Google 무료 영어음성(/api/tts-free?lang=en).
    //   → 영어 답변을 한국어 엔진으로 읽어 뭉개지던 문제 해결. 실패/지연/CORS 차단 시 브라우저 음성 폴백.
    var req = isKo
      ? fetch(TTS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,600)})})
      : fetch('/api/tts-free?lang=en&q='+encodeURIComponent(text.slice(0,600)));
    try{
      req
        .then(function(r){ if(!r.ok) throw new Error('tts '+r.status); return r.blob(); })
        .then(function(b){ if(mySeq!==speakSeq) return; if(!b||b.size<200) throw new Error('empty'); served=true;
          try{ if(audioEl.src&&audioEl.src.indexOf('blob:')===0){ URL.revokeObjectURL(audioEl.src); } }catch(e){}
          audioEl.src=URL.createObjectURL(b);
          var p=audioEl.play(); if(p&&p.catch)p.catch(function(){ if(mySeq===speakSeq) speakBrowser(text); });
        })
        .catch(function(){ if(mySeq===speakSeq && !served) speakBrowser(text); });
    }catch(e){ speakBrowser(text); }
  }
  function stopSpeak(){ speakSeq++; try{ if(window.speechSynthesis)speechSynthesis.cancel(); }catch(e){} try{ audioEl.pause(); }catch(e){} mouthOff(); }
  window.miAsstStopSpeak=stopSpeak;
  // 헤더 버튼: 음성 켜기/끄기 + 다시 듣기
  (function(){
    var vb=document.getElementById('mi-asst-voice'), rb=document.getElementById('mi-asst-replay');
    function syncVoiceBtn(){ if(vb){ vb.textContent= voiceOn?'🔊':'🔇'; vb.title= voiceOn?L('음성 끄기','Mute voice'):L('음성 켜기','Unmute voice'); } }
    syncVoiceBtn();
    if(vb) vb.onclick=function(){ voiceOn=!voiceOn; try{ localStorage.setItem('mi_asst_voice', voiceOn?'on':'off'); }catch(e){} if(!voiceOn) stopSpeak(); syncVoiceBtn(); };
    if(rb) rb.onclick=function(){ if(lastSpoken){ voiceOn=true; try{ localStorage.setItem('mi_asst_voice','on'); }catch(e){} syncVoiceBtn(); speak(lastSpoken); } };
  })();
  try{ document.addEventListener('visibilitychange', function(){ if(document.hidden) stopSpeak(); }); }catch(e){}

  // 🧭 메뉴/카드로 이동 — 패널 닫고 해당 카드 펼침+강조
  function goCard(id){
    close();
    setTimeout(function(){
      if(typeof jumpToMenu==='function'){ jumpToMenu(id); }
      else { var c=document.getElementById(id); if(c){ try{c.open=true;}catch(e){} c.scrollIntoView({behavior:'smooth',block:'start'}); } }
    },380);
  }
  window.miAsstGoCard=goCard;

  function bubble(role,html){
    var w=document.createElement('div');
    w.style.cssText='display:flex;'+(role==='me'?'justify-content:flex-end':'justify-content:flex-start');
    w.innerHTML=role==='me'
      ? '<div style="max-width:80%;padding:10px 13px;border-radius:14px 14px 4px 14px;background:#2563eb;color:#fff;font-size:13.5px;line-height:1.55">'+html+'</div>'
      : '<div style="display:flex;gap:8px;max-width:92%"><img src="/img/Mangoi_Character.png" alt="" style="width:30px;height:26px;object-fit:contain;flex:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))"><div class="mi-bubble-content" style="padding:10px 13px;border-radius:14px 14px 14px 4px;background:#1e293b;color:#e6ecff;font-size:13.5px;line-height:1.6">'+html+'</div></div>';
    body.appendChild(w); body.scrollTop=body.scrollHeight;
    try{ Array.prototype.forEach.call(w.querySelectorAll('.mi-nav-item,.mi-kw'),function(el){ el.onclick=function(){ var c=el.getAttribute('data-card'),u=el.getAttribute('data-url'),x=el.getAttribute('data-ext'); if(c){goCard(c);} else if(x){ try{window.open(x,'_blank','noopener');}catch(e){} } else if(u){ window.location.href=u; } }; }); }catch(e){}
    return w;
  }
  function typing(){ var w=bubble('ai','<span class="mi-dot"></span><span class="mi-dot"></span><span class="mi-dot"></span>'); w.id='mi-asst-typing'; return w; }
  function untype(){ var t=document.getElementById('mi-asst-typing'); if(t)t.remove(); }

  // 인사말/폴백 공용 — 클릭 시 해당 메뉴 카드로 이동하는 1·2·3 항목
  var GREET_NAV=[
    {ko:'✍️ AI 평가서·학습 리포트 초안', en:'✍️ AI evaluation / learning report draft', card:'card-ai-eval-draft'},
    {ko:'🚨 실시간 이상감지 대응',       en:'🚨 Real-time anomaly response',          card:'card-admin-alerts'},
    {ko:'💸 미납 알림·지점/강사 정산',    en:'💸 Overdue alerts · branch/teacher settlement', card:'card-auto-dunning'}
  ];
  function menuListHtml(){
    return GREET_NAV.map(function(it,i){
      return '<div class="mi-nav-item" data-card="'+it.card+'"><b>'+(i+1)+'.</b> '+(isEn()?it.en:it.ko)+'</div>';
    }).join('');
  }

  // 폴백 응답 (서버 AI 실패 시) — 한/영
  function FB(key){
    var T={
      eval:{ko:'알겠습니다 매니저님! 수업 음성(STT)과 키워드를 분석해 학부모용 피드백 초안을 만들었어요 ✍️<br><br><b>[잘한 점]</b> 일상 표현을 자신감 있게 구사했어요.<br><b>[보완할 점]</b> 과거시제(was/were)를 현재형과 혼동하는 경향이 있어요.<br><b>[다음 목표]</b> 과거시제 문장 10개 말하기로 정확도를 높여요.',
            en:'Got it! I analyzed the lesson audio (STT) and keywords and drafted parent feedback ✍️<br><br><b>[Strengths]</b> Used everyday expressions with confidence.<br><b>[To improve]</b> Tends to confuse past tense (was/were) with present.<br><b>[Next goal]</b> Practice 10 past-tense sentences to boost accuracy.'},
      alert:{ko:'이상 징후 대응을 도와드릴게요 🚨<br><br>• <b>GHOST 참관</b> — 조용히 입장해 확인<br>• <b>강사 귓속말</b> — 강사에게만 가이드<br>• 침묵 20초·네트워크 저하·금지어는 실시간 알림으로 잡혀요.',
             en:'I can help you respond to anomalies 🚨<br><br>• <b>GHOST observe</b> — join silently to check<br>• <b>Whisper to teacher</b> — guide the teacher only<br>• 20s silence, network drops and banned words trigger real-time alerts.'},
      settle:{ko:'정산·알림 업무 도와드릴게요 💸<br><br>• <b>미납 카톡</b> — D+1·D+3 자동 발송<br>• <b>지점 정산</b> — 본사 수수료 자동 계산<br>• <b>강사 급여</b> — 수업×단가, 환전 처리',
              en:'I can help with settlement & alerts 💸<br><br>• <b>Overdue KakaoTalk</b> — auto-send on D+1 / D+3<br>• <b>Branch settlement</b> — auto-calculate HQ fees<br>• <b>Teacher payroll</b> — sessions × rate, FX handling'},
      base:{ko:'무엇이든 도와드릴게요 매니저님! 아래 항목을 누르면 바로 이동해요 👇<br><br>'+menuListHtml()+'<br>또는 자유롭게 질문해 주세요!',
            en:'I can help with anything! Tap an item below to jump straight there 👇<br><br>'+menuListHtml()+'<br>Or just ask me anything!'}
    };
    return T[key][curLang()];
  }
  function fbKey(q){ if(/평가서|피드백|리포트|초안|eval|report|feedback|draft/i.test(q))return 'eval'; if(/이상|침묵|네트워크|고스트|참관|귓속말|감지|anomaly|alert|ghost|whisper|monitor/i.test(q))return 'alert'; if(/미납|수강료|정산|급여|알림톡|카톡|환전|overdue|unpaid|settle|payroll|salary/i.test(q))return 'settle'; return 'base'; }

  // 🔁 결정적 키워드 라우터 — 서버 AI 실패/뉴런 소진 시에도 올바른 메뉴로 이동 (무료·즉시·안정)
  var MI_ROUTES=[
    {re:/발음|스피킹|speaking|pronunc/i, external_url:'https://mangoi-speech.pages.dev/practice', ko:'발음 연습 도구를 새 탭에서 열어드릴게요.', en:'Opening the pronunciation practice tool in a new tab.'},
    {re:/연기|미루|미룸|변경|일정\s*변경|스케줄\s*변경|날짜\s*변경|시간\s*변경|reschedul|postpon/i, menu_id:'card-timetable', ko:'통합 시간표에서 수업을 연기·변경할 수 있어요.', en:'You can postpone or reschedule classes in the timetable.'},
    {re:/시간표|타임테이블|timetable/i, menu_id:'card-timetable', ko:'통합 시간표 카드로 이동할게요.', en:'Opening the timetable card.'},
    {re:/정기\s*결제|자동\s*결제|구독|recurring/i, menu_id:'card-recurring-billing', ko:'정기결제 자동화 카드로 이동할게요.', en:'Opening the recurring billing card.'},
    {re:/결제|수강료|학원비|등록비|납부|카드\s*결제|payment|tuition/i, menu_id:'card-payments-b2c', ko:'결제관리 카드로 이동할게요.', en:'Opening the payment management card.'},
    {re:/성적표|평가표|평가서|성적|점수|리포트\s*카드|report\s*card|grade|evaluation/i, menu_id:'card-eval-mgmt', ko:'학생 평가서(성적표) 카드로 이동할게요.', en:'Opening the student evaluation card.'},
    {re:/급여|월급|페이롤|payroll|salary/i, menu_id:'card-payroll', ko:'강사 급여 카드로 이동할게요.', en:'Opening the teacher payroll card.'},
    {re:/선생님|쌤|강사|teacher|tutor/i, menu_id:'card-teacher-mgmt', ko:'강사관리 카드에서 선생님 정보를 확인하세요.', en:'Opening the teacher management card.'},
    {re:/미납|독촉|연체|overdue|unpaid|dunning/i, menu_id:'card-auto-dunning', ko:'미납 자동 추적 카드로 이동할게요.', en:'Opening the overdue auto-tracking card.'},
    {re:/정산|settle/i, menu_id:'card-settlement-stats', ko:'정산통계 카드로 이동할게요.', en:'Opening the settlement stats card.'},
    {re:/회계|account/i, menu_id:'card-accounting-mgmt', ko:'회계관리 카드로 이동할게요.', en:'Opening the accounting card.'},
    {re:/출석|출결|attendance/i, menu_id:'card-class-attendance', ko:'출석현황 카드로 이동할게요.', en:'Opening the attendance card.'},
    {re:/레벨\s*테스트|레벨테스트|level\s*test/i, menu_id:'card-level-tests', ko:'레벨 테스트 카드로 이동할게요.', en:'Opening the level test card.'},
    {re:/수강\s*신청|수강신청|enroll/i, menu_id:'card-enrollments', ko:'수강신청 관리 카드로 이동할게요.', en:'Opening the enrollment card.'},
    {re:/복습\s*퀴즈|퀴즈|quiz/i, menu_id:'card-review-quiz', ko:'복습퀴즈 출제 카드로 이동할게요.', en:'Opening the review quiz card.'},
    {re:/숙제|homework/i, menu_id:'card-homework', ko:'숙제 관리 카드로 이동할게요.', en:'Opening the homework card.'},
    {re:/교재|textbook/i, menu_id:'card-textbooks', ko:'교재 콘텐츠 카드로 이동할게요.', en:'Opening the textbook content card.'},
    {re:/포인트|point/i, menu_id:'card-points-mgmt', ko:'포인트 관리 카드로 이동할게요.', en:'Opening the points card.'},
    {re:/배지|뱃지|badge/i, menu_id:'card-badges-mgmt', ko:'학생 배지 카드로 이동할게요.', en:'Opening the badges card.'},
    {re:/캘린더|휴가|공휴일|calendar|holiday/i, menu_id:'card-calendar', ko:'캘린더 관리 카드로 이동할게요.', en:'Opening the calendar card.'},
    {re:/상담\s*예약/i, menu_id:'card-counseling-booking', ko:'상담 예약 카드로 이동할게요.', en:'Opening the counseling booking card.'},
    {re:/신규\s*상담|상담|문의|inquiry|counsel/i, menu_id:'card-inquiry-mgmt', ko:'신규상담 카드로 이동할게요.', en:'Opening the new inquiry card.'},
    {re:/팝업|popup/i, menu_id:'card-popups-mgmt', ko:'공지/팝업 관리 카드로 이동할게요.', en:'Opening the notice/popup management card.'},
    {re:/공지|게시판|notice|board/i, menu_id:'card-notice-board', ko:'공지사항 게시판 카드로 이동할게요.', en:'Opening the notice board card.'},
    {re:/카카오|알림톡|kakao/i, menu_id:'card-kakao-mgmt', ko:'카카오 알림톡 카드로 이동할게요.', en:'Opening the KakaoTalk card.'},
    {re:/가맹점|franchise/i, menu_id:'card-franchises', ko:'가맹점 관리 카드로 이동할게요.', en:'Opening the franchises card.'},
    {re:/교육\s*센터|센터|center/i, menu_id:'card-centers', ko:'교육센터 카드로 이동할게요.', en:'Opening the education centers card.'},
    {re:/이상\s*감지|이상감지|알림\s*센터|모니터링|anomaly|alert|monitor/i, menu_id:'card-admin-alerts', ko:'실시간 알림 센터 카드로 이동할게요.', en:'Opening the real-time alert center card.'},
    {re:/랭킹|순위|ranking/i, menu_id:'card-rankings', ko:'학생 랭킹 카드로 이동할게요.', en:'Opening the rankings card.'},
    {re:/매출|차트|일자별|revenue|chart/i, menu_id:'card-daily-charts', ko:'일자별 차트 카드로 이동할게요.', en:'Opening the daily charts card.'},
    {re:/녹화|recording/i, menu_id:'card-recording-storage', ko:'녹화 관리 카드로 이동할게요.', en:'Opening the recording storage card.'},
    {re:/수업\s*일지|일지|lesson\s*log/i, menu_id:'card-lesson-log', ko:'수업 일지 카드로 이동할게요.', en:'Opening the lesson log card.'},
    {re:/학생\s*관리|학생관리|학생\s*목록|student\s*manage/i, url:'/admin/students.html', ko:'학생관리 페이지로 이동할게요.', en:'Opening the student management page.'},
    {re:/전체\s*학생\s*스케줄|전체학생\s*스케줄|전교생\s*스케줄|모든\s*학생\s*스케줄|전체\s*학생\s*일정|전체\s*스케줄|전체\s*일정|학원\s*전체|all\s*(student\s*)?schedule/i, url:'/admin/all-schedules.html', ko:'학원 전체 학생 스케줄 페이지로 이동할게요.', en:'Opening the academy-wide student schedule page.'},
    {re:/마이\s*페이지|마이페이지|내\s*정보|mypage|profile/i, url:'/admin/mypage.html', ko:'마이페이지로 이동할게요.', en:'Opening my page.'},
    {re:/단체\s*등록|단체등록|일괄\s*등록|대량\s*등록|bulk\s*regist/i, menu_id:'card-enrollments', ko:'수강신청 관리에서 일괄(단체) 등록을 할 수 있어요.', en:'You can bulk-register in the enrollment card.'},
    {re:/알림\s*큐|푸시\s*알림|알림\s*설정|알림/i, menu_id:'card-notifications', ko:'알림 큐 카드로 이동할게요.', en:'Opening the notifications card.'}
  ];
  function localRoute(q){
    var s=String(q||'');
    for(var i=0;i<MI_ROUTES.length;i++){ if(MI_ROUTES[i].re.test(s)) return MI_ROUTES[i]; }
    // 학생 이름 조회 — "정우영 학생", "홍길동 학생 열어줘" → 학생관리에서 해당 학생 검색
    var sm=s.match(/([가-힣]{2,4})\s*학생/);
    if(sm && !/관리|목록|랭킹|평가|성적|배지|출석|급여|이탈|전체|전학|전반/.test(s)){
      var nm=sm[1];
      return {url:'/admin/students.html?q='+encodeURIComponent(nm), ko:'"'+nm+'" 학생을 학생관리에서 검색할게요.', en:'Searching for student "'+nm+'".'};
    }
    return null;
  }
  // 네비게이션 실행 — menu_id(같은 페이지 카드) / external_url(새 탭) / url(이동). 성공 시 true
  function doNav(o){
    if(!o) return false;
    if(o.menu_id){
      // 🔐 강사 급여 접근 제어 — 역할별 안내/거절
      if((o.menu_id==='card-payroll'||o.menu_id==='card-payroll-auto') && typeof window.payrollAccess==='function'){
        var pa=window.payrollAccess(o.menu_id);
        if(!pa.ok){ bubble('ai', esc(pa.message)); try{speak(pa.message);}catch(e){} return true; }
        if(pa.ownOnly){
          bubble('ai', L('교사 본인 급여명세서로 안내할게요. (본인 것만 표시됩니다)','Opening your own payslip only.'));
        } else {
          bubble('ai', L('교사 급여에 대한 부분은 본사 관리자와 경영진만 볼 수 있습니다. 관리자·경영진이시면 강사 급여 카드로 안내해 드릴게요.','Teacher payroll is visible to HQ managers and executives only. Opening the payroll card for you.'));
        }
      }
      var card=document.getElementById(o.menu_id);
      if(card){ setTimeout(function(){ goCard(o.menu_id); },650); return true; }
      return false;
    }
    if(o.external_url){
      bubble('ai','🔗 <a href="'+esc(o.external_url)+'" target="_blank" rel="noopener" style="color:#93c5fd;font-weight:700">'+L('새 탭에서 열기','Open in new tab')+'</a> '+L('(자동으로 안 열리면 클릭)','(click if it does not open automatically)'));
      setTimeout(function(){ try{ window.open(o.external_url,'_blank','noopener'); }catch(e){} },300);
      return true;
    }
    if(o.url){ setTimeout(function(){ window.location.href=o.url; },650); return true; }
    return false;
  }

  // 🔗 AI 답변 속 메뉴 키워드를 클릭 가능한 링크로 변환 — 클릭 시 해당 메뉴로 이동
  //    MI_ROUTES 의 정규식을 재사용. HTML 태그(<br> 등)는 건드리지 않음.
  function linkify(html){
    try{
      if(!html) return html;
      var parts=String(html).split(/(<[^>]+>)/);
      for(var p=0;p<parts.length;p++){
        var seg=parts[p];
        if(!seg || seg.charAt(0)==='<') continue;
        var hits=[];
        for(var i=0;i<MI_ROUTES.length;i++){
          var r=MI_ROUTES[i];
          if(!r || (!r.menu_id && !r.url && !r.external_url)) continue;
          var re=new RegExp(r.re.source,'gi'), m;
          while((m=re.exec(seg))){ if(m[0]){ hits.push({s:m.index,e:m.index+m[0].length,route:r,pri:i}); } if(re.lastIndex===m.index){ re.lastIndex++; } }
        }
        if(!hits.length) continue;
        hits.sort(function(a,b){ return (a.s-b.s) || (a.pri-b.pri) || (b.e-a.e); });
        var chosen=[], lastEnd=-1;
        for(var h=0;h<hits.length;h++){ if(hits[h].s>=lastEnd){ chosen.push(hits[h]); lastEnd=hits[h].e; } }
        var out='', cur=0;
        for(var c=0;c<chosen.length;c++){
          var ch=chosen[c], rt=ch.route, attr='';
          if(rt.menu_id) attr='data-card="'+rt.menu_id+'"';
          else if(rt.external_url) attr='data-ext="'+esc(rt.external_url)+'"';
          else if(rt.url) attr='data-url="'+esc(rt.url)+'"';
          out+=seg.slice(cur,ch.s)+'<span class="mi-kw" '+attr+'>'+seg.slice(ch.s,ch.e)+'</span>';
          cur=ch.e;
        }
        out+=seg.slice(cur);
        parts[p]=out;
      }
      return parts.join('');
    }catch(e){ return html; }
  }

  // 🔐 급여 접근 권한 — /api/admin/me(쿠키 세션) 역할 기준. 본사 관리자/경영진=full, 교사=본인만, 그 외=거부
  var __miLogged=false, __miRole='', __miRoleP=null;
  function miEnsureRole(){
    if(__miRoleP) return __miRoleP;
    __miRoleP=fetch('/api/admin/me',{credentials:'include'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(j&&j.ok&&j.user){ __miLogged=true; __miRole=((j.user.role||j.user.role_key||j.user.type||j.user.grade||'')+'').toLowerCase(); }
    }).catch(function(){});
    return __miRoleP;
  }
  try{ miEnsureRole(); }catch(e){}
  function miSalaryGate(){
    if(!__miLogged) return 'guest';                                  // 로그인 안 됨
    var r=__miRole;
    if(/teacher|교사|강사|hq_teacher/.test(r)) return 'teacher';      // 교사 = 본인만
    if((/exec|mgr|admin|owner|ceo|cfo|hq_exec|hq_mgr|경영|관리|본사/.test(r)) && !/branch|agency|지사|대리/.test(r)) return 'admin';
    return 'denied';                                                 // 지사·대리점·기타 = 거부
  }

  // ════════ "열어 드릴까요?" 확인형 오픈 — 관리자·경영진 전용 ════════
  // 직전에 제안한 메뉴/대상을 보관했다가, 사용자가 '예/응/그래/좋아/오케이' 등으로 답하면 실제로 연다.
  var _miPending = null;
  function miIsYes(q){ return /^(응응?|ㅇㅇ|어|네|넵|예|옙|그래|그러자|그렇게|좋아|좋다|좋습니다|오케이|오키|콜|당연|열어|열어줘|보여|보여줘|해줘|부탁|이동|가자|가줘|그래요|좋아요|예스|yes|yeah|yep|ok|okay|sure|go|open)([\s\.!~요줘죠]|$)/i.test(String(q||'').trim()); }
  function miIsNo(q){ return /^(아니|아니요|아니오|아뇨|노|싫어|싫다|괜찮|관둬|취소|됐어|됐다|안열|nope|no|cancel|stop)([\s\.!~요]|$)/i.test(String(q||'').trim()); }

  // 질문에서 강사 이름 토큰 추출 (한글/영문 + 선생님·강사·쌤·교사·teacher)
  function miNameToken(q){
    var m=String(q||'').match(/([A-Za-z][A-Za-z .]{1,19}|[가-힣]{2,4})\s*(선생님|선생|쌤|강사|교사|teacher|tutor)/i);
    return m ? m[1].trim() : null;
  }
  // card-teacher-mgmt 강사목록에서 해당 이름 행을 찾아 스크롤+하이라이트
  function miHighlightTeacherRow(name){
    var tries=0, lc=String(name||'').toLowerCase();
    var iv=setInterval(function(){
      tries++;
      var body=document.getElementById('tp-list-body');
      if(body){
        var rows=body.querySelectorAll('tr'), hit=null;
        for(var i=0;i<rows.length;i++){ if((rows[i].textContent||'').toLowerCase().indexOf(lc)>=0){ hit=rows[i]; break; } }
        if(hit){ try{hit.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
          try{ var o=hit.style.background; hit.style.background='rgba(251,191,36,0.40)'; setTimeout(function(){hit.style.background=o;},2400); }catch(e){}
          clearInterval(iv); return; }
      }
      if(tries>14) clearInterval(iv);
    },220);
  }
  function miTeacherInfoTarget(name){
    return {
      label: name+' 선생님 정보', labelEn: "teacher "+name+"'s info",
      answerKo:'강사관리 카드의 강사 목록에서 '+name+' 선생님의 이름·연락처·그룹·활동지역·인사평가 등을 확인할 수 있어요.',
      answerEn:'In the Teacher Management card you can check '+name+"'s name, contact, group, region and HR score.",
      exec:function(){ goCard('card-teacher-mgmt'); miHighlightTeacherRow(name); }
    };
  }
  function miRouteLabel(r){
    var t=(r&&r.ko)||''; t=t.replace(/(으로|로)?\s*(이동할게요|이동할게요\.|안내해\s*드릴게요|열어드릴게요)\.?$/,'').trim();
    return t || '해당 메뉴';
  }
  // 질문 → 관리자 메뉴/대상 결정 (가능한 한 메뉴 안에서 찾는다)
  function miResolveTarget(q){
    var s=String(q||''), name=miNameToken(s);
    var otherIntent=/출결|출석|지각|결강|결석|급여|월급|평가|성적|정산|스케줄|시간표|수업|랭킹|순위|매출|녹화/i;
    // A) 강사 정보/프로필 (이름 + 정보성 키워드, 다른 의도 없음)
    if(name && /정보|프로필|연락처|전화|이력|소개|누구|어떤|상세|프로파일|info|profile|contact/i.test(s) && !otherIntent.test(s)){
      return miTeacherInfoTarget(name);
    }
    // B) 이름 + 선생님/강사 만 (다른 의도 없음) → 기본 강사 정보
    if(name && !otherIntent.test(s)){
      return miTeacherInfoTarget(name);
    }
    // C) 출결/출석 → 출석현황(수업당 출결) 딥링크 (강사명·보기모드 자동)
    if(/출결|출석|지각|결강|결석|attendance/i.test(s) && !/급여|월급|봉급|payroll|salary/i.test(s)){
      var lbl = name ? (name+' 강사 출석현황(수업당 출결)') : '출석현황(수업당 출결)';
      return {
        label:lbl, labelEn:(name? name+' class attendance' : 'class attendance'),
        answerKo:'강사의 수업당 출결(지각·결강·별점)은 출석현황 카드에서 확인할 수 있어요.',
        answerEn:'Per-class attendance (late/absent/penalty) is in the class attendance card.',
        exec:function(){ try{ if(window.caAttendanceFromQuery) window.caAttendanceFromQuery(s); }catch(e){}
          setTimeout(function(){ try{close();}catch(e){} var c=document.getElementById('card-class-attendance'); if(c){try{c.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){}} },900); }
      };
    }
    // D) 그 외 — MI_ROUTES(모든 관리자 카드/페이지) 매칭
    var r=localRoute(s);
    if(r){ return { label:miRouteLabel(r), labelEn:(r.en||miRouteLabel(r)), answerKo:(r.ko||''), answerEn:(r.en||''), exec:function(){ doNav(r); } }; }
    return null;
  }

  async function ask(q){
    try{ primeVoice(); }catch(e){}

    // ⓪ 직전 "열어 드릴까요?" 제안에 대한 응답 — 예/응/그래/좋아/오케이 → 실제로 연다 (관리자·경영진 전용)
    if(_miPending){
      if(miIsYes(q)){
        bubble('me',esc(q));
        var pend=_miPending; _miPending=null;
        var okMsg=L(pend.label+' 열어 드릴게요. 😊','Opening '+(pend.labelEn||pend.label)+'. 😊');
        bubble('ai', linkify(esc(okMsg))); speak(okMsg);
        try{ pend.exec(); }catch(e){}
        return;
      }
      if(miIsNo(q)){
        bubble('me',esc(q)); _miPending=null;
        var noMsg=L('네, 열지 않을게요. 다른 도움이 필요하시면 말씀해 주세요.','Okay, I won’t open it. Let me know if you need anything else.');
        bubble('ai', esc(noMsg)); speak(noMsg);
        return;
      }
      _miPending=null; // 그 외 입력은 새 질문으로 처리
    }

    // 🔐 '급여' 문의는 수강료가 아니라 급여 메뉴로. 본사 관리자·경영진만(로그인 시), 교사는 본인만, 그 외 거부.
    if(/급여|월급|봉급|페이롤|payroll|salary/i.test(q) && !/수강료|학원비|등록비|tuition/i.test(q)){
      bubble('me',esc(q));
      try{ await miEnsureRole(); }catch(e){}
      var gate=miSalaryGate();
      if(gate==='admin'){
        var ma=L('네, 관리자·경영진 확인됐습니다. 강사 급여 메뉴로 안내해 드릴게요. 😊','Confirmed (HQ admin/executive). Opening the teacher payroll menu. 😊');
        bubble('ai', linkify(esc(ma))); speak(ma); setTimeout(function(){ goCard('card-payroll'); }, 800);
      } else if(gate==='teacher'){
        var mt=L('교사님은 본인 급여만 조회하실 수 있어요. 마이페이지로 안내해 드릴게요.','Teachers can view only their own salary. Opening My Page.');
        bubble('ai', linkify(esc(mt))); speak(mt);
        setTimeout(function(){ try{ close(); }catch(e){} try{ window.location.href='/admin/mypage.html'; }catch(e){} }, 900);
      } else {
        var md=L('교사 급여는 본사 관리자와 경영진만 볼 수 있어요. 죄송합니다, 경영자와 관리자가 아니라서 열어드릴 수 없네요.','Teacher salary is for HQ admins/executives only. Sorry — I cannot open it because you are not an admin/executive.');
        bubble('ai', esc(md)); speak(md);
      }
      return;
    }

    // 📋 모든 질문을 관리자 메뉴 안에서 찾아 답하고, 마지막에 "○○ 열어 드릴까요?"로 제안 → 확인 시 오픈.
    //    이 확인형 오픈은 '관리자·경영진'(또는 역할 미확인)만. 교사·지사·대리점 등 식별된 비관리자는 제외.
    try{ await miEnsureRole(); }catch(e){}
    var _gate=miSalaryGate();
    if(_gate==='admin' || _gate==='guest'){
      var tgt=miResolveTarget(q);
      if(tgt){
        bubble('me',esc(q));
        var ans=(isEn()? tgt.answerEn : tgt.answerKo) || '';
        var offer=L(tgt.label+' 열어 드릴까요? (예/아니오)','Shall I open '+(tgt.labelEn||tgt.label)+'? (yes/no)');
        var full=ans ? (ans+'\n\n'+offer) : offer;
        bubble('ai', linkify(esc(full).replace(/\n/g,'<br>')));
        speak(full.replace(/\n+/g,' '));
        _miPending={ label:tgt.label, labelEn:tgt.labelEn, exec:tgt.exec };
        return;
      }
      // 매칭 실패 시에는 아래 서버 AI 경로로 진행
    }

    // (구) 직접-오픈 출결 인터셉트 — 확인형 오픈으로 대체됨. 비관리자/역할상이 시 보조 경로로만 유지.
    if(false && /출결|출석|지각|결강|결석|attendance/i.test(q) && !/급여|월급|봉급|payroll|salary/i.test(q)){
      bubble('me',esc(q));
      // 강사명이 안 보이고 '학생' 맥락이면 개별(학생) 출결로
      var hasStudentCtx = /학생/.test(q) && !/강사|선생|쌤|teacher|tutor/i.test(q);
      var info=null;
      if(window.caAttendanceFromQuery){ try{ info=await window.caAttendanceFromQuery(q); }catch(e){} }
      if(hasStudentCtx && (!info || !info.found)){
        var ms=L('학생 개별 출결 상태 카드로 이동했어요. 학생을 선택하면 자세히 볼 수 있어요.','Opened the per-student attendance status card. Pick a student to see details.');
        bubble('ai', linkify(esc(ms))); speak(ms);
        setTimeout(function(){ goCard('card-attendance-status'); }, 700);
        return;
      }
      var amsg;
      if(info && info.found){
        amsg=L(info.teacher+' 강사의 출석현황(수업당 출결)으로 이동했어요. '+info.modeLabel+' 보기로 보여드릴게요. 상단에서 기간도 바꿀 수 있어요.',
               'Opened the class attendance for teacher '+info.teacher+' ('+info.modeLabelEn+' view). You can change the period at the top.');
      } else if(info){
        amsg=L('출석현황(수업당 출결) 카드로 이동했어요'+(info.mode==='chart'?' (그래프 보기)':'')+'. 상단에서 강사·기간을 선택하면 자세히 볼 수 있어요.',
               'Opened the class attendance card'+(info.mode==='chart'?' (chart view)':'')+'. Pick a teacher and period at the top for details.');
      } else {
        amsg=L('출석현황(수업당 출결) 카드로 이동할게요.','Opening the class attendance card.');
        setTimeout(function(){ goCard('card-class-attendance'); }, 600);
      }
      bubble('ai', linkify(esc(amsg))); speak(amsg);
      setTimeout(function(){
        try{ close(); }catch(e){}
        var c=document.getElementById('card-class-attendance');
        if(c){ try{ c.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){}
          try{ var pv=c.style.boxShadow; c.style.boxShadow='0 0 0 3px rgba(168,85,247,0.6)'; setTimeout(function(){c.style.boxShadow=pv;},1600); }catch(e){} }
      }, 1300);
      return;
    }

    bubble('me',esc(q)); typing();
    var res=null;
    try{
      var r=await fetch('/api/admin/ai-command',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:q, lang:curLang()})});
      res=await r.json();
    }catch(e){ res=null; }
    untype();

    // 1) 서버 AI 정상 응답 — 답변 표시 + 네비게이션
    if(res && res.ok!==false && (res.answer || res.intent==='navigate')){
      if(res.answer){ bubble('ai', linkify(esc(res.answer).replace(/\n/g,'<br>'))); speak(res.answer); }
      if(res.intent==='navigate'){
        if(!doNav(res)){
          var alt=localRoute(q);
          if(!(alt && doNav(alt)) && res.menu_id){
            bubble('ai', L('⚠️ 해당 메뉴 카드를 찾지 못했어요: ','⚠️ Could not find that menu card: ')+esc(res.menu_id));
          }
        }
      }
      return;
    }

    // 2) 서버 실패/빈 응답 — 결정적 키워드 라우터로 폴백 (질문에 맞는 메뉴로 이동)
    var lr=localRoute(q);
    if(lr){ var lrTxt=isEn()?lr.en:lr.ko; bubble('ai', linkify(esc(lrTxt))); speak(lrTxt); doNav(lr); return; }

    // 3) 그래도 못 찾으면 기존 도메인별 안내 폴백
    var fb=FB(fbKey(q)); bubble('ai', fb); speak(fb);
  }
  window.miAsstAsk=ask;

  function greetHtml(){
    var head=L('안녕하세요 매니저님! 저는 망고아이 <b>AI 운영 비서</b>예요','Hello, manager! I am the Mangoi <b>AI Ops Assistant</b>');
    var sub=L('평가서 작성·실시간 이상감지 대응·정산/알림까지 도와드릴게요.<br>아래 항목을 누르면 바로 해당 메뉴로 이동해요 👇','I help with evaluations, real-time anomaly response, settlement & alerts.<br>Tap an item below to jump straight to that menu 👇');
    return head+' <img src="/img/Mangoi_Character.png" alt="" style="width:20px;height:17px;object-fit:contain;display:inline-block;vertical-align:-3px"><br>'+sub+'<br><br>'+menuListHtml();
  }
  function wireGreet(w){
    if(!w) return;
    Array.prototype.forEach.call(w.querySelectorAll('.mi-nav-item'),function(el){
      el.onclick=function(){ goCard(el.getAttribute('data-card')); };
    });
  }

  var CHIPS_KO=['이번 주 평가서 초안 써줘','지금 이상감지 현황은?','이번 달 매출 보여줘','복습퀴즈 출제 열어줘'];
  var CHIPS_EN=['Draft this week’s evaluation','Any anomalies right now?','Show this month’s revenue','Open the review quiz builder'];

  var inited=false, greetBubble=null;
  function renderChips(){
    var ch=document.getElementById('mi-asst-chips');
    var chips=isEn()?CHIPS_EN:CHIPS_KO;
    ch.innerHTML=chips.map(function(c){return '<button type="button" style="flex:none;white-space:nowrap;font-size:12px;padding:7px 12px;border-radius:9999px;border:1px solid rgba(99,102,241,.25);background:#0c1a3a;color:#cbd5e1;cursor:pointer">'+esc(c)+'</button>';}).join('');
    Array.prototype.forEach.call(ch.querySelectorAll('button'),function(b){ b.onclick=function(){ ask(b.textContent); }; });
  }
  function applyStaticLang(){
    document.getElementById('mi-asst-title').textContent=L('AI 운영 비서','AI Ops Assistant');
    document.getElementById('mi-asst-status').textContent=L('● 온라인','● Online');
    document.getElementById('mi-asst-input').placeholder=L('무엇이든 물어보세요…','Ask me anything…');
  }
  function boot(){
    applyStaticLang();
    if(inited){ return; } inited=true;
    greetBubble=bubble('ai', greetHtml()); wireGreet(greetBubble);
    renderChips();
  }
  var _greeted=false;
  function open(){
    try{ primeVoice(); }catch(e){}
    boot(); panel.style.display='flex'; back.style.display='block';
    if(!_greeted){ _greeted=true; setTimeout(function(){ try{ speak(L('안녕하세요 매니저님! 무엇이든 물어보세요.','Hello manager! Ask me anything.')); }catch(e){} }, 450); }
  }
  function close(){ stopSpeak(); panel.style.display='none'; back.style.display='none'; }
  // 🚫 (2026-06-18) 옛 커스텀 패널(#mi-asst-panel)을 전역 런처에 연결하지 않음.
  //    예전: 이 줄(window.miAsstOpen=open)이 페이지 위쪽에서 먼저 실행돼, 거대한 admin.html 이
  //    끝까지 로드되기 전(특히 모바일)에 FAB 를 누르면 '옛 비서'가 떴다가, 아래쪽 38xxx 줄의
  //    window.miAsstOpen=openAv(현재 아바타 iframe)로 덮어써지며 '현재 비서'로 바뀌는 깜빡임 발생.
  //    → 옛 패널은 절대 열지 않고 항상 현재 아바타 iframe(miOpsAvatarOpen)으로 위임. 준비 전이면 안내만.
  window.miAsstOpen=function(){
    if(window.miOpsAvatarOpen){ window.miOpsAvatarOpen(); }
    else { try{ alert('AI 운영비서를 불러오는 중입니다. 잠시 후 다시 눌러주세요.'); }catch(e){} }
  };
  document.getElementById('mi-asst-close').onclick=close;
  back.onclick=close;
  document.getElementById('mi-asst-form').addEventListener('submit',function(e){ e.preventDefault(); var v=document.getElementById('mi-asst-input').value.trim(); if(!v)return; ask(v); document.getElementById('mi-asst-input').value=''; });

  // 언어 토글 시 정적 텍스트·칩·인사말 즉시 갱신
  function onLangChange(){
    applyStaticLang();
    if(inited){
      renderChips();
      if(greetBubble){ var gc=greetBubble.querySelector('.mi-bubble-content'); if(gc){ gc.innerHTML=greetHtml(); } wireGreet(greetBubble); }
    }
  }
  try{ document.addEventListener('mangoi:lang-changed', onLangChange); }catch(e){}
  try{ window.addEventListener('mangoi:lang-changed', onLangChange); }catch(e){}

  applyStaticLang();
})();

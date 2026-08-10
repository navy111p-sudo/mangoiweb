// idx-vc-textbook.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

/* ★ (2026-07-14) 수업 첫 화면 기본 콘텐츠 = 당일 교재(교재/PDF 탭).
   사장님 요청: 모든 수업 처음에 얼굴(위) + 당일 교재(아래 크게)가 보이게.
   ★ (2026-07-16) 추가: 동영상이 아니라 '학생에 맞는 교재'가 자동으로 뜨게.
   - 입장 시 로그인 학생의 배정 교재(students_erp.textbook)를 /api/warmup/context 로 조회
     → /api/textbook-files 로 그 교재 파일을 불러와 뷰어에 표시 + 방에 공유(양쪽 동일 화면).
   - 방에 이미 '실제로 공유된' 교재/동영상이 있으면(교사가 의도적으로 튼 것) 그대로 존중.
   - 교재를 못 찾으면(계정에 미배정/이름 불일치) 최소한 빈 교재 탭으로 전환(라이브러리에서 선택 가능). */

// 📚 교재명(라이브러리 book)으로 파일을 불러와 뷰어에 표시 + 방에 공유 (성공=true)
window._vcLoadTextbookByName = async function(book){
  book = String(book || '').trim();
  if (!book) return false;
  var items = [];
  try { var rf = await fetch('/api/textbook-files?book=' + encodeURIComponent(book) + '&limit=20000', { cache:'no-store' }); var d = await rf.json(); items = (d && d.items) || []; } catch(e){ return false; }
  var cmp = function(a,b){ return String(a||'').localeCompare(String(b||''), undefined, { numeric:true, sensitivity:'base' }); };
  var parsed = [];
  items.forEach(function(it){
    if (it.kind !== 'image' && it.kind !== 'pdf') return;
    var lesson = '미분류', fileName = it.name || '';
    var mm = String(it.name || '').match(/^\[([^\]]+)\]\s*(.*)$/);
    if (mm){ var rest = mm[2] || ''; var slash = rest.indexOf('/'); if (slash >= 0){ lesson = rest.slice(0, slash).trim() || '미분류'; fileName = rest.slice(slash + 1).trim() || it.name; } else fileName = rest.trim() || it.name; }
    parsed.push({ id: it.id, url: it.url, kind: it.kind, lesson: lesson, file: fileName, name: it.name });
  });
  parsed.sort(function(a,b){ return cmp(a.lesson, b.lesson) || cmp(a.file, b.file); });
  var seq = parsed.map(function(x){ return { id: 'srv_' + x.id, url: x.url, kind: x.kind, name: x.name }; });
  if (!seq.length) return false;
  window._libSequence = seq; window._libSeqIdx = 0;               // ◀▶ 페이지 화살표도 동작하게
  try { if (typeof window.vcSwitchTab === 'function') window.vcSwitchTab('pdf'); } catch(e){}
  var f = seq[0];
  await Promise.resolve(window.pdfLoad ? window.pdfLoad(f.url, f.kind) : null);
  try { window._vcShownPdfName = f.name; } catch(e){}
  // 방에 공유 → 교사·학생 모두 같은 교재를 봄
  //   ★ (2026-07-20) 입장 직후엔 WS(vcConn)가 아직 안 열려 있을 수 있음 → 조용히(quiet) 몇 번 재시도.
  //     그 사이 다른 참가자의 공유가 도착하면(_vcShownPdfKey 가 내 것과 달라짐) 재시도 중단.
  try {
    var _myKey = ((f.url && f.url.charAt(0)==='/') ? location.origin + f.url : f.url) + '|1';
    (function _tryShare(n){
      try {
        if (window._vcShownPdfKey && window._vcShownPdfKey !== _myKey) return;   // 남의 공유가 이미 적용됨
        var ok = (typeof window.vcShareTextbook === 'function') && window.vcShareTextbook('lib_' + f.id, f.url, f.kind, f.name, true);
        if (!ok && n > 0 && document.body.classList.contains('vc-in-call')) setTimeout(function(){ _tryShare(n - 1); }, 700);
      } catch(e){}
    })(8);
  } catch(e){}
  try { if (typeof window._pdfToast === 'function') window._pdfToast('📚 ' + book); } catch(e){}
  return true;
};

// 🎓 입장 시: 로그인 학생의 배정 교재를 자동 로드. 배정 없으면 기본 교재로 폴백. (성공=true)
window.vcAutoLoadStudentTextbook = async function(){
  try {
    // 이미 방에 '실제 공유된' 교재/동영상이 있으면 존중 (덮어쓰지 않음)
    //   _vcShownPdfKey 는 공유 수신 즉시(로드 완료 전) 기록되므로 함께 확인 — 레이스 방지
    if (window._vcShownPdfKey || window._vcShownPdfUrl || window._vcShownVideoUrl) return false;
    // 현재 로그인 uid (mangoi_logged_user = {uid,name}; mango_user 폴백)
    var uid = '';
    try { var lu = JSON.parse(localStorage.getItem('mangoi_logged_user')||'null'); if (lu && (lu.uid||lu.user_id)) uid = lu.uid||lu.user_id; } catch(e){}
    if (!uid) { try { var mu = JSON.parse(localStorage.getItem('mango_user')||'null'); if (mu && (mu.uid||mu.user_id)) uid = mu.uid||mu.user_id; } catch(e){} }
    // ① 배정 교재/레벨 조회 (students_erp.textbook — 배정되면 자동으로 개인 교재 우선)
    var book = '';
    if (uid) {
      try {
        var rc = await fetch('/api/warmup/context?user_id=' + encodeURIComponent(uid), { cache:'no-store' });
        var ctx = await rc.json();
        if (ctx && ctx.ok) {
          book = String(ctx.textbook || '').trim();
          if (ctx.level) { try { localStorage.setItem('mangoi_current_level', String(ctx.level)); } catch(e){} }  // 웜업·복습퀴즈도 이 레벨 사용
        }
      } catch(e){}
    }
    // ② 배정 교재가 없으면 기본 교재로 폴백 (관리자가 localStorage.mangoi_default_textbook 로 변경 가능)
    if (!book) { try { book = (localStorage.getItem('mangoi_default_textbook') || '').trim(); } catch(e){} if (!book) book = 'Mangoi Books'; }
    return await window._vcLoadTextbookByName(book);
  } catch(e){ try { console.warn('[vcAutoLoadStudentTextbook]', e); } catch(_){}; return false; }
};

/* ★★ (2026-08-06 사장님 지시) 수업 첫 화면 규칙이 바뀌었다.
   ─────────────────────────────────────────────────────────────────────────────
   [신고] "나갔다 들어오니까 교재가 다른 게 보여."
   [원인] 두 겹이었다.
     ① 서버(DO)가 «방이 0명이 되면» 공유 교재 상태를 지웠다. 방이 비는 가장 흔한
        이유는 수업 종료가 아니라 새로고침·순단이다 → 재입장하면 방에 교재가 없다.
     ② 그 빈자리를 클라이언트가 «학생 배정 교재»(students_erp.textbook, 없으면
        'Mangoi Books')로 채우고 방에 공유까지 했다. 강사 계정으로 입장하면 배정이
        없으니 항상 'Mangoi Books' 를 띄워 강사가 보던 교재를 덮어썼다.
        = 들어올 때마다 '다른 교재'.
   [지시] 수업에 들어가면 «강사가 올린 교재»만 보인다. 없으면 아무 것도 추측해서
          띄우지 말고 미스터망고와 함께 "잠시만 기다려 주세요 / Please wait" 만.
   [처리] ① 서버: 방이 비어도 공유 상태 보존(3시간) → 재입장 = 그 교재 그 페이지.
          ② 여기: 배정 교재 자동 로드·자동 공유를 «하지 않는다». 대신 대기 카드.
   ※ window._vcLoadTextbookByName / vcAutoLoadStudentTextbook 은 지우지 않았다.
     라이브러리·콘솔에서 수동으로 부르는 용도로만 남긴다(자동 호출 없음). */
(function(){
  var _did = false, _el = null, _timer = null;

  function card(){ return _el || (_el = document.getElementById('vc-wait-card')); }

  // 교재/영상이 실제로 화면에 있나? — pdfLoad 는 어떤 경로(공유·라이브러리·로컬 업로드)로
  //   열려도 _vcCurrentPdfUrl 을 남긴다. 공유 수신 직후(로드 완료 전)는 _vcShownPdfKey 로 잡는다.
  function hasContent(){
    try {
      if (window._vcCurrentPdfUrl) return true;
      if (window._vcShownPdfKey || window._vcShownPdfUrl) return true;
      if (window._vcShownVideoUrl) return true;
    } catch(e){}
    return false;
  }

  window.vcWaitCardSync = function(){
    try {
      var c = card(); if (!c) return;
      var inCall = document.body.classList.contains('vc-in-call');
      var pdfTab = document.getElementById('tab-pdf');
      var onPdf  = !!(pdfTab && pdfTab.classList.contains('active'));
      var show   = inCall && onPdf && !hasContent() && !window._vcObserverMode;
      c.style.display = show ? 'flex' : 'none';
      if (show) {
        // 강사·관리자에겐 '기다리라'가 아니라 '고르라'가 맞는 안내다.
        var sub = document.getElementById('vc-wait-sub');
        var isT = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
        var ko = isT ? '📚 라이브러리에서 교재를 선택하세요 · Pick a textbook from the Library'
                     : '선생님이 교재를 여는 중이에요 · Your teacher is opening the textbook';
        var en = isT ? '📚 Pick a textbook from the Library · 라이브러리에서 교재를 선택하세요'
                     : 'Your teacher is opening the textbook · 선생님이 교재를 여는 중이에요';
        if (sub && sub.getAttribute('data-ko') !== ko) {
          sub.setAttribute('data-ko', ko); sub.setAttribute('data-en', en);
          // 공통 언어 키는 mangoi_lang (mango_lang 은 구버전) — CLAUDE.md 함정표
          var lg = ''; try { lg = String(localStorage.getItem('mangoi_lang') || '').toLowerCase(); } catch(e2){}
          sub.textContent = (lg.indexOf('en') === 0) ? en : ko;
        }
      }
    } catch(e){}
  };

  function onEnterCall(){
    if (_did) return;
    _did = true;
    // 지난 수업의 잔상으로 대기 카드가 안 뜨는 일이 없게, 표시 상태를 입장 시 한 번 비운다.
    //   (vcStartPdfPoll 이 _vcShownPdf* 를 비우는 것과 같은 이유 — _vcCurrentPdfUrl 은 그동안 안 비웠다)
    try { window._vcCurrentPdfUrl = ''; window._vcCurrentPdfKind = ''; } catch(e){}
    /* 🖍 (2026-08-08) 칠판 획 기록도 새 수업에서 비운다 — 기록이 생기면서 «지난 수업 판서가
       다음 수업 첫 화면에 남는» 새 경로가 열렸다. 교재(_vcCurrentPdfUrl)와 같은 자리에서 비운다. */
    try { if (typeof wbReceiveClear === 'function') wbReceiveClear(); } catch(e){}
    // 첫 화면은 교재 탭. 교재는 강사 공유(pdf-sync / room-media 폴링)로만 채워진다.
    try { window.vcSwitchTab && window.vcSwitchTab('pdf'); } catch(e){}
    window.vcWaitCardSync();
  }

  try {
    new MutationObserver(function(){
      if (document.body.classList.contains('vc-in-call')) setTimeout(onEnterCall, 350);
      else {
        _did = false;                                   // 통화 종료 → 다음 수업 위해 리셋
        try { var c = card(); if (c) c.style.display = 'none'; } catch(e){}
      }
    }).observe(document.body, { attributes:true, attributeFilter:['class'] });
  } catch(e){}

  // 교재가 도착하면(공유 수신·라이브러리 선택·업로드) 카드는 즉시 사라져야 한다.
  //   경로가 여러 갈래(WS·폴링·로컬)라 각 지점에 훅을 박는 대신 가벼운 감시 한 줄로 통일.
  try { _timer = setInterval(function(){ window.vcWaitCardSync(); }, 600); } catch(e){}
})();

/* ★ (2026-07-14 사장님) 모바일 가로 입장 기본 = 1/2(half).
   세로는 phero IIFE(maybeDefault)가 담당, 가로는 여기서 — 모드 미지정일 때 한 번만 적용.
   사용자가 이미 고른 모드(클래스 존재)는 절대 건드리지 않음. */
(function(){
  var MODES = ['video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo','video-facepip','video-free'];
  function isMobLand(){
    try {
      return matchMedia('(max-width:1024px) and (orientation:landscape)').matches
          || matchMedia('(max-height:600px) and (orientation:landscape)').matches;
    } catch(e){ return false; }
  }
  function apply(){
    try {
      if (!document.body.classList.contains('vc-in-call') || !isMobLand()) return;
      var r = document.querySelector('.vc-main-row');
      if (!r || typeof window.vcScreenSet !== 'function') return;
      var has = MODES.some(function(c){ return r.classList.contains(c); });
      if (!has) window.vcScreenSet('half');
    } catch(e){}
  }
  try {
    new MutationObserver(function(){
      if (document.body.classList.contains('vc-in-call')) setTimeout(apply, 700);
    }).observe(document.body, { attributes:true, attributeFilter:['class'] });
  } catch(e){}
  window.addEventListener('orientationchange', function(){ setTimeout(apply, 500); });
})();


// idx-vc-chat.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  'use strict';

  var KEY      = 'mangoi_vc_chat_tr';     // '' | 'en' | 'zh'
  var BTN_ID   = 'vc-tr-btn';
  var MENU_ID  = 'vc-tr-menu';
  var busy     = false;
  var seq      = 0;                       // 말풍선 표식 번호 (innerHTML 재생성에도 살아남는 유일한 끈)
  var lastSent = null;                    // { translated, original } — 내 말풍선에 원문을 붙이려고 기억

  function isKo(){
    try {
      if (typeof window.getLang === 'function') return window.getLang() !== 'en';
      return (localStorage.getItem('mangoi_lang') || 'ko') !== 'en';
    } catch(e){ return true; }
  }
  function hasHangul(s){ return /[가-힣ᄀ-ᇿ]/.test(s || ''); }
  function hasHan(s){ return /[一-鿿]/.test(s || ''); }

  /** 글의 언어 — 한글이 있으면 ko, 한자만 있으면 zh, 나머지 en.
      ⚠️ 한글 검사가 먼저다. 순서를 바꾸면 한자 섞인 한국어가 중국어로 잡힌다. */
  function langOf(s){ return hasHangul(s) ? 'ko' : (hasHan(s) ? 'zh' : 'en'); }

  /** 내 언어 — 처음엔 화면 언어로 잡고, 내가 글을 보낼 때마다 원문 언어로 고친다.
      쓰임새 둘: ① 메뉴에서 내 언어를 뺀다 ② 받은 글을 이 언어로 바꿔 보여준다.
      (화상수업 UI 는 한국어·영어 두 벌뿐이라 중국어 강사는 처음엔 영어로 잡히고,
       한 마디만 중국어로 치면 곧바로 중국어로 바뀐다) */
  var myLang = (function(){
    try { return (localStorage.getItem('mangoi_lang') === 'en') ? 'en' : 'ko'; } catch(e){ return 'ko'; }
  })();

  function target(){
    try { var v = localStorage.getItem(KEY) || ''; return (v === 'en' || v === 'zh' || v === 'ko') ? v : ''; }
    catch(e){ return ''; }
  }

  /** 받은 글은 '내 언어'로 바꿔서 보여준다 */
  function readTarget(){ return target() ? myLang : ''; }

  /** 내 언어가 바뀌면(중국어 강사가 중국어로 치기 시작 등) 메뉴와 선택을 따라 고친다 */
  function setMyLang(l){
    if (!l || l === myLang) return;
    myLang = l;
    if (target() === myLang) setTarget('');   // 내 언어로 번역할 일은 없다 → 끔
    else paintBtn();
  }

  /** 이미 그 언어면 번역하지 않는다(서버도 거르지만 왕복 자체를 아낀다) */
  function needsTr(text, tgt){
    if (!text || !tgt) return false;
    return langOf(text) !== tgt;
  }
  function setTarget(v){
    try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch(e){}
    paintBtn();
  }
  var NAME_KO = { ko: '한국어', en: '영어', zh: '중국어' };
  var NAME_EN = { ko: 'Korean 한국어', en: 'English', zh: 'Chinese 中文' };
  var SHORT   = { ko: 'KO', en: 'EN', zh: 'ZH' };

  function label(){
    var t = target();
    if (!t) return '🌐 ' + (isKo() ? '번역' : 'Off');
    return '🌐 ' + (isKo() ? NAME_KO[t] : SHORT[t]);
  }
  function paintBtn(){
    var b = document.getElementById(BTN_ID);
    if (!b) return;
    b.textContent = label();
    var on = !!target();
    b.style.background = on ? 'rgba(251,191,36,0.18)' : 'rgba(148,163,184,0.12)';
    b.style.borderColor = on ? 'rgba(251,191,36,0.55)' : 'rgba(148,163,184,0.28)';
    b.style.color = on ? '#fbbf24' : '#94a3b8';
  }

  /** 서버 번역. 실패하면 원문을 그대로 돌려준다(절대 빈 값 아님). */
  function translate(texts, tgt){
    return fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // mode:'chat' — 서버가 번역모델(m2m100) 대신 언어모델을 쓴다.
      //   m2m100 은 '숙제'를 job·집안일로 옮겨 수업 대화에서 오해가 났다.
      body: JSON.stringify({ texts: texts, target: tgt, mode: 'chat' })
    }).then(function(r){ return r.json(); }).then(function(d){
      return (d && d.ok && d.map) ? d.map : {};
    }).catch(function(){ return {}; });
  }

  // ── 언어 고르는 작은 메뉴 ──────────────────────────────────────────
  function closeMenu(){
    var m = document.getElementById(MENU_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function openMenu(anchor){
    if (document.getElementById(MENU_ID)) { closeMenu(); return; }
    var ko = isKo();
    var m = document.createElement('div');
    m.id = MENU_ID;
    m.style.cssText = 'position:fixed;z-index:2147483000;background:#131826;border:1px solid #2b3450;' +
                      'border-radius:10px;padding:5px;box-shadow:0 12px 32px rgba(0,0,0,.5);' +
                      'display:flex;flex-direction:column;gap:3px;min-width:150px';
    /* 내 언어를 뺀 나머지 둘만 보여준다 (사장님 지시)
         한국어 → 영어 / 중국어      영어 → 한국어 / 중국어      중국어 → 한국어 / 영어 */
    var items = ['ko', 'en', 'zh']
      .filter(function(l){ return l !== myLang; })
      .map(function(l){ return [l, ko ? NAME_KO[l] + (l === 'zh' ? ' (中文)' : (l === 'en' ? ' (English)' : '')) : NAME_EN[l]]; });
    items.push(['', ko ? '번역 끄기' : 'Turn off']);
    items.forEach(function(pair){
      var v = pair[0], txt = pair[1];
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = (target() === v ? '● ' : '   ') + txt;
      b.style.cssText = 'text-align:left;padding:9px 11px;border-radius:7px;border:0;cursor:pointer;' +
                        'font-size:13px;font-weight:700;white-space:nowrap;' +
                        'background:' + (target() === v ? 'rgba(251,191,36,0.16)' : 'transparent') + ';' +
                        'color:' + (target() === v ? '#fbbf24' : '#cbd5e1') + ';';
      b.addEventListener('mouseenter', function(){ if (target() !== v) b.style.background = 'rgba(148,163,184,0.12)'; });
      b.addEventListener('mouseleave', function(){ if (target() !== v) b.style.background = 'transparent'; });
      b.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        setTarget(v);
        closeMenu();
        try { document.getElementById('vc-chat-input').focus(); } catch(_){}
      });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    // 버튼 바로 위에 띄운다. 화면 밖으로 나가지 않게 좌우를 물린다.
    try {
      var r = anchor.getBoundingClientRect();
      var w = m.offsetWidth || 150, h = m.offsetHeight || 120;
      var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      var top  = (r.top - h - 8 > 8) ? (r.top - h - 8) : (r.bottom + 8);
      m.style.left = left + 'px';
      m.style.top  = top + 'px';
    } catch(e){}
    setTimeout(function(){
      document.addEventListener('click', function once(ev){
        if (ev.target && ev.target.closest && ev.target.closest('#' + MENU_ID)) return;
        closeMenu();
        document.removeEventListener('click', once);
      });
    }, 0);
  }

  // ── 입력칸 옆에 버튼 심기 ─────────────────────────────────────────
  function mount(){
    try {
      var input = document.getElementById('vc-chat-input');
      var area = input && input.parentNode;
      if (!area || document.getElementById(BTN_ID)) return;
      var b = document.createElement('button');
      b.id = BTN_ID;
      b.type = 'button';
      b.title = isKo() ? '채팅 번역 — 한국어↔영어 / 한국어↔중국어'
                       : 'Chat translation - Korean <-> English / Chinese';
      b.style.cssText = 'flex:0 0 auto;margin-right:4px;padding:0 9px;border-radius:8px;cursor:pointer;' +
                        'border:1px solid rgba(148,163,184,0.28);font-size:12px;font-weight:700;' +
                        'white-space:nowrap;line-height:1;height:34px';
      b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openMenu(b); });
      area.insertBefore(b, input.nextSibling);   // 입력칸과 [전송] 사이
      paintBtn();
    } catch(e){ console.warn('[chat-tr] mount', e); }
  }
  try { window.addEventListener('mangoi:langchange', paintBtn); } catch(e){}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // ── 보낼 때: 한국어 → 고른 언어 ────────────────────────────────────
  var origSend = window.vcSendChat;
  if (typeof origSend === 'function') {
    window.vcSendChat = function(){
      var tgt = target();
      var input = document.getElementById('vc-chat-input');
      var text = (input && input.value || '').trim();
      // 내가 쓴 언어를 기억해 둔다 — 메뉴에서 내 언어를 빼고, 받은 글을 이 언어로 보여주는 데 쓴다
      if (text) { try { setMyLang(langOf(text)); } catch(_){} }
      // 번역 꺼짐 · 빈 줄 · 이미 그 언어 · @멘션 포함 → 손대지 않고 원래대로
      if (!tgt || !text || !needsTr(text, tgt) || /@[A-Za-z0-9가-힣_]+/.test(text)) {
        return origSend.apply(this, arguments);
      }
      if (busy) return;                       // 엔터 연타 시 이중 전송 방지
      busy = true;
      var ph = input.placeholder;
      input.placeholder = isKo() ? '번역 중…' : 'Translating…';
      var done = function(){
        busy = false;
        try { input.placeholder = ph; input.focus(); } catch(_){}
      };
      // 3초 안에 응답이 없으면 원문으로 보낸다 — 채팅이 멈춰 보이면 안 된다
      var settled = false;
      var fire = function(out){
        if (settled) return; settled = true;
        if (out && out !== text) { input.value = out; lastSent = { translated: out, original: text }; }
        try { origSend.call(window); } catch(e){ console.warn('[chat-tr] send', e); }
        done();
      };
      setTimeout(function(){ fire(null); }, 3000);
      translate([text], tgt).then(function(map){ fire(map && map[text]); });
    };
  }

  // ── 받을 때: 영어·중국어 → 한국어 (원문 아래 작은 줄로 덧붙임) ──────
  var origRecv = window.vcReceiveChat;
  if (typeof origRecv === 'function') {
    window.vcReceiveChat = function(data){
      var r = origRecv.apply(this, arguments);
      try {
        if (!target()) return r;
        if (!data || data.type === 'system') return r;
        if (data._loadedAt) return r;                       // 입장 시 과거 200개 — 번역 안 함
        var box = document.getElementById('vc-chat-messages');
        if (!box) return r;
        var msgs = box.querySelectorAll('.chat-msg');
        var el = msgs[msgs.length - 1];
        if (!el || el.getAttribute('data-tr')) return r;
        if (!el.querySelector('.msg-bubble')) return r;
        el.setAttribute('data-tr', '1');
        /* ⚠️ 요소를 변수로 붙잡아 두면 안 된다 — vcReceiveChat 은 `innerHTML +=` 라
           다음 메시지가 올 때 말풍선을 통째로 새로 만든다. 번역이 돌아왔을 땐 내가 쥔
           요소가 이미 버려진 것이라 붙여도 화면에 안 보인다.
           그래서 표식(data-tr-id)만 남기고, 붙일 때 다시 찾는다.
           (innerHTML 왕복에도 속성은 그대로 보존된다) */
        var trId = 'tr' + (++seq);
        el.setAttribute('data-tr-id', trId);
        var msg = String(data.message || '');

        // 내가 보낸 것 → 방금 번역해 보낸 원문을 붙여준다(내가 뭘 썼는지 보이게)
        if (data.userId === (typeof vcUserId !== 'undefined' ? vcUserId : '') && lastSent && lastSent.translated === msg) {
          addNote(trId, lastSent.original, true);
          lastSent = null;
          return r;
        }
        // 상대가 보낸 것 → 내 언어가 아니면 내 언어로 바꿔 붙인다
        var rt = readTarget();
        if (data.userId !== (typeof vcUserId !== 'undefined' ? vcUserId : '') && msg && rt && needsTr(msg, rt)) {
          translate([msg], rt).then(function(map){
            var out = map && map[msg];
            if (out && out !== msg) addNote(trId, out, false);
          });
        }
      } catch(e){ console.warn('[chat-tr] recv', e); }
      return r;
    };
  }

  function addNote(trId, text, mine){
    try {
      if (!trId || !text) return;
      // 붙이는 시점에 다시 찾는다(위 주석 참고 — 그 사이 말풍선이 새로 만들어졌을 수 있다)
      var bubble = document.querySelector('[data-tr-id="' + trId + '"] .msg-bubble');
      if (!bubble || bubble.querySelector('.vc-tr-note')) return;
      var d = document.createElement('div');
      d.className = 'vc-tr-note';
      d.style.cssText = 'margin-top:5px;padding-top:5px;font-size:11.5px;line-height:1.5;opacity:.82;' +
                        'border-top:1px dashed rgba(148,163,184,.42)';
      d.textContent = (mine ? '✏️ ' : '🌐 ') + text;
      bubble.appendChild(d);
      var box = document.getElementById('vc-chat-messages');
      if (box) box.scrollTop = box.scrollHeight;
    } catch(e){}
  }
})();


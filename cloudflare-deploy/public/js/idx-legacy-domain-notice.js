/* 🧭 (2026-08-28) test.mangoi.co.kr 로 들어온 사람에게 mangoi.ai 로 옮겨 달라고 "안내"만 함.
   ⛔ 서버 리다이렉트가 아니다 — CLAUDE.md 0장/2장에 이미 못 박혀 있듯 test.mangoi.co.kr 을
   자동으로 mangoi.ai 로 돌리면 그 도메인에 등록된 패스키(6건)가 무효화되고 앱 사용자의
   localStorage 로그인이 날아간다. 여기서는 "눌러야만" 이동하는 배너 하나만 띄운다 —
   패스키·로그인이 걸린 계정(교사·관리자)이 실수로 튕기지 않게, 그리고 아직 옛 주소로
   시작하는 설치된 앱(WebView)의 흐름을 건드리지 않게 하기 위함.
   닫으면 이 기기에서는 다시 안 뜬다(관리자 "환영 안내"와 같은 방식). */
(function(){
  'use strict';
  if (location.hostname !== 'test.mangoi.co.kr') return;
  try { if (localStorage.getItem('mangoi_legacy_domain_notice_dismissed') === '1') return; } catch(e){}
  if (document.getElementById('mg-legacy-domain-notice')) return;

  function isEn(){
    try { if (typeof window.getLang === 'function') return String(window.getLang()).toLowerCase().indexOf('en') === 0; } catch(e){}
    try { return String(localStorage.getItem('mangoi_lang') || document.documentElement.lang || 'ko').toLowerCase().indexOf('en') === 0; } catch(e){ return false; }
  }
  var en = isEn();
  var target = 'https://mangoi.ai' + location.pathname + location.search + location.hash;

  var style = document.createElement('style');
  style.textContent = 'body.vc-in-call #mg-legacy-domain-notice{display:none!important}';
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'mg-legacy-domain-notice';
  box.setAttribute('style', 'position:fixed;top:16px;right:16px;z-index:2147482000;width:320px;max-width:86vw;background:rgba(15,23,42,0.72);backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(251,191,36,0.45);border-radius:16px;box-shadow:0 18px 50px -16px rgba(0,0,0,0.7);color:#fff;font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;padding:14px 14px 14px 16px');
  box.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:8px">'
    + '<div style="font-size:19px;line-height:1.3;flex:0 0 auto">⚠️</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:13px;font-weight:800;color:#fcd34d;margin-bottom:5px">' + (en ? 'Please use mangoi.ai' : '새 주소로 접속해 주세요') + '</div>'
    + '<div style="font-size:12px;color:#e2e8f0;line-height:1.5;margin-bottom:11px">' + (en ? 'This address will stop working soon. Please switch to mangoi.ai.' : '이 주소(test.mangoi.co.kr)는 곧 사용할 수 없어요. mangoi.ai 로 접속해 주세요.') + '</div>'
    + '<a href="' + target + '" style="display:inline-block;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;font-size:12.5px;padding:8px 14px;border-radius:999px;text-decoration:none">' + (en ? 'Go to mangoi.ai' : 'mangoi.ai로 이동') + '</a>'
    + '</div>'
    + '<button type="button" id="mg-legacy-domain-notice-x" aria-label="' + (en ? 'Close' : '닫기') + '" style="flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);color:#fff;font-size:13px;font-weight:800;cursor:pointer;line-height:1">✕</button>'
    + '</div>';
  document.body.appendChild(box);

  function dismiss(){
    try { localStorage.setItem('mangoi_legacy_domain_notice_dismissed', '1'); } catch(e){}
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  var x = document.getElementById('mg-legacy-domain-notice-x');
  if (x) { x.addEventListener('click', dismiss); x.addEventListener('touchend', function(ev){ ev.preventDefault(); dismiss(); }); }
})();

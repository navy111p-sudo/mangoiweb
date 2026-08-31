/* 🧭 (2026-08-28) test.mangoi.co.kr 로 들어온 사람에게 "잘못된 주소" 라는 것만 인지시킴.
   ⛔ 서버 리다이렉트가 아니고, 클릭 한 번으로 넘어가는 "바로가기" 버튼·링크도 일부러 안 둔다
   (사장님 결정 2026-08-28 — 그런 바로가기는 또 다른 문제를 만들 수 있어, 인지만 시키면 충분).
   그 이유의 배경: CLAUDE.md 0장에 이미 못 박혀 있듯 test.mangoi.co.kr 을 자동으로
   mangoi.ai 로 돌리면(또는 한 번의 클릭으로 옮기면) 그 도메인에 등록된 패스키(6건)가
   무효화되고 앱 사용자의 localStorage 로그인이 날아갈 수 있다 — 링크를 없애면 이 위험도
   함께 없어진다. 대상은 역할 구분 없이 test.mangoi.co.kr 로 들어온 사람 전원(학생·교사·
   관리자 모두 이제 mangoi.ai 만 쓰는 것이 맞다는 사장님 확인).
   닫으면 이 기기에서는 다시 안 뜬다(관리자 "환영 안내"와 같은 방식).

   📣 (2026-08-31 사장님 지시) «우상단 작은 카드» → «화면 정중앙 · 약 3배 크게».
     이유: 우상단 카드는 눈에 안 들어와 옛 주소로 계속 들어오는 사람이 그대로 남았다.
     ⛔ 그래서 2026-08-30 에 넣었던 «우상단 칩 줄(#ph50-chip-row)을 피해 아래로 밀기»
        로직(place/TOP_SEL)은 지웠다 — 가운데로 옮긴 순간 그 줄과 겹칠 일이 없어졌다.
        ⚠️ 다시 우상단으로 되돌린다면 그 회피 로직도 함께 되살려야 한다(안 그러면
        「보이는데 안 눌린다」 사고가 그대로 재현된다 — CLAUDE.md 2장).
     ⚠️ 대신 가운데라 «본문 위» 를 덮는다. 그래서 닫는 길을 여러 겹으로 둔다(같은 장의
        「떠 있는 안내 상자가 닫아도 안 사라짐」 함정) — ✕ 버튼 · 상자 아무 데나 탭 ·
        touchend · 같은 id 를 전부(querySelectorAll) 지우기.
     ⚠️ 글자 크기는 clamp 로 준다 — 폰(390px)에서 고정 큰 값을 쓰면 상자가 화면을 넘는다. */
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

  var style = document.createElement('style');
  style.textContent = 'body.vc-in-call #mg-legacy-domain-notice{display:none!important}';
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'mg-legacy-domain-notice';
  /* 정중앙 고정. 배경은 0.94 로 진하게 — 홈 첫 화면의 밝은 영상 위에 얹히므로
     0.72 로는 글자가 배경 그림에 섞인다(대비비). */
  box.setAttribute('style', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);'
    + 'z-index:2147482000;width:min(780px,92vw);max-width:92vw;max-height:88vh;overflow-y:auto;'
    + 'background:rgba(15,23,42,0.94);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);'
    + 'border:2px solid rgba(251,191,36,0.65);border-radius:22px;box-shadow:0 26px 70px -14px rgba(0,0,0,0.8);'
    + 'color:#fff;font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;'
    + 'padding:clamp(22px,4.4vw,38px) clamp(18px,4vw,40px);text-align:center;cursor:pointer');
  box.innerHTML =
    '<button type="button" id="mg-legacy-domain-notice-x" aria-label="' + (en ? 'Close' : '닫기') + '" style="position:absolute;top:10px;right:10px;width:clamp(34px,7vw,46px);height:clamp(34px,7vw,46px);border-radius:50%;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.26);color:#fff;font-size:clamp(15px,3vw,21px);font-weight:800;cursor:pointer;line-height:1">✕</button>'
    + '<div style="font-size:clamp(34px,7vw,58px);line-height:1.1;margin-bottom:clamp(8px,1.6vw,14px)">⚠️</div>'
    + '<div id="mg-legacy-domain-notice-title" style="font-size:clamp(21px,4.6vw,38px);font-weight:800;color:#fcd34d;line-height:1.3;margin-bottom:clamp(8px,1.8vw,16px)">' + (en ? 'Wrong address' : '잘못된 주소로 접속했습니다') + '</div>'
    + '<div style="font-size:clamp(15px,3.4vw,27px);color:#e2e8f0;line-height:1.55">' + (en ? 'This is an old address (test.mangoi.co.kr). Please use mangoi.ai instead.' : '이 주소(test.mangoi.co.kr)는 옛 주소입니다.<br>mangoi.ai 로 접속해 주세요.') + '</div>'
    + '<div style="font-size:clamp(12px,2.6vw,17px);color:#94a3b8;line-height:1.4;margin-top:clamp(10px,2vw,18px)">' + (en ? 'Tap anywhere on this box to close.' : '이 상자를 누르면 닫힙니다.') + '</div>';
  document.body.appendChild(box);

  /* 닫기는 여러 겹으로 — 같은 id 가 두 벌 쌓여도 «전부» 지운다(CLAUDE.md 2장). */
  var done = false;
  function dismiss(ev){
    if (ev) { try { ev.preventDefault(); ev.stopPropagation(); } catch(e){} }
    if (done) return;
    done = true;
    try { localStorage.setItem('mangoi_legacy_domain_notice_dismissed', '1'); } catch(e){}
    var all = document.querySelectorAll('#mg-legacy-domain-notice');
    for (var i = 0; i < all.length; i++) { if (all[i].parentNode) all[i].parentNode.removeChild(all[i]); }
  }
  box.addEventListener('click', dismiss, true);
  box.addEventListener('touchend', dismiss, true);
  var x = document.getElementById('mg-legacy-domain-notice-x');
  if (x) { x.addEventListener('click', dismiss, true); x.addEventListener('touchend', dismiss, true); }
})();

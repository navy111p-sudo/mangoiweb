// idx-allmenu.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  'use strict';

  // fix (2026-06-01 v3) — 완전 독립형 전체메뉴 오버레이.
  //   레거시 v19-panel 위치/부모 transform 에 의존하지 않고, 클릭 시 body 직속에
  //   새 오버레이를 만들어 띄운다 → 휴대폰에서 100% 표시.
  // 🖼 아이콘 = 실사 사진(/img/menu/*.webp, Higgsfield 생성 · build-allmenu-icons.py 로 재생성).
  //    emoji 는 지우지 말 것 — 사진 로드 실패 시 되돌아갈 폴백이다(아래 '아이콘 폴백' 배선 참고).
  var ALLMENU_ITEMS = [
    {emoji:'🛠', img:'/img/menu/admin.webp', name:'관리자 페이지', url:'/admin.html'},
    {emoji:'👤', img:'/img/menu/mypage.webp', name:'마이페이지', url:'/parent.html'},
    {emoji:'👨‍🎓', img:'/img/menu/students.webp', name:'학생 관리', url:'/admin.html#card-students-mgmt'},
    {emoji:'📅', img:'/img/menu/schedule.webp', name:'내 주간 스케줄', url:'/admin/weekly-schedule.html?role=student'},
    {emoji:'💬', img:'/img/menu/contact.webp', name:'카카오 상담', url:'https://pf.kakao.com/_xlqnSxd'},  // 2026-08-14 피드백 ⑤: 문의 페이지 폐지 → 카카오 채널 하나로
    {emoji:'📚', img:'/img/menu/curriculum.webp', name:'커리큘럼', url:'/curriculum.html'},
    {emoji:'📖', img:'/img/menu/lessons.webp', name:'수업 자료', url:'/lessons.html'},
    {emoji:'📝', img:'/img/menu/eval.webp', name:'평가서', url:'/eval.html'},
    {emoji:'📊', img:'/img/menu/report.webp', name:'리포트', url:'/report.html'},
    {emoji:'🤖', img:'/img/menu/ai-friend.webp', name:'AI 친구', url:'/ai-friend.html'},
    {emoji:'✍', img:'/img/menu/ai-write.webp', name:'AI 작문', url:'/ai-write.html'},
    {emoji:'🗣', img:'/img/menu/speech.webp', name:'영어 발음 코치', url:'/speech-coach.html'},
    {emoji:'🇨🇳', img:'/img/menu/speech-cn.webp', name:'중국어 발음 코치', url:'/speech-coach-cn.html'},
    {emoji:'📚', img:'/img/menu/uploader.webp', name:'교재 업로더', url:'/textbook-uploader.html'},
    {emoji:'📖', img:'/img/menu/vocab.webp', name:'단어장', url:'/vocab.html'},
    {emoji:'🎯', img:'/img/menu/quiz.webp', name:'미니 퀴즈', url:'/micro-quiz.html'},
    {emoji:'🧠', img:'/img/menu/mbti.webp', name:'MBTI 매칭', url:'/mbti.html'},
    {emoji:'🧪', img:'/img/menu/mbti-test.webp', name:'MBTI 테스트', url:'/mbti-test.html'},
    {emoji:'🔥', img:'/img/menu/streak.webp', name:'연속 출석', url:'/streak.html'},
    {emoji:'🌟', img:'/img/menu/praise.webp', name:'칭찬 스티커', url:'/teacher-praise.html'},
    {emoji:'📝', img:'/img/menu/booking.webp', name:'수업 신청', url:'/lesson-booking-demo.html'},
    {emoji:'📅', img:'/img/menu/postpone.webp', name:'수업 연기·변경', url:'/lesson-postpone-demo.html'},
    {emoji:'👨‍👩‍👧', img:'/img/menu/parent.webp', name:'학부모 페이지', url:'/parent.html'},
    {emoji:'🩺', img:'/img/menu/health.webp', name:'시스템 진단', url:'/admin/health.html'},
    {emoji:'👀', img:'/img/menu/observe.webp', name:'수업 관찰', url:'/admin/ghost-view.html'},
    {emoji:'🔐', img:'/img/menu/login.webp', name:'관리자 로그인', url:'/admin/login'}
  ];
  var ALLMENU_EMO_CSS = 'font-size:42px;line-height:1;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.45))';
  function _allmenuEsc(ev){ if (ev.key === 'Escape' || ev.keyCode === 27) closeAllMenuOverlay(); }
  function closeAllMenuOverlay(){
    var ov = document.getElementById('mangoi-allmenu');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);   // 여러 번 호출돼도 안전(idempotent)
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _allmenuEsc);
  }
  function openAllMenuOverlay(){
    // 이미 열려 있으면 다시 열지 않음 — 중복 트리거(터치+클릭)에도 닫히지 않고 그대로 유지
    if (document.getElementById('mangoi-allmenu')) return;
    var ov = document.createElement('div');
    ov.id = 'mangoi-allmenu';
    // 🌌 우주 배경(홈과 동일한 Higgsfield 딥필드 재사용, 40KB) + 투명 글래스 모달
    // ⚠ 이 배경(#050714 등)은 mgam-bg 로딩 전 찰나에만 보이는 폴백 — 진하게 유지해 깜빡임 방지
    ov.setAttribute('style', 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;z-index:2147483600;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:radial-gradient(ellipse at center,rgba(8,11,24,0.75) 0%,rgba(5,7,16,0.95) 100%),#050714;font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;animation:mgAmFade .28s ease;');

    // ✨ 반짝이는 별 필드 (디자인 디테일)
    var sf = '<style>@keyframes mgAmFade{from{opacity:0}to{opacity:1}}@keyframes mgAmRise{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}@keyframes mgamTwinkle{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:1;transform:scale(1.5)}}@media(max-width:560px){#mgam-grid{grid-template-columns:repeat(3,1fr)!important}}</style>'
;
    sf += '<div id="mgam-stars" style="position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden">';
    for (var i=0;i<46;i++){
      var top=(Math.random()*100).toFixed(2), left=(Math.random()*100).toFixed(2);
      var sz=(Math.random()*2+1).toFixed(2), dur=(Math.random()*2.5+1.8).toFixed(2), dly=(Math.random()*3).toFixed(2);
      var op=(Math.random()*0.5+0.4).toFixed(2);
      sf += '<span style="position:absolute;top:'+top+'%;left:'+left+'%;width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:#fff;opacity:'+op+';box-shadow:0 0 4px 1px rgba(255,255,255,0.55);animation:mgamTwinkle '+dur+'s ease-in-out '+dly+'s infinite"></span>';
    }
    sf += '</div>';

    // 🖥️ 투명 글래스 모달 박스
    var h = sf;
    // 🔑 어둡게 하는 힘을 filter:brightness()가 아니라 배경 레이어에 직접 구운 그라디언트로 확보 —
    //    CSS filter/backdrop-filter 미지원 환경(구형 WebView 등)에서도 글자 대비가 항상 보장된다.
    //    옛 space.jpg(403KB, 은하가 화면을 가로질러 산만)를 버리고 홈과 같은 딥필드(40KB, 중앙 여백)로 교체.
    h += '<div id="mgam-bg" style="position:absolute;inset:-40px;z-index:0;background:linear-gradient(rgba(4,6,14,0.62),rgba(4,6,14,0.74)),url(\'/img/home-bg-dark.webp?v=20260730\') center center / cover no-repeat;filter:blur(4px) saturate(1.05);transform:scale(1.06)"></div>';
    h += '<div id="mgam-box" style="position:relative;z-index:2;width:100%;max-width:820px;min-height:74vh;max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(165deg,rgba(26,32,54,0.62),rgba(8,10,20,0.80));backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);border:1px solid rgba(255,255,255,0.16);border-radius:22px;box-shadow:0 24px 70px -20px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.14);overflow:hidden;animation:mgAmRise .32s cubic-bezier(.2,.8,.2,1)">';

    // 헤더
    h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,0.1);flex:0 0 auto">'
      + '<h2 style="margin:0;color:#fff;font-size:26px;font-weight:800;letter-spacing:.3px;text-shadow:0 1px 8px rgba(0,0,0,0.4)">📋 전체 메뉴</h2>'
      + '<button type="button" id="mangoi-allmenu-x" aria-label="닫기" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.22);color:#fff;font-size:16px;font-weight:800;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .15s">✕</button>'
      + '</div>';

    // 카드 그리드 (스크롤 영역)
    h += '<div style="overflow-y:auto;-webkit-overflow-scrolling:touch;padding:22px;flex:1 1 auto">';
    h += '<div id="mgam-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(157px,1fr));gap:18px">';
    ALLMENU_ITEMS.forEach(function(m){
      // 실사 아이콘 64x64. width/height 속성은 로딩 중 레이아웃 흔들림 방지용이고,
      // 실제 크기는 CSS 가 확정한다(속성이 CSS 를 이기는 사고를 피하려고 둘 다 명시).
      var ico = m.img
        ? '<img class="mgam-ico" src="' + m.img + '" alt="" width="64" height="64" decoding="async" data-emoji="' + m.emoji + '" style="width:64px;height:64px;flex:0 0 auto;object-fit:cover;border-radius:15px;border:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 16px -6px rgba(0,0,0,0.75);background:#0a0d1a">'
        : '<span style="' + ALLMENU_EMO_CSS + '">' + m.emoji + '</span>';
      // justify-content 는 center 가 아니라 flex-start — 라벨이 2줄로 접히는 카드('내 주간 스케줄' 등)만
      // 세로 중앙정렬 때문에 아이콘이 아래로 밀려 한 줄 안에서 아이콘 높이가 들쭉날쭉해진다.
      h += '<a href="' + m.url + '" class="mgam-card" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:9px;padding:25px 11px;background:linear-gradient(160deg,rgba(255,255,255,0.10),rgba(6,9,18,0.64));border:1px solid rgba(255,255,255,0.16);border-radius:18px;color:#F8FAFC;text-decoration:none;min-height:146px;text-align:center;font-size:18px;font-weight:600;line-height:1.3;text-shadow:0 1px 5px rgba(0,0,0,0.65);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:transform .15s,background .15s,border-color .15s;-webkit-tap-highlight-color:rgba(96,165,250,0.3)">'
        + ico + '<span>' + m.name + '</span></a>';
    });
    h += '</div></div>';
    h += '</div>';
    ov.innerHTML = h;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    // 🎬 우상단 안내 동영상 — 전체메뉴 열 때 음성+영상 자동재생(1회만), 클릭하면 즉시 사라짐
    (function(){
      var vw = document.createElement('div');
      vw.style.cssText = 'position:fixed;top:12px;right:12px;z-index:6;width:min(240px,46vw);aspect-ratio:1/1;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px -8px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.2);background:#000;cursor:pointer;opacity:0;transition:opacity .55s ease';
      vw.innerHTML = '<video id="mgam-vid" src="/video/langedu-female.mp4" autoplay playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none"></video>'
        + '<button type="button" id="mgam-vid-mute" title="소리 켜기/끄기" aria-label="소리 켜기/끄기" style="position:absolute;right:6px;bottom:6px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">🔊</button>'
        + '<button type="button" id="mgam-vid-x" title="닫기" aria-label="닫기" style="position:absolute;left:6px;top:6px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">✕</button>';
      ov.appendChild(vw);
      var vid=vw.querySelector('#mgam-vid'), vmb=vw.querySelector('#mgam-vid-mute'), vx=vw.querySelector('#mgam-vid-x');
      function vupd(){ vmb.textContent = vid.muted ? '🔇' : '🔊'; }
      function killVid(){ try{ vid.pause(); }catch(_){ } if(vw && vw.parentNode) vw.remove(); }
      // 🔊 음소거로 시작 — 음성은 🔊 버튼 클릭 시에만 (자동 음성재생 금지)
      vid.muted = true;
      var p0 = vid.play();
      if (p0 && p0.catch) p0.catch(function(){});
      vupd();
      vmb.addEventListener('click', function(e){ e.stopPropagation(); vid.muted=!vid.muted; if(!vid.muted){ var pp=vid.play(); if(pp&&pp.catch)pp.catch(function(){}); } vupd(); });
      vx.addEventListener('click', function(e){ e.stopPropagation(); killVid(); });
      // 🖱 영상 클릭하면 바로 사라짐
      vw.addEventListener('click', killVid);
      // ✨ fade-in (천천히 등장)
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ vw.style.opacity = '1'; }); });
      // 🎬 영상(말)이 끝나면 fade-out 후 자연스럽게 사라짐
      function fadeOutVid(){ if(!vw) return; vw.style.opacity = '0'; setTimeout(function(){ try{ vid.pause(); }catch(_){ } if(vw && vw.parentNode) vw.remove(); }, 650); }
      vid.addEventListener('ended', fadeOutVid);
      // 🛡 fix (2026-06-22) — 로딩 실패/지연 시 우상단 검은 박스 영구 잔류 방지.
      //    파일 로드 에러, stalled, 또는 4초 내 재생 불가(readyState<2) 시 박스 자동 제거.
      vid.addEventListener('error', killVid);
      vid.addEventListener('stalled', function(){ setTimeout(function(){ if (vid.readyState < 2) killVid(); }, 1500); });
      setTimeout(function(){ if (vw && vw.parentNode && vid.readyState < 2) killVid(); }, 4000);
    })();

    // 💬 좌하단 카카오 상담 (작은 이모지)
    (function(){
      var kb = document.createElement('a');
      kb.href='https://pf.kakao.com/_xlqnSxd'; kb.target='_blank'; kb.rel='noopener';
      kb.title='카카오톡 상담'; kb.setAttribute('aria-label','카카오 상담'); kb.textContent='💬';
      kb.style.cssText='position:fixed;left:16px;bottom:16px;z-index:6;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#fee500,#f6cc00);color:#191919;display:flex;align-items:center;justify-content:center;font-size:22px;text-decoration:none;box-shadow:0 8px 20px -4px rgba(254,229,0,.55)';
      kb.addEventListener('click', function(e){ e.stopPropagation(); });
      ov.appendChild(kb);
    })();

    // 🛡 아이콘 폴백 — 실사 사진이 404·네트워크 실패면 원래 이모지로 되돌린다.
    //    ⚠ 캐시 히트 시 error 이벤트가 리스너 붙기 전에 지나갔을 수 있어 complete/naturalWidth 로 한 번 더 본다.
    ov.querySelectorAll('img.mgam-ico').forEach(function(im){
      function toEmoji(){
        if (!im.parentNode) return;
        var sp = document.createElement('span');
        sp.setAttribute('style', ALLMENU_EMO_CSS);
        sp.textContent = im.getAttribute('data-emoji') || '';
        im.parentNode.replaceChild(sp, im);
      }
      im.addEventListener('error', toEmoji);
      if (im.complete && !im.naturalWidth) toEmoji();
    });

    // 호버 효과 (마우스 환경)
    ov.querySelectorAll('.mgam-card').forEach(function(c){
      c.addEventListener('mouseenter', function(){ c.style.transform='translateY(-3px)'; c.style.background='linear-gradient(160deg,rgba(147,197,253,0.32),rgba(30,58,95,0.62))'; c.style.borderColor='rgba(96,165,250,0.6)'; });
      c.addEventListener('mouseleave', function(){ c.style.transform=''; c.style.background='linear-gradient(160deg,rgba(255,255,255,0.10),rgba(6,9,18,0.64))'; c.style.borderColor='rgba(255,255,255,0.16)'; });
    });

    function _closeFromEvent(ev){ ev.preventDefault(); ev.stopPropagation(); closeAllMenuOverlay(); }
    var x = document.getElementById('mangoi-allmenu-x');
    if (x) { x.addEventListener('click', _closeFromEvent); x.addEventListener('touchend', _closeFromEvent); }
    ov.addEventListener('click', function(ev){ if (ev.target === ov) closeAllMenuOverlay(); });
    ov.addEventListener('touchend', function(ev){ if (ev.target === ov) { ev.preventDefault(); closeAllMenuOverlay(); } });
    document.addEventListener('keydown', _allmenuEsc);
    console.log('[allmenu] 열림(overlay v4 우주글래스) — ' + ALLMENU_ITEMS.length + '개');
  }
  window.openAllMenuOverlay = openAllMenuOverlay;

  // === capture-phase 트리거 (click + touchend) + 디바운스 ===
  //   fix (2026-06-01 v3) — 휴대폰에서 한 번 탭 시 터치+클릭 이벤트가 2번 발생해
  //   토글이 열림→닫힘으로 즉시 닫히던 문제: 600ms 디바운스로 1회만 동작.
  var _allmenuLastTrigger = 0;
  function allmenuTrigger(e){
    if (!e || !e.target || typeof e.target.closest !== 'function') return;
    var btn = e.target.closest('[data-go="all-menu"], button[data-ko*="전체메뉴"]');
    if (!btn) {
      var clicked = e.target.closest('button.ai-quick-btn');
      if (clicked && clicked.textContent.indexOf('전체메뉴') >= 0) btn = clicked;
    }
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var now = Date.now();
    if (now - _allmenuLastTrigger < 600) return;   // 중복 이벤트(터치+클릭) 무시 → 1회만 토글
    _allmenuLastTrigger = now;
    if (document.getElementById('mangoi-allmenu')) closeAllMenuOverlay();
    else openAllMenuOverlay();
  }
  window.addEventListener('click', allmenuTrigger, true);
  window.addEventListener('touchend', allmenuTrigger, true);

  // === v19 패널 없으면 즉시 만들기 ===
  function buildPanelV22(){
    // 🧹 레거시 v19 패널 본문 제거됨 (2026-06-08) — 전체메뉴는 openAllMenuOverlay 사용
  }
  window.buildPanelV22 = buildPanelV22;

  // 페이지 로드 즉시 패널 생성 (hide 상태)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanelV22);
  else buildPanelV22();
  setTimeout(buildPanelV22, 500);

  console.log('[v22] 전체메뉴 capture-phase 핸들러 + 패널 즉시 생성 활성');
})();


// idx-push-sw.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  // 1) Service Worker 등록 (오프라인 캐시 + 빠른 로딩)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // updateViaCache:'none' → sw.js 자체를 항상 새로 받아 배포 즉시 새 버전 적용
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
          console.log('[pwa] SW 등록:', reg.scope);
          // 입장할 때마다 새 버전 확인 → 있으면 즉시 교체
          reg.update().catch(()=>{});
          if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed') nw.postMessage('SKIP_WAITING');
            });
          });
        })
        .catch(err => console.warn('[pwa] SW 등록 실패:', err));
      // 새 SW 가 제어권을 잡으면 새로고침 → 항상 최신 화면
      // 🔧 (2026-07-13) 단, 방금 로드된 페이지는 이미 네트워크에서 최신 HTML을 받은 상태라
      //   여기서 또 reload 하면 첫 진입이 "깜빡" 거리기만 함(첫 설치·배포 직후 공통).
      //   → 로드 30초 이내엔 조용히 교체만 하고, 오래 열려 있던 화면(설치형 PWA)만 새로고침.
      //   수업 중(vc-in-call)에는 절대 강제 새로고침하지 않음.
      // 🥭 (2026-08-20 사장님 제보 ①④) «카톡 보고 오면 로고만 나온다» 의 한 갈래.
      //   아래 visibilitychange 가 «돌아올 때마다» 새 버전을 확인하는데, 배포가 잦은 날에는
      //   그때마다 controllerchange 가 떠서 **돌아오자마자 통째로 새로고침**이 걸렸다.
      //   첫 화면을 다시 그리는 데 1.5MB 가 필요하므로 그 몇 초가 «멈춘 화면» 으로 보인다.
      //   → «돌아온 직후» 에는 새로고침하지 않는다. 새 SW 는 조용히 교체만 되고,
      //     다음에 페이지를 새로 열 때 최신 화면이 나온다(안 보이던 것이 아니라 미루는 것).
      let _swReloaded = false;
      const _swPageLoadedAt = Date.now();
      let _swVisibleSince = Date.now();
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'visible') _swVisibleSince = Date.now();
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (_swReloaded) return;
        if (Date.now() - _swPageLoadedAt < 30000) return;
        // 화면을 다시 본 지 60초가 안 됐으면 = 방금 돌아온 것이다. 건드리지 않는다.
        if (Date.now() - _swVisibleSince < 60000) return;
        try { if (document.body && document.body.classList.contains('vc-in-call')) return; } catch(e){}
        _swReloaded = true;
        location.reload();
      });
      // 🔧 (2026-06-27) 설치형 PWA가 계속 열려 있어도 새 배포를 자동 수신하도록
      //   업데이트 확인 주기 강화: ①앱을 다시 볼 때(visibilitychange) ②60초마다.
      //   새 버전이 있으면 위 updatefound→SKIP_WAITING→controllerchange→reload 로 자동 적용.
      function _swCheckUpdate(){
        navigator.serviceWorker.getRegistration().then(function(reg){
          if (!reg) return;
          reg.update().catch(function(){});
          if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
        }).catch(function(){});
      }
      document.addEventListener('visibilitychange', function(){
        if (document.visibilityState === 'visible') _swCheckUpdate();
      });
      setInterval(_swCheckUpdate, 60 * 1000);
    });
  }

  // ━━━━━━ 🔔 Phase WP1 — Web Push 구독 관리 ━━━━━━
  // base64url → Uint8Array (VAPID public key 변환)
  function b64uToUint8(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  window.mangoiPushSubscribe = async function() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('이 브라우저는 푸시 알림을 지원하지 않아요');
      return false;
    }
    try {
      // VAPID 공개키 가져오기
      const keyResp = await fetch('/api/push/vapid-public-key');
      const keyD = await keyResp.json();
      if (!keyD.ok || !keyD.key) {
        alert('푸시 알림이 아직 설정되지 않았어요 (관리자 문의)');
        return false;
      }
      // 알림 권한 요청
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('알림 권한이 거부됐어요. 설정 → 알림에서 허용해주세요.');
        return false;
      }
      // SW 구독
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToUint8(keyD.key),
      });
      // 서버 등록
      const user = (function(){ try { return JSON.parse(localStorage.getItem('mango_user')||'null'); } catch(e){ return null; } })();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), user_id: user?.user_id || null, ua: navigator.userAgent.slice(0, 200) })
      });
      try { localStorage.setItem('mangoi_push_subscribed', '1'); } catch(e){}
      alert('🔔 푸시 알림 구독 완료!\n수업 알림, 결제 안내, 평가서 알림 등을 받을 수 있어요.');
      return true;
    } catch (e) {
      console.warn('[push] subscribe fail:', e);
      alert('푸시 구독 실패: ' + (e?.message || 'unknown'));
      return false;
    }
  };

  window.mangoiPushUnsubscribe = async function() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      try { localStorage.removeItem('mangoi_push_subscribed'); } catch(e){}
      alert('🔕 푸시 알림 구독 해제됨');
      return true;
    } catch(e) {
      console.warn('[push] unsubscribe fail:', e);
      return false;
    }
  };

  window.mangoiPushStatus = async function() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'not_subscribed';
    } catch(e) { return 'error'; }
  };

  // ━━━━━━ 🔔 푸시 옵트인 안내 배너 (첫 방문 + 30일 쿨다운) ━━━━━━
  (function pushOptInBanner(){
    const KEY = 'mangoi_push_banner_dismissed_at';
    const COOL_MS = 30 * 86400 * 1000; // 30일

    function canShow() {
      try {
        const last = parseInt(localStorage.getItem(KEY) || '0', 10);
        return (Date.now() - last) > COOL_MS;
      } catch(e){ return true; }
    }
    function dismiss(days) {
      try {
        const offset = (days||0) * 86400 * 1000;
        localStorage.setItem(KEY, String(Date.now() - COOL_MS + offset));
      } catch(e){}
    }
    async function maybeShow() {
      if (!canShow()) return;
      // 이미 구독 중이면 표시 안 함
      try {
        const status = await window.mangoiPushStatus();
        if (status === 'subscribed' || status === 'unsupported') return;
      } catch(e){ return; }
      // VAPID 키 확인 — 서버에서 발급 안 됐으면 표시 안 함
      try {
        const r = await fetch('/api/push/vapid-public-key');
        const d = await r.json();
        if (!d.ok || !d.key) return;
      } catch(e){ return; }
      // 페이지 로드 후 3초 정도 후 표시 (사용자가 페이지에 익숙해진 뒤)
      setTimeout(showBanner, 3000);
    }
    function showBanner() {
      if (document.getElementById('mangoi-push-banner')) return;
      const isMobile = window.innerWidth <= 640;
      const html = `
        <div id="mangoi-push-banner" style="position:fixed;${isMobile?'bottom:16px;left:8px;right:8px':'bottom:20px;right:20px;max-width:380px'};z-index:9998;background:linear-gradient(135deg,#1e293b,#0f172a);color:#f1f5f9;border:1px solid rgba(251,191,36,0.35);border-radius:16px;padding:16px 18px;box-shadow:0 12px 32px -8px rgba(0,0,0,0.6),0 0 0 1px rgba(251,191,36,0.18);font-family:MangoiHanSC,'Noto Sans KR',Malgun Gothic,맑은 고딕,sans-serif;animation:mpb-slideUp 0.35s ease-out">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="font-size:28px;flex-shrink:0">🔔</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:800;font-size:14px;color:#fbbf24;margin-bottom:4px" data-ko="망고아이 알림 받기" data-en="Get Mangoi Alerts">망고아이 알림 받기</div>
              <div style="font-size:12.5px;line-height:1.55;color:#cbd5e1" data-ko="수업 시작, 평가서 도착, 학원 공지를 휴대폰/PC 잠금화면에 바로 받아보세요. 무료!" data-en="Get instant lock-screen alerts for lesson start, evaluations, and announcements. Free!">수업 시작, 평가서 도착, 학원 공지를 휴대폰/PC 잠금화면에 바로 받아보세요. 무료!</div>
              <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
                <button onclick="mpbAccept()" style="flex:1;min-width:90px;padding:8px 14px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;border:0;border-radius:8px;cursor:pointer;font-size:12.5px" data-ko="✨ 알림 받기" data-en="✨ Get Alerts">✨ 알림 받기</button>
                <button onclick="mpbLater()" style="padding:8px 12px;background:transparent;color:#94a3b8;border:1px solid rgba(148,163,184,0.3);border-radius:8px;cursor:pointer;font-size:12px" data-ko="나중에" data-en="Later">나중에</button>
                <button onclick="mpbNever()" style="padding:8px 12px;background:transparent;color:#94a3b8;border:0;border-radius:8px;cursor:pointer;font-size:11.5px;text-decoration:underline" data-ko="안 보기" data-en="Don't ask">안 보기</button>
              </div>
            </div>
          </div>
        </div>
        <style>@keyframes mpb-slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}</style>
      `;
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
      // 새로 추가한 노드에 i18n 적용
      if (window.applyI18n) window.applyI18n(document.getElementById('mangoi-push-banner'));
    }

    window.mpbAccept = async function() {
      const banner = document.getElementById('mangoi-push-banner');
      if (banner) banner.remove();
      if (window.mangoiPushSubscribe) await window.mangoiPushSubscribe();
      dismiss(365); // 구독했으니 1년 다시 안 묻기 (사실상 영구)
    };
    window.mpbLater = function() {
      const banner = document.getElementById('mangoi-push-banner');
      if (banner) banner.remove();
      dismiss(7); // 일주일 후 다시
    };
    window.mpbNever = function() {
      const banner = document.getElementById('mangoi-push-banner');
      if (banner) banner.remove();
      dismiss(365); // 1년 다시 안 묻기
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', maybeShow);
    } else {
      maybeShow();
    }
  })();

  // 2) 홈화면 추가 안내 — Android (beforeinstallprompt) + iOS Safari 별도
  const DISMISS_KEY = 'mangoi_pwa_dismissed_at';
  const SHOW_AFTER_MS = 30 * 86400 * 1000;  // 30일 1회

  function canShow() {
    try {
      const last = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return (Date.now() - last) > SHOW_AFTER_MS;
    } catch { return true; }
  }
  function dismiss(daysOffset) {
    try {
      const offsetMs = (daysOffset || 0) * 86400 * 1000;
      localStorage.setItem(DISMISS_KEY, String(Date.now() - SHOW_AFTER_MS + offsetMs));
    } catch {}
    const el = document.getElementById('pwa-install-bar');
    if (el) el.remove();
  }

  // Android Chrome / Edge: beforeinstallprompt 이벤트 capture
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (canShow() && !isStandalone()) setTimeout(() => showAndroidInstall(), 3000);
  });

  // iOS Safari: beforeinstallprompt 없음 → 직접 안내
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           navigator.standalone === true;
  }

  function showAndroidInstall() {
    if (document.getElementById('pwa-install-bar')) return;
    const isKo = (window.getLang ? window.getLang() : 'ko') === 'ko';
    const bar = document.createElement('div');
    bar.id = 'pwa-install-bar';
    bar.classList.add('pwa-android');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:9800;background:linear-gradient(135deg,rgba(20,28,48,0.95),rgba(15,21,37,0.95));border:1px solid rgba(251,191,36,0.45);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;color:#f1f5f9;box-shadow:0 12px 36px -8px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.05);backdrop-filter:blur(14px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;animation:pwaSlide .3s cubic-bezier(.34,1.56,.64,1)';
    bar.innerHTML = `
      <img src="/img/icon-192.png" alt="" style="width:44px;height:44px;border-radius:10px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:800;color:#fff;line-height:1.3">${isKo?'Mangoi 앱 추가':'Install Mangoi App'}</div>
        <div style="font-size:11.5px;color:#cbd5e1;margin-top:2px">${isKo?'홈화면에 추가해 빠르게 접속':'Add to home screen for faster access'}</div>
      </div>
      <button onclick="pwaInstall()" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;border:0;padding:7px 12px;border-radius:99px;font-size:12px;font-weight:800;cursor:pointer;flex-shrink:0">${isKo?'설치':'Install'}</button>
      <button class="pwa-x" onclick="pwaDismiss()" style="background:transparent;border:0;color:#94a3b8;font-size:18px;cursor:pointer;flex-shrink:0;padding:4px 6px">✕</button>`;
    document.body.appendChild(bar);
  }

  function showIosInstall() {
    if (document.getElementById('pwa-install-bar')) return;
    const isKo = (window.getLang ? window.getLang() : 'ko') === 'ko';
    const bar = document.createElement('div');
    bar.id = 'pwa-install-bar';
    bar.classList.add('pwa-ios');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:9800;background:linear-gradient(135deg,rgba(20,28,48,0.95),rgba(15,21,37,0.95));border:1px solid rgba(251,191,36,0.45);border-radius:14px;padding:14px 16px;color:#f1f5f9;box-shadow:0 12px 36px -8px rgba(0,0,0,0.7);backdrop-filter:blur(14px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;animation:pwaSlide .3s cubic-bezier(.34,1.56,.64,1)';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <img src="/img/icon-192.png" alt="" style="width:44px;height:44px;border-radius:10px">
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:800;color:#fff">${isKo?'Mangoi 앱 추가 — iPhone/iPad':'Add Mangoi to iPhone/iPad'}</div>
          <div style="font-size:11.5px;color:#cbd5e1;margin-top:2px">${isKo?'홈화면에 추가하면 앱처럼 사용 가능':'Add to home screen to use like an app'}</div>
        </div>
        <button class="pwa-x" onclick="pwaDismiss()" style="background:transparent;border:0;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.30);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.7;color:#fde68a">
        ${isKo
          ? '① 하단 <b>공유 버튼 <span style="font-family:MangoiHanSC,apple-system,sans-serif">⬆</span></b> 누르기<br>② <b>"홈 화면에 추가"</b> 선택<br>③ <b>"추가"</b> 탭'
          : '① Tap <b>Share button</b> at bottom<br>② Tap <b>"Add to Home Screen"</b><br>③ Tap <b>"Add"</b>'}
      </div>`;
    document.body.appendChild(bar);
  }

  window.pwaInstall = async function(){
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      console.log('[pwa] 사용자가 설치 수락');
    }
    deferredPrompt = null;
    dismiss(0);
  };
  window.pwaDismiss = function(){ dismiss(0); };

  // 📲 팝업 포스터 CTA → 실제 앱 설치 실행 (안드로이드 프롬프트 / iOS·기타 안내 재사용)
  window.paInstallApp = async function(popupId){
    try { if (window.paTrackClick && popupId) window.paTrackClick(popupId, '#install'); } catch(e){}
    const isKo = (window.getLang ? window.getLang() : 'ko') === 'ko';
    if (isStandalone()) {
      alert(isKo ? '이미 앱이 설치돼 있어요! 홈 화면의 망고아이 아이콘으로 실행해 주세요 😊'
                 : 'The app is already installed. Launch it from your home screen.');
      return;
    }
    if (deferredPrompt) {                    // 안드로이드 크롬/엣지·데스크톱 크롬
      try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch(e){}
      deferredPrompt = null; dismiss(0);
      return;
    }
    if (isIOS()) { showIosInstall(); return; }   // 아이폰: 공유→홈 화면에 추가 안내
    // 그 외(카카오톡 등 인앱 브라우저·미지원) → 안내
    showAndroidInstall();
    alert(isKo
      ? '앱 설치 방법\n\n• 크롬/삼성인터넷: 화면 하단 "설치" 버튼 또는 브라우저 메뉴 → "앱 설치 / 홈 화면에 추가"\n• 카카오톡 등 인앱 화면: 우측 상단 메뉴에서 "다른 브라우저로 열기"(크롬) 후 설치'
      : 'To install: tap the "Install" button below, or open the browser menu → "Install app / Add to Home Screen". In in-app browsers, open in Chrome first.');
  };

  // 페이지 로드 후 iOS 안내 (Android는 이벤트 기다림)
  window.addEventListener('load', () => {
    if (isStandalone()) return;  // 이미 PWA 모드면 안 보임
    if (isIOS() && canShow()) {
      setTimeout(() => showIosInstall(), 4000);
    }
  });

  // 애니메이션 keyframe 동적 주입
  const style = document.createElement('style');
  style.textContent = '@keyframes pwaSlide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);
})();


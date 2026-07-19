// 🌐 Mangoi Service Worker — PWA 오프라인 캐시 + 빠른 로딩
// 버전 갱신 시 CACHE_NAME 의 숫자만 바꾸면 모든 사용자에게 즉시 새 버전 전파

const CACHE_NAME = 'mangoi-20260720040804-fresh';
const RUNTIME_CACHE = 'mangoi-20260720040804-fresh-rt';

// 첫 설치 때 미리 캐시할 핵심 자산 (필수 only — 너무 많으면 install 실패)
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/apple-touch-icon.png',
  '/img/Mangoi_Character.jpg',
];

// === Install: 핵심 자산 미리 다운로드 ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 개별 fetch 로 일부 실패해도 install 계속 진행
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(e => console.warn('[sw] precache fail:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// === Activate: 오래된 캐시 정리 ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// === Fetch 전략 ===
//   - API 호출 (/api/*) : 네트워크 우선 (오프라인 시 캐시 fallback)
//   - 화상수업 WebSocket (/ws/*) : 캐시 안 함
//   - HTML 페이지 : 네트워크 우선 (오프라인 시 캐시된 / 반환)
//   - 정적 자산 (이미지/JS/CSS) : 네트워크 우선 (배포 즉시 반영, 오프라인 시 캐시 fallback)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET 외 (POST/PUT/DELETE) 는 캐시 안 함
  if (request.method !== 'GET') return;

  // 외부 도메인 (R2 미디어 등) 은 직접 통과
  if (url.origin !== location.origin) return;

  // WebSocket 업그레이드는 SW 가 가로채지 않음
  if (url.pathname.startsWith('/ws/')) return;

  // 🔊 오디오/미디어 스트리밍 (TTS 등) 은 SW 가 절대 가로채지 않음 — 네트워크로 직접 통과.
  //   <audio>/<video> 는 Range 요청을 보내는데, networkFirst 의 resp.clone()+cache.put 가
  //   스트림을 tee 하면서 재생이 영원히 stall(무음) 되는 버그가 있음. 그래서 브라우저가 직접 처리하게 둔다.
  if (request.destination === 'audio' || request.destination === 'video' ||
      request.headers.has('range') ||
      url.pathname === '/api/tts-free' || url.pathname === '/api/ops-tts') {
    return;
  }

  // API: 네트워크 우선 + 짧은 캐시 fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, 5000));
    return;
  }

  // HTML 요청 (탐색)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        // 항상 최신 HTML — 브라우저 HTTP 캐시 우회 (배포 즉시 반영)
        return await fetch(request, { cache: 'no-store' });
      } catch (e) {
        const cached = await caches.match('/');
        if (cached) return cached;
        // 오프라인 폴백 — 데드엔드 방지: 네트워크 복구 시 스스로 SW 해제 후 새로고침
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>오프라인</title>
<div style="padding:40px;font-family:sans-serif;text-align:center;color:#333">
<h1>📡 네트워크 연결 안 됨</h1>
<p id="m">연결을 확인하는 중입니다…</p>
<button onclick="recover()" style="padding:10px 20px;background:#fbbf24;color:#000;border:0;border-radius:8px;font-weight:700;cursor:pointer">새로고침</button>
</div>
<script>
async function recover(){
  try{ if(navigator.serviceWorker){ var rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(function(r){return r.unregister();})); } }catch(e){}
  location.replace('/?_swkill='+Date.now());
}
var _n=0,_t=setInterval(async function(){
  _n++;
  try{ var r=await fetch('/?_ping='+Date.now(),{cache:'no-store'}); if(r&&r.ok){ clearInterval(_t); recover(); return; } }catch(e){}
  if(_n>20){ clearInterval(_t); var m=document.getElementById('m'); if(m) m.textContent='잠시 후 다시 시도해주세요.'; }
},3000);
</script>`,
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // 정적 자산 (이미지/JS/CSS/폰트): 네트워크 우선 — 배포 즉시 반영, 오프라인 시 캐시 fallback
  event.respondWith(networkFirst(request, RUNTIME_CACHE, 4000));
});

// 네트워크 우선 (timeout 시 캐시 fallback)
async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const networkPromise = fetch(request).then(resp => {
      // 성공 응답만 캐시 (5xx 제외)
      // 추가 방어: /api/ 경로는 HTML 응답을 캐시 안 함 (워커 다운 시 어셋 fallback HTML 캐싱 방지)
      const url = new URL(request.url);
      const isApi = url.pathname.startsWith('/api/');
      const ct = resp.headers.get('content-type') || '';
      const isHtml = ct.includes('text/html');
      const shouldCache = resp.ok && !(isApi && isHtml);
      if (shouldCache) cache.put(request, resp.clone()).catch(()=>{});
      return resp;
    });
    if (!timeoutMs) return await networkPromise;
    return await Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
  } catch (e) {
    const cached = await cache.match(request);
    // 캐시된 HTML 이 /api/ 경로에 있으면 사용 안 함 (오염된 캐시 방어)
    if (cached) {
      const url = new URL(request.url);
      const isApi = url.pathname.startsWith('/api/');
      const ct = cached.headers.get('content-type') || '';
      const isHtml = ct.includes('text/html');
      if (!(isApi && isHtml)) return cached;
      // 오염된 HTML 캐시는 삭제
      cache.delete(request).catch(()=>{});
    }
    // 네트워크 실패 시 콘솔 에러 대신 503 + JSON 으로 응답
    return new Response(JSON.stringify({ ok:false, error: 'network unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// === 메시지: 클라이언트가 새 버전으로 즉시 강제 갱신 요청 ===
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// === 🔔 Phase WP1: Web Push 이벤트 (wakeup → /api/push/pending 에서 메시지 fetch) ===
self.addEventListener('push', (event) => {
  // 페이로드가 동봉된 경우 우선 사용 (현재 구현은 페이로드 없는 wakeup)
  let payload = null;
  if (event.data) {
    try { payload = event.data.json(); } catch(e) {
      try { payload = { title: '망고아이 알림', body: event.data.text() }; } catch(_) {}
    }
  }

  event.waitUntil((async () => {
    try {
      // 페이로드가 없으면 서버에서 큐된 메시지 가져오기
      if (!payload) {
        const reg = await self.registration.pushManager.getSubscription();
        if (reg && reg.endpoint) {
          const resp = await fetch('/api/push/pending?endpoint=' + encodeURIComponent(reg.endpoint));
          if (resp.ok) {
            const d = await resp.json();
            const messages = (d.messages || []);
            // 가장 최신 메시지 표시 (여러 개면 첫 번째)
            if (messages.length) payload = messages[0];
          }
        }
      }
      if (!payload || !payload.title) {
        payload = { title: '망고아이', body: '새 알림이 도착했어요' };
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body || '',
        icon: payload.icon || '/img/icon-192.png',
        badge: payload.badge || '/img/icon-192.png',
        tag: payload.tag || 'mangoi-' + Date.now(),
        data: { url: payload.url || '/' },
        renotify: true,
        requireInteraction: false,
      });
    } catch(e) {
      console.warn('[sw:push] error:', e);
      await self.registration.showNotification('망고아이 알림', {
        body: '새 메시지가 있어요',
        icon: '/img/icon-192.png',
      });
    }
  })());
});

// === 🔔 알림 클릭 시 해당 URL 열기 (이미 열려있으면 포커스) ===
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      try {
        const cUrl = new URL(c.url);
        if (cUrl.origin === self.location.origin) {
          c.focus();
          if (cUrl.pathname + cUrl.search !== url) c.navigate(url);
          return;
        }
      } catch(_) {}
    }
    await self.clients.openWindow(url);
  })());
});

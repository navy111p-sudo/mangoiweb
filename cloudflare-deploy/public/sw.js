// 🌐 Mangoi Service Worker — PWA 오프라인 캐시 + 빠른 로딩
// 버전 갱신 시 CACHE_NAME 의 숫자만 바꾸면 모든 사용자에게 즉시 새 버전 전파

const CACHE_NAME = 'mangoi-20260827095512-fresh';
const RUNTIME_CACHE = 'mangoi-20260827095512-fresh-rt';

// 🔒 버전이 박힌 자산 전용 캐시 — 이름에 **배포 시각을 넣지 않는다**(2026-08-08).
//   위 두 이름은 deploy.ps1 이 배포할 때마다 새 값으로 갈아끼우고, activate 가
//   «이름이 다른 캐시»를 전부 지운다. 그래서 배포 한 번에 **전 사용자의 캐시가 통째로 버려졌다.**
//   그런데 여기 담기는 것은 URL 에 ?v= 가 붙은 js/css 뿐이다 — 내용이 바뀌면 URL 도 바뀌므로
//   옛것이 잘못 나올 수가 없다. 버릴 이유가 없으니 배포와 무관하게 살려 둔다.
//   ⚠️ deploy.ps1 은 CACHE_NAME / RUNTIME_CACHE 두 줄만 정규식으로 치환한다. 이 이름은 안 건드린다.
const ASSET_CACHE = 'mangoi-assets-v1';
const ASSET_CACHE_MAX = 400;   // 넘으면 오래된 것부터 정리(버전이 바뀐 옛 파일이 쌓인다)

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
//   ⚠️ ASSET_CACHE 는 **지우지 않는다**. 이름에 배포 시각이 없어서 여기 필터에 걸리지 않는다.
//      대신 너무 커지지 않게 이때 한 번만 솎아 낸다(배포마다 1회, 사용자는 못 느낀다).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE && k !== ASSET_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(pruneAssetCache).then(enableNavPreload).then(() => self.clients.claim())
  );
});

// 🚀 (2026-08-20) Navigation Preload — «첫 화면 요청» 을 SW 가 깨어나기를 기다리지 않고
//   브라우저가 곧바로 시작하게 한다. SW 부팅(수십~수백 ms)이 첫 화면에서 통째로 사라진다.
//   미지원 브라우저는 registration.navigationPreload 자체가 없으므로 조용히 건너뛴다.
async function enableNavPreload() {
  try {
    if (self.registration && self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
  } catch (e) { /* 지원 안 하면 그냥 지금까지처럼 동작한다 */ }
}

// 버전이 올라간 옛 파일(예: adm-core.js?v=44)은 아무도 다시 요청하지 않으므로 그냥 쌓인다.
// 넘치면 오래된 쪽(먼저 들어온 순)부터 잘라 낸다. Cache API 는 삽입 순서를 보존한다.
async function pruneAssetCache() {
  try {
    const cache = await caches.open(ASSET_CACHE);
    const keys = await cache.keys();
    if (keys.length <= ASSET_CACHE_MAX) return;
    const drop = keys.slice(0, keys.length - Math.floor(ASSET_CACHE_MAX / 2));
    await Promise.all(drop.map(k => cache.delete(k)));
  } catch (e) { /* 캐시 정리 실패가 화면을 막으면 안 된다 */ }
}

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

  // ⚡ (2026-08-08) 버전이 박힌 js/css 는 **cache-first**. 관리자 제외 규칙보다 먼저 본다.
  //
  //   왜 안전한가 — URL 에 ?v= 가 붙어 있으면 **URL 이 곧 내용의 버전**이다.
  //   파일을 고치면 그것을 부르는 HTML 의 ?v= 도 함께 올라가므로(그렇게 안 하면 지금도
  //   1년짜리 immutable HTTP 캐시 때문에 옛 파일이 나간다), 같은 URL 로 다른 내용이
  //   내려오는 일이 구조적으로 없다. 즉 아래 «옛 화면 잔상» 사고의 원인과 무관하다.
  //   그 사고의 진짜 원인은 캐시가 아니라 **networkFirst 의 타임아웃 폴백**이었다
  //   (느린 회선에서 4초가 지나면 «아직 오고 있는 새 파일» 대신 옛 캐시를 내줬다).
  //   그 타임아웃은 이번에 제거했다. 아래 networkFirst 주석 참조.
  //
  //   효과 — admin.html 은 ?v= 붙은 js/css 를 79개 부른다. 두 번째 방문부터 요청 0건.
  //   ⚠️ 관리자 화면의 **HTML·API** 는 여전히 캐시하지 않는다(그건 아래 제외 규칙 그대로).
  if (/\.(js|css)$/.test(url.pathname) && /(^|&)v=/.test(url.search.replace(/^\?/, ''))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 🛡️ (2026-07-22) 관리자 화면은 SW 캐시를 아예 안 태움 — 네트워크로 직접 통과.
  //   networkFirst 의 timeout(4~5초) 폴백이 느린 회선에서 "옛날 CSS/이미지/API 응답"을
  //   보여줘 관리자 페이지에 옛 화면 잔상이 생기던 원인. 관리자에겐 오프라인 지원보다
  //   항상 최신이 훨씬 중요하므로 브라우저 HTTP 캐시(no-cache 재검증)에만 맡긴다.
  //   경로 + referrer 둘 다로 거른다(관리자 페이지가 불러오는 공용 /img/·/css/ 서브리소스 포함).
  if (url.pathname === '/admin.html' || url.pathname.startsWith('/admin/') ||
      url.pathname.startsWith('/js/adm-') || url.pathname.startsWith('/api/admin/') ||
      (request.referrer && (request.referrer.includes('/admin.html') || request.referrer.includes('/admin/')))) {
    return;
  }

  // 🔊 오디오/미디어 스트리밍 (TTS 등) 은 SW 가 절대 가로채지 않음 — 네트워크로 직접 통과.
  //   <audio>/<video> 는 Range 요청을 보내는데, networkFirst 의 resp.clone()+cache.put 가
  //   스트림을 tee 하면서 재생이 영원히 stall(무음) 되는 버그가 있음. 그래서 브라우저가 직접 처리하게 둔다.
  if (request.destination === 'audio' || request.destination === 'video' ||
      request.headers.has('range') ||
      url.pathname === '/api/tts-free' || url.pathname === '/api/ops-tts') {
    return;
  }

  // API: 네트워크 우선 + 캐시 fallback
  //   🪤 (2026-08-08) 폴백 시각을 5초 → 25초로 늘렸다.
  //      필리핀 회선에서 API 가 5초 넘는 건 «고장» 이 아니라 그냥 «느린 것» 이다.
  //      5초에서 폴백하면 아직 오고 있는 최신 응답을 버리고 옛 데이터를 내주게 된다.
  //      타임아웃은 «무한 스피너 방지» 라는 원래 목적만 남기고, 그 선을 훨씬 뒤로 민다.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, 25000));
    return;
  }

  // HTML 요청 (탐색)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(handleNavigate(event, request));
    return;
  }

  // 정적 자산 (이미지/폰트, 그리고 ?v= 가 없는 js/css): 네트워크 우선.
  //   🪤 (2026-08-08) **타임아웃 폴백을 없앴다.** 이것이 「관리자 화면에 옛 CSS·이미지가
  //      남는다」던 사고의 진짜 원인이었다 — 느린 회선에서 4초가 지나면, 새 파일이 아직
  //      오고 있는데도 옛 캐시를 내주고 그걸로 화면을 그렸다. 회선이 느릴수록 더 자주 터졌다.
  //      이제 폴백은 **네트워크가 실제로 실패했을 때만** 일어난다(= 진짜 오프라인).
  //      느린 것은 기다린다. 기다리는 동안 화면이 비는 것보다, 옛것으로 잘못 그리는 게 나쁘다.
  event.respondWith(networkFirst(request, RUNTIME_CACHE));
});

/* 🥭 (2026-08-20) 첫 화면(탐색) 요청 — «영원히 로고만» 을 구조적으로 없앤다.
   ─────────────────────────────────────────────────────────────────────────
   [증상] 사장님 제보 — 카톡을 보고 돌아오거나 다른 사이트에 갔다 오면 망고아이 로고만
          뜨고 화면이 안 나온다. 홈 화면에 설치된 웹앱(WebAPK)은 안드로이드가 뒤에서
          지워 버리므로 «처음부터» 다시 켜지는데, 그때 시작 화면(로고)은 **첫 픽셀이
          그려질 때까지** 떠 있다.
   [원인] 여기 있던 코드는 `await fetch(request, {cache:'no-store'})` 한 줄이었고
          **제한시간이 없었다.** 네트워크가 «실패» 하면 아래 캐시로 넘어가지만,
          휴대폰이 잠자다 깨어날 때 흔한 «연결은 살아 있는데 응답이 안 오는» 상태는
          실패가 아니라 그냥 기다림이다 → 로고 화면이 몇 분이고 남는다.
   [해결] 이미 받아 둔 첫 화면이 있으면 3.5초만 기다리고, 안 오면 그것으로 «먼저 그린다».
          새 HTML 은 뒤에서 계속 받아 캐시에 넣으므로 **다음 번엔 최신**이다.
   ⚠️ 2026-08-08 에 「느린 회선에서 옛것을 내주더라」며 타임아웃을 없앤 이력이 있다.
      그건 **그림·js/css(서브리소스)** 이야기이고 그 규칙은 그대로 뒀다(아래 networkFirst).
      여기는 «첫 화면 HTML 하나» 뿐이고, 못 그리면 화면이 아예 없다 — 판단 기준이 다르다.
   ⚠️ ?v= 는 쿼리스트링이라 파일 경로가 아니다. 옛 HTML 을 그려도 참조하는 js/css 경로는
      그대로 있으므로 404 가 나지 않는다. */
const NAV_TIMEOUT_MS = 3500;

async function handleNavigate(event, request) {
  const cache = await caches.open(CACHE_NAME);

  const fromNetwork = (async () => {
    let resp = null;
    // Navigation Preload 가 켜져 있으면 브라우저가 이미 시작해 둔 응답을 그대로 받는다.
    try { resp = await event.preloadResponse; } catch (e) { resp = null; }
    if (!resp) resp = await fetch(request, { cache: 'no-store' });
    // 성공한 HTML 만 «첫 화면» 자리에 넣어 둔다(다음 번 콜드 스타트가 즉시 그려진다).
    try {
      const ct = (resp && resp.headers.get('content-type')) || '';
      if (resp && resp.ok && ct.includes('text/html')) {
        cache.put('/', resp.clone()).catch(() => {});
      }
    } catch (e) { /* 캐시 저장 실패가 화면을 막으면 안 된다 */ }
    return resp;
  })();

  const cached = await cache.match('/');

  if (cached) {
    try {
      return await Promise.race([
        fromNetwork,
        new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), NAV_TIMEOUT_MS))
      ]);
    } catch (e) {
      // 느리거나 반쯤 끊겼다 → 가진 것으로 «먼저» 그린다. 새 HTML 은 계속 받아 둔다.
      event.waitUntil(fromNetwork.catch(() => {}));
      return cached;
    }
  }

  // 첫 방문이라 가진 것이 없다 — 기다리는 수밖에 없고, 실패하면 안내 화면.
  try { return await fromNetwork; } catch (e) { return offlineFallbackResponse(); }
}

// 오프라인 폴백 — 데드엔드 방지: 네트워크 복구 시 스스로 SW 해제 후 새로고침
function offlineFallbackResponse() {
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

// 캐시 우선 — ?v= 로 버전이 박힌 자산 전용.
//   같은 URL 이면 같은 내용이 보장되므로 «최신 확인» 자체가 불필요하다.
//   지연 350ms 회선에서 이 확인 한 번이 파일당 0.35초다. admin.html 은 그런 파일이 79개다.
async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const resp = await fetch(request);
    // 성공한 것만 담는다. 실패 응답을 담으면 그 URL 이 영원히 깨진 채로 굳는다.
    if (resp && resp.ok) cache.put(request, resp.clone()).catch(() => {});
    return resp;
  } catch (e) {
    // 오프라인인데 캐시에도 없다 — 브라우저에게 평소의 네트워크 오류를 그대로 보여 준다.
    throw e;
  }
}

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

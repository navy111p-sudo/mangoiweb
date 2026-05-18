// 🌐 Mangoi Service Worker — PWA 오프라인 캐시 + 빠른 로딩
// 버전 갱신 시 CACHE_NAME 의 숫자만 바꾸면 모든 사용자에게 즉시 새 버전 전파

const CACHE_NAME = 'mangoi-v2';
const RUNTIME_CACHE = 'mangoi-runtime-v2';

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
//   - 정적 자산 (이미지/JS/CSS) : 캐시 우선
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GET 외 (POST/PUT/DELETE) 는 캐시 안 함
  if (request.method !== 'GET') return;

  // 외부 도메인 (R2 미디어 등) 은 직접 통과
  if (url.origin !== location.origin) return;

  // WebSocket 업그레이드는 SW 가 가로채지 않음
  if (url.pathname.startsWith('/ws/')) return;

  // API: 네트워크 우선 + 짧은 캐시 fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, 5000));
    return;
  }

  // HTML 요청 (탐색)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // 정적 자산 (이미지/JS/CSS/폰트): 캐시 우선
  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});

// 네트워크 우선 (timeout 시 캐시 fallback)
async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const networkPromise = fetch(request).then(resp => {
      // 성공 응답만 캐시 (5xx 제외)
      if (resp.ok) cache.put(request, resp.clone()).catch(()=>{});
      return resp;
    });
    if (!timeoutMs) return await networkPromise;
    return await Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
    ]);
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 네트워크 실패 시 콘솔 에러 대신 503 + JSON 으로 응답
    return new Response(JSON.stringify({ ok:false, error: 'network unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 캐시 우선 (없으면 네트워크 → 캐시 저장)
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // 백그라운드로 최신 fetch (stale-while-revalidate)
    fetch(request).then(resp => {
      if (resp && resp.ok) cache.put(request, resp.clone()).catch(()=>{});
    }).catch(()=>{});
    return cached;
  }
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone()).catch(()=>{});
    return resp;
  } catch (e) {
    // 네트워크 실패해도 콘솔 빨간 에러 안 띄우게 — 빈 503 응답 반환
    return new Response('', { status: 503, statusText: 'Offline / SW' });
  }
}

// === 메시지: 클라이언트가 새 버전으로 즉시 강제 갱신 요청 ===
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

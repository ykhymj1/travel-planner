/* YKH 여정 설계소 — Service Worker v2
   캐시 전략: 앱 껍데기(HTML/아이콘/폰트)만 캐싱 → 오프라인에서도 앱 열림
   Worker API 호출(일정 생성)은 항상 서버로, 캐시 안 함 */

const CACHE_NAME = 'ykh-travel-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
];

/* ──────────────── install: 핵심 파일 사전 캐싱 ──────────────── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] precache 일부 실패 (무시됨):', err))
  );
});

/* ──────────────── activate: 이전 캐시 정리 ──────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ──────────────── fetch: 요청 가로채기 ──────────────── */
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  /* 1. Cloudflare Worker (일정 생성 API) — 항상 네트워크 직접 호출 */
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: '오프라인 상태입니다. 네트워크를 확인해 주세요.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  /* 2. 외부 CDN(폰트 등) — 캐시 우선, 없으면 네트워크 */
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => cached || new Response('', { status: 408 }));
      })
    );
    return;
  }

  /* 3. 앱 자체 파일 — 캐시 우선, 없으면 네트워크 후 캐시 저장 */
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.ok && request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() =>
        /* 오프라인에서 앱 요청 실패 시 index.html로 폴백 */
        caches.match('./index.html') ||
        caches.match('./')
      );
    })
  );
});

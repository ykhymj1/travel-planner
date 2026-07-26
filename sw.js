/* YKH 여정 설계소 — Service Worker
   오프라인에서도 앱 껍데기가 열리게 캐싱.
   실제 일정 생성은 Worker 서버가 필요하므로 오프라인엔 안내 표시. */

const CACHE = 'ykh-travel-v1';
const PRECACHE = [
  '/travel-planner/',
  '/travel-planner/index.html',
  '/travel-planner/manifest.json',
  '/travel-planner/icons/icon-192.png',
  '/travel-planner/icons/icon-512.png',
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Cloudflare Worker 호출은 캐시 안 함 (항상 서버로)
  if (url.hostname.endsWith('.workers.dev')) return;
  // 외부 API도 캐시 안 함
  if (url.hostname !== self.location.hostname) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response('{"error":"오프라인 상태입니다. 네트워크를 확인해 주세요."}', {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }
  // 앱 자체 파일은 캐시 우선 → 네트워크 예비
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/travel-planner/'));
    })
  );
});

/* YKH 여정 설계소 — Service Worker v5.0
   캐시 전략: 앱 껍데기(HTML/아이콘/폰트)만 캐싱 → 오프라인에서도 앱 열림
   Worker API 호출(일정 생성)은 항상 서버로, 캐시 안 함

   ⚠ 배포할 때마다 CACHE_NAME의 v번호를 올리세요 (예: v3 → v4).
   버전을 안 올리면 브라우저가 옛 캐시를 계속 쓰기 때문에, index.html/sw.js를
   고쳐도 사용자 화면에는 반영이 안 됩니다. index.html 맨 아래 APP_VERSION도
   반드시 같은 번호로 같이 올려주세요 — 화면 하단 버전 표시로 실제 반영 여부를 확인할 수 있습니다. */

const CACHE_NAME = 'ykh-travel-v5-1';
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

/* ──────────────── message: index.html의 "지금 업데이트" 버튼 ──────────────── */
/* 새 SW가 install 완료되어 대기(waiting) 중일 때, 사용자가 버튼을 누르면
   index.html이 이 메시지를 보내 즉시 활성화시킨다 (자동 새로고침은 index.html이 처리). */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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

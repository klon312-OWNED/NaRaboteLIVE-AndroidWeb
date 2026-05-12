const CACHE_NAME = 'narabote-v1.3.0';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) {
    if (e.request.method === 'GET') {
      e.respondWith(
        fetch(e.request).then(resp => {
          const clone = resp.clone();
          const url = new URL(e.request.url);
          const cacheKey = 'api:' + url.pathname + url.search;
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone)).catch(() => {});
          return resp;
        }).catch(() => {
          const url = new URL(e.request.url);
          const cacheKey = 'api:' + url.pathname + url.search;
          return caches.match(cacheKey).then(cached => cached ||
            new Response(JSON.stringify({ success: false, message: 'Офлайн: нет кэша', offline: true }), { headers: { 'Content-Type': 'application/json' } })
          );
        })
      );
      return;
    }
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ success: false, message: 'Офлайн: запрос будет отправлен при подключении', offline: true }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    if (list.length) return list[0].focus();
    return clients.openWindow('/');
  }));
});

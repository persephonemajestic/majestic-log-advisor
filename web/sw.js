/* Majestic Log Advisor: сайт для телефона. Страница — сначала из сети (всегда свежая версия), без сети — из кэша.
   Запросы к серверу команды (/v1/) не кэшируются. Файлы, которыми поделились из другого приложения (Android), передаются странице. */
const C = 'mla-m-v1', SHARE = 'mla-share';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(['/m/', '/m/icon-180.png', '/m/icon-192.png'])).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C && k !== SHARE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith('/m/')) return;
  if (e.request.method === 'POST' && u.pathname === '/m/share') {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), c = await caches.open(SHARE);
        for (const k of await c.keys()) await c.delete(k);
        let i = 0; for (const f of fd.getAll('f')) { if (!f || typeof f === 'string') continue; await c.put('/m/__share/' + (i++), new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'file'), 'content-type': f.type || 'application/octet-stream' } })); }
      } catch (err) {}
      return Response.redirect('/m/?share=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate' || u.pathname === '/m/' || u.pathname === '/m/index.html') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put('/m/', cp)); } return r; }).catch(() => caches.match('/m/')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

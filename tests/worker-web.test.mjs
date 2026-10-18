// Сервер: сайт для телефона (/m/) — страница, манифест, service worker; вход по коду устройства через тот же список доступа.
import W from '../worker/worker.js';
const kv = new Map(), DEV = 'A1B2C-3D4E5-F6A7B-8C9D0';
const files = { '/m/index.html': '<title>Анализатор логов Majestic</title>', '/m/sw.js': 'self.x=1', '/m/manifest.webmanifest': '{}', '/m/icon-180.png': 'PNG' };
const env = { ACCESS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } },
  ASSETS: { fetch: async (req) => { const p = new URL(req.url).pathname; if (p === '/m/') return new Response(files['/m/index.html']); return files[p] ? new Response(files[p]) : new Response('nf', { status: 404 }); } } };
const call = async (path, o = {}) => { const r = await W.fetch(new Request('https://x' + path, o), env); return { s: r.status, h: r.headers, t: await r.text() }; };
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
let r = await call('/m'); ok(r.s === 301 && /\/m\/$/.test(r.h.get('location')), '/m перенаправляет на /m/');
r = await call('/m/'); ok(r.s === 200 && /Анализатор/.test(r.t) && /text\/html/.test(r.h.get('content-type')) && r.h.get('cache-control') === 'no-cache', 'страница отдаётся без долгого кэша');
r = await call('/m/sw.js'); ok(r.s === 200 && r.h.get('service-worker-allowed') === '/m/' && r.h.get('cache-control') === 'no-cache', 'service worker с областью /m/');
r = await call('/m/icon-180.png'); ok(r.s === 200 && /max-age/.test(r.h.get('cache-control')), 'иконка кэшируется');
r = await call('/m/../index.html'); ok(r.s === 404 || r.s === 200 && !/Анализатор/.test(r.t), 'выход из папки /m/ не работает');
r = await call('/m/nope.js'); ok(r.s === 404, 'несуществующий файл — 404');
r = await call('/m/share', { method: 'POST' }); ok(r.s === 303, 'приём файлов без service worker возвращает на страницу');
r = await call('/v1/check', { headers: { 'X-HWID': DEV } }); ok(r.s === 403, 'код телефона без доступа отклоняется');
kv.set('h:' + DEV, JSON.stringify({ n: 'Телефон Ивана' }));
r = await call('/v1/check', { headers: { 'X-HWID': DEV } }); ok(r.s === 200 && JSON.parse(r.t).n === 'Телефон Ивана', 'код телефона, добавленный в админке, пускает');
process.exit(bad ? 1 : 0);

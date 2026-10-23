// Логи через Telegram на сайте для телефона: «Аккаунт» → «Привязать Telegram», бот принимает файл — он сам появляется в списке логов.
// Сервер — настоящий worker.js на временном хранилище, Telegram подменён.
const http = require('http'), fs = require('fs'), path = require('path');
const { ok, clientLog, done } = require('./helpers');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP tginbox'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..', '..'), WEB = path.join(ROOT, 'web');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), nl = idx.indexOf('\n') + 1;
const PAGE = idx.slice(0, nl) + fs.readFileSync(path.join(WEB, 'head.html'), 'utf8') + idx.slice(nl);
const kv = new Map(), meta = new Map();
const env = { ADMIN_PASS: 'adm', TG_TOKEN: '1:T', ACCESS: { get: async (k) => kv.get(k) ?? null, getWithMetadata: async (k) => ({ value: kv.get(k) ?? null, metadata: meta.get(k) || null }), put: async (k, v, o) => { kv.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); }, delete: async (k) => { kv.delete(k); meta.delete(k); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: meta.get(name) })), list_complete: true }) } };
const LOG = fs.readFileSync(clientLog('tg_client.log', { crash: true }), 'utf8'), sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.startsWith('https://api.telegram.org/file/bot1:T/')) return new Response(LOG);
  if (u.startsWith('https://api.telegram.org/bot1:T/')) { const m = u.split('/').pop(), b = o && o.body ? JSON.parse(o.body) : {}; sent.push({ m, b }); return new Response(JSON.stringify(m === 'getMe' ? { ok: true, result: { username: 'mla_bot' } } : m === 'getFile' ? { ok: true, result: { file_path: 'd/client.log' } } : { ok: true, result: {} })); }
  return realFetch(u, o);
};
let W = null;
const srv = http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x'), p = u.pathname;
  if (p.startsWith('/v1/') || p.startsWith('/tg/') || p.startsWith('/admin')) {
    const chunks = []; for await (const c of q) chunks.push(c); const body = Buffer.concat(chunks);
    const hd = {}; for (const k of ['x-hwid', 'x-session', 'content-type', 'authorization', 'x-telegram-bot-api-secret-token']) if (q.headers[k]) hd[k] = q.headers[k];
    if (p === '/v1/rules') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"v":1,"rules":[]}'); }
    const res = await W.fetch(new Request('http://x' + q.url, { method: q.method, headers: hd, body: q.method === 'POST' ? body : undefined }), env, { waitUntil() {} });
    r.writeHead(res.status, { 'content-type': res.headers.get('content-type') || 'application/json' }); return r.end(Buffer.from(await res.arrayBuffer()));
  }
  if (p === '/m/') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(PAGE); }
  r.writeHead(404); r.end();
});
const api = async (path, body, h) => { const res = await W.fetch(new Request('http://x' + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} }); return res.json(); };
(async () => {
  W = (await import(require('url').pathToFileURL(path.join(ROOT, 'worker', 'worker.js')).href)).default;
  await new Promise((res) => srv.listen(0, res)); const base = 'http://127.0.0.1:' + srv.address().port;
  const lk = await api('/admin/api', { action: 'tgLink' }, { Authorization: 'Bearer adm' }); const secret = sent.find((x) => x.m === 'setWebhook').b.secret_token;
  const hook = (up) => api('/tg/hook', up, { 'X-Telegram-Bot-Api-Secret-Token': secret });
  await hook({ message: { chat: { id: 1, type: 'private' }, text: '/start ' + lk.code } });
  const reg = await api('/v1/auth/register', { login: 'Petya', pass: 'Kot4ik-Murzik9', dev: 'iPhone' }); await api('/admin/api', { action: 'userSet', login: 'Petya', st: 'ok' }, { Authorization: 'Bearer adm' });
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((t) => { if (!localStorage.getItem('mla.sess')) localStorage.setItem('mla.sess', t); window.open = (u) => { window.__opened = u; return null; }; }, reg.token);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/m/'); await p.waitForTimeout(1200);
  ok(!(await p.$('#webGate')), 'вошли в аккаунт');
  await p.tap('#mTab [data-t=more]'); await p.waitForTimeout(450); await p.tap('[data-g=btnAcc]'); await p.waitForTimeout(400);
  ok(await p.isVisible('#tgAcc [data-wg=tglink]'), 'в «Аккаунте» есть «Привязать Telegram»');
  await p.tap('#tgAcc [data-wg=tglink]'); await p.waitForTimeout(500);
  const code = await p.evaluate(() => { const c = document.querySelector('#tgAcc code'); return c ? c.textContent.replace('/start ', '').trim() : ''; });
  ok(/^s_[a-z0-9]{10}$/.test(code) && await p.evaluate(() => /t\.me\/mla_bot\?start=s_/.test(window.__opened || '')), 'показана ссылка на бота с кодом, бот открывается');
  await hook({ message: { chat: { id: 500, type: 'private' }, text: '/start ' + code } });
  await hook({ message: { chat: { id: 500, type: 'private' }, document: { file_id: 'F', file_name: 'client.log', file_size: LOG.length } } });
  await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(2000);
  ok(await p.evaluate(() => /client\.log/.test(document.querySelector('.side').textContent)), 'файл из Telegram сам появился в анализаторе');
  ok(await p.evaluate(() => /Из Telegram: client\.log/.test(document.querySelector('#status').textContent)), 'сообщение «Из Telegram: client.log»');
  ok(await p.evaluate(() => /Telegram привязан/.test((document.querySelector('#tgAcc') || document.body).textContent)), 'в «Аккаунте» видно, что Telegram привязан');
  const cnt = () => p.evaluate(() => (document.querySelector('.side').textContent.match(/client\.log/g) || []).length);
  const c1 = await cnt(); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.waitForTimeout(1200);
  ok(await cnt() === c1, 'тот же файл второй раз не добавляется');
  /* другое устройство того же аккаунта: свежий файл тоже появляется */
  const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.evaluate(() => {}).catch(() => {}); await p2.goto(base + '/m/'); await p2.evaluate(() => localStorage.removeItem('mla.ib')); await p2.reload(); await p2.waitForTimeout(2500);
  ok(await p2.evaluate(() => /client\.log/.test(document.querySelector('.side').textContent)), 'на втором устройстве свежий файл тоже появляется');
  srv.close(); await done(b, errs);
})();

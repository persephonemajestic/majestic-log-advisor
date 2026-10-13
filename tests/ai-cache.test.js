// Сервер: повторный одинаковый запрос к ИИ отдаётся из кэша и не тратит дневной лимит.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src.replace(/export default /, 'module.exports = ').replace(/export class /g, 'class '))(mod, mod.exports);
const W = mod.exports;
(async () => {
  const kv = new Map(), env = { GEMINI_API_KEY: 'k', AI_DAILY: '5', ACCESS: { get: async (k) => kv.has(k) ? kv.get(k) : null, put: async (k, v) => { kv.set(k, v); } }, ASSETS: { fetch: async () => new Response('{}') } };
  const HW = 'AAAAA-BBBBB-CCCCC-DDDDD'; kv.set('h:' + HW, JSON.stringify({ n: 'тест', seen: Date.now() }));
  let calls = 0, lastBody = null; global.fetch = async (u, o) => { calls++; try { lastBody = JSON.parse(o.body); } catch (e) {} return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"category":"UNKNOWN"}' }] } }] })); };
  const call = (extra) => W.fetch(new Request('https://x/v1/ai', { method: 'POST', headers: { 'X-HWID': HW, 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ system: 's', input: 'вход для разбора достаточной длины' }, extra || {})) }), env).then((r) => r.json());
  let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const a = await call(), n1 = calls, b = await call(), n2 = calls, c = await call({ fresh: true });
  ok(a.ok && !a.cached && n1 === 1, 'первый запрос идёт в Gemini');
  ok(b.ok && b.cached === true && n2 === 1, 'повтор из кэша без обращения к Gemini');
  ok(c.ok && !c.cached && calls === 2, '«Разобрать заново» обходит кэш');
  const q = [...kv.keys()].filter((k) => k.startsWith('q:')).map((k) => kv.get(k));
  ok(q.length === 1 && q[0] === '2', 'лимит потрачен только на два реальных запроса (' + q.join() + ')');
  /* скриншот из плагина: передаётся в Gemini как картинка, другая картинка — другой ответ кэша */
  const im = await call({ image: { mime: 'image/jpeg', data: 'QUJD' } }), parts = lastBody && lastBody.contents[0].parts;
  ok(im.ok && !im.cached && parts && parts[1] && parts[1].inline_data.mime_type === 'image/jpeg' && parts[1].inline_data.data === 'QUJD', 'скриншот уходит в Gemini как картинка');
  const im2 = await call({ image: { mime: 'image/jpeg', data: 'REVG' } }); ok(im2.ok && !im2.cached, 'другой скриншот не берётся из кэша');
  const bad1 = await call({ image: { mime: 'text/html', data: 'QUJD' }, fresh: true }); ok(bad1.ok && lastBody.contents[0].parts.length === 1, 'не картинка — не прикладывается');
  process.exit(bad ? 1 : 0);
})();

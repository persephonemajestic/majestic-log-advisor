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
  /* лимит модели исчерпан (429) — запрос уходит следующей модели */
  env.AI_DAILY = '50'; const seen = []; global.fetch = async (u, o) => { seen.push(String(u).split('/models/')[1].split(':')[0]); if (seen.length === 1) return new Response('{"error":{"message":"quota"}}', { status: 429 }); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })); };
  const rot = await call({ input: 'другой запрос для проверки очереди моделей', fresh: true });
  ok(rot.ok && seen.length === 2 && seen[0] !== seen[1] && /lite/.test(seen[0]), 'при исчерпании лимита модели берётся следующая (' + seen.join(' → ') + ')');
  /* шаблоны команды: читать может любой с доступом, менять — только с паролем администратора */
  env.ADMIN_PASS = 'pw1';
  const tq = (path, body) => W.fetch(new Request('https://x' + path, body ? { method: 'POST', headers: { 'X-HWID': HW, 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: { 'X-HWID': HW } }), env).then((r) => r.json().then((j) => Object.assign(j, { _s: r.status })));
  ok((await tq('/v1/tpl')).none === true, 'шаблонов пока нет');
  const sets = [{ name: 'Majestic RP', items: [{ t: 'Проблемы с донатом', body: 'текст' }, { t: 'Пусто', body: '' }] }];
  ok((await tq('/v1/tpl/put', { pass: 'nope', sets }))._s === 403, 'без пароля администратора шаблоны не меняются');
  const put = await tq('/v1/tpl/put', { pass: 'pw1', sets }); ok(put.ok && put.n === 1, 'с паролем шаблоны сохранены (пустые отброшены)');
  const got = await tq('/v1/tpl'); ok(got.ok && got.sets[0].items[0].t === 'Проблемы с донатом' && got.by === 'тест', 'шаблоны выдаются команде');
  ok((await W.fetch(new Request('https://x/v1/tpl'), env)).status !== 200, 'без доступа шаблоны не выдаются');
  process.exit(bad ? 1 : 0);
})();

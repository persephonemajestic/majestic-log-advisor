// Приёмник для плагина Discord из app/main.js: ключ, источник, только вложения Discord, дубли, очередь до готовности интерфейса, данные игрока.
const fs = require('fs'), path = require('path'), http = require('http');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'main.js'), 'utf8');
const code = src.slice(src.indexOf('/* ---------- Приёмник для плагина Discord'), src.indexOf("ipcMain.on('ext-ready'")) + src.slice(src.indexOf("ipcMain.on('ext-ready'")).split('\n')[0];
let cfg = {}; const handlers = {}, ons = {}, sent = [], fetched = [];
const ctx = { require, Buffer, URL, console, readCfg: () => ({ ...cfg }), writeCfg: (c) => { cfg = { ...c }; }, SHELL_VERSION: 'test',
  app: { whenReady: () => ({ then: (f) => setTimeout(f, 0) }) }, ipcMain: { handle: (n, f) => { handlers[n] = f; }, on: (n, f) => { ons[n] = f; } },
  net: { fetch: async (u) => { fetched.push(u); return { ok: true, headers: { get: () => '5' }, arrayBuffer: async () => new TextEncoder().encode('hello').buffer }; } },
  mainWin: { isDestroyed: () => false, isFocused: () => true, flashFrame: () => {}, webContents: { send: (ch, d) => sent.push({ ch, d }) } } };
const fn = new Function(...Object.keys(ctx), code + '\nreturn { extHandle, extPlayer, get port() { return extPort; } };');
const api = fn(...Object.values(ctx));
const req = (o) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: api.port, method: o.method || 'POST', path: o.path || '/v1/import', headers: Object.assign({ 'content-type': 'application/json' }, o.headers || {}) }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, h: x.headers, j: b ? JSON.parse(b) : {} })); }); if (o.body) r.write(JSON.stringify(o.body)); r.end(); });
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
setTimeout(async () => {
  ok(api.port >= 47615, 'приёмник слушает порт ' + api.port);
  const info = await handlers['ext-info'](); const T = info.token;
  ok(info.on && /^[0-9a-f]{32}$/.test(T), 'ключ создан и показывается в настройках');
  const ping = await req({ method: 'GET', path: '/v1/ping' }); ok(ping.s === 200 && ping.j.app === 'majestic-log-advisor', 'проверка связи');
  const U = 'https://cdn.discordapp.com/attachments/1/2/client.log?ex=1&is=2&hm=3';
  ok((await req({ body: { url: U }, headers: { 'x-mla-token': 'wrong' } })).s === 401, 'без верного ключа отказ');
  ok((await req({ body: { url: U }, headers: { 'x-mla-token': T, origin: 'https://evil.example' } })).s === 403, 'запрос с чужого сайта отклонён');
  ok((await req({ body: { url: 'https://example.com/attachments/1/2/a.log' }, headers: { 'x-mla-token': T } })).s === 400, 'чужой сервер файлов отклонён');
  ok((await req({ body: { url: 'https://cdn.discordapp.com/attachments/1/2/virus.exe' }, headers: { 'x-mla-token': T } })).s === 400, 'не лог и не дамп — отклонён');
  const pre = await req({ method: 'OPTIONS', headers: { origin: 'https://discord.com' } }); ok(pre.s === 204 && pre.h['access-control-allow-private-network'] === 'true', 'страница Discord проходит проверку браузера');
  const r1 = await req({ body: { url: U, ticket: 'ticket-1234', ticketId: '99', player: { id: '123', name: 'Иван', username: 'ivan', nick: 'Ivan_Petrov', static: '55123', link: 'https://discord.com/channels/1/99/7', bad: 'x' } }, headers: { 'x-mla-token': T, origin: 'https://discord.com' } });
  ok(r1.s === 200 && r1.j.ok && fetched.length === 1, 'вложение скачано');
  ok(sent.length === 0, 'пока интерфейс не готов, файл ждёт в очереди');
  ons['ext-ready'](); const d = sent[0] && sent[0].d;
  ok(d && d.name === 'client.log' && d.ticket === 'ticket-1234' && d.ticketId === '99' && new TextDecoder().decode(d.data) === 'hello', 'после готовности файл передан в интерфейс с тикетом');
  ok(d && d.player && d.player.nick === 'Ivan_Petrov' && d.player.static === '55123' && !('bad' in d.player), 'данные игрока переданы и очищены');
  ok((await req({ body: { url: U }, headers: { 'x-mla-token': T } })).j.dup && fetched.length === 1, 'повторная отправка того же вложения пропущена');
  ok(api.extPlayer({ link: 'javascript:alert(1)' }) === null, 'посторонняя ссылка в данных игрока отброшена');
  const nt = (await handlers['ext-reset']()).token; ok(nt !== T && (await req({ body: { url: U.replace('client', 'c2') }, headers: { 'x-mla-token': T } })).s === 401, '«Новый ключ» отключает старый');
  /* файл присылает сам плагин (скачан сетью Discord) */
  const up = (tok, meta, data) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: api.port, method: 'POST', path: '/v1/upload', headers: { 'content-type': 'application/octet-stream', 'x-mla-token': tok, 'x-mla-meta': Buffer.from(JSON.stringify(meta)).toString('base64') } }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, j: b ? JSON.parse(b) : {} })); }); r.write(data); r.end(); });
  const n0 = sent.length, fz = fetched.length;
  const u1 = await up(nt, { url: 'https://cdn.discordapp.com/attachments/1/9/main.log?ex=1', name: 'main.log', ticket: 'ticket-77', ticketId: '77', player: { nick: 'Petr_Ivanov' } }, Buffer.from('LOGDATA'));
  const d2 = sent[n0] && sent[n0].d;
  ok(u1.s === 200 && d2 && d2.name === 'main.log' && new TextDecoder().decode(d2.data) === 'LOGDATA' && d2.ticketId === '77' && d2.player.nick === 'Petr_Ivanov' && fetched.length === fz, 'файл от плагина принят без скачивания приложением');
  ok((await up(nt, { url: 'https://cdn.discordapp.com/attachments/1/9/main.log?ex=2', name: 'main.log' }, Buffer.from('x'))).j.dup, 'повтор того же вложения от плагина пропущен');
  ok((await up('wrong', { name: 'a.log' }, Buffer.from('x'))).s === 401, 'загрузка без верного ключа отклонена');
  ok((await up(nt, { name: 'virus.exe' }, Buffer.from('x'))).s === 400, 'загрузка не лога отклонена');
  /* подключение плагина без ввода ключа: просьба → окно в приложении → «Разрешить» отдаёт ключ, «Отклонить» — нет */
  const pr = () => req({ path: '/v1/pair', body: { client: 'BetterDiscord' } });
  const w1 = pr(); await new Promise((r) => setTimeout(r, 50));
  const ev = sent.filter((x) => x.ch === 'ext-pair').pop();
  ok(ev && ev.d.client === 'BetterDiscord', 'просьба о подключении показана в приложении');
  ok((await pr()).s === 409, 'вторая просьба, пока первая ждёт, отклоняется');
  ons['ext-pair-answer'](null, ev.d.id, true); const a1 = await w1;
  ok(a1.s === 200 && a1.j.token === (await handlers['ext-info']()).token, '«Разрешить» отдаёт плагину ключ');
  const w2 = pr(); await new Promise((r) => setTimeout(r, 50)); const ev2 = sent.filter((x) => x.ch === 'ext-pair').pop();
  ons['ext-pair-answer'](null, ev2.d.id, false); const a2 = await w2;
  ok(a2.s === 403 && !a2.j.token, '«Отклонить» ключ не отдаёт');
  ok((await req({ path: '/v1/pair', body: {}, headers: { origin: 'https://evil.example' } })).s === 403, 'чужой сайт подключиться не может');
  /* новый плагин: просьба сразу получает номер, ответ узнаёт короткими запросами (BetterDiscord рвёт запросы через 8 секунд) */
  const pp = await req({ path: '/v1/pair', body: { client: 'BetterDiscord', poll: true } });
  ok(pp.s === 202 && pp.j.wait && pp.j.id, 'просьба с poll отвечает сразу номером');
  const st = (id) => req({ path: '/v1/pair?id=' + id, method: 'GET' });
  ok((await st(pp.j.id)).j.wait === true, 'пока не нажали — ждём');
  ok((await req({ path: '/v1/pair', body: { client: 'BetterDiscord', poll: true } })).j.id === pp.j.id, 'повторное «Подключить» ждёт тот же запрос');
  ons['ext-pair-answer'](null, pp.j.id, true); await new Promise((r) => setTimeout(r, 20));
  const pa = await st(pp.j.id);
  ok(pa.s === 200 && pa.j.token === (await handlers['ext-info']()).token, 'после «Разрешить» короткий запрос получает ключ');
  ok((await st(pp.j.id)).s === 404, 'ключ выдаётся один раз');
  const pq = await req({ path: '/v1/pair', body: { poll: true } }); ons['ext-pair-answer'](null, pq.j.id, false); await new Promise((r) => setTimeout(r, 20));
  ok((await st(pq.j.id)).s === 403, '«Отклонить» — короткий запрос получает отказ');
  /* быстрый разбор: файл уходит в окно приложения, ответ — сводка; в список логов (ext-import) ничего не попадает */
  const T3 = (await handlers['ext-info']()).token;
  const qk = (tok, meta, data) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port: api.port, method: 'POST', path: '/v1/quick', headers: { 'content-type': 'application/octet-stream', 'x-mla-token': tok, 'x-mla-meta': Buffer.from(JSON.stringify(meta)).toString('base64') } }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, j: b ? JSON.parse(b) : {} })); }); r.write(data); r.end(); });
  ok((await qk('wrong', { name: 'main.log' }, Buffer.from('x'))).s === 401, 'быстрый разбор: без ключа отказ');
  ok((await qk(T3, { name: 'virus.exe' }, Buffer.from('x'))).s === 400, 'быстрый разбор: чужой тип файла отклонён');
  ok((await qk(T3, { name: 'main.log' }, Buffer.from('x'))).j.error === 'old', 'быстрый разбор: старый интерфейс приложения — понятная ошибка');
  ons['ext-quick-ready'](); const nI = sent.filter((x) => x.ch === 'ext-import').length;
  const wq = qk(T3, { name: 'shot.png', url: 'https://cdn.discordapp.com/attachments/1/2/shot.png?ex=1', ticket: 't-5', msgAt: 123, siblings: ['main.log'], mode: 'badge', evil: 1 }, Buffer.from('PNG')); await new Promise((r) => setTimeout(r, 50));
  const qe = sent.filter((x) => x.ch === 'ext-quick').pop();
  ok(qe && qe.d.name === 'shot.png' && new TextDecoder().decode(qe.d.data) === 'PNG' && qe.d.meta.ticket === 't-5' && qe.d.meta.mode === 'badge' && !/\?/.test(qe.d.meta.url) && !('evil' in qe.d.meta), 'быстрый разбор: файл и очищенные данные переданы в окно');
  ons['ext-quick-answer'](null, qe.d.id, { ok: true, cause: 'Моды' }); const qa = await wq;
  ok(qa.s === 200 && qa.j.cause === 'Моды' && sent.filter((x) => x.ch === 'ext-import').length === nI, 'быстрый разбор: сводка вернулась плагину, в список логов ничего не добавлено');
  process.exit(bad ? 1 : 0);
}, 200);

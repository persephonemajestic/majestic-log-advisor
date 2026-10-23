// Сервер: файлы через Telegram-бота. Сотрудник привязывает свой аккаунт кодом из анализатора, пересылает боту лог —
// файл появляется в его «входящих» (сутки), анализатор забирает его. Админские кнопки сотруднику недоступны.
import W from '../worker/worker.js';
const kv = new Map(), meta = new Map(), sent = [];
const env = { ADMIN_PASS: 'adm', TG_TOKEN: '123:TEST', ACCESS: {
  get: async (k, o) => { const v = kv.get(k); if (v == null) return null; return o && o.type === 'arrayBuffer' ? v : v; },
  getWithMetadata: async (k) => kv.has(k) ? { value: kv.get(k), metadata: meta.get(k) || null } : { value: null, metadata: null },
  put: async (k, v, o) => { kv.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); },
  delete: async (k) => { kv.delete(k); meta.delete(k); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: meta.get(name) })), list_complete: true }) } };
const FILES = { 'docs/client.log': '[12:00:00.000] start\n[12:00:01.000] x\n[12:00:02.000] y\n', 'docs/big.zip': 'PK' };
globalThis.fetch = async (u, o) => {
  u = String(u);
  if (u.startsWith('https://api.telegram.org/file/bot123:TEST/')) { const f = FILES[u.split('bot123:TEST/')[1]]; return f ? new Response(f) : new Response('no', { status: 404 }); }
  if (u.startsWith('https://api.telegram.org/bot123:TEST/')) {
    const m = u.split('/').pop(), body = o && o.body ? JSON.parse(o.body) : {}; sent.push({ m, body });
    if (m === 'getMe') return new Response(JSON.stringify({ ok: true, result: { username: 'mla_test_bot' } }));
    if (m === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: body.file_id === 'F1' ? 'docs/client.log' : 'docs/missing' } }));
    if (m === 'setWebhook') return new Response(JSON.stringify({ ok: true }));
    return new Response(JSON.stringify({ ok: true, result: {} }));
  }
  throw new Error('net ' + u);
};
const ctx = { waitUntil() {} };
const call = async (path, body, h = {}, method) => { const r = await W.fetch(new Request('https://x' + path, { method: method || (body ? 'POST' : 'GET'), headers: Object.assign({ 'content-type': 'application/json', 'CF-Connecting-IP': '9.9.9.9' }, h), body: body ? JSON.stringify(body) : undefined }), env, ctx); const ab = await r.arrayBuffer(); let j = null; try { j = JSON.parse(new TextDecoder().decode(ab)); } catch (e) {} return { s: r.status, j, ab, h: r.headers }; };
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const admin = (b) => call('/admin/api', b, { Authorization: 'Bearer adm' }).then((r) => r.j);
let r = await admin({ action: 'tgLink' }); const secret = sent.find((x) => x.m === 'setWebhook').body.secret_token;
const hook = (up) => call('/tg/hook', up, { 'X-Telegram-Bot-Api-Secret-Token': secret });
const msg = (chat, o) => hook({ message: Object.assign({ chat: { id: chat, type: 'private' } }, o) });
const cb = (chat, data) => hook({ callback_query: { id: 'q', data, message: { chat: { id: chat }, message_id: 9 } } });
const last = () => sent.filter((x) => x.m === 'sendMessage').pop();
await msg(777, { text: '/start ' + r.code }); ok(kv.get('tg:chat') === '777', 'админ привязан своим кодом из 6 цифр (как раньше)');
/* сотрудник */
const reg = await call('/v1/auth/register', { login: 'Petya', pass: 'Kot4ik-Murzik9', dev: 'iPhone' }); const S = { 'X-Session': reg.j.token };
ok((await call('/v1/auth/tg', {}, S)).j.ok === false, 'без выданного доступа привязать Telegram нельзя');
await admin({ action: 'userSet', login: 'Petya', st: 'ok' });
const ln = (await call('/v1/auth/tg', {}, S)).j;
ok(ln.ok && /^s_[a-z0-9]{10}$/.test(ln.code) && ln.link === 'https://t.me/mla_test_bot?start=' + ln.code, 'анализатор выдаёт ссылку на бота с одноразовым кодом');
await msg(500, { text: '/users' }); ok(!/Петя|Petya/.test(last().body.text) && /Привязать Telegram/.test(last().body.text), 'чужой: админские команды не работают, подсказка про привязку');
await msg(500, { text: '/start s_wrongcode1' }); ok(/не подошёл/.test(last().body.text), 'неверный код не привязывает');
await msg(500, { text: '/start ' + ln.code });
let u = JSON.parse(kv.get('u:petya'));
ok(u.tg === '500' && kv.get('tu:500') === 'petya' && /привязан/.test(last().body.text) && JSON.stringify(last().body.reply_markup).includes('Мои файлы') && !JSON.stringify(last().body.reply_markup).includes('Ждут доступа'), 'код привязывает чат сотрудника; меню без админских кнопок');
ok(!kv.get('tl:' + ln.code.slice(2)), 'код одноразовый');
await msg(500, { text: '/users' }); ok(!/Пользователи|Ждут/.test(last().body.text), 'сотрудник не видит пользователей');
await msg(500, { text: '⏳ Ждут доступа' }); ok(!/Выдать доступ/.test(JSON.stringify(last().body)), 'админская кнопка текстом у сотрудника не срабатывает');
await cb(500, 'u:ok:Petya'); ok(sent.filter((x) => x.m === 'answerCallbackQuery').pop().body.text === 'Нет доступа', 'админские кнопки из чата сотрудника не работают');
/* файл */
await msg(500, { document: { file_id: 'F1', file_name: 'client.log', file_size: 60 } });
u = JSON.parse(kv.get('u:petya')); let list = (await call('/v1/auth/inbox', null, S)).j;
ok(list.ok && list.files.length === 1 && list.files[0].name === 'client.log' && u.ib > 0 && /отправлен в анализатор/.test(last().body.text), 'лог от бота лежит во входящих аккаунта, бот ответил');
const fid = list.files[0].id;
ok(/Диагноз придёт сюда/.test(last().body.text), 'бот обещает прислать диагноз');
await msg(500, { message_id: 41, document: { file_id: 'F1', file_name: 'client.log', file_size: 60 } }); const fid2 = (await call('/v1/auth/inbox', null, S)).j.files.pop().id;
let dg = await call('/v1/auth/inbox/diag', { id: fid2, status: 'bad', headline: 'Краш <script>', cause: 'Моды', steps: ['Убрать моды'], reply: 'Здравствуйте! Уберите моды.' }, S);
let dm = last(); ok(dg.j.ok && /🔎 <b>client\.log<\/b>/.test(dm.body.text) && /🔴 <b>Краш &lt;script&gt;<\/b>/.test(dm.body.text) && /Причина:<\/b> Моды/.test(dm.body.text) && /1\. Убрать моды/.test(dm.body.text) && /<pre>Здравствуйте! Уберите моды\.<\/pre>/.test(dm.body.text) && dm.body.reply_parameters.message_id === 41 && dm.body.chat_id === '500', 'диагноз из анализатора приходит в бот ответом на файл, текст экранирован');
const n0 = sent.length; dg = await call('/v1/auth/inbox/diag', { id: fid2, headline: 'x' }, S); ok(dg.j.dup && sent.length === n0, 'второе устройство диагноз не дублирует');
ok((await call('/v1/auth/inbox/diag', { id: fid2, headline: 'x' }, { 'X-Session': (await call('/v1/auth/register', { login: 'Kolya', pass: 'Kot4ik-Murzik9', dev: 'x' })).j.token })).j.ok === false, 'чужой аккаунт диагноз не шлёт');
await cb(500, 'f:del:' + fid2);
const ib = (await call('/v1/auth/ib', null, S)).j; ok(ib.ok && ib.tg === true && ib.ib >= u.ib, 'лёгкая проверка «есть ли новые файлы»');
const g = await call('/v1/auth/inbox/get?id=' + list.files[0].id, null, S);
ok(g.s === 200 && new TextDecoder().decode(g.ab) === FILES['docs/client.log'] && decodeURIComponent(g.h.get('x-mla-name')) === 'client.log', 'файл отдаётся целиком');
const reg2 = await call('/v1/auth/register', { login: 'Vasya', pass: 'Kot4ik-Murzik9', dev: 'x' }); await admin({ action: 'userSet', login: 'Vasya', st: 'ok' });
ok((await call('/v1/auth/inbox/get?id=' + list.files[0].id, null, { 'X-Session': reg2.j.token })).s === 404 && (await call('/v1/auth/inbox', null, { 'X-Session': reg2.j.token })).j.files.length === 0, 'чужой аккаунт файлы не видит');
ok((await call('/v1/auth/inbox', null, {})).j.ok === false, 'без входа — нельзя');
await msg(500, { document: { file_id: 'F2', file_name: 'virus.exe', file_size: 10 } }); ok(/не похож на лог/.test(last().body.text), '.exe не принимается');
await msg(500, { document: { file_id: 'F3', file_name: 'big.zip', file_size: 30 * 1048576 } }); ok(/20 МБ/.test(last().body.text), 'больше 20 МБ — понятный отказ');
await msg(500, { photo: [{ file_id: 'P' }] }); ok(/Скриншоты/.test(last().body.text), 'скриншот — подсказка прислать лог файлом');
const txt = Array.from({ length: 10 }, (_, i) => '[2026-10-01 10:00:0' + i + '.000] [info]  [ (game) ] line ' + i).join('\n');
await msg(500, { text: txt }); list = (await call('/v1/auth/inbox', null, S)).j;
ok(list.files.length === 2 && list.files[1].name === 'main.log', 'лог, присланный текстом, сохраняется как main.log');
await msg(500, { text: '📥 Мои файлы' }); ok(/Файлы за сутки/.test(last().body.text) && /client\.log/.test(last().body.text), '«Мои файлы» показывает список');
await cb(500, 'f:del:' + list.files[0].id); ok((await call('/v1/auth/inbox', null, S)).j.files.length === 1, '«Удалить» убирает файл');
await cb(500, 'f:all'); ok((await call('/v1/auth/inbox', null, S)).j.files.length === 0, '«Удалить все»');
/* админ тоже может слать файлы, если привязал свой аккаунт; его кнопки остаются */
await msg(777, { document: { file_id: 'F1', file_name: 'client.log', file_size: 60 } }); ok(/Привязать Telegram/.test(last().body.text), 'админ без привязки аккаунта: файл — подсказка привязать');
await msg(777, { text: '📊 Сводка' }); ok(/Сводка/.test(last().body.text), 'у админа кнопки работают как раньше');
/* закрыли доступ — файлы не принимаются; отвязка */
await admin({ action: 'userSet', login: 'Petya', st: 'off' });
await msg(500, { document: { file_id: 'F1', file_name: 'client.log', file_size: 60 } }); ok(/закрыт/.test(last().body.text) && !(await call('/v1/auth/inbox', null, S)).j.ok, 'доступ закрыт — бот файлы не принимает');
await admin({ action: 'userSet', login: 'Petya', st: 'ok' });
await msg(500, { text: '🔌 Отвязать Telegram' }); await cb(500, 't:off');
ok(!JSON.parse(kv.get('u:petya')).tg && !kv.get('tu:500'), 'отвязка из бота');
await msg(500, { document: { file_id: 'F1', file_name: 'client.log', file_size: 60 } }); ok(/Привязать Telegram/.test(last().body.text), 'после отвязки файлы не принимаются');
const ln2 = (await call('/v1/auth/tg', {}, S)).j; await msg(500, { text: '/start ' + ln2.code }); const off = await call('/v1/auth/tgoff', {}, S);
ok(off.j.ok && off.j.user.tg === false && !kv.get('tu:500'), 'отвязка из анализатора');
console.log(bad ? 'FAIL: ' + bad : 'OK'); process.exit(bad ? 1 : 0);

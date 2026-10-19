// Сервер: аккаунты (регистрация, вход, доступ от администратора, сброс и смена пароля, перебор, старый вход по коду).
import W from '../worker/worker.js';
const kv = new Map();
const env = { ADMIN_PASS: 'adm-pass', ACCESS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) } };
const call = async (path, body, h = {}) => { const r = await W.fetch(new Request('https://x' + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json', 'CF-Connecting-IP': h.ip || '1.1.1.1' }, h.ses ? { 'X-Session': h.ses } : {}, h.hw ? { 'X-HWID': h.hw } : {}), body: body ? JSON.stringify(body) : undefined }), env); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
const admin = (body) => W.fetch(new Request('https://x/admin/api', { method: 'POST', headers: { Authorization: 'Bearer adm-pass', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env).then((r) => r.json());
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
for (const pw of ['123', '12345678', 'qwerty123', 'password1', 'aaaa1111', 'Ivan_Petrov1x', '1q2w3e4r5t', 'пароль2024', 'abcdefgh']) { const r = await call('/v1/auth/register', { login: 'Ivan_Petrov', pass: pw }); ok(!r.j.ok && r.j.error, 'слабый пароль «' + pw + '» не принимается: ' + r.j.error); }
ok(!(await call('/v1/auth/register', { login: 'я', pass: 'Kot4ik-Murzik9' })).j.ok, 'неверный логин не принимается');
let r = await call('/v1/auth/register', { login: 'Ivan_Petrov', pass: 'Kot4ik-Murzik9' });
ok(r.j.ok && /^[0-9a-f]{64}$/.test(r.j.token) && r.j.user.st === 'pending', 'регистрация: аккаунт ждёт подтверждения, выдан сеанс');
const t1 = r.j.token;
ok(!(await call('/v1/auth/register', { login: 'ivan_petrov', pass: 'Drugoi-Parol77' })).j.ok, 'логин без учёта регистра уже занят');
ok((await call('/v1/check', null, { ses: t1 })).s === 403, 'без выдачи доступа сервер не пускает');
ok((await call('/v1/auth/me', null, { ses: t1 })).j.user.st === 'pending', 'приложение видит «ожидает»');
ok(![...kv.values()].some((v) => v.includes('Kot4ik')) && ![...kv.keys()].some((k) => k.includes(t1)), 'на сервере нет ни пароля, ни токена в открытом виде');
let us = await admin({ action: 'users' }); ok(us.ok && us.list[0].login === 'Ivan_Petrov' && us.list[0].st === 'pending', 'в админке новый пользователь со статусом «ожидает»');
await admin({ action: 'userSet', login: 'Ivan_Petrov', st: 'ok' });
ok((await call('/v1/check', null, { ses: t1 })).j.n === 'Ivan_Petrov', 'после выдачи доступа сервер пускает');
r = await call('/v1/auth/login', { login: 'IVAN_PETROV', pass: 'Kot4ik-Murzik9', dev: 'iPhone' }); const t2 = r.j.token;
ok(r.j.ok && t2 !== t1 && (await call('/v1/check', null, { ses: t2 })).s === 200, 'вход с другого устройства тем же аккаунтом');
for (let i = 0; i < 8; i++) await call('/v1/auth/login', { login: 'Ivan_Petrov', pass: 'neverno' + i + 'X' }, { ip: '2.2.2.' + i });
ok(/15 минут/.test((await call('/v1/auth/login', { login: 'Ivan_Petrov', pass: 'Kot4ik-Murzik9' })).j.error || ''), 'после 8 ошибок вход по логину блокируется на 15 минут');
for (const k of [...kv.keys()]) if (k.startsWith('rl:')) kv.delete(k);
const rs = await admin({ action: 'userReset', login: 'ivan_petrov' });
ok(rs.ok && rs.pass.length === 12 && !pwCheckFails(rs.pass), 'сброс пароля даёт случайный пароль из 12 символов');
ok((await call('/v1/check', null, { ses: t1 })).s === 403 && (await call('/v1/check', null, { ses: t2 })).s === 403, 'после сброса старые сеансы закрыты');
r = await call('/v1/auth/login', { login: 'Ivan_Petrov', pass: rs.pass }); const t3 = r.j.token;
ok(r.j.ok && r.j.user.must === true, 'вход по временному паролю, приложение просит сменить');
ok(!(await call('/v1/auth/pass', { old: rs.pass, pass: '11111111' }, { ses: t3 })).j.ok, 'слабый новый пароль не принимается');
r = await call('/v1/auth/pass', { old: rs.pass, pass: 'Novy-Parol-2026' }, { ses: t3 });
ok(r.j.ok && r.j.user.must === false && (await call('/v1/check', null, { ses: t3 })).s === 200, 'смена пароля в личном кабинете, сеанс остаётся');
ok((await call('/v1/auth/login', { login: 'Ivan_Petrov', pass: 'Novy-Parol-2026' })).j.ok, 'вход новым паролем');
await admin({ action: 'userSet', login: 'Ivan_Petrov', st: 'off' });
ok((await call('/v1/check', null, { ses: t3 })).s === 403 && (await call('/v1/auth/me', null, { ses: t3 })).j.user.st === 'off', 'забрать доступ: сразу не пускает, приложение видит «закрыт»');
await call('/v1/auth/logout', {}, { ses: t3 }); ok((await call('/v1/auth/me', null, { ses: t3 })).j.user === null, 'выход завершает сеанс');
kv.set('h:AAAAA-BBBBB-CCCCC-DDDDD', JSON.stringify({ n: 'ПК', seen: Date.now() }));
ok((await call('/v1/check', null, { hw: 'AAAAA-BBBBB-CCCCC-DDDDD' })).s === 200, 'старый вход по коду компьютера работает');
await admin({ action: 'legacySet', on: false });
ok((await call('/v1/check', null, { hw: 'AAAAA-BBBBB-CCCCC-DDDDD' })).s === 403, 'вход по кодам можно выключить в админке');
await admin({ action: 'userDel', login: 'Ivan_Petrov' }); ok(!(await admin({ action: 'users' })).list.length, 'удаление аккаунта');
function pwCheckFails(p) { return !(p.length >= 8 && /\d/.test(p) && /[a-z]/i.test(p)); }
process.exit(bad ? 1 : 0);

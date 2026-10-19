// Шлюз доступа Majestic Log Advisor: отдаёт интерфейс, оболочку и правила только компьютерам из списка (KV ACCESS).
const HW = /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/;
const NOSTORE = { 'cache-control': 'no-store' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...NOSTORE } });
const deny = () => json({ ok: false }, 403);

/* Кто обращается: аккаунт (заголовок X-Session — сеанс после входа по логину и паролю) или, по-старому, код компьютера (X-HWID).
   Вход по кодам можно выключить в админке («legacy» = 0). */
async function who(req, env) {
  const tok = String(req.headers.get('X-Session') || '').trim(), hwRaw = (req.headers.get('X-HWID') || '').toUpperCase();
  if (/^[0-9a-f]{64}$/.test(tok)) {
    const ses = await sessionOf(env, tok);
    if (ses && ses.user && ses.user.st === 'ok') return { h: 'U:' + ses.user.k, n: ses.user.login, acc: ses.user.login, hw: HW.test(hwRaw) ? hwRaw : '' };
  }
  if (!HW.test(hwRaw) || (await env.ACCESS.get('legacy')) === '0') return null;
  const raw = await env.ACCESS.get('h:' + hwRaw);
  if (!raw) return null;
  let rec = {}; try { rec = JSON.parse(raw); } catch (e) {}
  if (!rec.seen || Date.now() - rec.seen > 6 * 3600 * 1000) { rec.seen = Date.now(); try { await env.ACCESS.put('h:' + hwRaw, JSON.stringify(rec)); await touchAv(env); } catch (e) {} }
  return { h: hwRaw, n: rec.n || '', hw: hwRaw };
}

/* ---------- Аккаунты: логин и пароль, доступ выдаёт администратор ----------
   u:<логин в нижнем регистре> — { login, k, st: pending|ok|off, salt, ph, it, must, at, seen, ss: [сеансы] }
   s:<sha256 токена> — { k, at, seen, dev } (сам токен на сервере не хранится). Пароль — PBKDF2-SHA256 с солью. */
const LOGIN_RE = /^[A-Za-z0-9_.-]{3,24}$/, SES_TTL = 400 * 86400, PW_IT = 20000;
const COMMON_PW = ['password', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'qwert', 'asdfgh', 'asdf', 'zxcvbn', 'zxcv', 'qazwsx', 'qaz', 'wsx', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'admin', 'administrator', 'root', 'user', 'login', 'test', 'guest', 'welcome', 'letmein', 'iloveyou', 'love', 'monkey', 'dragon', 'master', 'football', 'majestic', 'support', 'secret', 'парол', 'пароль', 'йцукен', 'йцукенг', 'фыва', 'фывапр', 'привет', 'qq', 'aa', 'ab', 'q', 'a', 'qw', 'qwe', 'qwer'];
/* слабые пароли не принимаются: 8+ символов, буквы и цифры, не похож на логин и на популярные варианты */
function pwProblem(pw, login) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Пароль слишком короткий: нужно не меньше 8 символов.';
  if (pw.length > 128) return 'Пароль слишком длинный.';
  const letters = pw.replace(/[^A-Za-zА-Яа-яЁё]/g, ''), digits = pw.replace(/\D/g, '');
  if (letters.length < 2 || !digits.length) return 'В пароле должны быть буквы и хотя бы одна цифра.';
  if (new Set(pw.toLowerCase()).size < 5) return 'В пароле слишком много повторов — используйте больше разных символов.';
  const low = pw.toLowerCase(), lg = String(login || '').toLowerCase();
  if (lg.length >= 3 && low.indexOf(lg) >= 0) return 'Пароль не должен содержать логин.';
  if (COMMON_PW.indexOf(letters.toLowerCase()) >= 0) return 'Это слишком популярный пароль, его легко подобрать. Придумайте другой.';
  if (/1q2w|q1w2|1qaz|zaq1|qazwsx|1234qwer|qwer1234|asdf1234/.test(low)) return 'Это слишком популярный пароль, его легко подобрать. Придумайте другой.';
  return '';
}
const hex = (b) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256hex(t) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))); }
async function pwHash(pw, saltHex, it) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, key, 256));
}
function rnd(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
async function setPw(u, pw) { u.salt = hex(rnd(16)); u.it = PW_IT; u.ph = await pwHash(pw, u.salt, u.it); }
async function userGet(env, k) { const raw = await env.ACCESS.get('u:' + k); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }
async function userPut(env, u) { await env.ACCESS.put('u:' + u.k, JSON.stringify(u)); }
async function sessionNew(env, u, dev) {
  const tok = hex(rnd(32)), sh = await sha256hex(tok);
  await env.ACCESS.put('s:' + sh, JSON.stringify({ k: u.k, at: Date.now(), seen: Date.now(), dev: String(dev || '').slice(0, 40) }), { expirationTtl: SES_TTL });
  u.ss = (u.ss || []).concat([sh]); while (u.ss.length > 20) { const old = u.ss.shift(); try { await env.ACCESS.delete('s:' + old); } catch (e) {} }
  await userPut(env, u); return tok;
}
async function sessionOf(env, tok) {
  const sh = await sha256hex(tok), raw = await env.ACCESS.get('s:' + sh); if (!raw) return null;
  let s = {}; try { s = JSON.parse(raw); } catch (e) { return null; }
  const user = await userGet(env, s.k); if (!user || (user.ss || []).indexOf(sh) < 0) return null;
  if (Date.now() - (s.seen || 0) > 6 * 3600 * 1000) { s.seen = Date.now(); try { await env.ACCESS.put('s:' + sh, JSON.stringify(s), { expirationTtl: SES_TTL }); user.seen = Date.now(); await userPut(env, user); await touchAv(env); } catch (e) {} }
  return { sh, s, user };
}
async function sessionsEnd(env, u, keep) { for (const sh of u.ss || []) if (sh !== keep) { try { await env.ACCESS.delete('s:' + sh); } catch (e) {} } u.ss = keep ? [keep] : []; }
/* перебор паролей: не больше 8 ошибок на логин и 40 на адрес за 15 минут; регистраций — 5 в час с адреса */
async function rlHit(env, k, ttl) { let n = 0; try { n = parseInt(await env.ACCESS.get(k), 10) || 0; } catch (e) {} await env.ACCESS.put(k, String(n + 1), { expirationTtl: ttl }); return n + 1; }
async function rlGet(env, k) { try { return parseInt(await env.ACCESS.get(k), 10) || 0; } catch (e) { return 0; } }
const ipOf = (req) => String(req.headers.get('CF-Connecting-IP') || 'x').slice(0, 64);
const userView = (u) => ({ login: u.login, st: u.st, must: !!u.must });
async function authApi(p, req, env, ctx) {
  let b = {}; if (req.method === 'POST') { try { b = await req.json(); } catch (e) {} }
  if (p === '/v1/auth/register' && req.method === 'POST') {
    const login = String(b.login || '').trim(), pw = String(b.pass || '');
    if (!LOGIN_RE.test(login)) return json({ ok: false, error: 'Логин: от 3 до 24 символов, латинские буквы, цифры, точка, дефис или _.' });
    const bad = pwProblem(pw, login); if (bad) return json({ ok: false, error: bad });
    if ((await rlGet(env, 'rg:' + ipOf(req))) >= 5) return json({ ok: false, error: 'Слишком много регистраций с этого адреса. Попробуйте через час.' });
    const k = login.toLowerCase(); if (await userGet(env, k)) return json({ ok: false, error: 'Такой логин уже занят. Придумайте другой или войдите.' });
    await rlHit(env, 'rg:' + ipOf(req), 3600);
    const u = { login, k, st: 'pending', at: Date.now(), seen: Date.now(), ss: [] }; await setPw(u, pw);
    const tok = await sessionNew(env, u, b.dev); await touchAv(env);
    bg(ctx, tgSay(env, '🆕 <b>Новая регистрация:</b> ' + tgEsc(u.login) + (b.dev ? ' (' + tgEsc(String(b.dev).slice(0, 20)) + ')' : '') + '\nВыдать доступ?', [[['✅ Выдать доступ', 'u:ok:' + u.login], ['⛔ Отклонить', 'u:off:' + u.login]]]));
    return json({ ok: true, token: tok, user: userView(u) });
  }
  if (p === '/v1/auth/login' && req.method === 'POST') {
    const login = String(b.login || '').trim(), k = login.toLowerCase(), pw = String(b.pass || ''), ip = ipOf(req);
    if ((await rlGet(env, 'rl:l:' + k)) >= 8 || (await rlGet(env, 'rl:i:' + ip)) >= 40) return json({ ok: false, error: 'Слишком много неудачных попыток. Подождите 15 минут.' });
    const u = LOGIN_RE.test(login) ? await userGet(env, k) : null;
    const ok = u && same(await pwHash(pw, u.salt, u.it || PW_IT), u.ph);
    if (!ok) { await rlHit(env, 'rl:l:' + k, 900); await rlHit(env, 'rl:i:' + ip, 900); return json({ ok: false, error: 'Неверный логин или пароль.' }); }
    const tok = await sessionNew(env, u, b.dev); return json({ ok: true, token: tok, user: userView(u) });
  }
  /* дальше — только с сеансом */
  const tok = String(req.headers.get('X-Session') || '').trim(), ses = /^[0-9a-f]{64}$/.test(tok) ? await sessionOf(env, tok) : null;
  if (p === '/v1/auth/me') {
    let legacy = false; const hw = (req.headers.get('X-HWID') || '').toUpperCase();
    if (HW.test(hw) && (await env.ACCESS.get('legacy')) !== '0' && (await env.ACCESS.get('h:' + hw))) legacy = true;
    return json({ ok: true, user: ses ? userView(ses.user) : null, legacy });
  }
  if (!ses) return json({ ok: false, error: 'Войдите в аккаунт.', auth: false });
  if (p === '/v1/auth/logout' && req.method === 'POST') { const u = ses.user; u.ss = (u.ss || []).filter((x) => x !== ses.sh); await userPut(env, u); await env.ACCESS.delete('s:' + ses.sh); return json({ ok: true }); }
  if (p === '/v1/auth/pass' && req.method === 'POST') {
    const u = ses.user, ip = ipOf(req);
    if ((await rlGet(env, 'rl:l:' + u.k)) >= 8) return json({ ok: false, error: 'Слишком много неудачных попыток. Подождите 15 минут.' });
    if (!same(await pwHash(String(b.old || ''), u.salt, u.it || PW_IT), u.ph)) { await rlHit(env, 'rl:l:' + u.k, 900); await rlHit(env, 'rl:i:' + ip, 900); return json({ ok: false, error: 'Текущий пароль введён неверно.' }); }
    const bad = pwProblem(b.pass, u.login); if (bad) return json({ ok: false, error: bad });
    if (String(b.pass) === String(b.old)) return json({ ok: false, error: 'Новый пароль совпадает с текущим.' });
    await setPw(u, String(b.pass)); u.must = false; await sessionsEnd(env, u, ses.sh); await userPut(env, u);
    return json({ ok: true, user: userView(u) });
  }
  return json({ ok: false, error: 'Неизвестный запрос' }, 404);
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function isAdmin(req, env) { const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '').trim(), p = String(env.ADMIN_PASS || '').trim(); return p.length > 0 && t.length > 0 && same(t, p); }

const normTag = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
async function touchAv(env) { try { await env.ACCESS.put('av', String(Date.now())); } catch (e) {} }
async function getNews(env) { try { const r = await env.ACCESS.get('news'); const l = r ? JSON.parse(r) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } }
export class Presence {
  constructor(state) { this.m = new Map(); }
  async fetch(req) {
    const u = new URL(req.url), h = u.searchParams.get('h'), now = Date.now();
    if (h) this.m.set(h, { t: now, n: u.searchParams.get('n') || '' });
    for (const [k, v] of this.m) if (now - v.t > 100000) this.m.delete(k);
    return new Response(JSON.stringify({ count: this.m.size, names: [...this.m.values()].map((v) => v.n || 'без имени').sort() }), { headers: { 'content-type': 'application/json' } });
  }
}
const FILES = { '/v1/app': '/index.html', '/v1/rules': '/rules.json', '/v1/shell/main.js': '/shell/main.js', '/v1/shell/preload.js': '/shell/preload.js', '/v1/shell/hwid.js': '/shell/hwid.js', '/v1/shell/icon.png': '/shell/icon.png', '/v1/shell/icon.ico': '/shell/icon.ico', '/v1/ver': '/ver.json' };

/* ---------- Обезличенные логи для улучшения правил ----------
   Приложение присылает очищенный от шума и замаскированный лог (сжатый gzip, base64). Храним 7 дней в KV с автоудалением.
   Раз в сутки (cron) и по кнопке в админ-панели выгружаем всё в закрытый GitHub-репозиторий одним коммитом без родителей:
   старые логи не остаются в истории ветки. Нужны секреты GH_TOKEN (fine-grained, Contents: Read and write только на этот репозиторий)
   и GH_SAMPLES_REPO («владелец/имя»). */
const SMP_TTL = 7 * 86400, SMP_DAY_MAX = 300, SMP_MAX_B64 = 3000000;
/* ---------- Подсказки для подбора шаблонов: фразы и пояснения пишет команда, отметки «подходит / не подходит» — счётчики по шаблону ---------- */
const HINT_MAX = 12;
async function kvJson(env, k, d) { try { const raw = await env.ACCESS.get(k); return raw ? JSON.parse(raw) : d; } catch (e) { return d; } }
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
/* фраза-пример: своими словами, без ников, почт и номеров */
function cleanSay(v) { const t = clip(v, 140).replace(/\S+@\S+/g, '').replace(/\d{5,}/g, '').replace(/\b[A-Z][a-z]+_[A-Z][a-z]+\b/g, '').replace(/\s+/g, ' ').trim(); return t.length >= 4 ? t : ''; }
/* счётчики по дням (без текста): подбор шаблонов и расход ИИ */
async function bump(env, k, fields) { const day = new Date().toISOString().slice(0, 10), key = k + ':' + day, o = await kvJson(env, key, {}); for (const f of fields) if (f) o[f] = (o[f] || 0) + 1; await env.ACCESS.put(key, JSON.stringify(o), { expirationTtl: 40 * 86400 }); }
async function tplHintsAll(env) { return { hints: await kvJson(env, 'tplh', {}), stats: await kvJson(env, 'tplst', {}), pending: await kvJson(env, 'tplpend', []) }; }
async function addPending(env, list) {
  const pend = await kvJson(env, 'tplpend', []); let n = 0;
  for (const x of list) { const set = clip(x.set, 60), t = clip(x.t, 160), say = cleanSay(x.say), when = clip(x.when, 300); if (!set || !t || (!say && !when)) continue;
    if (pend.some((y) => y.set === set && y.t === t && y.say === say && y.when === when)) continue;
    pend.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), set, t, say, when, by: clip(x.by, 60) }); n++; }
  await env.ACCESS.put('tplpend', JSON.stringify(pend.slice(-300))); return n;
}
async function samplesExport(env) {
  if (!env.GH_TOKEN || !env.GH_SAMPLES_REPO) return { ok: false, error: 'На сервере не заданы GH_TOKEN и GH_SAMPLES_REPO' };
  const days = {}; let cursor, n = 0;
  do { const l = await env.ACCESS.list({ prefix: 'smp:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); if (!raw) continue; let r; try { r = JSON.parse(raw); } catch (e) { continue; } const d = new Date(r.at || 0).toISOString().slice(0, 10); (days[d] = days[d] || []).push(JSON.stringify(Object.assign({ h: k.name.slice(4) }, r))); n++; } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const api = 'https://api.github.com/repos/' + env.GH_SAMPLES_REPO, H = { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'majestic-log-advisor', 'Content-Type': 'application/json' };
  const gh = async (path, method, body) => { const r = await fetch(api + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; };
  /* предложения ночного разбора (tpl/proposed.json) — в очередь на подтверждение; затем свежее состояние шаблонов для следующего разбора */
  try { const pr = await gh('/contents/tpl/proposed.json', 'GET'); if (pr.ok && pr.j.content) { const arr = JSON.parse(decodeURIComponent(escape(atob(String(pr.j.content).replace(/\s/g, ''))))); if (Array.isArray(arr)) await addPending(env, arr.slice(0, 100).map((x) => Object.assign({}, x, { by: 'ночной разбор' }))); } } catch (e) {}
  const tpl = await kvJson(env, 'tpl', null), hs = await tplHintsAll(env);
  const tplState = tpl && tpl.sets ? { at: Date.now(), sets: tpl.sets.map((st) => ({ name: st.name, items: st.items.filter((x) => !x.hide).map((x) => { const h = ((hs.hints[st.name] || {})[x.t]) || {}, c = ((hs.stats[st.name] || {})[x.t]) || [0, 0]; return { t: x.t, body: x.body, say: h.say || [], when: h.when || '', up: c[0], down: c[1] }; }) })), pending: hs.pending } : null;
  const tree = [{ path: 'README.md', mode: '100644', type: 'blob', content: '# Обезличенные логи Majestic Log Advisor\n\nВыгрузка ' + new Date().toISOString() + ', логов: ' + n + '. Каждый файл days/ГГГГ-ММ-ДД.jsonl: одна строка на лог, поле gz — gzip+base64 очищенного и замаскированного текста. Хранится 7 дней, каждая выгрузка заменяет содержимое целиком.\n' }];
  for (const d of Object.keys(days).sort()) { const b = await gh('/git/blobs', 'POST', { content: days[d].join('\n') + '\n', encoding: 'utf-8' }); if (!b.ok) return { ok: false, error: 'blob ' + b.status }; tree.push({ path: 'days/' + d + '.jsonl', mode: '100644', type: 'blob', sha: b.j.sha }); }
  if (tplState) tree.push({ path: 'tpl/state.json', mode: '100644', type: 'blob', content: JSON.stringify(tplState, null, 1) });
  const t = await gh('/git/trees', 'POST', { tree }); if (!t.ok) return { ok: false, error: 'tree ' + t.status };
  const c = await gh('/git/commits', 'POST', { message: 'Выгрузка логов: ' + n, tree: t.j.sha, parents: [] }); if (!c.ok) return { ok: false, error: 'commit ' + c.status };
  let r = await gh('/git/refs/heads/main', 'PATCH', { sha: c.j.sha, force: true });
  if (!r.ok) r = await gh('/git/refs', 'POST', { ref: 'refs/heads/main', sha: c.j.sha });
  if (!r.ok) return { ok: false, error: 'ref ' + r.status };
  await env.ACCESS.put('smpx', JSON.stringify({ at: Date.now(), n }));
  return { ok: true, n, days: Object.keys(days).length };
}

/* ---------- Telegram-бот администратора ----------
   Токен — секрет TG_TOKEN в Cloudflare. Бот отвечает только привязанному чату (tg:chat): привязка — кодом из админки (/start 123456).
   Пишет: регистрации (кнопки «Выдать доступ» / «Отклонить»), баг-репорты со скриншотом, массовые проблемы, кончился ИИ,
   фразы для шаблонов на проверку, сводку раз в день. Команды: /users, /pending, /stats, /reports, /news, /help. */
const tgEsc = (t) => String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function tgApi(env, method, payload, form) {
  if (!env.TG_TOKEN) return null;
  try { const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/' + method, form ? { method: 'POST', body: form } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) }); return await r.json(); } catch (e) { return null; }
}
async function tgChat(env) { if (!env.TG_TOKEN) return ''; try { return (await env.ACCESS.get('tg:chat')) || ''; } catch (e) { return ''; } }
const kb = (rows) => ({ inline_keyboard: rows.map((r) => r.map((b) => ({ text: b[0], callback_data: b[1] }))) });
/* постоянные кнопки внизу чата — вместо команд */
const TG_MENU = { keyboard: [[{ text: '⏳ Ждут доступа' }, { text: '👥 Пользователи' }], [{ text: '📊 Сводка' }, { text: '🐞 Баг-репорты' }], [{ text: '📢 Объявление' }, { text: '❓ Помощь' }]], resize_keyboard: true, is_persistent: true };
const TG_BTN = { '⏳ Ждут доступа': 'pending', '👥 Пользователи': 'users', '📊 Сводка': 'stats', '🐞 Баг-репорты': 'reports', '📢 Объявление': 'news', '❓ Помощь': 'help' };
async function tgSay(env, text, rows, chatId, menu) { const chat = chatId || (await tgChat(env)); if (!chat) return null; return tgApi(env, 'sendMessage', Object.assign({ chat_id: chat, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }, rows ? { reply_markup: kb(rows) } : menu ? { reply_markup: TG_MENU } : {})); }
function bg(ctx, pr) { const p2 = Promise.resolve(pr).catch(() => null); if (ctx && ctx.waitUntil) ctx.waitUntil(p2); return p2; }
const tgSecret = async (env) => (await sha256hex('tg-hook:' + (env.TG_TOKEN || ''))).slice(0, 48);
const ST_RU = { pending: '⏳ ждёт', ok: '✅ доступ', off: '⛔ закрыт' };
/* кнопки пользователя; сделанное действие меняет свою кнопку на итог (done — набор: ok|off, rst, kick) */
const DONE_TXT = { ok: '✅ Доступ выдан', off: '⛔ Доступ закрыт', rst: '✓ Пароль сброшен', kick: '✓ Сеансы завершены' };
function userRows(u, done) {
  const L = u.login, d = done || {};
  /* доступ — переключатель: после «Забрать» сразу кнопка «Открыть доступ» и наоборот; итог пишется в тексте карточки */
  const acc = u.st === 'ok' ? ['⛔ Забрать доступ', 'u:off:' + L] : [u.st === 'off' ? '✅ Открыть доступ' : '✅ Выдать доступ', 'u:ok:' + L];
  return [[acc, d.rst ? [DONE_TXT.rst, 'x:' + L] : ['🔑 Сбросить пароль', 'u:rst:' + L]], [d.kick ? [DONE_TXT.kick, 'x:' + L] : ['⏏ Завершить сеансы', 'u:kick:' + L]]];
}
function userCard(u, last) { return '<b>' + tgEsc(u.login) + '</b> — ' + ST_RU[u.st] + (u.must ? ' · временный пароль' : '') + '\nПоследний вход: ' + (u.seen ? new Date(u.seen).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' }) : '—') + (last ? '\n\n' + last : ''); }
/* какие действия уже отмечены на кнопках этого сообщения */
function doneFrom(markup) { const d = {}; for (const row of (markup && markup.inline_keyboard) || []) for (const b of row) for (const k of Object.keys(DONE_TXT)) if (b.text === DONE_TXT[k]) d[k] = 1; return d; }
async function usersAll(env) { const out = []; let cursor; do { const l = await env.ACCESS.list({ prefix: 'u:', cursor }); for (const k of l.keys) { const u = await userGet(env, k.name.slice(2)); if (u) out.push(u); } cursor = l.list_complete ? null : l.cursor; } while (cursor); return out; }
async function tgSummary(env, title) {
  const day = new Date().toISOString().slice(0, 10), d = await kvJson(env, 'd:' + day, null), ai = await kvJson(env, 'aiu:' + day, {}), tm = await kvJson(env, 'tplm:' + day, {});
  const us = await usersAll(env), pend = us.filter((u) => u.st === 'pending'), hp = (await kvJson(env, 'tplpend', [])).length;
  let rp = 0, cursor; do { const l = await env.ACCESS.list({ prefix: 'rp:', cursor }); for (const k of l.keys) { const r = await kvJson(env, k.name, null); if (r && Date.now() - (r.at || 0) < 86400000) rp++; } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const top = d ? Object.keys(d.probs || {}).map((k) => d.probs[k]).sort((a, c) => c.c - a.c).slice(0, 5) : [];
  return '<b>' + tgEsc(title || 'Сводка') + ' за ' + day.split('-').reverse().join('.') + '</b>\n' +
    '📄 Логов разобрано: <b>' + (d ? d.n : 0) + '</b>' + (d ? ', со сбоем: ' + d.bad + ', с модами: ' + d.mods : '') + '\n' +
    (top.length ? '\n<b>Частые проблемы</b>\n' + top.map((x, i) => (i + 1) + '. ' + tgEsc(x.t) + ' — ' + x.c).join('\n') + '\n' : '') +
    '\n🤖 ИИ: запросов ' + ((ai.ok || 0) + (ai.cached || 0)) + (ai.rate ? ', упёрлись в лимит: ' + ai.rate : '') + (ai.fail ? ', ошибок: ' + ai.fail : '') +
    '\n📋 Шаблоны: показано ' + (tm.shown || 0) + ', вставлено ' + ((tm.r1 || 0) + (tm.r2 || 0) + (tm.r3 || 0)) + (hp ? ', фраз на проверке: ' + hp : '') +
    '\n🐞 Баг-репортов за сутки: ' + rp +
    '\n👥 Пользователей: ' + us.length + (pend.length ? ', <b>ждут доступа: ' + pend.length + '</b> (' + pend.map((u) => tgEsc(u.login)).join(', ') + ')' : '');
}
async function tgNotifyReport(env, r) {
  const t = '🐞 <b>Баг-репорт</b> от ' + tgEsc(r.by) + (r.v ? ' · версия ' + tgEsc(r.v) : '') + (r.page ? ' · ' + tgEsc(r.page) : '') + '\n\n' + tgEsc(r.text || '(без текста)') + (r.link ? '\n\n🔗 ' + tgEsc(r.link) : '') + (r.diag ? '\n\n<i>' + tgEsc(r.diag.slice(0, 600)) + '</i>' : '');
  const chat = await tgChat(env); if (!chat) return;
  const rows = [[['🗑 Удалить отчёт', 'r:del:' + r.id]]];
  if (r.shot) {
    try {
      const m = /^data:(image\/\w+);base64,(.*)$/.exec(r.shot), bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), fd = new FormData();
      fd.append('chat_id', chat); fd.append('caption', t.slice(0, 1000)); fd.append('parse_mode', 'HTML'); fd.append('reply_markup', JSON.stringify(kb(rows))); fd.append('photo', new Blob([bin], { type: m[1] }), 'shot.' + m[1].split('/')[1]);
      const res = await tgApi(env, 'sendPhoto', null, fd); if (res && res.ok) { if (t.length > 1000) await tgSay(env, t.slice(1000)); return; }
    } catch (e) {}
  }
  await tgSay(env, t, rows);
}
async function tgHook(req, env, ctx) {
  if (!env.TG_TOKEN || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== (await tgSecret(env))) return new Response('no', { status: 403 });
  let up = {}; try { up = await req.json(); } catch (e) {}
  const chat = await tgChat(env), msg = up.message, cq = up.callback_query;
  if (msg && msg.chat) {
    const cid = String(msg.chat.id), text = String(msg.text || '').trim();
    /* привязка: /start 123456 или просто код из админки */
    const code = (/^(?:\/start\s+)?(\d{6})$/.exec(text) || [])[1];
    if (code && msg.chat.type === 'private') {
      const want = await env.ACCESS.get('tg:code');
      if (want && same(code, want)) { await env.ACCESS.put('tg:chat', cid); await env.ACCESS.delete('tg:code'); await tgSay(env, '✅ Бот привязан. Сюда будут приходить регистрации, баг-репорты, массовые проблемы и сводка за день.\n\n' + TG_HELP, null, cid, true); }
      else { if ((await rlHit(env, 'tg:bad', 900)) >= 10) await env.ACCESS.delete('tg:code'); await tgSay(env, 'Код не подошёл или устарел. Получите новый в админке: «Telegram-бот» → «Привязать».', null, cid); }
      return json({ ok: true });
    }
    if (!chat || cid !== chat) { if (/^\/start/.test(text)) await tgSay(env, 'Это закрытый бот. Чтобы привязать его, отправьте код из админки.', null, cid); return json({ ok: true }); }
    let cmd = (/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text) || []);
    if (TG_BTN[text]) cmd = [text, TG_BTN[text], ''];
    /* кнопка «Объявление»: следующее сообщение — текст объявления */
    if (cmd[1] !== 'news' && !cmd[1] && text && (await env.ACCESS.get('tg:await')) === 'news') { await env.ACCESS.delete('tg:await'); cmd = [text, 'news', text]; }
    else if (cmd[1] && cmd[1] !== 'news') await env.ACCESS.delete('tg:await');
    if (cmd[1] === 'users' || cmd[1] === 'pending') {
      const us = (await usersAll(env)).filter((u) => cmd[1] === 'users' || u.st === 'pending').sort((a, c) => (a.st === 'pending' ? 0 : 1) - (c.st === 'pending' ? 0 : 1) || (c.seen || 0) - (a.seen || 0));
      if (!us.length) await tgSay(env, cmd[1] === 'pending' ? 'Никто не ждёт доступа.' : 'Пользователей пока нет.');
      for (const u of us.slice(0, 25)) await tgSay(env, userCard(u), userRows(u));
      if (us.length > 25) await tgSay(env, 'Показаны 25 из ' + us.length + '. Остальные — в админке.');
    } else if (cmd[1] === 'stats') await tgSay(env, await tgSummary(env, 'Сводка'));
    else if (cmd[1] === 'reports') {
      const out = []; let cursor; do { const l = await env.ACCESS.list({ prefix: 'rp:', cursor }); for (const k of l.keys) { const r = await kvJson(env, k.name, null); if (r) out.push(r); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
      out.sort((a, c) => c.at - a.at); if (!out.length) await tgSay(env, 'Баг-репортов нет.'); for (const r of out.slice(0, 5)) await tgNotifyReport(env, r);
    } else if (cmd[1] === 'news') {
      const t = String(cmd[2] || '').trim().slice(0, 1500);
      if (!t) { await env.ACCESS.put('tg:await', 'news', { expirationTtl: 600 }); await tgSay(env, '📢 Напишите текст объявления одним сообщением — команда увидит его в приложении.', [[['✖ Отмена', 'n:cancel']]]); }
      else { const id = Date.now().toString(36), list = await getNews(env); list.unshift({ id, at: Date.now(), text: t }); await env.ACCESS.put('news', JSON.stringify(list.slice(0, 30))); await touchAv(env); await tgSay(env, '📢 Объявление опубликовано, команда увидит его в приложении:\n\n' + tgEsc(t), [[['🗑 Удалить объявление', 'n:del:' + id]]]); }
    } else await tgSay(env, TG_HELP, null, null, true);
    return json({ ok: true });
  }
  if (cq && cq.message) {
    const cid = String(cq.message.chat.id), data = String(cq.data || ''), ans = (t) => tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: t || '' });
    if (!chat || cid !== chat) { await ans('Нет доступа'); return json({ ok: true }); }
    const edit = (t, rows) => tgApi(env, 'editMessageText', Object.assign({ chat_id: cid, message_id: cq.message.message_id, text: t, parse_mode: 'HTML' }, rows ? { reply_markup: kb(rows) } : {}));
    const mu = /^u:(ok|off|rst|kick):(.+)$/.exec(data), mh = /^h:(ok|no):(.+)$/.exec(data), mr = /^r:del:(.+)$/.exec(data), mn = /^n:(cancel|del)(?::(.+))?$/.exec(data);
    if (mn) {
      if (mn[1] === 'cancel') { await env.ACCESS.delete('tg:await'); await ans('Отменено'); await edit('Объявление отменено.'); }
      else { const list = (await getNews(env)).filter((x) => x.id !== mn[2]); await env.ACCESS.put('news', JSON.stringify(list)); await touchAv(env); await ans('Объявление удалено'); await edit('🗑 Объявление удалено.'); }
      return json({ ok: true });
    }
    if (/^x:/.test(data)) { await ans('Уже сделано'); return json({ ok: true }); }
    if (mu) {
      const u = await userGet(env, mu[2].toLowerCase()); if (!u) { await ans('Пользователь не найден'); return json({ ok: true }); }
      const done = doneFrom(cq.message.reply_markup), at = new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Yekaterinburg', hour: '2-digit', minute: '2-digit' });
      if (mu[1] === 'ok' || mu[1] === 'off') { u.st = mu[1]; await userPut(env, u); await touchAv(env); delete done.ok; delete done.off; }
      else if (mu[1] === 'kick') { await sessionsEnd(env, u, null); await userPut(env, u); }
      else { const pw = genPass(); await setPw(u, pw); u.must = true; await sessionsEnd(env, u, null); await userPut(env, u); await tgSay(env, '🔑 Новый пароль для <b>' + tgEsc(u.login) + '</b>:\n<code>' + tgEsc(pw) + '</code>\nПередайте его человеку — после входа приложение предложит задать свой.'); }
      done[mu[1]] = 1;
      const what = { ok: 'Доступ выдан', off: 'Доступ закрыт', rst: 'Пароль сброшен', kick: 'Сеансы завершены' }[mu[1]], tail = { rst: ' — новый пароль в сообщении ниже', kick: ' — войдёт заново на всех устройствах' }[mu[1]] || '';
      await ans(what); await edit(userCard(u, '✔ ' + what + ' в ' + at + tail), userRows(u, done));
    } else if (mh) {
      let pend = await kvJson(env, 'tplpend', []); const it = pend.find((x) => x.id === mh[2]); pend = pend.filter((x) => x.id !== mh[2]);
      if (it && mh[1] === 'ok') { const hints = await kvJson(env, 'tplh', {}); hints[it.set] = hints[it.set] || {}; const h = hints[it.set][it.t] = hints[it.set][it.t] || { say: [], when: '' }; if (it.say && h.say.indexOf(it.say) < 0) h.say = h.say.concat([it.say]).slice(-HINT_MAX); if (it.when) h.when = it.when; await env.ACCESS.put('tplh', JSON.stringify(hints)); }
      await env.ACCESS.put('tplpend', JSON.stringify(pend)); await ans(it ? (mh[1] === 'ok' ? 'Добавлено' : 'Отклонено') : 'Уже обработано');
      if (it) await edit((mh[1] === 'ok' ? '✅ Добавлено к шаблону' : '✖ Отклонено') + ' «' + tgEsc(it.t) + '»: ' + tgEsc(it.say || it.when));
    } else if (mr) { await env.ACCESS.delete('rp:' + mr[1].slice(0, 20)); await touchAv(env); await ans('Отчёт удалён'); try { await tgApi(env, 'deleteMessage', { chat_id: cid, message_id: cq.message.message_id }); } catch (e) {} }
    else await ans('');
    return json({ ok: true });
  }
  return json({ ok: true });
}
const TG_HELP = '<b>Кнопки внизу</b>\n⏳ Ждут доступа — новые пользователи с кнопками «Выдать доступ»\n👥 Пользователи — все, с кнопками доступа, сброса пароля и сеансов\n📊 Сводка — логи, частые проблемы, ИИ за сегодня\n🐞 Баг-репорты — последние отчёты со скриншотами\n📢 Объявление — бот попросит текст и опубликует его команде\n\nРегистрации, баг-репорты, массовые проблемы и сводка в 20:00 приходят сами.';
function genPass() { const AB = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = rnd(12); let pw = ''; for (let i = 0; i < 12; i++) pw += AB[r[i] % AB.length]; if (!/\d/.test(pw)) pw = pw.slice(0, 11) + '7'; if (!/[a-z]/i.test(pw)) pw = 'k' + pw.slice(1); return pw; }

export default {
  async scheduled(ev, env, ctx) {
    if (ev && ev.cron === '0 15 * * *') { ctx.waitUntil(tgSay(env, await tgSummary(env, 'Сводка')).catch(() => null)); return; }
    ctx.waitUntil(samplesExport(env).catch(() => null));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/tg/hook' && req.method === 'POST') return tgHook(req, env, ctx);
    if (p === '/v1/samples/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const h = String(b.h || ''), k = b.k === 'main' ? 'main' : b.k === 'client' ? 'client' : '', gz = String(b.gz || '');
      if (!/^[0-9a-f]{1,16}-\d{1,9}$/.test(h) || !k || !/^[A-Za-z0-9+\/=]+$/.test(gz) || gz.length > SMP_MAX_B64) return json({ ok: false }, 400);
      if (await env.ACCESS.get('smp:' + h)) return json({ ok: true, dup: true });
      const dk = 'smpn:' + new Date().toISOString().slice(0, 10); let dn = 0; try { dn = +(await env.ACCESS.get(dk)) || 0; } catch (e) {}
      if (dn >= SMP_DAY_MAX) return json({ ok: true, full: true });
      await env.ACCESS.put('smp:' + h, JSON.stringify({ k, at: Date.now(), v: String(b.v || '').slice(0, 20), len: +b.len || 0, gz }), { expirationTtl: SMP_TTL });
      await env.ACCESS.put(dk, String(dn + 1), { expirationTtl: 3 * 86400 });
      return json({ ok: true });
    }
    if (p.startsWith('/v1/auth/')) return authApi(p, req, env, ctx);
    if (p === '/v1/check') { const u = await who(req, env); return u ? json({ ok: true, n: u.n }) : deny(); }
    if (p === '/v1/rules') {
      if (!(await who(req, env))) return deny();
      try { const raw = await env.ACCESS.get('rules'); if (raw) return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', ...NOSTORE } }); } catch (e) {}
    }
    if (FILES[p]) {
      if (!(await who(req, env))) return deny();
      const r = await env.ASSETS.fetch(new Request(url.origin + FILES[p]));
      if (!r.ok) return json({ ok: false }, 404);
      const h = new Headers(r.headers); h.set('cache-control', 'no-store');
      return new Response(r.body, { status: 200, headers: h });
    }
    if (p === '/v1/pulse') {
      const u0 = await who(req, env); if (!u0) return deny();
      const news = await getNews(env); let n = 0, ver = {};
      try { const raw = await env.ACCESS.get('d:' + new Date().toISOString().slice(0, 10)); if (raw) n = (JSON.parse(raw).n) | 0; } catch (e) {}
      try { const r = await env.ASSETS.fetch(new Request(url.origin + '/ver.json')); if (r.ok) ver = await r.json(); } catch (e) {}
      let on = null; try { if (env.PRESENCE) { const st = env.PRESENCE.get(env.PRESENCE.idFromName('p')); const pr = await st.fetch('https://p/beat?h=' + encodeURIComponent(u0.h) + '&n=' + encodeURIComponent(u0.n || '')); on = await pr.json(); } } catch (e) {}
      let sv = '', rv = ''; try { sv = (await env.ACCESS.get('sv')) || ''; rv = (await env.ACCESS.get('rv')) || ''; } catch (e) {}
      return json({ ok: true, news: news[0] ? news[0].id : '', n, app: ver.app || '', shell: ver.shell || '', sv, rv, online: on ? on.count : null, names: on ? on.names : [] });
    }
    if (p === '/v1/shared') {
      const u1 = await who(req, env); if (!u1) return deny();
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      return json({ ok: true, me: u1.n || 'без имени', sv: (await env.ACCESS.get('sv')) || '', notes: sh.notes || {}, replies: sh.replies || {}, sigs: sh.sigs || {} });
    }
    if (p === '/v1/shared/vote' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const key = String(b.key || '').slice(0, 80), at = +b.at || 0, me = u.n || 'без имени';
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      const arr = (sh.replies || {})[key] || [], it = arr.find((x) => x.at === at);
      if (!it) return json({ ok: false }, 404);
      it.votes = (it.votes || []).filter((n) => n !== me); if (b.on) it.votes.push(me);
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    /* Известные причины подписей краша: одна запись на «модуль+смещение@версия», последняя правка побеждает */
    if (p === '/v1/shared/sig' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n), sig = t(b.sig, 120).toLowerCase(), ver = t(b.ver, 40);
      if (!/^[\w.\-]+\+0x[0-9a-f]+$/.test(sig)) return json({ ok: false }, 400);
      const key = sig + (ver ? '@' + ver : '');
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      sh.sigs = sh.sigs || {};
      if (b.del) delete sh.sigs[key];
      else {
        const outcome = ['fixed', 'helped', 'nohelp', 'open'].indexOf(b.outcome) >= 0 ? b.outcome : 'open', cause = t(b.cause, 1500);
        if (!cause) return json({ ok: false }, 400);
        sh.sigs[key] = { sig, ver, cause, outcome, fixedIn: t(b.fixedIn, 40), fix: (Array.isArray(b.fix) ? b.fix : []).map((x) => t(x, 300)).filter(Boolean).slice(0, 6), by: u.n || 'без имени', at: Date.now() };
        const ks = Object.keys(sh.sigs); if (ks.length > 500) { ks.sort((a, c) => sh.sigs[a].at - sh.sigs[c].at); delete sh.sigs[ks[0]]; }
      }
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    if (p === '/v1/shared/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const kind = b.kind === 'reply' ? 'replies' : b.kind === 'note' ? 'notes' : '', key = String(b.key || '').slice(0, 80), text = String(b.text || '').trim().slice(0, 2500);
      if (!kind || !key) return json({ ok: false }, 400);
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      sh.notes = sh.notes || {}; sh.replies = sh.replies || {};
      const arr = (sh[kind][key] || []).filter((x) => !(x.by === (u.n || 'без имени') && (kind === 'notes' || x.text === text)));
      if (text) arr.unshift({ by: u.n || 'без имени', at: Date.now(), text, v: String(b.v || '').slice(0, 20), votes: [] });
      if (arr.length) sh[kind][key] = arr.slice(0, 5); else delete sh[kind][key];
      if (Object.keys(sh[kind]).length > 300) delete sh[kind][Object.keys(sh[kind])[0]];
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    if (p === '/v1/ai' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'no_key' }, 503);
      let b = {}; try { b = await req.json(); } catch (e) {}
      const sys = String(b.system || '').slice(0, 20000), inp = String(b.input || '').slice(0, 60000); if (inp.length < 20) return json({ ok: false, error: 'bad' }, 400);
      /* скриншот от игрока (быстрый разбор из плагина Discord): JPEG/PNG/WebP в base64, не больше ~4 МБ; в KV не сохраняется */
      const img = b.image && /^image\/(jpeg|png|webp)$/.test(String(b.image.mime || '')) && typeof b.image.data === 'string' && b.image.data.length <= 6000000 && /^[A-Za-z0-9+/=]+$/.test(b.image.data.slice(0, 200)) ? { mime_type: b.image.mime, data: b.image.data } : null;
      /* Модели по очереди: у бесплатного уровня Gemini свой дневной лимит у каждой модели на весь проект (у Flash-Lite ~500 в день, у Flash ~20),
         поэтому по умолчанию сначала Flash-Lite, при исчерпании лимита (429) — следующая модель. tier=smart (разбор дампа) начинает с Flash. */
      const lite = String(env.GEMINI_MODELS || 'gemini-3.5-flash-lite,gemini-2.5-flash-lite').split(',').map((x) => x.trim()).filter(Boolean);
      const smart = String(env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
      const models = (b.tier === 'smart' ? [smart].concat(lite) : lite.concat([smart])).concat(['gemini-2.5-flash']).filter((x, i, a) => a.indexOf(x) === i);
      const model = 'auto:' + (b.tier === 'smart' ? 'smart' : 'lite');
      /* кэш: тот же запрос к той же модели и промпту отдаётся из KV и не тратит дневной лимит */
      let ck = ''; try { const dg = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(model + '\n' + sys + '\n' + inp + '\n' + (parseInt(b.max, 10) || 0) + (img ? '\n' + img.data : ''))); ck = 'ac:' + Array.from(new Uint8Array(dg)).slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join(''); } catch (e) {}
      if (ck && !b.fresh) { try { const hit = await env.ACCESS.get(ck); if (hit) { await bump(env, 'aiu', ['cached']); return json({ ok: true, text: hit, cached: true }); } } catch (e) {} }
      const day = new Date().toISOString().slice(0, 10), qk = 'q:' + day + ':' + u.h; let q = 0; try { q = parseInt(await env.ACCESS.get(qk), 10) || 0; } catch (e) {}
      const lim = parseInt(env.AI_DAILY, 10) || 300; if (q >= lim) return json({ ok: false, error: 'limit' });
      try { await env.ACCESS.put(qk, String(q + 1), { expirationTtl: 172800 }); } catch (e) {}
      let r = null, used = '';
      for (const mdl of models) {
        try {
          r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + mdl + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: inp }].concat(img ? [{ inline_data: img }] : []) }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: Math.max(256, Math.min(parseInt(b.max, 10) || 8192, 8192)) } }) });
        } catch (e) { return json({ ok: false, error: 'upstream', detail: 'нет связи с Gemini' }); }
        used = mdl; if ([400, 404, 429, 500, 503].indexOf(r.status) < 0) break; /* модели нет, лимит или перегрузка — пробуем следующую */
      }
      if (!r.ok && r.status === 429) { const ak = 'tga:' + day; if (!(await env.ACCESS.get(ak))) { await env.ACCESS.put(ak, '1', { expirationTtl: 2 * 86400 }); bg(ctx, tgSay(env, '🤖 <b>Бесплатный лимит ИИ на сегодня закончился.</b> Разбор работает без ИИ до завтра.')); } }
      if (!r.ok) { await bump(env, 'aiu', [r.status === 429 ? 'rate' : 'fail']); let m = ''; try { m = ((await r.json()).error || {}).message || ''; } catch (e) {} return json({ ok: false, error: r.status === 429 ? 'rate' : 'upstream', detail: 'Gemini ' + r.status + ' (' + used + ')' + (m ? ': ' + String(m).slice(0, 160) : '') }); }
      let j = {}; try { j = await r.json(); } catch (e) {}
      const t = (((j.candidates || [])[0] || {}).content || {}).parts; const text = t ? t.map(x => x.text || '').join('') : '';
      if (!text) return json({ ok: false, error: 'empty', detail: 'Gemini вернул пустой ответ' + (((j.candidates || [])[0] || {}).finishReason ? ' (' + j.candidates[0].finishReason + ')' : '') });
      if (ck) { try { await env.ACCESS.put(ck, text, { expirationTtl: 604800 }); } catch (e) {} }
      await bump(env, 'aiu', ['ok', 'm:' + used]); return json({ ok: true, text, model: used });
    }
    /* Шаблоны ответов команды (из плагина SupportTemplates): читают все, у кого есть доступ; загружает только тот, кто знает пароль администратора */
    if (p === '/v1/tpl') { const u = await who(req, env); if (!u) return deny(); const raw = await env.ACCESS.get('tpl'); if (!raw) return json({ ok: true, none: true }); try { return json(Object.assign({ ok: true }, JSON.parse(raw))); } catch (e) { return json({ ok: true, none: true }); } }
    if (p === '/v1/tpl/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const pw = String(env.ADMIN_PASS || '').trim(); if (!pw || !same(String(b.pass || '').trim(), pw)) return json({ ok: false, error: 'pass' }, 403);
      const sets = (Array.isArray(b.sets) ? b.sets : []).slice(0, 6).map((st) => ({ name: String(st.name || '').slice(0, 60), items: (Array.isArray(st.items) ? st.items : []).slice(0, 300).map((x) => ({ t: String(x.t || '').slice(0, 160), body: String(x.body || '').slice(0, 6000), hide: !!x.hide })).filter((x) => x.t && x.body) })).filter((st) => st.name && st.items.length);
      if (!sets.length) return json({ ok: false, error: 'empty' }, 400);
      const out = JSON.stringify({ at: Date.now(), by: u.n || '', sets }); if (out.length > 900000) return json({ ok: false, error: 'size' }, 413);
      await env.ACCESS.put('tpl', out); return json({ ok: true, n: sets.reduce((a, st) => a + st.items.length, 0) });
    }
    if (p === '/v1/tplev' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny(); let b = {}; try { b = await req.json(); } catch (e) {}
      const ev = ['shown', 'none', 'r1', 'r2', 'r3', 'search', 'reply'].indexOf(b.ev) >= 0 ? b.ev : ''; if (!ev) return json({ ok: false }, 400);
      await bump(env, 'tplm', [ev, ev === 'shown' && b.src === 'ИИ' ? 'shownAi' : '']); return json({ ok: true });
    }
    if (p === '/v1/tplhints') { const u = await who(req, env); if (!u) return deny(); return json(Object.assign({ ok: true }, await tplHintsAll(env))); }
    if (p === '/v1/tplfit' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny(); let b = {}; try { b = await req.json(); } catch (e) {}
      const set = clip(b.set, 60), t = clip(b.t, 160), v = b.v === 1 ? 0 : b.v === -1 ? 1 : -1; if (!set || !t || v < 0) return json({ ok: false }, 400);
      const st = await kvJson(env, 'tplst', {}); st[set] = st[set] || {}; const c = st[set][t] = st[set][t] || [0, 0]; c[v]++;
      await env.ACCESS.put('tplst', JSON.stringify(st)); return json({ ok: true, up: c[0], down: c[1] });
    }
    if (p === '/v1/tplhint/suggest' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny(); let b = {}; try { b = await req.json(); } catch (e) {}
      const n = await addPending(env, [{ set: b.set, t: b.t, say: b.say, when: b.when, by: u.n || '' }]);
      if (n) bg(ctx, (async () => { const pend = await kvJson(env, 'tplpend', []), it = pend[pend.length - 1]; if (it) await tgSay(env, '💬 <b>Фраза для шаблона</b> от ' + tgEsc(it.by || 'саппорта') + '\nШаблон: «' + tgEsc(it.t) + '» (' + tgEsc(it.set) + ')\nИгроки пишут: <i>' + tgEsc(it.say || it.when) + '</i>', [[['✅ Добавить', 'h:ok:' + it.id], ['✖ Отклонить', 'h:no:' + it.id]]]); })());
      return json({ ok: !!n, error: n ? '' : 'empty' });
    }
    if (p === '/v1/tplhint/admin' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny(); let b = {}; try { b = await req.json(); } catch (e) {}
      const pw = String(env.ADMIN_PASS || '').trim(); if (!pw || !same(String(b.pass || '').trim(), pw)) return json({ ok: false, error: 'pass' }, 403);
      const hints = await kvJson(env, 'tplh', {}); let pend = await kvJson(env, 'tplpend', []);
      const put = (set, t, say, when) => { hints[set] = hints[set] || {}; const h = hints[set][t] = hints[set][t] || { say: [], when: '' }; if (say && h.say.indexOf(say) < 0) h.say = h.say.concat([say]).slice(-HINT_MAX); if (when) h.when = when; };
      if (b.action === 'approve' || b.action === 'reject') { const it = pend.find((x) => x.id === b.id); pend = pend.filter((x) => x.id !== b.id); if (it && b.action === 'approve') put(it.set, it.t, cleanSay(b.say != null ? b.say : it.say), clip(b.when != null ? b.when : it.when, 300)); }
      else if (b.action === 'set') { const set = clip(b.set, 60), t = clip(b.t, 160); if (!set || !t) return json({ ok: false }, 400); hints[set] = hints[set] || {}; hints[set][t] = { say: (Array.isArray(b.say) ? b.say : []).map(cleanSay).filter(Boolean).slice(0, HINT_MAX), when: clip(b.when, 300) }; }
      else return json({ ok: false, error: 'action' }, 400);
      await env.ACCESS.put('tplh', JSON.stringify(hints)); await env.ACCESS.put('tplpend', JSON.stringify(pend)); return json({ ok: true });
    }
    if (p === '/v1/ai/ping') { const u = await who(req, env); if (!u) return deny(); return json({ ok: !!env.GEMINI_API_KEY }); }
    if (p === '/v1/backup/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const kb = typeof b.kb === 'string' ? b.kb : ''; if (kb.length < 10 || kb.length > 4000000) return json({ ok: false }, 400);
      await env.ACCESS.put('b:' + u.h, JSON.stringify({ at: Date.now(), kb })); return json({ ok: true });
    }
    if (p === '/v1/backup/get') {
      const u = await who(req, env); if (!u) return deny();
      let raw = await env.ACCESS.get('b:' + u.h); if (!raw && u.hw && u.hw !== u.h) raw = await env.ACCESS.get('b:' + u.hw); if (!raw) return json({ ok: true, none: true });
      let r = {}; try { r = JSON.parse(raw); } catch (e) {} return json({ ok: true, at: r.at || 0, kb: r.kb || '' });
    }
    if (p === '/v1/report' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const text = String(b.text || '').trim().slice(0, 3000), link = String(b.link || '').trim().slice(0, 500);
      let shot = typeof b.shot === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.shot) ? b.shot : ''; if (shot.length > 1500000) shot = '';
      if (!text && !link && !shot) return json({ ok: false }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const rec = { id, at: Date.now(), by: u.n || 'без имени', page: String(b.page || '').slice(0, 60), text, link, v: String(b.v || '').slice(0, 20), diag: String(b.diag || '').slice(0, 1500), shot };
      await env.ACCESS.put('rp:' + id, JSON.stringify(rec), { expirationTtl: 90 * 86400 });
      await touchAv(env); bg(ctx, tgNotifyReport(env, rec));
      return json({ ok: true });
    }
    if (p === '/v1/news') { if (!(await who(req, env))) return deny(); return json({ ok: true, list: await getNews(env) }); }
    if (p === '/v1/tickets/get') {
      const u = await who(req, env); if (!u) return deny();
      const tag = normTag(url.searchParams.get('tag')), hash = String(url.searchParams.get('hash') || '').slice(0, 24);
      let rec = null, hit = null;
      if (tag) { const raw = await env.ACCESS.get('t:' + tag); if (raw) { try { rec = JSON.parse(raw); } catch (e) {} } }
      if (hash) { const raw = await env.ACCESS.get('lh:' + hash); if (raw) { try { hit = JSON.parse(raw); } catch (e) {} } }
      return json({ ok: true, rec, hit });
    }
    if (p === '/v1/tickets/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const tag = normTag(b.tag), hash = String(b.hash || '').slice(0, 24); if (!tag || !hash) return json({ ok: false }, 400);
      const it = { hash, at: Date.now(), by: u.n || 'без имени', v: String(b.v || '').slice(0, 12), st: String(b.st || '').slice(0, 12), head: String(b.head || '').slice(0, 200), keys: (Array.isArray(b.keys) ? b.keys : []).slice(0, 6).map((x) => String(x).slice(0, 120)) };
      let rec = { tag: String(b.tag).trim().slice(0, 60), items: [] }; const raw = await env.ACCESS.get('t:' + tag); if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
      rec.items = [it].concat((rec.items || []).filter((x) => x.hash !== hash)).slice(0, 20);
      await env.ACCESS.put('t:' + tag, JSON.stringify(rec));
      await env.ACCESS.put('lh:' + hash, JSON.stringify({ at: it.at, by: it.by, tag: rec.tag, st: it.st }));
      return json({ ok: true });
    }
    if (p === '/v1/logs/put' && Date.now() < Date.parse('2026-10-14T23:59:59+03:00') && req.method === 'POST') { const u = await who(req, env); if (!u) return deny(); return json({ ok: true, added: 0, paused: true }); }
    if (p === '/v1/logs/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40), day = new Date().toISOString().slice(0, 10), TTL = { expirationTtl: 45 * 86400 };
      let acc = null, added = 0;
      for (const it of items) {
        const hash = String(it.hash || '').slice(0, 24); if (!/^[0-9a-z-]{4,24}$/i.test(hash)) continue;
        if (await env.ACCESS.get('r:' + hash)) continue;
        await env.ACCESS.put('r:' + hash, '1', TTL);
        if (!acc) { acc = { n: 0, bad: 0, mods: 0, probs: {} }; try { const raw = await env.ACCESS.get('d:' + day); if (raw) acc = JSON.parse(raw); } catch (e) {} }
        acc.n++; if (it.st === 'bad') acc.bad++; if (it.mods) acc.mods++;
        const bv = /^[0-9][0-9.]{0,14}$/.test(String(it.bv || '')) ? String(it.bv) : '';
        if (bv) { acc.bv = acc.bv || {}; const x = acc.bv[bv] = acc.bv[bv] || { n: 0, bad: 0 }; x.n++; if (it.st === 'bad') x.bad++; }
        for (const pr of (Array.isArray(it.probs) ? it.probs : []).slice(0, 8)) {
          const k = String(pr.k || '').slice(0, 80); if (!k) continue;
          if (!acc.probs[k] && Object.keys(acc.probs).length >= 200) continue;
          const o = acc.probs[k] = acc.probs[k] || { t: String(pr.t || k).slice(0, 160), c: 0, fx: (Array.isArray(pr.fx) ? pr.fx : []).slice(0, 3).map((x) => String(x).slice(0, 220)) };
          o.c++; if (bv) { o.b = o.b || {}; if (o.b[bv] || Object.keys(o.b).length < 6) o.b[bv] = (o.b[bv] || 0) + 1; }
        }
        added++;
      }
      if (acc && added) {
        await env.ACCESS.put('d:' + day, JSON.stringify(acc), TTL);
        /* массовая проблема: одна и та же проблема в 20+ логах за день — одно сообщение в Telegram */
        const lim = parseInt(env.MASS_TG || '20', 10) || 20, hot = Object.keys(acc.probs).filter((k) => acc.probs[k].c >= lim);
        if (hot.length && (await tgChat(env))) bg(ctx, (async () => { for (const k of hot) { const mk = 'tgm:' + day + ':' + k.slice(0, 60); if (await env.ACCESS.get(mk)) continue; await env.ACCESS.put(mk, '1', { expirationTtl: 2 * 86400 }); const o = acc.probs[k]; await tgSay(env, '🔥 <b>Массовая проблема</b>: ' + tgEsc(o.t) + '\nЗа сегодня уже в ' + o.c + ' логах.' + (o.fx && o.fx.length ? '\n\nЧто советовать: ' + o.fx.map(tgEsc).join('; ') : '')); } })());
      }
      return json({ ok: true, added });
    }
    if (p === '/v1/stats') {
      const u = await who(req, env); if (!u) return deny();
      const n = Math.max(1, Math.min(14, parseInt(url.searchParams.get('days') || '7', 10) || 7)), out = [];
      for (let i = 0; i < n; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const raw = await env.ACCESS.get('d:' + d); if (raw) { try { out.push(Object.assign({ d }, JSON.parse(raw))); } catch (e) {} } }
      return json({ ok: true, today: new Date().toISOString().slice(0, 10), days: out });
    }
    /* Сайт для телефона: то же приложение, вход по коду устройства (тот же список доступа, что у компьютеров) */
    if (p === '/m') return Response.redirect(url.origin + '/m/', 301);
    if (p === '/m/share') return Response.redirect(url.origin + '/m/', 303);
    if (p.startsWith('/m/')) {
      if (p !== '/m/' && !/^\/m\/[a-z0-9._-]+$/i.test(p)) return new Response('Not found', { status: 404, headers: NOSTORE });
      let r = await env.ASSETS.fetch(new Request(url.origin + p, { redirect: 'manual' }));
      if (p === '/m/' && !r.ok) r = await env.ASSETS.fetch(new Request(url.origin + '/m/index.html', { redirect: 'manual' }));
      if (!r.ok) return new Response('Not found', { status: 404, headers: NOSTORE });
      const h = new Headers(r.headers), page = p === '/m/' || p === '/m/index.html';
      h.set('cache-control', page || /\.(js|webmanifest)$/.test(p) ? 'no-cache' : 'public, max-age=86400');
      if (p === '/m/sw.js') h.set('service-worker-allowed', '/m/');
      if (page) { h.set('x-robots-tag', 'noindex'); h.set('content-type', 'text/html; charset=utf-8'); }
      return new Response(r.body, { status: 200, headers: h });
    }
    if (p === '/admin') return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', ...NOSTORE, 'x-robots-tag': 'noindex' } });
    if (p === '/admin/api' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ ok: false, error: env.ADMIN_PASS ? 'Неверный пароль' : 'На сервере не задан пароль ADMIN_PASS' }, 401);
      let b = {}; try { b = await req.json(); } catch (e) {}
      if (b.action === 'list') {
        const out = []; let cursor;
        do { const l = await env.ACCESS.list({ prefix: 'h:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); let r = {}; try { r = JSON.parse(raw); } catch (e) {} out.push({ h: k.name.slice(2), n: r.n || '', added: r.added || 0, seen: r.seen || 0 }); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
        out.sort((a, c) => (c.seen || 0) - (a.seen || 0));
        return json({ ok: true, list: out });
      }
      if (b.action === 'rulesGet') { let rl = []; try { const raw = await env.ACCESS.get('rules'); if (raw) rl = JSON.parse(raw).rules || []; } catch (e) {} return json({ ok: true, rules: rl }); }
      if (b.action === 'rulesSet') {
        const rl = (Array.isArray(b.rules) ? b.rules : []).slice(0, 200).map((r, i) => ({ id: String(r.id || 'r' + Date.now().toString(36) + i).slice(0, 40), kind: r.kind === 'client' ? 'client' : 'main', pattern: String(r.pattern || '').slice(0, 200), title: String(r.title || '').slice(0, 160), sev: ['info', 'warn', 'err', 'crit'].includes(r.sev) ? r.sev : 'err', cause: String(r.cause || '').slice(0, 800), fix: (Array.isArray(r.fix) ? r.fix : []).slice(0, 10).map((x) => String(x).slice(0, 400)) })).filter((r) => r.pattern);
        await env.ACCESS.put('rules', JSON.stringify({ v: 1, rules: rl })); await env.ACCESS.put('rv', String(Date.now())); return json({ ok: true, n: rl.length });
      }
      if (b.action === 'stats') {
        const out = [];
        for (let i = 0; i < 14; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const raw = await env.ACCESS.get('d:' + d); if (raw) { try { const o = JSON.parse(raw); out.push({ d, n: o.n | 0, bad: o.bad | 0, mods: o.mods | 0, probs: Object.keys(o.probs || {}).map((k) => ({ k, t: o.probs[k].t, c: o.probs[k].c | 0 })) }); } catch (e) {} } }
        return json({ ok: true, days: out });
      }
      if (b.action === 'reportList') {
        const out = []; let cursor;
        do { const l = await env.ACCESS.list({ prefix: 'rp:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); let r = {}; try { r = JSON.parse(raw); } catch (e) {} if (r.id) { r.hasShot = !!r.shot; delete r.shot; out.push(r); } } cursor = l.list_complete ? null : l.cursor; } while (cursor);
        out.sort((a, c) => c.at - a.at); return json({ ok: true, list: out.slice(0, 100) });
      }
      if (b.action === 'reportShot') { const raw = await env.ACCESS.get('rp:' + String(b.id || '').slice(0, 20)); let r = {}; try { r = JSON.parse(raw); } catch (e) {} return json({ ok: true, shot: r.shot || '' }); }
      if (b.action === 'reportDel') { await env.ACCESS.delete('rp:' + String(b.id || '').slice(0, 20)); await touchAv(env); return json({ ok: true }); }
      if (b.action === 'newsList') return json({ ok: true, list: await getNews(env) });
      if (b.action === 'newsAdd') {
        const text = String(b.text || '').trim().slice(0, 1500); if (!text) return json({ ok: false, error: 'Пустой текст' }, 400);
        const list = await getNews(env); list.unshift({ id: Date.now().toString(36), at: Date.now(), text }); await env.ACCESS.put('news', JSON.stringify(list.slice(0, 30))); await touchAv(env); return json({ ok: true });
      }
      if (b.action === 'samplesExport') return json(await samplesExport(env));
      if (b.action === 'tplStats') {
        const days = []; for (let i = 0; i < 14; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({ d, t: await kvJson(env, 'tplm:' + d, {}), a: await kvJson(env, 'aiu:' + d, {}) }); }
        const st = await kvJson(env, 'tplst', {}), worst = []; for (const set of Object.keys(st)) for (const t of Object.keys(st[set])) { const c = st[set][t]; if (c[0] + c[1] >= 3) worst.push({ set, t, up: c[0], down: c[1] }); }
        worst.sort((a, c) => (c.down / (c.up + c.down)) - (a.down / (a.up + a.down)) || c.down - a.down);
        return json({ ok: true, days, worst: worst.slice(0, 15), pending: (await kvJson(env, 'tplpend', [])).length });
      }
      if (b.action === 'samplesInfo') { let n = 0, cursor; do { const l = await env.ACCESS.list({ prefix: 'smp:', cursor }); n += l.keys.length; cursor = l.list_complete ? null : l.cursor; } while (cursor); let x = null; try { x = JSON.parse(await env.ACCESS.get('smpx')); } catch (e) {} return json({ ok: true, n, last: x, repo: env.GH_SAMPLES_REPO || '', ready: !!(env.GH_TOKEN && env.GH_SAMPLES_REPO) }); }
      if (b.action === 'ping') return json({ ok: true, v: (await env.ACCESS.get('av')) || '0' });
      if (b.action === 'newsDel') { const list = (await getNews(env)).filter((x) => x.id !== b.id); await env.ACCESS.put('news', JSON.stringify(list)); await touchAv(env); return json({ ok: true }); }
      /* аккаунты: список, выдать или забрать доступ, сбросить пароль (случайный временный), завершить сеансы, удалить */
      if (b.action === 'users') {
        const out = []; let cursor;
        do { const l = await env.ACCESS.list({ prefix: 'u:', cursor }); for (const k of l.keys) { const u = await userGet(env, k.name.slice(2)); if (u) out.push({ login: u.login, st: u.st, at: u.at || 0, seen: u.seen || 0, must: !!u.must, ses: (u.ss || []).length }); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
        out.sort((a, c) => (a.st === 'pending' ? 0 : 1) - (c.st === 'pending' ? 0 : 1) || (c.seen || 0) - (a.seen || 0));
        return json({ ok: true, list: out, legacy: (await env.ACCESS.get('legacy')) !== '0' });
      }
      if (b.action === 'tgInfo') { let me = null; if (env.TG_TOKEN) { const r = await tgApi(env, 'getMe', {}); me = r && r.ok ? r.result.username : null; } return json({ ok: true, token: !!env.TG_TOKEN, bot: me, bound: !!(await env.ACCESS.get('tg:chat')) }); }
      if (b.action === 'tgLink') {
        if (!env.TG_TOKEN) return json({ ok: false, error: 'Сначала добавьте секрет TG_TOKEN в Cloudflare' });
        const hook = await tgApi(env, 'setWebhook', { url: url.origin + '/tg/hook', secret_token: await tgSecret(env), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
        if (!hook || !hook.ok) return json({ ok: false, error: 'Telegram не принял настройку: ' + ((hook && hook.description) || 'нет ответа') });
        await tgApi(env, 'setMyCommands', { commands: [{ command: 'pending', description: 'Кто ждёт доступа' }, { command: 'users', description: 'Все пользователи' }, { command: 'stats', description: 'Сводка за сегодня' }, { command: 'reports', description: 'Баг-репорты' }, { command: 'news', description: 'Объявление команде' }] });
        const code = String(100000 + (rnd(4).reduce((a, x) => a * 256 + x, 0) % 900000)); await env.ACCESS.put('tg:code', code, { expirationTtl: 900 });
        const me = await tgApi(env, 'getMe', {}); return json({ ok: true, code, bot: me && me.ok ? me.result.username : '' });
      }
      if (b.action === 'tgUnlink') { await env.ACCESS.delete('tg:chat'); return json({ ok: true }); }
      if (b.action === 'tgTest') { const r = await tgSay(env, await tgSummary(env, 'Проверка: сводка')); return json({ ok: !!(r && r.ok), error: r && r.ok ? '' : 'Бот не привязан или токен неверный' }); }
      if (b.action === 'legacySet') { await env.ACCESS.put('legacy', b.on ? '1' : '0'); await touchAv(env); return json({ ok: true, legacy: !!b.on }); }
      if (/^user(Set|Reset|Kick|Del)$/.test(b.action || '')) {
        const u = await userGet(env, String(b.login || '').trim().toLowerCase()); if (!u) return json({ ok: false, error: 'Пользователь не найден' }, 404);
        if (b.action === 'userSet') { if (['ok', 'off', 'pending'].indexOf(b.st) < 0) return json({ ok: false }, 400); u.st = b.st; await userPut(env, u); await touchAv(env); return json({ ok: true }); }
        if (b.action === 'userReset') {
          const pw = genPass();
          await setPw(u, pw); u.must = true; await sessionsEnd(env, u, null); await userPut(env, u); return json({ ok: true, pass: pw });
        }
        if (b.action === 'userKick') { await sessionsEnd(env, u, null); await userPut(env, u); return json({ ok: true }); }
        if (b.action === 'userDel') { await sessionsEnd(env, u, null); await env.ACCESS.delete('u:' + u.k); await touchAv(env); return json({ ok: true }); }
      }
      const h = String(b.h || '').trim().toUpperCase();
      if (!HW.test(h)) return json({ ok: false, error: 'Код должен быть вида XXXXX-XXXXX-XXXXX-XXXXX' }, 400);
      if (b.action === 'add') { const old = await env.ACCESS.get('h:' + h); let r = {}; try { r = old ? JSON.parse(old) : {}; } catch (e) {} await env.ACCESS.put('h:' + h, JSON.stringify({ n: String(b.n || '').slice(0, 80), added: r.added || Date.now(), seen: r.seen || 0 })); await touchAv(env); return json({ ok: true }); }
      if (b.action === 'del') { await env.ACCESS.delete('h:' + h); await touchAv(env); return json({ ok: true }); }
      return json({ ok: false, error: 'Неизвестное действие' }, 400);
    }
    return new Response('Not found', { status: 404, headers: NOSTORE });
  }
};

const ADMIN_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Доступ</title>
<style>[hidden]{display:none!important}:root{--bg:#eef1f5;--ink:#0c1420;--mut:#5c6879;--line:#cdd3dc;--card:#fff;--acc:#1d4ed8;--bad:#b4233a}@media(prefers-color-scheme:dark){:root{--bg:#0b111a;--ink:#e6ecf5;--mut:#93a1b5;--line:#263244;--card:#121a26;--acc:#6b8cff;--bad:#ff7a8c}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:820px;margin:0 auto;padding:28px 16px;display:grid;gap:16px}h1{margin:0;font-size:22px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:12px}
textarea{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-width:0;flex:1 1 280px;resize:vertical}input{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-width:0}button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:8px 14px;cursor:pointer}button.p{background:var(--acc);border-color:var(--acc);color:#fff}button.d{color:var(--bad)}
.row{display:flex;gap:8px;flex-wrap:wrap}.row input{flex:1 1 180px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}code{font:600 13px Consolas,monospace}.m{color:var(--mut);font-size:13px}.w{overflow-x:auto}</style></head><body><main>
<h1>Доступ к анализатору логов</h1>
<div class="card" id="login"><div class="row"><input type="password" id="pw" placeholder="Пароль администратора" autocomplete="current-password"><button class="p" id="go">Войти</button></div><div class="m" id="msg"></div></div>
<div id="app" hidden><div class="card" id="tgCard"><b>Telegram-бот</b><div class="m" id="tgSt">Проверяю…</div><div class="row"><button class="p" id="tgLink">Привязать бота</button><button id="tgTest">Прислать сводку сейчас</button><button class="d" id="tgUnlink">Отвязать</button></div><div class="m" id="tgMsg"></div>
<details class="m"><summary>Как подключить (один раз)</summary><ol style="margin:6px 0 0;padding-left:20px"><li>В Telegram откройте <b>@BotFather</b> → <code>/newbot</code> → придумайте имя и адрес бота. Он пришлёт токен вида <code>123456:ABC…</code>.</li><li>Cloudflare → Workers &amp; Pages → <b>majestic-log-advisor</b> → Settings → Variables and Secrets → Add → тип <b>Secret</b>, имя <code>TG_TOKEN</code>, значение — токен → Deploy.</li><li>Здесь нажмите «Привязать бота», откройте бота по ссылке и отправьте ему код.</li></ol></details></div>
<div class="card" id="usersCard"><b>Пользователи <span class="m" id="ucnt"></span></b><div class="m">Человек сам регистрируется в приложении (кнопка «Регистрация» на экране входа) и появляется здесь со статусом «Ожидает». Нажмите «Выдать доступ». «Сбросить пароль» создаёт случайный пароль: передайте его человеку, после входа он сменит его в личном кабинете.</div><div class="w"><table><thead><tr><th>Логин</th><th>Статус</th><th>Последний вход</th><th></th></tr></thead><tbody id="ul"></tbody></table></div><div class="m" id="umsg"></div><label class="m" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="legacy"> Пускать и по старым кодам компьютеров и телефонов (список ниже)</label></div>
<div class="card"><b>Добавить компьютер или телефон</b><div class="m">Код компьютера показан в приложении для Windows. Код телефона — на сайте <code>/m/</code> этого сервера при первом открытии: человек присылает его вам. В имени удобно указать «телефон».</div><div class="row"><input id="h" placeholder="Код: XXXXX-XXXXX-XXXXX-XXXXX"><input id="n" placeholder="Имя (необязательно)"><button class="p" id="add">Выдать доступ</button></div><div class="m" id="msg2"></div></div>
<div class="card"><b>Объявление для команды</b><div class="m">Появится у всех пользователей при следующем запуске приложения.</div><div class="row"><textarea id="nt" rows="3" placeholder="Например: Добавлено правило про ошибку 0x80070005, обновите приложение"></textarea><button class="p" id="nadd">Отправить</button></div><div class="m" id="msg3"></div><div class="w"><table><tbody id="nl"></tbody></table></div></div>
<div class="card"><b>Правила команды</b><div class="m">Правила появляются у всех в приложении без обновления. Новое правило применяется к строкам лога, где есть указанный текст.</div><div class="row"><select id="rk"><option value="main">main.log</option><option value="client">client.log</option></select><select id="rs"><option value="err">Ошибка</option><option value="warn">Предупреждение</option><option value="crit">Критично</option><option value="info">Информация</option></select><input id="rp" placeholder="Что искать в строке лога"><input id="rt" placeholder="Название проблемы"></div><div class="row"><textarea id="rc" rows="2" placeholder="Причина проблемы"></textarea><textarea id="rf" rows="3" placeholder="Шаги решения, каждый с новой строки"></textarea></div><div class="row"><button class="p" id="radd">Добавить правило</button></div><div class="m" id="msg4"></div><div class="w"><table><tbody id="rl"></tbody></table></div></div>
<div class="m" id="live"></div>
<div class="card"><b>Статистика команды за 14 дней</b> <button id="stR">Обновить</button><div class="w" id="stBox"></div></div>
<div class="card"><b>Подбор шаблонов и ИИ за 14 дней</b> <button id="tsR">Обновить</button><div class="m">Окон с шаблонами, сколько раз вставили 1-й, 2-й, 3-й шаблон или нашли вручную, и запросы к ИИ (из кэша не тратят лимит; «лимит» — Gemini отказал из-за бесплатного лимита).</div><div class="w" id="tsBox"><span class="m">Загрузка…</span></div></div>
<div class="card"><b>Логи для обучения</b> <button id="smX">Выгрузить сейчас</button><div class="w" id="smBox"><span class="m">Загрузка…</span></div></div>
<div class="card"><b>Сообщения о проблемах <span class="m" id="rcnt"></span></b><div class="w"><table><tbody id="rpl"></tbody></table></div></div>
<div class="card"><b>Разрешённые компьютеры <span class="m" id="cnt"></span></b><div class="w"><table><thead><tr><th>Код</th><th>Имя</th><th>Последний вход</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div></div>
<script>
const $=s=>document.querySelector(s);let PW='';try{PW=sessionStorage.getItem('pw')||''}catch(e){}
async function api(b){const r=await fetch('/admin/api',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+PW},body:JSON.stringify(b)});return r.json()}
const fmt=t=>t?new Date(t).toLocaleString('ru'):'ещё не заходил';const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SIG={};const same=(k,v)=>{const x=JSON.stringify(v);if(SIG[k]===x)return true;SIG[k]=x;return false};
async function load(){const r=await api({action:'list'});if(!r.ok){$('#msg').textContent=r.error||'Ошибка';$('#login').hidden=false;$('#app').hidden=true;return}
$('#login').hidden=true;$('#app').hidden=false;if(same('l',r.list))return;$('#cnt').textContent='('+r.list.length+')';
$('#tb').innerHTML=r.list.map(x=>'<tr><td><code>'+esc(x.h)+'</code></td><td>'+esc(x.n)+'</td><td class="m">'+fmt(x.seen)+'</td><td><button class="d" data-h="'+esc(x.h)+'">Отозвать</button></td></tr>').join('')||'<tr><td colspan="4" class="m">Список пуст</td></tr>'}
$('#go').onclick=()=>{PW=$('#pw').value;try{sessionStorage.setItem('pw',PW)}catch(e){}load().then(()=>poll(true));loadUsers();loadTg();loadNews();loadRules();loadReports();loadStats();loadSmp();loadTpl()};$('#pw').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};
$('#add').onclick=async()=>{const r=await api({action:'add',h:$('#h').value,n:$('#n').value});$('#msg2').textContent=r.ok?'Доступ выдан.':(r.error||'Ошибка');if(r.ok){$('#h').value='';$('#n').value='';load()}};
$('#tb').onclick=async e=>{const h=e.target.getAttribute&&e.target.getAttribute('data-h');if(!h)return;if(e.target.dataset.sure!=='1'){e.target.dataset.sure='1';e.target.textContent='Точно отозвать?';return}await api({action:'del',h});load()};
const UST={pending:'Ожидает',ok:'Доступ выдан',off:'Доступ закрыт'};
async function loadUsers(){const r=await api({action:'users'});if(!r.ok)return;$('#legacy').checked=!!r.legacy;if(same('u',r.list))return;const np=r.list.filter(x=>x.st==='pending').length;$('#ucnt').textContent='('+r.list.length+(np?', ждут: '+np:'')+')';
$('#ul').innerHTML=r.list.map(x=>'<tr><td><b>'+esc(x.login)+'</b>'+(x.must?'<div class="m">временный пароль</div>':'')+'</td><td'+(x.st==='pending'?' style="color:var(--acc);font-weight:600"':x.st==='off'?' style="color:var(--bad)"':'')+'>'+UST[x.st]+'</td><td class="m">'+fmt(x.seen)+(x.ses?'<div>сеансов: '+x.ses+'</div>':'')+'</td><td><div style="display:flex;flex-wrap:wrap;gap:6px">'+(x.st!=='ok'?'<button class="p" data-u="'+esc(x.login)+'" data-a="ok">Выдать доступ</button> ':'<button data-u="'+esc(x.login)+'" data-a="off">Забрать доступ</button> ')+'<button data-u="'+esc(x.login)+'" data-a="reset">Сбросить пароль</button> <button data-u="'+esc(x.login)+'" data-a="kick" title="Выйти на всех устройствах">Завершить сеансы</button> <button class="d" data-u="'+esc(x.login)+'" data-a="del">Удалить</button></div></td></tr>').join('')||'<tr><td colspan="4" class="m">Пока никто не зарегистрировался</td></tr>'}
$('#ul').onclick=async e=>{const b=e.target.closest&&e.target.closest('button[data-u]');if(!b)return;const u=b.dataset.u,a=b.dataset.a;
if((a==='del'||a==='reset'||a==='kick')&&b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent=a==='del'?'Точно удалить?':a==='reset'?'Точно сбросить?':'Точно завершить?';return}
let r;if(a==='ok'||a==='off')r=await api({action:'userSet',login:u,st:a});else if(a==='reset')r=await api({action:'userReset',login:u});else if(a==='kick')r=await api({action:'userKick',login:u});else r=await api({action:'userDel',login:u});
$('#umsg').innerHTML=!r.ok?esc(r.error||'Ошибка'):a==='reset'?'Новый пароль для <b>'+esc(u)+'</b>: <code style="user-select:all;font-size:16px">'+esc(r.pass)+'</code> <button id="ucp">Скопировать</button><br>Передайте его человеку. После входа приложение предложит сменить пароль на свой.':a==='ok'?'Доступ выдан: '+esc(u)+'.':a==='off'?'Доступ закрыт: '+esc(u)+'.':a==='kick'?'Сеансы завершены: '+esc(u)+' войдёт заново.':'Удалён: '+esc(u)+'.';
if(r.pass){$('#ucp').onclick=()=>{navigator.clipboard.writeText(r.pass);$('#ucp').textContent='Скопировано'}}SIG.u='';loadUsers()};
$('#legacy').onchange=async()=>{const on=$('#legacy').checked;if(!on&&!confirm('Выключить вход по кодам? Пустит только по аккаунтам.')){$('#legacy').checked=true;return}await api({action:'legacySet',on});$('#umsg').textContent=on?'Вход по кодам включён.':'Вход по кодам выключен: только аккаунты.'};
async function loadTg(){const r=await api({action:'tgInfo'});if(!r.ok)return;$('#tgSt').innerHTML=!r.token?'Не подключён: нет секрета <code>TG_TOKEN</code> в Cloudflare (см. «Как подключить»).':!r.bot?'Токен задан, но Telegram его не принимает — проверьте токен.':r.bound?'✅ Работает: бот <b>@'+esc(r.bot)+'</b> привязан к вашему Telegram. Сюда приходят регистрации, баг-репорты, массовые проблемы и сводка в 20:00 (по Екатеринбургу).':'Бот <b>@'+esc(r.bot)+'</b> найден, но ещё не привязан — нажмите «Привязать бота».';$('#tgUnlink').hidden=!r.bound;$('#tgTest').hidden=!r.bound}
$('#tgLink').onclick=async()=>{const r=await api({action:'tgLink'});$('#tgMsg').innerHTML=!r.ok?esc(r.error||'Ошибка'):'Откройте <a href="https://t.me/'+esc(r.bot)+'?start='+esc(r.code)+'" target="_blank" rel="noopener">@'+esc(r.bot)+'</a> и нажмите «Старт» (или отправьте боту код <b style="font-size:17px">'+esc(r.code)+'</b>). Код действует 15 минут.';setTimeout(loadTg,20000)};
$('#tgTest').onclick=async()=>{const r=await api({action:'tgTest'});$('#tgMsg').textContent=r.ok?'Сводка отправлена в Telegram.':(r.error||'Ошибка')};
$('#tgUnlink').onclick=async e=>{if(e.target.dataset.sure!=='1'){e.target.dataset.sure='1';e.target.textContent='Точно отвязать?';return}await api({action:'tgUnlink'});e.target.dataset.sure='';e.target.textContent='Отвязать';$('#tgMsg').textContent='Бот отвязан.';loadTg()};
async function loadNews(){const r=await api({action:'newsList'});if(!r.ok||same('n',r.list))return;$('#nl').innerHTML=r.list.map(x=>'<tr><td class="m">'+fmt(x.at)+'</td><td>'+esc(x.text)+'</td><td><button class="d" data-n="'+esc(x.id)+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Объявлений нет</td></tr>'}
$('#nadd').onclick=async()=>{const r=await api({action:'newsAdd',text:$('#nt').value});$('#msg3').textContent=r.ok?'Отправлено.':(r.error||'Ошибка');if(r.ok){$('#nt').value='';loadNews()}};
$('#nl').onclick=async e=>{const n=e.target.getAttribute&&e.target.getAttribute('data-n');if(!n)return;await api({action:'newsDel',id:n});loadNews()};
let RULES=[];
async function loadRules(){const r=await api({action:'rulesGet'});if(!r.ok)return;RULES=r.rules;drawRules()}
function drawRules(){$('#rl').innerHTML=RULES.map((x,i)=>'<tr><td class="m">'+esc(x.kind)+'</td><td><b>'+esc(x.title||x.pattern)+'</b><div class="m">'+esc(x.pattern)+'</div></td><td><button class="d" data-r="'+i+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Правил нет</td></tr>'}
async function saveRules(){const r=await api({action:'rulesSet',rules:RULES});$('#msg4').textContent=r.ok?'Сохранено: '+r.n+'. Правила дойдут до приложений в течение минуты.':(r.error||'Ошибка');return r}
$('#radd').onclick=async()=>{const pat=$('#rp').value.trim();if(!pat){$('#msg4').textContent='Укажите, что искать в строке лога';return}RULES.push({kind:$('#rk').value,sev:$('#rs').value,pattern:pat,title:$('#rt').value.trim(),cause:$('#rc').value.trim(),fix:$('#rf').value.split('\\n').map(x=>x.trim()).filter(Boolean)});const r=await saveRules();if(r.ok){$('#rp').value=$('#rt').value=$('#rc').value=$('#rf').value='';drawRules()}else{RULES.pop()}};
$('#rl').onclick=async e=>{const i=e.target.getAttribute&&e.target.getAttribute('data-r');if(i===null||i===undefined)return;RULES.splice(+i,1);await saveRules();drawRules()};
async function loadStats(){const r=await api({action:'stats'});if(!r.ok||same('st',r.days))return;const days=r.days;if(!days.length){$('#stBox').innerHTML='<div class="m">Данных пока нет</div>';return}const tot=days.reduce((a,x)=>({n:a.n+x.n,bad:a.bad+x.bad,mods:a.mods+x.mods}),{n:0,bad:0,mods:0});const pm={};days.forEach(x=>x.probs.forEach(p=>{const o=pm[p.k]=pm[p.k]||{t:p.t,c:0};o.c+=p.c}));const top=Object.keys(pm).map(k=>pm[k]).sort((a,b)=>b.c-a.c).slice(0,10);$('#stBox').innerHTML='<div class="m">Логов: '+tot.n+', с провалом запуска: '+tot.bad+' ('+(tot.n?Math.round(tot.bad*100/tot.n):0)+'%), с модами: '+tot.mods+'</div><table><tbody>'+days.map(x=>'<tr><td class="m">'+esc(x.d)+'</td><td>'+x.n+' логов</td><td>'+x.bad+' провалов</td><td>'+x.mods+' с модами</td></tr>').join('')+'</tbody></table><b>Частые проблемы</b><table><tbody>'+top.map(p=>'<tr><td>'+esc(p.t)+'</td><td>'+p.c+'</td></tr>').join('')+'</tbody></table>'}
$('#stR').onclick=()=>{SIG.st='';loadStats()};
async function loadSmp(){const r=await api({action:'samplesInfo'});if(!r.ok)return;$('#smBox').innerHTML='Хранится обезличенных логов: <b>'+r.n+'</b> (7 дней). '+(r.ready?'Выгрузка в закрытый репозиторий '+esc(r.repo)+(r.last?': последняя '+fmt(r.last.at)+', логов '+r.last.n:': ещё не было')+'.':'<span class="m">Выгрузка не настроена: задайте секреты GH_TOKEN и GH_SAMPLES_REPO в Cloudflare.</span>')}
$('#smX').onclick=async()=>{$('#smX').disabled=true;const r=await api({action:'samplesExport'});$('#smX').disabled=false;alert(r.ok?'Выгружено логов: '+r.n:'Ошибка: '+(r.error||'нет ответа'));loadSmp()};
async function loadTpl(){const r=await api({action:'tplStats'});if(!r.ok||!Array.isArray(r.days))return;r.worst=r.worst||[];const d=r.days,S=(f,k)=>d.reduce((a,x)=>a+((x[f]||{})[k]||0),0),sh=S('t','shown'),r1=S('t','r1'),r2=S('t','r2'),r3=S('t','r3'),se=S('t','search'),no=S('t','none'),pc=n=>sh?Math.round(n*100/sh)+'%':'—';
let h='<table><tr><th>За 14 дней</th><th></th></tr><tr><td>Окон с подбором шаблона</td><td><b>'+sh+'</b></td></tr><tr><td>Вставили 1-й предложенный</td><td><b>'+r1+'</b> ('+pc(r1)+')</td></tr><tr><td>2-й / 3-й</td><td>'+r2+' / '+r3+'</td></tr><tr><td>Нашли вручную поиском</td><td>'+se+' ('+pc(se)+')</td></tr><tr><td>Шаблон не нашёлся</td><td>'+no+'</td></tr><tr><td>ИИ: запросов / из кэша / упёрлись в лимит / ошибки</td><td>'+S('a','ok')+' / '+S('a','cached')+' / '+S('a','rate')+' / '+S('a','fail')+'</td></tr></table>';
h+='<div class="m" style="margin-top:8px">По дням (ИИ-запросов):</div><table>'+d.filter(x=>x.a.ok||x.t.shown).map(x=>'<tr><td class="m">'+x.d+'</td><td>окон '+(x.t.shown||0)+', 1-й '+(x.t.r1||0)+', поиск '+(x.t.search||0)+'</td><td>ИИ '+(x.a.ok||0)+(x.a.rate?', лимит '+x.a.rate:'')+'</td></tr>').join('')+'</table>';
if(r.worst.length)h+='<div class="m" style="margin-top:8px">Чаще всего «не подходит» — им нужны фразы или «когда отправлять»:</div><table>'+r.worst.map(x=>'<tr><td>'+esc(x.t)+' <span class="m">'+esc(x.set)+'</span></td><td>не подходит '+x.down+' из '+(x.up+x.down)+'</td></tr>').join('')+'</table>';
if(r.pending)h+='<div class="m" style="margin-top:8px">Подсказок ждут проверки: <b>'+r.pending+'</b> — в приложении: «Настройки» → «Шаблоны ответов команды» → «Подсказки для подбора».</div>';
$('#tsBox').innerHTML=h}
$('#tsR').onclick=()=>loadTpl();
async function loadReports(){const r=await api({action:'reportList'});if(!r.ok||same('r',r.list))return;document.title=r.list.length?'('+r.list.length+') Доступ':'Доступ';$('#rcnt').textContent=r.list.length?'('+r.list.length+')':'';$('#rpl').innerHTML=r.list.map(x=>'<tr><td class="m" style="white-space:nowrap">'+fmt(x.at)+'<br>'+esc(x.by)+'<br>'+esc(x.v||'')+'</td><td><b>'+esc(x.page||'—')+'</b><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(x.text)+'</div>'+(/^https?:\\/\\//.test(x.link)?'<div><a href="'+esc(x.link)+'" target="_blank" rel="noopener">'+esc(x.link)+'</a></div>':x.link?'<div class="m">'+esc(x.link)+'</div>':'')+(x.diag?'<details><summary class="m">Сведения о приложении</summary><div class="m" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(x.diag)+'</div></details>':'')+(x.hasShot?'<div><button data-s="'+esc(x.id)+'">Показать скриншот</button></div>':'')+'<div data-i="'+esc(x.id)+'"></div></td><td><button class="d" data-rd="'+esc(x.id)+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Сообщений нет</td></tr>'}
$('#rpl').onclick=async e=>{const t=e.target,s=t.getAttribute&&t.getAttribute('data-s'),d=t.getAttribute&&t.getAttribute('data-rd');if(s){const r=await api({action:'reportShot',id:s});const box=t.parentNode.nextSibling;box.innerHTML=r.shot?'<img src="'+r.shot+'" style="max-width:100%;border-radius:8px;margin-top:6px">':'<span class="m">Нет картинки</span>'}if(d){await api({action:'reportDel',id:d});loadReports()}};
let AV=null,BUSY=false;
function stamp(){const d=new Date(),p=n=>(n<10?'0':'')+n;$('#live').textContent='Обновляется само. Проверено в '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
async function poll(force){if(BUSY||!PW||$('#app').hidden||(document.hidden&&!force))return;BUSY=true;try{const r=await api({action:'ping'});if(r.ok){if(force||r.v!==AV){AV=r.v;await Promise.all([load(),loadUsers(),loadNews(),loadReports(),loadStats()])}stamp()}}catch(e){$('#live').textContent='Нет связи, пробую снова…'}BUSY=false}
setInterval(()=>poll(false),15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(true)});
if(PW){load().then(()=>poll(true));loadUsers();loadTg();loadNews();loadRules();loadReports();loadStats();loadSmp();loadTpl()}
</script></main></body></html>`;

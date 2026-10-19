/* ---------- Сайт для телефона (/m/) ----------
   То же приложение, открытое в браузере телефона. Вместо кода компьютера (HWID) — случайный код устройства, который
   хранится на телефоне; администратор добавляет его в тот же список доступа. Запросы к серверу команды идут напрямую
   (сайт открыт с того же адреса, что и сервер). Логи по-прежнему разбираются на самом телефоне. */
var WEB = !window.nativeApp && /^https?:$/.test(location.protocol) && (window.MLA_WEB === 1 || /^\/m(\/|$)/.test(location.pathname));
var WEB_KEY = 'mla.dev', WEB_OK = 'mla.webok', IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
var HW_RE = /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/;
function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function webDev() {
  var d = lsGet(WEB_KEY); if (HW_RE.test(d)) return d;
  var a = new Uint8Array(10); crypto.getRandomValues(a);
  d = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('').toUpperCase().match(/.{5}/g).join('-');
  lsSet(WEB_KEY, d); return d;
}
/* как gatedFetch в приложении для Windows: путь /v1/…, тело — JSON; ответ — текст или null */
async function webFetch(p, opts) {
  p = String(p || ''); if (!/^\/v1\/[a-z0-9\/._-]+$/i.test(p)) return null; opts = opts || {};
  var q = opts.query && typeof opts.query === 'object' ? '&' + Object.keys(opts.query).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(opts.query[k]).slice(0, 200)); }).join('&') : '';
  var init = { cache: 'no-store', headers: { 'X-HWID': webDev() } }, st = lsGet('mla.sess'); if (st) init.headers['X-Session'] = st;
  if (opts.body != null) { init.method = 'POST'; init.body = JSON.stringify(opts.body); if (init.body.length > 4500000) return null; init.headers['content-type'] = 'application/json'; }
  try { var r = await fetch(p + '?t=' + Date.now() + q, init); return r.ok ? await r.text() : null; } catch (e) { return null; }
}
/* запрос к серверу команды из приложения для Windows или с телефона */
async function gfetch(p, opts) { if (window.nativeApp && window.nativeApp.gatedFetch) return window.nativeApp.gatedFetch(p, opts); if (WEB) return webFetch(p, opts); return null; }

/* ---------- Вход: аккаунт (логин и пароль) ----------
   Сайт для телефона и приложение для Windows (новая оболочка) показывают одно и то же окно входа. Человек сам регистрируется,
   администратор выдаёт доступ в админке. Сеанс запоминается на устройстве (до выхода кнопкой «Выйти»). Старый вход по коду
   компьютера или телефона продолжает работать, пока администратор его не выключит. */
var ACC = WEB || !!(window.nativeApp && window.nativeApp.authSet), SES_KEY = 'mla.sess', ACC_OK = 'mla.accok';
var ACCS = { user: null, legacy: false, poll: 0, mode: 'login', closable: false };
async function accReq(path, body) {
  if (WEB) {
    try { var h = { 'X-HWID': webDev() }, t = lsGet(SES_KEY); if (t) h['X-Session'] = t; if (body) h['content-type'] = 'application/json'; var r = await fetch(path + '?t=' + Date.now(), { method: body ? 'POST' : 'GET', cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined }); return await r.json(); } catch (e) { return null; }
  }
  try { var tx = await gfetch(path, body ? { body: body } : {}); return tx ? JSON.parse(tx) : null; } catch (e) { return null; }
}
async function accSave(tok, login) { if (WEB) { lsSet(SES_KEY, tok || null); return; } try { await window.nativeApp.authSet(tok || '', login || ''); } catch (e) {} }
/* те же правила, что на сервере: 8+ символов, буквы и цифры, не повторы, не логин, не популярный пароль */
var PW_COMMON = ['password', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'qwert', 'asdfgh', 'asdf', 'zxcvbn', 'zxcv', 'qazwsx', 'qaz', 'wsx', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'admin', 'administrator', 'root', 'user', 'login', 'test', 'guest', 'welcome', 'letmein', 'iloveyou', 'love', 'monkey', 'dragon', 'master', 'football', 'majestic', 'support', 'secret', 'парол', 'пароль', 'йцукен', 'йцукенг', 'фыва', 'фывапр', 'привет', 'qq', 'aa', 'ab', 'q', 'a', 'qw', 'qwe', 'qwer'];
function pwRules(pw, login) {
  pw = String(pw || ''); var letters = pw.replace(/[^A-Za-zА-Яа-яЁё]/g, ''), low = pw.toLowerCase(), lg = String(login || '').toLowerCase();
  var common = PW_COMMON.indexOf(letters.toLowerCase()) >= 0 || /1q2w|q1w2|1qaz|zaq1|qazwsx|1234qwer|qwer1234|asdf1234/.test(low);
  return { len: pw.length >= 8 && pw.length <= 128, mix: letters.length >= 2 && /\d/.test(pw), vary: pw.length > 0 && new Set(low.split('')).size >= 5 && !common && !(lg.length >= 3 && low.indexOf(lg) >= 0) };
}
function pwIssue(pw, login) { var r = pwRules(pw, login); return !r.len ? 'Пароль: не меньше 8 символов.' : !r.mix ? 'В пароле нужны буквы и хотя бы одна цифра.' : !r.vary ? 'Пароль слишком простой: без повторов, без логина и не из популярных (qwerty123, 12345678…).' : ''; }
var MARK = '<svg class="wg-mk" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="8" fill="var(--ink)"/><path d="M6 20h6l3.5-9 5 16 3.5-10 2 3H30" fill="none" stroke="var(--bg)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function pwRulesHtml(id) { return '<ul class="wg-rules" id="' + id + '"><li data-r="len">Не меньше 8 символов</li><li data-r="mix">Буквы и цифры</li><li data-r="vary">Не простой: без повторов, без логина, не qwerty123 и не 12345678</li><li data-r="same">Пароли совпадают</li></ul>'; }
/* живая проверка нового пароля: галочки требований, подсветка поля повтора, кнопка доступна, только когда всё верно */
function pwLive(f) {
  var pw = $(f.pw) ? $(f.pw).value : '', p2el = $(f.pw2), p2 = p2el ? p2el.value : '', login = f.login ? ($(f.login) ? $(f.login).value : f.login) : '';
  var r = pwRules(pw, login); r.same = !!pw && pw === p2;
  var ul = document.getElementById(f.rules); if (ul) ul.querySelectorAll('li').forEach(function (li) { var k = li.getAttribute('data-r'); li.classList.toggle('ok', !!r[k] && !!pw); li.classList.toggle('bad', k === 'same' && !!p2 && !r.same); });
  if (p2el) { var mism = !!p2 && !r.same; p2el.classList.toggle('bad', mism); p2el.classList.toggle('good', !!p2 && r.same); p2el.setAttribute('aria-invalid', String(mism)); var e = document.getElementById(f.err); if (e) e.textContent = mism ? 'Пароли не совпадают' : ''; }
  var all = r.len && r.mix && r.vary && r.same, btn = document.querySelector(f.btn); if (btn) btn.disabled = !all;
  return all;
}
var PWF_REG = { pw: '#wgP', pw2: '#wgP2', login: '#wgL', rules: 'wgRules', err: 'wgP2e', btn: '#wgForm [type=submit]' }, PWF_ACC = { pw: '#apNew', pw2: '#apNew2', rules: 'apRules', err: 'apNew2e', btn: '#accPw [type=submit]' };
function accGate(state, msg) {
  var g = document.getElementById('webGate');
  if (state === 'ok') { if (g) g.remove(); document.documentElement.classList.remove('gated'); return; }
  document.documentElement.classList.add('gated');
  if (!g) { g = document.createElement('div'); g.id = 'webGate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-label', 'Вход в анализатор'); document.body.appendChild(g); }
  var u = ACCS.user, reg = ACCS.mode === 'register', h = '<div class="wg-box">' + (WEB ? '<img class="wg-ic" src="/m/icon-180.png" alt="" width="72" height="72">' : MARK) + '<h2>Анализатор логов Majestic</h2>';
  if (state === 'wait') h += '<p class="wg-t">Проверяю вход…</p>';
  else if (state === 'net') h += '<p class="wg-t">Нет связи с сервером команды. Проверьте интернет.</p><button class="btn primary wg-go" type="button" data-wg="retry">Повторить</button>';
  else if (state === 'pending' || state === 'off') h += '<p class="wg-t">' + (state === 'pending' ? 'Аккаунт <b>' + esc(u.login) + '</b> создан и ждёт подтверждения. Когда администратор выдаст доступ, анализатор откроется сам.' : 'Доступ для <b>' + esc(u.login) + '</b> закрыт администратором.') + '</p>' +
    (state === 'pending' ? '<button class="btn primary wg-go" type="button" data-wg="retry">Проверить сейчас</button>' : '') + '<button class="btn ghost wg-alt" type="button" data-wg="logout">Выйти из аккаунта</button>';
  else {
    h += '<div class="wg-tabs" role="tablist"><button type="button" role="tab" data-wg="tab" data-m="login" aria-selected="' + !reg + '">Вход</button><button type="button" role="tab" data-wg="tab" data-m="register" aria-selected="' + reg + '">Регистрация</button></div>' +
      '<form class="wg-f" id="wgForm" novalidate><label>Логин<input id="wgL" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="24" required></label>' +
      '<label>Пароль<span class="wg-pw"><input id="wgP" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" maxlength="128" required><button type="button" class="wg-eye" data-wg="eye" aria-label="Показать пароль">Показать</button></span></label>' +
      (reg ? '<label>Повторите пароль<input id="wgP2" type="password" autocomplete="new-password" maxlength="128" required aria-describedby="wgP2e"><span class="wg-err" id="wgP2e" role="alert"></span></label>' + pwRulesHtml('wgRules') : '') +
      '<p class="wg-h wg-msg" id="wgMsg" role="status" aria-live="polite">' + esc(msg || '') + '</p>' +
      '<button class="btn primary wg-go" type="submit"' + (reg ? ' disabled' : '') + '>' + (reg ? 'Зарегистрироваться' : 'Войти') + '</button></form>' +
      (reg ? '<p class="wg-tip">Логин — латинские буквы и цифры, от 3 символов. После регистрации администратор выдаст доступ, и анализатор откроется сам. Один аккаунт — на компьютере и на телефоне.</p>' : '<p class="wg-tip">Забыли пароль? Напишите администратору: он сбросит пароль, а новый вы поменяете в личном кабинете.</p>') +
      (ACCS.closable ? '<button class="btn ghost wg-alt" type="button" data-wg="close">Позже</button>' : '');
  }
  if (h.indexOf('id="wgMsg"') < 0) h += '<p class="wg-h" id="wgMsg" role="status" aria-live="polite">' + esc(msg || '') + '</p>';
  h += 
    (WEB && IOS && !navigator.standalone && state !== 'wait' ? '<p class="wg-tip"><b>Совет.</b> Нажмите «Поделиться» <span class="ios-share" aria-hidden="true"></span> → «На экран „Домой“» — анализатор откроется как приложение.</p>' : '') + '</div>';
  g.innerHTML = h;
  var li = document.getElementById('wgL'); if (li && !('ontouchstart' in window)) li.focus();
}
function webCopy(text) { try { navigator.clipboard.writeText(text); return true; } catch (e) {} try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (e) { return false; } }
function accOk(user, legacy) {
  var was = !!lsGet(ACC_OK); ACCS.user = user; ACCS.legacy = !!legacy; ACCS.closable = false;
  lsSet(ACC_OK, '1'); if (WEB) lsSet(WEB_OK, '1'); accGate('ok');
  if (!was) { status('Доступ открыт' + (user ? ': ' + user.login : '') + '. Добавьте лог кнопкой «+».'); try { loadTeam(false); checkNews(); fetchShared(); pulse(); tplFetch(); } catch (e) {} }
  if (user && user.must) setTimeout(function () { openAccount('Вы вошли с временным паролем от администратора. Задайте свой пароль.'); }, 300);
  try { if (typeof mobSync === 'function') mobSync(); } catch (e) {}
}
async function accCheck(quiet) {
  var me = await accReq('/v1/auth/me');
  if (!me) { if (lsGet(ACC_OK)) return accOk(ACCS.user, ACCS.legacy); return accGate('net'); }
  if (me.user && me.user.st === 'ok') return accOk(me.user, false);
  if (me.user) { ACCS.user = me.user; lsSet(ACC_OK, null); if (WEB) lsSet(WEB_OK, null); return accGate(me.user.st === 'off' ? 'off' : 'pending'); }
  if (me.legacy) return accOk(null, true);
  lsSet(ACC_OK, null); if (WEB) lsSet(WEB_OK, null); ACCS.user = null; if (!quiet || !document.getElementById('wgForm')) accGate('login');
}
function gm(t, err) { var m = $('#wgMsg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } }
async function accSubmit() {
  var l = ($('#wgL').value || '').trim(), pw = $('#wgP').value || '', reg = ACCS.mode === 'register', msg = $('#wgMsg'), btn = document.querySelector('#wgForm [type=submit]');
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(l)) { gm('Логин: от 3 до 24 символов — латинские буквы, цифры, точка, дефис или _.', true); return; }
  if (reg) { var bad = pwIssue(pw, l); if (bad) { gm(bad, true); $('#wgP').focus(); return; } if (pw !== ($('#wgP2').value || '')) { pwLive(PWF_REG); gm('Пароли не совпадают — введите одинаковый пароль в оба поля.', true); $('#wgP2').focus(); return; } }
  else if (!pw) { gm('Введите пароль.', true); return; }
  btn.disabled = true; gm(reg ? 'Создаю аккаунт…' : 'Вхожу…', false);
  var dev = WEB ? (IOS ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'браузер') : 'Windows';
  var r = await accReq(reg ? '/v1/auth/register' : '/v1/auth/login', { login: l, pass: pw, dev: dev });
  btn.disabled = false;
  if (!r) { gm('Нет связи с сервером. Проверьте интернет.', true); return; }
  if (!r.ok) { gm(r.error || 'Не получилось.', true); return; }
  await accSave(r.token, r.user.login);
  if (r.user.st === 'ok') accOk(r.user, false); else { ACCS.user = r.user; accGate(r.user.st === 'off' ? 'off' : 'pending'); }
}
async function accLogout() {
  await accReq('/v1/auth/logout', {}); await accSave('', ''); lsSet(ACC_OK, null); if (WEB) lsSet(WEB_OK, null); ACCS.user = null; $('#panelHost').innerHTML = '';
  status('Вы вышли из аккаунта.'); await accCheck();
}
/* личный кабинет: логин, смена пароля, выход */
function openAccount(note) {
  var u = ACCS.user, h = '<div class="panel" data-act="closePanel"><div class="box acc-box" role="dialog" aria-label="Аккаунт" data-act="noop"><b>Аккаунт</b>';
  if (note) h += '<div class="alertbox"><b>' + esc(note) + '</b></div>';
  if (u) h += '<p style="margin:0">Вы вошли как <b>' + esc(u.login) + '</b>. Этот аккаунт работает и на компьютере, и на телефоне.</p>' +
    '<h4 style="margin:6px 0 0">Сменить пароль</h4><form id="accPw" class="wg-f" novalidate><label>Текущий пароль<input id="apOld" type="password" autocomplete="current-password"></label><label>Новый пароль<input id="apNew" type="password" autocomplete="new-password"></label><label>Повторите новый пароль<input id="apNew2" type="password" autocomplete="new-password" aria-describedby="apNew2e"><span class="wg-err" id="apNew2e" role="alert"></span></label>' + pwRulesHtml('apRules') + '<button class="btn primary" type="submit" disabled>Сменить пароль</button><p class="hint" id="apMsg" role="status" aria-live="polite" style="margin:0"></p></form>' +
    '<div class="row-actions"><button class="btn" type="button" data-wg="logoutAsk">Выйти из аккаунта</button><button class="btn ghost" type="button" data-act="closePanel">Закрыть</button></div>';
  else h += '<p style="margin:0">Сейчас вы заходите по коду этого ' + (WEB ? 'телефона' : 'компьютера') + '. Войдите в аккаунт или зарегистрируйтесь — тогда один и тот же доступ будет и на компьютере, и на телефоне, и вход не будет слетать.</p>' +
    '<div class="row-actions"><button class="btn primary" type="button" data-wg="opengate">Войти или зарегистрироваться</button><button class="btn ghost" type="button" data-act="closePanel">Закрыть</button></div>';
  $('#panelHost').innerHTML = h + '</div></div>';
}
async function accPassSubmit() {
  var m = $('#apMsg'), o = $('#apOld').value || '', n = $('#apNew').value || '', bad = pwIssue(n, ACCS.user && ACCS.user.login);
  if (!o) { m.textContent = 'Введите текущий пароль.'; return; } if (bad) { m.textContent = bad; return; } if (n !== ($('#apNew2').value || '')) { pwLive(PWF_ACC); m.textContent = 'Новые пароли не совпадают.'; $('#apNew2').focus(); return; }
  m.textContent = 'Сохраняю…'; var r = await accReq('/v1/auth/pass', { old: o, pass: n });
  if (!r) { m.textContent = 'Нет связи с сервером.'; return; } if (!r.ok) { m.textContent = r.error || 'Не получилось.'; return; }
  ACCS.user = r.user; $('#panelHost').innerHTML = ''; status('Пароль изменён. На других устройствах войдите с новым паролем.');
}
async function webStart() {
  if (WEB) {
    document.documentElement.classList.add('web');
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' }).catch(function () {}); } catch (e) {}
    /* iPhone не даёт выбрать .log, если поле выбора ограничено типами файлов — снимаем ограничение */
    if (IOS) document.querySelectorAll('input[type=file]').forEach(function (x) { x.removeAttribute('accept'); });
  }
  if (!ACC) return;
  document.documentElement.classList.add('acc');
  document.addEventListener('click', async function (e) {
    var b = e.target.closest && e.target.closest('[data-wg]'); if (!b) return;
    var k = b.getAttribute('data-wg');
    if (k === 'tab') { ACCS.mode = b.getAttribute('data-m'); var keep = $('#wgL') ? $('#wgL').value : ''; accGate('login'); if ($('#wgL')) $('#wgL').value = keep; }
    else if (k === 'eye') { var pi = $('#wgP'); if (pi) { var sh = pi.type === 'password'; pi.type = sh ? 'text' : 'password'; if ($('#wgP2')) $('#wgP2').type = pi.type; b.textContent = sh ? 'Скрыть' : 'Показать'; } }
    else if (k === 'retry') { b.disabled = true; await accCheck(); }
    else if (k === 'logout') accLogout();
    else if (k === 'logoutAsk') { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно выйти?'; return; } accLogout(); }
    else if (k === 'close') { ACCS.closable = false; accGate('ok'); }
    else if (k === 'opengate') { $('#panelHost').innerHTML = ''; ACCS.closable = true; ACCS.mode = 'login'; accGate('login'); }
  });
  document.addEventListener('submit', function (e) { if (e.target.id === 'wgForm') { e.preventDefault(); accSubmit(); } else if (e.target.id === 'accPw') { e.preventDefault(); accPassSubmit(); } });
  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if ((id === 'wgP' || id === 'wgL' || id === 'wgP2') && $('#wgP2')) { pwLive(PWF_REG); if ($('#wgMsg')) $('#wgMsg').textContent = ''; }
    if (id === 'apNew' || id === 'apNew2' || id === 'apOld') { PWF_ACC.login = ACCS.user && ACCS.user.login; pwLive(PWF_ACC); }
  });
  if (!lsGet(ACC_OK)) accGate('wait');
  await accCheck();
  /* пока окно входа открыто в ожидании подтверждения — тихо проверяем раз в 15 секунд */
  setInterval(function () { var g = document.getElementById('webGate'); if (g && !document.hidden && !g.querySelector('#wgForm')) accCheck(true); }, 15000);
}
/* файлы, которыми поделились из Discord или «Файлов» на Android (share target), лежат в кэше service worker */
async function webShared() {
  if (!WEB || !/[?&]share=1/.test(location.search) || !window.caches) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  try {
    var c = await caches.open('mla-share'), ks = await c.keys(), files = [];
    for (var i = 0; i < ks.length; i++) { var r = await c.match(ks[i]); if (!r) continue; var b = await r.blob(); files.push(new File([b], decodeURIComponent(r.headers.get('x-name') || 'file'), { type: b.type })); await c.delete(ks[i]); }
    if (files.length) readFiles(files);
  } catch (e) {}
}
/* новая версия на сервере: на телефоне достаточно перезагрузить страницу; если человек ничего не делает — обновляем сами */
var webUpdAt = '';
function webUpdate(v) {
  if (webUpdAt === v) return; webUpdAt = v;
  var idle = function () { return !document.querySelector('#panelHost .panel, .msheet.open') && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)); };
  if (document.hidden && idle()) { location.reload(); return; }
  var l = document.getElementById('updLine'); if (l) { l.hidden = false; l.textContent = 'Обновить до ' + v; l.onclick = function () { location.reload(); }; }
  document.documentElement.classList.add('has-upd');
  document.addEventListener('visibilitychange', function () { if (document.hidden && idle()) location.reload(); });
}

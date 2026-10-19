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
  var init = { cache: 'no-store', headers: { 'X-HWID': webDev() } };
  if (opts.body != null) { init.method = 'POST'; init.body = JSON.stringify(opts.body); if (init.body.length > 4500000) return null; init.headers['content-type'] = 'application/json'; }
  try { var r = await fetch(p + '?t=' + Date.now() + q, init); return r.ok ? await r.text() : null; } catch (e) { return null; }
}
/* запрос к серверу команды из приложения для Windows или с телефона */
async function gfetch(p, opts) { if (window.nativeApp && window.nativeApp.gatedFetch) return window.nativeApp.gatedFetch(p, opts); if (WEB) return webFetch(p, opts); return null; }

/* ---------- Экран доступа ---------- */
async function webCheck() {
  try { var r = await fetch('/v1/check?t=' + Date.now(), { cache: 'no-store', headers: { 'X-HWID': webDev() } }); if (r.status === 403) return { st: 'deny' }; var j = await r.json(); return j && j.ok ? { st: 'ok', n: j.n || '' } : { st: 'deny' }; } catch (e) { return { st: 'net' }; }
}
function webGate(state) {
  var g = document.getElementById('webGate');
  if (state === 'ok') { if (g) g.remove(); document.documentElement.classList.remove('gated'); return; }
  document.documentElement.classList.add('gated');
  if (!g) { g = document.createElement('div'); g.id = 'webGate'; g.setAttribute('role', 'dialog'); g.setAttribute('aria-label', 'Доступ к анализатору'); document.body.appendChild(g); }
  var code = webDev();
  g.innerHTML = '<div class="wg-box">' +
    '<img class="wg-ic" src="/m/icon-180.png" alt="" width="72" height="72">' +
    '<h2>Анализатор логов Majestic</h2>' +
    (state === 'net' ? '<p class="wg-t">Нет связи с сервером команды. Проверьте интернет и попробуйте ещё раз.</p>' :
      '<p class="wg-t">Чтобы пользоваться анализатором, отправьте этот код администратору. Он добавит телефон в список доступа — так же, как компьютер.</p>') +
    '<button class="wg-code" type="button" data-wg="copy" aria-label="Скопировать код устройства">' + code + '<span>Нажмите, чтобы скопировать</span></button>' +
    '<button class="btn primary wg-go" type="button" data-wg="check">Проверить доступ</button>' +
    '<p class="wg-h" id="wgMsg" role="status" aria-live="polite"></p>' +
    '<details class="wg-own"><summary>У меня уже есть код доступа</summary><div class="row"><input id="wgOwn" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Код устройства с доступом"><button class="btn" type="button" data-wg="own">Войти</button></div>' +
    '<p>Доступ уже выдан этому телефону в Safari или в другом браузере? Скопируйте код там («Ещё» → внизу «Код устройства») и вставьте сюда — администратору писать не нужно.</p></details>' +
    (IOS && !navigator.standalone ? '<p class="wg-tip"><b>Сначала установите.</b> Нажмите «Поделиться» <span class="ios-share" aria-hidden="true"></span> → «На экран „Домой“» и откройте анализатор уже с иконки: у приложения на экране «Домой» свой код, отдельный от Safari.</p>' : '') +
    '</div>';
}
function webCopy(text) { try { navigator.clipboard.writeText(text); return true; } catch (e) {} try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (e) { return false; } }
async function webStart() {
  if (!WEB) return;
  document.documentElement.classList.add('web');
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' }).catch(function () {}); } catch (e) {}
  /* iPhone не даёт выбрать .log, если поле выбора ограничено типами файлов — снимаем ограничение */
  if (IOS) document.querySelectorAll('input[type=file]').forEach(function (x) { x.removeAttribute('accept'); });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest && e.target.closest('[data-wg]'); if (!b) return;
    var k = b.getAttribute('data-wg'), msg = document.getElementById('wgMsg');
    if (k === 'copy') { webCopy(webDev()); if (msg) msg.textContent = 'Код скопирован. Отправьте его администратору.'; }
    if (k === 'own') {
      var inp = document.getElementById('wgOwn'), v = String(inp && inp.value || '').toUpperCase().replace(/[^0-9A-F]/g, '');
      if (v.length !== 20) { if (msg) msg.textContent = 'Код состоит из 20 знаков: XXXXX-XXXXX-XXXXX-XXXXX.'; return; }
      v = v.match(/.{5}/g).join('-'); b.disabled = true; if (msg) msg.textContent = 'Проверяю код…';
      var ok = null; try { var rr = await fetch('/v1/check?t=' + Date.now(), { cache: 'no-store', headers: { 'X-HWID': v } }); ok = rr.status === 403 ? false : rr.ok ? (await rr.json()) : null; } catch (e2) {}
      b.disabled = false;
      if (ok && ok.ok) { lsSet(WEB_KEY, v); webApply({ st: 'ok', n: ok.n || '' }); }
      else if (msg) msg.textContent = ok === null ? 'Нет связи с сервером. Проверьте интернет.' : 'У этого кода нет доступа. Проверьте код или отправьте администратору код с экрана выше.';
      return;
    }
    if (k === 'check') { b.disabled = true; if (msg) msg.textContent = 'Проверяю…'; var r = await webCheck(); b.disabled = false; webApply(r); if (r.st === 'deny' && document.getElementById('wgMsg')) document.getElementById('wgMsg').textContent = 'Доступа пока нет. Как только администратор добавит код, нажмите ещё раз.'; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'wgOwn') { e.preventDefault(); var bt = document.querySelector('[data-wg="own"]'); if (bt) bt.click(); } });
  var known = lsGet(WEB_OK);
  if (!known) webGate('wait');
  var r = await webCheck(); webApply(r);
  /* пока экран доступа открыт — тихо проверяем раз в 15 секунд */
  setInterval(function () { if (document.getElementById('webGate') && !document.hidden) webCheck().then(function (x) { if (x.st === 'ok') webApply(x); }); }, 15000);
}
function webApply(r) {
  if (r.st === 'ok') { var was = !!lsGet(WEB_OK); lsSet(WEB_OK, r.n || '1'); webGate('ok'); if (!was) { status('Доступ открыт' + (r.n ? ': ' + r.n : '') + '. Добавьте лог кнопкой «+».'); try { loadTeam(false); checkNews(); fetchShared(); pulse(); tplFetch(); } catch (e) {} } }
  else if (r.st === 'deny') { lsSet(WEB_OK, null); webGate('deny'); }
  else if (!lsGet(WEB_OK)) webGate('net');
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

// Сайт для телефона (/m/): вход по аккаунту (регистрация, ожидание, доступ от администратора, вход с другого устройства, смена пароля, выход),
// экраны «Логи» и «Разбор», вкладки снизу, окно лога, лист «Ещё», без горизонтальной прокрутки. Сервер — настоящий worker.js на временном хранилище.
const http = require('http'), fs = require('fs'), path = require('path');
const { ok, mainLog, clientLog, done } = require('./helpers');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP mobile'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..', '..'), WEB = path.join(ROOT, 'web');
/* страница собирается так же, как в scripts/prepare.sh: index.html + теги из web/head.html после первой строки */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), nl = idx.indexOf('\n') + 1;
const PAGE = idx.slice(0, nl) + fs.readFileSync(path.join(WEB, 'head.html'), 'utf8') + idx.slice(nl);
const kv = new Map(), env = { ADMIN_PASS: 'adm', ACCESS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) } };
let W = null, checks = 0;
const admin = (body) => W.fetch(new Request('http://x/admin/api', { method: 'POST', headers: { Authorization: 'Bearer adm', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env).then((r) => r.json());
const srv = http.createServer(async (q, r) => {
  const u = new URL(q.url, 'http://x'), p = u.pathname;
  if (p.startsWith('/v1/')) {
    if (p === '/v1/check' || p === '/v1/auth/me') checks++;
    if (p === '/v1/rules') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"v":1,"rules":[]}'); }
    const chunks = []; for await (const c of q) chunks.push(c); const body = Buffer.concat(chunks);
    const hd = {}; for (const k of ['x-hwid', 'x-session', 'content-type']) if (q.headers[k]) hd[k] = q.headers[k];
    const res = await W.fetch(new Request('http://x' + q.url, { method: q.method, headers: hd, body: q.method === 'POST' ? body : undefined }), env);
    r.writeHead(res.status, { 'content-type': res.headers.get('content-type') || 'application/json' }); return r.end(Buffer.from(await res.arrayBuffer()));
  }
  if (p === '/m/') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(PAGE); }
  const f = path.join(WEB, p.replace(/^\/m\//, '')); if (p.startsWith('/m/') && fs.existsSync(f)) { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/manifest+json' }); return fs.createReadStream(f).pipe(r); }
  r.writeHead(404); r.end();
});
(async () => {
  W = (await import(require('url').pathToFileURL(path.join(ROOT, 'worker', 'worker.js')).href)).default;
  await new Promise((res) => srv.listen(0, res)); const base = 'http://127.0.0.1:' + srv.address().port;
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const wide = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await p.goto(base + '/m/'); await p.waitForTimeout(900);
  ok(await p.isVisible('#webGate #wgForm') && await p.isVisible('[data-wg=tab][data-m=register]'), 'без входа виден экран «Вход / Регистрация»');
  ok(await p.evaluate(() => [...document.querySelectorAll('input[type=file]')].every((x) => !x.hasAttribute('accept'))), 'на iPhone выбор файлов не ограничен типами (иначе .log не выбрать)');
  await p.tap('[data-wg=tab][data-m=register]'); await p.waitForTimeout(200);
  await p.fill('#wgL', 'Ivan_Petrov'); await p.fill('#wgP', '12345'); await p.fill('#wgP2', '12345');
  ok(await p.isDisabled('#wgForm [type=submit]') && !(await p.evaluate(() => document.querySelector('#wgRules [data-r=len]').classList.contains('ok'))) && !kv.has('u:ivan_petrov'), 'короткий пароль: кнопка недоступна, требование не отмечено');
  await p.fill('#wgP', 'qwerty123'); await p.fill('#wgP2', 'qwerty123');
  ok(await p.isDisabled('#wgForm [type=submit]') && !(await p.evaluate(() => document.querySelector('#wgRules [data-r=vary]').classList.contains('ok'))), 'популярный пароль не принимается');
  await p.fill('#wgP', 'Kot4ik-Murzik9'); await p.fill('#wgP2', 'Kot4ik-Murzik8');
  const mm = await p.evaluate(() => ({ bad: document.getElementById('wgP2').classList.contains('bad'), err: document.getElementById('wgP2e').textContent, li: document.querySelector('#wgRules [data-r=same]').classList.contains('bad'), dis: document.querySelector('#wgForm [type=submit]').disabled }));
  ok(mm.bad && /не совпадают/.test(mm.err) && mm.li && mm.dis, 'разные пароли: поле подсвечено красным, «Пароли не совпадают», регистрация недоступна (' + JSON.stringify(mm) + ')');
  await p.fill('#wgP2', 'Kot4ik-Murzik9'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.querySelectorAll('#wgRules li.ok').length === 4 && document.getElementById('wgP2').classList.contains('good') && !document.getElementById('wgP2e').textContent) && !(await p.isDisabled('#wgForm [type=submit]')), 'одинаковые пароли: все галочки, кнопка доступна');
  await p.tap('#wgForm [type=submit]'); await p.waitForTimeout(800);
  ok(/ждёт подтверждения/.test(await p.textContent('#webGate')) && /Ivan_Petrov/.test(await p.textContent('#webGate')), 'после регистрации — «ждёт подтверждения»');
  ok((await admin({ action: 'users' })).list.some((x) => x.login === 'Ivan_Petrov' && x.st === 'pending'), 'пользователь появился в админке');
  await admin({ action: 'userSet', login: 'Ivan_Petrov', st: 'ok' });
  await p.tap('[data-wg=retry]'); await p.waitForTimeout(800);
  ok(!(await p.$('#webGate')) && await p.isVisible('#mTab'), 'после выдачи доступа анализатор открывается');
  await p.reload(); await p.waitForTimeout(1000);
  ok(!(await p.$('#webGate')), 'после перезапуска вход сохраняется');
  ok(await p.evaluate(() => document.documentElement.classList.contains('mob') && document.documentElement.getAttribute('data-ms') === 'list'), 'открывается экран «Логи»');
  ok(!(await p.isVisible('header.bar')), 'компьютерная шапка спрятана');
  await p.setInputFiles('#fileIn', [mainLog('main.log', { attempts: ['fail', 'crash'] }), clientLog('client.log', { crash: true })]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-ms') === 'view'), 'после выбора файлов открывается разбор');
  ok(/client\.log|main\.log/.test(await p.textContent('#mTitle')) && /Сбой/.test(await p.textContent('#mSub')), 'в верхней панели имя лога и итог');
  ok(await wide(), 'разбор без горизонтальной прокрутки');
  await p.tap('#mTab [data-t=log]'); await p.waitForTimeout(500);
  ok(await p.isVisible('#sc') && await wide(), 'вкладка «Лог»: строки лога, без горизонтальной прокрутки');
  ok(await p.isVisible('.mlbar') && await p.isVisible('[data-m=lfilt]') && !(await p.isVisible('#lvlSel')), 'в логе: поиск, «Фильтры» и ▲ ▼ внизу, остальное спрятано в фильтры');
  await p.tap('.mlbar [data-dir="1"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => window.scrollY === 0) && /Проблема 1 из/.test(await p.textContent('#mlCnt')) && await p.evaluate(() => document.getElementById('ins').classList.contains('mon')), '▼ переходит к проблеме без прокрутки страницы, объяснение выезжает листом');
  ok(await p.evaluate(() => { const i = document.getElementById('ins').getBoundingClientRect(), b = document.querySelector('.mlbar').getBoundingClientRect(); return i.bottom <= b.top + 1; }), 'лист с объяснением не закрывает ▲ ▼');
  await p.tap('[data-m=insx]'); await p.waitForTimeout(400); await p.tap('[data-m=lfilt]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#lvlSel') && await p.isVisible('#mlFilt [data-act=mode]'), '«Фильтры» открывают режим, срез и уровень');
  await p.tap('[data-m=lfilt]');
  await p.tap('#mTab [data-t=more]'); await p.waitForTimeout(450);
  ok(await p.isVisible('.ms-box') && await p.$('[data-g="tab:cmp"]') && await p.$('[data-g="btnSet"]'), 'лист «Ещё»: разделы и настройки');
  await p.tap('[data-g="tab:all"]'); await p.waitForTimeout(600);
  ok(/Все логи/.test(await p.textContent('#mTitle')) && await wide(), '«Все логи» из листа «Ещё»');
  await p.tap('#mTab [data-t=more]'); await p.waitForTimeout(450); await p.tap('[data-g="btnSet"]'); await p.waitForTimeout(500);
  ok(await p.isVisible('#panelHost .panel .box') && !(await p.isVisible('#panelHost .kh')), 'настройки листом снизу, без горячих клавиш');
  await p.evaluate(() => { document.querySelector('#panelHost').innerHTML = ''; });
  await p.tap('#mTab [data-t=list]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-ms') === 'list'), 'вкладка «Логи» возвращает к списку');
  await p.tap('.side .fi[data-act="open"]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-ms') === 'view'), 'нажатие на лог в списке открывает разбор');
  await p.tap('[data-m=back]'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-ms') === 'list'), 'кнопка «‹ Логи» возвращает к списку');
  /* Android «Поделиться» → «Логи Majestic»: service worker кладёт файлы в кэш и открывает /m/?share=1 */
  await p.evaluate(async () => { const c = await caches.open('mla-share'); await c.put('/m/__share/0', new Response('[2026-10-06 11:10:00.000] [info]  [ (game)              ] game.play: zombie process sweep\n', { headers: { 'x-name': encodeURIComponent('shared-main.log') } })); });
  await p.goto(base + '/m/?share=1'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /shared-main\.log/.test(document.querySelector('.side').textContent) && !/share=1/.test(location.search)), 'файл, присланный через «Поделиться», появляется в списке');
  ok(await p.evaluate(async () => (await (await caches.open('mla-share')).keys()).length === 0), 'после приёма файлы из кэша удаляются');
  /* другой браузер или приложение на экране «Домой»: тот же аккаунт — без повторной выдачи доступа */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p4 = await c2.newPage(); p4.on('pageerror', (e) => errs.push(e.message));
  await p4.goto(base + '/m/'); await p4.waitForTimeout(800);
  await p4.fill('#wgL', 'ivan_petrov'); await p4.fill('#wgP', 'неверный1'); await p4.tap('#wgForm [type=submit]'); await p4.waitForTimeout(500);
  ok(/Неверный логин или пароль/.test(await p4.textContent('#wgMsg')), 'неверный пароль не пускает');
  await p4.fill('#wgP', 'Kot4ik-Murzik9'); await p4.press('#wgP', 'Enter'); await p4.waitForTimeout(800);
  ok(!(await p4.$('#webGate')), 'вход тем же аккаунтом на другом устройстве — сразу, без админа');
  /* личный кабинет: смена пароля и выход */
  await p4.tap('#mTab [data-t=more]'); await p4.waitForTimeout(450); await p4.tap('[data-g=btnAcc]'); await p4.waitForTimeout(500);
  ok(/Ivan_Petrov/.test(await p4.textContent('#panelHost')), 'в «Ещё» → «Аккаунт» виден логин');
  await p4.fill('#apOld', 'Kot4ik-Murzik9'); await p4.fill('#apNew', '11111111'); await p4.fill('#apNew2', '11111111');
  ok(await p4.isDisabled('#accPw [type=submit]'), 'слабый новый пароль: кнопка недоступна');
  await p4.fill('#apNew', 'Novy-Parol-2026'); await p4.fill('#apNew2', 'Novy-Parol-2025');
  ok(await p4.isDisabled('#accPw [type=submit]') && /не совпадают/.test(await p4.textContent('#apNew2e')) && await p4.evaluate(() => document.getElementById('apNew2').classList.contains('bad')), 'смена пароля: разные пароли подсвечены, кнопка недоступна');
  await p4.fill('#apNew', 'Novy-Parol-2026'); await p4.fill('#apNew2', 'Novy-Parol-2026'); await p4.tap('#accPw [type=submit]'); await p4.waitForTimeout(800);
  ok(!(await p4.isVisible('#accPw')) && (await p4.textContent('#toast').catch(() => '')).includes('Пароль изменён'), 'пароль сменён в личном кабинете');
  await p.reload(); await p.waitForTimeout(1000);
  ok(await p.isVisible('#webGate #wgForm'), 'после смены пароля другие устройства выходят из аккаунта');
  await p4.tap('#mTab [data-t=more]'); await p4.waitForTimeout(450); await p4.tap('[data-g=btnAcc]'); await p4.waitForTimeout(400);
  await p4.tap('[data-wg=logoutAsk]'); await p4.tap('[data-wg=logoutAsk]'); await p4.waitForTimeout(800);
  ok(await p4.isVisible('#webGate #wgForm'), '«Выйти из аккаунта» возвращает к экрану входа');
  /* сброс пароля администратором: временный пароль, после входа приложение просит задать свой */
  const rs = await admin({ action: 'userReset', login: 'Ivan_Petrov' });
  await p4.fill('#wgL', 'Ivan_Petrov'); await p4.fill('#wgP', rs.pass); await p4.tap('#wgForm [type=submit]'); await p4.waitForTimeout(1000);
  ok(!(await p4.$('#webGate')) && /временным паролем/.test(await p4.textContent('#panelHost')), 'вход с паролем от администратора — сразу предлагает задать свой');
  /* администратор забрал доступ */
  await admin({ action: 'userSet', login: 'Ivan_Petrov', st: 'off' }); await p4.reload(); await p4.waitForTimeout(1000);
  ok(/закрыт администратором/.test(await p4.textContent('#webGate')), 'доступ закрыт — анализатор не открывается');
  /* старые коды телефонов, которым уже выдан доступ, продолжают работать */
  const c5 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p5 = await c5.newPage(); p5.on('pageerror', (e) => errs.push(e.message));
  kv.set('h:AAAAA-BBBBB-CCCCC-DDDDD', JSON.stringify({ n: 'старый телефон' })); await p5.addInitScript(() => localStorage.setItem('mla.dev', 'AAAAA-BBBBB-CCCCC-DDDDD'));
  await p5.goto(base + '/m/'); await p5.waitForTimeout(900);
  ok(!(await p5.$('#webGate')), 'телефон со старым одобренным кодом заходит без аккаунта');
  /* iPhone: лог из Discord «Поделиться» → «Скопировать» вставляется текстом, без скачивания файла */
  const cl = fs.readFileSync(clientLog('pc_client.log', { crash: true }), 'utf8'), ml = fs.readFileSync(mainLog('pc_main.log', { attempts: ['fail'] }), 'utf8');
  await p5.tap('[data-m=tab][data-t=list]'); await p5.waitForTimeout(300);
  ok(await p5.isVisible('#mPaste'), 'на экране «Логи» есть кнопка «Вставить лог из Discord»');
  
  await p5.evaluate((t) => { Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => t }, configurable: true }); }, cl);
  await p5.tap('#mPaste'); await p5.waitForTimeout(1500);
  ok(await p5.evaluate(() => document.documentElement.getAttribute('data-ms') === 'view'), 'вставленный текст лога сразу открывается в разборе');
  ok(await p5.evaluate(() => /client\.log/.test(document.querySelector('.side').textContent)), 'вставленный лог определился как client.log');
  await p5.tap('[data-m=tab][data-t=list]'); await p5.waitForTimeout(300);
  await p5.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => { throw new Error('no'); } }, configurable: true }); });
  await p5.tap('#mPaste'); await p5.waitForTimeout(300);
  ok(await p5.isVisible('#pBox #pBoxT'), 'если браузер не дал буфер — окно, куда вставить долгим нажатием');
  await p5.fill('#pBoxT', ml); await p5.tap('[data-m=pbox]'); await p5.waitForTimeout(1500);
  ok(!(await p5.$('#pBox')) && await p5.evaluate(() => /main\.log/.test(document.querySelector('.side').textContent)), 'вставка через окно разбирает main.log');
  await p5.tap('[data-m=tab][data-t=list]'); await p5.waitForTimeout(300);
  await p5.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'привет, как дела' }, configurable: true }); });
  await p5.tap('#mPaste'); await p5.waitForTimeout(400);
  ok(/не похоже на лог/.test(await p5.textContent('#status')), 'обычный текст в буфере — понятная подсказка, а не пустой разбор');
  ok(await p5.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'без горизонтальной прокрутки с кнопкой вставки');
  /* узкое окно приложения для Windows (без сайта) тоже получает мобильную раскладку, но без экрана доступа */
  const p2 = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href); await p2.waitForTimeout(800);
  ok(await p2.evaluate(() => !document.documentElement.classList.contains('mob') && !document.getElementById('webGate')) && await p2.isVisible('header.bar'), 'узкое окно программы на компьютере остаётся компьютерным, без экрана доступа');
  const p3 = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); p3.on('pageerror', (e) => errs.push(e.message));
  await p3.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href); await p3.waitForTimeout(800);
  ok(await p3.evaluate(() => document.documentElement.classList.contains('mob') && !document.getElementById('webGate')), 'файл приложения на сенсорном телефоне — телефонная раскладка без экрана доступа');
  srv.close(); await done(b, errs);
})();

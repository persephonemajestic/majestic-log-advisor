// Сайт для телефона (/m/): экран доступа по коду устройства, экраны «Логи» и «Разбор», вкладки снизу, лист «Ещё», без горизонтальной прокрутки.
const http = require('http'), fs = require('fs'), path = require('path');
const { ok, mainLog, clientLog, done } = require('./helpers');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP mobile'); process.exit(0); }
const ROOT = path.resolve(__dirname, '..', '..'), WEB = path.join(ROOT, 'web');
/* страница собирается так же, как в scripts/prepare.sh: index.html + теги из web/head.html после первой строки */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), nl = idx.indexOf('\n') + 1;
const PAGE = idx.slice(0, nl) + fs.readFileSync(path.join(WEB, 'head.html'), 'utf8') + idx.slice(nl);
let allow = '', checks = 0, posts = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'), p = u.pathname, j = (o, s) => { r.writeHead(s || 200, { 'content-type': 'application/json' }); r.end(JSON.stringify(o)); };
  if (p === '/v1/check') { checks++; return allow && q.headers['x-hwid'] === allow ? j({ ok: true, n: 'Саппорт' }) : j({ ok: false }, 403); }
  if (p.startsWith('/v1/')) { if (q.headers['x-hwid'] !== allow) return j({ ok: false }, 403); if (q.method === 'POST') posts.push(p); return j(p === '/v1/rules' ? { v: 1, rules: [] } : p === '/v1/tpl' ? { ok: true, none: true } : { ok: true, list: [], days: [] }); }
  if (p === '/m/' ) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(PAGE); }
  const f = path.join(WEB, p.replace(/^\/m\//, '')); if (p.startsWith('/m/') && fs.existsSync(f)) { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/manifest+json' }); return fs.createReadStream(f).pipe(r); }
  r.writeHead(404); r.end();
});
(async () => {
  await new Promise((res) => srv.listen(0, res)); const base = 'http://127.0.0.1:' + srv.address().port;
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const wide = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await p.goto(base + '/m/'); await p.waitForTimeout(900);
  const code = await p.evaluate(() => localStorage.getItem('mla.dev'));
  ok(/^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/.test(code || ''), 'код устройства в формате кода компьютера: ' + code);
  ok(await p.isVisible('#webGate') && (await p.textContent('#webGate')).indexOf(code) >= 0, 'без доступа виден экран с кодом устройства');
  ok(await p.evaluate(() => !document.querySelector('#webGate').textContent.includes('undefined')), 'экран доступа без мусора');
  ok(await p.evaluate(() => [...document.querySelectorAll('input[type=file]')].every((x) => !x.hasAttribute('accept'))), 'на iPhone выбор файлов не ограничен типами (иначе .log не выбрать)');
  allow = code; await p.tap('[data-wg=check]'); await p.waitForTimeout(700);
  ok(!(await p.$('#webGate')) && await p.isVisible('#mTab'), 'после добавления кода экран доступа исчезает, видны вкладки снизу');
  ok(await p.evaluate(() => document.documentElement.classList.contains('mob') && document.documentElement.getAttribute('data-ms') === 'list'), 'открывается экран «Логи»');
  ok(!(await p.isVisible('header.bar')), 'компьютерная шапка спрятана');
  await p.setInputFiles('#fileIn', [mainLog('main.log', { attempts: ['fail', 'crash'] }), clientLog('client.log', { crash: true })]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.documentElement.getAttribute('data-ms') === 'view'), 'после выбора файлов открывается разбор');
  ok(/client\.log|main\.log/.test(await p.textContent('#mTitle')) && /Сбой/.test(await p.textContent('#mSub')), 'в верхней панели имя лога и итог');
  ok(await wide(), 'разбор без горизонтальной прокрутки');
  await p.tap('#mTab [data-t=log]'); await p.waitForTimeout(500);
  ok(await p.isVisible('#sc') && await wide(), 'вкладка «Лог»: строки лога, без горизонтальной прокрутки');
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
  ok(posts.length >= 0 && checks >= 2, 'сервер команды спрашивается с кодом устройства');
  /* Android «Поделиться» → «Логи Majestic»: service worker кладёт файлы в кэш и открывает /m/?share=1 */
  await p.evaluate(async () => { const c = await caches.open('mla-share'); await c.put('/m/__share/0', new Response('[2026-10-06 11:10:00.000] [info]  [ (game)              ] game.play: zombie process sweep\n', { headers: { 'x-name': encodeURIComponent('shared-main.log') } })); });
  await p.goto(base + '/m/?share=1'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /shared-main\.log/.test(document.querySelector('.side').textContent) && !/share=1/.test(location.search)), 'файл, присланный через «Поделиться», появляется в списке');
  ok(await p.evaluate(async () => (await (await caches.open('mla-share')).keys()).length === 0), 'после приёма файлы из кэша удаляются');
  /* узкое окно приложения для Windows (без сайта) тоже получает мобильную раскладку, но без экрана доступа */
  const p2 = await (await b.newContext({ viewport: { width: 400, height: 800 } })).newPage(); p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href); await p2.waitForTimeout(800);
  ok(await p2.evaluate(() => !document.documentElement.classList.contains('mob') && !document.getElementById('webGate')) && await p2.isVisible('header.bar'), 'узкое окно программы на компьютере остаётся компьютерным, без экрана доступа');
  const p3 = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); p3.on('pageerror', (e) => errs.push(e.message));
  await p3.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href); await p3.waitForTimeout(800);
  ok(await p3.evaluate(() => document.documentElement.classList.contains('mob') && !document.getElementById('webGate')), 'файл приложения на сенсорном телефоне — телефонная раскладка без экрана доступа');
  srv.close(); await done(b, errs);
})();

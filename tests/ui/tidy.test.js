// Единый вид: меню «Вид» над логом, шапка общих вкладок без имени лога, дамп одной строкой, шаги патчера.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1440, 900);
  await H.load(p, [H.mainLog('t1.log', { attempts: ['crash'] })]);
  ok(await p.locator('#sysBox .sys-line').count() === 1, 'без дампа карточка «Дамп и журнал» в одну строку');
  await p.click('[data-tab=log]'); await p.waitForTimeout(300);
  ok(await p.locator('.vmenu').count() === 1 && !(await p.locator('#wrapBox').isVisible()), 'перенос строк и масштаб спрятаны в «Вид»');
  await p.click('.vmenu > summary'); await p.waitForTimeout(150);
  ok(await p.locator('#wrapBox').isVisible() && await p.locator('.vmenu .legend').isVisible(), '«Вид» открывается, внутри и цвета строк');
  await p.click('[data-act=zoom][data-v="1"]'); await p.waitForTimeout(150);
  ok(/110%/.test(await p.textContent('#zoomLbl')), 'масштаб меняется из меню');
  await p.mouse.click(700, 860); await p.waitForTimeout(150);
  ok(!(await p.evaluate(() => document.querySelector('.vmenu').open)), 'клик мимо закрывает меню');
  const lt = await p.evaluate(() => [...document.querySelectorAll('.lt')].map(x => Math.round(x.getBoundingClientRect().height)));
  ok(lt.length === 2 && lt.every(h => h <= 40), 'панель над логом в два ряда (' + lt.join(', ') + ')');
  for (const t of ['rep', 'all', 'stats']) { await p.click('[data-tab=' + t + ']'); await p.waitForTimeout(250); ok(!/t1\.log/.test(await p.textContent('#cmdTitle')), 'на вкладке ' + t + ' в шапке нет имени лога'); }
  ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.indexOf('Golos') >= 0 && document.fonts.check('13px "Golos Text"')), 'шрифт вшит и доступен без интернета');
  const pt = path.join(H.TMP, 'patcher_t.log'); fs.writeFileSync(pt, '[16:56:04] [info] MAJESTIC: Is running as administrator: true\n[16:56:04] [info] MAJESTIC: Deleting pirate files\n[16:56:04] [error] MAJESTIC: GTAV ERROR: ERR_FAILED_TO_LAUNCH_PLATFORM\n[16:56:04] [error] MAJESTIC: Critical error corrupted, exiting game...\n');
  await H.load(p, [pt]); await p.click('[data-tab=diag]'); await p.waitForTimeout(300);
  const nodes = await p.evaluate(() => [...document.querySelectorAll('.track[aria-label="Шаги патчера"] .node')].map(n => n.className.replace('node', '').trim()));
  ok(nodes.filter(c => c === 'fail').length === 1 && nodes.filter(c => c === '').length >= 3, 'красный только шаг, где оборвалось, дальше серые (' + nodes.join(',') + ')');
  ok(/Переустановите платформу/.test(await p.textContent('.answer')), 'ERR_FAILED_TO_LAUNCH_PLATFORM в patcher.log: ответ про переустановку платформы');
  await H.done(b, errs);
})();

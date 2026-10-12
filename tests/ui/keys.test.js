// Клавиши: ? — шпаргалка, / — поиск по логу, цифры — вкладки, R в деле копирует ответ по делу.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.mainLog('k1.log', { attempts: ['crash'] }), H.mainLog('k2.log', { attempts: ['crash'], hour: 13 })]);
  await p.evaluate(() => { window.__c = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__c = t; return Promise.resolve(); } }, configurable: true }); });
  await p.click('body', { position: { x: 5, y: 5 } }).catch(() => {});
  await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(200);
  ok(await p.locator('#panelHost .keys tr').count() >= 10 && /Поиск по логу/.test(await p.textContent('#panelHost')), '? открывает шпаргалку по клавишам');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(!(await p.locator('#panelHost .keys').count()), 'Esc закрывает шпаргалку');
  await p.keyboard.press('Slash'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'logQ'), '/ открывает лог и ставит курсор в поиск');
  await p.keyboard.type('ERR_FIL'); await p.waitForTimeout(500);
  ok(/Показано/.test(await p.textContent('#logCnt')), 'в поиске можно сразу печатать');
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Digit1'); await p.waitForTimeout(300);
  const first = await p.evaluate(() => { const t = [...document.querySelectorAll('#tabs [data-tab]')].filter(x => x.offsetParent !== null)[0]; return t && t.getAttribute('aria-selected') === 'true' || (t && t.classList.contains('on')); });
  ok(first, '1 открывает первую вкладку');
  await p.click('#tabs [data-tab="case"]'); await p.waitForTimeout(300);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('KeyR'); await p.waitForTimeout(300);
  const c = await p.evaluate(() => window.__c), pv = await p.textContent('#caseReplyPv');
  ok(c && c === pv, 'R на вкладке «Дело» копирует ответ по делу');
  await H.done(b, errs);
})();

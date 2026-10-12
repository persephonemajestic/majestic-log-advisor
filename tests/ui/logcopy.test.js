// Копирование в окне лога: кнопка у строки, Ctrl+C по выбранной строке, выделение мышью не сбрасывается щелчком. Порядок вкладок: Диагноз, Лог, Дело.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1400, 1000);
  await H.load(p, [H.mainLog('lc1.log', { attempts: ['crash'] }), H.mainLog('lc2.log', { attempts: ['crash', 'fail', 'ok', 'fail'], hour: 13 })]);
  const tabs = await p.$$eval('#tabs [data-tab]', (x) => x.map((t) => t.getAttribute('data-tab')));
  ok(tabs.indexOf('log') >= 0 && tabs.indexOf('case') > tabs.indexOf('log') && tabs.indexOf('diag') < tabs.indexOf('log'), 'вкладки по порядку: Диагноз, Лог, Дело (' + tabs.slice(0, 3).join(', ') + ')');
  await p.evaluate(() => { window.__c = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__c = t; return Promise.resolve(); } }, configurable: true }); });
  await p.click('[data-tab=log]'); await p.click('[data-act=mode][data-mode=all]').catch(() => {}); await p.waitForTimeout(300);
  const row = p.locator('#rows .ln').nth(1);
  await row.hover(); await row.locator('.lcp').click(); await p.waitForTimeout(200);
  const c1 = await p.evaluate(() => window.__c), t1 = await row.locator('.tx').textContent();
  ok(c1 && c1.length > 10 && t1.indexOf(c1.split('\n')[0].slice(0, 20)) !== -1, 'кнопка копирует строку');
  await p.evaluate(() => { window.__c = ''; });
  await p.locator('#rows .ln').nth(2).click(); await p.waitForTimeout(200);
  await p.keyboard.press('Control+KeyC'); await p.waitForTimeout(200);
  ok((await p.evaluate(() => window.__c)).length > 10, 'Ctrl+C копирует выбранную строку');
  await p.waitForTimeout(800);
  await p.locator('#rows .ln').nth(4).locator('.tx').click({ clickCount: 3 }); await p.waitForTimeout(300);
  ok((await p.evaluate(() => String(window.getSelection()))).length > 5, 'тройной щелчок выделяет строку целиком');
  await p.locator('#rows .ln').nth(5).locator('.tx').dblclick(); await p.waitForTimeout(300);
  ok((await p.evaluate(() => String(window.getSelection()))).length > 0, 'двойной щелчок выделяет слово');
  await H.done(b, errs);
})();

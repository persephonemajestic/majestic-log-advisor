const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1100);
  await H.load(p, [H.mainLog('a.log', { attempts: ['crash'], date: '2026-10-05' }), H.mainLog('b.log', { attempts: ['ok'], date: '2026-10-06' })]);
  await H.load(p, [H.mainLog('c.log', { attempts: ['fail', 'fail'], date: '2026-10-07' })]);
  await p.click('[data-tab=stats]'); await p.waitForTimeout(400);
  ok(await p.locator('.share i').count() >= 2, 'диаграмма «Итоги логов» показана');
  ok(await p.locator('.cols .col').count() >= 2, 'столбчатая динамика по дням показана');
  const h = await p.evaluate(() => { const r = document.querySelector('.rowbar .rbar'); return r ? r.getBoundingClientRect().height : -1; });
  ok(h > 0 && h <= 12, 'полоса в списке причин тонкая, а не пустой блок (высота ' + h + ')');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true });
  await H.done(b, errs);
})();

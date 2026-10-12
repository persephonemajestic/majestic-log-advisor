const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await p.clock.install();
  await H.load(p, [H.mainLog('a.log', { attempts: ['ok'] })]); await H.load(p, [H.mainLog('b.log', { attempts: ['fail'], date: '2026-10-07' })]);
  ok(await p.isVisible('#arcHd'), 'полоса «Отложенные» видна');
  ok(await p.locator('#flist .fi.isact').count() === 2, 'новые логи активные');
  await p.locator('#flist .fi:not(.folder) >> nth=0').dragTo(p.locator('#arcHd')); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi.isarc').count() === 1, 'перетаскивание в отложенные');
  await p.locator('#flist2 .fi.isarc').dragTo(p.locator('#actHd')); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi').count() === 0, 'и обратно');
  await p.clock.fastForward('26:00:00'); await p.click('[data-tab=diag]'); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi.isarc').count() === 1, 'через сутки лог уходит в отложенные сам, открытый остаётся активным');
  const nm = await p.textContent('#flist2 .fi.isarc .nm'); await p.click('#flist2 .fi.isarc'); await p.waitForTimeout(300);
  ok(await p.locator('#flist .fi.isact:has-text("' + nm + '")').count() === 1, 'открытие возвращает лог в активные');
  await H.done(b, errs);
})();

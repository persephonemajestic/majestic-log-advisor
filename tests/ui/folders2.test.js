// Объединение папок, «Все в отложенные», отмена последнего действия.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  const names = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 4; i++) await H.load(p, [H.mainLog(names[i] + '.log', { attempts: ['ok'], date: '2026-10-0' + (i + 1) })]);
  const lone = () => p.locator('#flist > li > .fi:not(.folder)');
  ok(await lone().count() === 4, 'четыре отдельных лога');
  await lone().nth(1).dragTo(lone().nth(0)); await p.waitForTimeout(300);
  await lone().nth(1).dragTo(lone().nth(0)); await p.waitForTimeout(300);
  ok(await p.locator('#flist .fi.folder').count() === 2, 'две папки');
  await p.locator('#flist .fi.folder').nth(1).dragTo(p.locator('#flist .fi.folder').nth(0)); await p.waitForTimeout(400);
  ok(await p.locator('#flist .fi.folder').count() === 1 && await p.locator('.fdraw .fi').count() === 4, 'папка на папку: объединились, в одной папке 4 лога');
  await p.click('[data-act=undo]'); await p.waitForTimeout(300);
  ok(await p.locator('#flist .fi.folder').count() === 2, 'отмена вернула две папки');
  await p.click('#actHd .zmenu summary'); await p.click('[data-act=allArc]'); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi').count() >= 1, 'все активные ушли в отложенные');
  await p.click('[data-act=undo]'); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi').count() === 0, 'отмена вернула логи в активные');
  await H.done(b, errs);
})();

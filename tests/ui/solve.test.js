const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.mainLog('a.log', { attempts: ['crash'] })]);
  await p.click('[data-act=solveOpen]'); await p.waitForTimeout(300);
  ok(await p.locator('[data-solve]').count() >= 1, 'в окне есть шаги из диагноза');
  await p.locator('[data-solve]').first().check(); await p.fill('#solveOwn', 'сменил DNS'); await p.click('[data-act=solveSave]'); await p.waitForTimeout(500);
  ok(await p.locator('#flist .fi').count() === 0, 'после сохранения лог исчез из списка');
  await H.load(p, [H.mainLog('b.log', { attempts: ['crash'], date: '2026-10-08' })]);
  ok(/Раньше помогало вам/.test(await p.locator('#view').innerText()) && /сменил DNS/.test(await p.locator('#view').innerText()), 'свои решения предлагаются при такой же проблеме');
  await p.click('[data-act=solveOpen]'); await p.waitForTimeout(300);
  ok(/сменил DNS/.test(await p.locator('.box').innerText()), 'и в окне «Что помогло»');
  await p.click('[data-act=solveSkip]'); await p.waitForTimeout(400);
  ok(await p.locator('#flist .fi').count() === 0, '«Пропустить» закрывает лог без записи');
  await H.done(b, errs);
})();

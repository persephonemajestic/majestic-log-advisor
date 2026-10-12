const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await H.load(p, [H.mainLog('alpha.log', { attempts: ['fail'] })]); await H.load(p, [H.mainLog('beta.log', { attempts: ['ok'], date: '2026-10-07' })]);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200);
  ok(await p.locator('#palQ').isVisible(), 'Ctrl+K открывает панель команд');
  ok(await p.locator('.pal-i').count() >= 5, 'в панели есть команды');
  await p.fill('#palQ', 'alpha'); ok(await p.locator('.pal-i').count() === 1, 'поиск по названию лога');
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(await p.locator('#palQ').count() === 0 && /alpha/.test(await p.textContent('#flist .fi.active .nm')), 'Enter открывает выбранный лог');
  await p.keyboard.press('Control+k'); await p.fill('#palQ', 'вкладка лог'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok(await p.locator('.tab[aria-selected=true]').innerText().then(t => /Лог/.test(t)), 'переход на вкладку');
  await p.keyboard.press('Control+k'); await p.keyboard.press('Escape'); ok(await p.locator('#palQ').count() === 0, 'Esc закрывает');
  await H.done(b, errs);
})();

const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await p.keyboard.press('Control+k'); await p.fill('#palQ', 'настройки'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  await p.selectOption('#uiScale', '125'); await p.selectOption('#density', 'compact'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.documentElement.style.zoom === '1.25' && document.documentElement.classList.contains('dense')), 'масштаб и плотность применяются');
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.documentElement.style.zoom === '1.25'), 'и запоминаются после перезапуска');
  await H.done(b, errs);
})();

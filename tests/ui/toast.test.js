const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await H.load(p, [H.mainLog('a.log', { attempts: ['fail'] })]);
  ok(await p.locator('#toast.on').count() === 1 && /Добавлено/.test(await p.textContent('#toast')), 'сообщение статуса всплывает');
  await p.waitForTimeout(5000); ok(await p.locator('#toast.on').count() === 0, 'и скрывается само');
  await H.done(b, errs);
})();

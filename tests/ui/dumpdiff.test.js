// Сравнение с прошлым дампом того же игрока.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.clientLog('p1.log', { crash: true })]); await p.fill('#tagIn', 'Игрок Тест'); await p.press('#tagIn', 'Tab'); await p.waitForTimeout(300);
  await p.setInputFiles('#sysIn', [H.dump(1791369411, 'p1.dmp')]); await p.waitForFunction(() => /Дамп краша/.test(document.querySelector('#sysBox').textContent) && /GTA5/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  await H.load(p, [H.clientLog('p2.log', { crash: true, extra: ['[18:59:50.000] x'] })]); await p.fill('#tagIn', 'Игрок Тест'); await p.press('#tagIn', 'Tab'); await p.waitForTimeout(300);
  await p.setInputFiles('#sysIn', [H.dump(1791375000, 'p2.dmp')]);
  await p.waitForFunction(() => /С прошлого дампа/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  const t = await p.textContent('#sysBox');
  ok(/Место сбоя то же/.test(t), 'сравнение: то же место сбоя');
  await H.done(b, errs);
})();

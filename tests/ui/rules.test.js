const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await H.load(p, [H.mainLog('a.log', { attempts: ['fail'], extra: ['[2026-10-06 11:30:00.000] [error]  [ (game)              ] strange failure 123 happened somewhere'] })]);
  const btn = p.locator('[data-act=ruleNew]').first(); ok(await btn.count() === 1, 'для неопознанной строки есть «Добавить решение»');
  await btn.click(); await p.waitForTimeout(300);
  ok(await p.locator('#rfCopy').count() === 1, 'можно взять решение у известной проблемы');
  await p.selectOption('#rfCopy', { index: 3 }); await p.waitForTimeout(200); ok((await p.inputValue('#rfTitle')).length > 0, 'выбор заполняет название');
  await p.fill('#rfPat', 'strange failure'); await p.selectOption('#rfKind', 'main'); await p.click('[data-act=rulePreview]'); await p.waitForTimeout(200);
  ok(/Совпадает: строк 1/.test(await p.textContent('#rfErr')), 'проверка правила на загруженных логах считает совпадения');
  await H.done(b, errs);
})();

const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await p.evaluate(() => document.getElementById('btnHelp').click()); await p.waitForTimeout(200);
  ok(await p.isVisible('#askTxt') && /client\.log/.test(await p.inputValue('#askTxt')), 'инструкция открывается, есть готовое сообщение игроку');
  ok(/Дамп краша и журнал Windows/.test(await p.textContent('#panelHost')), 'в инструкции есть раздел про дамп');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => { const L = LA.scan(LA.parse('[10:00:00.100] Logger initialized\n', 'client.log')); return LA.composeReply(L, { extra: [{ title: 'Тестовая проблема', steps: ['шаг один', 'шаг два'] }] }); }).then(t => /Проблема: Тестовая проблема/.test(t) && !/точную причину определить не удалось/.test(t)), 'ответ игроку включает шаги из дампа и журнала');
  await H.done(b, errs);
})();

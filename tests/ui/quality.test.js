// Подписи краша, шаги из прошлых логов игрока, оценка диагноза, расхождение ИИ с правилами.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await p.addInitScript(() => {
    const fn = async () => ({ text: '' }); fn.json = async () => ({ category: 'POOL_OVERFLOW', fault_asset: '', severity: 'HIGH', summary: 'Серьёзный сбой.', technical_cause: 'Переполнение.', confidence: 'HIGH', confidence_note: 'x', solutions: ['Шаг'] });
    window.claude = { use: async (n) => n === 'sample' ? fn : null };
  });
  await p.reload(); await p.waitForTimeout(700);
  /* подпись краша: тот же дамп в двух логах */
  await H.load(p, [H.clientLog('q1.log', { crash: true })]);
  await p.setInputFiles('#sysIn', [H.dump(1791369411, 'q1.dmp')]);
  await p.waitForFunction(() => /Был ли раньше/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  ok(/ещё не было/.test(await p.textContent('#sysBox')), 'первая подпись: раньше не встречалась');
  await H.load(p, [H.clientLog('q2.log', { crash: true, extra: ['[18:59:50.000] x'] })]);
  await p.setInputFiles('#sysIn', [H.dump(1791369500, 'q2.dmp')]);
  await p.waitForFunction(() => /уже был в 1 /.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  ok(true, 'вторая такая же подпись: «уже был в 1 другом логе»');
  /* оценка диагноза */
  ok(await p.locator('[data-act=dxfb]').count() === 2, 'кнопки «Верный» и «Неверный» под вердиктом');
  await p.click('[data-act=dxfb][data-v=bad]'); await p.waitForTimeout(300);
  ok(await p.locator('[data-act=dxfb][data-v=bad].on').count() === 1, 'оценка «Неверный» запомнена');
  ok(await p.locator('[data-tab=learn]').count() === 0, 'вкладки «Обучение» больше нет');
  await p.evaluate(() => document.querySelector('#btnSet').click()); await p.waitForTimeout(300);
  ok(/Спорные диагнозы \(оценка «Неверный»\): 1/.test(await p.textContent('#panelHost')), 'спорные диагнозы видны в «Настройках»');
  ok(await p.locator('#panelHost [data-act=kbExport]').count() === 1 && await p.locator('#panelHost [data-act=ruleNew]').count() === 1, 'экспорт базы и «Мои правила» в «Настройках»');
  await p.keyboard.press('Escape'); await p.evaluate(() => { const c = document.querySelector('[data-act=closePanel]'); if (c) c.click(); }); await p.waitForTimeout(200);
  /* ИИ против правил: лог без проблем, ИИ называет сбой серьёзным */
  await H.load(p, [H.mainLog('ok.log', { attempts: ['ok'], date: '2026-10-09' })]);
  await p.click('[data-tab=diag]').catch(() => {}); await p.waitForSelector('#diagBtn'); await p.click('#diagBtn');
  await p.waitForFunction(() => /ИИ и правила расходятся/.test(document.querySelector('#diagBox').textContent), null, { timeout: 8000 });
  ok(true, 'расхождение ИИ с правилами показано');
  await H.done(b, errs);
})();

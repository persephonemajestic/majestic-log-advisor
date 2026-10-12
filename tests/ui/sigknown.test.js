// Известная причина подписи краша: запись через «Причина известна», показ на дампе с той же подписью, удаление.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.clientLog('k1.log', { crash: true })]);
  await p.setInputFiles('#sysIn', [H.dump(1791369411, 'k1.dmp')]);
  await p.waitForFunction(() => /Был ли раньше/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  await p.click('#sysBox [data-act=sigForm]'); await p.waitForTimeout(200);
  ok(await p.locator('#sigCause').count() === 1, 'форма «Причина известна» открылась');
  await p.click('#sysBox [data-act=sigSave]'); await p.waitForTimeout(200);
  ok(await p.locator('#sigCause').count() === 1, 'пустую причину не сохраняет');
  await p.fill('#sigCause', 'Падение при загрузке тестового пака'); await p.selectOption('#sigOut', 'fixed'); await p.fill('#sigFixed', '1.24.0.0'); await p.fill('#sigFix', 'Обновить клиент\nОчистить кеш');
  await p.click('#sysBox [data-act=sigSave]'); await p.waitForTimeout(300);
  const t = await p.textContent('#sysBox');
  ok(/Известная причина/.test(t) && /тестового пака/.test(t) && /исправлено в версии 1\.24\.0\.0/.test(t), 'запись показана в карточке');
  ok(/Изменить известную причину/.test(t), 'кнопка меняется на «Изменить»');
  await H.load(p, [H.clientLog('k2.log', { crash: true })]);
  await p.setInputFiles('#sysIn', [H.dump(1791379411, 'k2.dmp')]);
  await p.waitForFunction(() => /Был ли раньше/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  ok(/тестового пака/.test(await p.textContent('#sysBox')), 'на новом дампе с той же подписью причина видна сразу');
  const kbHas = () => p.evaluate(() => { try { return /тестового пака/.test(localStorage.getItem('majestic-log-advisor.kb.v1') || ''); } catch (e) { return false; } });
  ok(await kbHas(), 'запись сохранена в базе знаний (переживает перезапуск)');
  await p.click('#sysBox [data-act=sigForm]'); await p.waitForTimeout(200); await p.click('#sysBox [data-act=sigDel]'); await p.waitForTimeout(300);
  ok(!/тестового пака/.test(await p.textContent('#sysBox')), 'запись удаляется');
  ok(!(await kbHas()), 'и из базы знаний');
  await H.done(b, errs);
})();

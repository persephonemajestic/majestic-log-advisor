const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.mainLog('a.log', { attempts: ['crash'] })]);
  await p.evaluate(() => { window.__c = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__c = t; return Promise.resolve(); } }, configurable: true }); });
  await p.keyboard.press('Control+k'); await p.fill('#palQ', 'скопировать ответ'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  if (!(await p.locator('#panelTa').count())) { await p.evaluate(() => { const b = [...document.querySelectorAll('[data-act=reply]')][0]; b && b.click(); }); await p.waitForTimeout(300); }
  await p.evaluate(() => { const f = [...document.querySelectorAll('button')].find(x => /Ответ игроку|Подготовить ответ/.test(x.textContent)); f && f.click(); }); await p.waitForTimeout(300);
  ok(await p.locator('[data-act=tplPick]').count() === 1, 'в окне ответа есть выбор шаблона');
  await p.selectOption('[data-act=tplPick]', 'b2'); await p.waitForTimeout(200);
  const t = await p.inputValue('#panelTa'); ok(/ERR_FIL_PACK_3/.test(t) && !/\{код\}/.test(t), 'подстановка {код} работает: ' + t.slice(0, 80));
  await p.click('[data-act=panelDiscord]'); await p.waitForTimeout(200); ok(/`ERR_FIL_PACK_3`/.test(await p.evaluate(() => window.__c)), 'для Discord код в кавычках');
  await p.fill('#panelTa', 'Привет {ник} {код}'); await p.fill('#tplName', 'мой'); await p.click('[data-act=tplSave]'); await p.waitForTimeout(200);
  await H.done(b, errs);
})();

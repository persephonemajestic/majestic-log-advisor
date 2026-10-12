// Ответ игроку по делу: шаги по последнему неудачному логу + неотмеченные просьбы, копирование одним нажатием.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const m1 = H.mainLog('main_r1.log', { attempts: ['crash'] }), m2 = H.mainLog('main_r2.log', { attempts: ['crash'], hour: 13 });
  await H.load(p, [m1, m2]);
  await p.click('[data-act=gcase]'); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__c = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__c = t; return Promise.resolve(); } }, configurable: true }); });
  const pv = await p.textContent('#caseReplyPv');
  ok(/^Здравствуйте/.test(pv) && /ERR_FIL_PACK_3|Проблема:|Главная причина/.test(pv), 'в ответе по делу есть шаги по проблеме');
  ok(/Также, пожалуйста:\n1\) /.test(pv) && /client\.log/.test(pv), 'в ответ добавлены просьбы (прислать client.log)');
  await p.click('[data-act=caseReply]'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => window.__c)) === pv, 'кнопка копирует ровно этот ответ');
  const n = await p.locator('.asks input').count();
  for (let i = 0; i < n; i++) await p.locator('.asks input >> nth=' + i).check();
  await p.waitForTimeout(300);
  const pv2 = await p.textContent('#caseReplyPv');
  ok(!/Также, пожалуйста/.test(pv2) && /Здравствуйте/.test(pv2), 'отмеченные просьбы в ответ не попадают');
  await p.click('[data-act=caseask]'); await p.waitForTimeout(200);
  ok(/все шаги выполнены/.test(await p.evaluate(() => window.__c)), '«Только просьбы» по-прежнему работает');
  await H.done(b, errs);
})();

// Карточка «Дамп краша и журнал Windows»: события из текста, дамп, привязка к логу, кнопка ИИ с коротким запросом.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
const dump = () => H.dump();
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const log = H.clientLog('c1.log', { crash: true });
  await p.addInitScript(() => {
    window.__calls = [];
    const fn = async () => ({ text: '' }); fn.json = async (turns, opt) => { window.__calls.push({ turns, opt }); return { category: 'GPU_DRIVER', fault_asset: 'GTA5.exe+0x1234', severity: 'HIGH', summary: 'Упал драйвер.', technical_cause: 'Нулевой указатель.', confidence: 'MEDIUM', confidence_note: 'есть дамп', solutions: ['Обновить драйвер', 'Убрать оверлеи'] }; };
    window.claude = { use: async (n) => n === 'sample' ? fn : null };
  });
  await p.reload(); await p.waitForTimeout(700);
  await H.load(p, [log]);
  ok(/Дамп краша и журнал Windows/.test(await p.textContent('#sysBox')), 'карточка есть, пока данных нет');
  const ev = path.join(H.TMP, 'events.txt');
  fs.writeFileSync(ev, ['2026-10-07T12:25:36|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: GTA5.exe, version: 1.0.0.0, Exception code: 0xc0000005, Fault offset: 0x0000000000001234',
    '2026-10-07T12:26:36|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: GTA5.exe, version: 1.0.0.0, Exception code: 0xc0000005, Fault offset: 0x0000000000001234',
    '2026-10-07T12:30:00|System|41|Microsoft-Windows-Kernel-Power|Critical|BugcheckCode 278'].join('\n') + '\n');
  await p.setInputFiles('#sysIn', [dump(), ev]);
  await p.waitForFunction(() => /Нулевой|нулевой указатель/.test(document.querySelector('#sysBox').textContent) && /Журнал Windows/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  const t = await p.textContent('#sysBox');
  ok(/GTA5\.exe\+0x1234/.test(t) && /нулевой указатель/.test(t), 'дамп разобран: модуль, смещение, нулевой указатель');
  ok(/×2/.test(t) && /то же место, что в дампе/.test(t), 'журнал: повторный краш совпал с дампом');
  ok(/синий экран 0x116/.test(t), 'журнал: синий экран по Kernel-Power');
  ok(await p.evaluate(() => window.__calls.length) === 0, 'ИИ не вызывается сам');
  await p.click('#sysAiBtn'); await p.waitForSelector('#sysBox .diag .diag, #sysBox .ai-h + .diag', { timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => /Упал драйвер/.test(document.querySelector('#sysBox').textContent), null, { timeout: 8000 });
  const c = await p.evaluate(() => window.__calls);
  ok(c.length === 1 && c[0].opt.max === 1400, 'один запрос с ограничением длины ответа');
  ok(c[0].turns[1].content.length <= 3500 && /МИНИДАМП/.test(c[0].turns[1].content) && /ЖУРНАЛ СОБЫТИЙ/.test(c[0].turns[1].content), 'запрос короткий: сводка дампа и журнала');
  ok(!/c1\.log|Logger initialized/.test(c[0].turns[1].content), 'в запрос не попал сам лог');
  await p.click('[data-act=sysCopy]'); await p.waitForTimeout(300);
  await p.click('[data-act=sysClear]'); await p.waitForTimeout(200);
  ok(/Добавьте минидамп/.test(await p.textContent('#sysBox')), 'данные можно убрать');
  /* отдельная кнопка «Только дамп»: без лога, данные не попадают в открытый лог */
  await p.click('#btnMore'); await p.click('#btnDump'); await p.waitForSelector('#sysOnlyBox');
  ok(/Лог не нужен/.test(await p.textContent('#sysOnlyBox')), 'окно «Только дамп» открылось');
  await p.setInputFiles('#sysIn', [dump()]);
  await p.waitForFunction(() => /GTA5\.exe\+0x1234/.test(document.querySelector('#sysOnlyBox').textContent), null, { timeout: 15000 });
  ok(true, 'дамп без лога разобран в окне');
  await p.click('#sysOnlyBox #sysAiBtn'); await p.waitForFunction(() => /Упал драйвер/.test(document.querySelector('#sysOnlyBox').textContent), null, { timeout: 8000 });
  ok(await p.evaluate(() => window.__calls.length) === 2, 'ИИ для дампа без лога по кнопке');
  await p.click('#sysOnlyBox [data-act=closePanel]'); await p.waitForTimeout(200);
  ok(/Добавьте минидамп/.test(await p.textContent('#sysBox')), 'открытый лог дампом из окна не затронут');
  await H.done(b, errs);
})();

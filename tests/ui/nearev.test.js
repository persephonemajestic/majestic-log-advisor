// События Windows без правила, но рядом с падением, попадают в список «Рядом с падением».
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.clientLog('n1.log', { crash: true })]);
  const ev = path.join(H.TMP, 'ev_near.txt');
  // Время в журнале Windows записано по местным часам, дамп — по UTC: строим метки от времени дампа в местном поясе, чтобы тест не зависел от часового пояса машины.
  const DMP = 1791369411 * 1000, pad = (n) => String(n).padStart(2, '0'), loc = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  fs.writeFileSync(ev, [loc(DMP - 21000) + '|System|777|Contoso-Strange-Driver|Warning|Устройство перестало отвечать на запросы',
    loc(DMP - 11000) + '|System|778|Contoso-Strange-Driver|Information|Сведения без важности',
    loc(DMP - 9771000) + '|System|779|Contoso-Strange-Driver|Warning|Давно, вне окна',
    loc(DMP - 411000) + '|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: GTA5.exe, version: 1.0.0.0, Exception code: 0xc0000005, Fault offset: 0x0000000000001234'].join('\n') + '\n');
  await p.setInputFiles('#sysIn', [ev, H.dump(1791369411, 'n1.dmp')]);
  await p.waitForFunction(() => /Рядом с падением/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  const t = await p.textContent('#sysBox');
  ok(/Contoso-Strange-Driver 777/.test(t) && !/Давно, вне окна/.test(t) && !/Сведения без важности/.test(t), 'в списке только предупреждение рядом с дампом');
  ok(/то же место, что в дампе/.test(t), 'журнал обработан после дампа, несмотря на порядок файлов');
  await H.done(b, errs);
})();

// Шаблоны строк: группировка по виду, фильтр «только проблемные», выбор шаблона оставляет в логе только его строки.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const L = ['[10:00:00.000] Logger initialized', '[10:00:05.000] Majestic Multiplayer inited'];
  for (let i = 0; i < 30; i++) L.push('[10:01:' + String(i).padStart(2, '0') + '.000] Streaming object ' + (1000 + i) + ' at 0x' + (4096 + i).toString(16));
  for (let i = 0; i < 5; i++) L.push('[10:02:' + String(i).padStart(2, '0') + '.000][error] ERR_FIL_PACK_3 file ' + i);
  L.push('[10:03:00.000] Shutting down');
  const f = path.join(H.TMP, 'client_2026-10-10_10-00-00.log'); fs.writeFileSync(f, L.join('\n') + '\n');
  await H.load(p, [f]); await p.click('[data-tab=log]'); await p.click('[data-act=mode][data-mode=all]'); await p.waitForTimeout(300);
  await p.click('[data-act=pats]'); await p.waitForTimeout(250);
  ok(await p.locator('#pats').isVisible(), 'панель шаблонов открыта');
  const first = await p.textContent('#pats .ptr >> nth=0');
  ok(/×30/.test(first) && /Streaming object/.test(first), '30 строк одного вида в одном шаблоне: ' + first.trim().slice(0, 60));
  ok(await p.locator('#pats .ptr .pv').count() > 0, 'меняющиеся части отмечены');
  await p.check('#patProb'); await p.waitForTimeout(200);
  const prob = await p.locator('#pats .ptr').allTextContents();
  ok(prob.length >= 1 && prob.every(x => !/Streaming object/.test(x)), 'фильтр «только проблемные»');
  await p.uncheck('#patProb'); await p.fill('#patQ', 'Streaming'); await p.waitForTimeout(200);
  ok(await p.locator('#pats .ptr').count() === 1, 'поиск по шаблонам');
  await p.click('#pats .ptr >> nth=0'); await p.waitForTimeout(300);
  ok(/Показано 30 из/.test(await p.textContent('#logCnt')), 'в логе только строки шаблона');
  ok(!(await p.locator('#pats').isVisible()), 'панель закрылась после выбора');
  await p.click('[data-act=patClear]'); await p.waitForTimeout(250);
  ok(!/Показано 30 из/.test(await p.textContent('#logCnt')), 'шаблон снимается крестиком');
  await H.done(b, errs);
})();

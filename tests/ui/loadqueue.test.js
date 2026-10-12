// Загрузки по очереди: одинаковый файл, брошенный дважды подряд, не дублируется; файл не попадает в чужую папку тикета.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const big = path.join(H.TMP, 'client_q.log'), L = ['[10:00:00.000] Logger initialized'];
  for (let i = 0; i < 120000; i++) L.push('[10:00:' + String(i % 60).padStart(2, '0') + '.000][warning] Can not find texture slot ' + i);
  fs.writeFileSync(big, L.join('\n') + '\n');
  await p.evaluate(() => { window.__done = 0; });
  await Promise.all([p.setInputFiles('#fileIn', [big]), p.setInputFiles('#fileIn', [big])]);
  await p.waitForFunction(() => /Пропущены дубликаты|Добавлено/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  const n = await p.evaluate(() => document.querySelectorAll('#flist .fi').length);
  ok(n === 1, 'один и тот же лог, брошенный дважды подряд, добавлен один раз (' + n + ')');
  await H.done(b, errs);
})();

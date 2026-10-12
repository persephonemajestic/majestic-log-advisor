// Время в client.log откатилось назад меньше чем на час: вкладка «Лог» открывается без ошибок, полоса ошибок строится.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const L = ['[10:00:00.000] Logger initialized', '[10:00:05.000][error] ERR_FIL_PACK_3 first', '[09:40:00.000][error] ERR_FIL_PACK_3 back in time', '[10:10:00.000] Shutting down'];
  const f = path.join(H.TMP, 'client_2026-10-11_10-00-00.log'); fs.writeFileSync(f, L.join('\n') + '\n');
  await H.load(p, [f]); await p.click('[data-tab=log]'); await p.waitForTimeout(400);
  ok(await p.locator('#rows .ln').count() > 0, 'строки лога показаны');
  ok(await p.locator('#th .thc[data-act=jump]').count() >= 1, 'полоса ошибок построена');
  await H.done(b, errs);
})();

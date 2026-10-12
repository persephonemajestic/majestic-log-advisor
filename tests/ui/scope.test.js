// Срезы лога: «Этот запуск», «До MINIDUMP», «Без шума».
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const L = ['[10:00:00.000] Logger initialized', '[10:00:05.000] Majestic Multiplayer inited'];
  for (let i = 0; i < 30; i++) L.push('[10:00:' + String(10 + i).padStart(2, '0') + '.000] первый запуск, строка ' + i);
  L.push('[11:00:00.000] Logger initialized', '[11:00:05.000] Majestic Multiplayer inited');
  for (let i = 0; i < 400; i++) L.push('[11:00:' + String(10 + (i % 50)).padStart(2, '0') + '.000] второй запуск, строка ' + i);
  L.push('[11:30:00.000][error] ERR_FIL_PACK_3 happened', '[11:30:01.000] MINIDUMP: Temporary dump saved to x', '[11:30:02.000] Shutting down');
  const f = path.join(H.TMP, 'client_2026-10-07_10-00-00.log'); fs.writeFileSync(f, L.join('\n') + '\n');
  await H.load(p, [f]); await p.click('[data-tab=log]'); await p.click('[data-act=mode][data-mode=all]'); await p.waitForTimeout(300);
  const cnt = async () => +(/из\s+([\d\s ]+)/.exec(await p.textContent('#logCnt')) ? /Показано\s+([\d\s ]+)\s+из/.exec(await p.textContent('#logCnt'))[1].replace(/\D/g, '') : 0);
  const all = await cnt(); ok(all > 400, 'весь лог: показано ' + all);
  await p.click('[data-act=scope][data-v=run]'); await p.waitForTimeout(300);
  const run = await cnt(); ok(run < all && run > 400 && run < 420, 'этот запуск: только вторая часть (' + run + ' из ' + all + ')');
  await p.click('[data-act=scope][data-v=dump]'); await p.waitForTimeout(300);
  const dp = await cnt(); ok(dp > 150 && dp <= 215, 'до MINIDUMP: окно около 200 строк (' + dp + ')');
  await p.click('[data-act=scope][data-v=all]'); await p.waitForTimeout(200);
  ok(await p.locator('[data-act=quiet]').count() === 1, 'кнопка «Без шума» есть');
  await H.done(b, errs);
})();

// Синтаксис лога: подсветка частей строки, свёртка повторов, окно ±30 с, фрагмент для тикета.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const L = ['[10:00:00.000] Logger initialized', '[10:00:05.000] Majestic Multiplayer inited'];
  for (let i = 0; i < 40; i++) L.push('[10:00:' + String(10 + i).padStart(2, '0') + '.000][warning] Can not find texture slot ' + i);
  L.push('[10:05:00.000][error] ERR_FIL_PACK_3 C:\\Users\\Ivan\\GTA\\x64.rpf 0x64bcf2 auth token: abcdefghijklmnop1234 mail ivan@example.com');
  L.push('[10:05:01.000] MINIDUMP: Temporary dump saved to x', '[10:20:00.000] Shutting down');
  const f = path.join(H.TMP, 'client_2026-10-08_10-00-00.log'); fs.writeFileSync(f, L.join('\n') + '\n');
  await H.load(p, [f]); await p.click('[data-tab=log]'); await p.click('[data-act=mode][data-mode=all]'); await p.waitForTimeout(300);
  const cnt = async () => +/Показано\s+([\d\s  ]+)\s+из/.exec(await p.textContent('#logCnt'))[1].replace(/\D/g, '');

  ok(await p.locator('#rows .k-ts').count() > 5, 'время в строках подсвечено');
  ok(await p.locator('#rows .k-code, #rows mark').count() > 0, 'код ошибки выделен');
  ok(await p.locator('#rows .k-path').count() > 0, 'путь выделен');
  ok(/ivan@example/.test(await p.textContent('#rows')), 'строки показываются как есть, без маски');

  const all = await cnt();
  await p.click('[data-act=fold]'); await p.waitForTimeout(300);
  const fold = await cnt(); ok(fold < all - 30, 'повторы свёрнуты (' + fold + ' из ' + all + ')');
  ok(/×40/.test(await p.textContent('#rows')), 'счётчик ×40 у свёрнутой строки');
  await p.click('[data-act=fold]'); await p.waitForTimeout(300);
  ok(await cnt() === all, 'свёртка выключается');

  const errLine = L.length - 3;
  await p.click('#rows [data-line="' + errLine + '"]'); await p.waitForTimeout(200);
  ok(await p.locator('#ins [data-act=fragCopy]').count() === 1, 'кнопка «Копировать фрагмент» в инспекторе');
  await p.evaluate(() => { window.__c = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__c = t; return Promise.resolve(); } }, configurable: true }); });
  await p.click('#ins [data-act=fragCopy]'); await p.waitForTimeout(200);
  const frag = await p.evaluate(() => window.__c);
  ok(/строки \d+–\d+/.test(frag) && /> \d+: .*ERR_FIL_PACK_3/.test(frag), 'во фрагменте выбранная строка отмечена');

  await p.click('#ins [data-act=twin]'); await p.waitForTimeout(300);
  const tw = await cnt(); ok(tw >= 2 && tw <= 4, 'окно ±30 с: только соседние по времени строки (' + tw + ')');
  ok(await p.locator('[data-act=scope][data-v=time].on').count() === 1, 'срез «±30 с» отмечен');
  await p.click('[data-act=scope][data-v=all]'); await p.waitForTimeout(200);
  ok(await cnt() === all, 'возврат к всему логу');
  await H.done(b, errs);
})();

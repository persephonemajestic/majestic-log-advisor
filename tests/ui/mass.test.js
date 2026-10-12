const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  // три похожих лога подряд: раньше это вызывало тревогу о повторяющейся проблеме
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']) await H.load(p, [H.mainLog('m_' + d + '.log', { attempts: ['crash', 'crash', 'crash'], date: d })]);
  ok(await p.locator('.panel').count() === 0, 'тревоги о повторяющихся и массовых проблемах не всплывают во время паузы');
  await H.done(b, errs);
})();

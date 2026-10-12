const H = require('./helpers'), { ok } = H;
async function setTag(p, tag) { await p.fill('#tagIn', tag); await p.press('#tagIn', 'Tab'); await p.waitForTimeout(500); }
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await H.load(p, [H.mainLog('a.log', { attempts: ['crash'] })]); await setTag(p, 'Иван Иванов');
  ok(!/Повтор:/.test(await p.locator('#view').innerText()), 'первый лог игрока без пометки о повторе');
  await H.load(p, [H.mainLog('c.log', { attempts: ['crash', 'crash'], date: '2026-10-08' })]); await setTag(p, 'Иван Иванов');
  await p.click('[data-tab=log]'); await p.click('[data-tab=diag]'); await p.waitForTimeout(300);
  ok(/Повтор:/.test(await p.locator('#view').innerText()), 'второй лог с той же проблемой: пометка «Повтор»');
  ok(/Что уже советовали/.test(await p.locator('#view').innerText()), 'при повторе показано, какие шаги уже советовали');
  await H.done(b, errs);
})();

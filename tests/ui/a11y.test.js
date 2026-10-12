const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await H.load(p, [H.mainLog('a.log', { attempts: ['fail', 'fail', 'ok'] })]);
  await p.click('[data-tab=log]'); await p.waitForTimeout(300);
  await p.focus('#sc'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
  const l1 = await p.evaluate(() => document.querySelector('#rows .ln.sel') && document.querySelector('#rows .ln.sel').getAttribute('data-line'));
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
  const l2 = await p.evaluate(() => document.querySelector('#rows .ln.sel') && document.querySelector('#rows .ln.sel').getAttribute('data-line'));
  ok(l1 !== null && l2 !== null && +l2 > +l1, 'стрелки двигают выбор строки в логе');
  ok(await p.evaluate(() => document.activeElement.id === 'sc'), 'фокус остаётся на списке строк');
  const bad = await p.evaluate(() => [...document.querySelectorAll('button,a,input,select,textarea')].filter(e => e.offsetParent && !(e.getAttribute('aria-label') || e.textContent || e.title || e.placeholder || '').trim() && !e.closest('label') && !(e.id && document.querySelector('label[for="' + e.id + '"]'))).length);
  ok(bad === 0, 'у всех видимых элементов управления есть подпись');
  await H.done(b, errs);
})();

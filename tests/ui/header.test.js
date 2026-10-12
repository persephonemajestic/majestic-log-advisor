const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(460, 800);
  const bb = await p.locator('#tabs').boundingBox(), sc = () => p.evaluate(() => Math.round(document.querySelector('#tabs').scrollLeft));
  ok(!(await p.locator('#tabR').isHidden()), 'в узком окне есть стрелка вправо');
  await p.click('#tabR'); await p.waitForTimeout(700); ok(await sc() > 50, 'стрелка листает вкладки');
  await p.mouse.move(bb.x + 200, bb.y + 10); const s0 = await sc(); await p.mouse.wheel(0, -80); await p.waitForTimeout(300); ok(await sc() < s0, 'колесо листает вкладки');
  await p.setViewportSize({ width: 1500, height: 700 }); await p.waitForTimeout(400);
  ok(await p.locator('#tabL').isHidden() && await p.locator('#tabR').isHidden(), 'на широком экране стрелок нет');
  const inBar = id => p.evaluate(i => !!document.querySelector('.acts > #' + i), id);
  await p.click('#btnMore'); await p.locator('#btnSet').dragTo(p.locator('#btnTheme')); await p.waitForTimeout(300);
  ok(await inBar('btnSet'), 'пункт меню закрепляется на панели перетаскиванием');
  await p.locator('#btnSet').dragTo(p.locator('#btnMore')); await p.waitForTimeout(300);
  ok(!(await inBar('btnSet')), 'и возвращается в меню');
  await p.click('#btnMore'); await p.locator('#btnDir').dragTo(p.locator('.acts #btnAdd')); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(800); ok(await inBar('btnDir'), 'закрепление запоминается');
  await p.click('#btnMore'); await p.click('#btnNew'); await p.waitForTimeout(300); ok(await p.locator('#moreMenu').isHidden(), 'меню закрывается после выбора пункта');
  await H.done(b, errs);
})();

// Умное автообновление: не перезагружает, пока пользователь работает или открыто окно; применяет в простое; возвращает лог, вкладку и фильтры.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await p.addInitScript(() => {
    window.__aaFast = true; window.__reloads = 0; window.__relaunch = 0;
    const store = { kb: null }; try { store.kb = sessionStorage.getItem('kb'); } catch (e) {}
    window.nativeApp = { kbLoad: () => sessionStorage.getItem('kb'), kbSave: (d) => sessionStorage.setItem('kb', d), copy: () => {}, gatedFetch: async () => null,
      updateInfo: async () => ({ version: sessionStorage.getItem('updated') ? '' : '2099-01-01.1' }), updateCheck: async () => ({ has: false }), shellPending: async () => '',
      reloadApp: async () => { window.__reloads++; sessionStorage.setItem('updated', '1'); setTimeout(() => location.reload(), 50); return true; }, relaunch: async () => { window.__relaunch++; return true; } };
  });
  await p.reload(); await p.waitForTimeout(800);
  await H.load(p, [H.clientLog('aa1.log', { crash: true }), H.mainLog('aa2.log', { attempts: ['fail'] })]);
  await p.click('#tabs [data-tab="log"]'); await p.waitForTimeout(200); await p.click('[data-act=mode][data-mode=all]'); await p.waitForTimeout(200);
  const label = await p.evaluate(() => (document.querySelector('.fi.active b') || document.querySelector('.fi.active') || {}).textContent || '');
  /* открыто окно настроек: даже в простое перезагрузки нет */
  await p.evaluate(() => document.querySelector('#btnSet').click()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__reloads) === 0, 'пока открыто окно, обновление ждёт');
  ok(await p.locator('#autoApply').count() === 1, 'в настройках есть выключатель автоприменения');
  await p.keyboard.press('Escape'); await p.evaluate(() => { const h = document.querySelector('#panelHost'); if (h) h.innerHTML = ''; });
  /* курсор в поле ввода: ждёт */
  await p.fill('#logQ', 'MINIDUMP'); await p.waitForTimeout(200); const cntBefore = await p.textContent('#logCnt'); await p.focus('#logQ'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__reloads) === 0, 'пока курсор в поле ввода, обновление ждёт');
  /* активная работа: ждёт */
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Shift'); await p.waitForTimeout(150); }
  ok(await p.evaluate(() => window.__reloads) === 0, 'пока пользователь что-то делает, обновление ждёт');
  /* простой: применяется и возвращает на место */
  await p.waitForFunction(() => sessionStorage.getItem('updated') === '1', null, { timeout: 8000 });
  ok(true, 'в простое обновление применилось само');
  await p.waitForLoadState(); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => document.querySelector('#tabs [data-tab="log"]').getAttribute('aria-selected')) === 'true', 'после перезагрузки открыта та же вкладка «Лог»');
  ok(await p.inputValue('#logQ') === 'MINIDUMP', 'поиск по логу восстановлен');
  ok(await p.textContent('#logCnt') === cntBefore, 'тот же лог с теми же фильтрами: ' + cntBefore);
  await H.done(b, errs);
})();

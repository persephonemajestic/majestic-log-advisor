// Ключ плагина Discord: «Новый ключ» меняет ключ в настройках, «Разрешить» отвечает плагину.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await p.addInitScript(() => {
    let tok = 'a'.repeat(32);
    window.nativeApp = { kbLoad: () => null, kbSave: () => {}, copy: () => {}, gatedFetch: async () => null,
      extInfo: async () => ({ on: true, port: 47615, token: tok }), extReset: async () => { tok = 'b'.repeat(32); return { on: true, port: 47615, token: tok }; },
      onExtImport: () => {}, extReady: () => {}, onExtPair: (cb) => { window.__pair = cb; }, extPairAnswer: (id, ok) => { window.__pairAns = [id, ok]; } };
  });
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('#btnSet').click()); await p.waitForSelector('#extKey');
  ok((await p.textContent('#extKey')).trim() === 'a'.repeat(32), 'в настройках виден текущий ключ');
  await p.click('[data-act="extReset"]');
  await p.waitForFunction(() => { const k = document.querySelector('#extKey'); return k && k.textContent.trim() === 'b'.repeat(32); }, null, { timeout: 5000 }).catch(() => {});
  ok((await p.textContent('#extKey')).trim() === 'b'.repeat(32), '«Новый ключ» показывает новый ключ');
  ok(await p.evaluate(() => document.querySelectorAll('#extKey').length === 1), 'блок ключа один');
  await p.evaluate(() => window.__pair({ id: 7, client: 'BetterDiscord' }));
  await p.waitForSelector('#pairOk'); await p.click('#pairOk');
  ok(await p.evaluate(() => JSON.stringify(window.__pairAns) === '[7,true]'), '«Разрешить» отвечает оболочке');
  await H.done(b, errs);
})();

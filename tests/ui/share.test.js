// Отправка обезличенных логов на сервер: очищено, замаскировано, сжато, один раз на лог, выключается в настройках.
const H = require('./helpers'), { ok } = H, zlib = require('zlib');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await p.addInitScript(() => {
    window.__puts = [];
    window.nativeApp = { kbLoad: () => null, kbSave: () => {}, copy: () => {},
      gatedFetch: async (path, o) => { if (path === '/v1/samples/put') { window.__puts.push(o.body); return JSON.stringify({ ok: true }); } return null; } };
  });
  await p.reload(); await p.waitForTimeout(700);
  const log = H.clientLog('share1.log', { crash: true, extra: ['[18:58:41.000][Error][hooks] ERR_SYS_FILELOAD, Missing rpf: dlc_x:/x64/a.rpf', '[18:58:41.500] path C:\\Users\\Ivan Petrov\\AppData\\x.dat mail ivan@example.com token: abcdefghijklmnop12345'] });
  await H.load(p, [log]); await p.waitForTimeout(3500);
  const puts = await p.evaluate(() => window.__puts);
  ok(puts.length === 1 && puts[0].k === 'client' && /^[0-9a-f]+-\d+$/.test(puts[0].h), 'лог отправлен один раз с хешем и типом');
  const txt = zlib.gunzipSync(Buffer.from(puts[0].gz, 'base64')).toString('utf8');
  ok(/MINIDUMP/.test(txt), 'содержимое распаковывается и содержит лог');
  ok(!/Ivan|ivan@example|abcdefghijklmnop12345/.test(txt), 'личные данные замаскированы');
  ok(!/Missing rpf: dlc_x/.test(txt), 'шум вычищен');
  await H.load(p, [log]); await p.waitForTimeout(3000);
  ok((await p.evaluate(() => window.__puts.length)) === 1, 'повторная загрузка того же лога не отправляется');
  await p.evaluate(() => document.querySelector('#btnSet').click()); await p.waitForTimeout(300);
  ok(await p.locator('#shareBox').count() === 1, 'в настройках есть выключатель отправки');
  await p.uncheck('#shareBox'); await p.waitForTimeout(150); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await H.load(p, [H.clientLog('share2.log', { crash: false })]); await p.waitForTimeout(3000);
  ok((await p.evaluate(() => window.__puts.length)) === 1, 'выключатель в настройках останавливает отправку');
  await H.done(b, errs);
})();

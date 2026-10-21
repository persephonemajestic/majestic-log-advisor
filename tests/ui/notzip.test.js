// «zip», который не архив: веб-страница (вместо файла скачалась страница входа), дамп или лог с неверным расширением.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 900);
  const html = '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <title>VK ID</title></head><body>Включите JavaScript</body></html>' + ' '.repeat(5000);
  await p.setInputFiles('#fileIn', [{ name: 'majestic_release_1.23.24_steam_0x1_2026-9-19.zip', mimeType: 'application/zip', buffer: Buffer.from(html) }]);
  await p.waitForSelector('#readProb', { timeout: 5000 }).catch(() => {});
  const t = await p.evaluate(() => { const x = document.querySelector('#readProb'); return x ? x.textContent : ''; });
  ok(/веб-страница/.test(t) && /VK ID/.test(t) && /ВКонтакте/.test(t), 'вместо архива веб-страница — окно с понятной причиной');
  ok(await p.isVisible('#readProbAsk'), 'есть кнопка «Скопировать просьбу игроку»');
  await p.evaluate(() => { document.querySelector('#panelHost').innerHTML = ''; });
  const dmp = fs.readFileSync(H.dump(1791369411, 'x.dmp'));
  await p.setInputFiles('#fileIn', [{ name: 'crash.zip', mimeType: 'application/zip', buffer: dmp }]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /Дамп краша/.test(document.body.textContent) && !document.querySelector('#readProb')), 'дамп с расширением .zip открывается как дамп');
  await p.evaluate(() => { document.querySelector('#panelHost').innerHTML = ''; });
  const log = fs.readFileSync(H.clientLog('z_client.log', { crash: true }));
  await p.setInputFiles('#fileIn', [{ name: 'client.zip', mimeType: 'application/zip', buffer: log }]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /client\.log/.test(document.querySelector('.side').textContent)), 'лог с расширением .zip открывается как лог');
  await H.done(b, errs);
})();

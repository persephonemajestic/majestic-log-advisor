// Запуски клиента, цепочка перед падением, сверка main.log и client.log.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const L = [];
  const T = (h, m, sec, ms) => '[' + h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + (ms || '000') + ']';
  const run = (h, crash) => { L.push(T(h, 12, 0) + ' Logger initialized', T(h, 12, 5) + ' Majestic Multiplayer inited', T(h, 13, 0) + ' Game Started in 31000 ms');
    if (crash) L.push(T(h, 17, 0) + '[error] ERR_FIL_PACK_3 happened', T(h, 17, 0, '100') + '[warn] Failed to load texture mj_x.ytd', T(h, 17, 0, '200') + '[warn] Failed to load texture mj_x.ytd', T(h, 17, 1) + ' MINIDUMP: Temporary dump saved to x', T(h, 17, 2) + ' Shutting down');
    else L.push(T(h, 14, 0) + ' Connected with id 5', T(h, 40, 0) + ' Shutting down'); };
  run('10', false); run('11', true); run('12', false);
  const f = path.join(H.TMP, 'client_2026-10-07_10-00-00.log'); fs.writeFileSync(f, L.join('\n') + '\n');
  await H.load(p, [f]);
  const t = await p.textContent('#view');
  ok(/Запуски клиента в логе/.test(t) && /Краш игры \(MINIDUMP\)/.test(t) && /Дошёл до сервера/.test(t), 'три запуска: краш и два успешных');
  ok(/Что было перед падением/.test(t), 'цепочка перед падением');
  ok(/ERR_FIL_PACK_3/.test(await p.textContent('#view')), 'в цепочке код ошибки');
  /* main.log: лаунчер считал запуск успешным, клиент упал */
  const main = H.mainLog('main_x.log', { attempts: ['ok'], date: '2026-10-07', hour: 11 });
  await H.load(p, [main]);
  await p.locator('#flist .fi:not(.folder)').nth(0).dragTo(p.locator('#flist .fi:not(.folder)').nth(1)); await p.waitForTimeout(300);
  await p.click('[data-act=gcase]').catch(() => {}); await p.waitForTimeout(400);
  ok(/Лаунчер и клиент/.test(await p.textContent('#view')), 'сверка main.log и client.log в деле');
  await H.done(b, errs);
})();

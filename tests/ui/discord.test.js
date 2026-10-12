// Файлы из тикета Discord: папка-дело по тикету, метка, данные игрока, ключ плагина в настройках.
const H = require('./helpers'), { ok } = H, fs = require('fs');
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  await p.addInitScript(() => {
    window.nativeApp = { kbLoad: () => null, kbSave: () => {}, copy: () => {}, gatedFetch: async () => null,
      extInfo: async () => ({ on: true, port: 47615, token: 'abc123token' }), extReset: async () => ({ on: true, port: 47615, token: 'new' }),
      onExtImport: (cb) => { window.__ext = cb; }, extReady: () => { window.__ready = true; }, onExtPair: (cb) => { window.__pair = cb; }, extPairAnswer: (id, ok) => { window.__pairAns = [id, ok]; } };
  });
  await p.reload(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.__ready === true), 'интерфейс сообщил оболочке, что готов принимать файлы');
  const log = fs.readFileSync(H.clientLog('dc_client.log', { crash: true }), 'utf8'), main = fs.readFileSync(H.mainLog('dc_main.log', { attempts: ['fail'] }), 'utf8');
  await p.evaluate(([a, m]) => {
    const enc = (t) => new TextEncoder().encode(t), pl = { id: '123', name: 'Иван', username: 'ivan', nick: 'Ivan_Petrov', static: '55123', server: 'Orlando', link: 'https://discord.com/channels/1/99/7' };
    window.__ext({ name: 'client.log', data: enc(a), ticket: 'ticket-1234', ticketId: '99', player: pl });
    window.__ext({ name: 'main.log', data: enc(m), ticket: 'ticket-1234', ticketId: '99', player: pl });
  }, [log, main]);
  await p.waitForFunction(() => /Из Discord \(ticket-1234\)/.test(document.querySelector('#status').textContent), null, { timeout: 15000 });
  ok(true, 'файлы приняты одним пакетом');
  const t = await p.textContent('#flist');
  ok(/ticket-1234/.test(t) && await p.textContent('#flist .fi.folder .fcnt') === '2', 'папка-дело названа по тикету, оба лога внутри');
  await p.click('#tabs [data-tab="case"]'); await p.waitForTimeout(400);
  const v = await p.textContent('#view');
  ok(/Тикет ticket-1234/.test(v) && /Ivan_Petrov/.test(v) && /55123/.test(v) && /Orlando/.test(v), 'данные игрока видны в деле');
  ok(await p.locator('#view .cplayer a[href^="https://discord.com/channels/"]').count() === 1, 'ссылка на сообщение в Discord');
  await p.click('#tabs [data-tab="diag"]'); await p.waitForTimeout(300);
  ok(await p.inputValue('#tagIn') === 'ticket-1234', 'тикет стал меткой лога');
  await p.evaluate(() => window.__ext({ name: 'client2.log', data: new TextEncoder().encode('[10:00:00.000] Logger initialized\n'), ticket: 'ticket-1234', ticketId: '99' }));
  await p.waitForTimeout(1500);
  ok(await p.textContent('#flist .fi.folder .fcnt') === '3', 'новый файл того же тикета добавлен в то же дело');
  await p.evaluate(() => window.__ext({ name: 'client.log', data: new TextEncoder().encode('[11:00:00.000] Logger initialized\n[11:00:05.000] Majestic Multiplayer inited\n[11:01:00.000][error] ERR_GFX_D3D_INIT happened\n'), ticket: 'ticket-2000', ticketId: '200', player: { id: '123', name: 'Иван', username: 'ivan', nick: '', static: '', server: '' } }));
  await p.waitForFunction(() => /ticket-2000/.test(document.querySelector('#status').textContent), null, { timeout: 15000 });
  await p.click('#tabs [data-tab="case"]').catch(() => {}); await p.waitForTimeout(400);
  const ph = await p.textContent('#view');
  ok(/Тикет ticket-2000/.test(ph) && /Прошлые тикеты этого игрока: 1/.test(ph), 'в новом тикете видна история игрока (тот же Discord ID)');
  await p.click('#view .phist summary'); await p.click('#view .phist [data-act=cmpCase]'); await p.waitForTimeout(400);
  ok(/Было:/.test(await p.textContent('#view')) && /Стало:/.test(await p.textContent('#view')), 'сравнение с прошлым тикетом игрока открывается');
  await p.click('#tabs [data-tab="case"]'); await p.waitForTimeout(300);
  await p.click('#view .phist summary'); await p.click('#view .phist [data-act=gcase]'); await p.waitForTimeout(400);
  ok(/Тикет ticket-1234/.test(await p.textContent('#view')), 'из истории открывается прошлое дело');
  await p.evaluate(() => document.querySelector('#btnSet').click()); await p.waitForTimeout(400);
  ok(/abc123token/.test(await p.textContent('#panelHost')) && await p.locator('[data-act=extCopy]').count() === 1, 'ключ плагина в настройках');
  await p.evaluate(() => { document.querySelector('#panelHost').innerHTML = ''; window.__pair({ id: 7, client: 'BetterDiscord' }); }); await p.waitForTimeout(200);
  ok(/Подключить плагин Discord/.test(await p.textContent('#panelHost')), 'просьба плагина о подключении показана окном');
  await p.click('#pairOk'); await p.waitForTimeout(200);
  ok(JSON.stringify(await p.evaluate(() => window.__pairAns)) === '[7,true]' && !(await p.locator('#pairOk').count()), '«Разрешить» передаёт ответ оболочке и закрывает окно');
  await H.done(b, errs);
})();

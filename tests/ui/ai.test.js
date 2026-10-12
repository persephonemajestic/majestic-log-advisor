const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  const log = H.clientLog('c1.log', { crash: true, extra: [
    '[18:58:40.000][Error][hooks] ERR_SYS_FILELOAD, Missing rpf: dlc_mj_x:/x64/a.rpf',
    '[18:58:40.001] Callstack:', '[18:58:40.002] --  0x7ffdaf52d0af',
    '[18:58:41.000][Warning][js] Resource a62efa85d6523030 tick was too long 25 ms',
    '[18:58:42.000] C:\\Program Files\\RivaTuner Statistics Server\\RTSSHooks64.dll',
    '[18:58:44.000][hooks] MINIDUMP: Temporary dump saved',
    '[18:58:44.100][hooks] Last loaded asset: mj_c_55_1_p06_roof.ydr w_sr_mjhunt_semicrb.ytd',
    '[18:58:44.200][hooks] Texture info: w_sr_mjhunt_semicrb' ] });
  await p.addInitScript(() => {
    window.__calls = [];
    const fn = async () => ({ text: '' }); fn.json = async (turns, opt) => { window.__calls.push({ turns, opt }); if (window.__bad) return { foo: 1 };
      return { category: 'ASSET_RENDER_CRASH', fault_asset: 'w_sr_mjhunt_semicrb.ytd', severity: 'HIGH', summary: 'Клиент упал при подгрузке текстуры оружия.', technical_cause: 'Дамп сразу после Last loaded asset: w_sr_mjhunt_semicrb.ydr, перед этим tick was too long 25 ms.', confidence: 'MEDIUM', confidence_note: 'нужен .dmp', solutions: ['Очистить кеш ресурса w_sr_mjhunt_semicrb в папке кеша лаунчера', 'Отключить RTSSHooks64.dll'] }; };
    window.claude = { use: async (n) => n === 'sample' ? fn : null };
  });
  await p.reload(); await p.waitForTimeout(700);
  await H.load(p, [log]);
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.__calls.length) === 0, 'без нажатия ИИ не вызывается');
  await p.click('[data-act=diagRun]');
  await p.waitForSelector('#diagBox .diag', { timeout: 8000 });
  const c = await p.evaluate(() => window.__calls);
  ok(c.length === 1, 'разбор по кнопке запущен один раз');
  const sys = c[0].turns[0].content, inp = c[0].turns[1].content;
  ok(/alt:V/.test(sys) && /ERR_SYS_FILELOAD/.test(sys) &&  /"category"/.test(sys) && /"fault_asset"/.test(sys) && /"solutions"/.test(sys) && /STREAMER_DESYNC/.test(sys), 'системный промт в ведущем сообщении, схема JSON указана');
  ok(!/Missing rpf: dlc_mj|0x7ffdaf52d0af/.test(inp), 'строки ERR_SYS_FILELOAD и Callstack вырезаны из данных');
  ok(/mj_c_55_1_p06_roof\.ydr/.test(inp) && /RTSSHooks64/.test(inp) && /tick was too long/.test(inp), 'в данных есть ассеты перед дампом, оверлей и предупреждения');
  const t = await p.textContent('#diagBox');
  ok(/Рендер ассетов/.test(t) && /w_sr_mjhunt_semicrb\.ytd/.test(t) && /средняя/.test(t) && /Очистить кеш ресурса/.test(t), 'карточка: категория, ассет, причина, уверенность, решение');
  await p.evaluate(() => { window.__bad = 1; }); await p.click('[data-act=diagRun]'); await p.waitForSelector('#diagBox .ai.err', { timeout: 8000 });
  ok(/не по схеме/.test(await p.textContent('#diagBox')), 'ответ не по схеме даёт понятную ошибку');
  await H.done(b, errs);
})();

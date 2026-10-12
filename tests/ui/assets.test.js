// «Ассеты» (раздел «Сводки»): файлы перед дампом накапливаются по логам.
const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  const mk = (n, asset) => H.clientLog(n, { crash: true, extra: ['[18:58:44.100][info] Last loaded asset: ' + asset] });
  await H.load(p, [mk('a1.log', 'mj_car_01.yft mj_car_01_hi.ytd')]);
  await H.load(p, [mk('a2.log', 'mj_car_01.yft other.ydr')]);
  await p.click('[data-tab=stats]'); await p.waitForTimeout(300);
  ok(!(await p.locator('[data-tab=assets]').count()), 'отдельной вкладки «Ассеты» больше нет');
  const t = await p.textContent('#view');
  ok(/Ассеты перед падением/.test(t), 'ассеты видны в «Сводке»');
  ok(/mj_car_01\.yft/.test(t) && /в 2 логах/.test(t), 'общий ассет посчитан по двум логам');
  ok(/\.yft/.test(t) && /\.ytd/.test(t), 'разбивка по расширениям');
  await H.done(b, errs);
})();

const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await H.load(p, [H.mainLog('a.log', { attempts: ['ok'] })]); await H.load(p, [H.mainLog('b.log', { attempts: ['fail'], date: '2026-10-07' })]);
  ok(await p.locator('#flist .fi:not(.folder)').count() === 2, 'два отдельных лога');
  await p.locator('#flist .fi:not(.folder) >> nth=1').dragTo(p.locator('#flist .fi:not(.folder) >> nth=0')); await p.waitForTimeout(300);
  ok(await p.locator('#flist .fi.folder').count() === 1, 'перетаскивание лога на лог создаёт папку');
  ok(await p.locator('.fdraw .fi').count() === 2, 'в папке оба лога');
  // открытый и закреплённый лог из закрытой папки не должен дублироваться снаружи
  await p.locator('#flist .fi.folder').click(); await p.waitForTimeout(300);
  await p.locator('#flist .fi:not(.folder)').count() && await p.locator('#flist .fi:not(.folder) >> nth=0').click().catch(() => {});
  ok(await p.locator('#flist > li > .fi:not(.folder)').count() === 0, 'открытый лог не дублируется снаружи закрытой папки');
  // третий лог на плитку папки, и файл с диска прямо на плитку лога
  await H.load(p, [H.mainLog('c.log', { attempts: ['ok'], date: '2026-10-08' })]);
  ok(await p.locator('#flist > li > .fi:not(.folder)').count() === 1, 'третий лог лежит отдельно');
  await p.locator('#flist > li > .fi:not(.folder)').dragTo(p.locator('#flist .fi.folder')); await p.waitForTimeout(300);
  ok(await p.locator('#flist > li > .fi:not(.folder)').count() === 0 && await p.locator('.fdraw .fi').count() === 3, 'лог на папку: он только внутри папки, без дубля снаружи');
  await H.load(p, [H.mainLog('d.log', { attempts: ['fail'], date: '2026-10-09' })]);
  const txt = require('fs').readFileSync(H.mainLog('e.log', { attempts: ['crash'], date: '2026-10-10' }), 'utf8');
  await p.evaluate((tx) => {
    const dt = new DataTransfer(); dt.items.add(new File([tx], 'e.log', { type: 'text/plain' }));
    const el = document.querySelector('#flist > li > .fi:not(.folder)');
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, txt); await p.waitForTimeout(800);
  ok(await p.locator('#flist > li > .fi:not(.folder)').count() === 0 && await p.locator('#flist .fi.folder').count() === 2, 'файл с диска на плитку лога: оба сложены в новую папку, отдельных нет');
  await p.locator('#flist .fi.folder').first().dragTo(p.locator('#arcHd')); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi.folder').count() >= 1, 'папка уходит в отложенные целиком');
  ok(!(await p.locator('#diagOff').count()), 'без ИИ лишней карточки «Диагноз ИИ» нет');
  await p.click('#arcClr'); await p.click('#arcClr'); await p.waitForTimeout(300);
  ok(await p.locator('#flist2 .fi').count() === 0 && !(await p.isVisible('#arcClr')), '«Убрать все» в отложенных очищает полосу после второго нажатия');
  await p.click('#actHd .clrz >> nth=1'); await p.click('#actHd .clrz >> nth=1'); await p.waitForTimeout(300);
  ok(await p.locator('.fi').count() === 0, '«Очистить всю историю» убирает все логи');
  await H.done(b, errs);
})();

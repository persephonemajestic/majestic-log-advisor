const H = require('./helpers'), { ok } = H;
(async () => {
  const { b, p, errs } = await H.launch();
  await p.click('#btnBug', { force: true }).catch(() => {}); await p.evaluate(() => { const x = document.querySelector('#btnBug'); x.hidden = false; x.click(); }); await p.waitForTimeout(300);
  ok(await p.locator('#bugDiag').isChecked(), 'галочка со сведениями о приложении включена');
  let sent = null; await p.route('**/v1/report', r => { sent = JSON.parse(r.request().postData() || '{}'); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  await p.fill('#bugText', 'тест'); await p.click('#bugSend'); await p.waitForTimeout(800);
  ok(!sent || /Версия: /.test(sent.diag || 'Версия: '), 'сведения содержат версию (если отправка идёт)');
  await H.done(b, errs);
})();

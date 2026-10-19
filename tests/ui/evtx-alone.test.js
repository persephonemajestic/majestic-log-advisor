// Журнал Windows без лога игрока: разбор открывается сразу (раньше данные молча ждали лог, казалось, что файл не добавился).
const fs = require('fs'), path = require('path'), H = require('./helpers');
(async () => {
  const { b, p, errs } = await H.launch();
  const ev = (id, lvl, prov, t, msg) => `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="${prov}"/><EventID>${id}</EventID><Level>${lvl}</Level><TimeCreated SystemTime="${t}"/><Channel>Application</Channel></System><EventData><Data>${msg}</Data></EventData></Event>`;
  const xml = '<Events>' + ev(1000, 2, 'Application Error', '2026-10-18T10:00:00.000Z', 'GTA5.exe 1.0 nvwgf2umx.dll c0000005') + ev(1001, 4, 'Windows Error Reporting', '2026-10-18T10:00:05.000Z', 'APPCRASH GTA5.exe') + '</Events>';
  const f = path.join(H.TMP, 'Application.xml'); fs.writeFileSync(f, xml);
  await p.setInputFiles('#fileIn', f); await p.waitForTimeout(1200);
  H.ok(await p.isVisible('#sysOnlyBox'), 'журнал без лога сразу открывает окно разбора');
  H.ok(/Application\.xml/.test(await p.textContent('#status')), 'в строке статуса видно, какой файл прочитан');
  await p.click('#sysOnlyBox [data-act="closePanel"]'); await p.waitForTimeout(200);
  await p.setInputFiles('#fileIn', H.clientLog('client.log', { crash: true })); await p.waitForTimeout(1200);
  H.ok(await p.evaluate(() => /Application\.xml/.test(document.querySelector('#view').textContent)), 'после добавления лога журнал привязывается к нему');
  await H.done(b, errs);
})();

// Связь дампа с логом по времени MINIDUMP и общая хронология.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
function client(name, hh, mm) {
  mm = mm || '36';
  const f = path.join(H.TMP, name);
  fs.writeFileSync(f, ['[' + hh + ':30:00.000] Logger initialized', '[' + hh + ':30:05.000] Majestic Multiplayer inited', '[' + hh + ':31:00.000] Game Started in 31000 ms', '[' + hh + ':32:00.000] Connected with id 5',
    '[' + hh + ':' + mm + ':50.000] MINIDUMP: Temporary dump saved to x', '[' + hh + ':' + mm + ':51.000] Shutting down'].join('\n') + '\n'); return f;
}
(async () => {
  const { b, p, errs } = await H.launch(1360, 1000);
  /* дамп 10:36:51 UTC, лог игрока в UTC+3: MINIDUMP в 13:36:50 */
  await H.load(p, [client('client_2026-10-07_13-30-00.log', '13')]);
  const ev = path.join(H.TMP, 'ev2.txt');
  fs.writeFileSync(ev, ['2026-10-07T13:36:40|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: GTA5.exe, version: 1.0.0.0, Exception code: 0xc0000005, Fault offset: 0x0000000000001234',
    '2026-10-07T13:36:20|System|141|Microsoft-Windows-Kernel-LiveDump|Warning|LiveKernelEvent nvlddmkm'].join('\n') + '\n');
  await p.setInputFiles('#sysIn', [H.dump(1791369411, 'd1.dmp'), ev]);
  await p.waitForFunction(() => /Хронология/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  let t = await p.textContent('#sysBox');
  ok(/дамп из этого запуска/.test(t), 'время дампа совпало с MINIDUMP: пометка «из этого запуска»');
  ok(/UTC\+3/.test(t), 'часовой пояс игрока определён по метке');
  ok(await p.locator('#sysBox .chron li').count() >= 6, 'в хронологии строки лога, дампа и Windows');
  const order = await p.$$eval('#sysBox .chron li .mono', (a) => a.map((x) => x.textContent));
  ok(order.join() === order.slice().sort().join(), 'хронология идёт по времени');
  /* другой запуск: MINIDUMP в логе на 16 минут расходится с дампом */
  await H.load(p, [client('client_2026-10-07_14-30-00.log', '14', '52')]);
  await p.click('[data-act=sysAdd]').catch(() => {});
  await p.setInputFiles('#sysIn', [H.dump(1791369411, 'd2.dmp')]);
  await p.waitForFunction(() => /Связь с логом/.test(document.querySelector('#sysBox').textContent), null, { timeout: 15000 });
  t = await p.textContent('#sysBox');
  ok(/может быть из другого запуска/.test(t), 'время не сходится: предупреждение о другом запуске');
  await H.done(b, errs);
})();

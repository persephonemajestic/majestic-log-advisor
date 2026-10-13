// Быстрый разбор для плагина Discord: файл разбирается, но в список логов не попадает; краткий ответ на «Вы»;
// предупреждения «тот ли файл»; скриншот с чёрными полосами распознаётся без сети.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  let chromium = require('playwright').chromium, b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  /* оболочка-заглушка: всё, чего нет, отвечает «ничего»; быстрый разбор ловим */
  await p.addInitScript(() => {
    const own = { kbLoad: () => '', kbSave() {}, copy() {}, onExtQuick: (cb) => { window.__qcb = cb; }, extQuickAnswer: (id, r) => { (window.__qans = window.__qans || {})[id] = r; }, onExtImport() {}, onExtPair() {}, onWatch() {}, extReady() {}, appOk() {},
      shellInfo: async () => ({ version: 'test', hwid: 'X' }), updateInfo: async () => ({ version: '', bundled: '', override: '', url: '' }), extInfo: async () => ({ on: true, port: 47615, token: 'x' }), watchInfo: async () => ({ dir: '', downloads: '' }), findLogs: async () => ({ files: [] }) };
    window.nativeApp = new Proxy(own, { get: (t, k) => (k in t ? t[k] : (() => Promise.resolve(null))) });
  });
  await p.goto(require('url').pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href); await p.waitForTimeout(900);
  const ask = async (id, name, bytes, meta) => p.evaluate(async ([id, name, bytes, meta]) => { window.__qcb({ id, name, data: new Uint8Array(bytes), meta }); for (let i = 0; i < 100 && !(window.__qans && window.__qans[id]); i++) await new Promise((r) => setTimeout(r, 50)); return window.__qans[id]; }, [id, name, bytes, meta]);
  ok(await p.evaluate(() => typeof window.__qcb === 'function'), 'приложение подписалось на быстрый разбор');
  const n0 = await p.locator('#flist .fi').count();
  const L = (d, t, lvl, msg) => `[${d} ${t}] [${lvl}]  [ (game)              ] ${msg}`;
  const crash = [L('2026-10-01', '10:00:00.000', 'info', 'game.play: zombie process sweep'), L('2026-10-01', '10:00:05.000', 'info', "crashService: crash detected → armed needResourceCheck self-heal { internalError: 'ERR_SYS_FILELOAD', scope: 'x' }")].join('\n') + '\n';
  const r1 = await ask(1, 'main.log', [...Buffer.from(crash)], { msgAt: Date.parse('2026-10-05T12:00:00'), siblings: ['main.log'], ticket: 'ticket-1' });
  ok(r1 && r1.ok && r1.status === 'bad' && r1.kind === 'main', 'лог разобран: вердикт и тип');
  ok(/^\*\*Приветствую! Благодарим Вас за обращение/.test(r1.reply) && /Для решения проблемы попробуйте:\n1\. /.test(r1.reply) && !/ERR_SYS_FILELOAD|фоновый|L\d+|\[2026/.test(r1.reply), 'ответ игроку краткий, на «Вы», без кодов и строк лога');
  const wk = (r1.warnings || []).map((w) => w.k).join(',');
  ok(wk === 'stale,needclient' && r1.warnings.every((w) => /пожалуйста/.test(w.ask)), 'предупреждения: старый лог и нет client.log — с готовой просьбой (' + wk + ')');
  ok(r1.lines.length >= 1 && r1.lines[0].n === 2 && /crashService/.test(r1.lines[0].t), 'ключевые строки с номерами');
  ok(/Передаю дальше/.test(r1.escalate) && /ticket-1/.test(r1.escalate) && /```/.test(r1.escalate), 'текст для передачи дальше');
  ok(r1.badge && r1.badge.tone === 'bad' && /старый/.test(r1.badge.t), 'значок: итог и пометка «старый» (' + r1.badge.t + ')');
  const r2 = await ask(2, 'notes.txt', [...Buffer.from('привет, у меня не запускается игра\nпомогите\n')], {});
  ok(r2 && r2.warnings.some((w) => w.k === 'notlog') && r2.badge.t === 'Не лог Majestic', 'не лог Majestic — так и сказано');
  ok(await p.locator('#flist .fi').count() === n0, 'быстрый разбор не добавляет файлы в список логов');
  /* скриншот: картинка игры по центру, чёрные поля сверху и снизу */
  const png = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 800, 600); const g = x.createLinearGradient(0, 0, 800, 0); g.addColorStop(0, '#4a7'); g.addColorStop(1, '#c84'); x.fillStyle = g; x.fillRect(0, 90, 800, 420); const bl = await new Promise((r) => c.toBlob(r, 'image/png')); return [...new Uint8Array(await bl.arrayBuffer())]; });
  const r3 = await ask(3, 'screen.png', png, {});
  ok(r3 && r3.kind === 'image' && /Чёрные полосы/.test(r3.cause) && /settings\.xml/.test(r3.reply) && /Вашего монитора/.test(r3.reply), 'скриншот: чёрные полосы найдены на этом компьютере, ответ — сбросить settings.xml');
  const plain = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d'); x.fillStyle = '#357'; x.fillRect(0, 0, 640, 360); const bl = await new Promise((r) => c.toBlob(r, 'image/png')); return [...new Uint8Array(await bl.arrayBuffer())]; });
  const r4 = await ask(4, 'ok.png', plain, {});
  ok(r4 && r4.ok && !/Чёрные полосы/.test(r4.cause || ''), 'обычный скриншот не принимается за чёрные полосы');
  await H.done(b, errs);
})();

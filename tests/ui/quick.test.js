// Быстрый разбор для плагина Discord: файл разбирается, но в список логов не попадает; краткий ответ на «Вы»;
// предупреждения «тот ли файл»; скриншот с чёрными полосами распознаётся без сети.
const H = require('./helpers'), { ok } = H, fs = require('fs'), path = require('path');
(async () => {
  let chromium = require('playwright').chromium, b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  /* оболочка-заглушка: всё, чего нет, отвечает «ничего»; быстрый разбор ловим */
  await p.addInitScript(() => {
    const TPLS = { at: 5, by: 'тест', sets: [{ name: 'Majestic RP', items: [{ t: 'Проблемы с донатом', body: '**Приветствую!**\nДОНАТ: напишите на почту.' }, { t: 'Обращение к администрации', body: '**Приветствую!**\nАДМИН: обратитесь к администрации.' }, { t: 'Черный экран', body: 'ЭКРАН' }, { t: 'Не удалось скачать ресурс', body: 'Удалите файл {файл}. Ник: {ник}' }, { t: 'Если способы выше не помогли', body: 'Активатор - ссылка', hide: true }] }, { name: 'Россия Онлайн', items: [{ t: 'Проблемы с донатом', body: 'РО-ДОНАТ' }] }] };
    const own = { kbLoad: () => JSON.stringify({ v: 1, sigs: {}, ruleNotes: {}, seen: {}, files: 0, custom: [], tags: {}, hist: {}, merged: {}, settings: { tplCache: TPLS, tplHints: { hints: { 'Majestic RP': { 'Черный экран': { say: ['картинка не появляется, всё темно'], when: '' } } }, stats: {}, pending: [] } } }), kbSave() {}, copy() {}, onExtQuick: (cb) => { window.__qcb = cb; }, extQuickAnswer: (id, r) => { (window.__qans = window.__qans || {})[id] = r; }, onExtImport() {}, onExtPair() {}, onWatch() {}, extReady() {}, appOk() {},
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
  /* шаблоны команды */
  const MJ = '530693013622489088';
  const t1 = await ask(5, 'ticket.txt', [...Buffer.from('Здравствуйте, оплатил 500 рублей, донат не пришёл на аккаунт')], { mode: 'text', guild: MJ });
  ok(t1 && t1.kind === 'text' && t1.tpl && t1.tpl.set === 'Majestic RP' && t1.tpl.pick[0] && t1.tpl.pick[0].t === 'Проблемы с донатом', 'по тексту игрока про донат предложен шаблон «Проблемы с донатом» (' + JSON.stringify(t1 && t1.tpl && t1.tpl.pick.map((x) => x.t)) + ')');
  const t2 = await ask(6, 'ticket.txt', [...Buffer.from('другой игрок забрал мою машину, нарушил правила, что делать')], { mode: 'text', guild: MJ });
  ok(t2.tpl.pick[0] && t2.tpl.pick[0].t === 'Обращение к администрации', 'игровая ситуация — шаблон «Обращение к администрации»');
  const t3 = await ask(7, 'ticket.txt', [...Buffer.from('донат не пришёл')], { mode: 'text', guild: '111' });
  ok(t3.tpl.set === 'Россия Онлайн' && t3.tpl.pick[0].body === 'РО-ДОНАТ', 'другой Discord-сервер — набор «Россия Онлайн»');
  const t4 = await ask(8, 'ticket.txt', [...Buffer.from('донат не пришёл')], { mode: 'text', guild: '111', set: 'Majestic RP' });
  ok(t4.tpl.set === 'Majestic RP', 'набор можно переключить вручную');
  ok(!t1.tpl.all.some((x) => /Активатор/.test(x.body)), 'шаблон со ссылкой на активатор не предлагается');
  const t5 = await ask(9, 'main.log', [...Buffer.from(crash)], { guild: MJ, text: 'у меня чёрный экран после запуска' });
  ok(t5.tpl && t5.tpl.pick.some((x) => x.t === 'Черный экран'), 'к разбору лога добавлены шаблоны по тексту игрока');
  const t6 = await ask(10, 'ticket.txt', [...Buffer.from('после запуска всё темно и картинка не появляется')], { mode: 'text', guild: MJ });
  ok(t6.tpl.pick[0] && t6.tpl.pick[0].t === 'Черный экран', 'фраза-пример команды помогает подобрать шаблон без ключевых слов');
  const t7 = await ask(11, 'fb.txt', [...Buffer.from(JSON.stringify({ kind: 'fit', set: 'Majestic RP', t: 'Черный экран', v: 1 }))], { mode: 'fb' });
  ok(t7 && t7.kind === 'fb', 'отметка из окна «Разбор» принята приложением');
  const t8 = await ask(12, 'ticket.txt', [...Buffer.from('не удалось скачать ресурс при входе')], { mode: 'text', guild: MJ, player: { nick: 'Ivan_Petrov' } });
  const pf = t8.tpl.pick.find((x) => x.t === 'Не удалось скачать ресурс');
  ok(pf && pf.body === 'Удалите файл {файл}. Ник: Ivan_Petrov', 'подстановки: {ник} заполнен из тикета, {файл} без данных остался меткой (' + (pf && pf.body) + ')');
  const t9 = await ask(13, 'ticket.txt', [...Buffer.from('после запуска всё темно и ничего не видно, помогите пожалуйста')], { mode: 'text', guild: MJ, noai: true });
  ok(t9.tpl && t9.tpl.more === false || t9.tpl.more === true, 'быстрый подбор без ИИ отвечает и сообщает, нужно ли уточнение ИИ');
  await H.done(b, errs);
})();

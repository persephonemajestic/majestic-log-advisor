// Плагины MajesticLogImport. Обе версии плагина на макете Discord: кнопка только в «своей» ветке и только у логов, отправка с данными игрока, ошибка ключа, очередь.
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP плагины: нет playwright'); process.exit(0); }
const path = require('path'), cpx = require('child_process');
const fs = require('fs');
/* Vencord-версия собирается esbuild с заглушками API Vencord (tests/plugins/stubs); без esbuild проверяется только BetterDiscord */
const ROOT = path.join(__dirname, '..', '..'), BD = fs.readFileSync(path.join(ROOT, 'plugins/betterdiscord/MajesticLogImport.plugin.js'), 'utf8');
let esb = ''; try { esb = require.resolve('esbuild'); } catch (e) { esb = ['/opt/npm-tools/node_modules/esbuild'].find((p) => fs.existsSync(p)) || ''; }
let VC = ''; if (esb) { const out = path.join(require('os').tmpdir(), 'mla-vc.js'); require(esb).buildSync({ entryPoints: [path.join(ROOT, 'plugins/vencord/majesticLogImport/index.tsx')], bundle: true, format: 'iife', outfile: out, logLevel: 'warning', alias: { '@api/Settings': path.join(__dirname, 'stubs/settings.ts'), '@utils/types': path.join(__dirname, 'stubs/types.ts'), '@webpack/common': path.join(__dirname, 'stubs/common.ts') } }); VC = fs.readFileSync(out, 'utf8'); }
const PAGE = `<!doctype html><html><body>
<ol>
 <li id="chat-messages-100-1"><div><a href="https://cdn.discordapp.com/attachments/100/5/client.log?ex=1">client.log</a> <a href="https://cdn.discordapp.com/attachments/100/6/photo.png">photo.png</a></div></li>
 <li id="chat-messages-100-2"><div><a href="https://cdn.discordapp.com/attachments/100/7/crash.zip">crash.zip</a></div></li>
 <li id="chat-messages-200-3"><div><a href="https://cdn.discordapp.com/attachments/200/8/main.log">main.log</a></div></li>
 <li id="chat-messages-300-4"><div><a href="https://cdn.discordapp.com/attachments/300/9/main.log">main.log</a></div></li>
</ol></body></html>`;
const MOCK = () => {
  const ch = { 100: { id: '100', name: 'ticket-1234', guild_id: '9', type: 11, isThread: () => true }, 200: { id: '200', name: 'ticket-777', guild_id: '9', type: 11, isThread: () => true }, 300: { id: '300', name: 'general', guild_id: '9', type: 0, isThread: () => false } };
  const au = { id: '42', username: 'ivan', globalName: 'Иван' };
  const msgs = { 100: [{ id: '0', author: au, content: 'Ник: Ivan_Petrov, статик 55123, сервер Orlando' }, { id: '1', author: au, content: 'вот лог', attachments: [{ filename: 'client.log', url: 'https://cdn.discordapp.com/attachments/100/5/client.log?ex=1' }, { filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/100/6/photo.png' }] }, { id: '2', author: { id: '7' }, content: 'Ник: Support_Guy', attachments: [{ filename: 'crash.zip', url: 'https://cdn.discordapp.com/attachments/100/7/crash.zip' }] }, { id: '3', author: au, content: 'и ещё', attachments: [{ filename: 'main.log', url: 'https://cdn.discordapp.com/attachments/100/10/main.log' }] }] };
  window.__stores = { ChannelStore: { getChannel: (id) => ch[id] }, JoinedThreadsStore: { hasJoined: (id) => id === '100' || id === '300' },
    MessageStore: { getMessage: (c, m) => (msgs[c] || []).find(x => x.id === m), getMessages: (c) => ({ toArray: () => msgs[c] || [] }) } };
  window.__toasts = []; window.__posts = []; window.__appUp = true; window.__tokenOk = 'secret';
  const reply = (body, token) => { if (!window.__appUp) return { status: 0 }; if (token !== window.__tokenOk) return { status: 401, j: { ok: false, error: 'token' } }; window.__posts.push(body); return { status: 200, j: { ok: true } }; };
  window.__reply = reply;
};
/* Разбор ника, статика и сервера: одинаковый в обеих версиях */
const EXCASES = [
  [['Ник: Ivan_Petrov, статик 55123, сервер Orlando'], [], ['Ivan_Petrov', '55123', 'Orlando']],
  [['Здравствуйте, сервер: New York статик: 12 ник Ivan Petrov'], [], ['Ivan Petrov', '12', 'New York']],
  [['играю на 5 сервере, вылетает'], [], ['', '', '5']],
  [['**Ник:** John_Smith\n**Сервер:** Los Angeles\n**Static ID:** 4433'], [], ['John_Smith', '4433', 'Los Angeles']],
  [[], [{ name: 'Игровой ник', value: 'Anna Lee' }, { name: 'Статик', value: '#7788' }, { name: 'Сервер', value: 'Chicago' }], ['Anna Lee', '7788', 'Chicago']],
  [['сервер не важен, ник: Max_Payne'], [], ['Max_Payne', '', '']],
  [['Сервер - Detroit | ник - Bob_Marley'], [], ['Bob_Marley', '', 'Detroit']],
  [['в понедельник вылетает игра'], [], ['', '', '']],
  [['Сотрудник Petr Ivanov помог'], [], ['', '', '']],
  [['зашёл на сервер и вылетело'], [], ['', '', '']],
  [['не могу зайти на сервер после обновления'], [], ['', '', '']],
  [[], [{ name: 'Ник саппорта', value: 'Kate_Support' }, { name: 'Имя пользователя', value: 'ivan_petrov' }], ['', '', '']],
  [['Ник: Ivan_Petrov'], [{ name: 'Игровой ник', value: 'Anna Lee' }], ['Ivan_Petrov', '', '']],
  [[], [], ['John_Doe', '', ''], ['Тикет открыт\nНик: John_Doe\nПринял саппорт: Kate_Support']],
  [[], [], ['', '', ''], ['Саппорт Kate_Support взял тикет']]
];
{
  global.BdApi = {}; const bdx = require(path.join(ROOT, 'plugins/betterdiscord/MajesticLogImport.plugin.js')).extractPlayer; delete global.BdApi;
  let vcx = null; if (esb) { const o = path.join(require('os').tmpdir(), 'mla-ex.js'); require(esb).buildSync({ entryPoints: [path.join(ROOT, 'plugins/vencord/majesticLogImport/extract.ts')], bundle: true, format: 'cjs', platform: 'node', outfile: o, logLevel: 'warning' }); vcx = require(o).extractPlayer; }
  let exBad = 0;
  for (const [t, f, e, bt] of EXCASES) for (const [k, fn] of [['BetterDiscord', bdx], ['Vencord', vcx]]) { if (!fn) continue; const r = fn(t, f, bt); if ([r.nick, r.static, r.server].join('|') !== e.join('|')) { exBad++; console.log('FAIL ' + k + ': ' + JSON.stringify(t.concat(f.map(x => x.name + ': ' + x.value))) + ' → ' + JSON.stringify(r)); } }
  console.log((exBad ? 'FAIL ' : 'PASS ') + 'ник, статик и сервер из текста и формы тикета: ' + EXCASES.length + ' случаев' + (vcx ? ', обе версии' : ''));
  if (exBad) process.exitCode = 1;
}
(async () => {
  let b; try { b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  for (const kind of VC ? ['BetterDiscord', 'Vencord'] : ['BetterDiscord']) {
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('https://discord.com/**', r => r.fulfill({ contentType: 'text/html', body: PAGE })); await p.goto('https://discord.com/channels/9/100'); await p.evaluate(MOCK);
    if (kind === 'BetterDiscord') {
      await p.evaluate((src) => {
        const data = {}; window.BdApi = { Data: { load: (a, k) => data[a + k], save: (a, k, v) => { data[a + k] = v; } }, Webpack: { getStore: (n) => window.__stores[n] }, UI: { showToast: (m, o) => window.__toasts.push([m, o.type]) }, DOM: { addStyle() {}, removeStyle() {} },
          Net: { fetch: async (url, o) => { if (/^https:\/\/cdn\.discordapp\.com\//.test(url)) { window.__dl = (window.__dl || 0) + 1; return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('LOG').buffer }; } if (/\/v1\/upload$/.test(url)) { const meta = JSON.parse(decodeURIComponent(escape(atob(o.headers['x-mla-meta'])))); window.__bytes = o.body && o.body.length; const r = window.__reply(meta, o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } if (/raw\.githubusercontent/.test(url)) return { ok: true, status: 200, text: async () => window.__newSrc || '' }; if (/ping$/.test(url)) return { ok: true, status: 200, json: async () => ({ ok: true }) }; const r = window.__reply(JSON.parse(o.body), o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } } };
        const module = { exports: {} }; new Function('module', 'exports', src)(module, module.exports);
        const P = module.exports; window.__p = new P({}); window.__setTok = (t) => BdApi.Data.save('MajesticLogImport', 'settings', { token: t, port: 47615 }); window.__p.start();
      }, BD);
    } else {
      await p.evaluate((src) => {
        window.VencordNative = { pluginHelpers: { MajesticLogImport: { ping: async () => window.__appUp, checkToken: async (port, token) => token === window.__tokenOk ? 'ok' : 'token', sendFile: async (port, token, body) => { const r = window.__reply(body, token); return r.status ? { status: r.status, ok: r.status === 200, dup: false, error: r.j.error || '' } : { status: 0, ok: false, error: 'down' }; }, send: async (port, token, body) => { const r = window.__reply(body, token); return r.status ? { status: r.status, ok: r.status === 200, dup: false, error: r.j.error || '' } : { status: 0, ok: false, error: 'down' }; }, ping: async () => true } } };
        new Function(src)(); window.__p = window.__vcPlugin; window.__setTok = (t) => { window.__vcSettings.token = t; }; window.__p.start();
      }, VC);
    }
    await p.waitForTimeout(400);
    const btns = await p.$$eval('.mla-one', (x) => x.map(b => b.previousElementSibling.textContent));
    ok(btns.join(',') === 'client.log,crash.zip', kind + ': кнопки только у логов и архивов в своей ветке-тикете (' + btns.join(',') + ')');
    await p.click('.mla-one >> nth=0'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => window.__toasts.some(t => /ключ/.test(t[0]))), kind + ': без ключа просит вставить ключ');
    await p.evaluate(() => window.__setTok('secret'));
    await p.click('.mla-one >> nth=0'); await p.waitForTimeout(200);
    const post = await p.evaluate(() => window.__posts[0]);
    ok(post && post.name === 'client.log' && post.ticket === 'ticket-1234' && post.ticketId === '100', kind + ': отправлен файл с тикетом');
    ok(post && post.player.nick === 'Ivan_Petrov' && post.player.static === '55123' && post.player.server === 'Orlando' && post.player.id === '42' && post.player.name === 'Иван' && /channels\/9\/100\/1$/.test(post.player.link), kind + ': данные игрока: ник, статик, сервер, Discord, ссылка (не саппорт)');
    ok(/В анализаторе/.test(await p.textContent('.mla-one >> nth=0')), kind + ': кнопка показывает, что отправлено');
    await p.evaluate(() => { window.__appUp = false; });
    await p.click('.mla-one >> nth=1'); await p.waitForTimeout(200);
    ok(/очеред/i.test(await p.textContent('.mla-one >> nth=1')), kind + ': приложение закрыто — файл в очереди');
    await p.evaluate(() => { window.__appUp = true; });
    if (kind === 'BetterDiscord') await p.evaluate(() => window.__p.flush()); else { await p.evaluate(() => { window.__p.stop(); }); }
    if (kind === 'Vencord') { await p.evaluate(() => { window.__p.start(); }); }
    await p.waitForTimeout(300);
    if (kind === 'BetterDiscord') ok(await p.evaluate(() => window.__posts.some(x => x.name === 'crash.zip')), kind + ': очередь отправлена, когда приложение открылось');
    else { ok(await p.evaluate(() => /crash\.zip/.test(localStorage.getItem('MajesticLogImport.queue') || '')), kind + ': очередь сохранена до запуска приложения'); await p.waitForTimeout(20600); ok(await p.evaluate(() => window.__posts.some(x => x.name === 'crash.zip')), kind + ': очередь отправлена по таймеру, когда приложение открылось'); }
    if (kind === 'BetterDiscord') {
      await p.evaluate((src) => { window.__toasts = []; window.__newSrc = src.replace(/@version [\d.]+/, '@version 9.9.9'); return window.__p.checkUpdate(); }, BD);
      ok(await p.evaluate(() => window.__toasts.some(t => /9\.9\.9/.test(t[0]))), kind + ': новая версия замечена');
      await p.evaluate(() => { window.__toasts = []; window.__newSrc = 'alert(1) // @version 9.9.10'; return window.__p.checkUpdate(); });
      ok(await p.evaluate(() => !window.__toasts.length), kind + ': чужой файл вместо плагина не принимается');
    }
    if (kind === 'BetterDiscord') ok(await p.evaluate(() => window.__dl > 0 && window.__bytes === 3), kind + ': файл скачан сетью Discord и передан приложению целиком');
    else {
      await p.evaluate(() => { window.__toasts = []; return window.__p.settings.def.check.component().p.onClick(); }); await p.waitForTimeout(100);
      ok(await p.evaluate(() => window.__toasts.some(t => /ключ подходит/.test(t[0]))), kind + ': в настройках есть «Проверить связь с анализатором»');
    }
    ok(/Все файлы тикета \(2\)/.test(await p.textContent('.mla-all').catch(() => '')) && await p.locator('.mla-all').count() === 1, kind + ': одна кнопка «Все файлы тикета (2)»');
    await p.evaluate(() => { window.__posts = []; window.__toasts = []; });
    await p.click('.mla-all'); await p.waitForTimeout(300);
    const allp = await p.evaluate(() => window.__posts.map(x => x.name + '|' + x.ticket).sort().join(','));
    ok(allp === 'client.log|ticket-1234,main.log|ticket-1234', kind + ': «Все файлы тикета» отправляет все файлы игрока, без файла саппорта (' + allp + ')');
    ok(await p.evaluate(() => window.__toasts.some(t => /отправлено 2/.test(t[0]))), kind + ': итог отправки показан');
    await p.evaluate(() => window.__p.stop());
    ok(await p.locator('.mla-btn').count() === 0, kind + ': при выключении плагина кнопки убираются');
    ok(!errs.length, kind + ': без ошибок страницы ' + errs.join(';'));
    await p.close();
  }
  await b.close(); process.exit(bad || process.exitCode ? 1 : 0);
})();

// Плагины MajesticLogImport. Обе версии плагина на макете Discord: кнопка только в «своей» ветке и только у логов, отправка с данными игрока, ошибка ключа, очередь.
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP плагины: нет playwright'); process.exit(0); }
const path = require('path'), cpx = require('child_process');
const fs = require('fs');
/* Vencord-версия собирается esbuild с заглушками API Vencord (tests/plugins/stubs); без esbuild проверяется только BetterDiscord */
const ROOT = path.join(__dirname, '..', '..'), BD = fs.readFileSync(path.join(ROOT, 'plugins/betterdiscord/MajesticLogImport.plugin.js'), 'utf8');
let esb = ''; try { esb = require.resolve('esbuild'); } catch (e) { esb = ['/opt/npm-tools/node_modules/esbuild'].find((p) => fs.existsSync(p)) || ''; }
let VC = ''; if (esb) { const out = path.join(require('os').tmpdir(), 'mla-vc.js'); require(esb).buildSync({ entryPoints: [path.join(ROOT, 'plugins/vencord/majesticLogImport/index.tsx')], bundle: true, format: 'iife', outfile: out, logLevel: 'warning', alias: { '@api/Settings': path.join(__dirname, 'stubs/settings.ts'), '@utils/types': path.join(__dirname, 'stubs/types.ts'), '@webpack/common': path.join(__dirname, 'stubs/common.ts'), '@utils/discord': path.join(__dirname, 'stubs/discord.ts') } }); VC = fs.readFileSync(out, 'utf8'); }
const PAGE = `<!doctype html><html><body>
<ol>
 <li id="chat-messages-100-0"><div>Ник: Ivan_Petrov, статик 55123, сервер Orlando</div></li>
 <li id="chat-messages-100-1"><div><a href="https://cdn.discordapp.com/attachments/100/5/client.log?ex=1">client.log</a> <a href="https://cdn.discordapp.com/attachments/100/6/photo.png">photo.png</a></div></li>
 <li id="chat-messages-100-2"><div><a href="https://cdn.discordapp.com/attachments/100/7/crash.zip">crash.zip</a></div></li>
 <li id="chat-messages-200-3"><div><a href="https://cdn.discordapp.com/attachments/200/8/main.log">main.log</a></div></li>
 <li id="chat-messages-300-4"><div><a href="https://cdn.discordapp.com/attachments/300/9/main.log">main.log</a></div></li>
</ol></body></html>`;
const MOCK = () => {
  const ch = { 400: { id: '400', name: 'ticket-88cj1hj-last', guild_id: '9', type: 11, isThread: () => true }, 100: { id: '100', name: 'ticket-1234', guild_id: '9', type: 11, isThread: () => true }, 200: { id: '200', name: 'ticket-777', guild_id: '9', type: 11, isThread: () => true }, 300: { id: '300', name: 'general', guild_id: '9', type: 0, isThread: () => false } };
  const au = { id: '42', username: 'ivan', globalName: 'Иван' };
  const msgs = { 400: [{ id: '39', author: { id: '1', bot: true }, content: '@Technical support', embeds: [{ description: 'Благодарим Вас за обращение в службу поддержки. Специалист поддержки присоединится к чату\n- В случае некорректного поведения агент имеет право выдать Вам наказание', fields: [{ name: 'Сервер', value: 'Detroit' }] }] }, { id: '40', author: { id: '1', bot: true }, content: '**Описание проблемы:**\nЗакинул 367р спустя 5-10 минут не дали откат есть' }, { id: '41', author: { id: '1', bot: true }, content: 'Специалист @persephone взял ваше обращение в работу.' }, { id: '42', author: { id: 'me' }, content: 'Здравствуйте, сейчас посмотрю' }], 100: [{ id: '0', author: au, content: 'Ник: Ivan_Petrov, статик 55123, сервер Orlando' }, { id: '1', author: au, content: 'вот лог', attachments: [{ filename: 'client.log', url: 'https://cdn.discordapp.com/attachments/100/5/client.log?ex=1' }, { filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/100/6/photo.png' }] }, { id: '2', author: { id: '7' }, content: 'Ник: Support_Guy', attachments: [{ filename: 'crash.zip', url: 'https://cdn.discordapp.com/attachments/100/7/crash.zip' }] }, { id: '3', author: au, content: 'и ещё', attachments: [{ filename: 'main.log', url: 'https://cdn.discordapp.com/attachments/100/10/main.log' }] }] };
  window.__stores = { ChannelStore: { getChannel: (id) => ch[id] }, JoinedThreadsStore: { hasJoined: (id) => id === '100' || id === '300' || id === '400' },
    MessageStore: { getMessage: (c, m) => (msgs[c] || []).find(x => x.id === m), getMessages: (c) => ({ toArray: () => msgs[c] || [] }) } };
  window.__toasts = []; window.__posts = []; window.__appUp = true; window.__tokenOk = 'secret';
  const reply = (body, token) => { if (!window.__appUp) return { status: 0 }; if (token !== window.__tokenOk) return { status: 401, j: { ok: false, error: 'token' } }; window.__posts.push(body); return { status: 200, j: { ok: true } }; };
  window.__reply = reply;
  /* быстрый разбор: ответ приложения */
  window.__quickRes = { ok: true, status: 'bad', headline: 'Сбой запуска', cause: 'Моды в папке игры', steps: ['Убрать моды'], reply: '**Приветствую!**\n\n1. Удалите dinput8.dll', lines: [{ n: 3, t: 'строка лога' }], warnings: [{ text: 'Лог старый', ask: 'Пришлите свежий лог' }], badge: { t: 'МОД', tone: 'bad' }, escalate: '**Передаю дальше**', tpl: { set: 'Majestic RP', sets: ['Majestic RP', 'Россия Онлайн'], src: 'ИИ', why: 'про оплату', ask: '', pick: [{ t: 'Проблемы с донатом', body: 'ДОНАТ-ТЕКСТ' }], all: [{ t: 'Проблемы с донатом', body: 'ДОНАТ-ТЕКСТ' }, { t: 'Черный экран', body: 'ЭКРАН-ТЕКСТ' }] } };
  window.__quick = (meta, token) => { if (meta.mode === 'fb') return { status: 200, j: { ok: true, kind: 'fb' } }; window.__quicks = (window.__quicks || []).concat([meta]); if (!window.__appUp) return { status: 0, j: { ok: false } }; if (token === window.__tokenOk && !meta.noai && window.__aiPick) return { status: 200, j: Object.assign({}, window.__quickRes, { tpl: Object.assign({}, window.__quickRes.tpl, { pick: [window.__aiPick], src: 'ИИ', more: false }) }) }; if (!window.__appUp) return { status: 0, j: { ok: false } }; if (token !== window.__tokenOk) return { status: 401, j: { ok: false, error: 'token' } }; return { status: 200, j: window.__quickRes }; };
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
{ /* общий код окна «Разбор» одинаковый в обеих версиях (plugins/sync-quickui.py) */
  const cut = (t) => { t = t.replace(/\r\n/g, '\n'); return t.slice(t.indexOf('/* MLA-QUICKUI-START'), t.indexOf('/* MLA-QUICKUI-END */')).replace(/^export /gm, ''); };
  const same = cut(BD) === cut(fs.readFileSync(path.join(ROOT, 'plugins/vencord/majesticLogImport/quickui.ts'), 'utf8'));
  console.log((same ? 'PASS ' : 'FAIL ') + 'окно «Разбор» одинаковое в BetterDiscord и Vencord' + (same ? '' : ': запустите python3 plugins/sync-quickui.py')); if (!same) process.exitCode = 1;
}
(async () => {
  let b; try { b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  for (const kind of VC ? ['BetterDiscord', 'Vencord'] : ['BetterDiscord']) {
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('https://discord.com/**', r => r.fulfill({ contentType: 'text/html', body: PAGE })); await p.goto('https://discord.com/channels/9/100'); await p.evaluate(MOCK);
    if (kind === 'BetterDiscord') {
      await p.evaluate((src) => {
        const data = {}; window.BdApi = { Data: { load: (a, k) => data[a + k], save: (a, k, v) => { data[a + k] = v; } }, Webpack: { getStore: (n) => n === 'SelectedChannelStore' ? { getChannelId: () => window.__selCh || '' } : n === 'UserStore' ? { getCurrentUser: () => ({ id: 'me' }) } : window.__stores[n], getModule: () => ({ dispatchToLastSubscribed: (ev, o) => { if (ev === 'INSERT_TEXT') (window.__ins = window.__ins || []).push(o.plainText); }, emitter: { listeners: () => [1] } }) }, UI: { showToast: (m, o) => window.__toasts.push([m, o.type]) }, DOM: { addStyle() {}, removeStyle() {} },
          Net: { fetch: async (url, o) => { if (/^https:\/\/cdn\.discordapp\.com\//.test(url)) { window.__dl = (window.__dl || 0) + 1; return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('LOG').buffer }; } if (/\/v1\/quick$/.test(url) && window.__netQuickFail) throw new Error('net'); if (/\/v1\/quick$/.test(url)) { const meta = JSON.parse(decodeURIComponent(escape(atob(o.headers['x-mla-meta'])))); if (meta.mode === 'text') window.__ttext = new TextDecoder().decode(o.body); if (meta.mode === 'fb') window.__fb = (window.__fb || []).concat([JSON.parse(new TextDecoder().decode(o.body))]); const r = window.__quick(meta, o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } if (/\/v1\/upload$/.test(url)) { const meta = JSON.parse(decodeURIComponent(escape(atob(o.headers['x-mla-meta'])))); window.__bytes = o.body && o.body.length; const r = window.__reply(meta, o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } if (/\/v1\/pair$/.test(url)) { window.__pairs = (window.__pairs || 0) + 1; return window.__pairOk ? { ok: true, status: 200, json: async () => ({ ok: true, token: window.__pairOk }) } : { ok: false, status: 403, json: async () => ({ ok: false, error: 'denied' }) }; } if (/raw\.githubusercontent/.test(url)) return { ok: true, status: 200, text: async () => window.__newSrc || '' }; if (/ping$/.test(url)) return { ok: true, status: 200, json: async () => ({ ok: true }) }; const r = window.__reply(JSON.parse(o.body), o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } } };
        const module = { exports: {} }; new Function('module', 'exports', src)(module, module.exports);
        const P = module.exports; window.__p = new P({}); window.__setTok = (t) => BdApi.Data.save('MajesticLogImport', 'settings', { token: t, port: 47615 }); window.__p.start();
      }, BD);
    } else {
      await p.evaluate((src) => {
        window.VencordNative = { pluginHelpers: { MajesticLogImport: { ping: async () => window.__appUp, checkToken: async (port, token) => token === window.__tokenOk ? 'ok' : 'token', sendFile: async (port, token, body) => { const r = window.__reply(body, token); return r.status ? { status: r.status, ok: r.status === 200, dup: false, error: r.j.error || '' } : { status: 0, ok: false, error: 'down' }; }, quick: async (port, token, url, meta, text) => { if (meta.mode === 'fb') window.__fb = (window.__fb || []).concat([JSON.parse(text)]); return window.__quick(meta, token); }, send: async (port, token, body) => { const r = window.__reply(body, token); return r.status ? { status: r.status, ok: r.status === 200, dup: false, error: r.j.error || '' } : { status: 0, ok: false, error: 'down' }; }, ping: async () => true } } };
        new Function(src)(); window.__p = window.__vcPlugin; window.__setTok = (t) => { window.__vcSettings.token = t; }; window.__p.start();
      }, VC);
    }
    await p.waitForTimeout(400);
    const btns = await p.$$eval('.mla-one', (x) => x.map(b => { let e = b.previousElementSibling; while (e && e.tagName !== 'A') e = e.previousElementSibling; return e ? e.textContent : '?'; }));
    ok(await p.$$eval('.mla-q', (x) => x.length) === 2, kind + ': «Разбор» у логов и архивов (не у дампов)');
    ok(await p.locator('.mla-imgbar:not(.mla-tkbar) .mla-btn').count() === 1, kind + ': у скриншота игрока есть «Разбор скриншота»');
    ok(btns.join(',') === 'client.log,crash.zip', kind + ': кнопки только у логов и архивов в своей ветке-тикете (' + btns.join(',') + ')');
    await p.click('.mla-one >> nth=0'); await p.waitForTimeout(200);
    if (kind === 'BetterDiscord') {
      ok(await p.evaluate(() => window.__pairs === 1 && window.__toasts.some(t => /отклонено/.test(t[0]))), kind + ': без ключа просит подключиться через анализатор');
      await p.evaluate(() => { window.__tokenOk = 'aaaabbbbccccddddeeeeffff00001111'; window.__pairOk = window.__tokenOk; window.__posts = []; });
      await p.click('.mla-one >> nth=0'); await p.waitForTimeout(300);
      ok(await p.evaluate(() => BdApi.Data.load('MajesticLogImport', 'settings').token === window.__tokenOk && window.__posts.length === 1), kind + ': после «Разрешить» в анализаторе ключ сохранён и файл отправлен');
      await p.evaluate(() => { window.__tokenOk = 'secret'; window.__posts = []; window.__setTok(''); });
      await p.evaluate(() => { const b = document.querySelector('.mla-one'); b.disabled = false; b.textContent = 'В анализатор'; });
    } else ok(await p.evaluate(() => window.__toasts.some(t => /ключ/.test(t[0]))), kind + ': без ключа просит вставить ключ');
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
    if (kind === 'BetterDiscord') {
      const sv = await p.evaluate(() => { const el = window.__p.getSettingsPanel(); document.body.appendChild(el); const k = el.querySelector('.mla-key'); const vis = k.getBoundingClientRect().height > 20 && getComputedStyle(k).borderTopWidth !== '0px'; k.value = 'pasted-key'; k.dispatchEvent(new Event('input')); el.remove(); return [vis, window.__p.cfg().token]; });
      ok(sv[0] && sv[1] === 'pasted-key', kind + ': поле для ключа видно и ключ сохраняется сразу при вставке');
      await p.evaluate(() => window.__setTok('secret'));
    }
    if (kind === 'BetterDiscord') ok(await p.evaluate(() => window.__dl > 0 && window.__bytes === 3), kind + ': файл скачан сетью Discord и передан приложению целиком');
    else {
      await p.evaluate(() => { window.__toasts = []; return window.__p.settings.def.check.component().p.onClick(); }); await p.waitForTimeout(100);
      ok(await p.evaluate(() => window.__toasts.some(t => /ключ подходит/.test(t[0]))), kind + ': в настройках есть «Проверить связь с анализатором»');
    }
    if (kind === 'BetterDiscord') {
      const r = await p.evaluate(async () => {
        let spec = null; BdApi.UI.buildSettingsPanel = (o) => { spec = o; return document.createElement('div'); };
        window.__p.getSettingsPanel(); const ids = spec.settings.map((s) => s.id).join(',');
        spec.onChange(null, 'token', '  abcabcabcabcabcabcabcabcabcabcab  '); const saved = BdApi.Data.load('MajesticLogImport', 'settings').token;
        delete BdApi.UI.buildSettingsPanel; spec.onChange(null, 'token', 'secret');
        Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => '0123456789abcdef0123456789abcdef' }, configurable: true });
        const el = window.__p.getSettingsPanel(); document.body.appendChild(el); el.querySelector('.mla-paste').click(); await new Promise((r) => setTimeout(r, 50));
        const pasted = BdApi.Data.load('MajesticLogImport', 'settings').token, inField = el.querySelector('.mla-key').value; el.remove();
        BdApi.Data.save('MajesticLogImport', 'settings', { token: 'secret', port: 47615 });
        return { ids, saved, pasted, inField };
      });
      ok(r.ids === 'token,port,pair,paste,check,badges,hotkey' && r.saved === 'abcabcabcabcabcabcabcabcabcabcab', kind + ': настройки на полях BetterDiscord, ключ сохраняется (' + r.ids + ')');
      ok(r.pasted === '0123456789abcdef0123456789abcdef' && r.inField === r.pasted, kind + ': «Вставить ключ из буфера» сохраняет ключ');
    }
    /* быстрый разбор */
    await p.evaluate(() => { window.__ins = []; window.__quicks = []; window.__tokenOk = 'secret'; window.__setTok('secret'); });
    await p.click('.mla-q >> nth=0'); await p.waitForSelector('.mla-pop textarea', { timeout: 3000 }).catch(() => {});
    const pop = await p.evaluate(() => { const b = document.querySelector('.mla-pop'); return b ? { t: b.textContent, ta: (b.querySelector('textarea') || {}).value, warn: !!b.querySelector('.mla-warn [data-ask]') } : null; });
    ok(pop && /Моды в папке игры/.test(pop.t) && pop.ta === '**Приветствую!**\n\n1. Удалите dinput8.dll' && pop.warn && /Ctrl\+Shift\+L/.test(pop.t), kind + ': «Разбор» открывает окно: причина, предупреждение, ответ игроку, подсказка про клавишу');
    const qm = await p.evaluate(() => window.__quicks[0]);
    ok(qm && qm.name === 'client.log' && qm.ticket === 'ticket-1234' && qm.siblings.indexOf('main.log') >= 0 && !/\?/.test(qm.url), kind + ': в разбор уходят имя, тикет и остальные файлы тикета');
    await p.click('.mla-pop [data-ask]'); await p.waitForTimeout(100);
    await p.evaluate(() => { document.querySelector('.mla-pop textarea').value = 'Поправленный ответ'; });
    await p.click('.mla-pop [data-a=ins]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => window.__ins.join('|') === 'Пришлите свежий лог|Поправленный ответ' && !document.querySelector('.mla-pop')), kind + ': «Попросить» и «Вставить ответ в чат» вставляют текст в поле сообщения (с правками)');
    await p.evaluate(() => { window.__selCh = '100'; window.__quicks = []; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true, bubbles: true })); }); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !!document.querySelector('.mla-pop') && window.__quicks.length === 1 && window.__quicks[0].name === 'main.log'), kind + ': Ctrl+Shift+L разбирает последний лог игрока в открытом тикете');
    ok(await p.locator('.mla-tk').count() === 1 && /Анализировать/.test(await p.textContent('.mla-tk')), kind + ': «Анализировать» — одна кнопка (описания от бота нет — у первого сообщения игрока)');
    await p.click('.mla-pop [data-fit="-1"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => { const f = (window.__fb || []).pop(); return f && f.kind === 'fit' && f.v === -1 && f.t === 'Проблемы с донатом' && f.set === 'Majestic RP'; }), kind + ': «Не подходит» уходит отметкой по шаблону');
    await p.keyboard.press('Escape'); await p.click('.mla-q >> nth=0'); await p.waitForSelector('.mla-pop [data-say]', { timeout: 3000 }).catch(() => {});
    await p.click('.mla-pop [data-say="0"]'); await p.fill('.mla-pop .mla-tp-f input', 'не пришли коины после оплаты'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => { const f = (window.__fb || []).pop(); return f && f.kind === 'say' && f.say === 'не пришли коины после оплаты'; }) && /на проверку/.test(await p.textContent('.mla-pop')), kind + ': «+ фраза» отправляет фразу на проверку администратору');
    await p.evaluate(() => { window.__fb = []; });
    await p.click('.mla-pop [data-tpi="0"]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => (window.__fb || []).some((f) => f.kind === 'fit' && f.v === 1)), kind + ': вставка шаблона считается отметкой «подходит»');
    ok(await p.evaluate(() => window.__ins.pop() === 'ДОНАТ-ТЕКСТ' && !document.querySelector('.mla-pop')), kind + ': шаблон команды вставляется в чат одной кнопкой');
    await p.click('.mla-tk >> nth=0'); await p.waitForSelector('.mla-pop .mla-tq', { timeout: 3000 }).catch(() => {});
    await p.fill('.mla-pop .mla-tq', 'экран'); await p.waitForTimeout(100);
    await p.click('.mla-pop .mla-tl [data-tpi="0"]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => window.__ins.pop() === 'ЭКРАН-ТЕКСТ'), kind + ': поиск по шаблонам и вставка найденного');
    await p.click('.mla-tk >> nth=0'); await p.waitForSelector('.mla-pop [data-set]', { timeout: 3000 }).catch(() => {}); await p.evaluate(() => { window.__quicks = []; });
    await p.click('.mla-pop [data-set="Россия Онлайн"]'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => window.__quicks.length === 1 && window.__quicks[0].set === 'Россия Онлайн' && window.__quicks[0].guild === '9'), kind + ': переключение набора шаблонов (Majestic / Россия Онлайн) запрашивает заново');
    ok(await p.evaluate(() => /Ник: Ivan_Petrov/.test(window.__quicks[0].text || '') && !/Support_Guy/.test(window.__quicks[0].text || '')), kind + ': в подбор уходит текст игрока, без сообщений саппорта');
    if (kind === 'BetterDiscord') {
      await p.keyboard.press('Escape'); await p.evaluate(() => { window.__quicks = []; window.__p.textQuick('100'); }); await p.waitForTimeout(300);
      ok(await p.evaluate(() => window.__quicks[0] && window.__quicks[0].mode === 'text' && window.__quicks[0].name === 'ticket.txt'), kind + ': тикет без файлов — подбор по тексту');
      await p.keyboard.press('Escape'); await p.evaluate(() => { window.__p.qres.clear(); window.__ttext = ''; window.__p.textQuick('400'); }); await p.waitForTimeout(300);
      const tt = await p.evaluate(() => window.__ttext);
      ok(/Закинул 367р/.test(tt) && !/Специалист/.test(tt) && !/сейчас посмотрю/.test(tt) && !/наказание/.test(tt) && /Detroit/.test(tt) && await p.evaluate(() => window.__p.descId('400') === '40'), kind + ': тикет от бота: описание проблемы берётся, служебная строка и ваши сообщения — нет (' + tt + ')');
      /* окно открывается сразу без ИИ, ответ ИИ подставляется следом; клавиши */
      await p.keyboard.press('Escape');
      await p.evaluate(() => { window.__p.qres.clear(); window.__quicks = []; window.__fb = []; window.__ins = []; window.__quickRes.tpl.more = true; window.__aiPick = { t: 'Черный экран', body: 'ЭКРАН-ТЕКСТ' }; window.__p.textQuick('100'); }); await p.waitForTimeout(500);
      const pg = await p.evaluate(() => ({ q: window.__quicks.map((x) => x.noai), first: (document.querySelector('.mla-pop .mla-tp b') || {}).textContent, ev: (window.__fb || []).filter((f) => f.kind === 'ev').map((f) => f.ev) }));
      ok(pg.q.join(',') === 'true,false' && pg.first === 'Черный экран', kind + ': сначала подбор без ИИ, ответ ИИ подставился в то же окно (' + JSON.stringify(pg) + ')');
      ok(pg.ev.join(',') === 'shown', kind + ': окно с подбором посчитано один раз');
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
      ok(await p.evaluate(() => window.__ins.pop() === 'ЭКРАН-ТЕКСТ' && (window.__fb || []).some((f) => f.kind === 'ev' && f.ev === 'r1')), kind + ': Enter вставляет выбранный шаблон, засчитан как «первый»');
      await p.evaluate(() => { window.__p.qres.clear(); window.__quickRes.tpl.more = false; window.__aiPick = null; window.__quickRes.tpl.pick = [{ t: 'А', body: 'А-ТЕКСТ' }, { t: 'Б', body: 'Б-ТЕКСТ' }]; window.__p.textQuick('100'); }); await p.waitForTimeout(300);
      await p.keyboard.press('Alt+Digit2'); await p.waitForTimeout(150);
      ok(await p.evaluate(() => window.__ins.pop() === 'Б-ТЕКСТ'), kind + ': Alt+2 вставляет второй шаблон');
      await p.evaluate(() => { window.__quickRes.tpl.pick = [{ t: 'Проблемы с донатом', body: 'ДОНАТ-ТЕКСТ' }]; });
      /* запрос через BetterDiscord не прошёл — плагин повторяет обычным запросом страницы */
      await p.route('http://127.0.0.1:47615/v1/quick', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, kind: 'text', status: 'unk', headline: 'Через страницу', cause: '', steps: [], lines: [], warnings: [], tpl: null }) }));
      await p.keyboard.press('Escape'); await p.evaluate(() => { window.__netQuickFail = true; window.__p.qres.clear(); window.__p.textQuick('400'); }); await p.waitForTimeout(400);
      ok(/Через страницу/.test(await p.textContent('.mla-pop').catch(() => '')), kind + ': если запрос BetterDiscord не прошёл, разбор идёт обычным запросом страницы');
      await p.evaluate(() => { window.__netQuickFail = false; }); await p.keyboard.press('Escape'); await p.unroute('http://127.0.0.1:47615/v1/quick');
    }
    await p.click('.mla-tk >> nth=0'); await p.waitForTimeout(300);
    await p.click('.mla-pop [data-a=esc]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => window.__ins.pop() === '**Передаю дальше**'), kind + ': «Передать дальше» вставляет сводку для старших');
    await p.evaluate(() => { window.__appUp = false; }); await p.click('.mla-imgbar:not(.mla-tkbar) .mla-btn'); await p.waitForTimeout(300);
    ok(/не запущен/.test(await p.textContent('.mla-pop').catch(() => '')), kind + ': приложение закрыто — окно говорит, что делать');
    await p.keyboard.press('Escape'); await p.evaluate(() => { window.__appUp = true; }); await p.waitForTimeout(100);
    ok(!(await p.locator('.mla-pop').count()), kind + ': Esc закрывает окно');
    if (kind === 'BetterDiscord') {
      await p.evaluate(() => { window.__p.stop(); window.__p.qres.clear(); window.__p.downUntil = 0; window.__p.start(); }); await p.waitForTimeout(600);
      const bdg = await p.evaluate(() => [...document.querySelectorAll('.mla-badge')].map(x => x.textContent).join(','));
      ok(bdg === 'МОД', kind + ': значок с итогом разбора у лога игрока, у файла саппорта значка нет (' + bdg + ')');
      await p.click('.mla-badge >> nth=0'); await p.waitForTimeout(100);
      ok(await p.locator('.mla-pop').count() === 1, kind + ': клик по значку открывает разбор'); await p.keyboard.press('Escape');
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

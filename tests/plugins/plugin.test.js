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
  const msgs = { 100: [{ id: '0', author: au, content: 'Ник: Ivan_Petrov, статик 55123, сервер Orlando' }, { id: '1', author: au, content: 'вот лог' }, { id: '2', author: { id: '7' }, content: 'Ник: Support_Guy' }] };
  window.__stores = { ChannelStore: { getChannel: (id) => ch[id] }, JoinedThreadsStore: { hasJoined: (id) => id === '100' || id === '300' },
    MessageStore: { getMessage: (c, m) => (msgs[c] || []).find(x => x.id === m), getMessages: (c) => ({ toArray: () => msgs[c] || [] }) } };
  window.__toasts = []; window.__posts = []; window.__appUp = true; window.__tokenOk = 'secret';
  const reply = (body, token) => { if (!window.__appUp) return { status: 0 }; if (token !== window.__tokenOk) return { status: 401, j: { ok: false, error: 'token' } }; window.__posts.push(body); return { status: 200, j: { ok: true } }; };
  window.__reply = reply;
};
(async () => {
  let b; try { b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  for (const kind of VC ? ['BetterDiscord', 'Vencord'] : ['BetterDiscord']) {
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('https://discord.com/**', r => r.fulfill({ contentType: 'text/html', body: PAGE })); await p.goto('https://discord.com/channels/9/100'); await p.evaluate(MOCK);
    if (kind === 'BetterDiscord') {
      await p.evaluate((src) => {
        const data = {}; window.BdApi = { Data: { load: (a, k) => data[a + k], save: (a, k, v) => { data[a + k] = v; } }, Webpack: { getStore: (n) => window.__stores[n] }, UI: { showToast: (m, o) => window.__toasts.push([m, o.type]) }, DOM: { addStyle() {}, removeStyle() {} },
          Net: { fetch: async (url, o) => { if (/ping$/.test(url)) return { ok: true, status: 200, json: async () => ({ ok: true }) }; const r = window.__reply(JSON.parse(o.body), o.headers['x-mla-token']); if (!r.status) throw new Error('down'); return { ok: r.status === 200, status: r.status, json: async () => r.j }; } } };
        const module = { exports: {} }; new Function('module', 'exports', src)(module, module.exports);
        const P = module.exports; window.__p = new P({}); window.__setTok = (t) => BdApi.Data.save('MajesticLogImport', 'settings', { token: t, port: 47615 }); window.__p.start();
      }, BD);
    } else {
      await p.evaluate((src) => {
        window.VencordNative = { pluginHelpers: { MajesticLogImport: { send: async (port, token, body) => { const r = window.__reply(body, token); return r.status ? { status: r.status, ok: r.status === 200, dup: false, error: r.j.error || '' } : { status: 0, ok: false, error: 'down' }; }, ping: async () => true } } };
        new Function(src)(); window.__p = window.__vcPlugin; window.__setTok = (t) => { window.__vcSettings.token = t; }; window.__p.start();
      }, VC);
    }
    await p.waitForTimeout(400);
    const btns = await p.$$eval('.mla-btn', (x) => x.map(b => b.previousElementSibling.textContent));
    ok(btns.join(',') === 'client.log,crash.zip', kind + ': кнопки только у логов и архивов в своей ветке-тикете (' + btns.join(',') + ')');
    await p.click('.mla-btn >> nth=0'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => window.__toasts.some(t => /ключ/.test(t[0]))), kind + ': без ключа просит вставить ключ');
    await p.evaluate(() => window.__setTok('secret'));
    await p.click('.mla-btn >> nth=0'); await p.waitForTimeout(200);
    const post = await p.evaluate(() => window.__posts[0]);
    ok(post && post.name === 'client.log' && post.ticket === 'ticket-1234' && post.ticketId === '100', kind + ': отправлен файл с тикетом');
    ok(post && post.player.nick === 'Ivan_Petrov' && post.player.static === '55123' && post.player.server === 'Orlando' && post.player.id === '42' && post.player.name === 'Иван' && /channels\/9\/100\/1$/.test(post.player.link), kind + ': данные игрока: ник, статик, сервер, Discord, ссылка (не саппорт)');
    ok(/В анализаторе/.test(await p.textContent('.mla-btn >> nth=0')), kind + ': кнопка показывает, что отправлено');
    await p.evaluate(() => { window.__appUp = false; });
    await p.click('.mla-btn >> nth=1'); await p.waitForTimeout(200);
    ok(/очеред/i.test(await p.textContent('.mla-btn >> nth=1')), kind + ': приложение закрыто — файл в очереди');
    await p.evaluate(() => { window.__appUp = true; });
    if (kind === 'BetterDiscord') await p.evaluate(() => window.__p.flush()); else { await p.evaluate(() => { window.__p.stop(); }); }
    if (kind === 'Vencord') { await p.evaluate(() => { window.__p.start(); }); }
    await p.waitForTimeout(300);
    if (kind === 'BetterDiscord') ok(await p.evaluate(() => window.__posts.some(x => x.name === 'crash.zip')), kind + ': очередь отправлена, когда приложение открылось');
    else { ok(await p.evaluate(() => /crash\.zip/.test(localStorage.getItem('MajesticLogImport.queue') || '')), kind + ': очередь сохранена до запуска приложения'); await p.waitForTimeout(20600); ok(await p.evaluate(() => window.__posts.some(x => x.name === 'crash.zip')), kind + ': очередь отправлена по таймеру, когда приложение открылось'); }
    await p.evaluate(() => window.__p.stop());
    ok(await p.locator('.mla-btn').count() === 0, kind + ': при выключении плагина кнопки убираются');
    ok(!errs.length, kind + ': без ошибок страницы ' + errs.join(';'));
    await p.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();

// Программа для Windows с новой оболочкой: окно входа и регистрации, сеанс хранится в оболочке, старый вход по коду компьютера работает.
const path = require('path'), H = require('./helpers');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { process.exit(0); }
const ROOT = path.resolve(__dirname, '..', '..');
const kv = new Map(), env = { ADMIN_PASS: 'adm', ACCESS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) } };
(async () => {
  const W = (await import(require('url').pathToFileURL(path.join(ROOT, 'worker', 'worker.js')).href)).default;
  const admin = (body) => W.fetch(new Request('http://x/admin/api', { method: 'POST', headers: { Authorization: 'Bearer adm', 'content-type': 'application/json' }, body: JSON.stringify(body) }), env).then((r) => r.json());
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const errs = [], shell = { ses: null, hw: 'EEEEE-EEEEE-EEEEE-EEEEE' };
  const open = async () => {
    const p = await (await b.newContext({ viewport: { width: 1300, height: 860 } })).newPage(); p.on('pageerror', (e) => errs.push(e.message));
    /* как gated-fetch в main.js: заголовки X-HWID и X-Session добавляет оболочка, ответ — текст или null */
    await p.exposeFunction('__gf', async (pth, o) => { o = o || {}; const h = { 'X-HWID': shell.hw }; if (shell.ses) h['X-Session'] = shell.ses.token; const init = { headers: h }; if (o.body != null) { init.method = 'POST'; init.body = JSON.stringify(o.body); h['content-type'] = 'application/json'; } const r = await W.fetch(new Request('http://x' + pth, init), env); return r.ok ? await r.text() : null; });
    await p.exposeFunction('__as', async (t, l) => { shell.ses = t ? { token: t, login: l } : null; return true; });
    await p.addInitScript(() => { window.nativeApp = { kbLoad: () => null, kbSave: () => {}, copy: () => {}, gatedFetch: (pth, o) => window.__gf(pth, o), authSet: (t, l) => window.__as(t, l), authGet: async () => ({ has: false }) }; });
    await p.goto(require('url').pathToFileURL(path.join(ROOT, 'index.html')).href); await p.waitForTimeout(1200); return p;
  };
  let p = await open();
  H.ok(await p.isVisible('#webGate #wgForm') && await p.isVisible('#webGate .wg-mk'), 'программа без доступа показывает окно входа');
  await p.click('[data-wg=tab][data-m=register]'); await p.fill('#wgL', 'Petr'); await p.fill('#wgP', 'Lampa-Stol-48'); await p.fill('#wgP2', 'Lampa-Stol-48'); await p.click('#wgForm [type=submit]'); await p.waitForTimeout(700);
  H.ok(shell.ses && /^[0-9a-f]{64}$/.test(shell.ses.token) && /ждёт подтверждения/.test(await p.textContent('#webGate')), 'регистрация: сеанс сохранён в оболочке, ждёт подтверждения');
  await admin({ action: 'userSet', login: 'Petr', st: 'ok' }); await p.click('[data-wg=retry]'); await p.waitForTimeout(700);
  H.ok(!(await p.$('#webGate')) && await p.evaluate(() => !document.getElementById('btnAcc').hidden), 'после выдачи доступа программа открывается, в меню есть «Аккаунт»');
  await p.close(); p = await open();
  H.ok(!(await p.$('#webGate')), 'после перезапуска программы вход сохраняется');
  await p.click('#btnMore'); await p.click('#btnAcc'); await p.waitForTimeout(300);
  H.ok(/Petr/.test(await p.textContent('#panelHost')) && await p.isVisible('#accPw'), '«Ещё» → «Аккаунт»: логин и смена пароля');
  await p.click('[data-wg=logoutAsk]'); await p.click('[data-wg=logoutAsk]'); await p.waitForTimeout(700);
  H.ok(!shell.ses && await p.isVisible('#webGate #wgForm'), 'выход: сеанс удалён, снова окно входа');
  /* компьютер со старым кодом: заходит без аккаунта, в «Аккаунте» предлагается войти */
  kv.set('h:' + shell.hw, JSON.stringify({ n: 'ПК' })); await p.close(); p = await open();
  H.ok(!(await p.$('#webGate')), 'компьютер со старым кодом доступа открывается без аккаунта');
  await p.click('#btnMore'); await p.click('#btnAcc'); await p.waitForTimeout(300);
  H.ok(/по коду этого компьютера/.test(await p.textContent('#panelHost')), 'в «Аккаунте» предлагается войти, чтобы доступ был и на телефоне');
  await p.click('[data-wg=opengate]'); await p.fill('#wgL', 'Petr'); await p.fill('#wgP', 'Lampa-Stol-48'); await p.click('#wgForm [type=submit]'); await p.waitForTimeout(700);
  H.ok(!(await p.$('#webGate')) && shell.ses, 'вход в аккаунт со старого компьютера');
  await H.done(b, errs);
})();

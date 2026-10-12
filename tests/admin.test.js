// Админ-панель: рендер статистики и опрос на подменённом API (нужен playwright)
const fs = require('fs'), path = require('path');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP admin: нет playwright'); process.exit(0); }
const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'worker.js'), 'utf8');
const m = /const ADMIN_HTML = `([\s\S]*)`;\s*$/.exec(src), html = new Function('return `' + m[1] + '`')();
(async () => {
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const p = await (await b.newContext()).newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/admin/api', async r => { const a = JSON.parse(r.request().postData()).action; const o = { ok: true };
    if (a === 'ping') o.v = '1'; else if (a === 'stats') o.days = [{ d: '2026-10-11', n: 10, bad: 4, mods: 1, probs: [{ k: 'a', t: 'Антивирус блокирует', c: 5 }] }, { d: '2026-10-10', n: 6, bad: 1, mods: 0, probs: [{ k: 'a', t: 'Антивирус блокирует', c: 2 }] }]; else { o.list = []; o.rules = []; }
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) }); });
  await p.route('**/admin', r => r.fulfill({ contentType: 'text/html', body: html }));
  await p.addInitScript(() => { try { sessionStorage.setItem('pw', 'x'); } catch (e) {} });
  await p.goto('http://localhost/admin'); await p.waitForTimeout(600);
  const t = await p.textContent('#stBox'); let bad = 0;
  const ok = (c, msg) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + msg); };
  ok(/Логов: 16, с провалом запуска: 5 \(31%\)/.test(t), 'итоги за период'); ok(/Антивирусблокирует7/.test(t.replace(/\s/g, '')), 'частые проблемы суммируются по дням');
  ok(!errs.length, 'нет ошибок страницы ' + errs.join(';')); await b.close(); process.exit(bad ? 1 : 0);
})();

// Проверка настоящего приложения на Windows: запуск оболочки, пути с кириллицей и пробелами, длинные пути,
// большой лог, сохранение базы, поиск логов лаунчера, приёмник плагина, перезагрузка при автообновлении,
// и отдельно — собранный .exe (окно доступа с кодом компьютера).
const { _electron } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const shot = async (p, n) => { try { fs.mkdirSync(path.join(ROOT, 'win-shots'), { recursive: true }); await p.screenshot({ path: path.join(ROOT, 'win-shots', n + '.png') }); } catch (e) {} };
const ping = (port) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path: '/v1/ping', timeout: 3000 }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }); r.on('error', () => res(null)); });

function fixtures() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mla win '));
  const cyr = path.join(base, 'Папка с пробелами', 'Логи игрока Иван');
  fs.mkdirSync(cyr, { recursive: true });
  const client = path.join(cyr, 'client_2026-10-08_10-00-00.log');
  fs.writeFileSync(client, ['[10:00:00.000] Logger initialized', '[10:00:05.000] Majestic Multiplayer inited', '[10:05:00.000][error] ERR_FIL_PACK_3 happened', '[10:05:01.000] MINIDUMP: Temporary dump saved to x', '[10:05:02.000] Shutting down', ''].join('\n'));
  let deep = path.join(base, 'long'); while (deep.length < 300) deep = path.join(deep, 'очень_длинная_папка_' + deep.length);
  fs.mkdirSync(deep, { recursive: true });
  const longF = path.join(deep, 'main.log'); fs.writeFileSync(longF, "[2026-10-06 11:10:10.000] [error]  [ (game)              ] game launch failed { reason: 'patcher-error' }\n");
  const local = path.join(base, 'Local'); const ml = path.join(local, 'MajesticLauncher', 'logs'); fs.mkdirSync(ml, { recursive: true });
  fs.writeFileSync(path.join(ml, 'main.log'), "[2026-10-06 11:10:00.000] [info]  [ (game)              ] game.play: zombie process sweep\n");
  const big = path.join(base, 'Большой лог', 'client_big.log'); fs.mkdirSync(path.dirname(big), { recursive: true });
  const fd = fs.openSync(big, 'w'); const chunk = []; for (let i = 0; i < 20000; i++) chunk.push('[10:' + String(i % 60).padStart(2, '0') + ':00.000][warning] Can not find texture slot ' + i + ' C:\\Games\\GTA V\\x64\\dlcpacks\\some\\very\\long\\path\\to\\file_' + i + '.rpf');
  const block = chunk.join('\n') + '\n'; let size = 0; while (size < 110 * 1048576) { fs.writeSync(fd, block); size += Buffer.byteLength(block); }
  fs.writeSync(fd, '[11:00:00.000][error] ERR_GFX_D3D_INIT happened\n'); fs.closeSync(fd);
  return { base, client, longF, local, big, userData: path.join(base, 'Данные приложения') };
}

async function waitStatus(p, re, ms) { await p.waitForFunction((s) => new RegExp(s).test((document.querySelector('#status') || {}).textContent || ''), re.source, { timeout: ms || 60000 }); }

async function devApp(F) {
  const exe = require(path.join(ROOT, 'app', 'node_modules', 'electron'));
  const ea = await _electron.launch({ executablePath: exe, args: [path.join(__dirname, 'harness.js')], env: Object.assign({}, process.env, { MLA_USERDATA: F.userData, LOCALAPPDATA: F.local }), timeout: 60000 });
  const errs = []; let p = await ea.firstWindow();
  for (let i = 0; i < 40 && !(await p.locator('#fileIn').count().catch(() => 0)); i++) await new Promise((r) => setTimeout(r, 500));
  p.on('pageerror', (e) => errs.push(e.message));
  ok(await p.locator('#fileIn').count() === 1, 'оболочка открыла интерфейс (без окна доступа)');
  ok(await p.evaluate(() => !!window.nativeApp && typeof window.nativeApp.readFile === 'function'), 'мост nativeApp доступен');
  await shot(p, '1-start');

  await p.setInputFiles('#fileIn', [F.client]); await waitStatus(p, /Добавлено/);
  if (await p.locator('[data-act=ldOk]').count()) await p.click('[data-act=ldOk]');
  ok(/ERR_FIL_PACK_3|FIL_PACK/.test(await p.textContent('body')), 'лог из папки с кириллицей и пробелами разобран');
  await shot(p, '2-client');

  const rd = await p.evaluate((f) => window.nativeApp.readFile(f), F.client);
  ok(typeof rd === 'string' && /Logger initialized/.test(rd), 'чтение файла по кириллическому пути');
  const rl = await p.evaluate((f) => window.nativeApp.readFile(f).catch((e) => 'ERR ' + e.message), F.longF);
  ok(typeof rl === 'string' && /patcher-error/.test(rl), 'чтение файла по пути длиннее 260 символов (' + F.longF.length + ')');

  const fl = await p.evaluate(() => window.nativeApp.findLogs());
  ok(fl && fl.files && fl.files.some((x) => /MajesticLauncher/.test(x.path)), 'логи лаунчера найдены в %LOCALAPPDATA%');

  const kb = await p.evaluate(() => { const s = window.nativeApp.kbLoad(); return s.length; });
  ok(kb > 10, 'база знаний сохранена в папку с кириллицей (' + kb + ' байт)');
  ok(fs.existsSync(path.join(F.userData, 'knowledge-base.json')), 'файл базы лежит в папке данных');

  const info = await p.evaluate(() => window.nativeApp.extInfo());
  ok(info && info.on, 'приёмник плагина запущен');
  const pg = await ping(info.port); ok(pg && pg.ok, 'приёмник отвечает на 127.0.0.1:' + info.port);

  const t0 = Date.now();
  await p.setInputFiles('#fileIn', [F.big]);
  let maxLag = 0, done = false;
  const probe = (async () => { while (!done) { const a = Date.now(); await p.evaluate(() => 1).catch(() => {}); maxLag = Math.max(maxLag, Date.now() - a); await new Promise((r) => setTimeout(r, 100)); } })();
  try { await waitStatus(p, /Добавлено/, 180000); } catch (e) {}
  done = true; await probe; const secs = (Date.now() - t0) / 1000;
  console.log('INFO большой лог 110 МБ: ' + secs.toFixed(1) + ' с, самая долгая заминка окна ' + maxLag + ' мс');
  ok(/Добавлено/.test(await p.textContent('#status')), 'большой лог 110 МБ загружен за ' + secs.toFixed(1) + ' с');
  ok(maxLag < 3000, 'окно не замирает дольше 3 с при большом логе (' + maxLag + ' мс)');
  await shot(p, '3-big');

  await p.evaluate(() => window.nativeApp.reloadApp());
  await new Promise((r) => setTimeout(r, 1500));
  p = ea.windows()[0];
  for (let i = 0; i < 60 && !/логов: [1-9]|Восстановлено|Приложение/.test(await p.textContent('body').catch(() => '')); i++) await new Promise((r) => setTimeout(r, 500));
  ok(/client_2026-10-08/.test(await p.textContent('body')), 'после перезагрузки (автообновление) логи на месте');
  await shot(p, '4-reload');

  ok(!errs.length, 'нет ошибок в окне' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ea.close();
}

async function packaged() {
  const exe = path.join(ROOT, 'app', 'dist', 'Majestic Log Advisor-win32-x64', 'Majestic Log Advisor.exe');
  if (!fs.existsSync(exe)) { console.log('SKIP собранный .exe не найден'); return; }
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mla exe '));
  const ea = await _electron.launch({ executablePath: exe, args: ['--user-data-dir=' + ud], timeout: 60000 });
  const p = await ea.firstWindow();
  let txt = ''; for (let i = 0; i < 40; i++) { txt = await p.textContent('body').catch(() => ''); if (/код компьютера|fileIn|Не удалось проверить/.test(txt) || await p.locator('#fileIn').count().catch(() => 0)) break; await new Promise((r) => setTimeout(r, 500)); }
  await shot(p, '5-exe');
  const code = /([0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5})/.exec(txt);
  ok(!!code || await p.locator('#fileIn').count() === 1, 'собранный .exe запускается: ' + (code ? 'окно доступа с кодом ' + code[1] : 'интерфейс'));
  const ver = await ea.evaluate(({ app }) => app.getVersion()).catch(() => '');
  ok(!!ver, 'версия сборки ' + ver);
  await ea.close();
}

(async () => {
  const F = fixtures();
  try { await devApp(F); } catch (e) { failed++; console.log('FAIL приложение: ' + (e && e.stack || e)); }
  try { await packaged(); } catch (e) { failed++; console.log('FAIL собранный .exe: ' + (e && e.stack || e)); }
  try { fs.rmSync(F.base, { recursive: true, force: true }); } catch (e) {}
  console.log(failed ? 'WIN FAIL: ' + failed : 'WIN OK'); process.exit(failed ? 1 : 0);
})();

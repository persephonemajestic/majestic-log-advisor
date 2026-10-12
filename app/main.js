const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu, shell, net, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const SHELL_VERSION = '2026-10-12.18';
const APPDIR = global.APP_DIR || __dirname;
const bundled = () => path.join(APPDIR, 'index.html');
const overrideFile = () => path.join(app.getPath('userData'), 'index-override.html');
const cfgFile = () => path.join(app.getPath('userData'), 'update.json');
const verOf = (t) => { const m = /APP_VERSION\s*=\s*'([^']+)'/.exec(t); return m ? m[1] : ''; };
const cmpVer = (a, b) => { const x = a.split(/[-.]/).map(Number), y = b.split(/[-.]/).map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const WORKER = 'https://majestic-log-advisor.requesteadm.workers.dev';
let getHwid;
try { getHwid = require(path.join(APPDIR, 'hwid.js')); } catch (e) {
  getHwid = function () {
    const crypto = require('crypto'), os = require('os'); let id = '';
    try { const out = require('child_process').execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true }); const m = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out); if (m) id = m[1]; } catch (er) {}
    if (!id) id = os.hostname() + '|' + (os.cpus()[0] || {}).model + '|' + os.totalmem();
    const h = crypto.createHash('sha256').update('majestic-log-advisor|' + id).digest('hex').slice(0, 20).toUpperCase();
    return h.match(/.{5}/g).join('-');
  };
}
const gatedHeaders = () => ({ 'X-HWID': getHwid() });
const DEFAULT_URL = WORKER + '/v1/app';
const readCfg = () => { let c = {}; try { c = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) {} if (!c.url || /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//i.test(c.url)) c.url = DEFAULT_URL; return c; };
const writeCfg = (c) => { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };
const validPage = (t) => typeof t === 'string' && t.length > 20000 && t.length < 8 * 1048576 && /Анализатор логов Majestic/.test(t) && verOf(t) && /<script>/.test(t);

/* Загрузка страницы с защитой: если новая версия интерфейса не подтвердила запуск, возвращаем встроенную и запоминаем плохую версию. */
let okTimer = null, loadedOverride = '';
function guardedLoad(win) {
  const p = pickPage(); clearTimeout(okTimer); loadedOverride = p.override && cmpVer(p.version, '2026-10-12.91') >= 0 ? p.version : '';
  win.loadFile(p.file);
  if (p.override && cmpVer(p.version, '2026-10-12.91') >= 0) okTimer = setTimeout(() => rollbackPage('нет подтверждения запуска'), 30000);
}
function rollbackPage() {
  if (!loadedOverride) return;
  const bad = loadedOverride; loadedOverride = ''; clearTimeout(okTimer);
  try { fs.unlinkSync(overrideFile()); } catch (e) {}
  const c = readCfg(); c.badVer = bad; writeCfg(c);
  try { if (mainWin && !mainWin.isDestroyed()) mainWin.loadFile(bundled()); } catch (e) {}
}
ipcMain.on('app-ok', () => { clearTimeout(okTimer); loadedOverride = ''; });
function pickPage() {
  let b = '', o = '';
  try { b = verOf(fs.readFileSync(bundled(), 'utf8')); } catch (e) {}
  try { if (fs.existsSync(overrideFile())) { const t = fs.readFileSync(overrideFile(), 'utf8'); if (validPage(t)) o = verOf(t); } } catch (e) {}
  return { file: o && (!b || cmpVer(o, b) > 0) ? overrideFile() : bundled(), version: o && (!b || cmpVer(o, b) > 0) ? o : b, override: !!(o && (!b || cmpVer(o, b) > 0)), bundledVersion: b };
}

let mainWin = null;
const dlIcon = () => path.join(app.getPath('userData'), 'icon.png');
function iconPath() { try { if (fs.existsSync(dlIcon())) return dlIcon(); } catch (e) {} return path.join(APPDIR, 'icon.png'); }
async function refreshShortcuts() {
  if (process.platform !== 'win32') return;
  try {
    const ico = path.join(app.getPath('userData'), 'icon.ico');
    const r = await net.fetch(WORKER + '/v1/shell/icon.ico?t=' + Date.now(), { cache: 'no-store', headers: gatedHeaders() });
    if (!r.ok) return; const b = Buffer.from(await r.arrayBuffer()); if (b.length < 1000) return;
    let same = false; try { same = fs.existsSync(ico) && fs.readFileSync(ico).equals(b); } catch (e) {}
    if (same) return; fs.writeFileSync(ico, b);
    const name = 'Анализатор логов Majestic.lnk';
    const spots = [path.join(app.getPath('desktop'), name), path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', name), path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', name)];
    for (const l of spots) { try { if (fs.existsSync(l)) shell.writeShortcutLink(l, 'update', { icon: ico, iconIndex: 0 }); } catch (e) {} }
  } catch (e) {}
}
async function refreshIcon(win) {
  refreshShortcuts();
  try {
    const r = await net.fetch(WORKER + '/v1/shell/icon.png?t=' + Date.now(), { cache: 'no-store', headers: gatedHeaders() });
    if (!r.ok) return; const b = Buffer.from(await r.arrayBuffer()); if (b.length < 1000) return;
    let same = false; try { same = fs.existsSync(dlIcon()) && fs.readFileSync(dlIcon()).equals(b); } catch (e) {}
    if (!same) { fs.writeFileSync(dlIcon(), b); if (win && !win.isDestroyed()) win.setIcon(dlIcon()); }
  } catch (e) {}
}
function themeColors() {
  let t = 'auto'; try { t = JSON.parse(fs.readFileSync(kbFile(), 'utf8')).settings.theme || 'auto'; } catch (e) {}
  const dark = t === 'dark' || (t !== 'light' && nativeTheme.shouldUseDarkColors);
  return dark ? { bg: '#0A0F15', fg: '#93A1B3' } : { bg: '#E9E6DC', fg: '#62605A' };
}
function createWindow() {
  Menu.setApplicationMenu(null);
  const tc = themeColors();
  const win = mainWin = new BrowserWindow({
    width: 1360, height: 900, minWidth: 720, minHeight: 560,
    title: 'Анализатор логов Majestic',
    autoHideMenuBar: true, icon: iconPath(), backgroundColor: tc.bg, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('render-process-gone', () => rollbackPage());
  win.webContents.on('did-fail-load', (e, code, d, u, main) => { if (main && code !== -3 && /index/.test(String(u))) rollbackPage(); });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;background:' + tc.bg + ';color:' + tc.fg + ';font:15px system-ui,Segoe UI,sans-serif;display:grid;place-items:center;height:100vh">Загрузка…</body>'));
  setTimeout(() => { try { if (!win.isDestroyed() && !win.isVisible()) win.show(); } catch (e) {} }, 3000);
  refreshIcon(win);
  checkAccess().then((r) => { if (r.ok) guardedLoad(win); else win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lockPage(r))); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

const kbFile = () => path.join(app.getPath('userData'), 'knowledge-base.json');
ipcMain.on('kb-load', (e) => { try { e.returnValue = fs.readFileSync(kbFile(), 'utf8'); } catch (err) { e.returnValue = ''; } });
ipcMain.on('kb-save', (e, data) => { try { const f = kbFile(), tmp = f + '.tmp'; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, String(data), 'utf8'); fs.renameSync(tmp, f); } catch (err) {} });
ipcMain.on('copy', (e, text) => clipboard.writeText(String(text)));
ipcMain.handle('save', async (e, name, data) => {
  const ext = path.extname(String(name)).slice(1) || 'json';
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return '';
  fs.writeFileSync(r.filePath, data, 'utf8');
  return r.filePath;
});
ipcMain.handle('pdf', async (e, name, html) => {
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return '';
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const buf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
    fs.writeFileSync(r.filePath, buf);
  } finally { w.destroy(); }
  return r.filePath;
});

/* ---- Папка игры и логи на диске ---- */
ipcMain.handle('scan-folder', async (e, start) => {
  const opts = { title: 'Выберите папку GTA V', properties: ['openDirectory'] };
  try { if (start && fs.existsSync(start)) opts.defaultPath = start; } catch (err) {}
  const r = await dialog.showOpenDialog(mainWin, opts);
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() }));
  return { path: dir, entries };
});
const SKIP = /^(mods|cache|gpucache|code cache|node_modules|crashdumps|dawn.*|shader.*|local storage|session storage|indexeddb|service worker)$/i;
function walkLogs(dir, depth, out) {
  if (depth > 4 || out.length > 600) return;
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const d of list) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (!SKIP.test(d.name)) walkLogs(p, depth + 1, out); }
    else if (/^(main|client).*\.log$/i.test(d.name)) { try { const s = fs.statSync(p); out.push({ path: p, name: d.name, size: s.size, mtime: s.mtimeMs }); } catch (e) {} }
  }
}
ipcMain.handle('find-logs', async () => {
  const bases = [path.join(app.getPath('appData'), 'majestic-launcher'), path.join(process.env.LOCALAPPDATA || '', 'MajesticLauncher')];
  const out = []; let dir = bases[0];
  for (const b of bases) { if (b && fs.existsSync(b)) { const n = out.length; walkLogs(b, 0, out); if (out.length > n && dir === bases[0]) dir = b; } }
  out.sort((a, b) => b.mtime - a.mtime);
  return { dir, files: out.slice(0, 60) };
});
ipcMain.handle('read-file', async (e, p) => {
  p = String(p);
  if (!/\.(log|txt)$/i.test(p)) return null;
  const s = fs.statSync(p); if (s.size > 250 * 1048576) return null;
  return fs.readFileSync(p, 'utf8');
});
ipcMain.on('open-path', (e, p) => { try { shell.showItemInFolder(String(p)); } catch (err) {} });

/* ---- Обновление интерфейса без переустановки ---- */
const relaunchSoon = () => setTimeout(() => { app.relaunch(); app.exit(0); }, 900);
ipcMain.handle('update-info', async () => { const p = pickPage(); return { version: p.version, bundled: p.bundledVersion, override: p.override, url: readCfg().url || '' }; });
ipcMain.handle('update-from-file', async () => {
  const r = await dialog.showOpenDialog(mainWin, { title: 'Файл обновления (Majestic-Log-Advisor.html)', properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html', 'htm'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const t = fs.readFileSync(r.filePaths[0], 'utf8');
  if (!validPage(t)) return { ok: false, msg: 'Это не файл обновления Majestic Log Advisor.' };
  const cur = pickPage().version, nv = verOf(t);
  if (cmpVer(nv, cur) <= 0) return { ok: false, msg: 'Версия в файле (' + nv + ') не новее запущенной (' + cur + ').' };
  fs.mkdirSync(path.dirname(overrideFile()), { recursive: true }); fs.writeFileSync(overrideFile(), t, 'utf8');
  relaunchSoon();
  return { ok: true, msg: 'Версия ' + nv + ' установлена. Приложение перезапускается…' };
});
ipcMain.handle('update-reset', async () => { try { fs.unlinkSync(overrideFile()); } catch (e) {} relaunchSoon(); return { ok: true, msg: 'Возвращаю встроенную версию. Приложение перезапускается…' }; });
ipcMain.handle('app-relaunch', async () => { relaunchSoon(); return true; });
const shVerOf = (t) => { const x = /SHELL_VERSION\s*=\s*'([^']+)'/.exec(t || ''); return x ? x[1] : ''; };
const shellDir = () => path.join(app.getPath('userData'), 'shell');
const scriptOk = (t) => { try { new (require('vm').Script)(t); return true; } catch (e) { return false; } };
async function shellDownload() {
  const get = async (n) => { const r = await net.fetch(WORKER + '/v1/shell/' + n + '?t=' + Date.now(), { cache: 'no-store', headers: gatedHeaders() }); if (!r.ok) throw new Error(n); return r.text(); };
  try {
    const mt = await get('main.js'), pr = await get('preload.js'), hw = await get('hwid.js');
    if (!scriptOk(mt) || !scriptOk(pr) || !scriptOk(hw) || mt.length < 2000 || cmpVer(shVerOf(mt), SHELL_VERSION) <= 0) return false;
    fs.mkdirSync(shellDir(), { recursive: true });
    fs.writeFileSync(path.join(shellDir(), 'main.js.tmp'), mt); fs.writeFileSync(path.join(shellDir(), 'preload.js.tmp'), pr); fs.writeFileSync(path.join(shellDir(), 'hwid.js'), hw);
    fs.renameSync(path.join(shellDir(), 'preload.js.tmp'), path.join(shellDir(), 'preload.js')); fs.renameSync(path.join(shellDir(), 'main.js.tmp'), path.join(shellDir(), 'main.js'));
    return true;
  } catch (e) { return false; }
}
function shellStaged() { try { const f = path.join(shellDir(), 'main.js'); if (fs.existsSync(f)) { const v = shVerOf(fs.readFileSync(f, 'utf8')); if (v && cmpVer(v, SHELL_VERSION) > 0) return v; } } catch (e) {} return ''; }
ipcMain.handle('shell-pending', async (e, expected) => {
  let v = shellStaged(); if (v) return v;
  if (expected && cmpVer(String(expected), SHELL_VERSION) <= 0) return '';
  await shellDownload(); return shellStaged();
});
ipcMain.handle('app-reload', async () => { try { if (mainWin && !mainWin.isDestroyed()) guardedLoad(mainWin); return true; } catch (e) { return false; } });
ipcMain.handle('update-apply', async () => {
  const r = await doCheck(null, {}); if (r && r.has) { try { guardedLoad(mainWin); } catch (e) {} } return r;
});
async function doCheck(url, opts) {
  const cfg = readCfg();
  if (url !== null && url !== undefined) { cfg.url = String(url).trim(); writeCfg(cfg); }
  if (!cfg.url) return { has: false, msg: 'Ссылка для автообновления не задана.' };
  if (!/^https:\/\//i.test(cfg.url)) return { has: false, msg: 'Ссылка должна начинаться с https://' };
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 10000);
    const res = await net.fetch(cfg.url + (cfg.url.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: ac.signal, cache: 'no-store', headers: cfg.url.startsWith(WORKER) ? gatedHeaders() : {} }); clearTimeout(tm);
    if (!res.ok) return { has: false, msg: 'Сервер ответил кодом ' + res.status + '.' };
    const t = await res.text();
    if (!validPage(t)) return { has: false, msg: 'По ссылке лежит не файл обновления Majestic Log Advisor.' };
    const cur = pickPage().version, nv = verOf(t);
    if (cfg.badVer && nv === cfg.badVer) return { has: false, msg: 'Версия ' + nv + ' не запустилась на этом компьютере и пропущена до выхода следующей.' };
    if (cmpVer(nv, cur) <= 0) return { has: false, msg: 'Обновлений нет: у вас последняя версия (' + cur + ').' };
    if (opts && opts.dry) return { has: true, version: nv, msg: 'Доступна версия ' + nv + '.' };
    fs.mkdirSync(path.dirname(overrideFile()), { recursive: true }); fs.writeFileSync(overrideFile(), t, 'utf8');
    return { has: true, version: nv, msg: 'Версия ' + nv + ' загружена и применится при следующем запуске приложения.' };
  } catch (err) { return { has: false, msg: 'Не удалось проверить обновление: ' + (err && err.message ? err.message : err) }; }
}
ipcMain.handle('update-check', (e, url, opts) => doCheck(url, opts));

/* ---- Доступ по HWID ---- */
const accessCache = () => path.join(app.getPath('userData'), 'access-cache.json');
async function checkAccess() {
  const hwid = getHwid();
  let res = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try { res = await net.fetch(WORKER + '/v1/check?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store', headers: gatedHeaders() }); } finally { clearTimeout(t); }
  } catch (e) { res = null; }
  if (res && res.status === 200) { try { fs.writeFileSync(accessCache(), JSON.stringify({ at: Date.now(), hwid })); } catch (e) {} return { ok: true, hwid }; }
  if (res && (res.status === 403 || res.status === 401)) { try { fs.rmSync(accessCache(), { force: true }); } catch (e) {} return { ok: false, hwid, why: 'Доступ для этого компьютера не выдан.' }; }
  try { const c = JSON.parse(fs.readFileSync(accessCache(), 'utf8')); if (c.hwid === hwid && Date.now() - c.at < 7 * 86400000) return { ok: true, hwid, offline: true }; } catch (e) {}
  return { ok: false, hwid, why: 'Не удалось проверить доступ. Подключитесь к интернету и запустите приложение снова.' };
}
function lockPage(r) {
  const e = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Доступ</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#E9E6DC;color:#1F1E1D;font:15px/1.6 Segoe UI,system-ui,sans-serif}main{max-width:480px;padding:32px;background:#F4F2EC;border:1px solid rgba(31,30,29,.14);border-radius:12px;display:grid;gap:14px}h1{margin:0;font-size:20px}code{display:block;padding:12px;background:#E4E0D5;border-radius:8px;font:600 17px Consolas,monospace;letter-spacing:.04em}button{justify-self:start;padding:8px 16px;border:0;border-radius:8px;background:#2B4FBF;color:#fff;font:inherit;cursor:pointer}p{margin:0;color:#62605A}</style><main><h1>Анализатор логов Majestic</h1><p>' + e(r.why) + '</p><p>Ваш код компьютера. Отправьте его администратору, чтобы получить доступ:</p><code id="c">' + e(r.hwid) + '</code><button onclick="window.nativeApp.copy(document.getElementById(\'c\').textContent);this.textContent=\'Скопировано\'">Скопировать код</button></main></html>';
}
ipcMain.handle('shell-info', async () => ({ version: SHELL_VERSION, hwid: getHwid() }));
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

/* ---- Автозагрузка новых логов и загрузка по ссылке ---- */
let watcher = null;
const pending = new Map();
function stopWatch() { if (watcher) { try { watcher.close(); } catch (e) {} watcher = null; } pending.forEach((t) => clearTimeout(t)); pending.clear(); }
function startWatch(dir) {
  stopWatch();
  if (!dir || !fs.existsSync(dir)) return false;
  try {
    watcher = fs.watch(dir, (evt, name) => {
      if (!name || !/\.(log|txt)$/i.test(name)) return;
      const full = path.join(dir, name);
      if (pending.has(full)) clearTimeout(pending.get(full));
      pending.set(full, setTimeout(() => {
        pending.delete(full);
        try {
          const s1 = fs.statSync(full);
          setTimeout(() => {
            try {
              const s2 = fs.statSync(full);
              if (s2.size !== s1.size || !s2.size || s2.size > 250 * 1048576) return;
              if (Date.now() - s2.mtimeMs > 120000) return;
              if (mainWin && !mainWin.isDestroyed()) { mainWin.webContents.send('watch-file', { path: full, name, size: s2.size, mtime: s2.mtimeMs }); if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
            } catch (e) {}
          }, 1200);
        } catch (e) {}
      }, 800));
    });
    watcher.on('error', () => {});
    return true;
  } catch (e) { return false; }
}
app.whenReady().then(() => { const c = readCfg(); if (c.watchDir) startWatch(c.watchDir); });

/* ---------- Приёмник для плагина Discord (кнопка «В анализатор» на вложении в тикете) ----------
   Слушает только 127.0.0.1. Запрос должен прийти со страницы Discord или из нативной части плагина и нести ключ из «Настроек».
   Скачивает только вложения с серверов Discord, отдаёт файл интерфейсу, где он разбирается так же, как при перетаскивании. */
const EXT_PORT = 47615, EXT_HOST = /^(cdn\.discordapp\.com|media\.discordapp\.net)$/i, EXT_FILE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i, EXT_ORIGIN = /^https:\/\/((ptb|canary)\.)?discord\.com$/;
let extSrv = null, extPort = 0, extReady = false; const extQ = [], extSeen = new Map();
function extToken(reset) { const c = readCfg(); if (!c.extToken || reset) { c.extToken = require('crypto').randomBytes(16).toString('hex'); writeCfg(c); } return c.extToken; }
function extSame(a, b) { try { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && require('crypto').timingSafeEqual(x, y); } catch (e) { return false; } }
function extDeliver(item) {
  if (!mainWin || mainWin.isDestroyed() || !extReady) { extQ.push(item); return; }
  mainWin.webContents.send('ext-import', item);
  try { if (!mainWin.isFocused()) mainWin.flashFrame(true); } catch (e) {}
}
async function extHandle(req, res) {
  const origin = String(req.headers.origin || ''), okOrigin = EXT_ORIGIN.test(origin), H = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (okOrigin) Object.assign(H, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type, x-mla-token, x-mla-meta', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin' });
  const send = (c, o) => { res.writeHead(c, H); res.end(JSON.stringify(o)); };
  if (origin && !okOrigin) return send(403, { ok: false, error: 'origin' });
  if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
  const p = (req.url || '').split('?')[0];
  if (p === '/v1/ping') return send(200, { ok: true, app: 'majestic-log-advisor', v: SHELL_VERSION });
  if (p === '/v1/upload' && req.method === 'POST') return extUpload(req, res, send);
  if (p === '/v1/pair' && req.method === 'POST') return extPair(req, send);
  if (p !== '/v1/import' || req.method !== 'POST') return send(404, { ok: false });
  if (!extSame(req.headers['x-mla-token'], extToken())) return send(401, { ok: false, error: 'token' });
  let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 16384) return send(413, { ok: false }); }
  let b = {}; try { b = JSON.parse(raw); } catch (e) { return send(400, { ok: false, error: 'json' }); }
  let u; try { u = new URL(String(b.url || '')); } catch (e) { return send(400, { ok: false, error: 'url' }); }
  const name = String(b.name || decodeURIComponent(u.pathname.split('/').pop() || '')).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  if (u.protocol !== 'https:' || !EXT_HOST.test(u.hostname) || !/^\/attachments\//.test(u.pathname)) return send(400, { ok: false, error: 'host' });
  if (!EXT_FILE.test(name)) return send(400, { ok: false, error: 'type' });
  const key = u.pathname, now = Date.now(); for (const [k, t] of extSeen) if (now - t > 8000) extSeen.delete(k);
  if (extSeen.has(key)) return send(200, { ok: true, dup: true });
  try {
    const r = await net.fetch(u.toString(), { redirect: 'follow' });
    if (!r.ok) return send(502, { ok: false, error: 'http ' + r.status });
    if (Number(r.headers.get('content-length') || 0) > 250 * 1048576) return send(413, { ok: false, error: 'size' });
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 250 * 1048576) return send(413, { ok: false, error: 'size' });
    extSeen.set(key, now);
    extDeliver({ name, data: new Uint8Array(buf), size: buf.length, ticket: String(b.ticket || '').slice(0, 100), ticketId: String(b.ticketId || '').replace(/\D/g, '').slice(0, 25), from: String(b.from || '').slice(0, 60), player: extPlayer(b.player) });
    return send(200, { ok: true });
  } catch (e) { return send(502, { ok: false, error: 'download', detail: String(e && e.message || e).slice(0, 120) }); }
}
/* Файл присылает сам плагин: Discord скачивает вложение своей сетью (у приложения доступа к серверам Discord может не быть).
   Тело запроса — сам файл, описание (имя, тикет, игрок) — в заголовке x-mla-meta (JSON в base64). */
async function extUpload(req, res, send) {
  if (!extSame(req.headers['x-mla-token'], extToken())) return send(401, { ok: false, error: 'token' });
  let meta = {}; try { meta = JSON.parse(Buffer.from(String(req.headers['x-mla-meta'] || ''), 'base64').toString('utf8')) || {}; } catch (e) { return send(400, { ok: false, error: 'meta' }); }
  const name = String(meta.name || '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
  if (!EXT_FILE.test(name)) return send(400, { ok: false, error: 'type' });
  const key = String(meta.url || '').replace(/[?#].*$/, '') || ('upload:' + name + ':' + (req.headers['content-length'] || '')), now = Date.now();
  for (const [k, t] of extSeen) if (now - t > 8000) extSeen.delete(k);
  if (extSeen.has(key)) { req.resume(); return send(200, { ok: true, dup: true }); }
  const parts = []; let size = 0;
  for await (const ch of req) { size += ch.length; if (size > 250 * 1048576) return send(413, { ok: false, error: 'size' }); parts.push(ch); }
  if (!size) return send(400, { ok: false, error: 'empty' });
  const buf = Buffer.concat(parts); extSeen.set(key, now);
  extDeliver({ name, data: new Uint8Array(buf), size: buf.length, ticket: String(meta.ticket || '').slice(0, 100), ticketId: String(meta.ticketId || '').replace(/\D/g, '').slice(0, 25), from: String(meta.from || '').slice(0, 60), player: extPlayer(meta.player) });
  return send(200, { ok: true });
}
/* Подключение плагина без ввода ключа: плагин просит, приложение спрашивает пользователя, по «Разрешить» отдаёт ключ.
   Ключ получает только тот, кому разрешили в окне приложения; одна просьба за раз, ждём ответа до 2 минут. */
const extPairs = new Map(); let extPairSeq = 0;
async function extPair(req, send) {
  let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 4096) return send(413, { ok: false }); }
  let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
  if (!mainWin || mainWin.isDestroyed()) return send(503, { ok: false, error: 'window' });
  if (extPairs.size) return send(409, { ok: false, error: 'busy' });
  const id = ++extPairSeq, who = String(b.client || 'Discord').replace(/[^\w .()-]/g, '').slice(0, 40);
  const answer = await new Promise((resolve) => {
    const tm = setTimeout(() => { extPairs.delete(id); resolve(false); }, 120000);
    extPairs.set(id, (ok) => { clearTimeout(tm); extPairs.delete(id); resolve(!!ok); });
    try { mainWin.webContents.send('ext-pair', { id, client: who }); if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); mainWin.flashFrame(true); } catch (e) {}
  });
  return answer ? send(200, { ok: true, token: extToken() }) : send(403, { ok: false, error: 'denied' });
}
ipcMain.on('ext-pair-answer', (e, id, ok) => { const f = extPairs.get(+id); if (f) f(ok); });
function extPlayer(p) { if (!p || typeof p !== 'object') return null; const t = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n), o = { id: t(p.id, 25).replace(/\D/g, ''), name: t(p.name, 64), username: t(p.username, 40), nick: t(p.nick, 48), static: t(p.static, 12).replace(/\D/g, ''), server: t(p.server, 32), link: /^https:\/\/((ptb|canary)\.)?discord\.com\/channels\/[\d/]+$/.test(String(p.link || '')) ? String(p.link) : '' }; return Object.values(o).some(Boolean) ? o : null; }
function extStart() {
  const http = require('http'); let port = EXT_PORT;
  const go = () => { const s = http.createServer((q, r) => { extHandle(q, r).catch(() => { try { r.writeHead(500); r.end(); } catch (e) {} }); }); s.on('error', (e) => { if (e.code === 'EADDRINUSE' && port < EXT_PORT + 4) { port++; go(); } }); s.listen(port, '127.0.0.1', () => { extSrv = s; extPort = port; }); };
  go();
}
app.whenReady().then(extStart);
ipcMain.handle('ext-info', () => ({ on: !!extSrv, port: extPort, token: extToken() }));
ipcMain.handle('ext-reset', () => ({ on: !!extSrv, port: extPort, token: extToken(true) }));
ipcMain.on('ext-ready', () => { extReady = true; while (extQ.length) extDeliver(extQ.shift()); });
ipcMain.handle('watch-info', async () => ({ dir: readCfg().watchDir || '', downloads: app.getPath('downloads') }));
ipcMain.handle('watch-set', async (e, mode) => {
  const cfg = readCfg(); let dir = '';
  if (mode === 'downloads') dir = app.getPath('downloads');
  else if (mode === 'pick') { const r = await dialog.showOpenDialog(mainWin, { title: 'Папка для автозагрузки логов', properties: ['openDirectory'] }); if (r.canceled || !r.filePaths[0]) return { dir: cfg.watchDir || '' }; dir = r.filePaths[0]; }
  if (dir && startWatch(dir)) cfg.watchDir = dir; else { stopWatch(); cfg.watchDir = ''; }
  writeCfg(cfg); return { dir: cfg.watchDir };
});
ipcMain.handle('fetch-url', async (e, url) => {
  url = String(url || '').trim();
  if (!/^https:\/\//i.test(url)) return { error: 'Нужна ссылка https://' };
  try {
    const res = await net.fetch(url, { redirect: 'follow' });
    if (!res.ok) return { error: 'Сервер ответил кодом ' + res.status };
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 250 * 1048576) return { error: 'Файл больше 250 МБ' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 250 * 1048576) return { error: 'Файл больше 250 МБ' };
    let name = decodeURIComponent((new URL(res.url || url).pathname.split('/').pop() || '')) || 'link.log';
    const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get('content-disposition') || ''); if (cd) { try { name = decodeURIComponent(cd[1]); } catch (er) { name = cd[1]; } }
    if (!/\.(log|txt)$/i.test(name)) name += '.log';
    const text = buf.toString('utf8');
    if (text.indexOf('\u0000') >= 0) return { error: 'Это не текстовый лог' };
    return { name, size: buf.length, text };
  } catch (err) { return { error: 'Не удалось скачать: ' + (err && err.message || err) }; }
});

ipcMain.handle('gated-fetch', async (e, p, opts) => {
  p = String(p || '');
  if (!/^\/v1\/[a-z0-9\/._-]+$/i.test(p)) return null;
  opts = opts || {};
  const q = opts.query && typeof opts.query === 'object' ? '&' + Object.keys(opts.query).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(opts.query[k]).slice(0, 200))).join('&') : '';
  const init = { cache: 'no-store', headers: gatedHeaders() };
  if (opts.body != null) { init.method = 'POST'; init.body = JSON.stringify(opts.body); if (init.body.length > 4500000) return null; init.headers = Object.assign({}, init.headers, { 'content-type': 'application/json' }); }
  try { const r = await net.fetch(WORKER + p + '?t=' + Date.now() + q, init); return r.ok ? await r.text() : null; } catch (err) { return null; }
});

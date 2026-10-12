#!/usr/bin/env node
/*
 * Majestic Plugin Installer — установка и обновление своих плагинов для Vencord и BetterDiscord.
 * Список плагинов берётся из репозитория (plugins/manifest.json), поэтому новые плагины ставятся без новой версии установщика.
 * Чужие плагины не трогаются: в Vencord обновляются только папки из списка (с резервной копией src/userplugins),
 * в BetterDiscord — только файлы из списка. Собирается в .exe через GitHub Actions (.github/workflows/plugins.yml).
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), https = require('https'), cp = require('child_process'), readline = require('readline');

const REPO_RAW = process.env.MPI_RAW || 'https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/';
const VENCORD_GIT = 'https://github.com/Vendicated/Vencord.git';
const WIN = process.platform === 'win32';
const APPDATA = process.env.APPDATA || path.join(os.homedir(), '.config');
const HOME = process.env.MPI_HOME || os.homedir();
const DATA = process.env.MPI_DATA || path.join(APPDATA, 'MajesticPluginInstaller');
const CFG = path.join(DATA, 'config.json');
const VERSION = '1.1.0';
const AUTO = process.argv.includes('--auto');

/* ---------- ввод и вывод ---------- */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = []; let waiter = null;
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
rl.on('close', () => { if (waiter) { const w = waiter; waiter = null; w(''); } });
const ask = (q) => AUTO ? Promise.resolve('') : new Promise((res) => { process.stdout.write(q); if (lines.length) { const l = lines.shift(); process.stdout.write(l + '\n'); res(l); } else waiter = res; });
const say = (t) => console.log(t);
const yes = async (q, def) => { const a = (await ask(q + (def ? ' [Д/н] ' : ' [д/Н] '))).trim().toLowerCase(); return a ? /^(д|да|y|yes)$/.test(a) : !!def; };

/* ---------- настройки ---------- */
const readCfg = () => { try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) { return {}; } };
const writeCfg = (c) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(c, null, 1)); };

/* ---------- сеть ---------- */
function get(url, n) {
  n = n || 0;
  return new Promise((res, rej) => {
    if (process.env.MPI_LOCAL) { try { return res(fs.readFileSync(path.join(process.env.MPI_LOCAL, url.slice(REPO_RAW.length)))); } catch (e) { return rej(new Error('нет файла ' + url)); } }
    https.get(url, { headers: { 'User-Agent': 'MajesticPluginInstaller/' + VERSION, 'Cache-Control': 'no-cache' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) { r.resume(); return res(get(new URL(r.headers.location, url).toString(), n + 1)); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode + ' ' + url)); }
      const ch = []; r.on('data', (c) => ch.push(c)); r.on('end', () => res(Buffer.concat(ch)));
    }).on('error', rej);
  });
}

/* ---------- команды ---------- */
function run(cmd, args, opt) {
  opt = opt || {};
  say('  > ' + cmd + ' ' + args.join(' '));
  /* на Windows команды идут через cmd.exe: аргументы с пробелами (пути вроде C:\\Users\\Имя Фамилия) берём в кавычки */
  const a2 = WIN ? args.map((x) => /[\s"&|<>^]/.test(x) ? '"' + String(x).replace(/"/g, '\\"') + '"' : x) : args;
  const r = cp.spawnSync(cmd, a2, { cwd: opt.cwd, stdio: opt.quiet ? 'pipe' : 'inherit', shell: WIN, env: Object.assign({}, process.env, opt.env || {}) });
  return r.status === 0;
}
function has(cmd, args) { const r = cp.spawnSync(cmd, args || ['--version'], { stdio: 'pipe', shell: WIN }); return r.status === 0 ? String(r.stdout || '').trim() : ''; }

/* ---------- файлы ---------- */
const exists = (p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } };
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { const s = path.join(a, e.name), d = path.join(b, e.name); if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } }
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
function isVencord(dir) { try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); return /vencord/i.test(p.name || '') && exists(path.join(dir, 'src', 'plugins')); } catch (e) { return false; } }

async function manifest() {
  try { const m = JSON.parse((await get(REPO_RAW + 'plugins/manifest.json')).toString('utf8')); if (m && m.v === 1 && Array.isArray(m.plugins)) return m; throw new Error('формат'); }
  catch (e) { say('Не удалось получить список плагинов: ' + e.message); return null; }
}

/* ---------- Vencord ---------- */
async function checkTools() {
  const git = has('git'), node = has('node', ['-v']), nodeMajor = parseInt((node.match(/v(\d+)/) || [])[1] || '0', 10);
  let pnpm = has('pnpm', ['-v']);
  if (!git || nodeMajor < 22) {
    say('\nДля сборки Vencord нужны Git и Node.js 22 или новее.' + (!git ? '\n  Git не найден.' : '') + (nodeMajor < 22 ? '\n  Node.js ' + (node || 'не найден') + ', нужна версия 22+.' : ''));
    if (WIN && !AUTO && await yes('Установить недостающее через winget (встроенный установщик Windows)?', true)) {
      if (!git) run('winget', ['install', '--id', 'Git.Git', '-e', '--accept-source-agreements', '--accept-package-agreements']);
      if (nodeMajor < 22) run('winget', ['install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--accept-source-agreements', '--accept-package-agreements']);
      say('Готово. Закройте это окно и запустите установщик заново, чтобы Windows подхватила новые программы.');
    } else say('Установите Git (https://git-scm.com) и Node.js LTS (https://nodejs.org), затем запустите установщик снова.');
    return false;
  }
  if (!pnpm && AUTO) { say('pnpm не найден: автообновление Vencord пропущено, запустите установщик вручную.'); return false; }
  if (!pnpm) { say('\npnpm не найден, ставлю через npm…'); run('npm', ['install', '-g', 'pnpm']); pnpm = has('pnpm', ['-v']); if (!pnpm) { say('Не удалось поставить pnpm. Выполните «npm install -g pnpm» и запустите установщик снова.'); return false; } }
  return true;
}
async function findVencord(cfg) {
  const cands = [cfg.vencordDir, path.join(HOME, 'Vencord'), path.join(HOME, 'Documents', 'Vencord'), path.join(HOME, 'Desktop', 'Vencord'), path.join(HOME, 'Downloads', 'Vencord'), WIN ? 'C:\\Vencord' : '', WIN ? 'D:\\Vencord' : ''].filter(Boolean);
  for (const c of cands) if (isVencord(c)) { if (await yes('Найдена папка Vencord: ' + c + '. Использовать её?', true)) return c; break; }
  const typed = (await ask('Путь к папке с исходниками Vencord (Enter — скачать новую в ' + path.join(HOME, 'Vencord') + '): ')).trim().replace(/^"|"$/g, '');
  if (typed) { if (isVencord(typed)) return typed; say('В этой папке нет исходников Vencord.'); return null; }
  const dir = path.join(HOME, 'Vencord');
  if (exists(dir) && fs.readdirSync(dir).length) { say('Папка ' + dir + ' уже есть и не похожа на Vencord. Укажите путь вручную.'); return null; }
  say('\nСкачиваю исходники Vencord…');
  return run('git', ['clone', '--depth', '1', VENCORD_GIT, dir]) ? dir : null;
}
function backupUserplugins(vdir) {
  const up = path.join(vdir, 'src', 'userplugins'), dst = path.join(DATA, 'backup', stamp());
  if (!exists(up)) return null;
  copyDir(up, dst); return dst;
}
async function putVencordPlugin(vdir, p, localDir) {
  const dst = path.join(vdir, 'src', 'userplugins', localDir ? path.basename(localDir) : p.vencord.dir);
  const tmp = dst + '.mpi-new'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  if (localDir) copyDir(localDir, tmp);
  else for (const f of p.vencord.files) fs.writeFileSync(path.join(tmp, f), await get(REPO_RAW + p.vencord.path + '/' + f));
  fs.rmSync(dst, { recursive: true, force: true }); fs.renameSync(tmp, dst);
  return dst;
}
function build(vdir) { return (run('pnpm', ['install', '--frozen-lockfile'], { cwd: vdir }) || run('pnpm', ['install'], { cwd: vdir })) && run('pnpm', ['build'], { cwd: vdir }); }
async function vencordFlow(list, localDir, opts) {
  opts = opts || {};
  const cfg = readCfg();
  if (!await checkTools()) return false;
  const vdir = opts.auto ? (isVencord(cfg.vencordDir || '') ? cfg.vencordDir : null) : await findVencord(cfg); if (!vdir) return false;
  cfg.vencordDir = vdir; writeCfg(cfg);
  say('\nОбновляю исходники Vencord…');
  if (!run('git', ['pull', '--ff-only'], { cwd: vdir })) say('  Обновить не вышло (в папке есть свои изменения). Продолжаю с текущей версией.');
  const up = path.join(vdir, 'src', 'userplugins'); fs.mkdirSync(up, { recursive: true });
  const before = fs.readdirSync(up).filter((x) => !/\.mpi-new$/.test(x));
  const bk = backupUserplugins(vdir); if (bk) say('Резервная копия ваших плагинов: ' + bk);
  const mine = [];
  if (localDir) mine.push(path.basename(await putVencordPlugin(vdir, null, localDir)));
  for (const p of list) { mine.push(path.basename(await putVencordPlugin(vdir, p))); say('  ✓ ' + p.title + ' ' + p.version); }
  const others = before.filter((x) => mine.indexOf(x) < 0); if (others.length) say('Ваши другие плагины остаются на месте: ' + others.join(', '));
  say('\nСобираю Vencord (первый раз это занимает пару минут)…');
  if (!build(vdir)) {
    say('\nСборка не удалась. Возвращаю плагины из резервной копии и собираю как было…');
    if (bk) { fs.rmSync(up, { recursive: true, force: true }); copyDir(bk, up); } else for (const m of mine) fs.rmSync(path.join(up, m), { recursive: true, force: true });
    build(vdir); say('Плагины возвращены. Пришлите текст ошибки выше разработчику.'); return false;
  }
  cfg.installed = cfg.installed || {}; list.forEach((p) => { cfg.installed[p.id] = Object.assign(cfg.installed[p.id] || {}, { vencord: p.version, at: Date.now() }); }); writeCfg(cfg);
  if (opts.auto) { say('Обновлено. Новая версия заработает после перезапуска Discord.'); return true; }
  say('\nВнедряю Vencord в Discord. Если спросит, выберите вашу версию Discord.');
  if (!run('pnpm', ['inject', '--branch', 'auto'], { cwd: vdir })) run('pnpm', ['inject'], { cwd: vdir });
  say('\nГотово. Полностью перезапустите Discord (закройте из трея), затем включите плагин в «Настройки» → «Vencord» → «Плагины».');
  return true;
}

/* ---------- BetterDiscord ---------- */
async function bdFlow(list) {
  const dir = process.env.MPI_BD || path.join(APPDATA, 'BetterDiscord', 'plugins');
  if (!exists(dir)) { say('Папка плагинов BetterDiscord не найдена (' + dir + '). Установите BetterDiscord: https://betterdiscord.app'); return; }
  const cfg = readCfg(); cfg.installed = cfg.installed || {};
  for (const p of list) {
    for (const f of p.betterdiscord.files) fs.writeFileSync(path.join(dir, f), await get(REPO_RAW + p.betterdiscord.path + '/' + f));
    cfg.installed[p.id] = Object.assign(cfg.installed[p.id] || {}, { bd: p.version, at: Date.now() }); say('  ✓ ' + p.title + ' ' + p.version);
  }
  writeCfg(cfg);
  say('\nГотово. BetterDiscord подхватит плагин сам; если нет — «Настройки» → «Плагины», включите его.');
}

/* ---------- автообновление ----------
   «--auto»: без вопросов обновляет уже установленные плагины, если в репозитории вышла новая версия.
   Запускается при входе в Windows через раздел автозапуска текущего пользователя (без прав администратора). */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', RUN_NAME = 'MajesticPluginInstaller';
/* Для автозапуска установщик копирует себя в свою папку данных: запуск не сломается, если исходный .exe удалят из «Загрузок» */
function selfPath() {
  if (!process.pkg) return process.execPath + '" "' + path.resolve(process.argv[1] || __filename);
  const dst = path.join(DATA, 'Majestic-Plugin-Installer.exe');
  try { if (path.resolve(process.execPath).toLowerCase() !== dst.toLowerCase()) { fs.mkdirSync(DATA, { recursive: true }); fs.copyFileSync(process.execPath, dst); } return dst; } catch (e) { return process.execPath; }
}
function autoCmd() { return 'cmd /c start "" /min "' + selfPath() + '" --auto'; }
function autostartOn() { if (process.env.MPI_AUTOSTART) return exists(process.env.MPI_AUTOSTART); if (!WIN) return false; return cp.spawnSync('reg', ['query', RUN_KEY, '/v', RUN_NAME], { stdio: 'pipe' }).status === 0; }
function setAutostart(on) {
  if (process.env.MPI_AUTOSTART) { if (on) fs.writeFileSync(process.env.MPI_AUTOSTART, autoCmd()); else fs.rmSync(process.env.MPI_AUTOSTART, { force: true }); return true; }
  if (!WIN) return false;
  const r = on ? cp.spawnSync('reg', ['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', autoCmd(), '/f'], { stdio: 'pipe' }) : cp.spawnSync('reg', ['delete', RUN_KEY, '/v', RUN_NAME, '/f'], { stdio: 'pipe' });
  return r.status === 0;
}
async function autoUpdate(m) {
  const cfg = readCfg(), inst = cfg.installed || {}, newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b || '0').split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
  const bd = m.plugins.filter((p) => p.betterdiscord && inst[p.id] && inst[p.id].bd && newer(p.version, inst[p.id].bd));
  const vc = m.plugins.filter((p) => p.vencord && inst[p.id] && inst[p.id].vencord && newer(p.version, inst[p.id].vencord));
  if (!bd.length && !vc.length) { say('Обновлений нет.'); return; }
  if (bd.length) await bdFlow(bd);
  if (vc.length) await vencordFlow(vc, null, { auto: true });
}

/* ---------- меню ---------- */
async function pick(m, field) {
  const list = m.plugins.filter((p) => p[field]); const inst = readCfg().installed || {};
  say(''); list.forEach((p, i) => { const cur = inst[p.id] && inst[p.id][field === 'vencord' ? 'vencord' : 'bd']; say('  ' + (i + 1) + ') ' + p.title + ' — ' + p.version + (cur ? (cur === p.version ? ' (установлен)' : ' (у вас ' + cur + ', есть обновление)') : '')); });
  const a = (await ask('Какие поставить или обновить? Номера через запятую, Enter — все: ')).trim();
  if (!a) return list;
  return a.split(/[ ,]+/).map((x) => list[parseInt(x, 10) - 1]).filter(Boolean);
}
async function main() {
  say('Majestic Plugin Installer ' + VERSION + '\nСтавит и обновляет плагины для Vencord и BetterDiscord. Ваши другие плагины не трогает.\n');
  const m = await manifest(); if (!m) { await ask('\nНажмите Enter, чтобы закрыть.'); return rl.close(); }
  if (AUTO) { try { await autoUpdate(m); } catch (e) { say('Ошибка: ' + (e && e.message || e)); } return rl.close(); }
  for (;;) {
    const au = autostartOn();
    say('\n1) Vencord: установить или обновить плагины\n2) BetterDiscord: установить или обновить плагины\n3) Vencord: добавить свой плагин из папки\n4) Автообновление при входе в Windows: ' + (au ? 'включено — выключить' : 'выключено — включить') + '\n0) Выход');
    const c = (await ask('Выберите: ')).trim();
    try {
      if (c === '1') { const l = await pick(m, 'vencord'); if (l.length) await vencordFlow(l); }
      else if (c === '2') { const l = await pick(m, 'betterdiscord'); if (l.length) await bdFlow(l); }
      else if (c === '3') { const d = (await ask('Путь к папке плагина (в ней index.ts или index.tsx): ')).trim().replace(/^"|"$/g, ''); if (d && (exists(path.join(d, 'index.ts')) || exists(path.join(d, 'index.tsx')))) await vencordFlow([], d); else say('В папке нет index.ts или index.tsx.'); }
      else if (c === '4') { const ok = setAutostart(!au); say(ok ? (!au ? 'Автообновление включено: при входе в Windows установщик тихо проверит новые версии ваших плагинов и поставит их. Другие плагины не трогает.' : 'Автообновление выключено.') : 'Не удалось изменить автозапуск.'); }
      else if (c === '0' || c === '') break;
    } catch (e) { say('\nОшибка: ' + (e && e.message || e)); }
  }
  rl.close();
}
if (require.main === module) main();
module.exports = { isVencord, putVencordPlugin, backupUserplugins, autoCmd };

// Установщик плагинов: Vencord (чужие плагины на месте, резервная копия, сборка, внедрение), BetterDiscord, откат при упавшей сборке.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), INST = path.join(ROOT, 'plugins', 'installer', 'installer.js');
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
function sandbox() {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-')), bin = path.join(t, 'bin'), home = path.join(t, 'home'), data = path.join(t, 'data'), bd = path.join(t, 'bd');
  [bin, home, data, bd].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\ncase "$1" in --version) echo "git version 2.45";; clone) mkdir -p "$5/src/plugins" && echo \'{"name":"vencord"}\' > "$5/package.json";; pull) exit 0;; esac\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\ncase "$1" in -v) echo 11.9.0;; install) exit 0;; build) if [ -n "$FAKE_BUILD_FAIL" ] && [ -d src/userplugins/majesticLogImport ]; then exit 1; fi; echo built > dist.txt;; inject) echo "$@" > injected.txt;; esac\n', { mode: 0o755 });
  return { t, bin, home, data, bd };
}
function runInst(sb, input, env) {
  return cp.spawnSync(process.execPath, [INST], { input, encoding: 'utf8', env: Object.assign({}, process.env, { PATH: sb.bin + ':' + process.env.PATH, MPI_HOME: sb.home, MPI_DATA: sb.data, MPI_BD: sb.bd, MPI_LOCAL: ROOT, APPDATA: sb.data }, env || {}) });
}
/* 1. Vencord: в папке уже есть чужой плагин */
{
  const sb = sandbox(), v = path.join(sb.home, 'Vencord');
  fs.mkdirSync(path.join(v, 'src', 'plugins'), { recursive: true }); fs.writeFileSync(path.join(v, 'package.json'), '{"name":"vencord"}');
  fs.mkdirSync(path.join(v, 'src', 'userplugins', 'supportKick'), { recursive: true }); fs.writeFileSync(path.join(v, 'src', 'userplugins', 'supportKick', 'index.ts'), 'kick');
  const r = runInst(sb, '1\n\nд\n0\n');
  const up = path.join(v, 'src', 'userplugins');
  ok(fs.readFileSync(path.join(up, 'supportKick', 'index.ts'), 'utf8') === 'kick', 'Vencord: чужой плагин SupportKick не тронут');
  ok(['index.tsx', 'native.ts'].every((f) => fs.readFileSync(path.join(up, 'majesticLogImport', f), 'utf8') === fs.readFileSync(path.join(ROOT, 'plugins', 'vencord', 'majesticLogImport', f), 'utf8')), 'Vencord: плагин скопирован из репозитория');
  const bk = path.join(sb.data, 'backup'); ok(fs.existsSync(bk) && fs.readdirSync(bk).length === 1 && fs.existsSync(path.join(bk, fs.readdirSync(bk)[0], 'supportKick', 'index.ts')), 'Vencord: резервная копия userplugins сделана');
  ok(fs.existsSync(path.join(v, 'dist.txt')) && /--branch auto/.test(fs.readFileSync(path.join(v, 'injected.txt'), 'utf8')), 'Vencord: собрано и внедрено');
  ok(JSON.parse(fs.readFileSync(path.join(sb.data, 'config.json'), 'utf8')).installed.majesticLogImport.vencord === '1.0.0', 'Vencord: версия записана, при повторном запуске видно «установлен»');
  ok(/остаются на месте: supportKick/.test(r.stdout), 'Vencord: установщик сообщает, что чужие плагины на месте');
  const r2 = runInst(sb, '1\n0\n'); ok(/\(установлен\)/.test(r2.stdout), 'повторный запуск показывает установленную версию');
}
/* 2. BetterDiscord */
{
  const sb = sandbox(); fs.writeFileSync(path.join(sb.bd, 'SupportTemplates.plugin.js'), 'tpl');
  runInst(sb, '2\n\n0\n');
  ok(fs.readFileSync(path.join(sb.bd, 'SupportTemplates.plugin.js'), 'utf8') === 'tpl', 'BetterDiscord: чужой плагин не тронут');
  ok(fs.readFileSync(path.join(sb.bd, 'MajesticLogImport.plugin.js'), 'utf8') === fs.readFileSync(path.join(ROOT, 'plugins', 'betterdiscord', 'MajesticLogImport.plugin.js'), 'utf8'), 'BetterDiscord: плагин положен в папку плагинов');
}
/* 3. Сборка упала: откат */
{
  const sb = sandbox(), v = path.join(sb.home, 'Vencord');
  fs.mkdirSync(path.join(v, 'src', 'userplugins', 'supportKick'), { recursive: true }); fs.mkdirSync(path.join(v, 'src', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(v, 'package.json'), '{"name":"vencord"}'); fs.writeFileSync(path.join(v, 'src', 'userplugins', 'supportKick', 'index.ts'), 'kick');
  const r = runInst(sb, '1\n\nд\n0\n', { FAKE_BUILD_FAIL: '1' });
  const up = path.join(v, 'src', 'userplugins');
  ok(!fs.existsSync(path.join(up, 'majesticLogImport')) && fs.readFileSync(path.join(up, 'supportKick', 'index.ts'), 'utf8') === 'kick', 'сборка упала: плагины возвращены как было');
  ok(/Плагины возвращены/.test(r.stdout) && !fs.existsSync(path.join(v, 'injected.txt')), 'сборка упала: внедрения нет, пользователь предупреждён');
}
/* 4. Vencord ещё нет: скачивается */
{
  const sb = sandbox(); runInst(sb, '1\n\n\n0\n');
  ok(fs.existsSync(path.join(sb.home, 'Vencord', 'src', 'userplugins', 'majesticLogImport', 'index.tsx')), 'Vencord не найден: скачан и плагин поставлен');
}
process.exit(bad ? 1 : 0);

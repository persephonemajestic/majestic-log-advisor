// Быстрая проверка ядра: кластеризация повторяющихся проблем на синтетических данных
const fs = require('fs'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const LA = new Function(code + '; return typeof LA !== "undefined" ? LA : this.LA;').call({});
const hist = {}; const base = Date.parse('2026-01-01T10:00:00');
for (let i = 0; i < 4; i++) hist['h' + i] = { label: 'main_' + i, kind: 'main', from: '2026-01-01 1' + i + ':00:00', status: 'bad', mods: [], probs: [{ k: 'x', t: 'Проблема', s: 'crit', n: 1 }], added: base };
const r = LA.clusterReports(hist, { min: 3, hours: 6 });
if (r.length !== 1 || r[0].n !== 4) { console.error('FAIL clusterReports', r.length); process.exit(1); }
console.log('OK');

// Синтетический main.log: хронология попыток и главная причина
(function () {
  const L = (t, lvl, msg) => `[2026-10-06 ${t}] [${lvl}] [ (game)              ] ${msg}`;
  const lines = [];
  lines.push(L('10:00:00.000', 'info', 'game.play: zombie process sweep'), L('10:00:05.000', 'info', 'patcher: while game is alive'));
  for (let i = 0; i < 3; i++) {
    lines.push(L('11:0' + i + ':00.000', 'info', 'game.play: zombie process sweep'));
    lines.push(L('11:0' + i + ':10.000', 'error', "game launch failed { reason: 'patcher-error', message: 'The specified module could not be found.' }"));
    lines.push(L('11:0' + i + ':11.000', 'error', 'patcher: Error: The specified module could not be found. majestic-patcher.node'));
  }
  const sc = LA.scan(LA.parse(lines.join('\n'), 'main.log'));
  const txt = sc.verdict.lines.join('\n');
  const bad = [];
  if (sc.verdict.status !== 'bad') bad.push('status ' + sc.verdict.status);
  if (!sc.root || sc.root.id !== 'install') bad.push('root ' + (sc.root && sc.root.id));
  if (!/Последние 3 попытки подряд/.test(txt)) bad.push('tail line');
  if (!/Сначала игра запускалась/.test(txt)) bad.push('first-ok line');
  if (bad.length) { console.error('FAIL synthetic main.log:', bad.join(', ')); process.exit(1); }
  console.log('OK synthetic');
})();

// Дело: хронология и итог по нескольким логам
(function () {
  const mk = (name, text) => { const parsed = LA.parse(text, name); return { label: name, name, mtime: 0, parsed, sc: LA.scan(parsed) }; };
  const L = (t, lvl, msg) => `[2026-10-06 ${t}] [${lvl}] [ (game)              ] ${msg}`;
  const bad = [L('11:00:00.000', 'info', 'game.play: zombie process sweep'), L('11:00:10.000', 'error', "game launch failed { reason: 'patcher-error', message: 'The specified module could not be found.' }")].join('\n');
  const good = [L('12:00:00.000', 'info', 'game.play: zombie process sweep'), L('12:00:05.000', 'info', 'patcher: while game is alive')].join('\n');
  const r1 = LA.caseSummary([mk('main_a.log', bad)]);
  const r2 = LA.caseSummary([mk('main_a.log', bad), mk('main_b.log', good)]);
  const errs = [];
  if (r1.status !== 'bad' || !r1.asks.length) errs.push('bad case ' + r1.status);
  if (r2.status !== 'ok' || !/решено/.test(r2.headline)) errs.push('solved case ' + r2.status + ' ' + r2.headline);
  if (!r2.delta || r2.delta[0].gone.length < 1) errs.push('delta');
  if (r2.timeline.length < 2 || r2.timeline[0].t > r2.timeline[1].t) errs.push('timeline order');
  if (errs.length) { console.error('FAIL caseSummary:', errs.join(', ')); process.exit(1); }
  console.log('OK caseSummary');
})();
(function () {
  const cl = ['[05:32:01.524] Majestic Multiplayer inited', '[05:32:12.404][hooks] GPU: NVIDIA GeForce GTX 1050', '[05:32:12.404][hooks] Dedicated VRAM: 1 GB', '[05:32:13.967][hooks] Game path: C:\\Users\\Иван\\OneDrive\\GTA V', '[05:32:14.000][hooks] Game version: 3337 on Social Club', '[05:32:20.000][error] ERR_FIL_PACK_3 happened'].join('\n');
  const e = LA.scan(LA.parse(cl, 'client_2026-10-06_05-30-00.log')).env, errs = [];
  if (!e || e.gpu !== 'NVIDIA GeForce GTX 1050' || e.vram !== 1 || e.gameVer !== '3337' || e.platformRu !== 'Social Club') errs.push('env fields ' + JSON.stringify(e));
  else if (e.hints.length < 3) errs.push('env hints ' + e.hints.length);
  if (errs.length) { console.error('FAIL envClient:', errs.join(', ')); process.exit(1); }
  console.log('OK envClient');
})();
(function () {
  const m = LA.mask('a@b.ru C:\\Users\\Ivan\\x ip 185.12.40.7 ver 10.0.19045.1 local 127.0.0.1');
  if (/Ivan|a@b|185\.12/.test(m) || !/10\.0\.19045\.1/.test(m) || !/127\.0\.0\.1/.test(m)) { console.error('FAIL mask:', m); process.exit(1); }
  console.log('OK mask');
})();
(function () {
  const ok = ['[09:10:13] [info] MAJESTIC: Is running as administrator: true', '[09:10:13] [info] MAJESTIC: Launcher location: C:\\Users\\x\\AppData\\Local\\MajesticLauncher\\Majestic Launcher.exe', '[09:10:13] [info] MAJESTIC: Deleting pirate files', '[09:10:20] [info] MAJESTIC: GTA backup file location: C:\\b\\GTA5.exe', '[09:10:38] [info] MAJESTIC: Launcher patch completed', '[09:10:38] [info] MAJESTIC: Injecting Majestic Multiplayer client', '[09:10:47] [info] MAJESTIC: Injected DLL successfully', '[09:10:47] [info] MAJESTIC: Connect address is: api.x.net:443/join/orlando. Using password: NO', '[09:10:47] [info] MAJESTIC: Calling the entrypoint', '[09:10:49] [info] MAJESTIC: Injection finished'];
  const a = LA.scan(LA.parse(ok.join('\n'), 'majestic-patcher.log')), b = LA.scan(LA.parse(ok.slice(0, 6).join('\n'), 'majestic-patcher.log')), errs = [];
  if (a.kindName !== 'patcher' || a.verdict.status !== 'ok') errs.push('ok ' + a.verdict.status);
  if (b.verdict.status !== 'bad' || !/внедрить/.test(b.verdict.headline)) errs.push('stop ' + b.verdict.headline);
  if (errs.length) { console.error('FAIL patcher:', errs.join(', ')); process.exit(1); }
  console.log('OK patcher');
})();

// Очистка логов: шум удаляется, сигнатуры краша остаются
(function () {
  const LC = require('../src/utils/logCleaner.js');
  const t = [
    '[10:00:00.000] Logger initialized',
    '[10:00:01.000] Mounting resource 44e51d1e6dfd83c5', '[10:00:01.001] Mounted resource 44e51d1e6dfd83c5',
    '[10:00:02.000][Error][hooks] ERR_SYS_FILELOAD, Missing rpf: dlc_x:/x64/a.rpf 0', '[10:00:02.001] Callstack:', '[10:00:02.002] --  0x7fffb906d0af', '[10:00:02.003] --  0x7fffb906cda0',
    '[10:00:03.000] Real line after stack',
    '[2026-08-26 16:26:16.980] [debug] [ (downloads) ] download: cache-hit skip { file: \'a.resource\' }'
  ];
  for (let i = 0; i < 50; i++) t.push('[10:01:' + String(i).padStart(2, '0') + '.000][Error] Cannot destroy NetworkObject');
  for (let i = 0; i < 60; i++) t.push('[10:02:00.' + String(i).padStart(3, '0') + '] filler line ' + i + ' unique' + (i % 7));
  t.push('[10:03:00.000][hooks] MINIDUMP: Temporary dump saved', '[10:03:00.100][hooks] Last loaded asset: a.ydr b.ytd', '[10:03:01.000] Shutting down');
  const r = LC.clean(t.join('\n'));
  const bad = [];
  if (/Mounting resource|Mounted resource|cache-hit skip|ERR_SYS_FILELOAD|Callstack|0x7fffb906/.test(r.text)) bad.push('шум не удалён');
  if (!/Real line after stack/.test(r.text)) bad.push('съели лишнее после стека');
  if (!/\[Cannot destroy NetworkObject ×50\]/.test(r.text) || (r.text.match(/Cannot destroy/g) || []).length !== 1) bad.push('NetworkObject не свёрнут');
  if (!/Last loaded asset: a\.ydr/.test(r.text) || !/MINIDUMP/.test(r.text)) bad.push('сигнатуры краша потеряны');
  if (r.trigger.kind !== 'MINIDUMP') bad.push('точка смерти ' + r.trigger.kind);
  if (r.death.length > 41 || !/MINIDUMP/.test(r.death[r.death.length - 1])) bad.push('блок смерти ' + r.death.length);
  if (r.stats.removed['ERR_SYS_FILELOAD'] !== 1 || r.stats.removed['Callstack после FILELOAD'] !== 3) bad.push('статистика удаления ' + JSON.stringify(r.stats.removed));
  if (bad.length) { console.error('FAIL logCleaner:', bad.join(', ')); process.exit(1); }
  console.log('OK logCleaner');
})();

// Правила abort / WebGL / verifier
(function () {
  const vm = require('vm'), fs = require('fs'), ctx = { console }; ctx.root = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/../src/core.js', 'utf8'), ctx);
  const LA = vm.runInContext('LA', ctx), ids = t => LA.scan(LA.parse(t, 'client.log')).findings.map(f => f.id || (f.rule && f.rule.id));
  const t = '[10:00:00.100][hooks] Setting siren sound set 0x1\n[10:00:01.000][Critical] abort() called — draining log queue\n[10:00:02.000][Warning][web] view 1x1: http://ui:1:WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost\n';
  const r = ids(t); if (r.indexOf('c-abort') < 0 || r.indexOf('c-webgl-lost') < 0) { console.error('FAIL rules abort/webgl:', r.join()); process.exit(1); }
  const LC = require('../src/utils/logCleaner.js'), c = LC.clean(t); if (c.trigger.kind !== 'abort') { console.error('FAIL cleaner abort trigger:', c.trigger.kind); process.exit(1); }
  console.log('OK rules abort/webgl');
  /* Этап 14: пул движка, окно интерфейса и скрипт перед дампом, main.log без попыток и без итога, находки до успешной попытки */
  {
    const V = (lines, n) => LA.scan(LA.parse(lines.join('\n'), n || 'client.log')), b = ['[18:58:35.840] Logger initialized', '[18:58:39.108] Majestic Multiplayer inited', '[18:59:10.000] Game Started in 31000 ms', '[18:59:20.000] Connected with id 5'];
    const p = V(b.concat(["[19:00:00.000][Error][hooks.pool] Item in pool CPlayerSyncData with hash 0x81b3ac65 can't be allocated. Pool is full", '[19:00:01.000] MINIDUMP: Temporary dump saved to x']));
    if (!/пул движка \(CPlayerSyncData\)/.test(p.verdict.headline) || !p.keyed.get('c-pool:CPlayerSyncData')) { console.error('FAIL pool full', p.verdict.headline); process.exit(1); }
    const n = V(b.concat(['[19:00:00.000][Warning] CObjectSyncData pool 1 is full, increasing pool size']));
    if (n.keyed.get('c-pool:CObjectSyncData') || n.verdict.status !== 'ok') { console.error('FAIL pool noise', n.verdict.headline); process.exit(1); }
    const c = V(b.slice(0, 2).concat(['[19:00:00.000][web] Add view store entry { Impl: 1x0, View: 2x0 }', '[19:00:00.500][web] Removing cef impl from store 1x0', '[19:00:01.000] MINIDUMP: Temporary dump saved to x']));
    if (!c.verdict.lines.some(l => /окно интерфейса/.test(l))) { console.error('FAIL cef before dump', c.verdict.lines); process.exit(1); }
    const j = V(b.slice(0, 3).concat(["[19:00:00.000][Error][js.script] TypeError: Cannot read properties of undefined (reading 'foo')", '[19:00:00.001][Error][js.script]     at tick (internal:shared/timers.js:236:15)', '[19:00:05.000] MINIDUMP: Temporary dump saved to x']));
    if (!j.verdict.lines.some(l => /упал скрипт сервера .*TypeError/.test(l))) { console.error('FAIL js before dump', j.verdict.lines); process.exit(1); }
    const far = V(b.slice(0, 3).concat(["[18:59:30.000][Error][js.script] TypeError: x is undefined", '[19:00:05.000] MINIDUMP: Temporary dump saved to x']));
    if (far.verdict.lines.some(l => /упал скрипт сервера/.test(l))) { console.error('FAIL js far from dump'); process.exit(1); }
    const h = V(b.concat(['[19:00:00.000][Warning] Something else hooked DirectX context']));
    if (!h.keyed.get('c-dxhook')) { console.error('FAIL dx hook'); process.exit(1); }
    const m0 = V(['[2026-07-29 12:00:00.100] [info]  [ (app)               ] launcher started', '[2026-07-29 12:40:00.100] [info]  [ (app)               ] window closed'], 'main.log');
    if (!/«Играть» не нажимали/.test(m0.verdict.headline) || !m0.verdict.lines.some(l => /40 мин/.test(l))) { console.error('FAIL main no attempts', m0.verdict); process.exit(1); }
    const m1 = V(['[2026-07-29 12:00:00.100] [info]  [ (app)               ] launcher started', '[2026-07-29 12:00:01.000] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }', '[2026-07-29 12:00:20.000] [info]  [ (app)               ] something'], 'main.log');
    if (!/лог снят во время запуска/.test(m1.verdict.headline)) { console.error('FAIL main no outcome', m1.verdict.headline); process.exit(1); }
    const sm = fs.readFileSync(__dirname + '/../src/app/60-samples.js', 'utf8'), mm = V([/SAMPLE_MAIN = String\.raw`([\s\S]*?)`/.exec(sm)[1]], 'main.log');
    const bf = mm.findings.filter(g => g.before).map(g => g.rule.id);
    if (mm.verdict.status !== 'ok' || bf.indexOf('m-drm') < 0 || bf.indexOf('m-blockmod') >= 0) { console.error('FAIL before success', bf); process.exit(1); }
    console.log('OK этап 14: пул, перед дампом, main без попыток, до успешной попытки');
    /* Индекс ключевых слов в scan даёт те же правила, что прямой перебор indexOf по каждому слову */
    for (const kind of ['client', 'main']) {
      const words = []; LA.RULES.forEach(r => (Array.isArray(r.kw) ? r.kw : [r.kw]).forEach(k => k && words.push(k)));
      const pfx = kind === 'main' ? '[2026-07-29 12:00:00.000] [info]  [ (game)              ] ' : '[10:00:00.000][Error][web] ';
      const L = []; words.forEach((k, i) => { L.push(pfx + k); L.push(pfx + 'x ' + k + words[(i * 7) % words.length]); L.push(pfx + words[(i * 13) % words.length] + k); });
      const pr = LA.parse(L.join('\n'), kind + '.log'); LA.scan(pr);
      const rules = LA.RULES.filter(r => r.kind === kind && !r.custom); let bad = 0;
      pr.entries.forEach(e => { let want = -1; for (const r of rules) { if (!(Array.isArray(r.kw) ? r.kw : [r.kw]).some(k => e.text.indexOf(k) !== -1)) continue; if (r.nodeIs && e.node !== r.nodeIs) continue; const mm = r.re.exec(e.text); if (!mm) continue; if (r.test && !r.test(mm, e.text, e)) continue; want = r.idx; break; } if (want !== e.rid) bad++; });
      if (bad) { console.error('FAIL индекс ключевых слов', kind, bad); process.exit(1); }
    }
    console.log('OK индекс ключевых слов совпадает с прямым перебором');
    /* Общее правило отказа запуска уступает частным; команда выдачи прав для «нет прав на папку» */
    {
      const ML = (reason, msg) => V(["[2026-07-29 12:00:00.100] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }", "[2026-07-29 12:00:05.100] [warn]  [ (game)              ] game launch failed {", "  serverId: 'ru4',", "  reason: '" + reason + "',", '  message: ' + msg, '}'], 'main.log');
      const ids = (r) => r.findings.map(g => g.rule.id);
      if (ids(ML('patcher-error', "'ERR_GAME_CRASHED'")).indexOf('m-launchfail') >= 0) { console.error('FAIL launchfail перехватил patcher-error'); process.exit(1); }
      const odd = ML('something-new', "'boom'").findings.find(g => g.rule.id === 'm-launchfail');
      if (!odd || !/something-new/.test(odd.title) || /манифест/.test(odd.title)) { console.error('FAIL неизвестная причина', odd && odd.title); process.exit(1); }
      const pm = ML('permissions-failed', '"EPERM: operation not permitted, open \'C:\\\\Users\\\\Ivan\\\\AppData\\\\Local\\\\MajesticLauncher\\\\x.json\'"').findings.find(g => g.rule.id === 'm-perm');
      if (!pm || !pm.permCmd || pm.permCmd[0] !== 'icacls "$env:USERPROFILE\\AppData\\Local\\MajesticLauncher" /grant "*S-1-5-32-545:(OI)(CI)M" /T /C' || !pm.fix.some(x => /icacls/.test(x))) { console.error('FAIL команда прав', pm && pm.permCmd); process.exit(1); }
      if (LA.mask(pm.fix.join(' ')).indexOf('$env:USERPROFILE') < 0) { console.error('FAIL маска портит команду'); process.exit(1); }
      console.log('OK отказ запуска: частные правила; команда выдачи прав');
    }
  }
  const cl = ['[18:58:35.840] Logger initialized', '[18:58:39.108] Majestic Multiplayer inited', '[18:58:40.000] Game Started in 9000 ms', '[18:59:00.000] Connected with id 5', '[19:10:00.000] MINIDUMP: Temporary dump saved to x'].join('\n');
  const sv = LA.scan(LA.parse(cl, 'client.log')).verdict; if (sv.status !== 'warn' || !/упал/.test(sv.headline)) { console.error('FAIL verdict connected+dump:', sv.status, sv.headline); process.exit(1); }
  console.log('OK verdict connected+dump');
})();

// Маска e-mail не портит имена ассетов GTA (anim@dict@name.ycd)
(function () {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8'); const L2 = new Function(code + '; return LA;').call({});
  const m = L2.mask('Last loaded asset: veh@std@rps@base.ycd gestures@m@car@van@casual@ps.ycd; user a.b@mail.ru'), bad = [];
  if (!/veh@std@rps@base\.ycd/.test(m) || !/gestures@m@car@van@casual@ps\.ycd/.test(m)) bad.push('ассет испорчен: ' + m);
  if (/a\.b@mail\.ru/.test(m)) bad.push('e-mail не скрыт');
  if (L2.mask('password=qwerty123') !== 'password=***') bad.push('короткий пароль не скрыт');
  if (L2.mask('C:\\Users\\Ivan Petrov\\GTA') !== 'C:\\Users\\<user>\\GTA') bad.push('имя с пробелом: ' + L2.mask('C:\\Users\\Ivan Petrov\\GTA'));
  if (bad.length) { console.error('FAIL mask asset:', bad.join(', ')); process.exit(1); }
  console.log('OK mask asset');
})();

// Прототип чтения минидампа: синтетический .dmp с исключением 0xC0000005, модулями и стеком
(async function () {
  const SD = require('../src/utils/sysdiag.js');
  const parts = []; const pos = { n: 32 + 3 * 12 };
  const add = (b) => { const o = pos.n; parts.push([o, b]); pos.n += b.length; return o; };
  const u16 = (s) => Buffer.from(s, 'utf16le'), str = (s) => { const b = u16(s), h = Buffer.alloc(4); h.writeUInt32LE(b.length); return Buffer.concat([h, b, Buffer.alloc(2)]); };
  const names = ['C:\\Games\\GTA5.exe', 'C:\\Windows\\System32\\nvwgf2umx.dll'].map(s => add(str(s)));
  const mods = [{ base: 0x7ff600000000n, size: 0x2000000 }, { base: 0x7ffa00000000n, size: 0x1000000 }];
  const mb = Buffer.alloc(4 + 108 * 2); mb.writeUInt32LE(2, 0);
  mods.forEach((m, i) => { const o = 4 + i * 108; mb.writeBigUInt64LE(m.base, o); mb.writeUInt32LE(m.size, o + 8); mb.writeUInt32LE(names[i], o + 20); });
  const modRva = add(mb);
  const ctx = Buffer.alloc(1232); const rsp = 0x00000050f0000010n, rip = 0x7ff600000000n + 0x1234n;
  ctx.writeBigUInt64LE(rip, 0xf8); ctx.writeBigUInt64LE(rsp, 0x98); const ctxRva = add(ctx);
  const stack = Buffer.alloc(256); stack.writeBigUInt64LE(0x7ff600000000n + 0x5678n, 16); stack.writeBigUInt64LE(0x7ffa00000000n + 0x99n, 40); stack.writeBigUInt64LE(0x1234n, 64);
  const stRva = add(stack);
  const tb = Buffer.alloc(4 + 48); tb.writeUInt32LE(1, 0); tb.writeUInt32LE(77, 4); tb.writeBigUInt64LE(0x00000050f0000000n, 28); tb.writeUInt32LE(256, 36); tb.writeUInt32LE(stRva, 40);
  tb.writeUInt32LE(1232, 44); tb.writeUInt32LE(ctxRva, 48);
  const thRva = add(tb);
  const ex = Buffer.alloc(168); ex.writeUInt32LE(77, 0); ex.writeUInt32LE(0xC0000005, 8); ex.writeBigUInt64LE(rip, 24); ex.writeUInt32LE(2, 32);
  ex.writeBigUInt64LE(1n, 40); ex.writeBigUInt64LE(0xdeadbeefn, 48); ex.writeUInt32LE(1232, 160); ex.writeUInt32LE(ctxRva, 164);
  const exRva = add(ex);
  const buf = Buffer.alloc(pos.n); buf.write('MDMP', 0); buf.writeUInt32LE(0xA793, 4); buf.writeUInt32LE(3, 8); buf.writeUInt32LE(32, 12);
  [[4, modRva, mb.length], [3, thRva, tb.length], [6, exRva, 168]].forEach((d, i) => { buf.writeUInt32LE(d[0], 32 + i * 12); buf.writeUInt32LE(d[2], 36 + i * 12); buf.writeUInt32LE(d[1], 40 + i * 12); });
  parts.forEach(([o, b]) => b.copy(buf, o));
  const d = await SD.parseDump(SD.bufReader(new Uint8Array(buf))), bad = [];
  if (!d.exception || d.exception.codeHex !== '0xc0000005' || d.exception.codeName !== 'ACCESS_VIOLATION') bad.push('код исключения');
  if (!d.exception || !d.exception.access || d.exception.access.kind !== 'запись' || d.exception.access.address !== 0xdeadbeefn) bad.push('параметры доступа');
  if (!d.fault || d.fault.text !== 'GTA5.exe+0x1234') bad.push('сбойный модуль ' + (d.fault && d.fault.text));
  if (d.frames.length !== 3 || d.frames[1].text !== 'GTA5.exe+0x5678' || d.frames[2].text !== 'nvwgf2umx.dll+0x99') bad.push('кадры ' + d.frames.map(f => f.text).join(','));
  if (d.modules.length !== 2 || d.threads.length !== 1) bad.push('модули/потоки');
  let threw = false; try { await SD.parseDump(SD.bufReader(new Uint8Array(Buffer.from('not a dump at all, definitely not')))); } catch (e) { threw = true; } if (!threw) bad.push('не отвергнут чужой файл');
  const an = SD.analyzeDump(d); if (!/драйвер/i.test(an.title + an.cause) && !an.facts.length) bad.push('вывод по дампу'); if (an.frames.length !== 3) bad.push('кадры в выводе');
  if (bad.length) { console.error('FAIL minidump:', bad.join(', ')); process.exit(1); }
  console.log('OK minidump: ' + an.title + ' | ' + an.facts.join('; '));
  /* Этап 14: антивирус по названию, Auto HDR на Windows 11 24H2 */
  {
    const sys = { os: 'Windows 11', build: 26100, cpus: 8 }, av = { name: 'aswhook.dll', cls: 'av', label: 'антивирус' };
    const g = SD.analyzeDump(Object.assign({}, d, { system: sys, modules: d.modules.concat([av]) }));
    if (!g.facts.some(x => /Avast/.test(x)) || !g.fix.some(x => /Avast/.test(x)) || !g.fix.some(x => /Auto HDR/.test(x))) { console.error('FAIL av/autohdr', g.facts, g.fix); process.exit(1); }
    const k = SD.analyzeDump(Object.assign({}, d, { system: sys, fault: Object.assign({}, d.fault, { cls: 'av', module: 'klhk.dll', text: 'klhk.dll+0x10' }) }));
    if (!/Kaspersky/.test(k.title) || !k.fix.some(x => /Доверенные программы/.test(x))) { console.error('FAIL kaspersky', k.title, k.fix); process.exit(1); }
    const old = SD.analyzeDump(Object.assign({}, d, { system: { os: 'Windows 10', build: 19045, cpus: 8 } }));
    if (old.fix.some(x => /Auto HDR/.test(x))) { console.error('FAIL autohdr on win10'); process.exit(1); }
    console.log('OK этап 14: антивирус по названию, Auto HDR');
    /* T1: подпись сбоя с версией модуля и сопоставление с известными записями */
    const S1 = { fault: { module: 'majestic-client.dll', text: 'majestic-client.dll+0xABC' }, mv: ['GTA5.exe|1.0.3407.0', 'majestic-client.dll|1.24.0.0'] };
    const sg = SD.sigOf(S1);
    if (!sg || sg.base !== 'majestic-client.dll+0xabc' || sg.ver !== '1.24.0.0' || sg.key !== 'majestic-client.dll+0xabc@1.24.0.0') { console.error('FAIL sigOf', sg); process.exit(1); }
    const rec = (o) => Object.assign({ sig: 'majestic-client.dll+0xabc', cause: 'x' }, o), st = (o, b) => { const r = SD.matchSig(sg, [rec(o)], b || 19045); return r ? r.state : 'none'; };
    const cases = [[{ ver: '1.24.0.0' }, 'exact'], [{ ver: '' }, 'exact'], [{ ver: '1.23.0.0' }, 'other'], [{ ver: '1.23.0.0', fixedIn: '1.24.0.0' }, 'other'], [{ ver: '', fixedIn: '1.24.0.0' }, 'regressed'], [{ ver: '', fixedIn: '1.25.0.0' }, 'exact'], [{ ver: '', builds: [17763, 17763] }, 'none']];
    const badc = cases.filter(([o, want]) => st(o) !== want);
    if (badc.length) { console.error('FAIL matchSig', badc.map(([o, w]) => JSON.stringify(o) + ' ждали ' + w + ', получили ' + st(o))); process.exit(1); }
    if (SD.matchSig(sg, [rec({ ver: '1.23.0.0' }), rec({ ver: '1.24.0.0', cause: 'точная' })], 19045).rec.cause !== 'точная') { console.error('FAIL matchSig: точная запись должна побеждать'); process.exit(1); }
    if (SD.matchSig(SD.sigOf({ fault: { module: 'x.dll', text: 'x.dll+0x1' }, mv: [] }), [rec({})], 1)) { console.error('FAIL matchSig: другая подпись'); process.exit(1); }
    if (SD.cmpVer('1.10.0', '1.9.9') !== 1 || SD.cmpVer('1.2', '1.2.0.0') !== 0) { console.error('FAIL cmpVer'); process.exit(1); }
    const kn = SD.analyzeDump(Object.assign({}, d, { system: { os: 'Windows 10', build: 17763, cpus: 4 }, fault: Object.assign({}, d.fault, { module: 'majestic-client.dll', text: 'majestic-client.dll+0x64bcf2', cls: 'altv' }) }));
    if (!kn.known) { console.error('FAIL встроенная известная ошибка 1809'); process.exit(1); }
    console.log('OK T1: подпись с версией, сопоставление записей');
  }
})();

// Журнал событий Windows: текст команды, XML, правила и совпадение с дампом
(function () {
  const SD = require('../src/utils/sysdiag.js'), bad = [];
  const txt = ['2026-10-07T12:25:36|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: majestic-client.dll, version: 1.23.3.0, Exception code: 0xc0000005, Fault offset: 0x000000000064bcf2',
    '2026-10-07T12:30:00|Application|1000|Application Error|Error|Faulting application name: GTA5.exe, version: 1.0.3337.0, Faulting module name: majestic-client.dll, version: 1.23.3.0, Exception code: 0xc0000005, Fault offset: 0x000000000064bcf2',
    '2026-10-07T12:31:00|System|41|Microsoft-Windows-Kernel-Power|Critical|BugcheckCode 278',
    '2026-10-07T12:32:00|System|98|Microsoft-Windows-Ntfs|Information|Volume C: is healthy',
    '2026-10-07T12:33:00|System|55|Microsoft-Windows-Ntfs|Error|file system structure is corrupt',
    '2026-10-07T12:34:00|Application|1000|Application Error|Error|Faulting application name: chrome.exe, Faulting module name: x.dll, Exception code: 0xc0000005, Fault offset: 0x1'].join('\n');
  const ev = SD.parseEvents(txt); if (ev.length !== 6) bad.push('парсинг текста ' + ev.length);
  const an = SD.analyzeEvents(ev, { fault: { module: 'majestic-client.dll', offset: '0x64bcf2' } });
  const crash = an.findings.find(g => g.id === 'app-crash');
  if (!crash || crash.count !== 2 || !crash.same || !/majestic-client\.dll\+0x64bcf2/.test(crash.title)) bad.push('краш игры ' + (crash && crash.title));
  if (an.findings.some(g => /chrome/.test(g.title))) bad.push('чужое приложение попало в вывод');
  if (!an.findings.some(g => g.id === 'kernel-power' && /0x116|0x116/.test(g.title) === false && /0x116/.test(g.title) === false) && !an.findings.some(g => g.id === 'kernel-power')) bad.push('kernel-power');
  if (!an.findings.some(g => g.id === 'disk' && /55/.test(g.title))) bad.push('ошибка диска');
  if (an.findings.some(g => g.id === 'disk' && /98/.test(g.title))) bad.push('информационное событие NTFS 98 принято за ошибку');
  const xml = '<Event xmlns="x"><System><Provider Name="Display"/><EventID>4101</EventID><Level>3</Level><TimeCreated SystemTime="2026-10-07T10:36:00.000Z"/><Channel>System</Channel></System><EventData><Data>nvlddmkm stopped responding</Data></EventData></Event>';
  const ex = SD.parseEvents(xml); if (ex.length !== 1 || ex[0].id !== 4101 || !ex[0].utc) bad.push('парсинг XML');
  if (!SD.analyzeEvents(ex, { refMs: Date.parse('2026-10-07T10:36:51Z') }).findings.some(g => g.id === 'gpu-tdr' && g.near)) bad.push('TDR рядом с дампом');
  const ai = SD.aiInput({ ev: { an: { total: 6, findings: an.findings } } }, 'тест'); if (ai.length > 3500 || !/ЖУРНАЛ/.test(ai)) bad.push('вход для ИИ');
  const nx = SD.parseEvents(['2026-10-07T12:00:00|System|1001|Microsoft-Windows-WER-SystemErrorReporting|Error|The computer has rebooted from a bugcheck. The bugcheck was: 0x000000e6 (0x1, 0x2).', '2026-10-07T12:01:00|System|141|Microsoft-Windows-Kernel-LiveDump|Warning|LiveKernelEvent nvlddmkm', '2026-10-07T12:02:00|System|27|e1dexpress|Warning|Network link is disconnected.', '2026-10-07T12:03:00|System|19|Microsoft-Windows-WHEA-Logger|Error|A corrected hardware error has occurred.'].join('\n'));
  const na = SD.analyzeEvents(nx, {}).findings.map(g => g.id); ['bugcheck', 'live-kernel', 'net-link', 'whea'].forEach(k => { if (na.indexOf(k) < 0) bad.push('правило ' + k + ' (' + na.join() + ')'); });
  if (bad.length) { console.error('FAIL events:', bad.join(', ')); process.exit(1); }
  console.log('OK events');
})();

// Реальные файлы (если задана папка SYS_DIR): все .dmp и .evtx читаются без ошибок
(async function () {
  const dir = process.env.SYS_DIR; if (!dir) return;
  const fs = require('fs'), SD = require('../src/utils/sysdiag.js'); let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const u8 = new Uint8Array(fs.readFileSync(dir + '/' + f));
    try {
      if (/\.dmp$/i.test(f)) { const d = await SD.parseDump(SD.bufReader(u8)); if (!d.exception) throw new Error('нет исключения'); if (!d.misc || d.misc.uptimeSec == null || !d.vm || !d.mem || !d.threadNames) throw new Error('нет данных процесса и памяти'); if (/559dd304|688c324f/.test(f) && !SD.analyzeDump(d).known) throw new Error('известная ошибка 1809 не распознана'); if (/dba53245/.test(f) && !/ERR_GFX_D3D_INIT/.test(SD.analyzeDump(d).facts.join(' '))) throw new Error('строки из памяти не найдены'); if (/8cff02e5/.test(f) && !/на пределе памяти/.test(SD.analyzeDump(d).facts.join(' '))) throw new Error('нет вывода о нехватке памяти'); n++; }
      else if (/\.evtx$/i.test(f)) { const e = await SD.parseEvtx(SD.bufReader(u8), () => true); if (!e.length) throw new Error('нет событий'); n++; }
    } catch (e) { console.error('FAIL реальный файл', f, e.message); process.exit(1); }
  }
  /* эталоны для реальных дампов и журналов: tests/golden-sys.json (обновить: GOLDEN_SYS_UPDATE=1) */
  {
    const gp = require('path').join(__dirname, 'golden-sys.json'), gold = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : {}, now = {}, short = (f) => f.replace(/^[0-9a-f]{8}-/i, '');
    for (const f of fs.readdirSync(dir)) {
      const u8 = new Uint8Array(fs.readFileSync(dir + '/' + f));
      if (/\.dmp$/i.test(f)) { const d = await SD.parseDump(SD.bufReader(u8)), a = SD.analyzeDump(d); now[short(f)] = { title: a.title, fault: d.fault ? d.fault.text : '', known: !!a.known, uptime: d.misc ? d.misc.uptimeSec : null, lowMem: /на пределе памяти/.test(a.facts.join(' ')), client: SD.versionInfo(d).client || '', frames: d.frames.length > 3 }; }
      else if (/\.evtx$/i.test(f)) { const e = await SD.parseEvtx(SD.bufReader(u8), SD.isRelevant), an = SD.analyzeEvents(e, {}); now[short(f)] = { total: e.total, findings: an.findings.map((g) => g.id).sort().filter((x, i, a) => a.indexOf(x) === i) }; }
    }
    if (process.env.GOLDEN_SYS_UPDATE) { fs.writeFileSync(gp, JSON.stringify(now, null, 1)); console.log('golden-sys обновлён: ' + Object.keys(now).length); }
    else if (Object.keys(gold).length) {
      const bad = Object.keys(gold).filter((k) => now[k] && JSON.stringify(now[k]) !== JSON.stringify(gold[k]));
      if (bad.length) { console.error('FAIL golden-sys:', bad.map((k) => k + '\n  было ' + JSON.stringify(gold[k]) + '\n  стало ' + JSON.stringify(now[k])).join('\n')); process.exit(1); }
      console.log('OK golden-sys ' + Object.keys(gold).filter((k) => now[k]).length);
    }
  }
  const dd = fs.readdirSync(dir).filter(f => /\.dmp$/i.test(f)), pick = (re) => dd.filter(f => re.test(f))[0];
  if (pick(/559dd304/) && pick(/8cff02e5/)) {
    const sm = async (f) => SD.summarizeDump(await SD.parseDump(SD.bufReader(new Uint8Array(fs.readFileSync(dir + '/' + f)))), f), A = await sm(pick(/559dd304/)), B = await sm(pick(/8cff02e5/)), cmp = SD.compareDumps(A, B).join(' | ');
    if (!/Версия клиента: 1\.23\.3\.0 → 1\.23\.4\.0/.test(cmp) || !/Драйвер видеокарты/.test(cmp) || !/Сборка Windows: 17763 → 19045/.test(cmp)) { console.error('FAIL сравнение дампов:', cmp); process.exit(1); }
    if (!A.ver.gpu || A.ver.gpu.num !== '616.56') { console.error('FAIL версия драйвера', JSON.stringify(A.ver)); process.exit(1); }
  }
  console.log('OK реальные файлы SYS_DIR: ' + n);
})();

// Ответ игроку совпадает с причиной: краш с фоновым кодом, обрыв загрузки, платформа в patcher.log
(function () {
  const L = (t, lvl, msg) => `[2026-10-07 ${t}] [${lvl}] [ (game)              ] ${msg}`, lines = [];
  for (let i = 0; i < 4; i++) {
    lines.push(L('1' + i + ':00:00.000', 'info', 'game.play: zombie process sweep'));
    lines.push(L('1' + i + ':00:05.000', 'info', "crashService: crash detected → armed needResourceCheck self-heal { internalError: 'ERR_SYS_FILELOAD', scope: 'ru4' }"));
  }
  lines.push(L('15:00:00.000', 'error', "game launch failed { reason: 'server-files-failed', message: 'fetch failed' }"));
  const sc = LA.scan(LA.parse(lines.join('\n'), 'main.log')), rep = LA.composeReply(sc);
  if (/фоновый шум/.test(rep)) { console.error('FAIL в ответ игроку попала служебная пометка «фоновый шум»:\n' + rep); process.exit(1); }
  if (!/Игра вылетает после запуска/.test(rep) || !/crashdumps/.test(rep)) { console.error('FAIL краш ERR_SYS_FILELOAD: нет шагов про client.log и дамп:\n' + rep); process.exit(1); }
  if (/свободное место/.test(rep) || !/VPN/.test(rep)) { console.error('FAIL fetch failed: ответ не про связь:\n' + rep); process.exit(1); }
  const pt = LA.scan(LA.parse('[16:56:04] [info] MAJESTIC: Deleting pirate files\n[16:56:04] [error] MAJESTIC: GTAV ERROR: ERR_FAILED_TO_LAUNCH_PLATFORM\n[16:56:04] [error] MAJESTIC: Critical error corrupted, exiting game...\n', 'patcher.log'));
  const pr = LA.composeReply(pt);
  if (/не описан/.test(pt.findings.map(g => g.title).join(';')) || !/Переустановите платформу/.test(pr)) { console.error('FAIL patcher.log ERR_FAILED_TO_LAUNCH_PLATFORM:', pt.findings.map(g => g.title), pr); process.exit(1); }
  console.log('OK ответ игроку совпадает с причиной');
})();

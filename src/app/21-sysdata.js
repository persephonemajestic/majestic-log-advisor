/* ---------- Системные данные: минидамп и журнал событий Windows (SysDiag) ---------- */
var SYS_RE = /\.(dmp|mdmp|evtx)$/i;
function evLike(text) { var h = String(text || '').slice(0, 6000); return /<Event[\s>]/.test(h) || (h.match(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\|/gm) || []).length >= 2 || /^\s*(TimeCreated|ProviderName)\s*:/m.test(h); }
var SYS_NEAR = 0;
function curDumpMs() { var f = sysOnlyOn() ? S.sysOnly : active(); return f && f.sys && f.sys.dump ? f.sys.dump.timeMs : 0; }
function evKeep() { var nm = SYS_NEAR; return function (e) { if (SysDiag.isRelevant(e)) return true; return !!(nm && e.ms && Math.abs(e.ms - nm) <= 600000 && /^(warning|error|critical|предупреждение|ошибка|критическое)$/i.test(e.level || '')); }; }
function dumpsFirst(a, nameOf) { return a.slice().sort(function (x, y) { return (/\.(dmp|mdmp)$/i.test(nameOf(y)) ? 1 : 0) - (/\.(dmp|mdmp)$/i.test(nameOf(x)) ? 1 : 0); }); }
function evCompact(e) { return { ms: e.ms, utc: e.utc, log: e.log, id: e.id, provider: e.provider, level: e.level, msg: String(e.msg || '').slice(0, 260), data: (e.data || []).slice(0, 12).map(function (x) { return String(x).slice(0, 100); }) }; }
function partFromEvents(name, arr, total) { var raw = arr.filter(evKeep()).map(function (e) { var c = evCompact(e); if (!SysDiag.isRelevant(e)) c.nr = 1; return c; }); return { name: name, total: total || arr.length, evRaw: raw.slice(-600) }; }
function sysRecalc(sys) {
  if (!sys.ev) return; var d = sys.dump;
  var an = SysDiag.analyzeEvents(sys.ev.raw, { refMs: d && d.timeMs, fault: d && d.fault ? { module: d.fault.module, offset: d.fault.offset } : null });
  sys.ev.an = { total: sys.ev.total, relevant: an.relevant, older: an.older, days: an.days, findings: an.findings.slice(0, 20) };
}
function mergeSys(sys, part) {
  sys = sys || {};
  if (part.dump) sys.dump = part.dump;
  if (part.evRaw) {
    if (sys.ev) { sys.ev.raw = sys.ev.raw.concat(part.evRaw).slice(-600); sys.ev.total += part.total; sys.ev.name += ', ' + part.name; }
    else sys.ev = { name: part.name, total: part.total, raw: part.evRaw.slice() };
  }
  sys.diag = null; sys.diagKey = ''; sysRecalc(sys); return sys;
}
async function sysPart(name, rd, text) {
  if (/\.(dmp|mdmp)$/i.test(name)) return { dump: (function (d) { SYS_NEAR = d.timeMs || 0; return d; })(SysDiag.summarizeDump(await SysDiag.parseDump(rd), name)) };
  if (/\.evtx$/i.test(name)) { var ev = await SysDiag.parseEvtx(rd, evKeep()); return { name: name, total: ev.total, evRaw: ev.map(function (e) { var c = evCompact(e); if (!SysDiag.isRelevant(e)) c.nr = 1; return c; }).slice(-600) }; }
  var evs = SysDiag.parseEvents(text); if (!evs.length) throw new Error('в файле не нашлось событий Windows');
  return partFromEvents(name, evs, evs.length);
}
function attachSysPart(f, part) { f.sys = mergeSys(f.sys, part); LS.setSys(f); }
async function ingestSys(files, texts) {
  var parts = [], i, n = files.length + texts.length; SYS_NEAR = curDumpMs(); files = dumpsFirst(files, function (x) { return x.name; });
  for (i = 0; i < files.length; i++) {
    var fl = files[i]; status('Читаю системные данные ' + (i + 1) + ' из ' + n + ': ' + fl.name + '…'); await tick();
    try {
      if (/\.zip$/i.test(fl.name)) { var z = dumpsFirst(await unzipFile(fl), function (x) { return x.name; }), got = 0; for (var zi = 0; zi < z.length; zi++) if (z[zi].bin) { parts.push(await sysPart(z[zi].name, SysDiag.bufReader(z[zi].bin))); z[zi].bin = null; got++; } if (!got) status('В архиве ' + fl.name + ' нет .dmp или .evtx.'); }
      else if (SYS_RE.test(fl.name)) parts.push(await sysPart(fl.name, SysDiag.fileReader(fl)));
      else parts.push(await sysPart(fl.name, null, await fl.text()));
    } catch (e) { status(e && e.user ? e.user : 'Не удалось прочитать ' + fl.name + ': ' + (e && e.message || 'ошибка')); }
  }
  for (i = 0; i < texts.length; i++) { try { parts.push(await sysPart(texts[i].name, null, texts[i].text)); } catch (e) { status('Не удалось прочитать ' + texts[i].name + ': ' + (e && e.message || 'ошибка')); } }
  if (!parts.length) return;
  if (sysOnlyOn()) { parts.forEach(function (p) { S.sysOnly.sys = mergeSys(S.sysOnly.sys, p); }); drawSys(S.sysOnly); status('Данные прочитаны.'); return; }
  var f = active();
  if (f && !f.sample) { parts.forEach(function (p) { attachSysPart(f, p); }); S.tab = 'diag'; render(); status('Системные данные добавлены к логу «' + f.label + '».'); }
  /* лога игрока ещё нет — журнал или дамп сразу разбираются в окне «Дамп без лога» (раньше данные молча ждали лог, и казалось, что файл не добавился);
     когда лог появится, они привяжутся и к нему */
  else {
    S.pendingParts = (S.pendingParts || []).concat(parts);
    S.sysOnly = S.sysOnly || { label: 'Дамп без лога', sys: null }; parts.forEach(function (p) { S.sysOnly.sys = mergeSys(S.sysOnly.sys, p); });
    openSysOnly(); status('Прочитано: ' + parts.map(function (p) { return p.name || (p.dump && p.dump.name) || 'дамп'; }).join(', ') + '. Добавьте лог игрока — данные привяжутся и к нему.');
  }
}
function sysOnlyOn() { return !!document.getElementById('sysOnlyBox'); }
function openSysOnly() {
  S.sysOnly = S.sysOnly || { label: 'Дамп без лога', sys: null };
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" id="sysOnlyBox" aria-label="Разбор дампа без лога" data-act="noop" style="max-width:880px;width:100%;max-height:90vh;overflow:auto"><b>Разбор дампа или журнала без лога</b><p class="hint" style="margin:4px 0 8px">Перетащите сюда .dmp, .evtx, events.txt или zip краш-отчёта. Лог не нужен.</p><section id="sysBox">' + sysHtml(S.sysOnly) + '</section><div class="row-actions"><button class="btn sm" data-act="closePanel">Закрыть</button></div></div></div>';
}
var READ_ERRS = [];
async function readFiles(list, onlyLogs, opts) {
  if (sysOnlyOn()) { await ingestSys(Array.prototype.slice.call(list), []); return; }
  var arr = Array.prototype.slice.call(list), items = [], sysFiles = [], sysTexts = [], e0 = READ_ERRS.length;
  if (onlyLogs) arr = arr.filter(function (x) { return /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i.test(x.name); });
  if (!arr.length) { status('В выбранном нет файлов .log, .txt, .zip, .dmp или .evtx.'); return; }
  for (var i = 0; i < arr.length; i++) {
    status('Читаю ' + (i + 1) + ' из ' + arr.length + '…'); await tick();
    try {
      if (SYS_RE.test(arr[i].name)) { sysFiles.push(arr[i]); continue; }
      if (/\.zip$/i.test(arr[i].name)) {
        /* «zip», который на самом деле дамп или лог с неверным расширением — читаем как есть */
        var hd = sniffBuf(new Uint8Array(await arr[i].slice(0, 4096).arrayBuffer()));
        if (hd.kind === 'dmp') { sysFiles.push(new File([arr[i]], arr[i].name.replace(/\.zip$/i, '.dmp'))); continue; }
        if (hd.kind === 'text') { var tz = await arr[i].text(); items.push({ name: arr[i].name.replace(/\.zip$/i, '.log'), size: arr[i].size, text: tz }); continue; }
        SYS_NEAR = 0; var z = dumpsFirst(await unzipFile(arr[i]), function (x) { return x.name; }), zl = z.filter(function (x) { return !x.bin; }), sysObj = null;
        if (!z.length) status('В архиве ' + arr[i].name + ' нет .log, .txt или .dmp.');
        for (var zi = 0; zi < z.length; zi++) if (z[zi].bin) { try { sysObj = mergeSys(sysObj, await sysPart(z[zi].name, SysDiag.bufReader(z[zi].bin))); } catch (e) { status('Не удалось прочитать ' + z[zi].name + ' из архива: ' + (e && e.message || 'ошибка')); } z[zi].bin = null; }
        var tgt = zl.find(function (x) { return /client/i.test(x.name); }) || zl[0];
        if (sysObj && tgt) tgt.sys = sysObj; else if (sysObj) S.pendingParts = (S.pendingParts || []).concat([{ dump: sysObj.dump }].concat(sysObj.ev ? [{ name: sysObj.ev.name, total: sysObj.ev.total, evRaw: sysObj.ev.raw }] : []).filter(function (p) { return p.dump || p.evRaw; }));
        zl.forEach(function (x) { x.group = { id: 'z:' + arr[i].name, name: arr[i].name.replace(/\.zip$/i, ''), type: 'zip' }; items.push(x); });
      } else {
        var tx = await arr[i].text();
        if (/\.(xml|txt)$/i.test(arr[i].name) && evLike(tx)) { sysTexts.push({ name: arr[i].name, text: tx }); continue; }
        if (/\.xml$/i.test(arr[i].name)) { status('Файл ' + arr[i].name + ' не похож на журнал событий Windows.'); continue; }
        var it0 = { name: arr[i].name, size: arr[i].size, text: tx }, rp = arr[i].webkitRelativePath || '', pp = rp.split('/'); if (pp.length > 1) it0.group = { id: 'd:' + pp[0], name: pp[0], type: 'dir' }; items.push(it0);
      }
    } catch (e) { var em = (e && e.user) || ('Не удалось прочитать ' + arr[i].name); READ_ERRS.push(em); status(em); }
  }
  var myErrs = READ_ERRS.slice(e0); if (myErrs.length && !items.length && !sysFiles.length && !sysTexts.length) showReadProblem(myErrs);
  if (items.length) await addTexts(items, opts && opts.forceGroup ? { forceGroup: opts.forceGroup } : undefined);
  if (sysFiles.length || sysTexts.length) await ingestSys(sysFiles, sysTexts);
}
function walkEntries(ents) {
  var files = [];
  function one(en) {
    return new Promise(function (res) {
      if (files.length > 400) return res();
      if (en.isFile) en.file(function (f) { if (/\.(log|txt|zip|dmp|mdmp|evtx)$/i.test(f.name) && f.size < 1500 * 1048576) files.push(f); res(); }, function () { res(); });
      else if (en.isDirectory) {
        var rd = en.createReader(), all = [];
        (function more() { rd.readEntries(function (b) { if (!b.length) Promise.all(all.map(one)).then(res); else { all = all.concat(Array.prototype.slice.call(b)); more(); } }, function () { res(); }); })();
      } else res();
    });
  }
  return Promise.all(ents.map(one)).then(function () { return files; });
}


/* Лог, вставленный текстом (скопирован из Discord или из файла): тип по содержимому, имя main.log / client.log */
function pasteKind(tx) {
  var t = String(tx || ''), ls = t.slice(0, 200000).split(/\r?\n/), br = 0;
  for (var i = 0; i < ls.length && i < 400; i++) if (/^\[\d/.test(ls[i])) br++;
  if (evLike(t)) return 'event';
  return br >= 3 ? LA.detectKind(ls, '') : '';
}
async function pasteLogText(tx, src) {
  tx = String(tx || '').replace(/^\uFEFF/, '');
  if (!tx.trim()) { status('Буфер пуст: сначала скопируйте лог.'); return false; }
  var k = pasteKind(tx);
  if (!k) { status('Это не похоже на лог игры: в Discord нажмите на файл лога → «Поделиться» → «Скопировать» и вставьте ещё раз.'); return false; }
  if (k === 'event') { await ingestSys([], [{ name: 'event.txt', text: tx }]); return true; }
  var nm = k + '.log', f = new File([tx], nm, { type: 'text/plain' });
  status('Вставлен ' + nm + (src ? ' (' + src + ')' : '') + ', разбираю…'); await readFiles([f]);
  return true;
}

/* Файл не открылся: окно с причиной и готовой просьбой игроку (короткое уведомление внизу легко пропустить) */
function showReadProblem(errs) {
  var ask = 'Здравствуйте! Файл, который вы прислали, не открывается: вместо архива пришла веб-страница или повреждённый файл. Пришлите, пожалуйста, его ещё раз — сам файл архива, а не ссылку.';
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" id="readProb" role="dialog" aria-label="Файл не открылся"><b>Файл не открылся</b>' + errs.map(function (x) { return '<p style="margin:0">' + esc(x) + '</p>'; }).join('') + '<div class="row-actions"><button class="btn primary" id="readProbAsk">Скопировать просьбу игроку</button><button class="btn" data-act="closePanel">Закрыть</button></div></div></div>';
  $('#readProbAsk').addEventListener('click', function () { copyText(ask, 'Просьба игроку', 'Скопируйте текст и отправьте игроку.', 'Просьба скопирована'); });
}

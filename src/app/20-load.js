/* ---------- Загрузка файлов ---------- */
async function addTexts(items, meta) {
  meta = meta || {}; var added = 0, skipped = [], newF = [], caseG = null, mtId = S.mergeTarget || null, touched = [];
  S.mergeTarget = null;
  if (!meta.restore) {
    var tgId = S.target; S.target = null;
    var real = items.filter(function (x) { return !x.sample; }), tfo = tgId && folderList().find(function (x) { return x.id === tgId && x.type === 'case'; });
    if (!tfo && S.forceGroup) { var fg = S.forceGroup; tfo = folderList().find(function (x) { return x.id === fg.id; }) || fg; }
    if (tfo) { real.forEach(function (x) { x.group = { id: tfo.id, name: tfo.name, type: 'case' }; }); caseG = tfo; }
    else if (!mtId && real.length >= 2 && !real.some(function (x) { return x.group; })) {
      var dn = new Date(), pz = function (n) { return (n < 10 ? '0' : '') + n; };
      caseG = { id: 'c:' + Date.now(), name: 'Дело ' + pz(dn.getDate()) + '.' + pz(dn.getMonth() + 1) + ' ' + pz(dn.getHours()) + ':' + pz(dn.getMinutes()), type: 'case' };
      real.forEach(function (x) { x.group = { id: caseG.id, name: caseG.name, type: 'case' }; });
    }
    if (caseG) S.open[caseG.id] = 1;
  }
  if (items.some(function (x) { return !x.sample; })) S.files = S.files.filter(function (f) { return !f.sample; });
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!meta.batch) { status('Разбираю ' + (i + 1) + ' из ' + items.length + ': ' + niceName(it.name) + ' (' + fmtSize(it.size) + ')'); setProgress((i + 1) / items.length); await tick(); }
    var hash = it.hash || fnv(it.text), dup = S.files.find(function (f) { return f.hash === hash; });
    if (dup && it.sys && !dup.sys) { dup.sys = it.sys; LS.setSys(dup); }
    if (dup) touched.push(dup);
    if (dup) { skipped.push(niceName(it.name) + ' (то же содержимое, что ' + dup.label + ')'); continue; }
    var parsed = LA.parse(it.text, it.name), sc = LA.scan(parsed);
    var f = { id: ++S.uid, name: it.name, label: niceName(it.name), size: it.size, mtime: it.mtime || 0, added: it.added || Date.now(), group: it.group || null, hash: hash, sample: !!it.sample, text: it.text, parsed: parsed, sc: sc, view: null, marks: [] };
    if (it.sys) f.sys = it.sys;
    if (!f.sample) { LA.learn(S.kb, hash, sc); recordHist(f); }
    S.files.push(f); added++; if (!f.sample) { newF.push(f); touched.push(f); }
    if (!meta.restore && !f.sample) LS.save(f);
  }
  if (!meta.restore && S.pendingParts && S.pendingParts.length && newF.length) { var pt = newF.find(function (x) { return x.sc.kind === 'client'; }) || newF[0]; S.pendingParts.forEach(function (p) { attachSysPart(pt, p); }); S.pendingParts = null; }
  if (meta.batch) return added;
  setProgress(1); saveKB(); applyAll();
  if (mtId && !meta.restore) {
    var mt = S.files.find(function (x) { return x.id === mtId; });
    if (mt) { var arcd = (S.kb.settings.arcHashes || {})[mt.hash] ? 'arc' : 'act'; touched.filter(function (x, i) { return x !== mt && touched.indexOf(x) === i; }).forEach(function (x) { mergeLogs(x, mt, arcd); }); }
  }
  if (added) { var withSys = newF.filter(function (x) { return x.sys; })[0]; S.active = (withSys || S.files[S.files.length - 1]).id; }
  else if (!S.files.some(function (f) { return f.id === S.active; }) && S.files.length) S.active = S.files[0].id;
  var gnm = newF.length > 1 && newF.every(function (x) { return x.group && x.group.id === newF[0].group.id; }) ? (caseG ? ' в папку «' + caseG.name + '». Логи после попытки решения добавляйте в неё кнопкой «+ Добавить логи» или перетащите файлы на папку' : ' (папка «' + newF[0].group.name + '», нажмите на её плитку в начале списка)') : (caseG && newF.length === 1 ? ' в папку «' + caseG.name + '»' : '');
  if (!meta.restore) status((added ? 'Добавлено файлов: ' + added + gnm + '. ' : '') + (skipped.length ? 'Пропущены дубликаты: ' + skipped.join(', ') + '.' : ''));
  S.sel = -1; render();
  if (meta.restore) return;
  newF.slice(0, 20).forEach(function (nf) { ticketLookup(nf, true); }); logPush(newF); setTimeout(function () { shareLogs(newF); }, 2500);
  var al = newF.length ? checkAlerts() : [];
  if (meta.notify || al.length) popup('loaded', 0, function () { showLoaded(newF, skipped, meta, al); });
}
function baseName(p) { return String(p).split(/[\\\/]/).filter(Boolean).pop() || String(p); }
function summarize(f) {
  var sc = f.sc, v = sc.verdict;
  return { label: f.label, kind: sc.kind, from: sc.range ? sc.range.from : '', to: sc.range ? sc.range.to : '', status: v.status, headline: v.headline.slice(0, 160), mods: sc.mods ? sc.mods.files.map(baseName) : [],
    probs: sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).slice(0, 12).map(function (g) { return { k: g.key, t: g.title, s: g.sev, n: g.count, c: String(g.cause || '').slice(0, 400), f: (g.fix || []).slice(0, 6).map(function (x) { return String(x).slice(0, 300); }), x: g.dets && g.dets.size ? Array.from(g.dets.keys()).slice(0, 2).map(function (l) { return String(l).slice(0, 200); }) : [] }; }), added: Date.now() };
}
function recordHist(f) {
  if (f.sample || S.kb.hist[f.hash]) return;
  S.kb.hist[f.hash] = summarize(f);
  var ks = Object.keys(S.kb.hist);
  if (ks.length > 500) { ks.sort(function (a, b) { return S.kb.hist[a].added - S.kb.hist[b].added; }); ks.slice(0, ks.length - 500).forEach(function (k) { delete S.kb.hist[k]; delete S.kb.tags[k]; }); }
}
function rescanAll() { S.files.forEach(function (f) { f.parsed = LA.parse(f.text, f.name); f.sc = LA.scan(f.parsed); f.view = null; }); applyAll(); }
function applyAll() { S.kbv = (S.kbv || 0) + 1; S.files.forEach(function (f) { LA.applyKB(f.parsed, f.sc, S.kb); f.view = null; }); }
async function unzipFile(file) {
  var buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), out = [], e = -1, i;
  for (i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip');
  var n = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true);
  for (var k = 0; k < n; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    var method = dv.getUint16(off + 10, true), csz = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lh = dv.getUint32(off + 42, true);
    var name = new TextDecoder('utf-8').decode(buf.subarray(off + 46, off + 46 + nl));
    off += 46 + nl + el + cl;
    if (!/\.(log|txt|dmp|mdmp|evtx)$/i.test(name)) continue;
    var ds = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = buf.subarray(ds, ds + csz), bytes;
    if (method === 0) bytes = data;
    else if (method === 8) bytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    if (/\.(dmp|mdmp|evtx)$/i.test(name)) { out.push({ name: name.split('/').pop(), size: bytes.length, bin: bytes }); continue; }
    var text = new TextDecoder().decode(bytes);
    out.push({ name: name.split('/').pop(), size: text.length, text: text });
  }
  return out;
}

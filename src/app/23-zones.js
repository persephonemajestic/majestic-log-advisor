/* ---------- Активные и архивные логи ---------- */
var ARC_MS = 24 * 3600 * 1000;
function isAct(f) {
  var st = S.kb.settings, ar = st.arcHashes || {};
  if (ar[f.hash]) return false;
  if (S.pins[f.id] || f.id === S.active) return true;
  var last = Math.max((st.actAt || {})[f.hash] || 0, f.added || 0);
  return !last || Date.now() - last < ARC_MS;
}
function touchActive() {
  var f = active(); if (!f || S.lastTouch === f.id) return; S.lastTouch = f.id;
  var st = S.kb.settings, m = st.actAt = st.actAt || {}; m[f.hash] = Date.now(); if (st.arcHashes) delete st.arcHashes[f.hash];
  var ks = Object.keys(m); if (ks.length > 400) { ks.sort(function (a, b) { return m[a] - m[b]; }).slice(0, ks.length - 300).forEach(function (k) { delete m[k]; }); }
  saveKB();
}
/* ---------- Отмена последнего действия со списком ---------- */
function pushUndo(label) {
  var st = S.kb.settings;
  S.undo = { label: label, groups: S.files.map(function (f) { return [f.hash, f.group ? JSON.parse(JSON.stringify(f.group)) : null]; }), arc: JSON.parse(JSON.stringify(st.arcHashes || {})), act: JSON.parse(JSON.stringify(st.actAt || {})), folders: JSON.parse(JSON.stringify(st.folders || {})), fparent: JSON.parse(JSON.stringify(st.fparent || {})) };
}
function undoLast() {
  var u = S.undo; if (!u) return; var st = S.kb.settings, byHash = {};
  S.files.forEach(function (f) { byHash[f.hash] = f; });
  u.groups.forEach(function (x) { var f = byHash[x[0]]; if (!f) return; if (JSON.stringify(f.group || null) !== JSON.stringify(x[1])) putGroup(f, x[1]); });
  st.arcHashes = u.arc; st.actAt = u.act; if (u.folders) st.folders = u.folders; if (u.fparent) st.fparent = u.fparent; S.undo = null; saveKB(); status('Действие «' + u.label + '» отменено.'); renderList();
}
function allToArc() {
  var act = S.files.filter(function (f) { return isAct(f) && !S.pins[f.id] && f.id !== S.active; }); if (!act.length) { status('Нечего откладывать: остались только открытый и закреплённые логи.'); return; }
  pushUndo('Всё в архив'); var ar = S.kb.settings.arcHashes = S.kb.settings.arcHashes || {}; act.forEach(function (f) { ar[f.hash] = 1; }); saveKB(); status('В архив убрано: ' + nLogs(act.length) + '. Открытый и закреплённые остались.'); renderList();
}
function mergeFolders(srcGid, tgtGid) {
  var fl = folderList(), a = fl.find(function (x) { return x.id === srcGid; }), b = fl.find(function (x) { return x.id === tgtGid && x.type === 'case'; }); if (!a || !b || a.id === b.id) return;
  pushUndo('Объединить папки'); a.files.forEach(function (f) { putGroup(f, { id: b.id, name: b.name, type: 'case' }); }); S.open[b.id] = 1; delete S.open[a.id];
  dzAll().forEach(function (x) { x.classList.remove('dropok'); }); status('Папки «' + a.name + '» и «' + b.name + '» объединены, логов: ' + (a.files.length + b.files.length) + '.'); renderList();
}
function moveZone(files, zone) {
  pushUndo('Перенос в архив или в работу');
  dzAll().forEach(function (x) { x.classList.remove('dropok'); });
  var st = S.kb.settings, ar = st.arcHashes = st.arcHashes || {}, m = st.actAt = st.actAt || {};
  files.forEach(function (f) { if (zone === 'arc') ar[f.hash] = 1; else { delete ar[f.hash]; m[f.hash] = Date.now(); } });
  saveKB(); renderList();
}
function putGroup(f, g) { f.group = g; LS.setGroup(f); }
function moveToFolder(files, gid) {
  pushUndo('Перенос в папку');
  var fo = folderList().find(function (x) { return x.id === gid && x.type === 'case'; }); if (!fo) return;
  var n = 0; files.forEach(function (f) { if (!groupOf(f) || groupOf(f).id !== gid) { putGroup(f, { id: fo.id, name: fo.name, type: 'case' }); n++; } });
  dzAll().forEach(function (x) { x.classList.remove('dropok'); });
  if (n) { S.open[gid] = 1; status('В папку «' + fo.name + '» добавлено логов: ' + n + '.'); }
  renderList();
}
function mergeLogs(src, tgt, zone) {
  pushUndo('Складывание логов в папку');
  var tg = groupOf(tgt), id, name;
  if (tg && tg.type === 'case') { id = tg.id; name = tg.name; }
  else { id = 'c:' + Date.now(); name = caseName(); putGroup(tgt, { id: id, name: name, type: 'case' }); }
  putGroup(src, { id: id, name: name, type: 'case' });
  S.open[id] = 1; S.animOpen = id;
  var st = S.kb.settings, ar = st.arcHashes = st.arcHashes || {}, m = st.actAt = st.actAt || {};
  [src, tgt].forEach(function (f) { if (zone === 'arc') ar[f.hash] = 1; else { delete ar[f.hash]; m[f.hash] = Date.now(); } });
  dzAll().forEach(function (x) { x.classList.remove('dropok'); }); saveKB();
  status('Логи «' + src.label + '» и «' + tgt.label + '» сложены в папку «' + name + '». Переименовать: двойной щелчок по названию в папке или F2.'); renderList();
}
function ejectFile(f) { pushUndo('Лог вынут из папки'); var g = f.group; putGroup(f, null); if (g) status('Лог «' + f.label + '» вынут из папки «' + g.name + '».'); renderList(); }
function saveFolderName(gid) {
  var inp = $('#gName'), nm = inp ? inp.value.replace(/\s+/g, ' ').trim().slice(0, 60) : ''; S.renaming = null;
  if (nm) { S.files.forEach(function (f) { if (f.group && f.group.id === gid) putGroup(f, { id: gid, name: nm, type: f.group.type }); }); var mf = manualFolders(); if (mf[gid]) { mf[gid].name = nm; saveKB(); } }
  renderList();
}
var dragSrc = null;
function dzAll() { return Array.prototype.slice.call(document.querySelectorAll('.dropok')); }
document.addEventListener('dragstart', function (e) {
  var el = e.target.closest && e.target.closest('.flist .fi[draggable=true]'); if (!el) return;
  dragSrc = el.classList.contains('folder') ? { gid: el.getAttribute('data-id') } : { id: +el.getAttribute('data-id'), from: (el.closest('.fdraw') || document.createElement('i')).getAttribute('data-for') || '' };
  document.body.classList.toggle('dnd-out', !!(dragSrc.from || (dragSrc.gid && fparents()[dragSrc.gid])));
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'log'); } catch (x) {}
  setTimeout(function () { document.body.classList.add('dnd'); }, 0);
});
document.addEventListener('dragover', function (e) {
  if (!dragSrc) return; var li = e.target.closest && e.target.closest('[data-zone]'); if (!li) return;
  e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
  var fgt = dragSrc.gid && e.target.closest('[data-gid]');
  if (fgt && (fgt.getAttribute('data-gid') === dragSrc.gid || isInside(fgt.getAttribute('data-gid'), dragSrc.gid))) { dzAll().forEach(function (x) { x.classList.remove('dropok'); }); return; }
  if (fgt && fgt.getAttribute('data-gid') !== dragSrc.gid) { dzAll().forEach(function (x) { if (x !== fgt) x.classList.remove('dropok'); }); fgt.classList.add('dropok'); return; }
  var gt = !dragSrc.gid && e.target.closest('[data-gid]');
  if (gt && gt.getAttribute('data-gid') !== dragSrc.from) { dzAll().forEach(function (x) { if (x !== gt) x.classList.remove('dropok'); }); gt.classList.add('dropok'); return; }
  var tc = !dragSrc.gid && !gt && e.target.closest('.flist > li[data-zone] > .fi[data-id]:not(.folder)');
  if (tc && +tc.getAttribute('data-id') !== dragSrc.id) { var tli = tc.parentNode; dzAll().forEach(function (x) { if (x !== tli) x.classList.remove('dropok'); }); tli.classList.add('dropok'); return; }
  var box = li.closest('.zone') || li; dzAll().forEach(function (x) { if (x !== box) x.classList.remove('dropok'); }); box.classList.add('dropok');
});
document.addEventListener('drop', function (e) {
  if (!dragSrc) return; var li = e.target.closest && e.target.closest('[data-zone]'); if (!li) { dragSrc = null; document.body.classList.remove('dnd'); return; }
  e.preventDefault(); var zone = li.getAttribute('data-zone'), fs = [], gt = !dragSrc.gid && e.target.closest('[data-gid]');
  var fgt = dragSrc.gid && e.target.closest('[data-gid]');
  if (fgt && (fgt.getAttribute('data-gid') === dragSrc.gid || isInside(fgt.getAttribute('data-gid'), dragSrc.gid))) { dzAll().forEach(function (x) { x.classList.remove('dropok'); }); return; }
  if (fgt && (fgt.getAttribute('data-gid') === dragSrc.gid || isInside(fgt.getAttribute('data-gid'), dragSrc.gid))) { dragSrc = null; document.body.classList.remove('dnd'); return; }
  if (fgt && fgt.getAttribute('data-gid') !== dragSrc.gid) { var sg = dragSrc.gid; dragSrc = null; document.body.classList.remove('dnd'); nestFolder(sg, fgt.getAttribute('data-gid')); return; }
  if (gt && gt.getAttribute('data-gid') !== dragSrc.from) { var sf = S.files.find(function (x) { return x.id === dragSrc.id; }); dragSrc = null; document.body.classList.remove('dnd'); if (sf) moveToFolder([sf], gt.getAttribute('data-gid')); return; }
  var tc = !dragSrc.gid && !gt && e.target.closest('.flist > li[data-zone] > .fi[data-id]:not(.folder)');
  if (tc && +tc.getAttribute('data-id') !== dragSrc.id) {
    var sf2 = S.files.find(function (x) { return x.id === dragSrc.id; }), tf = S.files.find(function (x) { return x.id === +tc.getAttribute('data-id'); });
    dragSrc = null; document.body.classList.remove('dnd'); if (sf2 && tf) mergeLogs(sf2, tf, zone); return;
  }
  /* перетащили лог из папки на свободное место — вынимаем из папки; папку из папки — поднимаем наверх */
  if (!dragSrc.gid && dragSrc.from && !e.target.closest('[data-for="' + dragSrc.from.replace(/"/g, '') + '"]')) {
    var ef = S.files.find(function (x) { return x.id === dragSrc.id; }); dragSrc = null; document.body.classList.remove('dnd');
    if (ef) { pushUndo('Лог вынут из папки'); var og = ef.group; putGroup(ef, null); var st0 = S.kb.settings, ar0 = st0.arcHashes = st0.arcHashes || {}, m0 = st0.actAt = st0.actAt || {}; if (zone === 'arc') ar0[ef.hash] = 1; else { delete ar0[ef.hash]; m0[ef.hash] = Date.now(); } saveKB(); status('Лог «' + ef.label + '» вынут из папки' + (og ? ' «' + og.name + '»' : '') + '.'); renderList(); }
    return;
  }
  if (dragSrc.gid && unnestFolder(dragSrc.gid)) status('Папка вынута наверх.');
  if (dragSrc.gid) { var fo = folderList().find(function (x) { return x.id === dragSrc.gid; }); if (fo) fs = treeFiles(fo, folderList(), folderMap()); var mfz = manualFolders()[dragSrc.gid]; if (mfz) { if (zone === 'arc') mfz.arc = 1; else delete mfz.arc; saveKB(); if (!fs.length) { dragSrc = null; document.body.classList.remove('dnd'); renderList(); return; } } }
  else { var f = S.files.find(function (x) { return x.id === dragSrc.id; }); if (f) fs = [f]; }
  dragSrc = null; document.body.classList.remove('dnd'); if (fs.length) moveZone(fs, zone); else renderList();
});
document.addEventListener('dragend', function () { dragSrc = null; document.body.classList.remove('dnd'); document.body.classList.remove('dnd-out'); dzAll().forEach(function (x) { x.classList.remove('dropok'); }); });
setInterval(function () { if (!dragSrc && !S.renaming) renderList(); }, 60000);
function renderCmd() {
  var f = active(), el = $('#cmdTitle'), T = { cmp: ['Сравнение логов', 'что изменилось между двумя запусками'], hist: ['История по игроку', 'логи, собранные по нику или тикету'], stats: ['Сводка', 'по всем добавленным логам и ассеты перед падением'], learn: ['Обучение', 'база знаний и ваши правила'], rep: ['Отчёты', 'одна проблема у нескольких игроков за короткое время'], all: ['Все логи', 'поиск и фильтры по всем логам и истории'], mass: ['Массовые', 'проблемы у многих игроков сразу'] };
  if (S.tab === 'case' && f && folderOf(f)) { var cf = folderOf(f); el.innerHTML = '<b>' + esc(cf.name || 'Дело') + '</b><span class="mut">дело · логов: ' + S.files.filter(function (x) { var g = groupOf(x); return g && g.id === cf.id; }).length + '</span>'; document.body.dataset.state = ''; return; }
  if (T[S.tab]) el.innerHTML = '<b>' + T[S.tab][0] + '</b><span class="mut">' + T[S.tab][1] + '</span>';
  else if (f) el.innerHTML = '<b>' + esc(f.label) + '</b><span class="kind">' + (f.sc.kindName || f.sc.kind) + '.log</span><span class="mut">' + f.parsed.lines.length.toLocaleString('ru') + ' строк' + (f.sc.range ? ', ' + esc(f.sc.range.from.slice(0, 19)) : '') + '</span>';
  else el.innerHTML = '<b>Нет открытого лога</b>';
  document.body.dataset.state = f && !T[S.tab] ? f.sc.verdict.status : '';
}

function updTabArrows() {
  var sc = $('#tabs'), l = $('#tabL'), r = $('#tabR'); if (!sc || !l) return;
  l.hidden = sc.scrollLeft <= 1; r.hidden = sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 1;
}
function revealTab() {
  var sc = $('#tabs'), a = sc && sc.querySelector('.tab[aria-selected=true]'); if (!a) return;
  var l = a.offsetLeft, r = l + a.offsetWidth; sc.style.scrollBehavior = 'auto';
  if (l < sc.scrollLeft + 4) sc.scrollLeft = Math.max(0, l - 40); else if (r > sc.scrollLeft + sc.clientWidth - 4) sc.scrollLeft = r - sc.clientWidth + 40;
  sc.style.scrollBehavior = '';
}
(function () {
  var sc = $('#tabs'), w = $('#tabwrap');
  sc.addEventListener('scroll', updTabArrows, { passive: true }); window.addEventListener('resize', function () { revealTab(); updTabArrows(); });
  if (window.ResizeObserver) new ResizeObserver(updTabArrows).observe(sc);
  $('#tabL').addEventListener('click', function () { sc.scrollBy({ left: -Math.max(160, sc.clientWidth * .6) }); });
  $('#tabR').addEventListener('click', function () { sc.scrollBy({ left: Math.max(160, sc.clientWidth * .6) }); });
  w.addEventListener('wheel', function (e) {
    if (sc.scrollWidth <= sc.clientWidth + 1) return; var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return;
    e.preventDefault(); sc.style.scrollBehavior = 'auto'; sc.scrollLeft += d; sc.style.scrollBehavior = '';
  }, { passive: false });
})();
function renderTabs() {
  var f = active(), n = f ? f.sc.unknown.length : 0;
  var hn = Object.keys(S.kb.hist).length, hasCase = !!(f && folderOf(f)), t = [['diag', 'Диагноз', ''], ['log', 'Лог', ''], hasCase ? ['case', 'Дело', ''] : null, ['cmp', 'Сравнение', ''], ['hist', 'История', hn ? String(hn) : ''], ['rep', 'Отчёты', (function () { var n = reports().length; return n ? String(n) : ''; })()], ['all', 'Все логи', '']].concat(srvOn() ? [['mass', 'Массовые', (function () { var n = massList().filter(function (o) { return o.hotDay || o.hotWeek; }).length; return n ? String(n) : ''; })()]] : []).concat([['stats', 'Сводка', '']]);
  t = t.filter(Boolean); $('#tabs').innerHTML = t.map(function (x) { return '<button class="tab" role="tab" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (S.tab === x[0]) + '">' + x[1] + (x[2] ? '<span class="n">' + x[2] + '</span>' : '') + '</button>'; }).join('');
  setTimeout(function () { revealTab(); updTabArrows(); }, 0);
}

function renderView() {
  var f = active();
  if (S.tab === 'case') { if (f && folderOf(f)) return renderCase(f); S.tab = 'diag'; renderTabs(); }
  if (S.tab === 'learn') S.tab = 'diag';
  if (S.tab === 'cmp') return renderCompare();
  if (S.tab === 'hist') return renderHistory();
  if (S.tab === 'stats') return renderStats();
  if (S.tab === 'rep') return renderReports();
  if (S.tab === 'all') return renderAll();
  if (S.tab === 'assets') { S.tab = 'stats'; renderTabs(); renderStats(); var as = $('#assetsSec'); if (as) as.scrollIntoView(); return; }
  if (S.tab === 'mass') return renderMass();
  if (!f) { $('#view').innerHTML = '<div class="card empty"><div class="empty-h"><b>Здесь появится диагноз</b><ul><li>Перетащите в окно <code>client.log</code>, <code>main.log</code> или <code>launcher.log</code></li><li>Можно целую папку, zip с логами или краш-отчёт игры</li><li>Только дамп без лога: кнопка «Только дамп» в меню «Ещё»</li></ul><div class="row-actions" style="justify-content:center"><button class="btn primary" data-act="addLogs">Добавить логи</button></div></div></div>'; return; }
  if (S.tab === 'log') return renderLogShell(f);
  renderDiag(f);
}

function jumpChips(f, g, max) {
  var es = f.parsed.entries, out = '';
  g.entries.slice(0, max).forEach(function (i) { var e = es[i]; out += '<button class="chip" data-act="jump" data-line="' + e.i + '">L' + (e.i + 1) + ' ' + esc(e.ts.slice(0, 8)) + '</button>'; });
  if (g.count > max) out += '<span class="chip">ещё ' + (g.count - max) + '</span>';
  return out;
}

function findingCard(f, g, open) {
  var sev = g.sev, note = S.kb.ruleNotes[g.key] || '', gi = f.sc.findings.indexOf(g), L = '', R = '';
  if (g.cause) L += '<p class="cause">' + esc(g.cause) + '</p>';
  if (g.dets.size) { var d = Array.from(g.dets.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6); L += '<div><h4>Детали из лога</h4><div class="dets">' + d.map(function (x) { return '<div>' + esc(M(x[0]).slice(0, 260)) + (x[1] > 1 ? '  ×' + x[1] : '') + '</div>'; }).join('') + '</div></div>'; }
  L += '<div><h4>Где в логе</h4><div class="chips">' + jumpChips(f, g, 10) + '</div></div>';
  if (g.fix && g.fix.length) R += '<div><h4>Что делать</h4><ol class="steps">' + g.fix.map(function (x) { return '<li><span>' + esc(x) + stepStat(g.key, x) + '</span></li>'; }).join('') + '</ol></div>';
  var cus = Object.keys((S.kb.fixStats || {})[g.key] || {}).map(function (h) { return S.kb.fixStats[g.key][h]; }).filter(function (e) { return e.custom && e.ok; }).sort(function (a, b) { return b.ok - a.ok; }).slice(0, 3);
  if (cus.length) R += '<div><h4>Раньше помогало вам</h4><ul class="steps">' + cus.map(function (e) { return '<li><span>' + esc(e.t) + ' <em class="fs">помогло ' + e.ok + ' раз</em></span></li>'; }).join('') + '</ul></div>';
  if (g.permCmd && g.permCmd.length) R += '<div><h4>Команда выдачи прав</h4><pre class="cmd">' + esc(g.permCmd.join('\n')) + '</pre><div class="hint">PowerShell от имени администратора («Терминал (администратор)»). Даёт пользователям компьютера право изменять файлы в папке.</div><div class="row-actions"><button class="btn sm" data-act="permCopy" data-fi="' + gi + '">Скопировать команду</button></div></div>';
  if (g.tpl && g.tpl.length) R += '<div><h4>Шаблоны ответа</h4><div class="chips">' + g.tpl.map(function (x) { return '<span class="chip tpl">' + esc(x) + '</span>'; }).join('') + '</div></div>';
  R += '<div class="row-actions"><button class="btn sm primary" data-act="reply" data-fi="' + gi + '" title="Готовый текст для игрока по этой проблеме">Ответ игроку</button><button class="btn sm ghost" data-act="cpf" data-fi="' + gi + '" title="Скопирует вопрос про эту проблему с логом вокруг неё">Скопировать для Claude</button></div>';
  if (SAMPLE) {
    var weak = g.src === 'infer' || !g.fix || !g.fix.length || g.fix.length < 2;
    R += '<div>' + (weak ? '<p class="hint" style="margin:0 0 8px">' + (!g.fix || !g.fix.length ? 'Готового решения для этого случая нет.' : 'В руководстве этого случая нет или решение короткое.') + ' Нейросеть может предложить решение.</p>' : '') + '<div class="row-actions"><button class="btn sm' + (weak ? ' primary' : ' ghost') + '" data-act="aif" data-fi="' + gi + '">' + (weak ? 'Предложить решение с Claude' : 'Улучшить решение с Claude') + '</button></div><div id="aif-' + gi + '" style="margin-top:10px"></div></div>';
  }
  R += teamNotesHtml(g.key);
  R += '<details class="nt"' + (note ? ' open' : '') + '><summary>Заметка к этому случаю</summary><label class="nl"><textarea class="note" data-act="rnote" data-key="' + esc(g.key) + '" placeholder="Например: что реально помогло игрокам (сохраняется в базе знаний)">' + esc(note) + '</textarea></label></details>';
  return '<details class="fd sev-' + sev + '"' + (open ? ' open' : '') + '><summary><span class="pill sev-' + sev + '">' + SEVRU[sev] + '</span><span class="ttl">' + esc(g.title) + '</span>' + (g.before ? '<span class="was" title="Проблема встречалась только до последней успешной попытки запуска">до успешной попытки</span>' : '') + '<span class="cnt">×' + g.count + '</span><span class="src ' + g.src + '" title="' + esc(SRCTIP[g.src]) + '">' + SRCRU[g.src] + '</span></summary><div class="body"><div class="col">' + L + '</div><div class="col">' + R + '</div></div></details>';
}

function ukStem(u) { return u.sample.toLowerCase().replace(/^(\[[^\]]*\]\s*)+/, '').replace(/['"][^'"]*['"]/g, '').replace(/[0-9a-f]{8,}|\d+/g, '#').split(/[^a-zа-я_.:#-]+/i).filter(Boolean).slice(0, 4).join(' '); }
function ukGroups(list) { var m = new Map(); list.forEach(function (u) { var k = ukStem(u) || u.sig; if (!m.has(k)) m.set(k, []); m.get(k).push(u); }); return Array.from(m.values()); }
function unknownCard(f, u, i) {
  var rec = u.rec, note = rec && rec.note || '';
  var h = '<div class="uk' + (u.sev === 'noise' ? ' is-noise' : '') + '"><div class="uk-h"><span class="pill sev-' + (u.sev === 'noise' ? 'noise' : u.sev === 'err' ? 'err' : 'unk') + '">' + (u.sev === 'noise' ? 'Шум' : u.sev === 'err' ? 'Подозрительно' : 'Неопознано') + '</span><span class="cnt mono">×' + u.count + '</span><span class="cls cls-' + u.cls.cls + '">' + esc(u.cls.text) + '</span></div>';
  h += '<code class="uk-s">' + esc(M(u.sample)) + '</code><div class="row-actions">';
  h += '<button class="btn sm" data-act="jump" data-line="' + f.parsed.entries[u.entries[0]].i + '">Перейти к строке L' + (f.parsed.entries[u.entries[0]].i + 1) + '</button>';
  h += '<button class="btn sm' + (rec && rec.label === 'noise' ? ' on' : '') + '" data-act="label" data-ui="' + i + '" data-val="noise">Это шум</button><button class="btn sm' + (rec && rec.label === 'problem' ? ' on' : '') + '" data-act="label" data-ui="' + i + '" data-val="problem">Это проблема</button>';
  if (rec && rec.label) h += '<button class="btn sm" data-act="label" data-ui="' + i + '" data-val="">Сбросить метку</button>';
  h += '<button class="btn sm primary" data-act="ruleNew" data-ui="' + i + '" title="Сохранить правило: эта строка станет известной проблемой с вашей причиной и решением">Добавить решение</button><button class="btn sm" data-act="cpu" data-ui="' + i + '">Скопировать для Claude</button>';
  if (SAMPLE) h += '<button class="btn sm" data-act="aiu" data-ui="' + i + '">Спросить Claude</button>';
  h += '</div><div id="aiu-' + i + '"></div><label class="nl">Причина и решение, которые вы нашли<textarea class="note" data-act="unote" data-ui="' + i + '" placeholder="Это появится в диагнозе, когда такая строка встретится в другом логе">' + esc(note) + '</textarea></label></div>';
  return h;
}

function ensureRec(kind, u) {
  var key = kind + '|' + u.sig, r = S.kb.sigs[key];
  if (!r) r = S.kb.sigs[key] = { kind: kind, sig: u.sig, sample: u.sample, lvl: u.lvl, ok: 0, bad: 0, unk: 0, hits: 0, label: '', note: '' };
  return r;
}

function caseData() {
  var f = active(), fo = f && folderOf(f); if (!fo) return null;
  var items = fo.files.map(function (x) { return { label: x.label, name: x.name, mtime: x.mtime, parsed: x.parsed, sc: x.sc, id: x.id }; });
  return { fo: fo, items: items, r: LA.caseSummary(items), checks: (S.kb.settings.caseChecks || {})[fo.id] || {} };
}
var OUTC = { ok: 'Помогло', no: 'Не помогло', esc: 'Передано дальше' };
function caseSt(gid) { return (S.kb.settings.caseStatus || {})[gid] || { s: 'new', at: 0 }; }
function setCaseStatus(gid, v) { var m = S.kb.settings.caseStatus = S.kb.settings.caseStatus || {}; if (v === 'new') delete m[gid]; else m[gid] = { s: v, at: Date.now() }; saveKB(); render(); }
function waitHoursOf(gid) { var c = caseSt(gid); return c.s === 'wait' && c.at ? (Date.now() - c.at) / 3600000 : 0; }
function setOutcome(gid, res) {
  var c = caseData(); if (!c) return; var oc = S.kb.settings.caseOutcome = S.kb.settings.caseOutcome || {}, prev = oc[gid], fs = S.kb.fixStats = S.kb.fixStats || {};
  if (prev && prev.contrib) prev.contrib.forEach(function (x) { var e = fs[x.k] && fs[x.k][x.h]; if (e) e[x.r] = Math.max(0, (e[x.r] || 0) - 1); });
  var contrib = [];
  if (res === 'ok' || res === 'no') {
    var done = c.r.asks.filter(function (a) { return a.kind === 'do' && c.checks[a.id]; });
    c.r.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).forEach(function (g) {
      done.forEach(function (a) { if ((g.fix || []).indexOf(a.text) < 0) return; var h = LA.h32(a.text), e = (fs[g.key] = fs[g.key] || {})[h] = fs[g.key][h] || { t: a.text.slice(0, 160), ok: 0, no: 0 }; e[res]++; contrib.push({ k: g.key, h: h, r: res }); });
    });
  }
  if (prev && prev.res === res) { delete oc[gid]; } else oc[gid] = { res: res, at: Date.now(), note: prev && prev.note || '', contrib: contrib };
  saveKB(); render();
  if (res === 'ok' && oc[gid]) status('Итог записан: помогло. ' + (contrib.length ? 'Отмеченные шаги учтены в статистике.' : 'Отметьте выполненные шаги в списке, чтобы они попали в статистику.'));
}
function stepStat(key, text) {
  var e = ((S.kb.fixStats || {})[key] || {})[LA.h32(text)]; if (!e || !(e.ok + e.no)) return '';
  return '<em class="fs" title="По итогам ваших дел: сколько раз этот шаг был выполнен и дело закрыто как помогло">помогло ' + e.ok + ' из ' + (e.ok + e.no) + '</em>';
}
function caseHtml(c) {
  var r = c.r, fo = c.fo, e = function (x) { return esc(M(x)); }, h = '', notes = (S.kb.settings.caseNotes || {})[fo.id] || '', ocv = (S.kb.settings.caseOutcome || {})[fo.id], cst = caseSt(fo.id);
  h += '<h1>Дело: ' + e(fo.name) + '</h1><p class="m">Логов: ' + c.items.length + ' (main ' + r.n.main + ', client ' + r.n.client + '). Статус: ' + TST[cst.s] + (ocv ? '. Итог: ' + OUTC[ocv.res] : '') + '. Отчёт создан ' + new Date().toLocaleString('ru') + '.</p>';
  h += '<div class="v ' + r.status + '"><b>' + STRU[r.status] + '.</b> ' + e(r.headline) + r.lines.map(function (l) { return '<p>' + e(l) + '</p>'; }).join('') + '</div>';
  if (r.asks.length) h += '<h2>Что просили у игрока</h2><ol>' + r.asks.map(function (a) { return '<li>' + (c.checks[a.id] ? '[выполнено] ' : '') + e(a.text) + '</li>'; }).join('') + '</ol>';
  if (notes) h += '<h2>Заметки</h2><p style="white-space:pre-wrap">' + e(notes) + '</p>';
  if (r.timeline.length) h += '<h2>Хронология (' + r.timeline.length + ')</h2><table><tr><th>Время</th><th>Лог</th><th>Событие</th></tr>' + r.timeline.slice(0, 200).map(function (x) { return '<tr><td>' + e(fmtTsUi(x.t)) + '</td><td>' + x.fkind + '</td><td>' + (x.kind === 'bad' ? '<b>' + e(x.label) + '</b>' : e(x.label)) + '</td></tr>'; }).join('') + '</table>';
  if (r.delta) h += '<h2>До и после</h2>' + r.delta.map(function (d) { return '<p><b>' + d.kind + '.log:</b> ' + e(d.from) + ' → ' + e(d.to) + (d.gone.length ? '<br>Исчезло: ' + d.gone.map(e).join('; ') : '') + (d.fresh.length ? '<br>Появилось: ' + d.fresh.map(e).join('; ') : '') + (d.stay.length ? '<br>Осталось: ' + d.stay.map(e).join('; ') : '') + '</p>'; }).join('');
  var pr = r.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  h += '<h2>Проблемы дела (' + pr.length + ')</h2>' + pr.slice(0, 20).map(function (g, i) { return '<div class="f"><h3>' + (i + 1) + '. ' + e(g.title) + ' <span class="c">×' + g.count + ', ' + SEVRU[g.sev] + '</span></h3>' + (g.cause ? '<p>' + e(g.cause) + '</p>' : '') + (g.fix && g.fix.length ? '<ol>' + g.fix.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ol>' : '') + '</div>'; }).join('');
  h += '<h2>Логи дела</h2><ul>' + c.items.map(function (it) { return '<li>' + e(it.label) + ' (' + it.sc.kind + '): ' + STRU[it.sc.verdict.status] + '</li>'; }).join('') + '</ul>';
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Дело ' + e(fo.name) + '</title><style>' + REPORT_CSS + '</style></head><body>' + h + '</body></html>';
}
function caseAskText(c) {
  var todo = c.r.asks.filter(function (a) { return !c.checks[a.id]; }), n = 0;
  if (!todo.length) return 'Здравствуйте! По вашему обращению все шаги выполнены. Если проблема осталась, пришлите, пожалуйста, свежие main.log и client.log.';
  return 'Здравствуйте! Чтобы продолжить разбор, выполните, пожалуйста:\n' + todo.map(function (a) { return (++n) + ') ' + a.text; }).join('\n');
}
/* Ответ игроку по делу: шаги по последнему неудачному логу и то, что ещё нужно прислать (неотмеченные просьбы) */
function caseReplyText(c) {
  var st = S.kb.settings || {}, ro = replyOpts(), todo = c.r.asks.filter(function (a) { return !c.checks[a.id]; }), hello = ro.hello || 'Здравствуйте!';
  if (c.r.status === 'ok') return hello + '\n\nПо последним логам всё в порядке: игра запустилась и подключилась к серверу. Если проблема повторится, пришлите свежие main.log и client.log сразу после неудачной попытки.';
  var bad = c.fo.files.filter(function (x) { return x.sc.verdict.status !== 'ok'; }).sort(function (a, b) { return fileTime(a) - fileTime(b); }), last = bad[bad.length - 1];
  if (!last) return caseAskText(c);
  var more = todo.length ? 'Также, пожалуйста:\n' + todo.map(function (a, i) { return (i + 1) + ') ' + a.text; }).join('\n') + '\n\n' : '';
  var rt = M(LA.composeReply(last.sc, { kb: S.kb, hello: ro.hello, bye: '\u0001', brief: ro.brief, extra: sysExtra(last), folderMods: folderMods(last) }));
  if (st.replyShort && !ro.brief) rt = shortenReply(rt);
  return rt.replace('\u0001', more + (ro.bye || LA.REPLY_BYE));
}
function renderCase(f) {
  var c = caseData(); if (!c) return renderDiag(f);
  var r = c.r, fo = c.fo, h = '', idOf = {};
  c.items.forEach(function (it) { idOf[it.label] = it.id; });
  h += '<div class="caseview"><div class="hero"><section class="card verdict v-' + r.status + '"><div class="vmeta"><span class="st st-' + r.status + '">' + STRU[r.status] + '</span><span class="nm">' + esc(fo.name) + '</span><span class="kind">' + GTYPE[fo.type] + '</span><span>логов: ' + c.items.length + '</span></div>';
  h += casePlayerHtml(fo.id) + '<h2>' + esc(M(r.headline)) + '</h2><div class="lines">' + r.lines.map(function (l, i) { return '<p>' + esc(M(l)) + '</p>'; }).join('') + '</div></section>';
  h += '<aside class="card answer"><h3>Ответ игроку по делу</h3>' + (r.asks.length ? '<ul class="asks">' + r.asks.map(function (a) { return '<li><label><input type="checkbox" data-act="caseck" data-gid="' + esc(fo.id) + '" data-id="' + a.id + '"' + (c.checks[a.id] ? ' checked' : '') + '><span>' + esc(M(a.text)) + '</span></label></li>'; }).join('') + '</ul>' : '<p class="hint">Просить больше нечего.</p>') + '<div class="reply-pv" id="caseReplyPv">' + esc(caseReplyText(c)) + '</div><div class="row-actions"><button class="btn primary" data-act="caseReply" title="Шаги по последнему неудачному логу и неотмеченные просьбы">Копировать ответ игроку</button><button class="btn" data-act="caseask" title="Только список того, что прислать или сделать">Только просьбы</button><button class="btn" data-act="solveOpen" title="Записать, что помогло, и закрыть дело">Проблема решена</button></div><p class="hint" style="margin:0">Отмеченные пункты в ответ не попадают.</p></aside></div>';
  var ocv = (S.kb.settings.caseOutcome || {})[fo.id], cst = caseSt(fo.id);
  h += '<section class="card"><h3 class="sec" style="margin:0">Итог дела</h3><div class="oc"><label class="nl inl">Статус<select class="sel" data-act="cstatus" data-gid="' + esc(fo.id) + '">' + Object.keys(TST).map(function (k) { return '<option value="' + k + '"' + (cst.s === k ? ' selected' : '') + '>' + TST[k] + '</option>'; }).join('') + '</select></label>' + Object.keys(OUTC).map(function (k) { return '<button class="btn' + (ocv && ocv.res === k ? ' on' : '') + '" data-act="coutcome" data-gid="' + esc(fo.id) + '" data-res="' + k + '">' + OUTC[k] + '</button>'; }).join('') + '</div><label class="nl">Заметки к делу<textarea class="note" data-act="cnote" data-gid="' + esc(fo.id) + '" placeholder="Ник игрока, что делали, что ответил">' + esc((S.kb.settings.caseNotes || {})[fo.id] || '') + '</textarea></label><div class="row-actions" style="justify-content:flex-start"><button class="btn sm" data-act="caseexp">Скачать отчёт по делу (HTML)</button></div><p class="hint" style="margin:0">«Помогло» и «Не помогло» учитывают отмеченные выше шаги в статистике: потом рядом с шагом в диагнозе видно, как часто он помогал у вас.</p></section>';
  h += crossCard(c.items);
  var tl = r.timeline;
  h += '<section><h3 class="sec">Хронология <span class="n">' + tl.length + '</span></h3>' + (tl.length ? '<div class="tl">' + tl.map(function (e) {
    return '<div class="tlr k-' + e.kind + '"><span class="tt">' + esc(fmtTsUi(e.t)) + '</span><span class="tf">' + e.fkind + '</span><i class="td"></i><span>' + esc(M(e.label)) + '</span><button class="chip" data-act="cjump" data-fid="' + (idOf[e.file] || 0) + '" data-line="' + e.line + '">L' + (e.line + 1) + '</button></div>';
  }).join('') + '</div>' : '<div class="card empty">В логах дела не нашлось событий со временем.</div>') + '</section>';
  if (r.delta) h += '<section><h3 class="sec">До и после</h3><div class="card"><div class="dl">' + r.delta.map(function (d) {
    return '<div><b>' + d.kind + '.log:</b> ' + esc(d.from) + ' → ' + esc(d.to) + '</div>' + (d.gone.length ? '<div>Исчезло: ' + d.gone.map(esc).join('; ') + '</div>' : '') + (d.fresh.length ? '<div>Появилось: ' + d.fresh.map(esc).join('; ') + '</div>' : '') + (d.stay.length ? '<div>Осталось: ' + d.stay.map(esc).join('; ') + '</div>' : '') + (!d.gone.length && !d.fresh.length && !d.stay.length ? '<div>Проблем не найдено ни в одном из логов.</div>' : '');
  }).join('<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">') + '</div></div></section>';
  var pr = r.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  h += '<section><h3 class="sec">Проблемы всего дела <span class="n">' + pr.length + '</span></h3>' + (pr.length ? '<div class="list">' + pr.slice(0, 20).map(function (g) { return '<div class="card" style="display:grid;gap:6px"><div class="vmeta"><span class="pill sev-' + g.sev + '">' + SEVRU[g.sev] + '</span><b class="nm">' + esc(g.title) + '</b><span class="cnt">×' + g.count + '</span><span class="src ' + g.src + '" title="' + esc(SRCTIP[g.src]) + '">' + SRCRU[g.src] + '</span></div><div class="hint" style="margin:0">Где: ' + g.files.filter(function (x, i, a) { return a.indexOf(x) === i; }).map(esc).join(', ') + '</div></div>'; }).join('') + '</div>' : '<div class="card empty">Известных проблем нет.</div>') + '</section>';
  h += '<section><h3 class="sec">Логи дела</h3><div class="row-actions" style="justify-content:flex-start">' + c.items.map(function (it) { return '<button class="btn sm" data-act="copen" data-fid="' + it.id + '">' + esc(it.label) + ' · ' + (it.sc.kindName || it.sc.kind) + ' · ' + STRU[it.sc.verdict.status].toLowerCase() + '</button>'; }).join('') + '</div></section></div>';
  $('#view').innerHTML = h;
}
function fmtTsUi(ms) { var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()); }
function repeatNote(f) {
  var tag = S.kb.tags[f.hash]; if (!tag) return '';
  var mine = f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).map(function (g) { return g.key; }), hit = {}, logs = 0;
  Object.keys(S.kb.hist).forEach(function (h) {
    if (h === f.hash || S.kb.tags[h] !== tag) return; var e = S.kb.hist[h], any = false;
    (e.probs || []).forEach(function (pr) { if (mine.indexOf(pr.k) >= 0) { hit[pr.t] = (hit[pr.t] || 0) + 1; any = true; } });
    if (any) logs++;
  });
  var names = Object.keys(hit); if (!names.length) return '';
  var tried = []; f.sc.findings.forEach(function (g) { if (SEV[g.sev] >= SEV.warn && hit[g.title] && g.fix) g.fix.forEach(function (x) { if (tried.indexOf(x) < 0) tried.push(x); }); });
  var trH = tried.length ? '<details class="more-l"><summary>Что уже советовали по этим проблемам (' + tried.length + ')</summary><ul style="margin:6px 0 0 18px;padding:0">' + tried.slice(0, 8).map(function (x) { return '<li>' + esc(M(x)) + '</li>'; }).join('') + '</ul><div class="hint">Эти шаги были в диагнозах прошлых логов игрока. Не предлагайте их снова вслепую: уточните, что из этого он делал, и переходите к эскалации с дампом и журналом Windows.</div></details>' : '';
  return '<p class="hint" style="margin:8px 0 0"><b>Повтор:</b> у «' + esc(M(tag)) + '» такие же проблемы уже были в ' + logs + ' ' + (logs % 10 === 1 && logs % 100 !== 11 ? 'логе' : 'логах') + ': ' + names.slice(0, 3).map(function (n) { return esc(M(n)); }).join('; ') + '. Прошлые шаги не помогли: рассмотрите эскалацию.</p>' + trH;
}
function renderDiag(f) {
  var sc = f.sc, v = sc.verdict, st = sc.stage, h = '', A = sc.attempts || [];
  var OUT = { ok: 'Игра запущена', patched: 'Патчер успешен', fail: 'Отказ', crash: 'Краш игры', cancel: 'Отменён', unk: 'Без итога' };
  if (sc.mods) {
    var md = sc.mods, cl = md.kind === 'client';
    h += '<section class="prio" role="alert"><div class="prio-t"><h2>Моды в папке игры: сначала уберите их</h2><div class="row-actions"><button class="btn sm primary" data-act="reply" data-fi="mods">Ответ игроку про моды</button><button class="btn sm ghost" data-act="jump" data-line="' + md.line + '">Строка L' + (md.line + 1) + '</button></div></div><div class="files">' + md.files.map(function (x) { return '<code>' + esc(M(x)) + '</code>'; }).join('') + '</div><p class="hint">' + (cl ? 'Сторонний мод переписывает файл игры, проверка файлов его не убирает.' : 'Моды разрешены только в папке модификаций лаунчера, в папке GTA V они ломают запуск.') + ' Перенести файлы в папку модификаций или удалить и повторить запуск.</p></section>';
  }
  /* вердикт */
  h += '<div class="hero"><section class="card verdict v-' + v.status + '"><div class="vmeta"><span class="st st-' + v.status + '">' + STRU[v.status] + '</span><span class="nm">' + esc(f.label) + '</span><span class="kind">' + (sc.kindName || sc.kind) + '.log</span>' + (sc.range ? '<span>' + esc(sc.range.from) + ' → ' + esc(sc.range.to.slice(-12)) + '</span>' : '') + '</div>';
  h += '<h2>' + esc(M(v.headline)) + '</h2>' + (function () { var ls = v.lines.filter(function (l) { return !(sc.mods && /^ПРИОРИТЕТ/.test(l)); }); if (!ls.length) return ''; return '<div class="lines"><p>' + esc(M(ls[0])) + '</p>' + (ls.length > 1 ? '<details class="more-l"><summary>Подробнее</summary>' + ls.slice(1).map(function (l) { return '<p>' + esc(M(l)) + '</p>'; }).join('') + '</details>' : '') + '</div>'; })() + repeatNote(f) + (f.sample ? '' : fbHtml(f));
  if (A.length) {
    var from = Math.max(0, A.length - 80);
    h += '<div class="pulse-box"><div class="pulse" role="group" aria-label="Попытки запуска">' + A.slice(from).map(function (a, i) {
      var c = a.out === 'fail' || a.out === 'crash' ? 't-bad' : a.out === 'ok' || a.out === 'patched' ? 't-ok' : a.out === 'cancel' ? 't-warn' : '', hg = c === 't-bad' || c === 't-ok' ? '100%' : c === 't-warn' ? '62%' : '38%';
      return '<button class="tick ' + c + '" style="--h:' + hg + ';--i:' + i + '" data-act="jump" data-line="' + a.line + '" title="Попытка ' + (from + i + 1) + ': ' + OUT[a.out] + ', ' + esc(a.ts.slice(0, 8)) + '" aria-label="Попытка ' + (from + i + 1) + ': ' + OUT[a.out] + '"></button>';
    }).join('') + '</div><div class="legend"><span>Попыток: ' + A.length + (from ? ' (последние 80)' : '') + '</span><span><i style="background:var(--ok)"></i>запуск</span><span><i style="background:var(--crit)"></i>отказ или краш</span><span><i style="background:var(--warn)"></i>отмена</span></div></div>';
  }
  if (sc.patcher) {
    var PO = sc.patcher.order, PN = {}; PSTEPS_UI.forEach(function (x) { PN[x[0]] = x[1]; });
    h += '<div class="track" aria-label="Шаги патчера">' + PSTEPS_UI.filter(function (x) { return x[0] !== 'admin' && x[0] !== 'job' && x[0] !== 'window'; }).map(function (x, i, arr) { var okk = PO.indexOf(x[0]) >= 0, firstMiss = !okk && arr.slice(0, i).every(function (y) { return PO.indexOf(y[0]) >= 0; }); var cl = okk ? 'done' : firstMiss && sc.verdict.status !== 'ok' ? 'fail' : ''; return (i ? '<span class="link ' + (okk ? 'done' : '') + '"></span>' : '') + '<span class="node ' + cl + '">' + x[1] + '</span>'; }).join('') + '</div>';
  } else if (st) {
    var started = !!st.started, conn = !!st.connected, dump = !!st.dump, cf = !!sc.keyed.get('c-conn');
    var s2 = started ? 'done' : (dump ? 'fail' : ''), s3 = conn ? 'done' : (dump || cf ? 'fail' : '');
    h += '<div class="track" aria-label="Стадии запуска"><span class="node done">Клиент инициализирован</span><span class="link ' + s2 + '"></span><span class="node ' + s2 + '">Game Started</span><span class="link ' + s3 + '"></span><span class="node ' + s3 + '">Connected</span>' + (dump ? '<span class="link"></span><span class="node fail">MINIDUMP</span>' : '') + '</div>';
  }
  h += '</section>';
  /* ответ игроку */
  h += '<aside class="card answer"><h3>Ответ игроку</h3><div class="reply-pv" id="replyPv">' + esc(replyText(f, '')) + '</div><div class="row-actions"><button class="btn primary" data-act="replyCopy">Копировать ответ</button><button class="btn" data-act="reply">Править</button></div><div class="row-actions"><button class="btn" data-act="solveOpen" title="Записать, что помогло, и закрыть лог">Проблема решена</button></div>';
  h += repliesCard(f) + '<div class="more"><div class="trow"><label class="nl inl">Игрок или тикет<input type="text" id="tagIn" list="tagList" data-act="tag" value="' + esc(S.kb.tags[f.hash] || '') + '" placeholder="ticket-1234 или ник"></label><label class="nl inl">Статус' + stSelect(f) + '</label></div><datalist id="tagList">' + tagNames().map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist><details class="mini-d"><summary class="mini">Ещё: стиль ответа, отчёты</summary>' + styleSel();
  h += '<div class="row-actions"><button class="btn sm ghost" data-act="report">Отчёт для тикета</button><button class="btn sm ghost" data-act="exphtml">Отчёт HTML</button>' + (window.nativeApp && window.nativeApp.pdf ? '<button class="btn sm ghost" data-act="exppdf">Отчёт PDF</button>' : '') + '' + (SAMPLE ? '<button class="btn sm ghost" data-act="ai" id="aiBtn">Разобрать с Claude</button>' : '') + '<button class="btn sm ghost" data-act="cp" title="Скопирует готовый вопрос с итогом, находками и фрагментами лога. Вставьте его в чат с Claude.">Скопировать для Claude</button></div>' + (SAMPLE ? '<p class="hint">Claude получит правила из руководства, итог и фрагменты проблемных строк. Личные данные скрываются всегда.</p>' : '') + '<div id="aiOut">' + (f.ai ? '<div class="ai-h">Разбор Claude</div><div class="ai">' + esc(f.ai) + '</div>' : '') + '</div></details></div></aside></div>';

  if (SAMPLE) h += '<section class="card" id="diagBox">' + diagHtml(f) + '</section>';
  h += runsCard(f) + chainCard(f) + sysCard(f) + sharedCard(f) + askCard(f);
  if (st && st.ctx.length) {
    h += '<section class="card"><h3 class="sec">Контекст краша</h3><div class="ctx">' + st.ctx.map(function (c) {
      var m = /^(Last [^:]+|Texture info)\s*:?\s*(.*)$/.exec(c.text) || [null, c.text, ''];
      var own = /Last loaded asset/.test(m[1]) ? (LA.owner(m[2]) === 'mj' ? ' (похоже на ресурс Majestic)' : m[2].trim() ? ' (владельца по названию не определить)' : '') : '';
      return '<div><span class="k">' + esc(m[1]) + '</span><span class="mono">' + esc(M(m[2]) || '(пусто)') + esc(own) + '</span></div>';
    }).join('') + '</div></section>';
  }
  if (A.length) {
    h += '<details class="card plain"' + '' + '><summary>Попытки запуска (' + A.length + ')</summary><div class="tbl-wrap"><table class="at"><thead><tr><th>#</th><th>Время</th><th>Сервер</th><th>Итог</th><th>Подробности</th><th></th></tr></thead><tbody>';
    A.forEach(function (a, i) {
      var cls = a.out === 'fail' || a.out === 'crash' ? 'st-bad' : a.out === 'ok' || a.out === 'patched' ? 'st-ok' : a.out === 'cancel' ? 'st-warn' : 'st-unk';
      var det = a.out === 'fail' ? a.reason + (a.message ? ': ' + a.message : '') : a.out === 'crash' ? (a.message || 'без кода') : a.out === 'cancel' ? (a.stage ? 'стадия ' + a.stage : '') : '';
      h += '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(a.date + ' ' + a.ts.slice(0, 8)) + '</td><td>' + esc(a.server || '') + '</td><td><span class="st ' + cls + '">' + OUT[a.out] + '</span></td><td class="wrapc">' + esc(M(det).slice(0, 120)) + '</td><td><button class="chip" data-act="jump" data-line="' + a.line + '">L' + (a.line + 1) + '</button></td></tr>';
    });
    h += '</tbody></table></div></details>';
  }

  var probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }), infos = sc.findings.filter(function (g) { return g.sev === 'info'; }), oks = sc.findings.filter(function (g) { return g.sev === 'ok'; }), nz = sc.findings.filter(function (g) { return g.sev === 'noise'; });
  h += '<section><h3 class="sec">Найденные проблемы <span class="n">' + probs.length + '</span></h3>' + (probs.length ? '<div class="list">' + probs.map(function (g, i) { return findingCard(f, g, i === 0); }).join('') + '</div>' : '<div class="card empty">Известных проблем по правилам не найдено.</div>') + '</section>';
  if (infos.length) h += '<section><h3 class="sec">Заметки <span class="n">' + infos.length + '</span></h3><div class="list">' + infos.map(function (g) { return findingCard(f, g, false); }).join('') + '</div></section>';
  var unk = sc.unknown.filter(function (u) { return u.sev !== 'noise'; }), unkNoise = sc.unknown.filter(function (u) { return u.sev === 'noise'; });
  if (unk.length) h += '<section><h3 class="sec">Неопознанные строки <span class="n">' + unk.length + '</span></h3><p class="hint">Правил для них нет. Отметьте строку как шум или напишите решение, и оно запомнится.</p>';
  if (unk.length) { var ug = ukGroups(unk); h += '<div class="list">' + ug.slice(0, 40).map(function (g) { var rest = g.slice(1); return unknownCard(f, g[0], sc.unknown.indexOf(g[0])) + (rest.length ? '<details class="card plain"><summary>Похожие строки (' + rest.length + '), решение для первой подойдёт и им</summary><div class="list" style="margin-top:12px;box-shadow:none">' + rest.slice(0, 12).map(function (u) { return unknownCard(f, u, sc.unknown.indexOf(u)); }).join('') + '</div></details>' : ''); }).join('') + '</div>' + (ug.length > 40 ? '<p class="hint" style="margin-top:10px">Показано 40 групп из ' + ug.length + ' (по числу повторов).</p>' : '') + '</section>'; }
  if (unkNoise.length) h += '<details class="card plain"><summary>Неопознанные, но похожие на шум (' + unkNoise.length + ')</summary><div class="list" style="margin-top:14px;box-shadow:none">' + unkNoise.slice(0, 40).map(function (u) { return unknownCard(f, u, sc.unknown.indexOf(u)); }).join('') + '</div></details>';
  if (oks.length) h += '<details class="card plain"><summary>Подтверждения успеха (' + oks.length + ')</summary><div class="list" style="margin-top:14px;box-shadow:none">' + oks.map(function (g) { return findingCard(f, g, false); }).join('') + '</div></details>';
  if (nz.length) h += '<details class="card plain"><summary>Шум: строки, которые не считаются ошибкой (' + nz.reduce(function (a, g) { return a + g.count; }, 0).toLocaleString('ru') + ' строк, ' + nz.length + ' видов)</summary><div class="list" style="margin-top:14px;box-shadow:none">' + nz.map(function (g) { return findingCard(f, g, false); }).join('') + '</div></details>';
  $('#view').innerHTML = h;
}


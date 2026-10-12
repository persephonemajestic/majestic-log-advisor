/* ---------- Отрисовка ---------- */
function active() { return S.files.find(function (f) { return f.id === S.active; }) || null; }
function render() { scanDumpSigs(); touchActive(); renderList(); renderTabs(); renderCmd(); renderView(); if (typeof maybeAutoDiag === 'function') maybeAutoDiag(active()); }


function groupOf(f) { var tg = S.kb.tags[f.hash]; if (f.sample) return null; if (f.group && f.group.type === 'case') return f.group; if (tg) return { id: 't:' + tg, name: tg, type: 'ticket' }; return f.group || null; }
/* Папки: из логов (папка-дело, тикет, архив, папка с диска) и созданные вручную пустые папки (S.kb.settings.folders) */
function manualFolders() { var m = S.kb.settings.folders; return m && typeof m === 'object' ? m : (S.kb.settings.folders = {}); }
function folderList() {
  var m = {}, ord = [];
  S.files.forEach(function (f) { var g = groupOf(f); if (!g) return; if (!m[g.id]) { m[g.id] = { id: g.id, name: g.name, type: g.type, files: [] }; ord.push(g.id); } m[g.id].files.push(f); });
  var out = ord.map(function (k) { return m[k]; }).filter(function (x) { return x.files.length >= 2 || x.type === 'case'; }), mf = manualFolders();
  Object.keys(mf).forEach(function (id) { if (!m[id]) out.push({ id: id, name: mf[id].name || 'Новая папка', type: 'case', files: [], empty: true, at: mf[id].at || 0 }); });
  return out;
}
function folderAct(fo) { return fo.files.length ? fo.files.some(isAct) : !(manualFolders()[fo.id] || {}).arc; }
function folderTime(fo) { return fo.files.reduce(function (m, f) { return Math.max(m, f.added || 0, (S.kb.settings.actAt || {})[f.hash] || 0); }, fo.at || (manualFolders()[fo.id] || {}).at || 0); }
function folderOf(f) { var g = groupOf(f); if (!g) return null; return folderList().find(function (x) { return x.id === g.id; }) || null; }
var GTYPE = { zip: 'архив', ticket: 'тикет', dir: 'папка', 'case': 'дело' };
var PINSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1.2 6.2L18 12.5V15h-5.2v6l-.8 1-.8-1v-6H6v-2.5l3.2-3.3L8 3z"/></svg>';
var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/* Название новой папки: «Дело от 12 окт, 19:27» — сразу видно, когда начато; переименовывается двойным щелчком или F2 */
function caseName(d) { d = d || new Date(); var z = function (n) { return (n < 10 ? '0' : '') + n; }; return 'Дело от ' + d.getDate() + ' ' + MON[d.getMonth()] + ', ' + z(d.getHours()) + ':' + z(d.getMinutes()); }
function nLogs(n) { var m = n % 100, d = n % 10; return n + ' ' + ((m > 10 && m < 20) ? 'логов' : d === 1 ? 'лог' : (d > 1 && d < 5) ? 'лога' : 'логов'); }
function nProbs(n) { var m = n % 100, d = n % 10; return n + ' ' + ((m > 10 && m < 20) ? 'проблем' : d === 1 ? 'проблема' : (d > 1 && d < 5) ? 'проблемы' : 'проблем'); }
var KSHORT = { main: 'MAIN', client: 'CLNT', patcher: 'PTCH', launcher: 'LNCH' };
/* Когда лог: «06.10 11:10» для main, дата из имени или время запуска для client */
function fileWhen(f) { var r = f.sc.range && f.sc.range.from || '', m = /^\d{4}-(\d\d)-(\d\d) (\d\d:\d\d)/.exec(r); if (m) return m[2] + '.' + m[1] + ' ' + m[3]; var d = /(\d{4})-(\d\d)-(\d\d)[_ ](\d\d)-(\d\d)/.exec(f.name); if (d) return d[3] + '.' + d[2] + ' ' + d[4] + ':' + d[5]; return /^\d\d:\d\d/.test(r) ? r.slice(0, 5) : fmtSize(f.size); }
/* Строка лога в дереве: значок документа с типом лога на полосе цвета статуса, название, время и итог */
function fileCard(f, inFolder, i) {
  var v = f.sc.verdict, prob = f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).length, k = f.sc.kindName || f.sc.kind;
  return '<li data-zone="' + (isAct(f) ? 'act' : 'arc') + '" role="treeitem" style="--i:' + (i || 0) + '"><div class="fi file s-' + v.status + (f.id === S.active ? ' active' : '') + (S.pins[f.id] ? ' pinned' : '') + (inFolder ? '' : isAct(f) ? ' isact' : ' isarc') + '"' + ' draggable="true"' + ' role="button" tabindex="0" data-act="open" data-id="' + f.id + '" title="' + esc(f.label) + ' — ' + STRU[v.status].toLowerCase() + (f.sc.range ? ', ' + esc(f.sc.range.from.slice(0, 16)) : '') + ', ' + fmtSize(f.size) + '">' +
    '<span class="fic" aria-hidden="true"><i></i><em>' + (KSHORT[k] || String(k).toUpperCase().slice(0, 4)) + '</em></span><div class="ftx">' +
    '<div class="r1"><span class="nm">' + esc(f.label) + '</span>' + (f.sample ? '<span class="kind">пример</span>' : '') + (f.sc.mods ? '<span class="st st-mod" title="Найден мод в папке игры">МОД</span>' : '') +
    (inFolder && f.group && f.group.type === 'case' ? '<button class="ej" data-act="geject" data-id="' + f.id + '" title="Вынуть из папки" aria-label="Вынуть из папки">⤴</button>' : '') + '<button class="pinb" data-act="pin" data-id="' + f.id + '" title="' + (S.pins[f.id] ? 'Открепить' : 'Закрепить наверху') + '" aria-label="Закрепить">' + PINSVG + '</button><button class="rm" data-act="rm" data-id="' + f.id + '" title="Убрать из списка" aria-label="Убрать">×</button></div>' +
    '<div class="r2"><span class="dot d-' + v.status + '"></span><span class="stt">' + STRU[v.status].toLowerCase() + (prob ? ' · ' + prob : '') + '</span><span>' + esc(fileWhen(f)) + '</span></div></div></div></li>';
}
/* Значок папки: задняя стенка с ярлычком, листы внутри, передняя створка (откидывается при открытии) */
function foldIcon() { return '<span class="fold" aria-hidden="true"><i class="fb"></i><i class="fp p2"></i><i class="fp p1"></i><i class="ff"></i></span>'; }
function remindWaits() {
  var wh = S.kb.settings.waitHours || 24, late = folderList().filter(function (fo) { return waitHoursOf(fo.id) >= wh; });
  if (late.length) status('Игрок не отвечает больше ' + wh + ' ч: ' + late.slice(0, 3).map(function (x) { return '«' + x.name + '»'; }).join(', ') + (late.length > 3 ? ' и ещё ' + (late.length - 3) : '') + '. Статус «Ждём игрока» в деле.');
}
setInterval(function () { if (!dragSrc) { renderList(); } }, 600000);
function folderBadges(fo) {
  var cs = caseSt(fo.id), oc = (S.kb.settings.caseOutcome || {})[fo.id], b = '';
  if (oc) b += '<span class="gbadge ' + (oc.res === 'ok' ? 'ok' : oc.res === 'no' ? 'bad' : '') + '" title="Итог дела">' + OUTC[oc.res] + '</span>';
  if (cs.s !== 'new') { var wh = waitHoursOf(fo.id), late = wh >= (S.kb.settings.waitHours || 24); b += '<span class="gbadge ' + (late ? 'warn' : '') + '" title="' + (late ? 'Игрок не отвечает уже ' + Math.round(wh) + ' ч' : 'Статус дела') + '">' + TST[cs.s] + (late ? ' ' + Math.round(wh) + ' ч' : '') + '</span>'; }
  return b;
}
function folderWorst(fo) { var ord = { bad: 3, warn: 2, unk: 1, ok: 0 }; return fo.files.reduce(function (m, f) { return ord[f.sc.verdict.status] > ord[m] ? f.sc.verdict.status : m; }, fo.files.length ? 'ok' : 'unk'); }
/* Папка в дереве: стрелка, значок, название (переименование прямо здесь), число логов; раскрытая — содержимое под ней */
function folderTile(fo, kids, forceOpen) {
  var worst = folderWorst(fo), op = !!S.open[fo.id] || !!forceOpen, act = folderAct(fo), ren = S.renaming === fo.id, isCase = fo.type === 'case';
  var probs = fo.files.reduce(function (n, f) { return n + f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).length; }, 0), mods = fo.files.filter(function (f) { return f.sc.mods; }).length;
  var h = '<li data-zone="' + (act ? 'act' : 'arc') + '" role="treeitem" aria-expanded="' + op + '"' + (isCase ? ' data-gid="' + esc(fo.id) + '"' : '') + '><div class="fi folder s-' + worst + (op ? ' open' : '') + (fo.empty ? ' empty' : '') + (act ? ' isact' : ' isarc') + (ren ? ' ren' : '') + '"' + (ren ? '' : ' draggable="true"') + ' role="button" tabindex="0" data-act="gopen" data-id="' + esc(fo.id) + '" title="' + esc(fo.name) + '. Щелчок — ' + (op ? 'закрыть' : 'открыть') + ', двойной щелчок — диагноз дела' + (isCase ? ', F2 — переименовать' : '') + '">' +
    '<span class="chev" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' + foldIcon() +
    '<div class="ftx"><div class="r1">' + (ren ? '<input id="gName" class="fd-in" value="' + esc(fo.name) + '" maxlength="60" aria-label="Название папки"><button class="btn sm" data-act="gsave" data-id="' + esc(fo.id) + '">OK</button>' : '<span class="nm">' + esc(fo.name) + '</span>' + (isCase ? '' : '<span class="kind">' + GTYPE[fo.type] + '</span>') + (mods ? '<span class="st st-mod" title="Логов с модами: ' + mods + '">МОД</span>' : '')) + '</div>' +
    '<div class="r2">' + (fo.files.length ? '<span class="dot d-' + worst + '"></span><span class="stt">' + STRU[worst].toLowerCase() + (probs ? ' · ' + probs : '') + '</span>' : '<span>пустая — перетащите сюда логи</span>') + folderBadges(fo) + '</div></div><span class="fcnt" title="' + nLogs(fo.files.length) + '">' + fo.files.length + '</span></div>';
  if (op) {
    var list = kids || fo.files;
    h += '<div class="fdraw' + (S.animOpen === fo.id ? ' enter' : '') + '" data-for="' + esc(fo.id) + '"' + (isCase ? ' data-gid="' + esc(fo.id) + '"' : '') + ' data-zone="' + (act ? 'act' : 'arc') + '">' +
      '<div class="fd-acts">' + (fo.files.length ? '<button class="lnk" data-act="gcase" data-id="' + esc(fo.id) + '" title="Общий диагноз по всем логам папки (или двойной щелчок по папке)">Диагноз</button>' : '') + (isCase ? '<button class="lnk" data-act="gadd" data-id="' + esc(fo.id) + '" title="Выбрать файлы с компьютера в эту папку">+ Логи</button>' + (ren ? '' : '<button class="lnk" data-act="grename" data-id="' + esc(fo.id) + '">Переименовать</button>') + '<button class="lnk dim ic" data-act="gdel" data-id="' + esc(fo.id) + '" title="Удалить папку: логи останутся в списке" aria-label="Удалить папку"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '') + '</div>' +
      '<ul class="flist" role="group">' + (list.length ? list.map(function (f, i) { return fileCard(f, true, i); }).join('') : '<li class="fd-empty">Перетащите сюда логи из списка или файлы с компьютера</li>') + '</ul></div>';
  }
  return h + '</li>';
}
function toggleFolder(gid) {
  if (!S.open[gid]) { S.open[gid] = 1; S.animOpen = gid; renderList(); setTimeout(function () { if (S.animOpen === gid) S.animOpen = null; }, 700); return; }
  var dr = document.querySelector('.fdraw[data-for="' + (window.CSS && CSS.escape ? CSS.escape(gid) : gid) + '"]'), tile = document.querySelector('.fi.folder[data-id="' + (window.CSS && CSS.escape ? CSS.escape(gid) : gid) + '"]');
  if (tile) tile.classList.remove('open');
  var quick = !dr || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (quick) { delete S.open[gid]; renderList(); return; }
  dr.classList.remove('enter'); dr.classList.add('leave');
  setTimeout(function () { delete S.open[gid]; renderList(); }, 190);
}
function newFolder() {
  var id = 'c:' + Date.now(), mf = manualFolders(), names = {}, nm = 'Новая папка', n = 1; folderList().forEach(function (x) { names[x.name] = 1; }); while (names[nm]) nm = 'Новая папка ' + (++n);
  mf[id] = { name: nm, at: Date.now() }; saveKB();
  S.open[id] = 1; S.animOpen = id; S.renaming = id; S.sideQ = ''; var q = $('#sideQ'); if (q) q.value = '';
  if (document.body.classList.contains('side-off')) toggleSide();
  renderList(); var el = $('#gName'); if (el) el.scrollIntoView({ block: 'nearest' });
  status('Новая папка создана: назовите её и перетащите в неё логи.');
}
function deleteFolder(gid) {
  var fo = folderList().find(function (x) { return x.id === gid; }); if (!fo) return;
  pushUndo('Удалить папку «' + fo.name + '»'); fo.files.forEach(function (f) { putGroup(f, null); }); delete manualFolders()[gid]; delete S.open[gid]; saveKB();
  status('Папка «' + fo.name + '» удалена' + (fo.files.length ? ', ' + nLogs(fo.files.length) + ' остались в списке' : '') + '.'); renderList();
}
function openCaseTab(cg) { var cfo = folderList().find(function (x) { return x.id === cg; }); if (cfo) { S.open[cg] = 1; if (!cfo.files.some(function (x) { return x.id === S.active; })) S.active = cfo.files[cfo.files.length - 1].id; S.tab = 'case'; render(); window.scrollTo(0, 0); } }
function startRename(gid) { var fo = folderList().find(function (x) { return x.id === gid && x.type === 'case'; }); if (!fo) return; S.open[gid] = 1; S.renaming = gid; renderList(); }
var clrArm = null;
function clrBtn(z, n, id) { return '<button type="button" class="clrz' + (clrArm === z ? ' armed' : '') + '"' + (id ? ' id="' + id + '"' : '') + ' data-act="clrZone" data-z="' + z + '" title="' + (z === 'all' ? 'Убрать все логи из списка и из истории сохранённых: после перезапуска они не вернутся. Отчёты, история и статистика остаются.' : 'Убрать логи этой полосы из списка и из сохранённых после перезапуска. Отчёты, история и статистика остаются.') + '">' + (clrArm === z ? 'Точно убрать ' + n + '?' : z === 'all' ? 'Очистить всю историю' : 'Убрать все') + '</button>'; }
function clearZone(z) {
  if (clrArm !== z) { clrArm = z; clearTimeout(clearZone.t); clearZone.t = setTimeout(function () { clrArm = null; renderList(); }, 4000); renderList(); return; }
  clrArm = null; clearTimeout(clearZone.t);
  var del = S.files.filter(function (f) { return z === 'all' || (isAct(f) ? 'act' : 'arc') === z; }), ids = {}; if (z === 'all') LS.clear(); del.forEach(function (f) { ids[f.id] = 1; LS.del(f.hash); delete S.pins[f.id]; });
  S.files = S.files.filter(function (f) { return !ids[f.id]; });
  if (ids[S.active]) S.active = S.files.length ? S.files[0].id : null;
  status('Убрано логов из списка: ' + del.length + '. Отчёты, история и статистика остались.'); render();
}
function sideMatch(f, q) { return !q || (f.label + ' ' + f.name + ' ' + (S.kb.tags[f.hash] || '')).toLowerCase().indexOf(q) !== -1; }
function renderList() {
  var fl = folderList(), q = (S.sideQ || '').trim().toLowerCase();
  Object.keys(S.open).forEach(function (k) { if (!fl.some(function (x) { return x.id === k; })) delete S.open[k]; });
  var A = '', R = '', na = 0, nr = 0, inF = {}, byNew = function (a, b) { return (b.added || 0) - (a.added || 0) || b.id - a.id; };
  function put(act, html) { if (act) { A += html; na++; } else { R += html; nr++; } }
  fl.forEach(function (fo) { fo.files.forEach(function (f) { inF[f.id] = 1; }); });
  S.files.filter(function (f) { return S.pins[f.id] && !inF[f.id] && sideMatch(f, q); }).sort(byNew).forEach(function (f) { put(isAct(f), fileCard(f)); });
  fl.slice().sort(function (a, b) { return folderTime(b) - folderTime(a); }).forEach(function (fo) {
    var hit = q && fo.name.toLowerCase().indexOf(q) !== -1, kids = q && !hit ? fo.files.filter(function (f) { return sideMatch(f, q); }) : null;
    if (q && !hit && !kids.length) return;
    put(folderAct(fo), folderTile(fo, kids, !!(kids && kids.length)));
  });
  S.files.filter(function (f) { return !S.pins[f.id] && !inF[f.id] && sideMatch(f, q); }).sort(byNew).forEach(function (f) { put(isAct(f), fileCard(f)); });
  var gn = $('#gName'); if (gn && !gn.dataset.f) { gn.dataset.f = 1; gn.focus(); gn.select(); }
  var ah = $('#actHd'); if (ah) ah.innerHTML = '<div class="zt"><i class="sd"></i><b>В работе</b><span class="zc">' + na + '</span><span class="side-sp"></span>' + (S.undo ? '<button type="button" class="clrz soft" data-act="undo" title="Отменить: ' + esc(S.undo.label) + '">↶ Отменить</button>' : '') + '<details class="zmenu"' + (S.zmenu || clrArm ? ' open' : '') + '><summary title="Действия со списком" aria-label="Действия со списком">⋯</summary><div class="zmenu-b">' + (na > 1 ? '<button type="button" class="clrz soft" data-act="allArc" title="Убрать всё в архив, кроме открытого и закреплённых">Всё в архив</button>' : '') + clrBtn('act', na) + clrBtn('all', S.files.length) + '</div></details></div>';
  $('#flist').innerHTML = A || '<li class="hint side-empty">' + (q ? 'Ничего не найдено.' : 'Логов пока нет. Перетащите файлы вниз панели или нажмите «Добавить логи».') + '</li>';
  var gn2 = $('#gName'); if (gn2 && !gn2.dataset.f) { gn2.dataset.f = 1; gn2.focus(); gn2.select(); }
  var aw = $('#arcWrap'); if (aw) {
    aw.hidden = !S.files.length && !nr; var open = S.kb.settings.arcOpen !== false || !!q; aw.classList.toggle('shut', !open);
    $('#arcHd').innerHTML = '<i class="sd"></i><b>Архив</b><span class="zc">' + nr + '</span><span class="zh">' + (nr ? 'сутки без открытия' : 'пусто') + '</span><em>' + (open ? 'Свернуть' : 'Показать') + '</em>';
    $('#arcHd').title = 'Сюда сами уходят логи, которые сутки не открывали. Вернуть: открыть или перетащить в «В работе».';
    var cb = $('#arcClr'); if (cb) cb.outerHTML = ''; if (nr) aw.insertAdjacentHTML('afterbegin', clrBtn('arc', nr, 'arcClr'));
    $('#arcHd').setAttribute('aria-expanded', open); $('#flist2').hidden = !open; $('#flist2').innerHTML = R || '<li class="hint arc-empty" data-zone="arc">Перетащите сюда лог или папку, чтобы убрать в архив</li>';
  }
  var gn3 = $('#gName'); if (gn3 && !gn3.dataset.f) { gn3.dataset.f = 1; gn3.focus(); gn3.select(); }
  var rn = $('#railN'); if (rn) rn.textContent = S.files.length || '';
}
/* Панель слева: скрыть или показать, ширина тянется за край и запоминается */
function applySide() {
  var st = S.kb.settings, w = Math.max(220, Math.min(520, +st.sideW || 300));
  document.body.classList.toggle('side-off', st.sideOff === true); $('#work').style.setProperty('--side-w', w + 'px');
  var bar = document.querySelector('.bar'); if (bar) document.documentElement.style.setProperty('--barh', bar.offsetHeight + 'px');
}
function toggleSide() { S.kb.settings.sideOff = !(S.kb.settings.sideOff === true); saveKB(); applySide(); }
/* щелчок мимо поля названия сохраняет введённое, как в проводнике */
document.addEventListener('focusout', function (e) { if (e.target && e.target.id === 'gName' && S.renaming) { var gid = S.renaming; setTimeout(function () { if (S.renaming === gid && !(document.activeElement && document.activeElement.id === 'gName')) saveFolderName(gid); }, 120); } });
document.addEventListener('toggle', function (e) { if (e.target && e.target.classList && e.target.classList.contains('zmenu')) S.zmenu = e.target.open; }, true);
(function () {
  var rs = $('#sideRs'); if (!rs) return;
  rs.addEventListener('pointerdown', function (e) {
    e.preventDefault(); rs.setPointerCapture(e.pointerId); document.body.classList.add('side-rsz');
    var mv = function (ev) { S.kb.settings.sideW = Math.round(Math.max(220, Math.min(520, ev.clientX))); applySide(); };
    var up = function () { rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); document.body.classList.remove('side-rsz'); saveKB(); };
    rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up);
  });
  window.addEventListener('resize', function () { var bar = document.querySelector('.bar'); if (bar) document.documentElement.style.setProperty('--barh', bar.offsetHeight + 'px'); });
  var q = $('#sideQ'); if (q) q.addEventListener('input', function () { S.sideQ = q.value; renderList(); });
})();
/* Как в проводнике: двойной щелчок по папке — диагноз дела, по названию в открытой папке — переименование; F2 — переименовать; Esc — закрыть папку */
document.addEventListener('dblclick', function (e) {
  var nm = e.target.closest && e.target.closest('.fd-nm[data-ren]'); if (nm) { startRename(nm.getAttribute('data-ren')); return; }
  var ft = e.target.closest && e.target.closest('.fi.folder'); if (ft && !e.target.closest('button')) openCaseTab(ft.getAttribute('data-id'));
});
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyN') { e.preventDefault(); newFolder(); return; }
  var el = document.activeElement; if (!el || !el.closest || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'F2') { var ft = el.closest('.fi.folder') || el.closest('.fdraw'); if (ft) { e.preventDefault(); startRename(ft.getAttribute('data-id') || ft.getAttribute('data-for')); } }
  else if (e.key === 'Escape' && el.id !== 'gName' && !($('#panelHost') && $('#panelHost').firstChild)) { var dr = el.closest('.fdraw') || el.closest('.fi.folder.open'); if (dr) toggleFolder(dr.getAttribute('data-for') || dr.getAttribute('data-id')); }
});

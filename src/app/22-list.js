/* ---------- Отрисовка ---------- */
function active() { return S.files.find(function (f) { return f.id === S.active; }) || null; }
function render() { scanDumpSigs(); touchActive(); renderList(); renderTabs(); renderCmd(); renderView(); if (typeof maybeAutoDiag === 'function') maybeAutoDiag(active()); }


function groupOf(f) { var tg = S.kb.tags[f.hash]; if (f.sample) return null; if (f.group && f.group.type === 'case') return f.group; if (tg) return { id: 't:' + tg, name: tg, type: 'ticket' }; return f.group || null; }
function folderList() {
  var m = {}, ord = [];
  S.files.forEach(function (f) { var g = groupOf(f); if (!g) return; if (!m[g.id]) { m[g.id] = { id: g.id, name: g.name, type: g.type, files: [] }; ord.push(g.id); } m[g.id].files.push(f); });
  return ord.map(function (k) { return m[k]; }).filter(function (x) { return x.files.length >= 2 || x.type === 'case'; });
}
function folderOf(f) { var g = groupOf(f); if (!g) return null; return folderList().find(function (x) { return x.id === g.id; }) || null; }
var GTYPE = { zip: 'архив', ticket: 'тикет', dir: 'папка', 'case': 'дело' };
var PINSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1.2 6.2L18 12.5V15h-5.2v6l-.8 1-.8-1v-6H6v-2.5l3.2-3.3L8 3z"/></svg>';
function fileCard(f, inFolder) {
  var v = f.sc.verdict, prob = f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).length, fo = !inFolder && folderOf(f);
  return '<li data-zone="' + (isAct(f) ? 'act' : 'arc') + '"><div class="fi' + (f.id === S.active ? ' active' : '') + (S.pins[f.id] ? ' pinned' : '') + (inFolder ? '' : isAct(f) ? ' isact' : ' isarc') + '"' + ' draggable="true"' + ' role="button" tabindex="0" data-act="open" data-id="' + f.id + '">' +
    '<div class="r1"><span class="dot d-' + v.status + '" title="' + STRU[v.status] + '"></span><span class="nm" title="' + esc(f.label) + '">' + esc(f.label) + '</span>' + (f.sample ? '<span class="kind">пример</span>' : '') + (f.sc.mods ? '<span class="st st-mod" title="Найден мод в папке игры">МОД</span>' : '') +
    (inFolder && f.group && f.group.type === 'case' ? '<button class="ej" data-act="geject" data-id="' + f.id + '" title="Вынуть из папки" aria-label="Вынуть из папки">⤴</button>' : '') + '<button class="pinb" data-act="pin" data-id="' + f.id + '" title="' + (S.pins[f.id] ? 'Открепить' : 'Закрепить в начале списка') + '" aria-label="Закрепить">' + PINSVG + '</button><button class="rm" data-act="rm" data-id="' + f.id + '" title="Убрать из списка" aria-label="Убрать">×</button></div>' +
    '<div class="r2"><span>' + (f.sc.kindName || f.sc.kind) + '</span><span>' + (f.sc.range ? esc(f.sc.range.from.slice(0, 16)) : '') + '</span><span>' + fmtSize(f.size) + '</span><span>' + STRU[v.status].toLowerCase() + (prob ? ', проблем: ' + prob : '') + '</span>' + (fo ? '<span class="gtag" title="В папке: ' + esc(fo.name) + '">' + esc(fo.name) + '</span>' : '') + '</div></div></li>';
}
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
function folderTile(fo) {
  var ord = { bad: 3, warn: 2, unk: 1, ok: 0 }, worst = fo.files.reduce(function (m, f) { return ord[f.sc.verdict.status] > ord[m] ? f.sc.verdict.status : m; }, 'ok');
  var probs = fo.files.reduce(function (n, f) { return n + f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).length; }, 0), mods = fo.files.filter(function (f) { return f.sc.mods; }).length;
  return '<li data-zone="' + (fo.files.some(isAct) ? 'act' : 'arc') + '"' + (fo.type === 'case' ? ' data-gid="' + esc(fo.id) + '"' : '') + '><div class="fi folder' + (S.open[fo.id] ? ' open' : '') + (fo.files.some(isAct) ? ' isact' : ' isarc') + '" draggable="true" role="button" tabindex="0" data-act="gopen" data-id="' + esc(fo.id) + '"><div class="r1"><span class="chev">▶</span><span class="dot d-' + worst + '"></span><span class="nm" title="' + esc(fo.name) + '">' + esc(fo.name) + '</span>' + (fo.type === 'case' ? '' : '<span class="kind">' + GTYPE[fo.type] + '</span>') + (mods ? '<span class="st st-mod" title="Логов с модами: ' + mods + '">МОД</span>' : '') + '</div><div class="r2"><span>логов: ' + fo.files.length + '</span><span>проблем: ' + probs + '</span><span>' + (S.open[fo.id] ? 'открыта' : 'нажмите, чтобы открыть') + '</span>' + folderBadges(fo) + '</div></div></li>';
}
function drawerHtml(fo, zone) {
  var isCase = fo.type === 'case', ren = S.renaming === fo.id;
  var head = '<header class="fd-h"><span class="fd-t">' + (ren ? '<input id="gName" class="fd-in" value="' + esc(fo.name) + '" maxlength="60" aria-label="Название папки"> <button class="btn sm" data-act="gsave" data-id="' + esc(fo.id) + '">Сохранить</button>' : '<b>' + esc(fo.name) + '</b>') + '</span><span class="kind">' + GTYPE[fo.type] + '</span><span>логов: ' + fo.files.length + '</span><span class="fd-sp"></span>' +
    '<button class="btn sm primary" data-act="gcase" data-id="' + esc(fo.id) + '" title="Общий диагноз по всем логам папки">Диагноз дела</button>' + (isCase ? '<button class="btn sm" data-act="gadd" data-id="' + esc(fo.id) + '">+ Добавить логи</button><button class="btn sm ghost" data-act="grename" data-id="' + esc(fo.id) + '">Переименовать</button>' : '') +
    '<button class="btn sm ghost" data-act="gopen" data-id="' + esc(fo.id) + '">Свернуть</button></header>';
  return '<section class="fdraw"' + (isCase ? ' data-gid="' + esc(fo.id) + '"' : '') + ' data-zone="' + zone + '">' + head + '<ul class="flist">' + fo.files.map(function (f) { return fileCard(f, true); }).join('') + '</ul></section>';
}
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
function renderList() {
  var h = '', arcHtml = '', arcN = 0, arcOn = false, actN = -1, fl = folderList(), dA = '', dB = '';
  Object.keys(S.open).forEach(function (k) { if (!fl.some(function (x) { return x.id === k; })) delete S.open[k]; });
  var shown = {}, A = '', R = '', na = 0, nr = 0;
  function put(act, html) { if (act) { A += html; na++; } else { R += html; nr++; } }
  S.files.filter(function (f) { return S.pins[f.id] && !folderOf(f); }).forEach(function (f) { put(isAct(f), fileCard(f)); shown[f.id] = 1; });
  var af = S.files.find(function (f) { return f.id === S.active; });
    fl.forEach(function (fo) { var act = fo.files.some(isAct); put(act, folderTile(fo)); if (S.open[fo.id]) { if (act) dA += drawerHtml(fo, 'act'); else dB += drawerHtml(fo, 'arc'); } });
  var inF = {}; fl.forEach(function (fo) { fo.files.forEach(function (f) { inF[f.id] = 1; }); });
  S.files.forEach(function (f) { if (!shown[f.id] && !inF[f.id]) put(isAct(f), fileCard(f)); });
  if (na + nr) { h += A; actN = na; arcHtml = R; arcN = nr; arcOn = true; }
  var da = $('#drA'), db = $('#drB'); if (da) da.innerHTML = dA; if (db) db.innerHTML = dB;
  var gn = $('#gName'); if (gn && !gn.dataset.f) { gn.dataset.f = 1; gn.focus(); gn.select(); }
  var ah = $('#actHd'); if (ah) { ah.hidden = actN < 0; ah.innerHTML = '<i class="sd"></i><b>Активные</b><span>' + actN + ' · в работе сейчас</span>' + (S.undo ? '<button type="button" class="clrz soft" data-act="undo" title="Отменить: ' + esc(S.undo.label) + '">↶ Отменить</button>' : '') + (actN > 1 ? '<button type="button" class="clrz soft" data-act="allArc" title="Перенести все активные логи в отложенные, кроме открытого и закреплённых">Все в отложенные</button>' : '') + clrBtn('act', actN) + clrBtn('all', S.files.length); }
  $('#flist').innerHTML = h || '<li class="hint" style="padding:6px 12px">Файлов пока нет.</li>';
  var aw = $('#arcWrap'); if (aw) {
    aw.hidden = !arcOn; var open = S.kb.settings.arcOpen !== false; aw.classList.toggle('shut', !open);
    $('#arcHd').innerHTML = '<i class="sd"></i><b>Отложенные</b><span>' + arcN + (arcN ? ' · давно не открывали, можно вернуть перетаскиванием вверх' : ' · пусто, перетащите сюда лог, который пока не нужен') + '</span><em>' + (open ? 'Свернуть' : 'Показать') + '</em>';
    var cb = $('#arcClr'); if (cb) cb.outerHTML = ''; if (arcN) aw.insertAdjacentHTML('afterbegin', clrBtn('arc', arcN, 'arcClr'));
    $('#arcHd').setAttribute('aria-expanded', open); $('#flist2').hidden = !open; $('#flist2').innerHTML = arcHtml || '<li class="hint arc-empty" data-zone="arc">Сюда можно перетащить лог или папку мышкой</li>';
  }
}

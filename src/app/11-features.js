var TEAM_URL = 'https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/rules.json';
S.repSeen = {}; S.ld = null; S.allSort = 'sev';
var THEME_RU = { auto: 'Тема: авто', light: 'Тема: светлая', dark: 'Тема: тёмная' };

function applyRules() {
  var team = (S.kb.settings.team && S.kb.settings.team.rules || []).map(function (r) { return Object.assign({}, r, { team: true, id: 't' + r.id }); });
  LA.setCustomRules(team.concat(S.kb.custom));
}
async function loadTeam(manual) {
  try {
    var j;
    if (window.nativeApp && window.nativeApp.gatedFetch) { var tx = await window.nativeApp.gatedFetch('/v1/rules'); if (!tx) throw new Error('нет ответа сервера'); j = JSON.parse(tx); }
    else { var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 10000); var res = await fetch(TEAM_URL + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); clearTimeout(tm); if (!res.ok) throw new Error('код ' + res.status); j = await res.json(); }
    if (!j || j.v !== 1 || !Array.isArray(j.rules)) throw new Error('неверный формат файла');
    var ok = j.rules.filter(function (r) { return r && r.pattern && (r.kind === 'main' || r.kind === 'client'); }).map(function (r, i) { return { id: r.id || ('n' + i), kind: r.kind, pattern: String(r.pattern), title: r.title || '', sev: r.sev || 'err', cause: r.cause || '', fix: r.fix || [] }; });
    var before = JSON.stringify(S.kb.settings.team && S.kb.settings.team.rules || []);
    S.kb.settings.team = { rules: ok, at: Date.now() }; saveKB();
    if (JSON.stringify(ok) !== before) { applyRules(); rescanAll(); render(); }
    if (manual) { status('Правила команды обновлены: ' + ok.length + '.'); renderTabs(); if ($('#srulesHost')) openSettings(); }
  } catch (e) { if (manual) status('Не удалось получить правила команды: ' + (e && e.message ? e.message : e)); }
}
function teamCard() {
  var t = S.kb.settings.team, n = t ? t.rules.length : 0;
  return '<div class="card"><div class="lt"><h3 class="sec" style="margin:0;flex:1">Правила команды <span class="n">' + n + '</span></h3><button class="btn sm" data-act="teamRefresh">Обновить</button><button class="btn sm" data-act="teamExport" title="Скопировать ваши правила, чтобы добавить их в общий файл rules.json">Мои правила для команды</button></div>' +
    '<p class="hint" style="margin:8px 0 0;max-width:80ch">Общие правила лежат в файле rules.json в репозитории проекта и подтягиваются при каждом запуске. Они применяются ко всем логам и помечены как «правило команды». ' + (t ? 'Обновлено: ' + fmtDT(t.at) + '.' : 'Пока не загружались.') + '</p></div>';
}

/* время и отчёты */
function fmtDT(ms) { var d = new Date(ms); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
function fmtSpan(ms) { var m = Math.round(ms / 60000); if (m < 60) return m + ' мин'; var h = Math.floor(m / 60); return h + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : ''); }
function reports() { return LA.clusterReports(S.kb.hist, { min: S.kb.settings.repMin || 3, hours: S.kb.settings.repHours || 6 }); }
function checkAlerts() {
  var out = []; if (massPaused()) return out;
  reports().forEach(function (c) { var seen = S.repSeen[c.id]; if (seen === undefined || c.n > seen) out.push(c); S.repSeen[c.id] = c.n; });
  return out;
}
function repTags(c) { var o = {}; c.items.forEach(function (x) { var t = S.kb.tags[x.h]; if (t) o[t] = 1; }); return Object.keys(o); }
function reportText(c) {
  var L = ['ОТЧЁТ О ПОВТОРЯЮЩЕЙСЯ ПРОБЛЕМЕ', '', 'Проблема: ' + c.title, 'Серьёзность: ' + SEVRU[c.sev],
    'Затронуто логов: ' + c.n + ' (main: ' + (c.kinds.main || 0) + ', client: ' + (c.kinds.client || 0) + '), со сбоем запуска: ' + c.bad,
    'Период: ' + fmtDT(c.start) + ' - ' + fmtDT(c.end) + ' (' + fmtSpan(c.end - c.start) + ')'];
  var tg = repTags(c); if (tg.length) L.push('Игроки и тикеты: ' + tg.join(', '));
  if (c.examples.length) { L.push('', 'Признак в логах:'); c.examples.forEach(function (l) { L.push('  ' + l); }); }
  if (c.also && c.also.length) L.push('', 'Также в этих же логах: ' + c.also.join('; '));
  if (c.cause) L.push('', 'Вероятная причина: ' + c.cause);
  if (c.fix.length) { L.push('', 'Что рекомендует руководство:'); c.fix.forEach(function (x, i) { L.push('  ' + (i + 1) + '. ' + x); }); }
  L.push('', 'Затронутые логи:');
  c.items.forEach(function (x, i) { var t = S.kb.tags[x.h]; L.push('  ' + (i + 1) + '. ' + x.e.label + ' | ' + x.e.kind + ' | ' + (x.e.from || fmtDT(x.t)) + ' | ' + STRU[x.e.status] + (t ? ' | ' + t : '')); });
  L.push('', 'Отчёт сформирован автоматически по загруженным логам.');
  return M(L.join('\n'));
}
function csvCell(v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvText(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n'); }
function repCsv(c) {
  var rows = [['Файл', 'Тип', 'Начало', 'Конец', 'Вердикт', 'Игрок или тикет', 'Проблема', 'Раз в логе']];
  c.items.forEach(function (x) { rows.push([x.e.label, x.e.kind, x.e.from || fmtDT(x.t), x.e.to || '', STRU[x.e.status], S.kb.tags[x.h] || '', x.p.t, x.p.n]); });
  return M(csvText(rows));
}
function repHtml(c) {
  var e = esc, css = 'body{font:15px/1.6 system-ui,Segoe UI,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#0c1420}h1{font-size:22px;margin:0 0 4px}pre{background:#eef1f5;padding:12px 14px;border-radius:6px;white-space:pre-wrap}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #cdd3dc;padding:6px 8px;text-align:left}.m{color:#5c6879}';
  var h = '<h1>' + e(M(c.title)) + '</h1><p class="m">' + e(SEVRU[c.sev]) + '. Логов: ' + c.n + '. Период: ' + fmtDT(c.start) + ' - ' + fmtDT(c.end) + ' (' + fmtSpan(c.end - c.start) + ').</p>';
  if (c.examples.length) h += '<h3>Признак в логах</h3><pre>' + e(M(c.examples.join('\n'))) + '</pre>';
  if (c.cause) h += '<h3>Вероятная причина</h3><p>' + e(M(c.cause)) + '</p>';
  if (c.fix.length) h += '<h3>Что рекомендует руководство</h3><ol>' + c.fix.map(function (x) { return '<li>' + e(M(x)) + '</li>'; }).join('') + '</ol>';
  h += '<h3>Затронутые логи</h3><table><tr><th>Файл</th><th>Тип</th><th>Начало</th><th>Вердикт</th><th>Игрок или тикет</th></tr>' + c.items.map(function (x) { return '<tr><td>' + e(M(x.e.label)) + '</td><td>' + x.e.kind + '</td><td>' + e(x.e.from || fmtDT(x.t)) + '</td><td>' + STRU[x.e.status] + '</td><td>' + e(S.kb.tags[x.h] || '') + '</td></tr>'; }).join('') + '</table><p class="m">Отчёт сформирован автоматически по загруженным логам.</p>';
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт: ' + e(M(c.title)) + '</title><style>' + css + '</style></head><body>' + h + '</body></html>';
}
async function saveText(name, data) {
  if (window.nativeApp) { try { var sv = await window.nativeApp.save(name, data); if (sv) status('Сохранено: ' + sv); return; } catch (e) {} }
  var d = null; try { d = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { d = null; }
  if (d) { try { await d.save({ filename: name, data: data }); status('Сохранено.'); return; } catch (e) { if (e && e.code === 'declined') return; } }
  copyText(data, name, 'Сохраните этот текст в файл ' + name + '.');
}
function renderReports() {
  var R = reports(), st = S.kb.settings, mn = st.repMin || 3, hr = st.repHours || 6;
  var h = '<div class="card plain"><div class="lt"><span>Отчёт создаётся, если одна проблема найдена не меньше чем в</span><input type="text" id="repMin" value="' + mn + '" inputmode="numeric" aria-label="Минимум логов" style="width:64px"><span>логах за</span><input type="text" id="repHours" value="' + hr + '" inputmode="numeric" aria-label="Окно в часах" style="width:64px"><span>ч.</span></div></div>';
  if (!R.length) h += '<div class="card empty">Повторяющихся проблем пока нет. Когда одна и та же проблема встретится в ' + mn + ' и более логах за ' + hr + ' ч, здесь появится готовый отчёт, который можно сразу передать дальше.</div>';
  R.forEach(function (c, i) {
    var tg = repTags(c);
    h += '<div class="card rep"><div class="lt"><span class="pill sev-' + c.sev + '">' + SEVRU[c.sev] + '</span><h3 class="sec" style="margin:0;flex:1">' + esc(M(c.title)) + '</h3><span class="kind">' + c.n + ' логов</span></div>' +
      (c.also && c.also.length ? '<p class="hint" style="margin:8px 0 0">Также в этих же логах: ' + esc(M(c.also.join('; '))) + '</p>' : '') + '<p class="hint" style="margin:8px 0 14px">Логи добавлены ' + (c.end - c.start < 60000 ? fmtDT(c.start) : fmtDT(c.start) + ' – ' + fmtDT(c.end).slice(fmtDT(c.start).slice(0, 10) === fmtDT(c.end).slice(0, 10) ? 11 : 0) + ' (' + fmtSpan(c.end - c.start) + ')') + ' · main: ' + (c.kinds.main || 0) + ', client: ' + (c.kinds.client || 0) + (c.bad ? ' · со сбоем запуска: ' + c.bad : '') + '</p>' +
      (tg.length ? '<div class="chips" style="margin-bottom:12px">' + tg.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '');
    h += '<div class="fd-cols" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px 40px">';
    h += '<div class="rcol" style="display:grid;gap:16px;align-content:start;min-width:0">' + (c.examples.length ? '<div><h4>Признак в логах</h4><div class="dets">' + c.examples.map(function (l) { return '<div>' + esc(M(l)) + '</div>'; }).join('') + '</div></div>' : '') + (c.cause ? '<div><h4>Вероятная причина</h4><p class="cause" style="margin:0">' + esc(M(c.cause)) + '</p></div>' : '') + '</div>';
    h += '<div class="rcol" style="min-width:0">' + (c.fix.length ? '<h4>Что делать</h4><ol class="steps">' + c.fix.map(function (x) { return '<li><span>' + esc(M(x)) + '</span></li>'; }).join('') + '</ol>' : '<p class="hint" style="margin:0">Готового решения в руководстве нет. Опишите проблему в отчёте и передайте дальше.</p>') + '</div></div>';
    h += '<details class="plain" style="margin-top:16px"><summary>Затронутые логи (' + c.n + ')</summary><div class="tbl-wrap"><table class="at"><thead><tr><th>Файл</th><th>Тип</th><th>Начало</th><th>Вердикт</th><th>Игрок или тикет</th></tr></thead><tbody>' + c.items.map(function (x) { return '<tr><td>' + esc(M(x.e.label)) + '</td><td>' + x.e.kind + '</td><td>' + esc(x.e.from || fmtDT(x.t)) + '</td><td>' + STRU[x.e.status] + '</td><td>' + esc(S.kb.tags[x.h] || '') + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
    h += '<div class="row-actions" style="margin-top:16px"><button class="btn sm primary" data-act="repCopy" data-i="' + i + '">Скопировать отчёт</button><button class="btn sm" data-act="repCsv" data-i="' + i + '">Список в CSV</button><button class="btn sm" data-act="repHtml" data-i="' + i + '">Отчёт HTML</button></div></div>';
  });
  $('#view').innerHTML = h;
}

/* таблица всех логов */
function allRows() {
  var ord = { bad: 0, warn: 1, unk: 2, ok: 3 };
  var rows = S.files.filter(function (f) { return !f.sample; }).map(function (f) {
    var sc = f.sc, probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
    return { f: f, label: f.label, kind: sc.kind, from: sc.range ? sc.range.from : '', status: sc.verdict.status, head: sc.verdict.headline, probs: probs.length, mods: sc.mods ? sc.mods.files.length : 0, tag: S.kb.tags[f.hash] || '' };
  });
  var s = S.allSort;
  rows.sort(function (a, b) { if (s === 'name') return a.label.localeCompare(b.label); if (s === 'time') return String(b.from).localeCompare(String(a.from)); return (b.mods ? 1 : 0) - (a.mods ? 1 : 0) || ord[a.status] - ord[b.status] || b.probs - a.probs; });
  return rows;
}
function renderAll() {
  var rowsAll = allRows(), rows = S.allF === 'open' ? rowsAll.filter(function (r) { return stOf(r.f) !== 'done'; }) : rowsAll, FL = S.allFlt, wk = weekRange();
  if (FL.bad) rows = rows.filter(function (r) { return r.status === 'bad'; });
  if (FL.mods) rows = rows.filter(function (r) { return r.mods; });
  if (FL.week) rows = rows.filter(function (r) { var t = Date.parse(String(r.from).slice(0, 19).replace(' ', 'T')); return !t || t >= wk; });
  if (!rowsAll.length) { $('#view').innerHTML = '<div class="card empty">Добавьте несколько логов, и здесь появится сводная таблица по всем файлам.</div>'; return; }
  var bad = rows.filter(function (r) { return r.status === 'bad'; }).length, mods = rows.filter(function (r) { return r.mods; }).length;
  var h = '<div class="card"><div class="stats"><div><b>' + rows.length + '</b><span>файлов загружено</span></div><div><b>' + bad + '</b><span>со сбоем</span></div><div><b>' + mods + '</b><span>с модами в папке игры</span></div></div></div>';
  h += '<div class="lt"><div class="seg" role="group" aria-label="Сортировка">' + [['sev', 'Сначала важные'], ['time', 'Сначала новые'], ['name', 'По имени']].map(function (x) { return '<button data-act="allSort" data-v="' + x[0] + '" class="' + (S.allSort === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><div class="seg" role="group" aria-label="Фильтр">' + [['open', 'Открытые'], ['all', 'Все']].map(function (x) { return '<button data-act="allF" data-v="' + x[0] + '" class="' + (S.allF === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><div class="seg" role="group" aria-label="Условия">' + [['bad', 'Сбои'], ['mods', 'С модами'], ['week', 'За 7 дней']].map(function (x) { return '<button data-act="fl" data-v="' + x[0] + '" class="' + (S.allFlt[x[0]] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div><span style="flex:1"></span><button class="btn sm" data-act="allCsv">Список в CSV</button></div>' + presetBar();
  h = '<div class="card plain"><input type="search" id="allQ" value="' + esc(S.allQ) + '" placeholder="Поиск по всем логам и истории: мод, код ошибки, ник, тикет" aria-label="Поиск"></div><div id="allRes"></div><div id="allTbl">' + h;
  h += '<div class="card" style="padding:8px 4px"><div class="tbl-wrap" style="margin:0"><table class="at"><thead><tr><th>Файл</th><th>Начало</th><th>Вердикт</th><th>Главная причина</th><th>Проблем</th><th>Моды</th><th>Игрок</th><th>Папка</th><th>Статус</th></tr></thead><tbody>' +
    rows.map(function (r) { return '<tr style="cursor:pointer" data-act="openDiag" data-id="' + r.f.id + '"><td>' + esc(r.label) + ' <span class="mut">' + r.kind + '</span></td><td>' + esc(r.from.slice(0, 16)) + '</td><td><span class="st st-' + r.status + '">' + STRU[r.status] + '</span></td><td class="wrapc">' + esc(M(r.head)) + '</td><td>' + r.probs + '</td><td>' + (r.mods ? '<span class="st st-mod">МОД</span>' : '') + '</td><td>' + esc(r.tag) + '</td><td class="fcol">' + esc((folderOf(r.f) || {}).name || '') + '</td><td>' + stSelect(r.f, 'sm') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (rows.length ? '' : '<p class="hint" style="padding:0 16px">Все тикеты закрыты. Переключите на «Все», чтобы увидеть их.</p>') + '</div></div>';
  $('#view').innerHTML = h; drawSearch();
}
function presetBar() {
  var P = S.kb.settings.presets || [];
  return '<div class="lt" style="flex-wrap:wrap"><span class="hint">Сохранённые фильтры:</span>' + P.map(function (x, i) { return '<span class="seg"><button data-act="preset" data-i="' + i + '">' + esc(x.name) + '</button><button data-act="presetDel" data-i="' + i + '" aria-label="Удалить фильтр" title="Удалить">×</button></span>'; }).join('') + '<input type="text" id="presetName" placeholder="Название для текущих условий" style="max-width:240px"><button class="btn sm" data-act="presetSave">Сохранить</button></div>';
}
function savePreset() {
  var nm = ($('#presetName') && $('#presetName').value || '').trim().slice(0, 30); if (!nm) { status('Введите название фильтра.'); return; }
  var P = S.kb.settings.presets = S.kb.settings.presets || []; P.push({ name: nm, f: S.allF, sort: S.allSort, flt: { bad: !!S.allFlt.bad, mods: !!S.allFlt.mods, week: !!S.allFlt.week } }); saveKB(); renderAll();
}
function applyPreset(i) { var x = (S.kb.settings.presets || [])[i]; if (!x) return; S.allF = x.f || 'open'; S.allSort = x.sort || 'sev'; S.allFlt = { bad: !!x.flt.bad, mods: !!x.flt.mods, week: !!x.flt.week }; renderAll(); }
function allCsv() {
  var rows = [['Файл', 'Тип', 'Начало', 'Вердикт', 'Главная причина', 'Проблем', 'Файлов-модов', 'Игрок или тикет', 'Статус']];
  allRows().forEach(function (r) { rows.push([r.label, r.kind, r.from, STRU[r.status], r.head, r.probs, r.mods, r.tag, TST[stOf(r.f)]]); });
  return M(csvText(rows));
}

/* окно «Логи загружены» */
function ldRow(f) {
  var sc = f.sc, v = sc.verdict;
  return '<div class="ld" data-id="' + f.id + '"><div style="min-width:0"><b style="overflow-wrap:anywhere">' + esc(f.label) + '</b><div class="hint">' + (sc.kindName || sc.kind) + '.log' + (sc.range ? ', ' + esc(sc.range.from.slice(0, 19)) + ' - ' + esc(sc.range.to.slice(0, 19)) : '') + ', ' + fmtSize(f.size) + (f.mtime ? ', файл изменён ' + fmtDT(f.mtime) : '') + '</div></div><span class="st st-' + v.status + '">' + STRU[v.status] + '</span>' +
    '<button class="btn sm ghost" data-act="ldDrop" data-id="' + f.id + '" title="Убрать этот лог из приложения и из истории">Не тот лог</button><div class="hl hint">' + esc(M(v.headline)) + '</div></div>';
}
function showLoaded(files, skipped, meta, alerts) {
  S.ld = { ids: files.map(function (f) { return f.id; }) };
  var h = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Логи загружены">';
  if (meta.notify) {
    h += '<b id="ldTitle">' + (files.length ? 'Загружено логов: ' + files.length : 'Новых логов нет') + '</b>';
    h += '<p class="hint" style="margin:0">' + (meta.source ? 'Источник: ' + esc(meta.source) + '. ' : '') + 'Проверьте, что это логи нужного игрока: имя файла, время и размер указаны ниже.</p>';
    if (files.length) h += '<div id="ldList">' + files.map(ldRow).join('') + '</div><label class="nl">Игрок или тикет для этих логов<input type="text" id="ldTag" placeholder="например: ticket-1234 или ник"></label>';
    if (skipped.length) h += '<p class="hint" style="margin:0">Уже были загружены: ' + esc(skipped.join(', ')) + '.</p>';
  }
  (alerts || []).forEach(function (c) {
    h += '<div class="alertbox"><b>Повторяющаяся проблема: ' + esc(M(c.title)) + '</b><div class="hint">Найдена в ' + c.n + ' логах за ' + fmtSpan(c.end - c.start) + '. Отчёт для передачи дальше уже собран.</div></div>';
  });
  h += '<div class="row-actions"><button class="btn primary" data-act="ldOk">' + (files.length ? 'Всё верно, открыть' : 'Понятно') + '</button>' + ((alerts || []).length ? '<button class="btn" data-act="repOpen">Открыть отчёты</button>' : '') + '</div></div></div>';
  $('#panelHost').innerHTML = h;
}
function ldSaveTag() { var tg = $('#ldTag'); if (tg && tg.value.trim() && S.ld) { S.ld.ids.forEach(function (id) { var ff = S.files.find(function (x) { return x.id === id; }); if (ff) { S.kb.tags[ff.hash] = tg.value.trim(); ticketPush(ff); ticketLookup(ff, false); } }); saveKB(); } }
function showWhatsNew() {
  var cur = CHANGELOG[0]; if (!cur) return;
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Что нового"><b>Что нового в версии ' + esc(cur.v) + '</b><ul style="margin:0;padding-left:20px;display:grid;gap:8px">' + cur.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><div class="row-actions"><button class="btn primary" data-act="closePanel">Понятно</button></div></div></div>';
}

/* автозагрузка, ссылка */
async function openWatch() {
  var i = null; try { i = await window.nativeApp.watchInfo(); } catch (e) {}
  var on = i && i.dir;
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Автозагрузка логов"><b>Автозагрузка новых логов</b><p class="hint" style="margin:0">Когда в выбранной папке появляется новый файл .log (например, вы скачали лог из тикета), приложение само его загрузит и покажет окно для проверки. Файлы, которые уже лежат в папке, не трогаются.</p>' +
    '<p style="margin:0">' + (on ? 'Включено для папки: <code>' + esc(i.dir) + '</code>' : 'Сейчас выключено.') + '</p><div class="row-actions"><button class="btn sm primary" data-act="watchDl">' + (i && i.downloads ? 'Следить за Загрузками' : 'Следить за Загрузками') + '</button><button class="btn sm" data-act="watchPick">Выбрать другую папку</button>' + (on ? '<button class="btn sm" data-act="watchOff">Выключить</button>' : '') + '<button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
}
function openUrl() {
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Загрузка по ссылке"><b>Загрузить лог по ссылке</b><p class="hint" style="margin:0">Вставьте ссылку на файл .log или .txt (например, вложение из тикета). Ссылка должна начинаться с https://.</p><input type="text" id="urlIn" placeholder="https://..."><p class="hint" id="urlMsg" style="margin:0"></p><div class="row-actions"><button class="btn sm primary" data-act="urlGo">Загрузить</button><button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
  setTimeout(function () { var el = $('#urlIn'); if (el) el.focus(); }, 30);
}
async function loadUrl(u) {
  var msg = function (t) { var el = $('#urlMsg'); if (el) el.textContent = t; };
  u = String(u || '').trim();
  if (!/^https:\/\//i.test(u)) { msg('Ссылка должна начинаться с https://'); return; }
  msg('Скачиваю…');
  try {
    var r = await window.nativeApp.fetchUrl(u);
    if (!r || r.error) { msg(r && r.error || 'Не удалось скачать файл.'); return; }
    $('#panelHost').innerHTML = '';
    await addTexts([{ name: r.name, size: r.size, text: r.text }], { notify: true, source: 'ссылка' });
  } catch (e) { msg('Не удалось скачать файл: ' + (e && e.message ? e.message : e)); }
}
var watchQ = [], watchT = null;
function onWatch(ev) { watchQ = watchQ.filter(function (x) { return x.path !== ev.path; }); watchQ.push(ev); clearTimeout(watchT); watchT = setTimeout(flushWatch, 2500); }
async function flushWatch() {
  var list = watchQ.splice(0), items = [];
  for (var i = 0; i < list.length; i++) { try { var t = await window.nativeApp.readFile(list[i].path); if (t != null) items.push({ name: list[i].name, size: list[i].size, text: t, mtime: list[i].mtime }); } catch (e) {} }
  if (items.length) await addTexts(items, { notify: true, source: 'автозагрузка из папки' });
}
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  var b = $('#btnTheme'); if (b) b.textContent = THEME_RU[t] || THEME_RU.auto;
}


/* ---------- Версия 15: статусы, поиск, недельный отчёт ---------- */
var TST = { new: 'Новый', work: 'В работе', replied: 'Ответил', wait: 'Ждём игрока', done: 'Закрыт' };
S.allF = 'open'; S.allFlt = { bad: false, mods: false, week: false }; S.allQ = ''; S.folder = null; S.open = {}; S.target = null; S.gAdd = null; S.renaming = null; S.pins = {};
function stOf(f) { return S.kb.status[f.hash] || 'new'; }
function stSelect(f, cls) { return '<select class="sel ' + (cls || '') + '" data-act="tstatus" data-id="' + f.id + '" aria-label="Статус тикета">' + Object.keys(TST).map(function (k) { return '<option value="' + k + '"' + (stOf(f) === k ? ' selected' : '') + '>' + TST[k] + '</option>'; }).join('') + '</select>'; }
function prevSameTag(f) {
  var tg = S.kb.tags[f.hash]; if (!tg) return null;
  var t0 = fileTime(f), c = S.files.filter(function (x) { return x !== f && !x.sample && S.kb.tags[x.hash] === tg; });
  var same = c.filter(function (x) { return x.sc.kind === f.sc.kind; }); if (same.length) c = same;
  c = c.filter(function (x) { return fileTime(x) <= t0; }).sort(function (a, b) { return fileTime(b) - fileTime(a); });
  return c[0] || null;
}
function openCmpFor(f) { var pv = prevSameTag(f); if (!pv) return false; S.cmpA = pv.id; S.cmpB = f.id; S.tab = 'cmp'; return pv; }
function searchData(q) {
  var ql = q.toLowerCase(), res = [], hist = [];
  S.files.forEach(function (f) {
    if (f.sample) return;
    var hits = [], total = 0, es = f.parsed.entries;
    for (var i = 0; i < es.length; i++) { if (es[i].text.toLowerCase().indexOf(ql) >= 0) { total++; if (hits.length < 4) hits.push(es[i]); } }
    var meta = (f.label + ' ' + (S.kb.tags[f.hash] || '') + ' ' + f.sc.verdict.headline).toLowerCase().indexOf(ql) >= 0;
    if (total || meta) res.push({ f: f, total: total, hits: hits, meta: meta });
  });
  var loaded = {}; S.files.forEach(function (f) { loaded[f.hash] = 1; });
  Object.keys(S.kb.hist).forEach(function (h) {
    if (loaded[h]) return; var e = S.kb.hist[h];
    var blob = (e.label + ' ' + (S.kb.tags[h] || '') + ' ' + e.headline + ' ' + e.mods.join(' ') + ' ' + e.probs.map(function (p) { return p.t; }).join(' ')).toLowerCase();
    if (blob.indexOf(ql) >= 0) hist.push(e);
  });
  return { res: res, hist: hist.slice(0, 30) };
}
function drawSearch() {
  var q = S.allQ.trim(), box = $('#allRes'), tbl = $('#allTbl'); if (!box || !tbl) return;
  if (q.length < 2) { box.innerHTML = ''; tbl.hidden = false; return; }
  tbl.hidden = true; var d = searchData(q);
  var h = '<div class="card">' + (d.res.length ? d.res.map(function (r) {
    return '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="lt"><b>' + esc(M(r.f.label)) + '</b><span class="kind">' + (r.f.sc.kindName || r.f.sc.kind) + '</span><span class="hint">совпадений в тексте: ' + r.total + '</span><span style="flex:1"></span><button class="btn sm" data-act="openDiag" data-id="' + r.f.id + '">Открыть диагноз</button></div>' +
      r.hits.map(function (e) { return '<div class="dets" style="margin-top:6px"><div><button class="chip" data-act="sjump" data-id="' + r.f.id + '" data-line="' + e.i + '">L' + (e.i + 1) + '</button> ' + esc(M(e.text.split(' ⏎ ')[0]).slice(0, 220)) + '</div></div>'; }).join('') + '</div>';
  }).join('') : '<p class="hint" style="margin:0">В загруженных логах совпадений нет.</p>') + '</div>';
  var ql = q.toLowerCase(), cm = folderList().filter(function (fo) { return fo.name.toLowerCase().indexOf(ql) >= 0 || ((S.kb.settings.caseNotes || {})[fo.id] || '').toLowerCase().indexOf(ql) >= 0; });
  if (cm.length) h = '<div class="card"><h3 class="sec" style="margin:0 0 6px">Дела <span class="n">' + cm.length + '</span></h3>' + cm.map(function (fo) { return '<div class="rowbar" style="padding:6px 0"><button class="btn sm" data-act="gcase" data-id="' + esc(fo.id) + '">Открыть дело</button> <b>' + esc(fo.name) + '</b> <span class="hint">логов: ' + fo.files.length + '</span></div>'; }).join('') + '</div>' + h;
  if (d.hist.length) h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">В истории (логи сейчас не загружены) <span class="n">' + d.hist.length + '</span></h3>' + d.hist.map(function (e) { return '<div class="rowbar" style="grid-template-columns:minmax(0,1fr) auto"><span>' + esc(M(e.label)) + ' <span class="hint">' + esc(M(e.headline)) + '</span></span><span class="mono">' + esc((e.from || '').slice(0, 16)) + '</span></div>'; }).join('') + '</div>';
  box.innerHTML = h;
}
function weekRange() { return Date.now() - 7 * 86400000; }
function weekChart() {
  var since = weekRange(), by = dayBars(since), days = Object.keys(by).sort(); if (!days.length) return '';
  var mx = Math.max.apply(null, days.map(function (x) { return by[x].n; }));
  return '<h2 style="font-size:16px">Логов по дням</h2>' + days.map(function (x) { var o = by[x]; return '<div style="display:flex;gap:8px;align-items:center;margin:3px 0"><span style="width:84px;font-size:13px">' + x + '</span><div style="flex:1;background:#eef1f5;height:14px;border-radius:3px;overflow:hidden"><div style="width:' + Math.round(o.n * 100 / mx) + '%;height:100%;background:#9aa8bd;position:relative"><div style="position:absolute;left:0;top:0;height:100%;width:' + Math.round(o.bad * 100 / Math.max(o.n, 1)) + '%;background:#b8232b"></div></div></div><span style="font-size:13px;width:70px">' + o.n + ' (сбоев ' + o.bad + ')</span></div>'; }).join('');
}
function weekText() {
  var since = weekRange(), d = statsData(since), pct = function (x) { return d.n ? Math.round(x * 100 / d.n) + '%' : '0%'; };
  var L = ['НЕДЕЛЬНЫЙ ОТЧЁТ ПО ЛОГАМ', 'Период: ' + fmtDT(since).slice(0, 10) + ' - ' + fmtDT(Date.now()).slice(0, 10), '',
    'Логов за неделю: ' + d.n + ' (main: ' + d.kinds.main + ', client: ' + d.kinds.client + ')', 'Со сбоем: ' + d.bad + ' (' + pct(d.bad) + '), успешных: ' + d.ok + ' (' + pct(d.ok) + ')', 'С модами в папке игры: ' + d.mods + ' (' + pct(d.mods) + ')', ''];
  var causes = Object.keys(d.causes).map(function (t) { return [t, d.causes[t]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
  if (causes.length) { L.push('Частые причины:'); causes.forEach(function (c, i) { L.push('  ' + (i + 1) + '. ' + c[0] + ': ' + c[1] + ' (' + pct(c[1]) + ')'); }); L.push(''); }
  var rp = reports().filter(function (c) { return c.end >= since; });
  if (rp.length) { L.push('Повторяющиеся проблемы:'); rp.forEach(function (c) { L.push('  - ' + c.title + ': ' + c.n + ' логов, ' + fmtDT(c.start) + ' - ' + fmtDT(c.end)); }); L.push(''); }
  var open = S.files.filter(function (f) { return !f.sample && stOf(f) !== 'done'; }).length;
  L.push('Открытых тикетов среди загруженных логов: ' + open);
  return M(L.join('\n'));
}
async function exportWeekPdf() {
  var html = weekHtml(true), nm = 'nedelya-' + fmtDT(Date.now()).slice(0, 10) + '.pdf';
  if (window.nativeApp && window.nativeApp.pdf) { try { var pr = await window.nativeApp.pdf(nm, html); if (pr) status('PDF сохранён: ' + pr); } catch (e) { status('Не удалось создать PDF.'); } }
  else saveText('nedelya-' + fmtDT(Date.now()).slice(0, 10) + '.html', html);
}
function weekHtml(withChart) {
  var t = weekText().split('\n'), css = 'body{font:15px/1.6 system-ui,Segoe UI,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#0c1420}h1{font-size:22px}pre{white-space:pre-wrap;background:#eef1f5;padding:14px;border-radius:6px}';
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Недельный отчёт</title><style>' + css + '</style></head><body><h1>' + esc(t[0]) + '</h1>' + (withChart ? weekChart() : '') + '<pre>' + esc(t.slice(1).join('\n')) + '</pre></body></html>';
}


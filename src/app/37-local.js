/* ---------- Логи на этом ПК (только приложение) ---------- */
async function openLogsPanel() {
  var r = null; try { r = await window.nativeApp.findLogs(); } catch (e) {}
  S.found = r && r.files ? r.files : [];
  var h = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Логи на этом компьютере"><b>Логи Majestic на этом компьютере</b>';
  if (!S.found.length) h += '<p class="hint" style="margin:0">Не нашёл файлов логов в ' + esc(r && r.dir || '%APPDATA%\\majestic-launcher') + '. Лаунчер ещё не запускался или логи лежат в другом месте: добавьте их кнопкой «Добавить логи».</p>';
  else {
    h += '<p class="hint" style="margin:0">Папка: ' + esc(r.dir) + '. Новые сверху.</p><div style="max-height:300px;overflow:auto;display:grid;gap:4px">' + S.found.slice(0, 40).map(function (x, i) { return '<div class="lt"><span class="kind">' + (/client/i.test(x.name) ? 'client' : 'main') + '</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.path) + '">' + esc(x.name) + '</span><span class="hint">' + esc(new Date(x.mtime).toLocaleString('ru')) + ', ' + fmtSize(x.size) + '</span><button class="btn sm" data-act="plLoad" data-i="' + i + '">Загрузить</button></div>'; }).join('') + '</div>';
    h += '<div class="row-actions"><button class="btn sm primary" data-act="plLatest">Загрузить свежие main и client</button><button class="btn sm" data-act="plAll">Загрузить все (' + Math.min(S.found.length, 40) + ')</button><button class="btn sm" data-act="plOpen">Открыть папку</button><button class="btn sm" data-act="closePanel">Закрыть</button></div>';
  }
  $('#panelHost').innerHTML = h + (S.found.length ? '' : '<div class="row-actions"><button class="btn sm" data-act="closePanel">Закрыть</button></div>') + '</div></div>';
}
async function loadFound(list, asGroup) {
  var items = [];
  for (var i = 0; i < list.length; i++) {
    status('Читаю ' + (i + 1) + ' из ' + list.length + '…'); await tick();
    try { var t = await window.nativeApp.readFile(list[i].path); if (t != null) items.push({ name: list[i].name, size: list[i].size, text: t, group: asGroup ? { id: 'p:launcher', name: 'Логи лаунчера', type: 'dir' } : null }); } catch (e) {}
  }
  $('#panelHost').innerHTML = '';
  if (items.length) await addTexts(items); else status('Не удалось прочитать файлы.');
}

/* ---------- Отчёт HTML / PDF ---------- */
var REPORT_CSS = 'body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#151c28}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 8px;border-bottom:1px solid #d5dbe6;padding-bottom:4px}h3{font-size:15px;margin:0 0 4px}.m,.c,.n{color:#586377;font-size: 13px}.v{border:1px solid #d5dbe6;border-left-width:5px;border-radius:6px;padding:8px 12px}.v.ok{border-left-color:#17794e}.v.bad{border-left-color:#b8232b}.v.warn{border-left-color:#9a6a0c}.prio{background:#b8232b;color:#fff;border-radius:8px;padding:6px 14px;margin:14px 0}.prio code{background:rgba(255,255,255,.2);color:#fff}.f{border:1px solid #d5dbe6;border-radius:8px;padding:8px 12px;margin:8px 0;break-inside:avoid}pre,code{font:12px Consolas,monospace;background:#eef1f6;border-radius:4px;padding:1px 5px}pre{padding:8px;white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size: 13px}td,th{border:1px solid #d5dbe6;padding:3px 7px;text-align:left}';
function buildReportHTML(f) {
  var sc = f.sc, v = sc.verdict, probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }), e = function (x) { return esc(M(x)); }, h = '';
  h += '<h1>Разбор лога: ' + e(f.label) + '</h1><p class="m">' + (sc.kindName || sc.kind) + '.log' + (sc.range ? ', ' + e(sc.range.from) + ' → ' + e(sc.range.to) : '') + (S.kb.tags[f.hash] ? ', игрок/тикет: ' + e(S.kb.tags[f.hash]) : '') + '. Отчёт создан ' + new Date().toLocaleString('ru') + '</p>';
  h += '<div class="v ' + v.status + '"><b>' + STRU[v.status] + '.</b> ' + e(v.headline) + v.lines.map(function (l) { return '<p>' + e(l) + '</p>'; }).join('') + '</div>';
  var mods = (sc.mods ? sc.mods.files : []).concat(folderMods(f));
  if (mods.length) h += '<div class="prio"><h2>Моды в папке игры (главная причина)</h2><ul>' + mods.map(function (x) { return '<li><code>' + e(x) + '</code></li>'; }).join('') + '</ul><p>Перенести в папку модификаций лаунчера или удалить из папки GTA V.</p></div>';
  h += '<h2>Найденные проблемы (' + probs.length + ')</h2>';
  probs.forEach(function (g, i) {
    h += '<div class="f"><h3>' + (i + 1) + '. ' + e(g.title) + ' <span class="c">×' + g.count + ', ' + SEVRU[g.sev] + ', ' + SRCRU[g.src] + '</span></h3>' + (g.cause ? '<p>' + e(g.cause) + '</p>' : '') + (g.fix.length ? '<ol>' + g.fix.map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ol>' : '');
    var d = Array.from(g.dets.keys()).slice(0, 3); if (d.length) h += '<pre>' + d.map(function (x) { return e(x.slice(0, 260)); }).join('\n') + '</pre>';
    var nt = S.kb.ruleNotes[g.key]; if (nt) h += '<p class="n">Заметка: ' + e(nt) + '</p>';
    h += '</div>';
  });
  if (!probs.length) h += '<p>Известных проблем по правилам не найдено.</p>';
  if (sc.attempts && sc.attempts.length) {
    var OUT = { ok: 'Игра запущена', patched: 'Патчер успешен', fail: 'Отказ', crash: 'Краш игры', cancel: 'Отменён', unk: 'Без итога' };
    h += '<h2>Попытки запуска (' + sc.attempts.length + ')</h2><table><tr><th>#</th><th>Время</th><th>Итог</th><th>Подробности</th></tr>' + sc.attempts.slice(0, 40).map(function (a, i) { return '<tr><td>' + (i + 1) + '</td><td>' + e(a.date + ' ' + a.ts.slice(0, 8)) + '</td><td>' + OUT[a.out] + '</td><td>' + e((a.message || a.reason || '').slice(0, 120)) + '</td></tr>'; }).join('') + '</table>';
  }
  if (f.marks.length) h += '<h2>Отмеченные строки</h2><pre>' + f.marks.slice().sort(function (a, b) { return a - b; }).slice(0, 20).map(function (m) { return e('L' + (m + 1) + ': ' + LA.stripAnsi(f.parsed.lines[m]).slice(0, 240)); }).join('\n') + '</pre>';
  var css = REPORT_CSS;
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Разбор лога ' + e(f.label) + '</title><style>' + css + '</style></head><body>' + h + '</body></html>';
}
async function exportReport(f, type) { return exportHtmlDoc('report-' + f.label.replace(/[^\w.\-а-яё]+/gi, '_').slice(0, 40), buildReportHTML(f), type); }
async function exportHtmlDoc(base, html, type) {
  if (type === 'pdf' && window.nativeApp && window.nativeApp.pdf) { try { var pr = await window.nativeApp.pdf(base + '.pdf', html); if (pr) status('PDF сохранён: ' + pr); } catch (e) { status('Не удалось создать PDF.'); } return; }
  if (window.nativeApp) { try { var sv = await window.nativeApp.save(base + '.html', html); if (sv) status('Отчёт сохранён: ' + sv); return; } catch (e) {} }
  var d = null; try { d = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { d = null; }
  if (d) { try { await d.save({ filename: base + '.html', data: html }); status('Отчёт сохранён.'); return; } catch (e) { if (e && e.code === 'declined') return; } }
  copyText(html, 'Отчёт (HTML)', 'Сохраните текст в файл .html и откройте в браузере; оттуда можно распечатать в PDF.');
}

/* ---------- Сравнение логов ---------- */
function timeOf(h, k) {
  var from = h.from || '', m;
  if (/^\d{4}-\d\d-\d\d/.test(from)) return Date.parse(from.replace(' ', 'T').slice(0, 19)) || h.added;
  m = /(\d{4}-\d\d-\d\d)[_ ](\d\d)-(\d\d)-(\d\d)/.exec(h.label || '');
  if (m) return Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4]) || h.added;
  return h.added || 0;
}
function fileTime(f) { return f.sc.range && /^\d{4}/.test(f.sc.range.from) ? (Date.parse(f.sc.range.from.replace(' ', 'T').slice(0, 19)) || 0) : (timeOf({ label: f.label, from: '', added: f.id }, f.sc.kind)); }
function renderCompare() {
  var fl = S.files;
  if (fl.length < 2) { $('#view').innerHTML = '<div class="card empty">Для сравнения нужно минимум два лога. Добавьте лог «до» и лог «после» (например, до и после удаления модов).</div>'; return; }
  var ids = fl.map(function (f) { return f.id; });
  if (ids.indexOf(S.cmpA) < 0 || ids.indexOf(S.cmpB) < 0 || S.cmpA === S.cmpB) {
    var same = fl.filter(function (f) { return f.sc.kind === (active() || fl[0]).sc.kind; }).sort(function (a, b) { return fileTime(a) - fileTime(b); });
    if (same.length < 2) same = fl.slice().sort(function (a, b) { return fileTime(a) - fileTime(b); });
    S.cmpA = same[same.length - 2].id; S.cmpB = same[same.length - 1].id;
  }
  var a = fl.find(function (f) { return f.id === S.cmpA; }), b = fl.find(function (f) { return f.id === S.cmpB; });
  var opt = function (sel) { return fl.map(function (f) { return '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + esc(f.label) + ' (' + f.sc.kind + ', ' + STRU[f.sc.verdict.status] + ')</option>'; }).join(''); };
  var h = '<div class="card"><div class="lt"><label class="nl inl">Старый лог (до)<select class="sel" id="cmpA">' + opt(S.cmpA) + '</select></label><label class="nl inl">Новый лог (после)<select class="sel" id="cmpB">' + opt(S.cmpB) + '</select></label></div>';
  if (a.sc.kind !== b.sc.kind) h += '<p class="hint">Логи разных типов (' + a.sc.kind + ' и ' + b.sc.kind + '): сравнение будет неполным.</p>';
  var d = LA.diffScans(a.sc, b.sc), rank = { bad: 0, warn: 1, unk: 1, ok: 2 }, better = rank[d.sb] > rank[d.sa] || (rank[d.sb] === rank[d.sa] && (d.gone.length + d.modsGone.length) > (d.fresh.length + d.modsFresh.length)), worse = rank[d.sb] < rank[d.sa] || (rank[d.sb] === rank[d.sa] && (d.fresh.length + d.modsFresh.length) > (d.gone.length + d.modsGone.length));
  h += '<h2 style="margin:10px 0 4px">' + (better ? 'Стало лучше' : worse ? 'Стало хуже' : 'Существенных изменений нет') + '</h2><p>Было: <b>' + STRU[d.sa] + '</b>, ' + esc(M(d.ha)) + '</p><p>Стало: <b>' + STRU[d.sb] + '</b>, ' + esc(M(d.hb)) + '</p></div>';
  var list = function (title, cls, arr, fmt) { return arr.length ? '<div class="card"><h3 class="sec ' + cls + '" style="margin:0 0 6px">' + title + ' (' + arr.length + ')</h3><ul class="dl">' + arr.map(function (x) { return '<li>' + fmt(x) + '</li>'; }).join('') + '</ul></div>' : ''; };
  h += list('Моды: убраны', 'dgone', d.modsGone, function (x) { return '<code>' + esc(M(x)) + '</code>'; });
  h += list('Моды: остались', 'dkeep', d.modsKept, function (x) { return '<code>' + esc(M(x)) + '</code>'; });
  h += list('Моды: появились', 'dnew', d.modsFresh, function (x) { return '<code>' + esc(M(x)) + '</code>'; });
  h += list('Проблемы исчезли', 'dgone', d.gone, function (g) { return esc(g.title) + ' <span class="hint">было ×' + g.count + '</span>'; });
  h += list('Проблемы появились', 'dnew', d.fresh, function (g) { return esc(g.title) + ' <span class="hint">×' + g.count + '</span>'; });
  h += list('Проблемы остались', 'dkeep', d.both, function (x) { return esc(x.b.title) + ' <span class="hint">×' + x.a.count + ' → ×' + x.b.count + '</span>'; });
  $('#view').innerHTML = h;
}

/* ---------- История по игроку ---------- */
function renderHistory() {
  var keys = Object.keys(S.kb.hist);
  if (!keys.length) { $('#view').innerHTML = '<div class="card empty">История появится, когда вы добавите логи. Чтобы собрать их по одному игроку, впишите ник или номер тикета в поле «Игрок или тикет» на вкладке «Диагноз».</div>'; return; }
  var cnt = {}; keys.forEach(function (k) { var t = S.kb.tags[k] || ''; cnt[t] = (cnt[t] || 0) + 1; });
  var names = Object.keys(cnt).filter(Boolean).sort(); if (cnt['']) names.push('');
  if (S.histTag === null || names.indexOf(S.histTag) < 0) { var af = active(), at = af && S.kb.tags[af.hash]; S.histTag = at && names.indexOf(at) >= 0 ? at : names[0]; }
  var h = '<div class="card"><div class="lt"><label class="nl inl">Игрок или тикет<select class="sel" id="histSel">' + names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === S.histTag ? ' selected' : '') + '>' + esc(n || 'Без метки') + ' (' + cnt[n] + ')</option>'; }).join('') + '</select></label><button class="btn sm" data-act="histCopy">Скопировать историю</button></div></div>';
  var list = keys.filter(function (k) { return (S.kb.tags[k] || '') === S.histTag; }).map(function (k) { return { k: k, h: S.kb.hist[k], t: timeOf(S.kb.hist[k]) }; }).sort(function (a, b) { return a.t - b.t; });
  var prev = {};
  h += '<div class="htl">' + list.map(function (x) {
    var e = x.h, p = prev[e.kind], note = '';
    if (p) {
      var pk = {}, ck = {}; p.probs.forEach(function (q) { pk[q.k] = q; }); e.probs.forEach(function (q) { ck[q.k] = q; });
      var gone = p.probs.filter(function (q) { return !ck[q.k]; }), fresh = e.probs.filter(function (q) { return !pk[q.k]; }), mg = p.mods.filter(function (m) { return e.mods.indexOf(m) < 0; }), mf = e.mods.filter(function (m) { return p.mods.indexOf(m) < 0; });
      if (mg.length) note += '<div class="dgone">Моды убраны: ' + esc(mg.join(', ')) + '</div>';
      if (mf.length) note += '<div class="dnew">Моды появились: ' + esc(mf.join(', ')) + '</div>';
      if (gone.length) note += '<div class="dgone">Исчезли: ' + esc(gone.map(function (q) { return q.t; }).join('; ')) + '</div>';
      if (fresh.length) note += '<div class="dnew">Появились: ' + esc(fresh.map(function (q) { return q.t; }).join('; ')) + '</div>';
      if (!note) note = '<div class="hint">Относительно прошлого ' + e.kind + '.log без изменений.</div>';
    }
    prev[e.kind] = e;
    return '<div class="card"><div class="vmeta"><span class="st st-' + e.status + '">' + STRU[e.status] + '</span><span class="nm">' + esc(e.label) + '</span><span class="kind">' + e.kind + '.log</span><span>' + esc(e.from.slice(0, 19)) + '</span><button class="rm" data-act="histDel" data-key="' + esc(x.k) + '" title="Убрать из истории" aria-label="Убрать из истории">×</button></div><p style="margin:6px 0">' + esc(M(e.headline)) + '</p>' + (e.mods.length ? '<div class="chips">' + e.mods.map(function (m) { return '<span class="chip">МОД ' + esc(M(m)) + '</span>'; }).join('') + '</div>' : '') + (e.probs.length ? '<div class="hint" style="margin-top:4px">' + esc(e.probs.slice(0, 4).map(function (q) { return q.t; }).join('; ')) + '</div>' : '') + note + '</div>';
  }).join('') + '</div>';
  $('#view').innerHTML = h;
}
function historyText() {
  var keys = Object.keys(S.kb.hist).filter(function (k) { return (S.kb.tags[k] || '') === S.histTag; }).sort(function (a, b) { return timeOf(S.kb.hist[a]) - timeOf(S.kb.hist[b]); });
  return M('История: ' + (S.histTag || 'без метки') + '\n' + keys.map(function (k, i) { var e = S.kb.hist[k]; return (i + 1) + ') ' + e.from.slice(0, 19) + ' ' + e.kind + '.log, ' + STRU[e.status] + ': ' + e.headline + (e.mods.length ? ' | моды: ' + e.mods.join(', ') : '') + (e.probs.length ? ' | ' + e.probs.slice(0, 3).map(function (q) { return q.t; }).join('; ') : ''); }).join('\n'));
}

/* ---------- Сводка по всем логам ---------- */
function statsData(since) {
  var inW = function (e) { return !since || LA.histTime(e) >= since; };
  var H = Object.keys(S.kb.hist).map(function (k) { return S.kb.hist[k]; }).filter(inW), n = H.length, d = { n: n, ok: 0, bad: 0, warn: 0, mods: 0, causes: {}, byTag: {}, kinds: { main: 0, client: 0 } };
  H.forEach(function (e) {
    if (e.status === 'ok') d.ok++; else if (e.status === 'bad') d.bad++; else d.warn++;
    if (e.mods.length) d.mods++; d.kinds[e.kind] = (d.kinds[e.kind] || 0) + 1;
    var seen = {}; e.probs.forEach(function (q) { if (!seen[q.t]) { seen[q.t] = 1; d.causes[q.t] = (d.causes[q.t] || 0) + 1; } });
  });
  Object.keys(S.kb.tags).forEach(function (k) { if (S.kb.hist[k] && inW(S.kb.hist[k]) && S.kb.tags[k]) d.byTag[S.kb.tags[k]] = (d.byTag[S.kb.tags[k]] || 0) + 1; });
  return d;
}
function renderStats() {
  var d = statsData();
  if (!d.n) { $('#view').innerHTML = '<div class="card empty">Сводка считается по всем логам, которые вы добавляли в приложение. Пока логов нет.</div>'; return; }
  var pct = function (x) { return Math.round(x * 100 / d.n) + '%'; };
  var h = '<div class="card"><div class="stats"><div><b>' + d.n + '</b><span>логов в истории</span></div><div><b>' + pct(d.mods) + '</b><span>с модами в папке игры (' + d.mods + ')</span></div><div><b>' + pct(d.bad) + '</b><span>со сбоем</span></div><div><b>' + pct(d.ok) + '</b><span>успешных</span></div><div><b>' + d.kinds.main + ' / ' + d.kinds.client + '</b><span>main / client</span></div></div></div>';
  var causes = Object.keys(d.causes).map(function (t) { return [t, d.causes[t]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 15), mx = causes.length ? causes[0][1] : 1;
  var stc = { ok: 0, warn: 0, bad: 0, unk: 0 }; Object.keys(S.kb.hist).forEach(function (k) { var st = S.kb.hist[k].status; stc[stc.hasOwnProperty(st) ? st : 'unk']++; });
  var stn = stc.ok + stc.warn + stc.bad + stc.unk;
  if (stn) h += '<div class="card"><h3 class="sec" style="margin:0 0 8px">Итоги логов</h3><div class="share" role="img" aria-label="Доля логов по итогам">' + [['ok', 'Успех'], ['warn', 'Предупреждение'], ['bad', 'Сбой'], ['unk', 'Неясно']].filter(function (x) { return stc[x[0]]; }).map(function (x) { return '<i class="sh-' + x[0] + '" style="flex:' + stc[x[0]] + '" title="' + x[1] + ': ' + stc[x[0]] + '"></i>'; }).join('') + '</div><div class="legend">' + [['ok', 'Успех'], ['warn', 'Предупреждение'], ['bad', 'Сбой'], ['unk', 'Неясно']].filter(function (x) { return stc[x[0]]; }).map(function (x) { return '<span><i class="sh-' + x[0] + '"></i>' + x[1] + ': ' + stc[x[0]] + ' (' + Math.round(stc[x[0]] * 100 / stn) + '%)</span>'; }).join('') + '</div></div>';
  h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">Самые частые причины</h3>' + (causes.length ? causes.map(function (c) { return '<div class="rowbar"><span>' + esc(c[0]) + '</span><div class="rbar"><i style="width:' + Math.round(c[1] * 100 / mx) + '%"></i></div><span class="mono">' + c[1] + ' (' + pct(c[1]) + ')</span></div>'; }).join('') : '<p class="hint">Проблем в логах не найдено.</p>') + '</div>';
  var tg = Object.keys(d.byTag).map(function (t) { return [t, d.byTag[t]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
  if (tg.length) h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">Игроки и тикеты с наибольшим числом логов</h3>' + tg.map(function (c) { return '<div class="rowbar"><span>' + esc(c[0]) + '</span><div class="rbar"><i style="width:' + Math.round(c[1] * 100 / tg[0][1]) + '%"></i></div><span class="mono">' + c[1] + '</span></div>'; }).join('') + '</div>';
  var byDay = {}; Object.keys(S.kb.hist).forEach(function (k) { var e = S.kb.hist[k], t = LA.histTime(e), dd = fmtDT(t).slice(0, 10); var o = byDay[dd] = byDay[dd] || { n: 0, bad: 0 }; o.n++; if (e.status === 'bad') o.bad++; });
  var days = Object.keys(byDay).sort().slice(-14);
  if (days.length > 1) {
    var mxd = Math.max.apply(null, days.map(function (x) { return byDay[x].n; }));
    h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">Динамика по дням</h3><div class="cols" role="img" aria-label="Логи по дням: всего и со сбоями">' + days.map(function (x) { var o = byDay[x]; return '<div class="col" title="' + x + ': логов ' + o.n + ', сбоев ' + o.bad + '"><span class="cn">' + o.n + '</span><div class="cb" style="height:' + Math.max(4, Math.round(o.n * 100 / mxd)) + '%"><i style="height:' + Math.round(o.bad * 100 / o.n) + '%"></i></div><span class="cd">' + x.slice(8, 10) + '.' + x.slice(5, 7) + '</span></div>'; }).join('') + '</div><div class="legend"><span><i style="background:var(--accent)"></i>логов</span><span><i style="background:var(--crit)"></i>из них со сбоем</span></div></div>';
  }
  h += '<div class="row-actions"><button class="btn sm" data-act="statsCopy">Скопировать сводку</button><button class="btn sm" data-act="weekCopy">Недельный отчёт</button><button class="btn sm" data-act="weekHtml">Недельный отчёт HTML</button><button class="btn sm" data-act="weekPdf">Недельный отчёт PDF</button></div><p class="hint">Сводка копится из истории приложения (до 500 последних логов) и считается только по тем логам, которые вы добавили начиная с этой версии.</p>';
  h += '<h3 class="sec" id="assetsSec" style="margin:14px 0 0">Ассеты перед падением</h3>' + assetsHtml().replace(/<h3 class="sec" style="margin:0">Ассеты перед падением (<span class="n">\d+<\/span>)<\/h3>/, '');
  $('#view').innerHTML = h;
}
function statsText() {
  var d = statsData(), pct = function (x) { return Math.round(x * 100 / d.n) + '%'; };
  var L = ['Сводка по логам: всего ' + d.n + ', с модами ' + d.mods + ' (' + pct(d.mods) + '), со сбоем ' + d.bad + ' (' + pct(d.bad) + '), успешных ' + d.ok + ' (' + pct(d.ok) + ').', 'Частые причины:'];
  Object.keys(d.causes).map(function (t) { return [t, d.causes[t]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 15).forEach(function (c, i) { L.push((i + 1) + '. ' + c[0] + ': ' + c[1] + ' (' + pct(c[1]) + ')'); });
  return L.join('\n');
}

/* ---------- Слияние баз знаний ---------- */
function mergeKB(text, force) {
  var k = JSON.parse(text); if (!k || k.v !== 1 || typeof k.sigs !== 'object') throw new Error('format');
  var hsh = fnv(text); if (!force && S.kb.merged[hsh]) return null;
  fixKB(k);
  var st = { sigs: 0, upd: 0, rules: 0, notes: 0, hist: 0 }, addCounts = Object.keys(k.seen || {}).some(function (h) { return !S.kb.seen[h]; });
  Object.keys(k.sigs).forEach(function (key) {
    var a = S.kb.sigs[key], b = k.sigs[key];
    if (!a) { S.kb.sigs[key] = b; st.sigs++; return; }
    if (addCounts) { a.ok += b.ok; a.bad += b.bad; a.unk += b.unk; a.hits += b.hits; st.upd++; }
    if (b.label && !a.label) a.label = b.label;
    if (b.note) { if (!a.note) { a.note = b.note; st.notes++; } else if (a.note.indexOf(b.note) < 0) { a.note += '\n\n[от коллеги] ' + b.note; st.notes++; } }
  });
  Object.keys(k.ruleNotes || {}).forEach(function (r) {
    var o = S.kb.ruleNotes[r], n = k.ruleNotes[r];
    if (!o) { S.kb.ruleNotes[r] = n; st.notes++; } else if (o.indexOf(n) < 0) { S.kb.ruleNotes[r] = o + '\n\n[от коллеги] ' + n; st.notes++; }
  });
  k.custom.forEach(function (c) {
    if (S.kb.custom.some(function (x) { return x.kind === c.kind && x.pattern === c.pattern; })) return;
    if (S.kb.custom.some(function (x) { return String(x.id) === String(c.id); })) c.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    S.kb.custom.push(c); st.rules++;
  });
  Object.keys(k.hist).forEach(function (h) { if (!S.kb.hist[h]) { S.kb.hist[h] = k.hist[h]; if (k.tags[h]) S.kb.tags[h] = k.tags[h]; st.hist++; } });
  S.kb.files += k.files || 0; Object.keys(k.seen || {}).forEach(function (h) { S.kb.seen[h] = 1; });
  S.kb.merged[hsh] = 1;
  return st;
}
function importKB(text) {
  try {
    var st = mergeKB(text);
    if (!st) { status('Эта база уже была объединена с вашей.'); return; }
    saveKB(); applyRules(); rescanAll();
    status('Объединено: новых строк ' + st.sigs + ', обновлено ' + st.upd + ', правил ' + st.rules + ', заметок ' + st.notes + ', логов в истории ' + st.hist + '.'); render();
  } catch (e) { status('Не удалось прочитать файл базы знаний.'); }
}


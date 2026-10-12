/* ---------- Отчёт, экспорт, окна ---------- */
function openPanel(title, text, hint) {
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="' + esc(title) + '"><b>' + esc(title) + '</b><p class="hint" style="margin:0">' + esc(hint || '') + '</p><textarea id="panelTa" readonly></textarea><div class="row-actions"><button class="btn sm primary" data-act="panelCopy">Скопировать</button><button class="btn sm" data-act="closePanel">Закрыть</button></div></div></div>';
  var ta = $('#panelTa'); ta.value = text; ta.focus(); ta.select();
}
function copyText(text, title, hint, okMsg) {
  var ok = okMsg || 'Скопировано в буфер обмена. Вставьте в чат с Claude.';
  if (window.nativeApp) { try { window.nativeApp.copy(text); status(ok); return; } catch (e) {} }
  var done = function () { status(ok); }, fail = function () { openPanel(title, text, hint || 'Автоматическое копирование недоступно. Текст выделен, нажмите Ctrl+C.'); };
  try { navigator.clipboard.writeText(text).then(done, fail); } catch (e) { fail(); }
}
function buildReport(f) {
  var sc = f.sc, v = sc.verdict, L = [];
  if (sc.mods) L.push('!!! МОД В ПАПКЕ ИГРЫ (главная причина крашей): ' + sc.mods.files.join('; ') + '\n');
  L.push('Файл: ' + f.label + ' (' + (sc.kindName || sc.kind) + '.log' + (sc.range ? ', ' + sc.range.from + ' → ' + sc.range.to : '') + ')');
  L.push('Итог: ' + STRU[v.status] + '. ' + v.headline); v.lines.forEach(function (l) { L.push('  ' + l); });
  var probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  if (probs.length) { L.push(''); L.push('Найдено:'); }
  probs.forEach(function (g, i) {
    L.push((i + 1) + ') [' + SEVRU[g.sev] + '] ' + g.title + ' ×' + g.count + ' (' + SRCRU[g.src] + ')');
    var d = Array.from(g.dets.keys()).slice(0, 3); if (d.length) L.push('   Детали: ' + d.join(' | ').slice(0, 300));
    var es = f.parsed.entries; L.push('   Строки: ' + g.entries.slice(0, 6).map(function (x) { return 'L' + (es[x].i + 1); }).join(', '));
    if (g.cause) L.push('   Причина: ' + g.cause);
    g.fix.forEach(function (x, k) { L.push('   ' + (k + 1) + '. ' + x); });
    if (g.tpl.length) L.push('   Шаблоны: ' + g.tpl.join('; '));
    var nt = S.kb.ruleNotes[g.key]; if (nt) L.push('   Заметка: ' + nt);
  });
  if (sc.stage && sc.stage.ctx.length) { L.push(''); L.push('Контекст краша:'); sc.stage.ctx.forEach(function (c) { L.push('  ' + c.text); }); }
  var susp = sc.unknown.filter(function (u) { return u.sev === 'err'; });
  if (susp.length) { L.push(''); L.push('Подозрительные неопознанные строки:'); susp.slice(0, 5).forEach(function (u) { L.push('  ×' + u.count + ' ' + u.sample.slice(0, 200)); }); }
  if (f.marks && f.marks.length) { L.push(''); L.push('Отмеченные строки:'); f.marks.slice().sort(function (a, b) { return a - b; }).slice(0, 10).forEach(function (m) { L.push('  L' + (m + 1) + ': ' + LA.stripAnsi(f.parsed.lines[m]).slice(0, 200)); }); }
  if (f.gameScan && f.gameScan.res.mods.length) { L.push(''); L.push('Моды в папке игры (проверка диска): ' + f.gameScan.res.mods.map(function (x) { return x.name; }).join('; ')); }
  if (f.sys && (f.sys.dump || f.sys.ev)) L.push('', sysText(f));
  return M(L.join('\n'));
}
async function exportKB() {
  var data = JSON.stringify(S.kb, null, 1), d = null;
  if (window.nativeApp) { try { var sv = await window.nativeApp.save('majestic-log-kb.json', data); if (sv) status('База знаний сохранена: ' + sv); return; } catch (e) {} }
  try { d = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { d = null; }
  if (d) { try { await d.save({ filename: 'majestic-log-kb.json', data: data }); status('База знаний сохранена.'); return; } catch (e) { if (e && e.code === 'declined') return; } }
  copyText(data, 'База знаний (JSON)', 'Скопируйте текст и сохраните в файл majestic-log-kb.json. Импорт принимает такой файл.');
}







/* ---------- Очередь всплывающих окон ---------- */
var POPQ = [];
function popBusy() { return !!($('#panelHost') && $('#panelHost').innerHTML) || !!$('#upOv'); }
function popup(id, pri, fn) {
  if (!popBusy() && !POPQ.length) { fn(); return; }
  POPQ = POPQ.filter(function (x) { return x.id !== id; }); POPQ.push({ id: id, pri: pri, fn: fn });
  POPQ.sort(function (a, b) { return a.pri - b.pri; });
}
setInterval(function () { if (!POPQ.length || popBusy()) return; var x = POPQ.shift(); try { x.fn(); } catch (e) {} }, 700);

/* ---------- Массовые проблемы по общей базе (v.21) ---------- */
function logRecord(f) {
  var sc = f.sc, probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).slice(0, 8).map(function (g) { return { k: g.key, t: M(g.title), fx: (g.fix || []).slice(0, 3).map(function (x) { return M(x); }) }; });
  if (sc.mods) probs.unshift({ k: 'mods-outside', t: 'Моды в папке игры', fx: ['Перенести моды в папку модификаций лаунчера или удалить их из папки GTA V, затем проверить запуск.'] });
  var bm = /Majestic Multiplayer build #([0-9][0-9.]*)/.exec(String(f.text).slice(0, 20000));
  return { hash: f.hash, st: sc.verdict.status, mods: sc.mods ? 1 : 0, bv: bm ? bm[1] : '', probs: probs };
}
var massQ = [], massT = null;
var MASS_PAUSE_UNTIL = Date.parse('2026-10-14T23:59:59+03:00');
function massPaused() { return Date.now() < MASS_PAUSE_UNTIL; }
function logPush(files) {
  if (!srvOn() || massPaused()) return; files.forEach(function (f) { if (!f.sample) massQ.push(logRecord(f)); });
  clearTimeout(massT); massT = setTimeout(async function () { var it = massQ.splice(0, 40); if (it.length) { await srv('/v1/logs/put', { body: { items: it } }); fetchMass(false); } }, 1500);
}
function massTh() { var st = S.kb.settings; return { day: +st.massDay || 20, week: +st.massWeek || 30 }; }
function massList() {
  var m = S.mass; if (!m) return []; var th = massTh(), by = {};
  m.days.forEach(function (d) { Object.keys(d.probs).forEach(function (k) { var o = by[k] = by[k] || { k: k, t: d.probs[k].t, fx: d.probs[k].fx, day: 0, week: 0, b: {} }; o.week += d.probs[k].c; Object.keys(d.probs[k].b || {}).forEach(function (v) { o.b[v] = (o.b[v] || 0) + d.probs[k].b[v]; }); if (d.d === m.today) o.day += d.probs[k].c; if (d.probs[k].fx && d.probs[k].fx.length) o.fx = d.probs[k].fx; }); });
  return Object.keys(by).map(function (k) { var o = by[k]; o.hotDay = o.day >= th.day; o.hotWeek = o.week >= th.week; return o; }).sort(function (a, b) { return (b.hotDay - a.hotDay) || (b.hotWeek - a.hotWeek) || b.week - a.week; });
}
async function fetchMass(notify) {
  if (!srvOn() || massPaused()) { S.mass = null; return; } var r = await srv('/v1/stats', { query: { days: 7 } }); if (!r || !r.ok) return;
  S.mass = r; if (S.tab === 'mass') renderMass(); renderTabs();
  if (notify === false) return; var seen = S.kb.settings.massSeen = S.kb.settings.massSeen || {}, fresh = [];
  massList().forEach(function (o) { [['d', o.hotDay], ['w', o.hotWeek]].forEach(function (lv) { var key = o.k + '|' + lv[0] + '|' + r.today; if (lv[1] && !seen[key] && !fresh.some(function (x) { return x.k === o.k; })) { fresh.push(o); } if (lv[1]) seen[key] = 1; }); });
  var ks = Object.keys(seen); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(function (k) { delete seen[k]; });
  saveKB();
  if (fresh.length) popup('mass', 2, function () { showMass(fresh); });
  if (weeklyDue()) popup('weekly', 6, function () { if (weeklyDue()) showWeekly(); });
}
function massFixHtml(o) { return o.fx && o.fx.length ? '<ol style="margin:4px 0 0 18px;padding:0">' + o.fx.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : '<div class="hint">Быстрое решение ещё не записано. Откройте лог с этой проблемой и посмотрите вкладку «Диагноз».</div>'; }
function showMass(list) {
  var th = massTh();
  $('#panelHost').innerHTML = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Массовые проблемы"><b>Массовые проблемы на тикетах</b><p class="hint" style="margin:0">Проблем из одного списка в логах команды больше порога (за день ' + th.day + ', за неделю ' + th.week + '). Быстрое решение приведено ниже.</p>' +
    list.slice(0, 5).map(function (o) { return '<div class="alertbox"><b>' + esc(o.t) + '</b><div class="hint">Сегодня: ' + o.day + ', за неделю: ' + o.week + '</div>' + massFixHtml(o) + '</div>'; }).join('') +
    '<div class="row-actions"><button class="btn sm primary" data-act="massOpen">Открыть список</button><button class="btn sm" data-act="closePanel">Закрыть</button></div></div></div>';
}
function massText() {
  var L = ['МАССОВЫЕ ПРОБЛЕМЫ ПО ЛОГАМ КОМАНДЫ', ''], th = massTh(), hot = massList().filter(function (o) { return o.hotDay || o.hotWeek; });
  if (!hot.length) L.push('Выше порога ничего нет (день ' + th.day + ', неделя ' + th.week + ').');
  hot.forEach(function (o) { L.push('- ' + o.t + ': сегодня ' + o.day + ', за неделю ' + o.week); (o.fx || []).forEach(function (x, i) { L.push('   ' + (i + 1) + ') ' + x); }); });
  return M(L.join('\n'));
}
function renderMass() {
  var m = S.mass, th = massTh();
  if (massPaused()) { $('#view').innerHTML = '<div class="card empty"><b>Массовые проблемы приостановлены до 15.10.2026.</b><br>Сейчас команда загружает старые логи для изучения, поэтому они не отправляются в общую базу и не вызывают тревог. Остальные функции работают как обычно.</div>'; return; }
  if (!srvOn()) { $('#view').innerHTML = '<div class="card empty">Общая база работает только в установленном приложении.</div>'; return; }
  if (!m) { $('#view').innerHTML = '<div class="card empty">Загружаю данные команды…</div>'; fetchMass(false); return; }
  var list = massList(), tot = m.days.reduce(function (a, d) { return { n: a.n + d.n, bad: a.bad + d.bad }; }, { n: 0, bad: 0 }), td = m.days.filter(function (d) { return d.d === m.today; })[0];
  var h = '<div class="card"><div class="stats"><div><b>' + (td ? td.n : 0) + '</b><span>логов команды сегодня</span></div><div><b>' + tot.n + '</b><span>за 7 дней</span></div><div><b>' + tot.bad + '</b><span>со сбоем за 7 дней</span></div><div><b>' + list.filter(function (o) { return o.hotDay || o.hotWeek; }).length + '</b><span>массовых проблем</span></div></div></div>';
  h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">Частые проблемы в логах команды</h3><p class="hint" style="margin:0 0 8px">Порог массовой проблемы: ' + th.day + ' за день или ' + th.week + ' за неделю (меняется в «Настройках»). Считаются логи всей команды, каждый лог один раз.</p>' +
    (list.length ? list.slice(0, 25).map(function (o) { var hot = o.hotDay || o.hotWeek; return '<details class="fd"' + (hot ? ' open' : '') + '><summary>' + (hot ? '<span class="st st-bad">МАССОВАЯ</span> ' : '') + esc(o.t) + ' <span class="hint">сегодня ' + o.day + ', за неделю ' + o.week + '</span></summary>' + massFixHtml(o) + (Object.keys(o.b || {}).length ? '<div class="hint" style="margin-top:6px">По версиям клиента: ' + Object.keys(o.b).sort(function (a, c) { return o.b[c] - o.b[a]; }).map(function (v) { return esc(v) + ': ' + o.b[v]; }).join(', ') + '</div>' : '') + '</details>'; }).join('') : '<div class="hint">Пока данных нет. Они копятся, когда команда загружает логи.</div>') + '</div>';
  var bst = buildStats(); if (bst.length > 1) h += '<div class="card"><h3 class="sec" style="margin:0 0 6px">Версии клиента (за 7 дней)</h3><p class="hint" style="margin:0 0 8px">Версия берётся из client.log. Красным отмечены версии, где сбоев заметно больше среднего.</p>' + bst.map(function (b) { return '<div class="rowbar"><span>' + esc(b.v) + (b.hot ? ' <span class="st st-bad">больше сбоев</span>' : '') + '</span><div class="rbar"><i style="width:' + b.pct + '%"></i></div><span class="mono">' + b.pct + '% из ' + b.n + '</span></div>'; }).join('') + '</div>';
  h += '<div class="row-actions"><button class="btn sm" data-act="massCopy">Скопировать для команды</button><button class="btn sm" data-act="massRefresh">Обновить</button></div>';
  $('#view').innerHTML = h;
}



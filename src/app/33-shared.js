/* ---------- Общие заметки и ответы, стили ответа, резервная копия, недельная сводка (v.25) ---------- */
S.shared = { notes: {}, replies: {}, sigs: {}, sv: '' }; S.me = '';
async function fetchShared() { var r = await srv('/v1/shared'); if (!r || !r.ok) return; S.shared = { notes: r.notes || {}, replies: r.replies || {}, sigs: r.sigs || {}, sv: r.sv || '' }; S.me = r.me || S.me; if (S.active && (S.tab === 'diag')) { var af = active(); if (af) render(); } }
async function pushShared(kind, key, text) { if (!srvOn()) return; await srv('/v1/shared/put', { body: { kind: kind, key: key, text: text, v: APP_VERSION } }); fetchShared(); }
function mainKey(f) { var pr = f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }); if (f.sc.mods) return 'mods-outside'; return pr.length ? pr[0].key : ''; }
function teamNotesHtml(key) {
  var a = (S.shared.notes[key] || []); if (!a.length) return '';
  return '<div><h4>Заметки команды</h4>' + a.map(function (x) { return '<div class="hint" style="white-space:pre-wrap;overflow-wrap:anywhere"><b>' + esc(x.by) + (x.by === S.me ? ' (вы)' : '') + ', ' + esc(fmtDT(x.at).slice(0, 10)) + ':</b> ' + esc(M(x.text)) + '</div>'; }).join('') + '</div>';
}
function repliesCard(f) {
  var key = mainKey(f), a = key ? (S.shared.replies[key] || []).slice() : []; if (!a.length) return '';
  a.sort(function (x, y) { return (y.votes || []).length - (x.votes || []).length || y.at - x.at; });
  return '<details class="card plain"><summary>Как отвечали коллеги (' + a.length + ')</summary>' + a.map(function (x, i) { var vs = x.votes || [], mine = vs.indexOf(S.me) >= 0; return '<div style="margin:8px 0"><div class="hint">' + esc(x.by) + (x.by === S.me ? ' (вы)' : '') + ', ' + esc(fmtDT(x.at).slice(0, 10)) + (x.v ? ', версия ' + esc(x.v) : '') + (vs.length ? ', помогло: ' + vs.length : '') + '</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;max-height:140px;overflow:auto">' + esc(M(x.text)) + '</div><button class="btn sm ghost" data-act="useReply" data-at="' + x.at + '">Подставить в ответ</button> <button class="btn sm' + (mine ? ' primary' : ' ghost') + '" data-act="voteReply" data-at="' + x.at + '" data-key="' + esc(key) + '" aria-pressed="' + mine + '">' + (mine ? 'Помогло (отмена)' : 'Помогло') + '</button></div>'; }).join('') + '</details>';
}
var RSTYLES = {
  brief: { n: 'Краткий: только решение', hello: LA.BRIEF_HELLO, bye: LA.BRIEF_BYE, short: false, brief: true },
  std: { n: 'Стандартный', hello: 'Здравствуйте!', bye: 'Выполните шаги выше, перезапустите лаунчер и напишите, получилось ли. Если проблема останется, пришлите свежие main.log и client.log.', short: false },
  polite: { n: 'Вежливый', hello: 'Здравствуйте! Спасибо, что обратились в поддержку.', bye: 'Выполните шаги выше и напишите нам, получилось ли. Мы на связи и поможем дальше. Хорошего дня!', short: false },
  short: { n: 'Короткий', hello: 'Добрый день!', bye: 'Напишите, помогло ли.', short: true },
  esc: { n: 'С эскалацией', hello: 'Здравствуйте!', bye: 'Если после этих шагов проблема останется, пришлите свежие main.log и client.log (папка %appdata%\\majestic-launcher). Мы передадим обращение специалистам и вернёмся с ответом.', short: false }
};
/* Стиль ответа: по умолчанию краткий (на «Вы», только решение). Свои приветствие и прощание сохраняются, заготовки других стилей — нет */
function isBrief() { return (S.kb.settings.replyStyle || 'brief') === 'brief'; }
function replyOpts() {
  var st = S.kb.settings || {}, pre = function (v, k) { return !v || Object.keys(RSTYLES).some(function (x) { return RSTYLES[x][k] === v; }); };
  if (!isBrief()) return { hello: st.hello, bye: st.bye, brief: false };
  return { hello: pre(st.hello, 'hello') ? LA.BRIEF_HELLO : st.hello, bye: pre(st.bye, 'bye') ? LA.BRIEF_BYE : st.bye, brief: true };
}
function styleSel() {
  var cur = S.kb.settings.replyStyle || 'brief';
  return '<label class="nl inl" style="max-width:240px">Стиль ответа<select class="sel" data-act="rstyle" aria-label="Стиль ответа">' + Object.keys(RSTYLES).map(function (k) { return '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + RSTYLES[k].n + '</option>'; }).join('') + '</select></label>';
}
function shortenReply(t) {
  var b = t.split('\n\n'); if (b.length < 3) return t;
  var hello = b[0], bye = b[b.length - 1], mid = b.slice(1, -1).map(function (x) { return x.split('\n').slice(0, 4).join('\n'); });
  return [hello].concat(mid, [bye]).join('\n\n');
}
async function backupMaybe(force) {
  if (!srvOn()) return false; var st = S.kb.settings;
  if (!force && st.backupAt && Date.now() - st.backupAt < 20 * 3600000) return false;
  if (!Object.keys(S.kb.hist).length && !Object.keys(S.kb.sigs).length && !S.kb.custom.length) return false;
  var r = await srv('/v1/backup/put', { body: { kb: JSON.stringify(S.kb) } }); if (r && r.ok) { st.backupAt = Date.now(); saveKB(); return true; } return false;
}
async function restoreBackup() {
  var r = await srv('/v1/backup/get'); if (!r || !r.ok || r.none || !r.kb) { status('Облачной копии пока нет.'); return; }
  if (S.restoreFor !== r.at) { S.restoreFor = r.at; status('Копия от ' + fmtDT(r.at) + ' (' + Math.round(r.kb.length / 1024) + ' КБ). Нажмите «Восстановить» ещё раз, чтобы объединить её с текущей базой.'); return; }
  try {
    var k = JSON.parse(r.kb), n = mergeKB(r.kb, true); fixKB(k); Object.keys(k.status || {}).forEach(function (h) { if (!S.kb.status[h]) S.kb.status[h] = k.status[h]; }); Object.keys(k.tags || {}).forEach(function (h) { if (!S.kb.tags[h]) S.kb.tags[h] = k.tags[h]; });
    saveKB(); applyRules(); rescanAll(); render(); status('Копия восстановлена: новых строк ' + (n ? n.sigs : 0) + ', правил ' + (n ? n.rules : 0) + ', логов в истории ' + (n ? n.hist : 0) + '.');
  } catch (e) { status('Не удалось восстановить копию.'); }
}
function isoDay(d) { var z = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
function weeklyDue() { var d = new Date(); return d.getDay() === 1 && d.getHours() >= 9 && S.kb.settings.weekShown !== isoDay(d); }
function teamWeekText() {
  var m = S.mass; if (!m) return ''; var tot = m.days.reduce(function (a, d) { return { n: a.n + d.n, bad: a.bad + d.bad, mods: a.mods + d.mods }; }, { n: 0, bad: 0, mods: 0 }), pct = function (x) { return tot.n ? Math.round(x * 100 / tot.n) + '%' : '0%'; };
  var L = ['НЕДЕЛЬНАЯ СВОДКА КОМАНДЫ', 'Период: последние 7 дней', '', 'Логов в общей базе: ' + tot.n, 'Со сбоем: ' + tot.bad + ' (' + pct(tot.bad) + ')', 'С модами в папке игры: ' + tot.mods + ' (' + pct(tot.mods) + ')', ''];
  var top = massList().slice(0, 7); if (top.length) { L.push('Частые проблемы:'); top.forEach(function (o, i) { L.push('  ' + (i + 1) + '. ' + o.t + ': ' + o.week + (o.hotWeek || o.hotDay ? ' (массовая)' : '')); (o.fx || []).slice(0, 2).forEach(function (x) { L.push('       ' + x); }); }); L.push(''); }
  var bs = buildStats().filter(function (b) { return b.hot; }); if (bs.length) { L.push('Версии клиента с повышенной долей сбоев: ' + bs.map(function (b) { return b.v + ' (' + b.pct + '% сбоев из ' + b.n + ')'; }).join(', ')); }
  return M(L.join('\n'));
}
function showWeekly() {
  S.kb.settings.weekShown = isoDay(new Date()); saveKB(); var t = teamWeekText(); if (!t) return;
  $('#panelHost').innerHTML = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Недельная сводка"><b>Недельная сводка команды</b><pre style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 var(--mono);max-height:360px;overflow:auto">' + esc(t) + '</pre><div class="row-actions"><button class="btn sm primary" data-act="teamWeekCopy">Скопировать</button>' + (window.nativeApp && window.nativeApp.pdf ? '<button class="btn sm" data-act="teamWeekPdf">Сохранить PDF</button>' : '') + '<button class="btn sm" data-act="closePanel">Закрыть</button></div></div></div>';
}
function buildStats() {
  var m = S.mass; if (!m) return []; var by = {}, tn = 0, tb = 0;
  m.days.forEach(function (d) { Object.keys(d.bv || {}).forEach(function (v) { var o = by[v] = by[v] || { v: v, n: 0, bad: 0 }; o.n += d.bv[v].n; o.bad += d.bv[v].bad; tn += d.bv[v].n; tb += d.bv[v].bad; }); });
  var avg = tn ? tb / tn : 0;
  return Object.keys(by).map(function (v) { var o = by[v]; o.pct = o.n ? Math.round(o.bad * 100 / o.n) : 0; o.hot = o.n >= 5 && avg > 0 && o.bad / o.n >= avg * 1.5 && o.bad / o.n >= 0.4; return o; }).sort(function (a, b) { return String(b.v).localeCompare(String(a.v), 'ru', { numeric: true }); }).slice(0, 8);
}


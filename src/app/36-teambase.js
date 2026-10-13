/* ---------- Общая база тикетов, объявления, подсказки (v.18) ---------- */
function srvOn() { return !!(window.nativeApp && window.nativeApp.gatedFetch); }
async function srv(path, opts) { try { var t = await window.nativeApp.gatedFetch(path, opts); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function probTitles(f) { return f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).slice(0, 4).map(function (g) { return M(g.title); }); }
function ticketPush(f) {
  if (!srvOn() || f.sample) return; var tag = S.kb.tags[f.hash]; if (!tag) return;
  srv('/v1/tickets/put', { body: { tag: tag, hash: f.hash, v: f.sc.verdict.status, st: stOf(f), head: M(f.sc.verdict.headline), keys: probTitles(f) } });
}
async function ticketLookup(f, first) {
  if (!srvOn() || f.sample) return;
  var r = await srv('/v1/tickets/get', { query: { tag: S.kb.tags[f.hash] || '', hash: f.hash } });
  if (!r || !r.ok) return;
  f.shared = r.rec || null; if (first) f.sharedHit = r.hit || null;
  if (S.active === f.id && S.tab === 'diag') render();
}
function sharedCard(f) {
  var h = '', hit = f.sharedHit, items = f.shared && f.shared.items ? f.shared.items.filter(function (x) { return x.hash !== f.hash; }) : [];
  if (hit) h += '<div class="alertbox"><b>Этот лог уже разбирали</b><div class="hint">' + esc(hit.by) + ', ' + esc(fmtDT(hit.at)) + (hit.tag ? ', тикет или игрок «' + esc(hit.tag) + '»' : '') + (hit.st ? ', статус: ' + esc(TST[hit.st] || hit.st) : '') + '. Посмотрите, что ответили тогда, чтобы не дублировать работу.</div></div>';
  if (items.length) h += '<div class="alertbox"><b>По «' + esc(f.shared.tag) + '» уже есть логи в общей базе: ' + items.length + '</b>' + items.slice(0, 5).map(function (x) { return '<div class="hint">' + esc(fmtDT(x.at)) + ', ' + esc(x.by) + ': ' + esc(STRU[x.v] || x.v) + ', ' + esc(x.head) + (x.keys && x.keys.length ? ' (' + esc(x.keys.join('; ')) + ')' : '') + (x.st ? ', статус: ' + esc(TST[x.st] || x.st) : '') + '</div>'; }).join('') + '</div>';
  return h;
}
function askNext(f) {
  var sc = f.sc, L = [], hasC = S.files.some(function (x) { return !x.sample && x.sc.kind === 'client'; }), hasM = S.files.some(function (x) { return !x.sample && x.sc.kind === 'main'; });
  var probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }), keys = probs.map(function (g) { return g.key; }).join(' ');
  if (sc.kind === 'main' && !hasC) L.push('Файл client.log (папка %appdata%\\majestic-launcher). В нём причина крашей игры.');
  if (sc.kind === 'client' && !hasM) L.push('Файл main.log из той же папки лаунчера: по нему видно, как шёл запуск.');
  if (sc.mods) L.push('Скриншот папки GTA V после того, как моды убраны, и подтверждение, что игра проверена на запуск.');
  if (/crash|dump|minidump/i.test(keys + ' ' + probs.map(function (g) { return g.title; }).join(' '))) L.push('Файл краш-репорта из папки %appdata%\\majestic-launcher\\Multiplayer\\crashes (самый свежий).');
  if (sc.verdict.status !== 'ok' && !probs.length) { L.push('Точное время, когда была проблема, и скриншот ошибки.'); L.push('Свежие main.log и client.log сразу после повторения проблемы.'); }
  if (sc.verdict.status === 'ok') L.push('Если проблема повторяется: время, скриншот и свежие логи сразу после неё.');
  return L;
}
function askCard(f) {
  var L = askNext(f); if (!L.length) return '';
  return '<details class="card plain"><summary>Что попросить у игрока дальше (' + L.length + ')</summary><ul style="margin:8px 0 8px 18px;padding:0">' + L.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><button class="btn sm" data-act="askCopy">Скопировать сообщение игроку</button></details>';
}
function askText(f) { return M('Пришлите, пожалуйста:\n' + askNext(f).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n')); }
async function checkNews() {
  if (!srvOn()) return; var r = await srv('/v1/news'); if (!r || !r.ok || !r.list) return;
  var seen = S.kb.settings.newsSeen || [], fresh = r.list.filter(function (x) { return seen.indexOf(x.id) < 0; }); if (!fresh.length) return;
  popup('news', 1, function () { showNews(fresh); });
}
function showNews(fresh) {
  S.newsFresh = fresh.map(function (x) { return x.id; });
  $('#panelHost').innerHTML = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Сообщение для команды"><b>Сообщение для команды</b>' + fresh.map(function (x) { return '<div class="alertbox"><div class="hint">' + esc(fmtDT(x.at)) + '</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(x.text) + '</div></div>'; }).join('') + '<div class="row-actions"><button class="btn sm primary" data-act="newsOk">Понятно</button></div></div></div>';
}
function stepFile(d) {
  var list = S.files;
  var i = list.findIndex(function (x) { return x.id === S.active; }); var n = list[(i + d + list.length) % list.length]; if (n) { S.active = n.id; S.sel = -1; render(); }
}
function dayBars(since) {
  var byDay = {}; Object.keys(S.kb.hist).forEach(function (k) { var e = S.kb.hist[k], t = LA.histTime(e); if (t < since) return; var dd = fmtDT(t).slice(0, 10); var o = byDay[dd] = byDay[dd] || { n: 0, bad: 0 }; o.n++; if (e.status === 'bad') o.bad++; });
  return byDay;
}

/* ---------- Теги, ответ игроку ---------- */
function tagNames() { var o = {}; Object.keys(S.kb.tags).forEach(function (h) { if (S.kb.tags[h]) o[S.kb.tags[h]] = 1; }); return Object.keys(o).sort(); }
function folderMods(f) { return []; }
/* ---------- Шаблоны ответов, формат Discord ---------- */
var QTPL = [
  { n: 'Антивирус и защита Windows', t: 'Здравствуйте!\nПо логу игру или лаунчер блокирует защита (код: {код}). Выполните, пожалуйста:\n1) Добавьте папки игры и лаунчера (AppData\\Local\\MajesticLauncher*) в исключения антивируса и Защитника Windows.\n2) Проверьте карантин антивируса и восстановите оттуда файлы Majestic.\n3) Запустите лаунчер от имени администратора и попробуйте снова.\nНапишите, помогло ли.' },
  { n: 'Переустановка лаунчера', t: 'Здравствуйте!\nПохоже, установка лаунчера повреждена ({причина}). Удалите папку лаунчера, скачайте свежий установщик с сайта и поставьте заново, затем запустите от администратора. Если не поможет, пришлите свежие main.log и client.log.' },
  { n: 'Очистка кеша лаунчера', t: 'Здравствуйте!\nВ лаунчере нажмите «Очистить кеш», дождитесь окончания проверки файлов и запустите игру снова. Если ошибка {код} повторится, напишите нам.' },
  { n: 'Убрать моды', t: 'Здравствуйте!\nВ папке игры найдены сторонние файлы (моды, ReShade, ENB, OpenIV). Уберите их, оставив только то, что разрешено лаунчером, и запустите игру через лаунчер.' },
  { n: 'Запрос свежих логов', t: 'Здравствуйте!\nПришлите, пожалуйста, свежие main.log и client.log (папка %appdata%\\majestic-launcher) сразу после новой попытки запуска. Время последней попытки: {время}.' }
];
function tplVars(f) {
  var sc = f.sc, v = sc.verdict, hay = [v.headline].concat(v.lines).concat(sc.findings.map(function (g) { return g.title + ' ' + g.key; })).join(' ');
  var code = (/ERR_[A-Z0-9_]+|0x[0-9a-fA-F]{4,}/.exec(hay) || [''])[0];
  return { 'ник': S.kb.tags[f.hash] || '', 'время': sc.range ? sc.range.to : '', 'код': code || 'ошибка в логе', 'версия': sc.env && sc.env.gameVer || '', 'причина': sc.root ? sc.root.title : v.headline };
}
function expandTpl(text, f) { var V = tplVars(f); return text.replace(/\{([^}]+)\}/g, function (m, k) { return V.hasOwnProperty(k) ? V[k] : m; }); }
function myTpls() { return S.kb.settings.myTpls = S.kb.settings.myTpls || []; }
function tplSel() {
  return '<label class="nl inl" style="max-width:260px">Шаблон<select class="sel" data-act="tplPick" aria-label="Шаблон ответа"><option value="">Собрать автоматически</option><optgroup label="Быстрые ответы">' + QTPL.map(function (x, i) { return '<option value="b' + i + '">' + esc(x.n) + '</option>'; }).join('') + '</optgroup>' + (myTpls().length ? '<optgroup label="Мои шаблоны">' + myTpls().map(function (x, i) { return '<option value="u' + i + '">' + esc(x.n) + '</option>'; }).join('') + '</optgroup>' : '') + '</select></label>';
}
function discordFmt(t) {
  return String(t).replace(/(`[^`\n]*`)|(ERR_[A-Z0-9_]+|0x[0-9a-fA-F]{4,}|%[A-Za-z]+%(?:\\[^\s,;]+)*|[A-Za-z]:\\[^\s,;]+|\b[\w.-]+\.(?:log|exe|dll|node|json)\b)/g, function (m, a, b) { return a ? a : '`' + b + '`'; });
}
function plainFmt(t) { return String(t).replace(/`/g, '').replace(/\*\*/g, ''); }
function sysExtra(f) {
  var s = f.sys, o = []; if (!s) return o;
  var add = function (title, fix) { fix = (fix || []).filter(Boolean); if (title && fix.length && !o.some(function (x) { return x.title === title; })) o.push({ title: title, steps: fix }); };
  if (s.dump && s.dump.an && s.dump.an.sev !== 'ok') add(s.dump.an.title, s.dump.an.fix);
  if (s.ev && s.ev.an) s.ev.an.findings.filter(function (g) { return (g.same || g.near || g.sev === 'crit') && g.fix && g.fix.length; }).slice(0, 2).forEach(function (g) { add(g.title, g.fix); });
  return o;
}
function replyText(f, only) {
  var st = S.kb.settings || {};
  var ro = replyOpts(), rt = M(LA.composeReply(f.sc, { kb: S.kb, hello: ro.hello, bye: ro.bye, brief: ro.brief, only: only, extra: sysExtra(f), folderMods: only && only !== 'mods' ? [] : folderMods(f) }));
  return st.replyShort && !ro.brief ? shortenReply(rt) : rt;
}
function openReply(f, only) {
  var st = S.kb.settings || {};
  S.replyOnly = only || '';
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Ответ игроку"><b>Ответ игроку</b><p class="hint" style="margin:0">Текст собран из решений руководства и ваших заметок. Его можно править прямо здесь, потом скопировать. Приветствие и завершение запоминаются.</p>' + styleSel() + ' ' + tplSel() + '<div class="lt"><label class="nl inl" style="flex:1 1 160px">Приветствие<input type="text" id="rpHello" value="' + esc(st.hello || 'Здравствуйте!') + '"></label><label class="nl inl" style="flex:2 1 260px">Завершение<input type="text" id="rpBye" value="' + esc(st.bye || 'Выполните шаги выше, перезапустите лаунчер и напишите, получилось ли. Если проблема останется, пришлите свежие main.log и client.log.') + '"></label></div><textarea id="panelTa"></textarea><div class="lt"><input type="text" id="tplName" placeholder="Название шаблона" aria-label="Название шаблона" style="flex:1 1 160px"><button class="btn sm" data-act="tplSave" title="Сохранить текст выше как свой шаблон. Подстановки: {ник} {время} {код} {версия} {причина}">Сохранить как шаблон</button><button class="btn sm ghost" data-act="tplDel">Удалить шаблон</button></div><p class="hint" style="margin:0">В шаблонах работают подстановки: {ник}, {время}, {код}, {версия}, {причина}.</p><div class="row-actions"><button class="btn sm primary" data-act="panelCopy">Скопировать ответ</button><button class="btn sm" data-act="panelDiscord" title="Коды, пути и имена файлов в `кавычках`">Для Discord</button><button class="btn sm" data-act="panelPlain">Простой текст</button><button class="btn sm" data-act="closePanel">Закрыть</button></div></div></div>';
  fillReply(f);
}
function fillReply(f) {
  var st = S.kb.settings = S.kb.settings || {};
  st.hello = $('#rpHello').value; st.bye = $('#rpBye').value; saveKB();
  var ta = $('#panelTa'); ta.value = replyText(f, S.replyOnly);
  var pv = $('#replyPv'); if (pv && !S.replyOnly) pv.textContent = ta.value;
}
function guessPattern(sample) {
  var t = LA.stripAnsi(sample).replace(/^(\[[^\]]*\]\s*)+/, '').replace(/\s+/g, ' ').trim();
  var c = t.replace(/\s*\b\d{2,}\b.*$/, '').trim();
  return (c.length >= 8 ? c : t).slice(0, 90);
}
function openRuleForm(f, sample, edit) {
  var r = edit || { kind: f ? f.sc.kind : 'main', pattern: sample ? guessPattern(sample) : '', sev: 'err', title: '', cause: '', fix: [] };
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Своё правило"><b>' + (edit ? 'Изменить правило' : 'Добавить решение для этой строки') + '</b><p class="hint" style="margin:0">Правило сработает на любом логе, где встретится такой текст, и покажет вашу причину и шаги как обычную находку. Можно написать /регулярное выражение/.</p>' +
    '<label class="nl inl">Что искать в строке лога<input type="text" id="rfPat" value="' + esc(r.pattern) + '"></label>' +
    '<div class="lt"><label class="nl inl">Тип лога<select class="sel" id="rfKind"><option value="main"' + (r.kind === 'main' ? ' selected' : '') + '>main.log</option><option value="client"' + (r.kind === 'client' ? ' selected' : '') + '>client.log</option></select></label><label class="nl inl">Серьёзность<select class="sel" id="rfSev">' + [['crit', 'Критично'], ['err', 'Ошибка'], ['warn', 'Внимание'], ['info', 'Заметка']].map(function (x) { return '<option value="' + x[0] + '"' + (r.sev === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label></div>' +
    (edit ? '' : '<label class="nl inl">Взять решение у известной проблемы<select class="sel" id="rfCopy" data-act="rfcopy"><option value="">Не копировать</option>' + LA.RULES.map(function (x, i) { return [i, x]; }).filter(function (x) { return !x[1].custom && x[1].sev !== 'noise' && x[1].title && ((x[1].fix && x[1].fix.length) || x[1].cause); }).sort(function (a, b) { return a[1].title.localeCompare(b[1].title, 'ru'); }).map(function (x) { return '<option value="' + x[0] + '">' + esc((x[1].kind === 'main' ? 'main: ' : 'client: ') + x[1].title.slice(0, 80)) + '</option>'; }).join('') + '</select></label>') +
    '<label class="nl inl">Название проблемы<input type="text" id="rfTitle" value="' + esc(r.title) + '" placeholder="Коротко: что случилось"></label>' +
    '<label class="nl inl">Причина<textarea class="note" id="rfCause" placeholder="Почему так происходит">' + esc(r.cause) + '</textarea></label>' +
    '<label class="nl inl">Что делать (каждый шаг с новой строки)<textarea class="note" id="rfFix" style="min-height:90px" placeholder="Шаг 1&#10;Шаг 2">' + esc((r.fix || []).join('\n')) + '</textarea></label>' +
    '<p class="hint" id="rfErr" style="margin:0;color:var(--crit)"></p><div class="row-actions"><button class="btn sm primary" data-act="ruleSave"' + (edit ? ' data-id="' + esc(edit.id) + '"' : '') + '>Сохранить правило</button><button class="btn sm" data-act="rulePreview">Проверить на загруженных логах</button><button class="btn sm" data-act="closePanel">Отмена</button></div></div></div>';
  $('#rfPat').focus();
}
function rulePreview() {
  var pat = $('#rfPat').value.trim(), kind = $('#rfKind').value, re;
  try { var m = /^\/(.+)\/([a-z]*)$/.exec(pat); re = m ? new RegExp(m[1], m[2].replace(/[^imsu]/g, '') || 'i') : new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch (e) { return null; }
  var r = { files: 0, lines: 0, ok: 0, total: 0, okNames: [] };
  S.files.forEach(function (f) { if (f.sample || f.sc.kind !== kind) return; r.total++; var n = 0; f.parsed.entries.forEach(function (e) { if (re.test(e.text)) n++; }); if (n) { r.files++; r.lines += n; if (f.sc.verdict.status === 'ok') { r.ok++; r.okNames.push(f.label); } } });
  return r;
}
function previewText(r) {
  if (!r) return 'Образец записан с ошибкой.';
  if (!r.total) return 'Загруженных логов этого типа пока нет, проверить не на чем.';
  return 'Совпадает: строк ' + r.lines + ' в ' + r.files + ' из ' + r.total + ' логов' + (r.ok ? '. Из них успешных заходов: ' + r.ok + ' (' + r.okNames.slice(0, 3).join(', ') + '), правило может ловить обычные строки' : '') + '.';
}
function saveRule(id) {
  var pat = $('#rfPat').value.trim(), title = $('#rfTitle').value.trim(), cause = $('#rfCause').value.trim(), fix = $('#rfFix').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean), err = '';
  if (pat.length < 4) err = 'Образец слишком короткий: такое правило будет срабатывать на лишние строки.';
  else if (!title) err = 'Напишите название проблемы.';
  else if (!cause && !fix.length) err = 'Нужна причина или хотя бы один шаг решения.';
  else { try { new RegExp(/^\/(.+)\/([a-z]*)$/.test(pat) ? RegExp.$1 : 'x'); } catch (e) { err = 'Регулярное выражение с ошибкой.'; } }
  if (err) { $('#rfErr').textContent = err; return; }
  if (!id && !S.ruleOk) { var pv = rulePreview(); if (pv && pv.ok) { S.ruleOk = 1; $('#rfErr').textContent = previewText(pv) + ' Нажмите «Сохранить правило» ещё раз, если это нужно.'; return; } }
  S.ruleOk = 0;
  var rule = { id: id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), kind: $('#rfKind').value, pattern: pat, sev: $('#rfSev').value, title: title, cause: cause, fix: fix };
  var i = S.kb.custom.findIndex(function (x) { return String(x.id) === String(rule.id); });
  if (i >= 0) S.kb.custom[i] = rule; else S.kb.custom.push(rule);
  saveKB(); applyRules(); rescanAll(); $('#panelHost').innerHTML = '';
  status('Правило сохранено: «' + title.slice(0, 50) + '». Оно применено ко всем загруженным логам.'); S.sel = -1; render();
}
function entriesFromInput(files) {
  var arr = Array.prototype.slice.call(files), dirs = {}, out = [], root = '';
  arr.forEach(function (fl) {
    var p = (fl.webkitRelativePath || fl.name).split('/'); root = p[0];
    if (p.length === 2) out.push({ name: p[1], dir: false });
    else if (p.length > 2 && !dirs[p[1]]) { dirs[p[1]] = 1; out.push({ name: p[1], dir: true }); }
  });
  return { path: root, entries: out };
}


/* ---------- Настройки: горячие клавиши, обновления (v.19) ---------- */
var KEYDEF = { nextLog: 'BracketRight', prevLog: 'BracketLeft', pin: 'KeyB', copy: 'KeyC', nextProb: 'KeyN', prevProb: 'KeyP' };
var KEYNAME = { nextLog: 'Следующий лог', prevLog: 'Предыдущий лог', pin: 'Закрепить или открепить лог', copy: 'Копировать ответ игроку', nextProb: 'Следующая проблема в логе', prevProb: 'Предыдущая проблема в логе' };
function keyMap() { var o = {}, u = S.kb.settings.keys || {}; Object.keys(KEYDEF).forEach(function (k) { o[k] = u[k] !== undefined ? u[k] : KEYDEF[k]; }); return o; }
function codeLabel(c) {
  if (!c) return 'не задана';
  var m = { BracketRight: ']', BracketLeft: '[', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', Backquote: '`' };
  if (m[c]) return m[c]; return String(c).replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
function setSamples(hide) {
  S.kb.settings.hideSamples = !!hide; S.kb.settings.samplePrompt = 9; saveKB();
  if (hide) { S.files = S.files.filter(function (f) { return !f.sample; }); if (!S.files.some(function (f) { return f.id === S.active; })) S.active = S.files.length ? S.files[0].id : null; S.sel = -1; render(); }
  else if (!S.files.length) { addTexts([{ name: 'пример-main.log', size: SAMPLE_MAIN.length, text: SAMPLE_MAIN, sample: true }, { name: 'пример-client.log', size: SAMPLE_CLIENT.length, text: SAMPLE_CLIENT, sample: true }]); }
}
function samplePromptDue() { var st = S.kb.settings; return !st.hideSamples && (st.samplePrompt || 0) < 9 && ((st.launches >= 2 && !st.samplePrompt) || (st.launches >= 3 && st.samplePrompt === 1)); }
function showSamplePrompt() {
  S.kb.settings.samplePrompt = (S.kb.settings.samplePrompt || 0) + 1; saveKB();
  $('#panelHost').innerHTML = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Тестовые логи"><b>Убрать тестовые логи?</b><p style="margin:0">При запуске приложение показывает два тестовых лога, чтобы можно было сразу посмотреть, как выглядит разбор. Если они уже не нужны, их можно отключить.</p><p class="hint" style="margin:0">Не хотите сейчас? Это можно сделать позже в «Настройках».</p><div class="row-actions"><button class="btn primary" data-act="sampleOff">Отключить тестовые логи</button><button class="btn ghost" data-act="sampleKeep">Оставить пока</button></div></div></div>';
}
function applyView() {
  var st = S.kb.settings, z = +st.uiScale || 100, r = document.documentElement;
  r.style.zoom = z === 100 ? '' : String(z / 100); r.classList.toggle('dense', st.density === 'compact');
}
function openSettings() {
  var K = keyMap(), auto = S.kb.settings.autoUpdate !== false;
  var h = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Настройки"><b>Настройки</b><h4 class="kh" style="margin:6px 0 2px">Горячие клавиши</h4><p class="hint kh" style="margin:0">Нажмите на кнопку справа и затем на нужную клавишу. Одна клавиша без Ctrl и Alt; в полях ввода они не работают. Дополнительно без настройки: J и K листают логи, R копирует ответ игроку, E открывает закрытие дела.</p><div class="kh" style="display:grid;gap:4px">';
  h += Object.keys(KEYDEF).map(function (k) { var on = S.bind === k; return '<div class="lt"><span style="flex:1">' + KEYNAME[k] + '</span><button class="btn sm' + (on ? ' primary' : '') + '" data-act="keyBind" data-k="' + k + '" style="min-width:120px">' + (on ? 'Нажмите клавишу…' : esc(codeLabel(K[k]))) + '</button><button class="btn sm ghost" data-act="keyClear" data-k="' + k + '" title="Убрать клавишу" aria-label="Убрать клавишу">×</button></div>'; }).join('');
  h += '</div><div class="row-actions kh"><button class="btn sm" data-act="keyReset">Сбросить к стандартным</button></div>';
  if (window.nativeApp && window.nativeApp.updateCheck) h += '<h4 style="margin:10px 0 2px">Обновления</h4><label class="tgl"><input type="checkbox" id="autoUpd"' + (auto ? ' checked' : '') + '> Скачивать обновления в фоне (иначе приложение только предложит)</label><label class="tgl"><input type="checkbox" id="autoApply"' + (S.kb.settings.autoApply !== false ? ' checked' : '') + (auto ? '' : ' disabled') + '> Применять сами, когда вы не работаете в приложении: окно свёрнуто 2 минуты или 5 минут без действий. Открытый лог, вкладка и прокрутка сохраняются</label>';
  if (srvOn()) h += '<h4 style="margin:10px 0 2px">Резервная копия базы знаний</h4><p class="hint" style="margin:0">Копия хранится на сервере и делается сама раз в сутки. Её можно вернуть после переустановки Windows. ' + (S.kb.settings.backupAt ? 'Последняя копия: ' + esc(fmtDT(S.kb.settings.backupAt)) + '.' : 'Копии ещё не было.') + '</p><div class="row-actions"><button class="btn sm" data-act="bkNow">Сделать копию сейчас</button><button class="btn sm" data-act="bkRestore">Восстановить из копии</button></div>';
  if (srvOn()) h += '<h4 style="margin:10px 0 2px">Массовые проблемы</h4><p class="hint" style="margin:0">Когда одинаковых проблем в логах команды больше порога, приложение покажет уведомление с быстрым решением.</p><div class="lt"><label class="nl inl">За день<input type="number" min="2" id="massDay" value="' + massTh().day + '" style="width:90px"></label><label class="nl inl">За неделю<input type="number" min="2" id="massWeek" value="' + massTh().week + '" style="width:90px"></label></div>';
  h += '<h4 style="margin:10px 0 2px">Вид</h4><div class="lt"><label class="nl inl">Масштаб<select class="sel" id="uiScale">' + [90, 100, 110, 125, 150].map(function (z) { return '<option value="' + z + '"' + ((+S.kb.settings.uiScale || 100) === z ? ' selected' : '') + '>' + z + '%</option>'; }).join('') + '</select></label><label class="nl inl">Плотность<select class="sel" id="density"><option value="normal"' + (S.kb.settings.density === 'compact' ? '' : ' selected') + '>Обычная</option><option value="compact"' + (S.kb.settings.density === 'compact' ? ' selected' : '') + '>Компактная</option></select></label></div>';
  h += '<h4 style="margin:10px 0 2px">Сохранение логов</h4><label class="tgl"><input type="checkbox" id="keepBox"' + (S.kb.settings.keepLogs === false ? '' : ' checked') + '> Хранить загруженные логи на этом компьютере, чтобы они оставались после перезапуска</label><div class="row-actions"><button class="btn sm" data-act="selfCheck" title="Версия, размер хранилища, связь с сервером">Проверка приложения</button><button class="btn sm" data-act="lsClear">Удалить сохранённые логи</button></div>';
  if (SAMPLE) h += '<h4 style="margin:10px 0 2px">ИИ-разбор</h4><label class="tgl"><input type="checkbox" id="aiAutoBox"' + (S.kb.settings.aiAuto === true ? ' checked' : '') + '> Сразу разбирать проблемные логи с ИИ сразу при открытии (по умолчанию выключено, разбор идёт по кнопке)</label><p class="hint" style="margin:0">Каждый разбор расходует лимит ИИ. Личные данные скрываются. Если выключить, разбор запускается кнопкой «Разобрать с ИИ».</p>';
  if (srvOn()) h += '<h4 style="margin:10px 0 2px">Улучшение правил</h4><label class="tgl"><input type="checkbox" id="shareBox"' + (shareOn() ? ' checked' : '') + '> Отправлять загруженные логи на сервер команды для улучшения правил: без шума, с маской личных данных (почта, IP, имя пользователя Windows, токены, пароли), хранятся 7 дней</label>';
  h += '<div id="srulesHost">' + rulesSettingsHtml() + '</div>';
  h += '<h4 style="margin:10px 0 2px">Тестовые логи</h4><label class="tgl"><input type="checkbox" id="sampleBox"' + (S.kb.settings.hideSamples ? '' : ' checked') + '> Показывать два тестовых лога при запуске</label>';
  h += '<div class="row-actions"><button class="btn sm primary" data-act="closePanel">Готово</button></div></div></div>';
  $('#panelHost').innerHTML = h;
  if (typeof extSettingsHtml === 'function') extSettingsHtml().then(function (x) { var hs = $('#srulesHost'); if (x && hs && !$('#extKey')) hs.insertAdjacentHTML('beforebegin', x); });
  if (typeof tplSettingsHtml === 'function') { var hs2 = $('#srulesHost'); if (hs2 && !$('#tplBox')) hs2.insertAdjacentHTML('beforebegin', '<div id="tplBox">' + tplSettingsHtml() + '</div>'); }
}
/* ---------- Панель команд (Ctrl+K) ---------- */
var PAL = { items: [], sel: 0 };
function palItems() {
  var L = [], f = active();
  if (f) L.push({ g: 'Действие', t: 'Скопировать ответ игроку', run: function () { copyText(replyText(f, ''), 'Ответ игроку', 'Отправьте ответ игроку.', 'Ответ скопирован.'); } });
  Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function (b) { L.push({ g: 'Вкладка', t: b.textContent.replace(/\s+/g, ' ').trim(), run: function () { S.tab = b.getAttribute('data-tab'); render(); } }); });
  folderList().forEach(function (fo) { if (fo.type === 'case') L.push({ g: 'Дело', t: fo.name, k: 'папка дело ' + fo.files.map(function (x) { return x.label; }).join(' '), run: function () { var b = document.querySelector('[data-act="gcase"][data-id="' + fo.id + '"]'); if (b) b.click(); else { S.active = fo.files[fo.files.length - 1].id; S.tab = 'case'; render(); } } }); });
  S.files.forEach(function (x) { if (x.sample) return; L.push({ g: 'Лог', t: x.label, k: x.sc.verdict.headline + ' ' + (S.kb.tags[x.hash] || ''), run: function () { S.lastTouch = null; S.active = x.id; S.sel = -1; render(); } }); });
  ['btnAdd', 'btnHelp', 'btnDump', 'btnDir', 'btnUrl', 'btnWatch', 'btnLogs', 'btnNew', 'btnSet', 'btnUpd', 'btnTheme', 'btnBug'].forEach(function (id) { var b = document.getElementById(id); if (b && !b.hidden) L.push({ g: 'Приложение', t: b.textContent.replace(/\s+/g, ' ').trim(), run: function () { b.click(); } }); });
  return L;
}
function palFilter(q) {
  var w = q.toLowerCase().split(/\s+/).filter(Boolean);
  return PAL.items.filter(function (it) { var h = (it.g + ' ' + it.t + ' ' + (it.k || '')).toLowerCase(); return w.every(function (x) { return h.indexOf(x) !== -1; }); }).slice(0, 30);
}
function palRender() {
  var q = $('#palQ').value, r = palFilter(q); PAL.shown = r; if (PAL.sel >= r.length) PAL.sel = Math.max(0, r.length - 1);
  $('#palList').innerHTML = r.length ? r.map(function (it, i) { return '<div class="pal-i' + (i === PAL.sel ? ' on' : '') + '" role="option" data-act="palRun" data-i="' + i + '" aria-selected="' + (i === PAL.sel) + '"><span class="pal-g">' + esc(it.g) + '</span><span class="pal-t">' + esc(M(it.t)) + '</span></div>'; }).join('') : '<div class="hint" style="padding:10px">Ничего не найдено</div>';
  var on = $('#palList .on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
  PAL.items = palItems(); PAL.sel = 0;
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box pal" role="dialog" aria-label="Панель команд" data-act="noop"><input id="palQ" autocomplete="off" placeholder="Что сделать или куда перейти: лог, дело, вкладка, действие" aria-label="Команда"><div id="palList" role="listbox"></div><p class="hint" style="margin:0">↑ ↓ выбрать, Enter выполнить, Esc закрыть</p></div></div>';
  palRender(); $('#palQ').focus();
}
function palRun(i) { var it = (PAL.shown || [])[i]; if (!it) return; $('#panelHost').innerHTML = ''; it.run(); }
/* ---------- Проблема решена ---------- */
function solveScope() {
  var f = active(); if (!f) return null;
  var fo = folderOf(f), files = fo ? fo.files : [f];
  return { files: files, fo: fo, name: fo ? fo.name : f.label };
}
function solveOptions(sc) {
  var fs = S.kb.fixStats || {}, seen = {}, L = [];
  sc.files.forEach(function (f) {
    f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).forEach(function (g) {
      var mine = (fs[g.key] || {}), add = function (text, custom) { var h = LA.h32(text), id = g.key + '|' + h; if (seen[id]) return; seen[id] = 1; var e = mine[h] || { ok: 0, no: 0 }; L.push({ id: id, k: g.key, h: h, t: text, title: g.title, ok: e.ok, no: e.no, custom: custom }); };
      (g.fix || []).forEach(function (x) { add(x, false); });
      Object.keys(mine).forEach(function (h) { if (mine[h].custom) add(mine[h].t, true); });
    });
  });
  L.sort(function (a, b) { return b.ok - a.ok; });
  return L;
}
function openSolve() {
  var sc = solveScope(); if (!sc) return; S.solve = { opts: solveOptions(sc) };
  var opts = S.solve.opts, groups = {}; opts.forEach(function (o, i) { (groups[o.title] = groups[o.title] || []).push(i); });
  var h = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Проблема решена" data-act="noop"><b>Проблема решена: что помогло?</b><p class="hint" style="margin:0">' + esc(M(sc.name)) + (sc.files.length > 1 ? ' (логов: ' + sc.files.length + ')' : '') + '. Отметьте, что сработало: при такой же проблеме программа покажет это в подсказках. Можно ничего не писать: нажмите «Пропустить».</p>';
  Object.keys(groups).forEach(function (t) {
    h += '<h4 style="margin:10px 0 2px">' + esc(M(t)) + '</h4>' + groups[t].map(function (i) { var o = opts[i]; return '<label class="tgl" style="display:flex;gap:8px;align-items:flex-start;margin:4px 0"><input type="checkbox" data-solve="' + i + '"><span>' + esc(o.t) + (o.ok + o.no ? ' <em class="fs">помогло ' + o.ok + ' из ' + (o.ok + o.no) + '</em>' : '') + (o.custom ? ' <em class="fs">ваше решение</em>' : '') + '</span></label>'; }).join('');
  });
  h += '<label class="nl" style="margin-top:10px">Что ещё помогло (своими словами)<input type="text" id="solveOwn" maxlength="200" placeholder="например: поменял DNS на 8.8.8.8"></label>';
  h += '<div class="row-actions"><button class="btn sm primary" data-act="solveSave">Сохранить и закрыть лог</button><button class="btn sm" data-act="solveSkip">Пропустить</button><button class="btn sm ghost" data-act="closePanel">Отмена</button></div></div></div>';
  $('#panelHost').innerHTML = h;
}
function solveFinish(save) {
  var sc = solveScope(); if (!sc || !S.solve) return; var fs = S.kb.fixStats = S.kb.fixStats || {}, contrib = [], keys = [];
  if (save) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-solve]:checked'), function (c) {
      var o = S.solve.opts[+c.getAttribute('data-solve')]; if (!o) return;
      var e = (fs[o.k] = fs[o.k] || {})[o.h] = fs[o.k][o.h] || { t: o.t.slice(0, 160), ok: 0, no: 0 }; e.ok++; contrib.push({ k: o.k, h: o.h, r: 'ok' }); keys.push(o.t);
    });
    var own = ($('#solveOwn').value || '').trim();
    if (own) {
      var gk = sc.files[0].sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
      gk.forEach(function (g) { var h = LA.h32(own), e = (fs[g.key] = fs[g.key] || {})[h] = fs[g.key][h] || { t: own.slice(0, 160), ok: 0, no: 0, custom: 1 }; e.ok++; contrib.push({ k: g.key, h: h, r: 'ok' }); });
      keys.push(own);
    }
  }
  var at = Date.now();
  if (sc.fo) {
    var oc = S.kb.settings.caseOutcome = S.kb.settings.caseOutcome || {}; oc[sc.fo.id] = { res: 'ok', at: at, note: save ? keys.join('; ').slice(0, 300) : '', contrib: contrib };
    var cs = S.kb.settings.caseStatus = S.kb.settings.caseStatus || {}; cs[sc.fo.id] = { s: 'done', at: at };
  }
  sc.files.forEach(function (f) { S.kb.status[f.hash] = 'done'; if (!f.sample) recordHist(f); });
  var ids = sc.files.map(function (f) { return f.id; });
  ids.forEach(function (id) { var rf = S.files.find(function (x) { return x.id === id; }); if (rf) LS.del(rf.hash); delete S.pins[id]; });
  S.files = S.files.filter(function (x) { return ids.indexOf(x.id) < 0; });
  if (sc.fo) delete S.open[sc.fo.id];
  S.active = S.files.length ? S.files[0].id : null; S.solve = null; S.sel = -1; S.tab = 'diag';
  saveKB(); $('#panelHost').innerHTML = ''; render();
  status(save && keys.length ? 'Записано, что помогло. Лог закрыт и убран из списка.' : 'Лог закрыт и убран из списка.');
}
/* ---------- Сообщить о проблеме ---------- */
var BUGPAGES = [['diag', 'Диагноз'], ['log', 'Лог'], ['cmp', 'Сравнение'], ['hist', 'История'], ['rep', 'Отчёты'], ['all', 'Все логи'], ['mass', 'Массовые'], ['set', 'Настройки'], ['upd', 'Окно обновления'], ['start', 'Запуск приложения'], ['other', 'Другое']];
var bugShot = '', ERRLOG = [];
function noteErr(m) { ERRLOG.push(String(m).slice(0, 200)); if (ERRLOG.length > 8) ERRLOG.shift(); }
window.addEventListener('error', function (e) { noteErr((e.message || 'error') + (e.lineno ? ' @' + e.lineno : '')); });
window.addEventListener('unhandledrejection', function (e) { noteErr('promise: ' + (e.reason && e.reason.message || e.reason)); });
function diagInfo() {
  var kbSize = 0; try { kbSize = JSON.stringify(S.kb).length; } catch (e) {}
  var ua = (navigator.userAgent.match(/(Electron|Chrome|Firefox|Safari)\/[\d.]+/g) || []).slice(0, 2).join(' ');
  return ['Версия: ' + APP_VERSION + (S.shellVer ? ', оболочка ' + S.shellVer : ''), 'Окно: ' + innerWidth + '×' + innerHeight + ', ' + ua,
    'Логов открыто: ' + S.files.length + ', вкладка: ' + (S.tab || 'diag'), 'База знаний: ' + Math.round(kbSize / 1024) + ' КБ',
    'Ошибки приложения: ' + (ERRLOG.length ? ERRLOG.join(' | ') : 'нет')].join('\n');
}
function openBug() {
  bugShot = '';
  var cur = S.tab || 'diag';
  var h = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Сообщить о проблеме" data-act="noop"><b>Сообщить о проблеме</b><p class="hint" style="margin:0">Опишите, что пошло не так. Сообщение придёт разработчику.</p>' +
    '<label class="hint" for="bugPage" style="margin-top:8px;display:block">Где возникла проблема</label><select id="bugPage" style="width:100%">' + BUGPAGES.map(function (x) { return '<option value="' + x[1] + '"' + (x[0] === cur ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
    '<label class="hint" for="bugText" style="margin-top:8px;display:block">Что случилось</label><textarea id="bugText" rows="5" style="width:100%" placeholder="Что вы делали, что ожидали и что получилось"></textarea>' +
    '<label class="hint" for="bugLink" style="margin-top:8px;display:block">Ссылка на скриншот или видео (необязательно)</label><input id="bugLink" style="width:100%" placeholder="https://…">' +
    '<div class="row-actions" style="justify-content:flex-start;margin-top:8px"><label class="btn sm" style="cursor:pointer">Прикрепить скриншот<input type="file" id="bugFile" accept="image/*" hidden></label><span class="hint" id="bugShotInfo">Можно вставить картинку из буфера (Ctrl+V)</span></div><div id="bugPrev"></div>' +
    '<label class="hint" style="display:block;margin-top:8px"><input type="checkbox" id="bugDiag" checked> Приложить сведения о приложении (версия, размер окна, последние ошибки; без содержимого логов)</label>' +
    '<div class="hint" id="bugMsg" role="status"></div><div class="row-actions"><button class="btn sm" data-act="closePanel">Отмена</button><button class="btn sm primary" id="bugSend">Отправить</button></div></div></div>';
  $('#panelHost').innerHTML = h;
  $('#bugFile').addEventListener('change', function () { if (this.files[0]) bugAttach(this.files[0]); });
  $('#bugText').addEventListener('paste', bugPaste); $('#bugLink').addEventListener('paste', bugPaste);
  $('#bugSend').addEventListener('click', bugSend);
  $('#bugText').focus();
}
function bugPaste(e) {
  var cd = e.clipboardData; if (!cd || !cd.files || !cd.files.length) return;
  for (var i = 0; i < cd.files.length; i++) if (/^image\//.test(cd.files[i].type)) { e.preventDefault(); bugAttach(cd.files[i]); return; }
}
function bugAttach(file) {
  var rd = new FileReader();
  rd.onload = function () {
    var img = new Image();
    img.onload = function () {
      var m = 1400, k = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var q = 0.78, d = c.toDataURL('image/jpeg', q);
      while (d.length > 1000000 && q > 0.3) { q -= 0.15; d = c.toDataURL('image/jpeg', q); }
      bugShot = d; var pv = $('#bugPrev'); if (!pv) return;
      pv.innerHTML = '<img src="' + d + '" alt="Скриншот" style="max-width:100%;max-height:180px;border-radius:6px;margin-top:6px">';
      $('#bugShotInfo').textContent = 'Скриншот прикреплён';
    };
    img.onerror = function () { $('#bugMsg').textContent = 'Не удалось прочитать картинку'; };
    img.src = rd.result;
  };
  rd.readAsDataURL(file);
}
async function bugSend() {
  var text = $('#bugText').value.trim(), link = $('#bugLink').value.trim(), msg = $('#bugMsg');
  if (!text && !link && !bugShot) { msg.textContent = 'Опишите проблему или приложите скриншот'; return; }
  $('#bugSend').disabled = true; msg.textContent = 'Отправляю…';
  var r = await srv('/v1/report', { body: { page: $('#bugPage').value, text: text, link: link, shot: bugShot, v: APP_VERSION, diag: $('#bugDiag') && $('#bugDiag').checked ? diagInfo() : '' } });
  if (r && r.ok) { msg.textContent = 'Отправлено, спасибо!'; setTimeout(function () { $('#panelHost').innerHTML = ''; }, 1200); }
  else { $('#bugSend').disabled = false; msg.textContent = 'Не удалось отправить. Проверьте соединение и попробуйте ещё раз.'; }
}
function keyBindKey(ev) {
  var k = S.bind; if (ev.key === 'Escape') { S.bind = null; openSettings(); return; }
  if (/^(Shift|Control|Alt|Meta)/.test(ev.code) || /^(Enter|Space|Tab|Backspace|Delete)/.test(ev.code) || ev.ctrlKey || ev.altKey || ev.metaKey) { status('Эта клавиша не подходит: нужна одна обычная клавиша.'); return; }
  var u = S.kb.settings.keys = S.kb.settings.keys || {}, K = keyMap();
  Object.keys(K).forEach(function (o) { if (o !== k && K[o] === ev.code) u[o] = ''; });
  u[k] = ev.code; S.bind = null; saveKB(); openSettings();
}
async function checkUpdates(manual, srvShell) {
  var na = window.nativeApp; if (!na || !na.updateCheck || !na.updateInfo) return;
  try {
    var info = await na.updateInfo(), sp = na.shellPending ? await na.shellPending(srvShell) : '';
    var auto = S.kb.settings.autoUpdate !== false;
    if (sp) { if (auto && !manual) notePending(sp, true); else showUpdate(sp, 'ready', true); return; }
    if (info && info.version && info.version !== APP_VERSION) { if (auto && !manual) notePending(info.version); else showUpdate(info.version, 'ready', false); return; }
    var r = await na.updateCheck(null, { dry: !auto });
    if (r && r.has) { if (auto && !manual) notePending(r.version); else showUpdate(r.version, auto ? 'ready' : 'avail', false); return; }
    if (manual) status(r && r.msg || 'Обновлений нет.');
  } catch (e) {}
}
/* тихие обновления: скачиваются сами; применяются автоматически в незаметный момент (44-autoapply.js) или при следующем запуске */
function notePending(ver, shell) {
  if (S.pendingUpd === ver) return; S.pendingUpd = ver;
  var when = typeof autoApplyOn === 'function' && autoApplyOn() ? 'применится само, когда вы отойдёте от приложения (или при следующем запуске)' : 'применится при следующем запуске';
  var b = $('#btnUpd'); if (b) { b.classList.add('has-upd'); b.title = 'Версия ' + ver + ' скачана и ' + when + '. Нажмите, чтобы применить сейчас.'; }
  var ul = $('#updLine'); if (ul) { ul.hidden = false; ul.title = 'Версия ' + ver + ' скачана и ' + when + '. Нажмите, чтобы применить сейчас.'; }
  if (typeof aaWatch === 'function') aaWatch(ver, !!shell);
}
function updatedNotice() {
  var st = S.kb.settings, prev = st.lastVer; if (prev === APP_VERSION) return; st.lastVer = APP_VERSION; saveKB();
  if (prev) status('Приложение обновилось до версии ' + APP_VERSION + '. Что нового: кнопка «Что нового» вверху.');
}
function showUpdate(ver, kind, restart) {
  var key = ver + kind + (restart ? 'r' : '');
  if (S.updDismiss === key) return; var op = $('#upOv'); if (op && op.getAttribute('data-k') === key) return;
  popup('upd', 4, function () { buildUpdate(ver, kind, restart, key); });
}
function buildUpdate(ver, kind, restart, key) {
  if (S.updDismiss === key) return;
  var ready = kind === 'ready', d = document.createElement('div'); d.id = 'upOv'; d.className = 'panel'; d.setAttribute('data-k', key); d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-label', 'Обновление');
  var title = ready ? 'Обновление скачано' : 'Доступно обновление';
  var msg = ready ? (restart ? 'Версия ' + esc(ver) + ' уже скачана. Один перезапуск, и всё заработает. Файлы логов в приложении закроются, база знаний и настройки сохранятся.' : 'Версия ' + esc(ver) + ' уже скачана. Перезапуск не нужен: нажмите «Обновить сейчас», окно перезагрузится за секунду. Открытые логи закроются, база знаний и настройки сохранятся.') : 'Доступна новая версия ' + esc(ver) + '. Приложение скачает её и обновится без перезапуска; открытые логи закроются.';
  var go = ready ? (restart ? 'Перезапустить сейчас' : 'Обновить сейчас') : 'Скачать и обновить';
  d.innerHTML = '<div class="box"><b>' + title + '</b><p>' + msg + '</p><div class="row-actions"><button class="btn primary" id="upGo">' + go + '</button><button class="btn ghost" id="upLater">Позже</button></div></div>';
  document.body.appendChild(d);
  $('#upGo').addEventListener('click', function () { try { if (ready && restart) window.nativeApp.relaunch(); else if (ready) window.nativeApp.reloadApp(); else window.nativeApp.updateApply(); } catch (e) {} $('#upGo').disabled = true; $('#upGo').textContent = 'Обновляю…'; });
  $('#upLater').addEventListener('click', function () { S.updDismiss = key; d.remove(); status('Обновление ' + ver + ' ждёт. Нажмите «Обновление» вверху, чтобы вернуться к нему.'); });
  $('#upGo').focus();
}
var lastPulse = null, pulseBusy = false;
async function pulse() {
  if (!srvOn() || pulseBusy) return; pulseBusy = true;
  try {
    var r = await srv('/v1/pulse'); if (!r || !r.ok) return; var first = !lastPulse, prev = lastPulse || {}; lastPulse = r;
    if (!first && r.news && r.news !== prev.news) checkNews();
    if (!first && r.n !== prev.n) fetchMass(true);
    if (r.online != null) { var oe = $('#online'); if (oe) { oe.hidden = false; oe.textContent = 'Онлайн: ' + r.online; oe.title = (r.names || []).join(', '); } }
    if (r.sv !== undefined && r.sv !== S.shared.sv && r.sv !== '') fetchShared();
    if (!first && r.rv && r.rv !== prev.rv) loadTeam(false);
    if (!S.shellVer && window.nativeApp && window.nativeApp.shellInfo) { try { var si = await window.nativeApp.shellInfo(); S.shellVer = si && si.version || ''; } catch (e) {} }
    var vg = function (a, b) { var x = String(a || '').split(/[-.]/).map(Number), y = String(b || '').split(/[-.]/).map(Number); for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
    if (WEB) { if (vg(r.app, APP_VERSION)) webUpdate(r.app); }
    else if (vg(r.app, APP_VERSION) || (S.shellVer && vg(r.shell, S.shellVer))) checkUpdates(false, r.shell);
  } finally { pulseBusy = false; }
}


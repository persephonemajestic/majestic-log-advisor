/* ---------- Файлы из тикетов Discord (плагин «В анализатор») ----------
   Оболочка скачивает вложение и присылает его сюда. Файлы одного тикета складываются в папку-дело с названием тикета,
   тикет становится меткой лога, данные игрока (Discord, ник, статик, сервер, ссылка) сохраняются в деле. Только локально. */
var extQ = [], extT = 0;
var EXTQ = Promise.resolve();
function onExtImport(it) { if (!it || !it.data) return; extQ.push(it); clearTimeout(extT); extT = setTimeout(function () { EXTQ = EXTQ.then(flushExt, flushExt).catch(function () {}); }, 700); }
function playerLine(p) {
  if (!p) return '';
  var a = [];
  if (p.name || p.username) a.push('Discord: ' + (p.name || p.username) + (p.username && p.name && p.username !== p.name ? ' (@' + p.username + ')' : '') + (p.id ? ', ID ' + p.id : ''));
  if (p.nick) a.push('ник: ' + p.nick); if (p.static) a.push('статик: ' + p.static); if (p.server) a.push('сервер: ' + p.server);
  return a.join(' · ');
}
function savePlayer(gid, ticket, p, hashes) {
  var st = S.kb.settings, cp = st.casePlayers = st.casePlayers || {}, old = cp[gid] || {};
  var m = { ticket: ticket || old.ticket || '', at: Date.now(), hashes: (old.hashes || []).concat(hashes || []).filter(function (h, i, a) { return a.indexOf(h) === i; }).slice(-20) }; ['id', 'name', 'username', 'nick', 'static', 'server', 'link'].forEach(function (k) { m[k] = (p && p[k]) || old[k] || ''; });
  cp[gid] = m;
  var cn = st.caseNotes = st.caseNotes || {}, head = 'Тикет: ' + (m.ticket || '—') + (playerLine(m) ? '\n' + playerLine(m) : '') + (m.link ? '\nСообщение: ' + m.link : '');
  var cur = cn[gid] || '', mark = /^Тикет: [^\n]*(\n(Discord|ник|статик|сервер)[^\n]*)?(\nСообщение: [^\n]*)?/;
  cn[gid] = mark.test(cur) ? cur.replace(mark, head) : (cur ? head + '\n\n' + cur : head);
}
async function flushExt() {
  var batch = extQ.splice(0), by = {};
  batch.forEach(function (it) { var k = it.ticketId || it.ticket || 'misc'; (by[k] = by[k] || []).push(it); });
  for (var k in by) {
    var items = by[k], t0 = items[0], gid = 'dc:' + (t0.ticketId || k), name = t0.ticket || 'Тикет Discord';
    /* игрок дела — тот, чьих файлов больше (саппорт мог приложить свой файл в ту же ветку) */
    var cnt = {}, pl = null, best = 0; items.forEach(function (x) { if (!x.player) return; var k = x.player.id || x.player.nick || '?'; cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] > best) { best = cnt[k]; pl = x.player; } });
    var files = items.map(function (x) { return new File([x.data], x.name, { lastModified: Date.now() }); });
    /* дампы и журналы событий открываются отдельно: к логу этого же тикета, а если логов тикета нет — в окне «Только дамп» */
    var sysF = files.filter(function (x) { return /\.(dmp|mdmp|evtx)$/i.test(x.name); }); files = files.filter(function (x) { return sysF.indexOf(x) < 0; });
    var before = {}; S.files.forEach(function (f) { before[f.id] = 1; });
    if (files.length) await readFiles(files, false, { forceGroup: { id: gid, name: name, type: 'case' } });
    if (sysF.length) {
      var inCase = S.files.filter(function (f) { return f.group && f.group.id === gid && !f.sample; });
      if (inCase.length && !sysOnlyOn()) { var tgt = inCase.filter(function (f) { return f.sc.kind === 'client'; }).pop() || inCase[inCase.length - 1]; S.active = tgt.id; S.open[gid] = 1; await ingestSys(sysF, []); }
      else { if (!sysOnlyOn()) openSysOnly(); await ingestSys(sysF, []); }
    }
    S.files.forEach(function (f) { if (!before[f.id] && f.group && f.group.id === gid && !S.kb.tags[f.hash]) S.kb.tags[f.hash] = name; });
    savePlayer(gid, name, pl, S.files.filter(function (f) { return f.group && f.group.id === gid; }).map(function (f) { return f.hash; })); saveKB();
    status('Из Discord (' + name + '): ' + items.map(function (x) { return x.name; }).join(', ') + '.');
  }
  render();
}
/* Один и тот же игрок: по ID Discord; без него — по статику (и серверу, если указан у обоих) или по нику */
function samePlayer(a, b) {
  if (!a || !b) return false;
  var lo = function (s) { return String(s || '').toLowerCase().replace(/[\s_]+/g, ''); };
  if (a.id && b.id) return a.id === b.id;
  if (a.static && b.static) return a.static === b.static && (!a.server || !b.server || lo(a.server) === lo(b.server));
  if (a.nick && b.nick) return lo(a.nick) === lo(b.nick);
  return false;
}
function playerHistory(gid) {
  var cp = S.kb.settings.casePlayers || {}, me = cp[gid]; if (!me) return [];
  return Object.keys(cp).filter(function (k) { return k !== gid && samePlayer(me, cp[k]); }).map(function (k) { return Object.assign({ gid: k }, cp[k]); }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }).slice(0, 10);
}
/* Сравнение «тот тикет → этот»: последние логи одного типа из двух дел */
function compareCases(ga, gb) {
  var fa = S.files.filter(function (f) { return f.group && f.group.id === ga; }), fb = S.files.filter(function (f) { return f.group && f.group.id === gb; });
  if (!fa.length || !fb.length) return;
  var by = function (l) { return l.slice().sort(function (a, b) { return fileTime(a) - fileTime(b); }); }, lb = by(fb), b = lb[lb.length - 1], la = by(fa.filter(function (f) { return f.sc.kind === b.sc.kind; })), a = la[la.length - 1] || by(fa)[fa.length - 1];
  S.cmpA = a.id; S.cmpB = b.id; S.tab = 'cmp'; render(); window.scrollTo(0, 0);
}
function ddmm(ms) { var d = new Date(ms || 0), z = function (n) { return (n < 10 ? '0' : '') + n; }; return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2); }
function casePlayerHtml(gid) {
  var p = ((S.kb.settings.casePlayers || {})[gid]); if (!p) return '';
  var line = playerLine(p), hist = playerHistory(gid), have = {};
  folderList().forEach(function (fo) { have[fo.id] = 1; });
  var h = '<p class="cplayer"><b>Тикет ' + esc(p.ticket || '') + '</b>' + (line ? ' · ' + esc(line) : '') + (p.link ? ' · <a href="' + esc(p.link) + '" target="_blank" rel="noopener">открыть в Discord</a>' : '') + '</p>';
  if (hist.length) h += '<details class="phist"><summary>Прошлые тикеты этого игрока: ' + hist.length + '</summary><ul>' + hist.map(function (x) {
    var hs = (x.hashes || []).map(function (k) { return S.kb.hist[k]; }).filter(Boolean), top = hs.find(function (s) { return s.status !== 'ok'; }) || hs[0];
    return '<li><span class="mono">' + ddmm(x.at) + '</span> ' + (have[x.gid] ? '<button class="linkbtn" data-act="gcase" data-id="' + esc(x.gid) + '">' + esc(x.ticket || 'тикет') + '</button>' : '<b>' + esc(x.ticket || 'тикет') + '</b>') + (top ? ' — ' + esc(String(top.headline || '').slice(0, 140)) : '') + (have[x.gid] ? ' · <button class="linkbtn" data-act="cmpCase" data-a="' + esc(x.gid) + '" data-b="' + esc(gid) + '" title="Сравнить последний лог того тикета с последним логом этого">сравнить</button>' : '') + (x.link ? ' · <a href="' + esc(x.link) + '" target="_blank" rel="noopener">Discord</a>' : '') + '</li>';
  }).join('') + '</ul></details>';
  return h;
}
async function extSettingsHtml() {
  if (!window.nativeApp || !window.nativeApp.extInfo) return '';
  var i = null; try { i = await window.nativeApp.extInfo(); } catch (e) {}
  if (!i) return '';
  return '<h4 style="margin:10px 0 2px">Плагин Discord</h4><p class="hint" style="margin:0">«Разбор» у логов и скриншотов в тикете показывает причину и готовый ответ игроку прямо в Discord (окно, кнопка «Вставить ответ в чат»), <b>Ctrl+Shift+L</b> — разбор последнего лога открытого тикета. «В анализатор» отправляет файл сюда целиком. Вставьте этот ключ в настройки плагина (BetterDiscord или Vencord).' + (i.on ? ' Приёмник работает, порт ' + i.port + '.' : ' Приёмник не запустился.') + '</p><div class="lt"><code class="mono" id="extKey" style="flex:1;overflow-wrap:anywhere">' + esc(i.token) + '</code><button class="btn sm" data-act="extCopy">Скопировать ключ</button><button class="btn sm ghost" data-act="extReset" title="Старый ключ перестанет работать">Новый ключ</button></div>';
}
/* Плагин Discord просит подключиться: показываем окно, по «Разрешить» оболочка отдаёт плагину ключ */
function showPair(d) {
  if (!d || !window.nativeApp || !window.nativeApp.extPairAnswer) return;
  var ans = function (ok) { try { window.nativeApp.extPairAnswer(d.id, ok); } catch (e) {} $('#panelHost').innerHTML = ''; status(ok ? 'Плагин Discord подключён: ключ передан.' : 'Подключение плагина Discord отклонено.'); };
  $('#panelHost').innerHTML = '<div class="panel" data-act="noop"><div class="box" role="dialog" aria-label="Подключить плагин Discord"><b>Подключить плагин Discord?</b><p style="margin:0">Плагин MajesticLogImport в ' + esc(d.client || 'Discord') + ' просит ключ, чтобы отправлять сюда логи из тикетов. Если вы сейчас нажали «Подключить» в настройках плагина — разрешите.</p><div class="row-actions"><button class="btn primary" id="pairOk">Разрешить</button><button class="btn" id="pairNo">Отклонить</button></div></div></div>';
  $('#pairOk').addEventListener('click', function () { ans(true); }); $('#pairNo').addEventListener('click', function () { ans(false); }); $('#pairOk').focus();
}
if (window.nativeApp && window.nativeApp.onExtPair) window.nativeApp.onExtPair(showPair);
if (window.nativeApp && window.nativeApp.onExtImport) { window.nativeApp.onExtImport(onExtImport); try { window.nativeApp.extReady(); } catch (e) {} }

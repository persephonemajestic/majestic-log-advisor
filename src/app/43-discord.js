/* ---------- Файлы из тикетов Discord (плагин «В анализатор») ----------
   Оболочка скачивает вложение и присылает его сюда. Файлы одного тикета складываются в папку-дело с названием тикета,
   тикет становится меткой лога, данные игрока (Discord, ник, статик, сервер, ссылка) сохраняются в деле. Только локально. */
var extQ = [], extT = 0;
function onExtImport(it) { if (!it || !it.data) return; extQ.push(it); clearTimeout(extT); extT = setTimeout(flushExt, 700); }
function playerLine(p) {
  if (!p) return '';
  var a = [];
  if (p.name || p.username) a.push('Discord: ' + (p.name || p.username) + (p.username && p.name && p.username !== p.name ? ' (@' + p.username + ')' : '') + (p.id ? ', ID ' + p.id : ''));
  if (p.nick) a.push('ник: ' + p.nick); if (p.static) a.push('статик: ' + p.static); if (p.server) a.push('сервер: ' + p.server);
  return a.join(' · ');
}
function savePlayer(gid, ticket, p) {
  var st = S.kb.settings, cp = st.casePlayers = st.casePlayers || {}, old = cp[gid] || {};
  var m = { ticket: ticket || old.ticket || '', at: Date.now() }; ['id', 'name', 'username', 'nick', 'static', 'server', 'link'].forEach(function (k) { m[k] = (p && p[k]) || old[k] || ''; });
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
    var pl = null; items.forEach(function (x) { if (x.player) pl = x.player; });
    var files = items.map(function (x) { return new File([x.data], x.name, { lastModified: Date.now() }); });
    var before = {}; S.files.forEach(function (f) { before[f.id] = 1; });
    S.forceGroup = { id: gid, name: name, type: 'case' };
    await readFiles(files);
    S.forceGroup = null;
    S.files.forEach(function (f) { if (!before[f.id] && f.group && f.group.id === gid && !S.kb.tags[f.hash]) S.kb.tags[f.hash] = name; });
    savePlayer(gid, name, pl); saveKB();
    status('Из Discord (' + name + '): ' + items.map(function (x) { return x.name; }).join(', ') + '.');
  }
  render();
}
function casePlayerHtml(gid) {
  var p = ((S.kb.settings.casePlayers || {})[gid]); if (!p) return '';
  var line = playerLine(p);
  return '<p class="cplayer"><b>Тикет ' + esc(p.ticket || '') + '</b>' + (line ? ' · ' + esc(line) : '') + (p.link ? ' · <a href="' + esc(p.link) + '" target="_blank" rel="noopener">открыть в Discord</a>' : '') + '</p>';
}
async function extSettingsHtml() {
  if (!window.nativeApp || !window.nativeApp.extInfo) return '';
  var i = null; try { i = await window.nativeApp.extInfo(); } catch (e) {}
  if (!i) return '';
  return '<h4 style="margin:10px 0 2px">Плагин Discord</h4><p class="hint" style="margin:0">Кнопка «В анализатор» на вложениях в ваших тикетах отправляет файлы сюда. Вставьте этот ключ в настройки плагина (BetterDiscord или Vencord).' + (i.on ? ' Приёмник работает, порт ' + i.port + '.' : ' Приёмник не запустился.') + '</p><div class="lt"><code class="mono" id="extKey" style="flex:1;overflow-wrap:anywhere">' + esc(i.token) + '</code><button class="btn sm" data-act="extCopy">Скопировать ключ</button><button class="btn sm ghost" data-act="extReset" title="Старый ключ перестанет работать">Новый ключ</button></div>';
}
if (window.nativeApp && window.nativeApp.onExtImport) { window.nativeApp.onExtImport(onExtImport); try { window.nativeApp.extReady(); } catch (e) {} }

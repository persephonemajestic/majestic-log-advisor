/* ---------- «Настройки» → «Правила и база знаний» (бывшая вкладка «Обучение» без списка строк) ---------- */
function rulesSettingsHtml() {
  var c = S.kb.custom, t = S.kb.settings.team, m = S.kb.settings.dxFb || {}, bad = Object.keys(m).filter(function (h) { return m[h].v === 'bad'; }).length;
  var h = '<h4 style="margin:10px 0 2px">Правила и база знаний</h4>';
  h += '<div class="lt"><span style="flex:1">Мои правила: <b>' + c.length + '</b></span><button class="btn sm" data-act="ruleNew">Добавить правило</button></div>';
  if (c.length) h += '<div class="srules">' + c.map(function (r) { return '<div class="lt"><span class="pill sev-' + r.sev + '">' + SEVRU[r.sev] + '</span><span style="flex:1;min-width:0;overflow-wrap:anywhere">' + esc(r.title) + ' <span class="mut">(' + r.kind + ')</span></span><button class="btn sm ghost" data-act="ruleEdit" data-id="' + esc(r.id) + '">Изменить</button><button class="btn sm ghost" data-act="ruleTeam" data-id="' + esc(r.id) + '" title="Скопировать запись для общего файла rules.json">Для команды</button><button class="btn sm ghost" data-act="ruleDel" data-id="' + esc(r.id) + '">Удалить</button></div>'; }).join('') + '</div>';
  h += '<div class="lt"><span style="flex:1">Правила команды: <b>' + (t ? t.rules.length : 0) + '</b>' + (t ? ' <span class="mut">обновлено ' + esc(fmtDT(t.at)) + '</span>' : '') + '</span><button class="btn sm" data-act="teamRefresh">Обновить</button><button class="btn sm" data-act="teamExport" title="Скопировать ваши правила для общего файла rules.json">Мои правила для команды</button></div>';
  h += '<div class="lt"><span style="flex:1">Спорные диагнозы (оценка «Неверный»): <b>' + bad + '</b></span><button class="btn sm" data-act="fbExport"' + (bad ? '' : ' disabled') + '>Скачать список</button></div>';
  var by = {}; Object.keys(m).forEach(function (hh) { var e = m[hh]; (e.keys || []).forEach(function (k) { var r = by[k] = by[k] || { ok: 0, bad: 0 }; r[e.v === 'ok' ? 'ok' : 'bad']++; }); });
  var susp = Object.keys(by).filter(function (k) { return by[k].bad >= 3 && by[k].bad > by[k].ok; });
  if (susp.length) h += '<div class="alertbox" style="margin:4px 0"><b>Эти правила по вашим оценкам чаще ошибочны, чем верны</b><div class="hint">' + susp.map(function (k) { return '<code>' + esc(k) + '</code>: неверных ' + by[k].bad + ', верных ' + by[k].ok; }).join('; ') + '</div></div>';
  h += '<div class="row-actions"><button class="btn sm" data-act="kbExport">Экспорт базы знаний</button><button class="btn sm" data-act="kbImport" title="Объединить чужую базу знаний с вашей: ничего не затирается">Слить с чужой базой</button></div>';
  return h;
}
function exportFb() {
  var m = S.kb.settings.dxFb || {}, out = Object.keys(m).filter(function (h) { return m[h].v === 'bad'; }).map(function (h) { var e = m[h]; return { hash: h, label: e.label, kind: e.kind, headline: e.head, keys: e.keys, ai: e.ai, at: new Date(e.at).toISOString() }; });
  if (!out.length) return; var b = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'spornye-diagnozy.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  status('Список спорных диагнозов сохранён: ' + out.length + '.');
}

/* ---------- Обновление (только приложение) ---------- */
function changelogHtml(n) {
  return CHANGELOG.slice(0, n).map(function (c) { return '<div><h4 style="margin:6px 0 4px">Версия ' + esc(c.v) + '</h4><ul style="margin:0;padding-left:20px;display:grid;gap:6px">' + c.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; }).join('');
}
async function openUpdate() {
  var i = {}; try { i = await window.nativeApp.updateInfo(); } catch (e) {}
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Обновление"><b>Обновление приложения</b><p class="hint" style="margin:0">Запущена версия ' + esc(APP_VERSION) + (i.override ? ' (установленное обновление)' : ' (встроенная)') + '. Обновление меняет только интерфейс и правила, база знаний и настройки сохраняются.</p>' +
    '<div style="display:grid;gap:12px;max-height:320px;overflow:auto">' + changelogHtml(3) + '</div><details class="card plain"><summary>Ручное обновление</summary><div class="row-actions"><button class="btn sm primary" data-act="updFile">Обновить из файла…</button>' + (i.override ? '<button class="btn sm" data-act="updReset">Вернуть встроенную версию</button>' : '') + '</div>' +
    '<p class="hint" style="margin:6px 0 0">Файл обновления — это Majestic-Log-Advisor.html новой версии. Можно также указать ссылку, по которой приложение само проверяет обновление при запуске (например, прямая ссылка на файл в вашем хранилище).</p>' +
    '<label class="nl inl">Ссылка для автообновления (необязательно)<input type="text" id="updUrl" value="' + esc(i.url || '') + '" placeholder="https://…/Majestic-Log-Advisor.html"></label></details>' +
    '<div class="row-actions"><button class="btn sm" data-act="updUrl">Сохранить и проверить</button><button class="btn sm" data-act="closePanel">Закрыть</button></div><p class="hint" id="updMsg" style="margin:0"></p></div></div>';
}

/* ---------- Claude внутри приложения ---------- */
var NOT_ERR = 'Не ошибки (шум): Item in pool, Cannot destroy NetworkObject, CDataFileMgr::FindDataFile (если рядом нет ERR_SYS_FILELOAD), Duplicate weapon item с First seen: commoncrc:/data/ai/weapons.meta, MJ Auth: Error fetching, No localized string, Store not found, taskkill: нет процесса, метка [Error] сама по себе. Если есть Game Started и Connected with id, игрок зашёл, ошибки выше можно пропустить.';
function relIds(f) { var o = [], s = {}; f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).slice(0, 10).forEach(function (g) { if (!s[g.rule.id]) { s[g.rule.id] = 1; o.push(g.rule.id); } }); return o; }
function knowledge(kind, ids) {
  return LA.RULES.filter(function (r) { return r.kind === kind && r.sev !== 'noise' && r.sev !== 'ok' && r.cause && (!ids || ids.indexOf(r.id) >= 0); }).map(function (r) {
    return '- ' + r.title + ' [' + SRCRU[r.src] + ']: ' + r.cause + (r.fix.length ? ' Решение: ' + r.fix.join(' / ') : '') + (r.tpl && r.tpl.length ? ' Шаблоны: ' + r.tpl.join('; ') : '');
  }).join('\n');
}
function ctxLines(f, u, n) {
  var out = [], es = f.parsed.entries;
  u.entries.slice(0, n).forEach(function (i) { var e = es[i], a = Math.max(0, e.i - 3), b = Math.min(f.parsed.lines.length - 1, e.j + 3); out.push('--- строки ' + (a + 1) + '–' + (b + 1)); for (var k = a; k <= b && k < a + 14; k++) out.push(LA.stripAnsi(f.parsed.lines[k]).slice(0, 300)); });
  return out.join('\n');
}
function aiPromptFinding(f, g) {
  var sc = f.sc, L = [];
  L.push('Ты опытный инженер поддержки игры Majestic RP (мультиплеер GTA V). Саппорт разбирает лог ' + sc.kind + '.log. Для найденной проблемы решение в базе компании отсутствует, слишком короткое или неудачно написано. Твоя задача: предложить хорошее, конкретное решение. Отвечай по-русски. Не противоречь правилам компании ниже. Всё, чего нет в базе компании, помечай словом «предположение». Не выдумывай строки, коды и пути, которых нет во фрагментах. Если решения без дополнительных данных не существует, скажи, какие вопросы задать игроку и какие данные собрать.');
  L.push('Формат ответа: 1) Оценка текущего решения (чего не хватает). 2) Улучшенная пошаговая инструкция для саппорта: конкретные действия Windows, пути, настройки, в порядке от самого вероятного к самому редкому. 3) Какие вопросы задать игроку. 4) Короткий готовый текст ответа игроку. 5) Когда эскалировать дальше и что приложить.');
  L.push('\nПРАВИЛА КОМПАНИИ, относящиеся к найденному (' + sc.kind + '.log):\n' + knowledge(sc.kind, [g.rule.id]) + '\n' + NOT_ERR);
  L.push('\nПРОБЛЕМА: ' + g.title + ' (встретилась ' + g.count + ' раз, источник объяснения: ' + SRCRU[g.src] + ')');
  L.push('Текущая причина в базе: ' + (g.cause || 'нет'));
  L.push('Текущее решение в базе: ' + (g.fix && g.fix.length ? g.fix.map(function (x, i) { return (i + 1) + '. ' + x; }).join(' ') : 'НЕТ'));
  if (g.dets.size) L.push('Детали из лога: ' + Array.from(g.dets.keys()).slice(0, 4).join(' | ').slice(0, 500));
  var nt = S.kb.ruleNotes[g.key]; if (nt) L.push('Уже есть заметка саппорта: ' + nt.slice(0, 800));
  L.push('Итог всего лога: ' + sc.verdict.headline);
  L.push('Фрагменты лога:\n' + ctxLines(f, g, 2));
  return LA.mask(L.join('\n')).slice(0, 38000);
}
function aiPrompt(f, u) {
  var sc = f.sc, v = sc.verdict, L = [];
  L.push((f.sc.mods ? 'ВАЖНО: в этом логе найдены моды вне папки модификаций: ' + f.sc.mods.files.join('; ') + '. Для саппорта это причина крашей и незапуска номер один (по опыту, в подавляющем большинстве случаев), начни разбор с неё. ' : '') + 'Ты помогаешь саппорту игры Majestic RP (мультиплеер GTA V) разбирать логи лаунчера (main.log) и клиента (client.log). Отвечай по-русски, коротко и по делу. Сначала опирайся на правила компании ниже. Всё, чего в них нет, помечай словом «предположение». Не выдумывай строки и коды ошибок, которых нет во фрагментах. Если данных мало, скажи об этом и назови, какой ещё лог или вопрос к игроку нужен.');
  L.push('Формат ответа: 1) Что произошло. 2) Вероятная причина. 3) Что делать саппорту, по шагам. 4) Короткий текст ответа игроку. 5) Уверенность (высокая, средняя, низкая) и почему.');
  L.push('\nПРАВИЛА КОМПАНИИ, относящиеся к найденному (' + sc.kind + '.log):\n' + knowledge(sc.kind, relIds(f)) + '\n' + NOT_ERR);
  L.push('\nФАЙЛ: ' + f.label + ' (' + sc.kind + '.log, ' + f.parsed.lines.length + ' строк). Итог автоанализа: ' + STRU[v.status] + '. ' + v.headline + ' ' + v.lines.join(' '));
  if (u) {
    L.push('\nВОПРОС: строка не распознана правилами. Объясни, что она может означать и связана ли с проблемой игрока.');
    L.push('Строка (×' + u.count + '): ' + u.sample + '\nСтатистика по загруженным логам: ' + u.cls.text + (u.rec && u.rec.note ? '\nЗаметка саппорта: ' + u.rec.note : ''));
    L.push('Фрагменты лога вокруг неё:\n' + ctxLines(f, u, 2));
  } else {
    L.push('\nНАЙДЕНО АВТОАНАЛИЗОМ:');
    sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).slice(0, 12).forEach(function (g) { L.push('- [' + SEVRU[g.sev] + '] ' + g.title + ' ×' + g.count + (g.dets.size ? ' | ' + Array.from(g.dets.keys()).slice(0, 3).join(' | ').slice(0, 300) : '')); });
    var un = sc.unknown.filter(function (x) { return x.sev !== 'noise'; }).slice(0, 6);
    if (un.length) { L.push('\nНЕОПОЗНАННЫЕ warn/error строки (правил нет):'); un.forEach(function (x) { L.push('- ×' + x.count + ' ' + x.sample.slice(0, 220) + ' | ' + x.cls.text); }); }
    if (sc.stage && sc.stage.ctx.length) L.push('\nКОНТЕКСТ КРАША: ' + sc.stage.ctx.map(function (c) { return c.text; }).join(' | '));
    var g0 = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.err; })[0];
    if (g0) L.push('\nФРАГМЕНТ ЛОГА у главной проблемы:\n' + ctxLines(f, g0, 1));
    L.push('\nЗадача: подтверди или уточни вывод автоанализа, найди связь между находками и скажи, на что смотреть в первую очередь.');
  }
  return LA.mask(L.join('\n')).slice(0, 38000);
}
/* ---------- ИИ-разбор по системному промту ---------- */
/* В приложении нет своего бэкенда с полем system: ИИ вызывается через встроенный вызов Claude (sample),
   у которого системной роли нет. Поэтому системный промт идёт ведущим сообщением, а ответ принимается строго как JSON по схеме. */
var AI_PROMPT_VERSION = /*#AI_PROMPT_VERSION*/;
var AI_SYSTEM = String.raw`/*#AI_PROMPT*/`;
var AI_NOISE_LINE = /ERR_SYS_FILELOAD, Missing rpf|Missing rpf|^\s*--\s+0x[0-9a-f]+\s*$|Callstack:\s*$/i;
function aiChrono(f, n) {
  var es = f.parsed.entries, end = es.length - 1, i, found = false;
  for (i = 0; i < es.length; i++) { if (/MINIDUMP: Temporary dump saved/.test(es[i].text)) { end = i; found = true; break; } }
  if (!found) for (i = es.length - 1; i >= 0; i--) { if (/^Shutting down|Game Started|Connected with id/.test(es[i].text)) { end = i; break; } }
  var out = [];
  for (i = end; i >= 0 && out.length < n; i--) {
    var e = es[i]; if (AI_NOISE_LINE.test(e.text)) continue;
    if (/^(Last loaded asset|Texture info)/.test(e.text) || e.lvl === 'error' || e.lvl === 'warn' || e.lvl === 'crit' || out.length < 12 || /tick was too long|Peer limiter|Packet failed|Cannot destroy|Failed to fetch|Duplicate weapon|Store not found/.test(e.text)) out.push('[' + e.ts + '][' + e.lvl + (e.node ? '/' + e.node : '') + '] ' + e.text.split(' ⏎ ').slice(0, 3).join(' ⏎ ').slice(0, 260));
  }
  var tail = []; for (i = end + 1; i < es.length && tail.length < 14; i++) if (!AI_NOISE_LINE.test(es[i].text)) tail.push('[' + es[i].ts + '] ' + es[i].text.split(' ⏎ ')[0].slice(0, 220));
  return { before: out.reverse(), after: tail, endTs: es[end] ? es[end].ts : '' };
}
function aiSquash(lines, max) {
  var map = {}, ord = [];
  lines.forEach(function (l) { var k = l.replace(/^\[[^\]]*\]/, '').replace(/0x[0-9a-f]+/gi, '0xN').replace(/\d+(?:\.\d+)?/g, 'N'); if (map[k]) { map[k].n++; map[k].last = l; } else { map[k] = { first: l, n: 1 }; ord.push(map[k]); } });
  return ord.slice(-max).map(function (o) { return o.n > 1 ? o.first + '  ×' + o.n + ' (повторяется)' : o.first; });
}
function aiInput(f) {
  var sc = f.sc, L = [], ch = aiChrono(f, 220), cln = null;
  try { cln = LogCleaner.clean(String(f.text || ''), { deathLines: 40 }); } catch (e) {}
  if (cln && cln.death.length) { ch.before = aiSquash(cln.death.map(function (l) { return l.slice(0, 260); }), 60); ch.trigName = cln.trigger.kind; }
  else ch.before = aiSquash(ch.before, 60);
  L.push('ЛОГ: ' + f.label + ' (' + (sc.kind === 'client' ? 'client.log' : 'main.log лаунчера') + ', ' + f.parsed.lines.length + ' строк). Строки «ERR_SYS_FILELOAD, Missing rpf» из данных удалены как фоновый шум.');
  if (sc.env) L.push('Окружение: ' + JSON.stringify(sc.env).slice(0, 700));
  var mods = []; for (var i = 0; i < f.parsed.lines.length && mods.length < 10; i++) if (/discordhook|RTSSHooks|bandicam|bandihook|nvspcap|GameOverlayRenderer|graphics-hook|owclient|MSIAfterburner|reshade|dxgi\.dll|d3d11\.dll/i.test(f.parsed.lines[i]) && !/SYSTEM32|SysWOW64/i.test(f.parsed.lines[i])) mods.push(f.parsed.lines[i].trim().slice(0, 200));
  if (mods.length) L.push('\nЗАГРУЖЕННЫЕ МОДУЛИ, похожие на оверлеи и хуки:\n' + mods.join('\n'));
  if (sc.stage && sc.stage.ctx.length) L.push('\nКОНТЕКСТ ДАМПА (после MINIDUMP):\n' + sc.stage.ctx.map(function (c) { return c.text; }).join('\n'));
  if (cln) { var st = cln.stats, sq = Object.keys(st.squashed).map(function (k) { return k + ' ×' + st.squashed[k]; }), rm = Object.keys(st.removed).map(function (k) { return k + ' ×' + st.removed[k]; }); L.push('\nОЧИСТКА ЛОГА ПЕРЕД ОТПРАВКОЙ: ' + st.inLines + ' строк → ' + st.outLines + '. Удалено как шум: ' + (rm.join(', ') || 'нет') + '. Свёрнуто повторов (это фон, не причина): ' + (sq.join(', ') || 'нет') + '.'); }
  L.push('\nПОСЛЕДНИЕ 40 ЗАПИСЕЙ ПЕРЕД ' + (ch.trigName || 'ЗАВЕРШЕНИЕМ') + ' (до ' + ch.endTs + ', по порядку, шум и FILELOAD убраны):\n' + ch.before.join('\n'));
  if (ch.after.length) L.push('\nЧТО ПОСЛЕ:\n' + ch.after.join('\n'));
  L.push('\nПОВТОРЯЮЩИЕСЯ ПРОБЛЕМЫ (по счётчику, без FILELOAD):');
  sc.findings.filter(function (g) { return g.rule.id !== 'c-fileload' && SEV[g.sev] >= SEV.warn; }).slice(0, 14).forEach(function (g) { L.push('- ×' + g.count + ' ' + g.title + (g.dets.size ? ' | ' + Array.from(g.dets.keys()).slice(0, 3).join(' | ').slice(0, 260) : '')); });
  var un = sc.unknown.filter(function (x) { return x.sev !== 'noise' && !AI_NOISE_LINE.test(x.sample); }).slice(0, 8);
  if (un.length) { L.push('\nНЕОПОЗНАННЫЕ warn/error строки:'); un.forEach(function (x) { L.push('- ×' + x.count + ' ' + x.sample.slice(0, 220)); }); }
  if (sc.mods) L.push('\nМОДЫ вне папки модификаций: ' + sc.mods.files.slice(0, 10).join('; '));
  if (f.sys && (f.sys.dump || f.sys.ev)) L.push('\nСИСТЕМНЫЕ ДАННЫЕ ИГРОКА (дамп и журнал Windows, разбор правилами): ' + SysDiag.briefLine(f.sys));
  L.push('\nСделай диагноз и верни JSON по схеме.');
  return LA.mask(L.join('\n')).replace(/\b(nickname|nick|userName|username|login|playerName)(['"]?\s*[:=]\s*)(['"])[^'"\n]{1,40}\3/gi, '$1$2$3<ник>$3').slice(0, 60000);
}
var AI_CATS = { ASSET_RENDER_CRASH: 'Рендер ассетов', STREAMER_DESYNC: 'Стример alt:V', CEF_CRASH: 'CEF (интерфейс)', POOL_OVERFLOW: 'Память и пулы', NETWORK_GATEWAY: 'Сеть и шлюзы', GPU_DRIVER: 'Видеоподсистема', DATA_CORRUPTION: 'Повреждение данных', LAUNCHER_PATCHER: 'Лаунчер и патчер', SCRIPT_RUNTIME: 'Скрипты (V8)', NO_ISSUE: 'Проблем нет', UNKNOWN: 'Не определено' };
var AI_SEV = { CRITICAL: 'критичная', HIGH: 'высокая', MEDIUM: 'средняя', LOW: 'низкая', NONE: 'нет' };
function aiParse(x) {
  if (typeof x === 'string') { var a = x.indexOf('{'), b = x.lastIndexOf('}'); if (a < 0 || b <= a) throw { code: 'invalid_json', message: 'нет JSON' }; x = JSON.parse(x.slice(a, b + 1)); }
  if (!x || !x.category || !x.summary || !x.technical_cause || !Array.isArray(x.solutions)) throw { code: 'invalid_json', message: 'ответ не по схеме' };
  var cat = String(x.category).toUpperCase().replace(/[^A-Z_]/g, ''); if (!AI_CATS[cat]) cat = 'UNKNOWN';
  var sv = String(x.severity || '').toUpperCase().replace(/[^A-Z]/g, ''); if (!AI_SEV[sv]) sv = 'MEDIUM';
  var lv = String(x.confidence && x.confidence.level || x.confidence || '').toUpperCase().replace(/[^A-Z]/g, ''); if (lv !== 'HIGH' && lv !== 'MEDIUM' && lv !== 'LOW') lv = 'LOW';
  return { category: cat, fault_asset: String(x.fault_asset || '').slice(0, 200), severity: sv, summary: String(x.summary), technical_cause: String(x.technical_cause), confidence: lv, confidence_note: String(x.confidence_note || (x.confidence && x.confidence.note) || ''), solutions: x.solutions.map(String).filter(Boolean).slice(0, 10) };
}
var CONFRU = { HIGH: 'высокая', MEDIUM: 'средняя', LOW: 'низкая' };
/* ---------- Оценка диагноза и сверка ИИ с правилами ---------- */
function fbHtml(f) {
  var fb = (S.kb.settings.dxFb || {})[f.hash];
  return '<div class="fb" style="display:flex;gap:6px;align-items:center;margin-top:8px"><span class="hint">Диагноз верный?</span><button class="btn sm' + (fb && fb.v === 'ok' ? ' on' : '') + '" data-act="dxfb" data-v="ok">Верный</button><button class="btn sm' + (fb && fb.v === 'bad' ? ' on' : '') + '" data-act="dxfb" data-v="bad">Неверный</button></div>';
}
function setFb(f, v) {
  var m = S.kb.settings.dxFb = S.kb.settings.dxFb || {}, cur = m[f.hash];
  if (cur && cur.v === v) delete m[f.hash];
  else m[f.hash] = { v: v, at: Date.now(), label: f.label, kind: f.sc.kind, head: M(f.sc.verdict.headline).slice(0, 160), keys: f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).map(function (g) { return g.key; }).slice(0, 6), ai: f.diag ? f.diag.category : '' };
  saveKB(); render();
}
function aiConflict(f, d) {
  var sc = f.sc, st = sc.verdict.status, probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn && g.key !== 'ERR_SYS_FILELOAD'; }), sev = d.severity;
  if (st === 'ok' && !probs.length && d.category !== 'NO_ISSUE' && (sev === 'CRITICAL' || sev === 'HIGH')) return 'Правила не нашли проблем в логе, а ИИ называет сбой серьёзным (' + AI_CATS[d.category] + '). Проверьте по строкам лога, ИИ мог принять шум за причину.';
  if ((st === 'bad' || st === 'crit') && d.category === 'NO_ISSUE') return 'Правила нашли сбой, а ИИ пишет «проблем нет». Ориентируйтесь на находки правил выше.';
  if (sc.mods && d.category !== 'DATA_CORRUPTION' && d.category !== 'LAUNCHER_PATCHER' && d.category !== 'ASSET_RENDER_CRASH') return 'В папке игры найдены моды, это главная причина по руководству. ИИ назвал другую категорию (' + AI_CATS[d.category] + '): сначала уберите моды.';
  var dm = f.sys && f.sys.dump; if (dm && dm.fault && dm.fault.cls === 'gpu' && d.category !== 'GPU_DRIVER') return 'Дамп показывает падение внутри драйвера видеокарты, а ИИ назвал категорию «' + AI_CATS[d.category] + '». Проверьте дамп.';
  return '';
}
function diagHtml(f) {
  var d = f.diag, h = '<div class="ai-h">Диагноз ИИ</div>';
  if (f.diagBusy) return h + '<div class="ai" id="diagTxt">ИИ разбирает лог…</div>';
  if (f.diagErr) return h + '<div class="ai err">' + esc(f.diagErr) + '</div>';
  if (!d) return h + '<p class="hint" style="margin:0 0 8px">ИИ разберёт лог как инженер по краш-дампам alt:V: категория, причина, уверенность и шаги решения. ERR_SYS_FILELOAD он считает фоновым шумом.</p><div class="row-actions"><button class="btn sm primary" data-act="diagRun" id="diagBtn">Разобрать с ИИ</button></div>';
  var cf = aiConflict(f, d);
  return h + (cf ? '<div class="alertbox" style="margin-bottom:8px"><b>ИИ и правила расходятся</b><div class="hint">' + esc(cf) + '</div></div>' : '') + diagBody(d, 'diagCopy', 'diagRun');
}
function diagBody(d, copyAct, runAct) {
  return '<div class="diag"><dl><dt>Категория</dt><dd><b>' + esc(AI_CATS[d.category]) + '</b> <span class="mut">' + d.category + '</span> · серьёзность: ' + AI_SEV[d.severity] + '</dd>' + (d.fault_asset ? '<dt>Сбойный ассет</dt><dd><b>' + esc(d.fault_asset) + '</b></dd>' : '') + '<dt>Суть</dt><dd>' + esc(d.summary) + '</dd><dt>Причина</dt><dd>' + esc(d.technical_cause) + '</dd><dt>Уверенность</dt><dd><b class="conf ' + d.confidence.toLowerCase() + '">' + CONFRU[d.confidence] + '</b>' + (d.confidence_note ? ' · ' + esc(d.confidence_note) : '') + '</dd><dt>Решение</dt><dd><ol>' + d.solutions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></dd></dl><div class="hint" style="margin:0 0 6px">Промпт ' + AI_PROMPT_VERSION + (SAMPLE && SAMPLE.cached ? ', ответ из кэша сервера (лимит не потрачен)' : '') + '</div><div class="row-actions"><button class="btn sm ghost" data-act="' + copyAct + '">Копировать диагноз</button><button class="btn sm ghost" data-act="' + runAct + '">Разобрать заново</button></div></div>';
}
function diagText(f, dd) { var d = dd || f.diag; return 'Категория: ' + AI_CATS[d.category] + ' (' + d.category + '), серьёзность: ' + AI_SEV[d.severity] + (d.fault_asset ? '\nСбойный ассет: ' + d.fault_asset : '') + '\nСуть: ' + d.summary + '\nПричина: ' + d.technical_cause + '\nУверенность: ' + CONFRU[d.confidence] + (d.confidence_note ? ' (' + d.confidence_note + ')' : '') + '\nРешение:\n' + d.solutions.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n'); }
function drawDiag(f) { var b = $('#diagBox'); if (b && f === active()) b.innerHTML = diagHtml(f); var bt = $('#diagBtn'); if (bt) bt.disabled = !!f.diagBusy; }
async function runDiag(f, force) {
  if (!SAMPLE || f.diagBusy) return;
  f.diagBusy = true; f.diagErr = ''; drawDiag(f);
  try {
    var turns = [{ role: 'user', content: AI_SYSTEM }, { role: 'user', content: aiInput(f) }], opt = { modelTier: 'default', cache: force ? { gcTime: 3600000, refresh: true } : { gcTime: 3600000 } };
    var raw = SAMPLE.json ? await SAMPLE.json(turns, opt) : (await SAMPLE(turns, opt)).text;
    f.diag = aiParse(raw);
  } catch (e) {
    f.diag = null;
    f.diagErr = e && e.code === 'not_granted' ? 'Доступ к Claude не разрешён для этой страницы.' : e && e.code === 'ai_fail' ? e.message : e && e.code === 'rate_limited' ? (e.message && /лимит/.test(e.message) ? e.message : 'Слишком много запросов, подождите немного и повторите.') : e && e.code === 'invalid_json' ? 'ИИ ответил не по схеме. Нажмите «Разобрать заново».' : 'Не удалось получить разбор от ИИ. Нажмите «Разобрать заново».';
  }
  f.diagBusy = false; f.diagDone = true; drawDiag(f);
}
function maybeAutoDiag(f) {
  if (!SAMPLE || !f || f.sample || f.diagDone || f.diagBusy || S.kb.settings.aiAuto !== true || !f.sc || f.sc.verdict.status === 'ok') return;
  setTimeout(function () { if (f === active()) runDiag(f, false); }, 400);
}


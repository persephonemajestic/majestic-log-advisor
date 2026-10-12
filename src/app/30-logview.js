/* ---------- Просмотр лога ---------- */
/* Быстрые срезы лога: этот запуск и окно перед MINIDUMP */
function scopeRange(f) {
  var n = f.parsed.lines.length, es = f.parsed.entries;
  if (S.scope === 'run') {
    var st = 0;
    if (f.sc.kind === 'client') { for (var i = es.length - 1; i >= 0; i--) if (/Logger initialized|Majestic Multiplayer inited/.test(es[i].text)) { st = es[i].i; if (/Logger initialized/.test(es[i].text)) break; } }
    else if (f.sc.attempts && f.sc.attempts.length) st = f.sc.attempts[f.sc.attempts.length - 1].line;
    return st > 0 ? [st, n] : null;
  }
  if (S.scope === 'dump') { var d = f.sc.stage && f.sc.stage.dump; if (!d) return null; return [Math.max(0, d.i - 200), d.i + 12]; }
  if (S.scope === 'time') {
    var w = S.tw; if (!w || w.fid !== f.id) return null;
    var lo = -1, hi = -1;
    for (var j = 0; j < es.length; j++) { var t = entryMs(f, es[j]); if (t == null) continue; if (t >= w.c - TWIN && lo < 0) lo = es[j].i; if (t <= w.c + TWIN) hi = es[j].j; }
    return lo >= 0 && hi >= lo ? [lo, hi] : null;
  }
  return null;
}
/* Поиск по логу: «-слово» убирает строки с этим словом, «a | b» ищет любое из вариантов, остальное ищется как фраза */
function parseQ(q) {
  var not = [], rest = q.replace(/(^|\s)-("[^"]+"|\S+)/g, function (m, sp, w) { not.push(w.replace(/"/g, '')); return ' '; }).trim();
  var any = rest ? rest.split('|').map(function (x) { return x.trim(); }).filter(Boolean) : [];
  return { not: not, any: any };
}
function savedQ() { var a = S.kb.settings.savedQ; return Array.isArray(a) ? a : []; }
function drawSavedQ() {
  var b = $('#savedQ'); if (!b) return; var a = savedQ(), cur = S.q.trim();
  b.innerHTML = (cur && a.indexOf(cur) < 0 ? '<button class="chip" data-act="qSave" title="Сохранить запрос, чтобы вызывать его одним кликом">☆ Сохранить запрос</button>' : '') +
    a.map(function (x, i) { return '<span class="chip qchip' + (x === cur ? ' on' : '') + '"><button class="qgo" data-act="qUse" data-i="' + i + '" title="Искать: ' + esc(x) + '">' + esc(x) + '</button><button class="qx" data-act="qDel" data-i="' + i + '" aria-label="Удалить запрос">×</button></span>'; }).join('');
}

/* Ошибки по времени: полоса над логом, столбик на минуту (или на равный отрезок, если лог длинный) */
function timeHist(f) {
  if (f.th !== undefined && f.thOf === f.parsed) return f.th; f.thOf = f.parsed;
  var es = f.parsed.entries, pts = [], prev = null, add = 0;
  for (var i = 0; i < es.length; i++) { var t = entryMs(f, es[i]); if (t == null) continue; if (prev != null && t + add < prev - 3600000 && f.parsed.kind !== 'main') add += 86400000; t += add; prev = t; pts.push([t, es[i]]); }
  if (pts.length < 2) return (f.th = null);
  var t0 = Infinity, t1 = -Infinity; pts.forEach(function (p) { if (p[0] < t0) t0 = p[0]; if (p[0] > t1) t1 = p[0]; }); var span = t1 - t0;
  if (span < 120000) return (f.th = null);
  var n = Math.min(120, Math.ceil(span / 60000)), w = span / n, bins = [];
  for (var b = 0; b < n; b++) bins.push({ e: 0, w: 0, line: -1, from: t0 + b * w });
  pts.forEach(function (p) { var e = p[1], s = e.sev; if (s < SEV.warn) return; var k = Math.max(0, Math.min(n - 1, Math.floor((p[0] - t0) / w))), bn = bins[k]; if (s >= SEV.err) bn.e++; else bn.w++; if (bn.line < 0) bn.line = e.i; });
  var max = 0; bins.forEach(function (x) { max = Math.max(max, x.e + x.w); });
  return (f.th = max ? { bins: bins, max: max, w: w } : null);
}
function hhmm(ms) { var d = new Date(ms); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); }
function drawTimeHist(f) {
  var box = $('#th'); if (!box) return; var th = timeHist(f);
  if (!th) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  var step = th.w >= 90000 ? Math.round(th.w / 60000) + ' мин' : 'минуту';
  box.innerHTML = '<span class="thl">Ошибки за ' + step + '</span><div class="thb" role="list">' + th.bins.map(function (b) {
    var tot = b.e + b.w, h = tot ? Math.max(12, Math.round(100 * Math.sqrt(tot / th.max))) : 0, eh = tot ? Math.round(h * b.e / tot) : 0;
    var tip = hhmm(b.from) + ': ' + (tot ? 'ошибок ' + b.e + ', предупреждений ' + b.w + '. Нажмите, чтобы перейти' : 'без проблем');
    return '<button class="thc" role="listitem"' + (b.line >= 0 ? ' data-act="jump" data-line="' + b.line + '"' : ' disabled') + ' title="' + tip + '" aria-label="' + tip + '"><i style="height:' + h + '%"><b style="height:' + (h ? Math.round(100 * eh / h) : 0) + '%"></b></i></button>';
  }).join('') + '</div><span class="thr">' + hhmm(th.bins[0].from) + ' – ' + hhmm(th.bins[th.bins.length - 1].from + th.w) + '</span>';
}

/* Шаблоны: все записи лога, сгруппированные по виду (числа, адреса, время заменены), с подсчётом. Клик оставляет в логе только этот шаблон. */
function patterns(f) {
  if (f.pats && f.patsOf === f.parsed) return f.pats; f.patsOf = f.parsed;
  var es = f.parsed.entries, lines = f.parsed.lines, m = new Map();
  for (var i = 0; i < es.length; i++) {
    var e = es[i], raw = LA.stripAnsi(lines[e.i]), k = foldKey(raw); if (!k) continue;
    var p = m.get(k); if (!p) { p = { key: k, n: 0, line: e.i, sev: 0, sample: raw.replace(/^(?:\s*\[[^\]]*\])+\s*/, '') }; m.set(k, p); }
    p.n++; if (e.sev > p.sev) p.sev = e.sev;
  }
  f.pats = Array.from(m.values()).sort(function (a, b) { return b.n - a.n; });
  return f.pats;
}
function patHtml(k) { return esc(k.length > 220 ? k.slice(0, 220) + '…' : k).replace(/#/g, '<i class="pv">…</i>'); }
function drawPatterns(f) {
  var box = $('#pats'); if (!box) return;
  if (!S.patOpen) { box.hidden = true; box.innerHTML = ''; return; }
  var ps = patterns(f), pq = (S.patQ || '').toLowerCase(), list = ps.filter(function (p) { return (!S.patProb || p.sev >= SEV.warn) && (!pq || p.key.toLowerCase().indexOf(pq) !== -1); });
  box.hidden = false;
  box.innerHTML = '<div class="pth"><b>Шаблоны строк</b><span class="hint">' + ps.length.toLocaleString('ru') + ' видов на ' + f.parsed.entries.length.toLocaleString('ru') + ' записей. Меняющиеся части (числа, время, адреса) заменены на …</span><label class="tgl"><input type="checkbox" id="patProb"' + (S.patProb ? ' checked' : '') + '> только проблемные</label><input type="search" id="patQ" placeholder="Фильтр шаблонов" value="' + esc(S.patQ || '') + '" aria-label="Фильтр шаблонов"></div>' +
    '<div class="ptl">' + (list.length ? list.slice(0, 200).map(function (p) { return '<button class="ptr s' + p.sev + (S.pat === p.key ? ' on' : '') + '" data-act="patPick" data-k="' + esc(p.key) + '" title="Показать в логе только строки этого вида"><span class="ptn">×' + p.n.toLocaleString('ru') + '</span><span class="ptk">' + patHtml(p.key) + '</span></button>'; }).join('') : '<span class="hint">Нет подходящих шаблонов.</span>') + '</div>';
}

/* Окно по времени вокруг выбранной строки */
var TWIN = 30000;
function entryMs(f, e) { if (!e || !/^\d\d:\d\d:\d\d/.test(e.ts || '')) return null; return LA.toMs(e, f.parsed.kind); }
function timeWindow(f, line) {
  var ei = f.parsed.lineEntry[line], e = ei >= 0 ? f.parsed.entries[ei] : null, c = entryMs(f, e);
  if (c == null) { status('У этой строки нет времени, окно построить нельзя.'); return; }
  S.tw = { fid: f.id, c: c, ts: e.ts.slice(0, 8) }; S.scope = 'time'; jump(e.i);
}

/* Свёртка подряд идущих одинаковых строк: числа, адреса и время не учитываются */
function foldOn() { return S.kb.settings.logFold === true; }
function foldKey(s) { return s.replace(/^(?:\s*\[[^\]]*\])+\s*/, '').replace(/0x[0-9a-f]+/gi, '#').replace(/\d+/g, '#').trim(); }
function foldView(f, idx) {
  var lines = f.parsed.lines, ls = f.parsed.lineSev, out = [], rep = {}, head = -1, hk = null;
  for (var k = 0; k < idx.length; k++) {
    var i = idx[k], key = foldKey(LA.stripAnsi(lines[i]));
    if (head >= 0 && key && key === hk && ls[i] === ls[head] && i !== S.sel) { rep[head] = (rep[head] || 1) + 1; continue; }
    out.push(i); head = i; hk = key;
  }
  f.rep = rep; return out;
}

/* Подсветка синтаксиса строки: время, уровень, модуль, коды, адреса, пути, ссылки, версии, строки */
var TOKRE = /(\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?\]|\[\d\d:\d\d:\d\d(?:\.\d+)?\])|(\[(?:[Ee]rr(?:or)?|ERR(?:OR)?|[Ff]atal|FATAL|[Ww]arn(?:ing)?|WARN(?:ING)?|[Ii]nfo|INFO|[Dd]ebug|DEBUG|[Tt]race|TRACE)\])|(\[\s*\([^)]*\)\s*\]|\[[A-Za-z][\w ,.:-]{0,30}\])|(https?:\/\/[^\s'"<>)\]}]+)|((?:[A-Za-z]:|\\\\)[\\\/][^\s'",)}\]]*)|(\bERR_[A-Z0-9_]+\b|\b[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}\b)|(\b0x[0-9a-fA-F]+\b|\b[0-9a-fA-F]{16,}\b)|(\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|\*\*\*\.\*\*\*\.\*\*\*\.\*\*\*(?::\d+)?)|(\bv?\d+\.\d+\.\d+(?:\.\d+)*\b)|('[^'\n]{0,200}'|"[^"\n]{0,200}")|(\b[A-Za-z_][\w.]*(?=: ))/g;
var TOKCL = ['', 'k-ts', 'k-lv', 'k-nd', 'k-url', 'k-path', 'k-code', 'k-hex', 'k-net', 'k-ver', 'k-str', 'k-key'];
function tok(s) {
  if (!s) return '';
  var out = '', last = 0, m; TOKRE.lastIndex = 0;
  while ((m = TOKRE.exec(s))) {
    if (!m[0]) { TOKRE.lastIndex++; continue; }
    var g = 1; while (g < m.length && m[g] === undefined) g++;
    var cl = TOKCL[g] || '';
    if (g === 2) cl += ' k-' + m[0].slice(1, -1).toLowerCase().replace('warning', 'warn').replace(/^err$/, 'error').replace('fatal', 'error');
    out += esc(s.slice(last, m.index)) + '<span class="' + cl + '">' + esc(m[0]) + '</span>'; last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

/* Фрагмент лога для тикета: выбранная запись ±5 строк, личные данные всегда скрыты */
function fragmentText(f, line) {
  var ei = f.parsed.lineEntry[line], e = ei >= 0 ? f.parsed.entries[ei] : { i: line, j: line, rid: -1 }, n = f.parsed.lines.length;
  var a = Math.max(0, e.i - 5), b = Math.min(n - 1, Math.min(e.j, e.i + 40) + 5), L = [];
  L.push('Фрагмент лога: ' + LA.mask(f.label) + (f.sc.kindName ? ' (' + f.sc.kindName + ')' : '') + ', строки ' + (a + 1) + '–' + (b + 1));
  if (e.rid >= 0) { var g = f.sc.keyed.get(e.key); if (g) L.push('Проблема: ' + g.title); }
  L.push('');
  for (var i = a; i <= b; i++) L.push((i >= e.i && i <= e.j ? '> ' : '  ') + (i + 1) + ': ' + LA.mask(LA.stripAnsi(f.parsed.lines[i])));
  return L.join('\n');
}
function buildView(f) {
  /* кэш: тот же набор фильтров для того же разбора — та же выборка строк (на логах в сотни тысяч строк это десятки мс на каждое переключение) */
  var vk = [S.mode, S.ctx, S.lvl, S.quiet, S.scope, S.scope === 'time' && S.tw ? S.tw.fid + ':' + S.tw.c : '', S.q, foldOn(), foldOn() ? S.sel : '', S.pat || '', S.patFid || ''].join('\u0001');
  if (f.view && f._vk === vk && f._vp === f.parsed) return;
  f._vk = vk; f._vp = f.parsed; f.pre = null; f._pk = '';
  var ls = f.parsed.lineSev, n = ls.length, lines = f.parsed.lines, idx = [], i, q = S.q.trim().toLowerCase();
  if (S.mode === 'problems') {
    var keep = new Uint8Array(n), c = S.ctx ? 2 : 0;
    for (i = 0; i < n; i++) if (ls[i] >= SEV.unk) for (var k = Math.max(0, i - c); k <= Math.min(n - 1, i + c); k++) keep[k] = 1;
    for (i = 0; i < n; i++) if (keep[i]) idx.push(i);
  } else for (i = 0; i < n; i++) idx.push(i);
  if (S.lvl) idx = idx.filter(function (i) { return ls[i] >= S.lvl; });
  if (S.quiet) idx = idx.filter(function (i) { return ls[i] !== SEV.noise; });
  var rg = scopeRange(f); if (rg) idx = idx.filter(function (i) { return i >= rg[0] && i <= rg[1]; });
  if (S.pat && S.patFid === f.id) { var es0 = f.parsed.entries, le = f.parsed.lineEntry, okE = new Uint8Array(es0.length); for (var pe = 0; pe < es0.length; pe++) if (foldKey(LA.stripAnsi(lines[es0[pe].i])) === S.pat) okE[pe] = 1; idx = idx.filter(function (i) { return le[i] >= 0 && okE[le[i]]; }); }
  if (q) { var qq = parseQ(q); idx = idx.filter(function (i) { var l = lines[i].toLowerCase(); for (var x = 0; x < qq.not.length; x++) if (l.indexOf(qq.not[x]) !== -1) return false; if (!qq.any.length) return true; for (var y = 0; y < qq.any.length; y++) if (l.indexOf(qq.any[y]) !== -1) return true; return false; }); }
  f.rep = null; if (foldOn()) idx = foldView(f, idx);
  f.view = idx;
}

function wrapOn() { return S.kb.settings.logWrap !== false; }
var CHW = 7.2;
function calcPre(f) {
  if (!f || !f.view) return;
  var sc = $('#sc'); if (!wrapOn() || !sc) { f.pre = null; return; }
  var fs = parseFloat(sc.style.fontSize) || 12, pr = document.createElement('span'); pr.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + fs + 'px ' + getComputedStyle(sc).fontFamily; pr.textContent = 'M'.repeat(100); sc.appendChild(pr); CHW = pr.getBoundingClientRect().width / 100 || fs * 0.6; sc.removeChild(pr);
  var cpl = Math.max(20, Math.floor((sc.clientWidth - ROW * 3.2 - 24) / CHW) - 1), n = f.view.length, pk = cpl + '|' + n + '|' + f._vk;
  if (f.pre && f._pk === pk) return;
  var pre = new Int32Array(n + 1), lines = f.parsed.lines; f._pk = pk;
  for (var i = 0; i < n; i++) { var L = lines[f.view[i]].length; pre[i + 1] = pre[i] + Math.max(1, Math.min(60, Math.ceil(L / cpl))); }
  f.pre = pre;
}
function offs(f, i) { return (f.pre ? f.pre[i] : i) * ROW; }
function totalH(f) { return offs(f, f.view.length); }
function rowAt(f, y) {
  if (!f.pre) return Math.floor(y / ROW);
  var t = y / ROW, lo = 0, hi = f.view.length - 1, r = 0;
  while (lo <= hi) { var m = (lo + hi) >> 1; if (f.pre[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
window.addEventListener('resize', function () { var f = active(), sc = $('#sc'); if (!f || !sc || !f.view || !wrapOn() || S.tab !== 'log') return; clearTimeout(window.__rz); window.__rz = setTimeout(function () { sc = $('#sc'); if (!sc || !$('#sp') || S.tab !== 'log' || active() !== f || !f.view) return; var ln = f.view[rowAt(f, sc.scrollTop)]; calcPre(f); $('#sp').style.height = totalH(f) + 'px'; var p = f.view.indexOf(ln); sc.scrollTop = offs(f, Math.max(0, p)); drawRows(); }, 150); });
function zoomPct() { return Math.min(300, Math.max(50, +S.kb.settings.logZoom || 100)); }
function applyZoom(keep) {
  var sc = $('#sc'), z = zoomPct(), f0 = active(), ln0 = sc && f0 && f0.view ? f0.view[rowAt(f0, sc.scrollTop)] : null; ROW = Math.max(10, Math.round(20 * z / 100));
  if (sc) { sc.style.setProperty('--lh', ROW + 'px'); sc.style.fontSize = (12 * z / 100) + 'px'; var sp = $('#sp'), f = active(); if (sp && f && f.view) { calcPre(f); sp.style.height = totalH(f) + 'px'; } if (!keep && f && f.view) { var p0 = ln0 != null ? f.view.indexOf(ln0) : 0; sc.scrollTop = offs(f, Math.max(0, p0)); drawRows(); } }
  var lb = $('#zoomLbl'); if (lb) lb.textContent = z + '%';
}
function stepZoom(d) { var z = zoomPct(); S.kb.settings.logZoom = d === 0 ? 100 : Math.min(300, Math.max(50, z + d * (z >= 150 ? 20 : 10))); saveKB(); applyZoom(false); }
function renderLogShell(f) {
  $('#view').innerHTML = '<div class="logview">' + logHeadHtml(f) + '<div class="lt"><div class="seg" role="group" aria-label="Режим"><button data-act="mode" data-mode="problems" class="' + (S.mode === 'problems' ? 'on' : '') + '">Только проблемы</button><button data-act="mode" data-mode="all" class="' + (S.mode === 'all' ? 'on' : '') + '">Все строки</button></div>' +
    '<div class="seg" role="group" aria-label="Масштаб текста"><button data-act="zoom" data-v="-1" title="Уменьшить (Ctrl и минус, Ctrl и колесо мыши)" aria-label="Уменьшить текст">A−</button><button data-act="zoom" data-v="0" id="zoomLbl" title="Сбросить масштаб (Ctrl и 0)">' + zoomPct() + '%</button><button data-act="zoom" data-v="1" title="Увеличить (Ctrl и плюс, Ctrl и колесо мыши)" aria-label="Увеличить текст">A+</button></div>' +
    '<label class="tgl" for="wrapBox" title="Длинные строки переносятся, видно весь текст"><input type="checkbox" id="wrapBox"' + (wrapOn() ? ' checked' : '') + '> Перенос строк</label><label class="tgl" for="ctxBox"><input type="checkbox" id="ctxBox"' + (S.ctx ? ' checked' : '') + '> ±2 строки контекста</label><select class="sel" id="lvlSel" aria-label="Минимальный уровень">' + [[0, 'Любой уровень'], [4, 'Неопознано и выше'], [5, 'Внимание и выше'], [6, 'Ошибки и выше'], [7, 'Только критично']].map(function (x) { return '<option value="' + x[0] + '"' + (S.lvl === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select><button class="btn sm" data-act="nav" data-dir="-1" title="Клавиша P">◀ Пред. проблема</button><button class="btn sm" data-act="nav" data-dir="1" title="Клавиша N">След. проблема ▶</button><div class="seg" role="group" aria-label="Срез лога"><button data-act="scope" data-v="all" class="' + (S.scope === 'all' ? 'on' : '') + '">Весь лог</button><button data-act="scope" data-v="run" class="' + (S.scope === 'run' ? 'on' : '') + '" title="Только последний запуск клиента или последняя попытка">Этот запуск</button>' + (f.sc.stage && f.sc.stage.dump ? '<button data-act="scope" data-v="dump" class="' + (S.scope === 'dump' ? 'on' : '') + '" title="200 строк перед MINIDUMP и несколько после">До MINIDUMP</button>' : '') + '' + (S.scope === 'time' && S.tw && S.tw.fid === f.id ? '<button data-act="scope" data-v="time" class="on" title="Строки за 30 секунд до и после выбранной">±30 с от ' + esc(S.tw.ts) + '</button>' : '') + '<button data-act="quiet" class="' + (S.quiet ? 'on' : '') + '" title="Скрыть строки, помеченные как шум">Без шума</button><button data-act="pats" class="' + (S.patOpen ? 'on' : '') + '" title="Все строки лога, сгруппированные по виду, с подсчётом">Шаблоны</button><button data-act="fold" class="' + (foldOn() ? 'on' : '') + '" title="Одинаковые строки подряд показываются один раз со счётчиком ×N (числа и время не учитываются)">Свернуть повторы</button></div><input type="search" id="logQ" placeholder="Поиск: фраза, a | b, -исключить" title="Фраза ищется целиком. a | b — любое из вариантов. -слово убирает строки с этим словом." value="' + esc(S.q) + '" aria-label="Поиск по логу"><span class="hint" id="logCnt"></span></div><div class="chips" id="savedQ"></div><div class="th" id="th" hidden></div><div class="pats card" id="pats" hidden></div>' + (S.pat && S.patFid === f.id ? '<div class="chips"><span class="chip qchip on"><button class="qgo" data-act="patsOpen" title="Открыть шаблоны">Только шаблон: ' + esc(S.pat.slice(0, 80)) + (S.pat.length > 80 ? '…' : '') + '</button><button class="qx" data-act="patClear" aria-label="Показать все строки">×</button></span></div>' : '') + '<div class="chips" id="marks"></div>' +
    '<div class="legend"><span><i style="background:var(--crit)"></i>критично</span><span><i style="background:var(--err)"></i>ошибка</span><span><i style="background:var(--warn)"></i>внимание</span><span><i style="background:var(--unk)"></i>неопознано</span><span><i style="background:var(--ok)"></i>успех</span><span><i style="background:var(--noise)"></i>шум</span></div>' +
    '<div class="logsplit"><div class="logmain"><div class="scw"><div class="sc' + (wrapOn() ? ' wrap' : '') + '" id="sc" tabindex="0" aria-label="Строки лога"><div class="sp" id="sp"><div class="rows" id="rows"></div></div></div><canvas id="mm" class="mm" aria-hidden="true" title="Карта лога: цветом отмечены проблемы, клик переходит к месту"></canvas></div></div><aside class="card ins" id="ins"><span class="hint">Нажмите на строку, чтобы увидеть объяснение.</span></aside></div></div>';
  applyZoom(true); refreshLog(true); drawMarks(); drawSavedQ(); drawTimeHist(f); drawPatterns(f);
  $('#sc').addEventListener('scroll', function () { drawRows(); drawMinimap(); });
  $('#sc').addEventListener('wheel', function (ev) { if (!ev.ctrlKey) return; ev.preventDefault(); stepZoom(ev.deltaY < 0 ? 1 : -1); }, { passive: false });
}
function refreshLog(resetScroll) {
  var f = active(); if (!f) return;
  buildView(f);
  calcPre(f); $('#sp').style.height = totalH(f) + 'px';
  $('#logCnt').textContent = 'Показано ' + f.view.length.toLocaleString('ru') + ' из ' + f.parsed.lines.length.toLocaleString('ru') + ' строк';
  if (resetScroll) $('#sc').scrollTop = 0;
  drawRows(); drawInspector(f); drawMinimap();
}
function hl(text, e) {
  var a = -1, b = -1, m;
  if (e && e.rid >= 0) { m = LA.RULES[e.rid].re.exec(text); if (m && m[0]) { a = m.index; b = a + Math.min(m[0].length, 140); } }
  if (a < 0 && e && e.sev >= SEV.unk) { m = /ERR_[A-Z0-9_]+|fail(?:ed|ure)?|crash(?:ed)?|error|exception|time ?out|not found|MINIDUMP/i.exec(text); if (m) { a = m.index; b = a + m[0].length; } }
  if (a < 0) return tok(text);
  return tok(text.slice(0, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>' + tok(text.slice(b));
}
function drawRows() {
  var f = active(), sc = $('#sc'); if (!f || !sc || !f.view) return;
  var total = f.view.length, a = Math.max(0, rowAt(f, sc.scrollTop) - 12), b = Math.min(total, rowAt(f, sc.scrollTop + sc.clientHeight) + 13), h = '', W = !!f.pre;
  /* пока в логе выделен текст, те же строки не перерисовываем — иначе выделение пропадает */
  var sig = [f.id, a, b, S.sel, f.marks.length, W, zoomPct()].join('|'), rws = $('#rows'); if (rws && rws.__sig === sig && rws.__view === f.view && rowsSelection()) return; if (rws) { rws.__sig = sig; rws.__view = f.view; }
  for (var i = a; i < b; i++) {
    var ln = f.view[i], ei = f.parsed.lineEntry[ln], e = ei >= 0 ? f.parsed.entries[ei] : null, s = f.parsed.lineSev[ln], txt = M(LA.stripAnsi(f.parsed.lines[ln]));
    if (txt.length > (W ? 4000 : 600)) txt = txt.slice(0, W ? 4000 : 600) + '…';
    h += '<div class="ln' + (W ? ' w' : '') + ' s' + s + (ln === S.sel ? ' sel' : '') + (f.marks.indexOf(ln) >= 0 ? ' mk' : '') + '"' + (W ? ' style="--n:' + (f.pre[i + 1] - f.pre[i]) + '"' : '') + ' data-act="pick" data-line="' + ln + '"><span class="no">' + (ln + 1) + '</span><span class="tx">' + hl(txt, e) + (f.rep && f.rep[ln] ? '<span class="rep" title="Ещё ' + (f.rep[ln] - 1) + ' таких же строк подряд скрыто">×' + f.rep[ln] + '</span>' : '') + '</span><button class="lcp" type="button" data-act="lcopy" data-line="' + ln + '" title="Копировать строку (или выделите текст мышью и Ctrl+C)" aria-label="Копировать строку"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button></div>';
  }
  var rows = $('#rows'); rows.style.transform = 'translateY(' + offs(f, a) + 'px)'; rows.innerHTML = h;
}
function drawInspector(f) {
  var box = $('#ins'); if (!box) return;
  if (S.sel < 0) { box.innerHTML = '<span class="hint">Нажмите на строку, чтобы увидеть объяснение.</span>'; return; }
  var ei = f.parsed.lineEntry[S.sel]; if (ei < 0) { box.innerHTML = ''; return; }
  var e = f.parsed.entries[ei], h = '';
  h += '<div class="vmeta"><span class="mono">L' + (e.i + 1) + (e.j > e.i ? '–' + (e.j + 1) : '') + '</span><span class="pill sev-' + (SEVN[e.sev] || 'noise') + '">' + (SEVRU[SEVN[e.sev]] || 'Обычная строка') + '</span>' + (e.node ? '<span class="kind">' + esc(e.node) + '</span>' : '') + '<span class="kind">' + e.lvl + '</span></div>';
  h += '<pre>' + esc(M(LA.stripAnsi(f.parsed.lines.slice(e.i, Math.min(e.j + 1, e.i + 40)).join('\n')))) + '</pre>';
  if (e.rid >= 0) {
    var g = f.sc.keyed.get(e.key);
    if (g) { h += '<div><b>' + esc(g.title) + '</b></div>' + (g.cause ? '<p style="margin:0">' + esc(g.cause) + '</p>' : '') + (g.fix.length ? '<ol style="margin:0;padding-left:20px">' + g.fix.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' : ''); }
  } else if (e.sig) {
    var u = f.sc.unknown.find(function (x) { return x.sig === e.sig; });
    if (u) h += '<div><span class="cls cls-' + u.cls.cls + '">' + esc(u.cls.text) + '</span></div><p class="hint" style="margin:0">Правила для этой строки нет. Метку и заметку можно добавить на вкладке «Диагноз».</p>';
  }
  var st0 = e.i; h += '<div class="row-actions"><button class="btn sm" data-act="lcopy" data-line="' + e.i + '" title="Ctrl+C, когда строка выбрана">Копировать строку</button><button class="btn sm" data-act="mark">' + (f.marks.indexOf(st0) >= 0 ? 'Снять закладку' : '★ Закладка') + '</button><button class="btn sm" data-act="ruleLine" data-line="' + e.i + '">Добавить правило по этой строке</button><button class="btn sm" data-act="fragCopy" data-line="' + e.i + '" title="Строка и по 5 строк вокруг, личные данные скрыты">Копировать фрагмент</button>' + (entryMs(f, e) != null ? '<button class="btn sm" data-act="twin" data-line="' + e.i + '" title="Показать только строки за 30 секунд до и после этой">Окно ±30 с</button>' : '') + '</div>';
  box.innerHTML = h;
}
function drawMarks() {
  var f = active(), b = $('#marks'); if (!f || !b) return;
  drawMinimap(); b.innerHTML = f.marks.length ? '<span class="hint">Закладки:</span>' + f.marks.slice().sort(function (x, y) { return x - y; }).map(function (m) { return '<button class="chip" data-act="jump" data-line="' + m + '">★ L' + (m + 1) + '</button>'; }).join('') : '';
}
function navProblem(dir) {
  var f = active(); if (!f) return;
  var es = f.parsed.entries, min = S.lvl && S.lvl >= SEV.warn ? S.lvl : SEV.warn, cur = S.sel < 0 ? (dir > 0 ? -1 : 1e9) : S.sel, best = -1, i;
  if (dir > 0) { for (i = 0; i < es.length; i++) if (es[i].sev >= min && es[i].i > cur) { best = es[i].i; break; } }
  else { for (i = es.length - 1; i >= 0; i--) if (es[i].sev >= min && es[i].i < cur) { best = es[i].i; break; } }
  if (best < 0) { status(dir > 0 ? 'Дальше проблем нет.' : 'Выше проблем нет.'); return; }
  jump(best);
}
function stepSel(dir) {
  var f = active(), sc = $('#sc'); if (!f || !f.view || !f.view.length || !sc) return;
  var pos = f.view.indexOf(S.sel); pos = pos < 0 ? rowAt(f, sc.scrollTop) : Math.max(0, Math.min(f.view.length - 1, pos + dir));
  S.sel = f.view[pos]; var top = offs(f, pos), bot = offs(f, pos + 1);
  if (top < sc.scrollTop) sc.scrollTop = top; else if (bot > sc.scrollTop + sc.clientHeight) sc.scrollTop = bot - sc.clientHeight;
  drawRows(); drawInspector(f);
}
function jump(line) {
  var f = active(); if (!f) return;
  S.tab = 'log'; S.sel = line; S.q = '';
  buildView(f);
  if (S.mode === 'problems' && f.view.indexOf(line) < 0) S.mode = 'all';
  renderTabs(); renderCmd(); renderLogShell(f);
  var lo = 0, hi = f.view.length - 1, pos = 0;
  while (lo <= hi) { var mid = (lo + hi) >> 1; if (f.view[mid] < line) lo = mid + 1; else hi = mid - 1; }
  pos = Math.min(lo, f.view.length - 1);
  var sc = $('#sc'); sc.scrollTop = Math.max(0, offs(f, pos) - sc.clientHeight / 2); drawRows(); drawInspector(f);
  sc.scrollIntoView({ block: 'nearest' });
}


/* Копирование строки лога: запись целиком (с продолжением на следующих строках), с маской личных данных, если она включена */
function lineText(f, ln) { var ei = f.parsed.lineEntry[ln], e = ei >= 0 ? f.parsed.entries[ei] : null, a = e ? e.i : ln, b = e ? Math.min(e.j, e.i + 60) : ln; return M(LA.stripAnsi(f.parsed.lines.slice(a, b + 1).join('\n'))); }
function copyLine(ln) { var f = active(); if (!f || !(ln >= 0)) return; copyText(lineText(f, ln), 'Строка лога', 'Скопируйте строку.', 'Строка L' + (ln + 1) + ' скопирована.'); }
function rowsSelection() { var s = window.getSelection && window.getSelection(), r = $('#rows'); return s && !s.isCollapsed && r && (r.contains(s.anchorNode) || r.contains(s.focusNode)) ? String(s) : ''; }
document.addEventListener('keydown', function (e) {
  if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyC' || e.shiftKey || e.altKey || S.tab !== 'log') return;
  var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
  var s = window.getSelection && window.getSelection(); if (s && !s.isCollapsed) return; /* выделенный мышью текст копирует сам браузер */
  if (S.sel >= 0) { e.preventDefault(); copyLine(S.sel); }
});
/* При копировании выделения из лога номера строк не попадают, а личные данные остаются скрытыми (берётся то, что видно на экране) */
document.addEventListener('copy', function (e) { var txt = rowsSelection(); if (!txt || !e.clipboardData) return; e.clipboardData.setData('text/plain', txt.replace(/\u00a0/g, ' ')); e.preventDefault(); });

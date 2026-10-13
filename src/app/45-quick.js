/* ---------- Быстрый разбор для плагина Discord (кнопка «Разбор», значки на вложениях, Ctrl+Shift+L) ----------
   Плагин присылает файл: лог, zip с логами или скриншот. Приложение разбирает его, НЕ добавляя в список логов, и возвращает
   коротко: вердикт, причину, как чинить, ключевые строки, «тот ли файл прислал игрок», краткий ответ игроку и текст для передачи дальше.
   Логи разбираются только на этом компьютере. Скриншот уходит на распознавание ИИ (через сервер команды) — только по кнопке «Разбор». */
var QIMG = /\.(png|jpe?g|webp|gif|bmp)$/i, QCACHE = {}, QCACHE_N = [];
function qCache(k, v) { if (v === undefined) return QCACHE[k]; QCACHE[k] = v; QCACHE_N.push(k); if (QCACHE_N.length > 60) delete QCACHE[QCACHE_N.shift()]; return v; }
function qDay(ms) { var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); }
function qShort(t) { t = String(t || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^Краш игры:\s*/, 'Краш: '); return t.length > 34 ? t.slice(0, 32).replace(/\s+\S*$/, '') + '…' : t; }
var QROOT = { protect: 'Защита Windows', install: 'Установка лаунчера', net: 'Сеть игрока', loop: 'Повторный краш' };

async function quickAnalyze(q) {
  var meta = q.meta || {}, name = String(q.name || 'file');
  var key = (meta.url || name) + '|' + (q.data ? q.data.length : 0) + '|' + (meta.mode || '');
  var hit = qCache(key + '|' + (meta.set || '') + '|' + (meta.text || '').length); if (hit) return hit;
  var r;
  if (meta.mode === 'text') r = { ok: true, kind: 'text', name: name, status: 'unk', headline: 'Ответ по тексту тикета', cause: '', why: '', steps: [], reply: '', lines: [], warnings: [], badge: { t: 'Текст', tone: 'unk' } };
  else if (QIMG.test(name)) r = await quickImage(q);
  else if (/\.zip$/i.test(name)) {
    var z = (await unzipFile(new File([q.data], name))).filter(function (x) { return !x.bin && x.text; }).slice(0, 4);
    if (!z.length) r = { ok: true, kind: 'none', status: 'unk', headline: 'В архиве нет логов', cause: 'В архиве нет .log или .txt', steps: [], reply: '', lines: [], warnings: [{ text: 'В архиве нет логов Majestic.', ask: 'Пришлите, пожалуйста, файлы main.log и client.log (папка %appdata%\\majestic-launcher).' }], badge: { t: 'Нет логов', tone: 'unk' } };
    else {
      var all = []; for (var i = 0; i < z.length; i++) all.push(await quickLog(z[i].text, z[i].name, meta, z.map(function (x) { return x.name; }).concat(meta.siblings || [])));
      var rank = { bad: 3, warn: 2, unk: 1, ok: 0 }; all.sort(function (a, b) { return (rank[b.status] - rank[a.status]) || ((b.kind === 'client') - (a.kind === 'client')); });
      r = all[0]; r.also = all.slice(1).map(function (x) { return x.name + ': ' + x.headline; });
    }
  } else r = await quickLog(await new File([q.data], name).text(), name, meta, meta.siblings || []);
  /* шаблоны команды: по тексту игрока, тексту со скриншота и найденной проблеме */
  if (meta.mode !== 'badge' && typeof tplMatch === 'function') {
    var said = meta.mode === 'text' ? await new File([q.data], name).text() : String(meta.text || '');
    var seen = r.kind === 'image' ? (r.lines || []).map(function (x) { return x.t; }).join('\n') + '\n' + (r.cause || '') : r.kind !== 'text' ? [r.cause, r.headline].filter(Boolean).join('. ') : '';
    try { r.tpl = await tplMatch([said, seen].filter(Boolean).join('\n'), { guild: meta.guild, set: meta.set }); } catch (e) { r.tpl = null; }
    if (meta.set && meta.guild) tplRemember(meta.guild, meta.set);
  }
  return qCache(key + '|' + (meta.set || '') + '|' + (meta.text || '').length, r);
}

async function quickLog(text, name, meta, siblings) {
  var an = await LA.analyzeAsync(text, name, function () { return new Promise(function (res) { setTimeout(res, 0); }); }), sc = an.sc, parsed = an.parsed;
  var st = sc.verdict.status, probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  var strong = probs.filter(function (g) { return SEV[g.sev] >= SEV.err; }), top = (strong.length ? strong : probs)[0];
  var mods = sc.mods ? sc.mods.files : [];
  /* «как чинить» — по той же проблеме, что названа причиной */
  var RG = { protect: /^(m-sac|m-gfxinject|m-inject|m-handle6)$/, install: /^m-patchmod$/, net: /^(m-net|m-dl|m-http5xx|c-conn)$/ };
  if (sc.root) top = sc.root.id === 'loop' ? (sc.findings.find(function (g) { return g.loop; }) || top) : RG[sc.root.id] ? (sc.findings.find(function (g) { return RG[sc.root.id].test(g.rule.id); }) || top) : top;
  var cause = sc.root ? sc.root.title.charAt(0).toUpperCase() + sc.root.title.slice(1) : mods.length ? 'Моды в папке игры' : top ? top.title : st === 'ok' ? 'Ошибок запуска нет' : 'Точная причина не найдена';
  var why = sc.root ? sc.root.why : mods.length ? 'В папке игры: ' + mods.slice(0, 5).join(', ') : top ? top.cause : '';
  var how = (mods.length ? ['Убрать моды из папки игры: ' + mods.slice(0, 4).map(function (x) { return String(x).split(/[\\\/]/).pop(); }).join(', ') + '.'] : []).concat(top ? (top.fix || []).slice(0, 4) : []).slice(0, 5);
  /* ключевые строки: первая строка каждой из трёх главных проблем */
  var lines = [], es = parsed.entries;
  (strong.length ? strong : probs).slice(0, 4).forEach(function (g) { var e = es[g.entries[0]]; if (!e || lines.length >= 6) return; var t = String(parsed.lines[e.i] || '').replace(/\s+/g, ' ').trim(); lines.push({ n: e.i + 1, t: LA.mask(t.length > 220 ? t.slice(0, 220) + '…' : t), sev: g.sev }); });
  /* тот ли файл прислал игрок */
  var warns = [], low = text.slice(0, 300000);
  var majestic = /majestic|Logger initialized|game\.play|crashService|patcher|MAJESTIC|Multiplayer inited/i.test(low);
  if (!majestic || parsed.lines.length < 2) warns.push({ k: 'notlog', text: parsed.lines.length < 2 ? 'Файл почти пустой.' : 'Это не похоже на лог Majestic.', ask: 'Пришлите, пожалуйста, файлы main.log и client.log из папки %appdata%\\majestic-launcher (Win+R → %appdata%\\majestic-launcher) сразу после неудачной попытки запуска.' });
  var lastDate = ((sc.range && /\d{4}-\d{2}-\d{2}/.exec(sc.range.to)) || /(\d{4}-\d{2}-\d{2})/.exec(name) || [])[0];
  var lastMs = lastDate ? Date.parse(lastDate + 'T23:59:59') : 0, msgAt = +meta.msgAt || 0;
  if (lastMs && msgAt && msgAt - lastMs > 36 * 3600000) warns.push({ k: 'stale', text: 'Лог старый: последняя запись ' + qDay(lastMs) + ', а сообщение от ' + qDay(msgAt) + '.', ask: 'Пришлите, пожалуйста, свежий лог: запустите игру ещё раз и сразу после ошибки отправьте файл. Присланный лог от ' + qDay(lastMs) + '.' });
  var crashed = sc.findings.some(function (g) { return /^(m-crashdet|m-patchcrash)$/.test(g.rule.id); });
  if (majestic && sc.kind === 'main' && crashed && !(siblings || []).some(function (x) { return /client/i.test(x); })) warns.push({ k: 'needclient', text: 'Игра упала, а причину краша покажет только client.log — его в тикете нет.', ask: 'Пришлите, пожалуйста, также файл client.log с той же попытки: Win+R → %appdata%\\majestic-launcher\\Multiplayer\\logs (самый свежий файл).' });
  if (majestic && sc.kind === 'main' && !sc.patcher && !(sc.attempts || []).length) warns.push({ k: 'noattempt', text: 'В main.log нет ни одной попытки запуска игры.', ask: 'Пришлите, пожалуйста, main.log после попытки запуска: нажмите «Играть», дождитесь ошибки и сразу отправьте файл.' });
  var ro = replyOpts(), reply = LA.composeReply(sc, { kb: S.kb, hello: ro.hello, bye: ro.bye, brief: true });
  var stale = warns.some(function (w) { return w.k === 'stale'; }), notlog = warns.some(function (w) { return w.k === 'notlog'; });
  var badge = notlog ? { t: 'Не лог Majestic', tone: 'unk' } : mods.length ? { t: 'МОД' + (stale ? ' · старый' : ''), tone: 'bad' } : st === 'ok' ? { t: 'Успех' + (stale ? ' · старый' : ''), tone: 'ok' } : { t: (sc.root && QROOT[sc.root.id] ? QROOT[sc.root.id] : qShort(top ? top.title : 'Неясно')) + (stale ? ' · старый' : ''), tone: st === 'bad' ? 'bad' : st === 'warn' ? 'warn' : 'unk' };
  var res = { ok: true, kind: sc.kindName || sc.kind, name: name, status: st, headline: sc.verdict.headline, cause: cause, why: why, steps: how, reply: reply, lines: lines, warnings: warns, badge: badge, mods: mods.slice(0, 8) };
  res.escalate = quickEscalate(res, meta);
  return res;
}

/* Текст для передачи дальше: причина, что уже предложено игроку, файлы и ключевые строки */
function quickEscalate(r, meta) {
  var L = ['**Передаю дальше**' + (meta.ticket ? ' · ' + meta.ticket : ''), 'Причина по логу: ' + r.cause + (r.headline && r.headline !== r.cause ? ' (' + r.headline + ')' : '')];
  if (r.steps.length) L.push('Уже предложено: ' + r.steps.slice(0, 3).join(' '));
  L.push('Файл: ' + r.name + (r.kind && r.kind !== 'image' ? ' (' + r.kind + '.log)' : ''));
  if (r.lines.length) L.push('```', r.lines.map(function (x) { return (x.n ? 'L' + x.n + ': ' : '') + x.t; }).join('\n').slice(0, 1500), '```');
  return L.join('\n');
}

/* ---------- Скриншоты ----------
   1) Сразу на этом компьютере: чёрные полосы по краям экрана (поле вокруг картинки игры).
   2) ИИ читает текст ошибки со скриншота; найденный текст прогоняется через правила анализатора,
      и если правило есть — шаги берутся из руководства, а не придумываются. */
var BARS_STEPS = ['Удалите файл настроек графики settings.xml: Документы → Rockstar Games → GTA V (игра создаст его заново с настройками по умолчанию).', 'Запустите игру и в настройках графики выберите разрешение, равное разрешению Вашего монитора, и режим «Полноэкранный».'];
async function imgCanvas(data, name) {
  var url = URL.createObjectURL(new Blob([data], { type: /png$/i.test(name) ? 'image/png' : /webp$/i.test(name) ? 'image/webp' : 'image/jpeg' }));
  try {
    var im = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('image')); }; i.src = url; });
    var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h; var ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0, w, h);
    return { c: c, ctx: ctx, w: w, h: h };
  } finally { URL.revokeObjectURL(url); }
}
/* Полосы: от края идут строки (столбцы) почти чистого чёрного цвета, с обеих сторон, а середина — обычная картинка */
function blackBars(cv) {
  var d = cv.ctx.getImageData(0, 0, cv.w, cv.h).data, W = cv.w, H = cv.h;
  var dark = function (x0, y0, x1, y1) { var mx = 0, n = 0, sum = 0; for (var y = y0; y < y1; y += 2) for (var x = x0; x < x1; x += 2) { var o = (y * W + x) * 4, l = (d[o] * 3 + d[o + 1] * 6 + d[o + 2]) / 10; if (l > mx) mx = l; sum += l; n++; } return { mx: mx, avg: n ? sum / n : 0 }; };
  var run = function (len, test) { var i = 0; while (i < len && test(i)) i++; return i; };
  var top = run(H >> 1, function (y) { return dark(0, y, W, y + 1).mx < 14; }), bot = run(H >> 1, function (y) { return dark(0, H - 1 - y, W, H - y).mx < 14; });
  var left = run(W >> 1, function (x) { return dark(x, 0, x + 1, H).mx < 14; }), right = run(W >> 1, function (x) { return dark(W - 1 - x, 0, W - x, H).mx < 14; });
  var mid = dark(Math.round(W * .3), Math.round(H * .3), Math.round(W * .7), Math.round(H * .7));
  var tb = top >= H * .04 && bot >= H * .04 && Math.abs(top - bot) < H * .06, lr = left >= W * .04 && right >= W * .04 && Math.abs(left - right) < W * .06;
  return (tb || lr) && mid.avg > 25 ? { sides: tb && lr ? 'со всех сторон' : tb ? 'сверху и снизу' : 'слева и справа' } : null;
}
var IMG_SYS = 'Ты помогаешь поддержке Majestic RP (мультиплеер GTA V). На скриншоте от игрока — ошибка лаунчера или игры, либо проблема с картинкой. ' +
  'Ответь ТОЛЬКО JSON: {"text": "дословно весь текст ошибок и кодов с экрана (ERR_..., сообщения окон), по строкам; пусто, если текста нет", ' +
  '"visual": "одно из: error_window, black_bars, stretched, artifacts, black_screen, launcher, other, none", ' +
  '"problem": "что видно, одно короткое предложение по-русски", ' +
  '"steps": ["до 4 шагов решения для игрока: по-русски, на «Вы», повелительное наклонение, без воды и без пересказа ошибки"], "confident": true/false}. ' +
  'Не выдумывай: если не уверен, ставь confident=false и давай только безопасные общие шаги.';
async function quickImage(q) {
  var name = String(q.name || 'screenshot.png'), cv = await imgCanvas(q.data, name), bars = blackBars(cv), ro = replyOpts();
  var brief = function (steps) { return [ro.hello, '', 'Для решения проблемы попробуйте:'].concat(steps.map(function (x, i) { return (i + 1) + '. ' + x; })).concat(['', ro.bye]).join('\n'); };
  var res = { ok: true, kind: 'image', name: name, status: 'unk', headline: '', cause: '', why: '', steps: [], reply: '', lines: [], warnings: [], badge: { t: 'Скриншот', tone: 'unk' }, source: '' };
  if (bars) Object.assign(res, { status: 'warn', headline: 'Чёрные полосы ' + bars.sides, cause: 'Чёрные полосы по краям экрана', why: 'Игра выводит картинку не в разрешении монитора: сбились настройки графики (settings.xml).', steps: BARS_STEPS.slice(), reply: brief(BARS_STEPS), badge: { t: 'Чёрные полосы', tone: 'warn' }, source: 'на этом компьютере' });
  if (!srvOn()) { if (!bars) Object.assign(res, { headline: 'Скриншот не распознан', cause: 'Текст со скриншота читает ИИ — он доступен в приложении с входом на сервер команды.' }); return res; }
  /* скриншот для ИИ: JPEG до 1600 px */
  var b64 = cv.c.toDataURL('image/jpeg', .82).split(',')[1], ai = null;
  var a = await srv('/v1/ai', { body: { system: IMG_SYS, input: 'Разбери скриншот игрока.' + (bars ? ' На краях обнаружены чёрные полосы.' : ''), image: { mime: 'image/jpeg', data: b64 }, max: 1200 } });
  if (a && a.ok) { try { ai = JSON.parse(String(a.text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { ai = null; } }
  if (!ai) { if (!bars) Object.assign(res, { headline: 'Скриншот не распознан', cause: a && a.error === 'limit' ? 'Дневной лимит ИИ исчерпан.' : 'ИИ не ответил. Посмотрите скриншот сами или попросите у игрока логи.' }); return res; }
  var txt = String(ai.text || '').trim();
  res.lines = txt ? txt.split(/\n+/).slice(0, 8).map(function (t) { return { n: 0, t: t.slice(0, 220), sev: 'err' }; }) : [];
  if (bars || ai.visual === 'black_bars') {
    if (!bars) Object.assign(res, { status: 'warn', headline: 'Чёрные полосы по краям', cause: 'Чёрные полосы по краям экрана', why: 'Сбились настройки графики (settings.xml).', steps: BARS_STEPS.slice(), reply: brief(BARS_STEPS), badge: { t: 'Чёрные полосы', tone: 'warn' }, source: 'ИИ' });
    return res;
  }
  /* текст ошибки — через правила анализатора: шаги из руководства */
  if (txt) {
    var L1 = txt.split(/\n+/), cl = L1.map(function (l) { return '[00:00:00.000][error] ' + l; }).join('\n'), mn = L1.map(function (l) { return '[2026-01-01 00:00:00.000] [error]  [ (game)              ] ' + l; }).join('\n');
    var best = null;
    [LA.scan(LA.parse('[00:00:00.000] Logger initialized\n' + cl, 'client.log')), LA.scan(LA.parse(mn, 'main.log'))].forEach(function (sc) {
      var g = sc.findings.filter(function (x) { return SEV[x.sev] >= SEV.warn && !/^c-errcode$/.test(x.rule.id) || (x.rule.id === 'c-errcode' && x.rfix); })[0] || sc.findings.filter(function (x) { return SEV[x.sev] >= SEV.err; })[0];
      if (g && (!best || SEV[g.sev] > SEV[best.g.sev])) best = { g: g, sc: sc };
    });
    if (best && LA.briefSteps(best.sc, {}).length) {
      var steps = LA.briefSteps(best.sc, {});
      return Object.assign(res, { status: 'bad', headline: ai.problem || best.g.title, cause: best.g.title, why: best.g.cause || '', steps: (best.g.fix || []).slice(0, 4), reply: brief(steps), badge: { t: qShort(best.g.title), tone: 'bad' }, source: 'текст со скриншота + правила анализатора' });
    }
  }
  var as = (ai.steps || []).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 4);
  return Object.assign(res, { status: ai.visual === 'none' ? 'unk' : 'warn', headline: ai.problem || 'Скриншот', cause: ai.problem || 'Проблема со скриншота', why: ai.confident ? '' : 'ИИ не уверен — проверьте сами.', steps: as, reply: as.length ? brief(as) : '', badge: { t: qShort(ai.problem || 'Скриншот'), tone: 'warn' }, source: 'ИИ' + (ai.confident ? '' : ', не уверен') });
}

if (window.nativeApp && window.nativeApp.onExtQuick) window.nativeApp.onExtQuick(function (q) {
  quickAnalyze(q).then(function (r) { window.nativeApp.extQuickAnswer(q.id, r); }, function (e) { window.nativeApp.extQuickAnswer(q.id, { ok: false, error: String(e && e.message || e).slice(0, 200) }); });
});

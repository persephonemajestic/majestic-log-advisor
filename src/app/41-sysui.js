/* ---------- Карточка «Дамп краша и журнал Windows» ---------- */
var AI_SYS_SYSTEM = 'Ты инженер поддержки по краш-дампам GTA V / alt:V (клиент Majestic RP). Тебе дают КРАТКУЮ сводку: разбор минидампа (исключение, модуль и смещение, стек-эвристика scan, подозрительные модули) и/или журнал событий Windows. Определи причину и верни JSON.\n' +
  'Правила: 1) Смещение в majestic-client.dll или GTA5.exe без символов не расшифровать: не придумывай название функции. Если одно и то же смещение падает много раз или совпадает с дампом, это детерминированный баг клиента, игрок не виноват, шаги игрока только временные. ' +
  '2) Сбой в драйвере видеокарты, TDR (Display 4101, nvlddmkm), синие экраны 0x116, 0x117, 0x119, 0x141, Kernel-Power 41: сначала железо и драйвер. 3) Ошибки диска (Ntfs 55, stornvme 129, disk 7, 11, 51) ведут к битому кешу и ERR_SYS_FILELOAD. ' +
  '4) Оверлеи (discordhook, RTSS, nvspcap, GameOverlayRenderer) и подмена d3d11 или dxgi в папке игры часто ломают отрисовку. 5) Адрес обращения в области ядра 0xFFFF8… значит испорченный указатель или память, отобранную драйвером. 6) Не выдумывай данные, которых нет во входе. Шаги конкретные, для игрока, по-русски.\n' +
  'Схема ответа (только JSON): {"category":"ASSET_RENDER_CRASH|STREAMER_DESYNC|CEF_CRASH|POOL_OVERFLOW|NETWORK_GATEWAY|GPU_DRIVER|DATA_CORRUPTION|LAUNCHER_PATCHER|SCRIPT_RUNTIME|NO_ISSUE|UNKNOWN","fault_asset":"модуль+смещение или пусто","severity":"CRITICAL|HIGH|MEDIUM|LOW|NONE","summary":"1-2 предложения","technical_cause":"до 4 предложений","confidence":"HIGH|MEDIUM|LOW","confidence_note":"почему","solutions":["3-5 шагов"]}';
function sysHint(f) {
  var o = []; try { o.push(f.sc.verdict.headline.slice(0, 160)); var la = f.sc.stage && f.sc.stage.ctx.find(function (c) { return /Last loaded asset/.test(c.text); }); if (la) o.push(la.text.slice(0, 160)); } catch (e) {}
  try { var sg0 = (S.kb.settings.dumpSigs || {})[dumpSig(f.sys && f.sys.dump)]; if (sg0 && sg0.n > 1) o.push('такая же подпись сбоя уже была в ' + (sg0.n - 1) + ' других логах'); } catch (e) {}
  try { var km = sigMatch(f); if (km && km.m && km.m.state === 'exact') o.push('команда уже знает причину этого сбоя: ' + km.m.rec.cause.slice(0, 200)); } catch (e) {}
  try { var lk = sysLink(f); if (lk && !lk.ok) o.push('дамп может быть из другого запуска (время не совпало с MINIDUMP)'); } catch (e) {}
  return LA.mask(o.join(' | '));
}
function tsOf(ms, utc) { return ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + (utc ? ' UTC' : '') : ''; }
function sysBtns(f) {
  return '<div class="row-actions"><button class="btn sm" data-act="sysAdd">Добавить дамп или журнал</button></div>';
}
/* ---------- Подписи краша: «такой сбой уже был» и известные причины по версии ---------- */
function dumpSig(d) { return d && d.fault && d.fault.module ? (d.fault.module + '+' + d.fault.offset).toLowerCase() : ''; }
var OUTCOME = { fixed: 'исправлено разработчиками', helped: 'помогло действие игрока', nohelp: 'шаги не помогают, только разработчики', open: 'причина известна, исправления нет' };
/* Записи о подписях: общие (сервер) поверх своих (локально, если сервер недоступен) */
function sigRecords() { var loc = S.kb.settings.sigKnown || {}, sh = (S.shared && S.shared.sigs) || {}, out = {}; Object.keys(loc).forEach(function (k) { out[k] = loc[k]; }); Object.keys(sh).forEach(function (k) { if (!out[k] || sh[k].at >= out[k].at) out[k] = sh[k]; }); return Object.keys(out).map(function (k) { return out[k]; }); }
function sigMatch(f) { var d = f.sys && f.sys.dump, sg = d ? SysDiag.sigOf(d) : null; if (!sg) return null; return { sig: sg, m: SysDiag.matchSig(sg, sigRecords(), d.win || 0) }; }
function knownHtml(f, part) {
  var x = sigMatch(f); if (!x) return '';
  var sg = x.sig, m = x.m, r = m && m.rec, h = '';
  if (r && part !== 'form') {
    var head = m.state === 'exact' ? '<b class="conf high">известная причина</b>' : m.state === 'regressed' ? '<b class="conf medium">повтор после исправления</b>' : '<b class="conf medium">было в другой версии</b>';
    h += '<dt>Известная причина</dt><dd>' + head + ' ' + esc(r.cause) + '<div class="mut">' + esc(OUTCOME[r.outcome] || '') + (r.fixedIn ? ', исправлено в версии ' + esc(r.fixedIn) : '') + (r.ver ? '; запись для версии ' + esc(r.ver) : '') + (r.by ? '; ' + esc(r.by) + ', ' + esc(fmtDT(r.at).slice(0, 10)) : '') + '</div>';
    if (m.state === 'other') h += '<div class="mut">Подпись совпала, но дамп из версии ' + esc(sg.ver || 'неизвестной') + ', а запись сделана для ' + esc(r.ver) + '. Смещения между версиями сдвигаются, поэтому в текущей версии причина не подтверждена.</div>';
    if (m.state === 'regressed') h += '<div class="mut">Запись говорит, что исправлено в ' + esc(r.fixedIn) + ', а дамп из версии ' + esc(sg.ver) + '. Это новый случай или ошибка вернулась: передать дамп разработчикам.</div>';
    if (r.fix && r.fix.length && m.state === 'exact') h += '<ol style="margin:6px 0 0">' + r.fix.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    h += '</dd>';
  }
  if (f.sigForm && part === 'form') {
    var cur = r && m.state === 'exact' ? r : {};
    h += '<dt>Причина известна</dt><dd class="sigf"><div class="mut">Подпись <b class="mono">' + esc(sg.base) + '</b>, версия модуля ' + esc(sg.ver || 'не определена') + '. Запись увидит вся команда' + (srvOn() ? '' : ' (сервер недоступен: пока сохранится только у вас)') + '.</div>' +
      '<label class="nl">Причина<textarea id="sigCause" rows="3" placeholder="Например: падение при загрузке кастомной одежды из пака N, исправлено в клиенте 1.24">' + esc(cur.cause || '') + '</textarea></label>' +
      '<label class="nl inl">Исход<select class="sel" id="sigOut">' + Object.keys(OUTCOME).map(function (k) { return '<option value="' + k + '"' + ((cur.outcome || 'open') === k ? ' selected' : '') + '>' + OUTCOME[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="nl inl">Исправлено в версии<input id="sigFixed" placeholder="например 1.24.0.0" value="' + esc(cur.fixedIn || '') + '"></label>' +
      '<label class="nl">Что сказать игроку (по шагу в строке, необязательно)<textarea id="sigFix" rows="2">' + esc((cur.fix || []).join('\n')) + '</textarea></label>' +
      '<div class="row-actions"><button class="btn sm primary" data-act="sigSave">Сохранить для команды</button>' + (cur.cause ? '<button class="btn sm ghost" data-act="sigDel">Удалить запись</button>' : '') + '<button class="btn sm ghost" data-act="sigCancel">Отмена</button></div></dd>';
  }
  return h;
}
async function sigSave(f, del) {
  var x = sigMatch(f); if (!x) return; var sg = x.sig, key = sg.key, st = S.kb.settings, loc = st.sigKnown = st.sigKnown || {};
  var rec = del ? null : { sig: sg.base, ver: sg.ver, cause: ($('#sigCause').value || '').trim().slice(0, 1500), outcome: $('#sigOut').value, fixedIn: ($('#sigFixed').value || '').trim().slice(0, 40), fix: ($('#sigFix').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6), by: S.me || 'вы', at: Date.now() };
  if (rec && !rec.cause) { status('Опишите причину, чтобы сохранить запись.'); return; }
  if (rec) loc[key] = rec; else delete loc[key];
  if (S.shared && S.shared.sigs) { if (rec) S.shared.sigs[key] = rec; else delete S.shared.sigs[key]; }
  saveKB(); f.sigForm = false; renderView();
  if (srvOn()) { var r = await srv('/v1/shared/sig', { body: rec ? { sig: rec.sig, ver: rec.ver, cause: rec.cause, outcome: rec.outcome, fixedIn: rec.fixedIn, fix: rec.fix } : { sig: sg.base, ver: sg.ver, del: true } }); status(r && r.ok ? (rec ? 'Запись о сбое сохранена для всей команды.' : 'Запись удалена.') : 'Сохранено у вас, сервер недоступен.'); fetchShared(); }
  else status(rec ? 'Запись о сбое сохранена.' : 'Запись удалена.');
}
function scanDumpSigs() {
  var st = S.kb.settings, sg = st.dumpSigs = st.dumpSigs || {}, ch = false;
  S.files.forEach(function (f) {
    if (f.sample || !f.sys || !f.sys.dump) return; var k = dumpSig(f.sys.dump); if (!k) return;
    var e = sg[k] = sg[k] || { n: 0, hs: {}, first: Date.now(), last: 0, title: '', ok: 0, no: 0 }, vv = (SysDiag.sigOf(f.sys.dump) || {}).ver || '';
    e.vs = e.vs || {};
    if (!e.hs[f.hash]) { e.hs[f.hash] = Date.now(); e.n++; e.last = Date.now(); e.title = f.sys.dump.an.title; ch = true; var ks = Object.keys(e.hs); if (ks.length > 300) { delete e.hs[ks[0]]; delete e.vs[ks[0]]; } }
    if (vv && e.vs[f.hash] !== vv) { e.vs[f.hash] = vv; ch = true; }
  });
  if (ch) saveKB();
}
function sigHtml(f) {
  var d = f.sys && f.sys.dump, k = dumpSig(d); if (!k) return '';
  var e = (S.kb.settings.dumpSigs || {})[k], others = e ? Object.keys(e.hs).filter(function (h) { return h !== f.hash; }).length : 0;
  var txt = others ? 'Такой же сбой (<b>' + esc(k) + '</b>) уже был в ' + others + ' ' + (others % 10 === 1 && others % 100 !== 11 ? 'другом логе' : 'других логах') + ' вашей базы, последний раз ' + esc(fmtDT(e.last)) + '.' + (others >= 2 ? ' Повторяется у разных игроков: это ошибка клиента, шаги игрока только временные. Передайте разработчикам подпись и счётчик.' : '') : 'Такой подписи сбоя (<b>' + esc(k) + '</b>) в вашей базе ещё не было.';
  var myVer = (SysDiag.sigOf(d) || {}).ver, vs = (e && e.vs) || {}, same = myVer ? Object.keys(vs).filter(function (h) { return h !== f.hash && vs[h] === myVer; }).length : 0;
  if (others && myVer) txt += ' <span class="mut">В той же версии модуля (' + esc(myVer) + '): ' + same + ', в других версиях: ' + Object.keys(vs).filter(function (h) { return h !== f.hash && vs[h] && vs[h] !== myVer; }).length + '.</span>';
  return '<dt>Был ли раньше</dt><dd>' + txt + '<div class="row-actions" style="margin-top:6px"><button class="btn sm ghost" data-act="sigForm">' + (sigMatch(f) && sigMatch(f).m && sigMatch(f).m.state === 'exact' ? 'Изменить известную причину' : 'Причина известна') + '</button></div></dd>';
}
function prevDump(f) {
  var d = f.sys && f.sys.dump; if (!d || !d.timeMs) return null; var g = groupOf(f), tag = S.kb.tags[f.hash], best = null;
  S.files.forEach(function (x) {
    if (x === f || x.sample || !x.sys || !x.sys.dump || !x.sys.dump.timeMs || x.sys.dump.timeMs >= d.timeMs) return;
    var gx = groupOf(x), same = (g && gx && g.id === gx.id) || (tag && S.kb.tags[x.hash] === tag); if (!same) return;
    if (!best || x.sys.dump.timeMs > best.sys.dump.timeMs) best = x;
  });
  return best;
}
function diffHtml(f) {
  var pf = prevDump(f); if (!pf) return '';
  var L = SysDiag.compareDumps(pf.sys.dump, f.sys.dump);
  return '<dt>С прошлого дампа</dt><dd><div class="mut">Прошлый дамп этого игрока: ' + esc(pf.label) + ', ' + esc(tsOf(pf.sys.dump.timeMs, true)) + '</div><ul style="margin:4px 0 0;padding-left:18px">' + L.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></dd>';
}
function nearEvHtml(f) {
  var s = f.sys; if (!s || !s.ev || !s.dump || !s.dump.timeMs) return '';
  var dm = s.dump.timeMs, L = s.ev.raw.filter(function (e) { return e.nr && e.ms && Math.abs(e.ms - dm) <= 600000; }).sort(function (a, b) { return a.ms - b.ms; });
  if (!L.length) return '';
  var seen = {}, rows = []; L.forEach(function (e) { var k = e.provider + '|' + e.id; if (seen[k]) { seen[k].n++; return; } seen[k] = { e: e, n: 1 }; rows.push(seen[k]); });
  return '<dt>Рядом с падением</dt><dd><div class="mut">Предупреждения и ошибки Windows в пределах 10 минут от дампа, которым нет готового правила (' + L.length + '). Возможно, причина среди них.</div><ul style="margin:4px 0 0;padding-left:18px;display:grid;gap:3px">' + rows.slice(0, 15).map(function (r) { return '<li><span class="mono">' + esc(new Date(r.e.ms).toISOString().slice(11, 19)) + '</span> ' + esc(r.e.provider) + ' <b>' + r.e.id + '</b>' + (r.n > 1 ? ' ×' + r.n : '') + ' <span class="mut">' + esc(String(r.e.msg || '').slice(0, 140)) + '</span></li>'; }).join('') + '</ul></dd>';
}
function crossHtml(f) {
  var d = f.sys && f.sys.dump; if (!d || !f.sc) return '';
  var ov = (d.an.suspects || []).filter(function (x) { return x.cls === 'overlay'; }).map(function (x) { return x.name; }), lg = f.sc.findings.filter(function (g) { return g.rule && g.rule.id === 'c-overlay'; });
  if (!ov.length && !lg.length) return '';
  var both = ov.length && lg.length;
  return '<dt>Оверлеи</dt><dd>' + (both ? '<b class="conf high">подтверждено двумя источниками</b> ' : '') + (ov.length ? 'В дампе загружены: <b>' + ov.slice(0, 4).map(esc).join(', ') + '</b>. ' : '') + (lg.length ? 'В логе клиента: ' + esc(lg[0].title.replace(/^Сторонний хук в игре: /, '').slice(0, 120)) + '. ' : '') + 'Если падение на отрисовке, начните с отключения этих программ.</dd>';
}
/* ---------- Связь дампа с логом и общая хронология ---------- */
function logWall(f, e) {
  var m = /(\d{4})-(\d\d)-(\d\d)[_T ](\d\d)-(\d\d)-(\d\d)/.exec(f.name || ''), p = String(e.ts || '').split(/[:.]/), date = e.date || (m ? m[1] + '-' + m[2] + '-' + m[3] : '');
  if (!date || p.length < 3) return null;
  var w = Date.parse(date + 'T00:00:00Z') + ((+p[0]) * 3600 + (+p[1]) * 60 + (+p[2])) * 1000;
  if (!e.date && m) { var st = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); if (w < st - 60000) w += 86400000; }
  return w;
}
function sysLink(f) {
  var d = f && f.sys && f.sys.dump; if (!d || !d.timeMs || !f.sc || !f.sc.stage || !f.sc.stage.dump) return null;
  var w = logWall(f, f.sc.stage.dump); if (w == null) return null;
  var m = SysDiag.matchTime(d.timeMs, w); m.wall = w; return m;
}
function chrono(f) {
  var s = f.sys; if (!s) return null;
  var lk = sysLink(f), d = s.dump, brOff = function (ms) { return -new Date(ms).getTimezoneOffset() * 60000; };
  var off = lk && lk.ok ? -lk.tzMin * 60000 : brOff(d ? d.timeMs : Date.now()), items = [], center = 0;
  if (f.sc && f.sc.stage && f.parsed) {
    var st = f.sc.stage, es = f.parsed.entries, push = function (e, text, kind) { if (!e) return; var w = logWall(f, e); if (w != null) items.push({ w: w, src: 'log', text: text, kind: kind, line: e.i }); };
    push(st.inited, 'Клиент запущен', ''); push(st.started, 'Движок игры запустился', ''); push(st.connected, 'Подключился к серверу', 'ok');
    f.sc.findings.filter(function (g) { return (g.sev === 'crit' || g.sev === 'err') && g.rule.id !== 'c-dump' && g.rule.id !== 'c-conn'; }).slice(0, 5).forEach(function (g) { push(es[g.entries[0]], g.title, 'bad'); });
    push(st.dump, 'MINIDUMP: игра записала дамп краша', 'bad'); push(st.shut, 'Клиент закрылся', '');
    if (st.dump) center = logWall(f, st.dump) || 0;
  }
  if (d && d.timeMs) { items.push({ w: d.timeMs + off, src: 'dump', text: 'Создан дамп: ' + d.an.title + (d.fault ? ' [' + d.fault.text + ']' : ''), kind: 'bad' }); if (!center) center = d.timeMs + off; }
  if (!center && items.length) center = items[items.length - 1].w;
  if (s.ev && center) {
    var grp = {};
    s.ev.raw.forEach(function (e) {
      var b = SysDiag.eventBrief(e); if (!b || !e.ms) return; var w = e.utc ? e.ms + off : e.ms + brOff(e.ms);
      if (w < center - 40 * 60000 || w > center + 15 * 60000) return;
      var g = grp[b.title]; if (!g) { g = grp[b.title] = { w: w, src: 'win', text: b.title, kind: b.sev === 'warn' ? '' : 'bad', n: 0 }; items.push(g); } g.n++; g.last = Math.max(g.last || 0, w);
    });
    items.forEach(function (x) { if (x.src === 'win' && x.n > 1) x.text += ' ×' + x.n; });
  }
  if (items.length < 2) return null;
  items.sort(function (a, b) { return a.w - b.w; });
  return { items: items.slice(0, 40), link: lk, tzKnown: !!(lk && lk.ok), offMin: Math.round(off / 60000) };
}
function chronoHtml(f) {
  var c = chrono(f); if (!c) return '';
  var span = c.items[c.items.length - 1].w - c.items[0].w, SRC = { log: 'лог', dump: 'дамп', win: 'Windows' };
  var h = '<dt>Хронология</dt><dd><ul class="chron" style="margin:0;padding:0;list-style:none;display:grid;gap:3px">';
  c.items.forEach(function (x) {
    var iso = new Date(x.w).toISOString(), t = (span > 18 * 3600000 ? iso.slice(5, 10).split('-').reverse().join('.') + ' ' : '') + iso.slice(11, 19);
    h += '<li class="' + (x.kind === 'bad' ? 'bad' : '') + '"><span class="mono">' + t + '</span> <span class="chip" style="font-size:11px">' + SRC[x.src] + '</span> ' + (x.line != null ? '<button class="chip" data-act="jump" data-line="' + x.line + '">L' + (x.line + 1) + '</button> ' : '') + esc(x.text) + '</li>';
  });
  h += '</ul><div class="mut">Время по часам игрока' + (c.tzKnown ? ' (часовой пояс игрока UTC' + (c.offMin >= 0 ? '+' : '') + (c.offMin / 60) + ' определён по метке MINIDUMP)' : ', пояс считается как у вас: у дампа нет привязки к логу') + '.</div></dd>';
  return h;
}
function linkHtml(f) {
  var lk = sysLink(f); if (!lk) return '';
  var hr = function (m) { var a = Math.abs(m); return a >= 120 ? (a / 60).toFixed(1).replace(/\.0$/, '') + ' ч' : a + ' мин'; };
  if (lk.ok) return '<dt>Связь с логом</dt><dd><b class="conf high">дамп из этого запуска</b> <span class="mut">время дампа совпало с меткой MINIDUMP в логе (расхождение ' + Math.abs(lk.resSec) + ' с)</span></dd>';
  return '<dt>Связь с логом</dt><dd><b class="conf low">дамп может быть из другого запуска</b> <span class="mut">время создания дампа не сходится с меткой MINIDUMP в этом логе (разница ' + hr(lk.diffMin) + ' и не кратна часовому поясу). Диагноз по дампу относится к другому падению: запросите дамп с тем же временем или лог за дату дампа.</span></dd>';
}
function sysHtml(f) {
  var s = f.sys, h = '<div class="ai-h">Дамп краша и журнал Windows</div>';
  if (!s || (!s.dump && !s.ev)) return h + '<p class="hint" style="margin:0 0 8px">Добавьте минидамп (crashdump.dmp из краш-отчёта, .dmp) или журнал событий Windows (.evtx или events.txt). Приложение покажет, где и почему упала игра, какой модуль виноват и совпадает ли это с событиями системы. Файлы читаются частями, большие не грузятся целиком. Архив краш-отчёта (.zip) разбирается сразу вместе с client.log.</p>' + sysBtns(f);
  var d = s.dump, ev = s.ev;
  h += '<div class="diag"><dl>';
  if (d) {
    var a = d.an;
    h += '<dt>Дамп</dt><dd><b>' + esc(a.title) + '</b>' + (a.known ? ' <b class="conf high">известная, исправлена</b>' : '') + ' <span class="mut">' + esc(d.name) + (d.timeMs ? ' · ' + tsOf(d.timeMs, true) : '') + ' · модулей ' + d.nMods + '</span></dd>';
    if (a.facts.length) h += '<dt>Что известно</dt><dd><ul style="margin:0;padding-left:18px">' + a.facts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></dd>';
    h += '<dt>Причина</dt><dd>' + esc(a.cause) + '</dd>';
    if (a.frames.length > 1) h += '<dt>Стек</dt><dd class="mono" style="word-break:break-word">' + esc(a.frames.slice(0, 10).map(function (x) { return x.text; }).join(' ← ')) + '<div class="mut">Кадры после первого определены сканированием стека, это ориентир, а не точный путь.</div></dd>';
    if (a.suspects.length) h += '<dt>Подозрительные модули</dt><dd>' + a.suspects.map(function (x) { return '<b>' + esc(x.name) + '</b> <span class="mut">' + esc(x.label) + '</span>'; }).join('; ') + '</dd>';
    if (a.fix.length) h += '<dt>Что делать</dt><dd><ol>' + a.fix.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></dd>';
    h += knownHtml(f, 'rec') + linkHtml(f) + sigHtml(f) + knownHtml(f, 'form') + crossHtml(f) + diffHtml(f);
  }
  h += chronoHtml(f) + nearEvHtml(f);
  if (ev) {
    var fl = ev.an.findings, sevN = { crit: 'критично', err: 'ошибка', warn: 'предупреждение', info: 'сведения' };
    h += '<dt>Журнал Windows</dt><dd>Прочитано событий: <b>' + ev.total + '</b>, значимых за последние ' + (ev.an.days || 14) + ' суток: <b>' + ev.an.relevant + '</b>' + (ev.an.older ? ' (ещё ' + ev.an.older + ' более старых не показаны)' : '') + (fl.length ? '' : '. Серьёзных сбоев игры, драйвера и диска в журнале нет.') + ' <span class="mut">' + esc(ev.name) + '</span>';
    function li(g) { return '<li><b>×' + g.count + '</b> ' + esc(g.title) + (g.same ? ' <b class="conf high">то же место, что в дампе</b>' : '') + (g.near && !g.same ? ' <b class="conf medium">рядом со временем дампа</b>' : '') + ' <span class="mut">' + sevN[g.sev] + (g.last ? ' · последний ' + tsOf(g.last, g.utc) : '') + '</span>' + (g.cause ? '<div class="mut">' + esc(g.cause) + '</div>' : '') + '</li>'; }
    if (fl.length) h += '<ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px">' + fl.slice(0, 7).map(li).join('') + '</ul>' + (fl.length > 7 ? '<details><summary class="hint">Ещё ' + (fl.length - 7) + '</summary><ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px">' + fl.slice(7).map(li).join('') + '</ul></details>' : '');
    var rep = fl.filter(function (g) { return g.id === 'app-crash' && g.count >= 3 && g.mod; })[0];
    if (rep) h += '<div class="mut" style="margin-top:6px">Повторяющийся краш ×' + rep.count + ' в одном месте (' + esc(rep.mod) + '+0x' + esc(rep.off.replace(/^0x/i, '').replace(/^0+(?=.)/, '')) + (rep.modVer ? ', версия ' + esc(rep.modVer) : '') + ') указывает на ошибку клиента, а не на железо игрока.</div>';
    h += '</dd>';
  }
  h += '</dl>';
  if (f.sysBusy) h += '<div class="ai" id="sysTxt">ИИ разбирает дамп и журнал…</div>';
  else if (f.sysErr) h += '<div class="ai err">' + esc(f.sysErr) + '</div>';
  else if (s.diag) h += '<div class="ai-h" style="margin-top:10px">Диагноз ИИ по дампу и журналу</div>' + diagBody(s.diag, 'sysAiCopy', 'sysAiRun');
  h += '<div class="row-actions">' + (SAMPLE && !s.diag && !f.sysBusy ? '<button class="btn sm primary" data-act="sysAiRun" id="sysAiBtn">Разобрать с ИИ</button>' : '') + '<button class="btn sm" data-act="sysCopy">Копировать сводку</button><button class="btn sm ghost" data-act="sysAdd">Добавить ещё</button><button class="btn sm ghost" data-act="sysClear">Убрать данные</button></div>';
  if (SAMPLE && !s.diag) h += '<p class="hint" style="margin:6px 0 0">Кнопка ИИ отправляет только короткую сводку (до 3500 символов, без логов и файлов), поэтому почти не тратит лимит.</p>';
  return h + '</div>';
}
function sysCard(f) { return '<section class="card" id="sysBox">' + sysHtml(f) + '</section>'; }
function drawSys(f) { var b = f === S.sysOnly ? document.querySelector('#sysOnlyBox #sysBox') : $('#sysBox'); if (b && (f === S.sysOnly || f === active())) b.innerHTML = sysHtml(f); }
function sysText(f) {
  var s = f.sys, o = ['Сводка по дампу и журналу Windows (' + f.label + ')']; if (!s) return '';
  if (s.dump) { o.push('', 'ДАМП: ' + s.dump.an.title, s.dump.an.facts.join('\n'), 'Причина: ' + s.dump.an.cause, 'Стек: ' + s.dump.an.frames.slice(0, 10).map(function (x) { return x.text; }).join(' <- ')); if (s.dump.an.suspects.length) o.push('Подозрительные модули: ' + s.dump.an.suspects.map(function (x) { return x.name; }).join(', ')); }
  if (s.ev) { o.push('', 'ЖУРНАЛ WINDOWS: событий ' + s.ev.total + ', значимых ' + s.ev.an.relevant); s.ev.an.findings.slice(0, 12).forEach(function (g) { o.push('- ×' + g.count + ' ' + g.title + (g.same ? ' [то же место, что в дампе]' : '') + (g.last ? ' (последний ' + tsOf(g.last, g.utc) + ')' : '')); }); }
  var lk = sysLink(f); if (lk) o.push('', lk.ok ? 'Дамп из этого запуска (время совпало с MINIDUMP в логе).' : 'ВНИМАНИЕ: время дампа не сходится с MINIDUMP в этом логе, дамп может быть из другого запуска.');
  if (s.diag) o.push('', 'ДИАГНОЗ ИИ', diagText(f, s.diag));
  return o.join('\n');
}
async function runSysDiag(f, force) {
  var s = f.sys; if (!SAMPLE || !s || f.sysBusy || (!s.dump && !s.ev)) return;
  var inp = LA.mask(SysDiag.aiInput(s, sysHint(f))).replace(/\\Users\\[^\\\s]+/gi, '\\Users\\<user>'), key = fnv(inp);
  if (!force && s.diag && s.diagKey === key) { drawSys(f); return; }
  f.sysBusy = true; f.sysErr = ''; drawSys(f);
  try {
    var turns = [{ role: 'user', content: AI_SYS_SYSTEM }, { role: 'user', content: inp }], opt = { modelTier: 'default', max: 1400, cache: force ? { gcTime: 3600000, refresh: true } : { gcTime: 3600000 } };
    var raw = SAMPLE.json ? await SAMPLE.json(turns, opt) : (await SAMPLE(turns, opt)).text;
    s.diag = aiParse(raw); s.diagKey = key; LS.setSys(f);
  } catch (e) {
    s.diag = null;
    f.sysErr = e && e.code === 'not_granted' ? 'Доступ к Claude не разрешён для этой страницы.' : e && e.code === 'ai_fail' ? e.message : e && e.code === 'rate_limited' ? (e.message && /лимит/.test(e.message) ? e.message : 'Слишком много запросов, подождите немного и повторите.') : e && e.code === 'invalid_json' ? 'ИИ ответил не по схеме. Нажмите «Разобрать заново».' : 'Не удалось получить разбор от ИИ. Попробуйте ещё раз.';
  }
  f.sysBusy = false; drawSys(f);
}
async function runAI(prompt, box, btn, done) {
  if (!SAMPLE) return;
  btn.disabled = true; var old = btn.textContent; btn.textContent = 'Claude думает…';
  box.innerHTML = '<div class="ai-h">Разбор Claude</div><div class="ai" id="aiTxt">…</div>';
  try {
    /* ИИ через сервер команды (в приложении) — объект с .json, ИИ страницы Claude — функция */
    var r = typeof SAMPLE === 'function' ? await SAMPLE(prompt, { cache: false, onText: function (x) { var el = box.querySelector('#aiTxt'); if (el) el.textContent = x.text; } })
      : { text: String(await SAMPLE.json([{ role: 'system', content: 'Ты опытный инженер поддержки Majestic RP. Отвечай по-русски, кратко и по шагам, без выдуманных фактов.' }, { role: 'user', content: typeof prompt === 'string' ? prompt : JSON.stringify(prompt) }], { max: 1500 })) };
    var el = box.querySelector('#aiTxt'); if (el) el.textContent = r.text;
    if (done) done(r.text);
  } catch (e) {
    var msg = e && e.code === 'not_granted' ? 'Доступ к Claude не разрешён для этой страницы.' : e && e.code === 'rate_limited' ? 'Слишком много запросов, подождите немного и повторите.' : 'Не удалось получить ответ' + (e && e.message ? ': ' + e.message : '') + '.';
    box.innerHTML = '<div class="ai err">' + esc(msg) + '</div>';
  }
  btn.disabled = false; btn.textContent = old;
}
if (srvOn()) srv('/v1/ai/ping', {}).then(function (r) {
  if (!r || !r.ok || SAMPLE) return;
  SAMPLE = { json: async function (turns, opt) {
    var a = await srv('/v1/ai', { body: { system: turns[0].content, input: turns[1].content, max: opt && opt.max, fresh: !!(opt && opt.cache && opt.cache.refresh), pv: AI_PROMPT_VERSION } });
    SAMPLE.cached = !!(a && a.cached);
    if (a && a.ok && a.text) return a.text;
    throw { code: a && a.error === 'limit' ? 'rate_limited' : 'ai_fail', message: a && a.error === 'limit' ? 'Дневной лимит разборов ИИ исчерпан, попробуйте завтра.' : 'ИИ сейчас недоступен' + (a && a.detail ? ' (' + a.detail + ')' : a ? '' : ' (сервер не ответил)') + ', попробуйте позже.' };
  } }; render();
}).catch(function () {});
if (window.claude && window.claude.use) window.claude.use('sample').then(function (s) { if (s) { SAMPLE = s; render(); } }).catch(function () {});


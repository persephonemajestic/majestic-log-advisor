/* ---------- Запуски клиента, цепочка перед падением, сверка main.log и client.log ---------- */
function secOf(ts) { var p = String(ts || '').split(/[:.]/); return p.length < 3 ? null : (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]); }
function runsOf(f) {
  if (!f || !f.sc || f.sc.kind !== 'client') return [];
  /* кэш на разбор и версию базы знаний: на больших логах расчёт занимает десятки мс, а вкладка перерисовывается часто */
  if (f._runs && f._runsK === f.sc && f._runsV === S.kbv) return f._runs;
  var out = runsCalc(f); f._runs = out; f._runsK = f.sc; f._runsV = S.kbv; return out;
}
function runsCalc(f) {
  var es = f.parsed.entries, runs = [], cur = null;
  function open(e) { cur = { start: e, from: e.i, to: e.i, last: e, inited: false, started: null, connected: false, dump: null, shut: false, codes: {} }; runs.push(cur); }
  for (var i = 0; i < es.length; i++) {
    var e = es[i], t = e.text;
    if (/Logger initialized/.test(t) || !cur) open(e);
    cur.to = e.j; cur.last = e;
    if (/Majestic Multiplayer inited/.test(t)) cur.inited = true;
    else if (/Game Started in (\d+) ms/.test(t)) cur.started = +/Game Started in (\d+) ms/.exec(t)[1];
    else if (/Connected with id/.test(t)) cur.connected = true;
    else if (/MINIDUMP: Temporary dump saved/.test(t) && !cur.dump) cur.dump = e;
    else if (/^Shutting down/.test(t)) cur.shut = true;
    var m = /\bERR_[A-Z0-9_]{3,40}\b/.exec(t); if (m && m[0] !== 'ERR_SYS_FILELOAD') cur.codes[m[0]] = (cur.codes[m[0]] || 0) + 1;
  }
  runs.forEach(function (r) {
    var a = secOf(r.start.ts), b = secOf(r.last.ts); r.dur = a != null && b != null ? ((b - a) + 86400) % 86400 : null;
    r.status = r.dump ? 'bad' : r.connected ? 'ok' : r.started != null ? 'warn' : 'unk';
    r.label = r.dump ? 'Краш игры (MINIDUMP)' : r.connected ? 'Дошёл до сервера' + (r.shut ? ', закрыт штатно' : '') : r.started != null ? 'Игра запустилась, до сервера не дошёл' : r.inited ? 'Клиент запущен, игра не стартовала' : 'Короткий фрагмент';
  });
  return runs;
}
function fmtDur(s) { return s == null ? '' : s < 90 ? s + ' с' : s < 7200 ? Math.round(s / 60) + ' мин' : (s / 3600).toFixed(1) + ' ч'; }
function runsCard(f) {
  var runs = runsOf(f); if (runs.length < 2) return '';
  var bad = runs.filter(function (r) { return r.status === 'bad'; }).length, ok = runs.filter(function (r) { return r.status === 'ok'; }).length;
  var h = '<section class="card"><h3 class="sec" style="margin:0">Запуски клиента в логе <span class="n">' + runs.length + '</span></h3><p class="hint" style="margin:6px 0 8px">Один файл содержит несколько запусков: упало ' + bad + ', дошло до сервера ' + ok + '. Диагноз выше относится ко всему файлу, ниже каждый запуск отдельно.</p><div class="list">';
  runs.slice(-12).forEach(function (r, i) {
    var codes = Object.keys(r.codes).slice(0, 3).join(', ');
    h += '<div class="tlr k-' + (r.status === 'bad' ? 'bad' : r.status === 'ok' ? 'ok' : 'info') + '"><span class="tt">' + esc(r.start.ts.slice(0, 8)) + '</span><span class="tf">' + (r.dur != null ? esc(fmtDur(r.dur)) : '') + '</span><i class="td"></i><span>' + esc(r.label) + (r.started != null ? ', движок ' + Math.round(r.started / 1000) + ' с' : '') + (codes ? ' · ' + esc(codes) : '') + '</span><button class="chip" data-act="jump" data-line="' + r.from + '">L' + (r.from + 1) + '</button>' + (r.dump ? '<button class="chip" data-act="jump" data-line="' + r.dump.i + '">MINIDUMP</button>' : '') + '</div>';
  });
  return h + '</div></section>';
}
/* Что происходило перед MINIDUMP: последние значимые строки, одинаковые свёрнуты */
function chainOf(f, max) {
  var st = f.sc.stage, d = st && st.dump; if (!d) return [];
  var es = f.parsed.entries, rows = [];
  for (var i = es.length - 1; i >= 0 && rows.length < 60; i--) {
    var e = es[i]; if (e.i >= d.i) continue; if (e.i < d.i - 600) break;
    if (e.sev < SEV.unk && !(e.rid >= 0 && e.sev > SEV.noise)) continue;
    if (/ERR_SYS_FILELOAD|Missing rpf|Callstack/.test(e.text)) continue;
    rows.push(e);
  }
  rows.reverse(); var out = [];
  rows.forEach(function (e) {
    var key = e.text.replace(/0x[0-9a-f]+|\d+/gi, '#').slice(0, 90);
    var hit = out.find(function (x) { return x.key === key; });
    if (hit) { hit.n++; hit.last = e; } else out.push({ key: key, e: e, n: 1, last: e });
  });
  return out.slice(-(max || 12));
}
function chainCard(f) {
  var ch = chainOf(f, 12); if (!ch.length) return '';
  var h = '<section class="card"><h3 class="sec" style="margin:0">Что было перед падением <span class="n">' + ch.length + '</span></h3><p class="hint" style="margin:6px 0 8px">Последние значимые строки до MINIDUMP, без шума и повторов (одинаковые свёрнуты в ×N).</p><div class="list">';
  ch.forEach(function (x) { h += '<div class="tlr k-' + (x.e.sev >= SEV.err ? 'bad' : 'info') + '"><span class="tt">' + esc(x.e.ts.slice(0, 8)) + '</span><span class="tf">' + esc(String(x.e.lvl || '').slice(0, 5)) + '</span><i class="td"></i><span>' + esc(M(x.e.text).slice(0, 220)) + (x.n > 1 ? ' <b>×' + x.n + '</b>' : '') + '</span><button class="chip" data-act="jump" data-line="' + x.e.i + '">L' + (x.e.i + 1) + '</button></div>'; });
  return h + '</div></section>';
}
/* Сверка лаунчера (main.log) и клиента (client.log) одного дела по времени */
function crossMainClient(items) {
  var out = [], mains = items.filter(function (it) { return it.sc.kind === 'main' && it.sc.attempts; }), clients = items.filter(function (it) { return it.sc.kind === 'client'; });
  if (!mains.length || !clients.length) return out;
  var atts = []; mains.forEach(function (m) { m.sc.attempts.forEach(function (a) { if (!a.date) return; var s = secOf(a.ts); if (s == null) return; atts.push({ t: Date.parse(a.date + 'T00:00:00Z') + s * 1000, out: a.out, ts: a.ts, date: a.date, label: m.label }); }); });
  clients.forEach(function (c) {
    runsOf(c).forEach(function (r) {
      var w = logWall(c, r.start); if (w == null) return;
      var a = atts.filter(function (x) { return w >= x.t - 30000 && w <= x.t + 15 * 60000; }).sort(function (p, q) { return Math.abs(w - p.t) - Math.abs(w - q.t); })[0]; if (!a) return;
      var dt = new Date(w).toISOString().slice(11, 19);
      if ((a.out === 'ok' || a.out === 'patched') && r.status === 'bad') out.push('Лаунчер считал запуск в ' + a.ts.slice(0, 8) + ' успешным (' + (a.out === 'ok' ? 'игра запущена' : 'патчер отработал') + '), но клиент в ' + dt + ' упал с дампом' + (r.dur != null ? ' через ' + fmtDur(r.dur) : '') + '. Причина в клиенте, не в лаунчере.');
      else if ((a.out === 'fail' || a.out === 'crash') && r.status === 'ok') out.push('Лаунчер записал отказ в ' + a.ts.slice(0, 8) + ', но клиент в ' + dt + ' всё же дошёл до сервера: ошибка лаунчера могла быть ложной или игрок запустил игру повторно.');
      else if ((a.out === 'fail') && r.status === 'unk') out.push('Лаунчер записал отказ в ' + a.ts.slice(0, 8) + ', в client.log клиент (' + dt + ') стартовал, но до игры не дошёл.');
    });
  });
  return out.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 6);
}
function crossCard(items) {
  var L = crossMainClient(items); if (!L.length) return '';
  return '<section class="card"><h3 class="sec" style="margin:0 0 8px">Лаунчер и клиент <span class="n">' + L.length + '</span></h3>' + L.map(function (x) { return '<p style="margin:0 0 6px">' + esc(x) + '</p>'; }).join('') + '</section>';
}

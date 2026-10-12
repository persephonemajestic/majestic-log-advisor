/* Предобработка логов перед разбором и отправкой в ИИ.
   Работает и в браузере (глобальная LogCleaner), и в Node (require). Без зависимостей.

   LogCleaner.clean(text, opts) -> {
     text,        // очищенный лог
     death,       // последние N записей перед MINIDUMP / Shutting down / падением процесса (массив строк)
     trigger,     // { kind, line, index }: что принято за точку смерти
     stats        // { inBytes, outBytes, inLines, outLines, removed: { правило: строк }, squashed: { семейство: число свёрнутых } }
   }

   Запись лога = строка, которая начинается с метки времени, плюс строки-продолжения без метки
   (многострочные ошибки, стеки). Так «Callstack» и его кадры уходят вместе с ERR_SYS_FILELOAD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.LogCleaner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var START = /^\[(?:\d{4}-\d{2}-\d{2} )?\d{2}:\d{2}:\d{2}/;
  var TS = /^\[((?:\d{4}-\d{2}-\d{2} )?\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]/;

  /* Строки, которые удаляются целиком (ключ = имя правила в статистике). */
  var DROP = [
    { id: 'mounting', re: /Mount(?:ing|ed) resource/ },
    { id: 'download-skip', re: /download: cache-hit skip/ }
  ];
  /* ERR_SYS_FILELOAD и идущие следом «Callstack:» и кадры «-- 0x…» (фоновый шум, на игру не влияет). */
  var FILELOAD = /ERR_SYS_FILELOAD, Missing rpf|Missing rpf:/; // строка сервиса сбоев лаунчера с internalError: 'ERR_SYS_FILELOAD' означает реальный краш и сохраняется
  var STACKHEAD = /^\[[^\]]*\]\s*Callstack:\s*$/;
  var STACKFRAME = /^\[[^\]]*\]\s*--\s+0x[0-9a-fA-F]+\s*$/;

  /* Семейства спама: во всём логе сворачиваются в одну строку со счётчиком и интервалом времени. */
  var FAMILIES = [
    { id: 'Cannot destroy NetworkObject', re: /Cannot destroy NetworkObject/ },
    { id: 'Peer limiter blocked the packet', re: /Peer limiter blocked the packet/ },
    { id: 'Packet failed to send', re: /Packet failed to send/ },
    { id: 'tick was too long', re: /Resource \S+ tick was too long \d+ ms/ },
    { id: 'Promise resolved after being resolved', re: /Promise resolved after being resolved/ },
    { id: 'Setting siren sound', re: /Setting siren sound/ },
    { id: 'Removing cef impl from store', re: /Removing cef impl from store/ },
    { id: 'Item in pool can\'t be allocated', re: /Item in pool .* can't be allocated/ }
  ];

  var DEATH = [
    { kind: 'MINIDUMP', re: /MINIDUMP: Temporary dump saved/, first: true },
    { kind: 'abort', re: /\[Critical\] abort\(\) called/, first: true },
    { kind: 'Shutting down', re: /Shutting down/ },
    { kind: 'process-exit', re: /game (?:process )?exit|ERR_GAME_CRASHED|patcher: .*(?:crash|exited)/i }
  ];

  function entriesOf(text) {
    var lines = text.split(/\r?\n/), out = [], cur = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (START.test(l) || !cur) { cur = { lines: [l] }; out.push(cur); } else cur.lines.push(l);
    }
    return { entries: out, lines: lines.length };
  }
  function normalize(first) { return first.replace(TS, '').replace(/0x[0-9a-fA-F]+/g, '0xN').replace(/\d+(?:\.\d+)?/g, 'N'); }
  function tsOf(first) { var m = TS.exec(first); return m ? m[1] : ''; }
  function inc(o, k, n) { o[k] = (o[k] || 0) + (n || 1); }

  function clean(text, opts) {
    opts = opts || {}; var deathN = opts.deathLines || 40;
    var src = String(text || ''), E = entriesOf(src), removed = {}, squashed = {}, kept = [];
    var afterFileload = false;
    /* 1. Удаление шума. */
    E.entries.forEach(function (en) {
      var first = en.lines[0], n = en.lines.length, drop = null;
      if (FILELOAD.test(first)) { drop = 'ERR_SYS_FILELOAD'; afterFileload = true; }
      else if (afterFileload && n === 1 && (STACKHEAD.test(first) || STACKFRAME.test(first))) drop = 'Callstack после FILELOAD';
      else { afterFileload = false; for (var i = 0; i < DROP.length; i++) if (DROP[i].re.test(first)) { drop = DROP[i].id; break; } }
      if (drop) { inc(removed, drop, n); return; }
      kept.push(en);
    });
    /* 2. Подряд идущие одинаковые записи -> одна запись со счётчиком. */
    var run = [], prev = null, cnt = 0, firstEn = null, lastTs = '';
    function flush() {
      if (!firstEn) return;
      if (cnt > 1) {
        var fam = null; for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].re.test(firstEn.lines[0])) { fam = FAMILIES[i]; break; }
        var head = firstEn.lines[0], body = firstEn.lines.slice(1);
        var note = fam ? '[' + fam.id + ' ×' + cnt + ']' : '[повторяется ×' + cnt + (lastTs && lastTs !== tsOf(head) ? ', до ' + lastTs : '') + ']';
        run.push({ lines: [head + '  ' + note].concat(body), fam: fam ? fam.id : '', n: cnt, ts: tsOf(head), last: lastTs });
        if (!fam) inc(squashed, 'прочие подряд', cnt - 1);
      } else run.push(firstEn);
    }
    kept.forEach(function (en) {
      var key = normalize(en.lines[0]) + '|' + (en.lines.length > 1 ? en.lines.slice(1).join('\n').length : 0);
      if (key === prev) { cnt++; lastTs = tsOf(en.lines[0]) || lastTs; return; }
      flush(); prev = key; cnt = 1; firstEn = en; lastTs = tsOf(en.lines[0]);
    });
    flush();
    /* 3. Точка смерти и блок предсмертного состояния (до глобальной свёртки, чтобы хронология сохранилась). */
    var trig = { kind: '', line: '', index: -1 };
    for (var d = 0; d < DEATH.length && trig.index < 0; d++) {
      if (DEATH[d].first) { for (var i = 0; i < run.length; i++) if (DEATH[d].re.test(run[i].lines[0])) { trig = { kind: DEATH[d].kind, line: run[i].lines[0], index: i }; break; } }
      else { for (var j = run.length - 1; j >= 0; j--) if (DEATH[d].re.test(run[j].lines[0])) { trig = { kind: DEATH[d].kind, line: run[j].lines[0], index: j }; break; } }
    }
    var endIdx = trig.index >= 0 ? trig.index : run.length;
    var death = [];
    run.slice(Math.max(0, endIdx - deathN), endIdx).forEach(function (en) { en.lines.forEach(function (l) { death.push(l); }); });
    if (trig.index >= 0) death.push(trig.line);
    /* 4. Глобальная свёртка семейств спама: одна строка на семейство, с числом и интервалом. */
    var fams = {}, outEntries = [];
    run.forEach(function (en) {
      var first = en.lines[0], fam = en.fam, n = en.n || 1;
      if (!fam) for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].re.test(first)) { fam = FAMILIES[i].id; break; }
      if (!fam) { outEntries.push(en); return; }
      var f = fams[fam];
      if (!f) { f = fams[fam] = { n: 0, first: tsOf(first), last: '', entry: { lines: [''] }, id: fam }; outEntries.push(f.entry); f.sample = first.replace(TS, '').replace(/\s*\[[^\]]*×\d+[^\]]*\]\s*$/, '').trim(); }
      f.n += n; f.last = en.last || tsOf(first) || f.last;
    });
    Object.keys(fams).forEach(function (k) {
      var f = fams[k]; if (f.n > 1) inc(squashed, k, f.n - 1);
      f.entry.lines = ['[' + (f.first || '--') + (f.last && f.last !== f.first ? ' … ' + f.last : '') + '] [' + f.id + ' ×' + f.n + ']' + (f.sample.indexOf(f.id) >= 0 && f.sample.length < f.id.length + 25 ? '' : '  ' + f.sample.slice(0, 140))];
    });
    var outText = outEntries.map(function (en) { return en.lines.join('\n'); }).join('\n');
    var outLines = outText ? outText.split('\n').length : 0;
    return {
      text: outText, death: death, trigger: trig,
      stats: { inBytes: src.length, outBytes: outText.length, inLines: E.lines, outLines: outLines, removed: removed, squashed: squashed }
    };
  }

  /* Короткая сводка для карточки лога: что убрано. */
  function summary(stats) {
    var parts = [], k;
    for (k in stats.removed) parts.push(k + ' ×' + stats.removed[k]);
    return parts.join(', ');
  }

  return { clean: clean, summary: summary, entriesOf: entriesOf };
});

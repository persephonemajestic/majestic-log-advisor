/* ---------- Сохранение загруженных логов между запусками (v.28) ---------- */
var LSMAX = 1024 * 1048576, LSKEEP = 200;
var LS = {
  db: null,
  open: function () {
    if (LS.db) return LS.db;
    LS.db = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('mla-logs', 1);
      r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('meta', { keyPath: 'hash' }); d.createObjectStore('text', { keyPath: 'hash' }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return LS.db;
  },
  tx: async function (stores, mode, fn) {
    var d = await LS.open();
    return new Promise(function (res, rej) { var t = d.transaction(stores, mode), out = fn(t); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; });
  },
  index: async function () { try { var d = await LS.open(); return await new Promise(function (res, rej) { var q = d.transaction('meta', 'readonly').objectStore('meta').getAll(); q.onsuccess = function () { res(q.result || []); }; q.onerror = function () { rej(q.error); }; }); } catch (e) { return []; } },
  readAll: async function () { try { var d = await LS.open(); return await new Promise(function (res) { var out = {}, q = d.transaction('text', 'readonly').objectStore('text').openCursor(); q.onsuccess = function () { var c = q.result; if (c) { out[c.value.hash] = c.value.text; c.continue(); } else res(out); }; q.onerror = function () { res(out); }; }); } catch (e) { return {}; } },
  read: async function (h) { try { var d = await LS.open(); return await new Promise(function (res) { var q = d.transaction('text', 'readonly').objectStore('text').get(h); q.onsuccess = function () { res(q.result ? q.result.text : null); }; q.onerror = function () { res(null); }; }); } catch (e) { return null; } },
  save: async function (f) {
    try {
      if (S.kb.settings.keepLogs === false || f.sample) return;
      var meta = { hash: f.hash, name: f.name, size: f.size, mtime: f.mtime || 0, group: f.group || null, added: f.added || Date.now(), sys: f.sys || null };
      await LS.tx(['meta', 'text'], 'readwrite', function (t) { t.objectStore('meta').put(meta); t.objectStore('text').put({ hash: f.hash, text: f.text }); });
      var all = await LS.index(), total = all.reduce(function (a, m) { return a + (m.size || 0); }, 0);
      if (total > LSMAX || all.length > LSKEEP) { all.sort(function (a, b) { return a.added - b.added; }); for (var i = 0; i < all.length - 1 && (total > LSMAX || all.length - i > LSKEEP); i++) { total -= all[i].size || 0; await LS.del(all[i].hash); } }
    } catch (e) {}
  },
  setSys: async function (f) { try { var d = await LS.open(); var m = await new Promise(function (res) { var q = d.transaction('meta', 'readonly').objectStore('meta').get(f.hash); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); if (!m) return; m.sys = f.sys ? JSON.parse(JSON.stringify(f.sys)) : null; await LS.tx(['meta'], 'readwrite', function (t) { t.objectStore('meta').put(m); }); } catch (e) {} },
  setGroup: async function (f) { try { var d = await LS.open(); var m = await new Promise(function (res) { var q = d.transaction('meta', 'readonly').objectStore('meta').get(f.hash); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); if (!m) return; m.group = f.group || null; await LS.tx(['meta'], 'readwrite', function (t) { t.objectStore('meta').put(m); }); } catch (e) {} },
  del: async function (h) { try { await LS.tx(['meta', 'text'], 'readwrite', function (t) { t.objectStore('meta').delete(h); t.objectStore('text').delete(h); }); } catch (e) {} },
  clear: async function () { try { await LS.tx(['meta', 'text'], 'readwrite', function (t) { t.objectStore('meta').clear(); t.objectStore('text').clear(); }); } catch (e) {} }
};
async function restoreLogs() {
  var list = await LS.index(); if (!list.length) return false;
  list.sort(function (a, b) { return a.added - b.added; }); list = list.slice(-LSKEEP);
  /* Быстрый запуск: все тексты читаются одним проходом по базе, разбор идёт порциями с самых новых логов.
     Тяжёлые общие шаги (база знаний ко всем логам, перерисовка) выполняются раз на порцию, а не на каждый лог. */
  var CH = 12, n = 0, first = true, texts = {}, total = list.length;
  var item = function (m) { var t = texts[m.hash]; return t == null ? null : { hash: m.hash, name: m.name, size: m.size, text: t, mtime: m.mtime, group: m.group, added: m.added, sys: m.sys || null }; };
  /* первая порция (самые свежие) читается поштучно, чтобы экран появился сразу; остальные тексты — одним проходом */
  var head = list.slice(-CH); for (var h = 0; h < head.length; h++) { var tx = await LS.read(head[h].hash); if (tx != null) texts[head[h].hash] = tx; }
  for (var i = list.length; i > 0; i -= CH) {
    if (i < list.length && i === list.length - CH) { var rest = await LS.readAll(); for (var k in rest) if (!texts[k]) texts[k] = rest[k]; rest = null; }
    var part = list.slice(Math.max(0, i - CH), i).map(item).filter(Boolean);
    part.forEach(function (x) { delete texts[x.hash]; });
    n += await addTexts(part, { restore: true, batch: true });
    applyAll();
    if (first) { first = false; S.files.sort(function (a, b) { return a.added - b.added; }); S.active = S.files.length ? S.files[S.files.length - 1].id : null; render(); }
    else renderList();
    status('Восстанавливаю сохранённые логи: ' + n + ' из ' + total + '…'); setProgress(n / total); await tick();
  }
  S.files.sort(function (a, b) { return a.added - b.added; }); setProgress(1); saveKB();
  var pins = S.kb.settings.pinHashes || {}; S.files.forEach(function (f) { if (pins[f.hash]) S.pins[f.id] = 1; });
  S.active = S.files.length ? S.files[S.files.length - 1].id : null; S.sel = -1; render(); remindWaits();
  S.files.filter(function (f) { return S.kb.tags[f.hash]; }).slice(-10).forEach(function (f) { ticketLookup(f, false); });
  status('Восстановлено сохранённых логов: ' + n + '. Убрать лог из списка можно крестиком, отключить сохранение можно в «Настройках».');
  return n > 0;
}
function togglePin(id) {
  var f = S.files.find(function (x) { return x.id === id; }), ph = S.kb.settings.pinHashes = S.kb.settings.pinHashes || {};
  if (S.pins[id]) { delete S.pins[id]; if (f) delete ph[f.hash]; } else { S.pins[id] = 1; if (f) ph[f.hash] = 1; }
  saveKB(); renderList();
}


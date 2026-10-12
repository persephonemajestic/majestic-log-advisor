/* ---------- Обезличенные логи для улучшения правил ----------
   После загрузки лог очищается от шума (LogCleaner, как в аудите), маскируется (почта, IP, имя пользователя Windows, токены, пароли),
   сжимается gzip и один раз отправляется на сервер команды. Сервер хранит его 7 дней и раз в сутки выгружает в закрытый репозиторий,
   где его прогоняют по правилам. Выключается в «Настройках». */
function shareOn() { return S.kb.settings.shareLogs !== false; }
async function gzB64(text) {
  if (typeof CompressionStream === 'undefined') return '';
  var cs = new CompressionStream('gzip'), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(text)); w.close();
  var buf = new Uint8Array(await new Response(cs.readable).arrayBuffer()), s = '', CH = 0x8000;
  for (var i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  return btoa(s);
}
function shareText(f) {
  var t = f.text;
  try { if (window.LogCleaner) { var c = LogCleaner.clean(t); if (c && c.text) t = c.text; } } catch (e) {}
  return LA.mask(t);
}
async function shareLogs(files) {
  if (!srvOn() || !shareOn()) return;
  var st = S.kb.settings, sent = st.sharedHashes = st.sharedHashes || {}, ch = false;
  for (var i = 0; i < files.length && i < 20; i++) {
    var f = files[i]; if (!f || f.sample || sent[f.hash] || !f.sc || (f.sc.kind !== 'client' && f.sc.kind !== 'main')) continue;
    try {
      var txt = shareText(f), gz = await gzB64(txt); if (!gz || gz.length > 3000000) continue;
      var r = await srv('/v1/samples/put', { body: { h: f.hash, k: f.sc.kind, gz: gz, len: txt.length, v: APP_VERSION } });
      if (r && r.ok) { sent[f.hash] = Date.now(); ch = true; }
    } catch (e) {}
  }
  if (ch) { var ks = Object.keys(sent); if (ks.length > 3000) ks.sort(function (a, b) { return sent[a] - sent[b]; }).slice(0, ks.length - 3000).forEach(function (k) { delete sent[k]; }); saveKB(); }
}

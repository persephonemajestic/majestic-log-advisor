/* ---------- Вкладка «Ассеты»: какие файлы чаще стоят перед дампом ---------- */
var ASSET_KIND = { ydr: 'модель объекта', yft: 'транспорт, оружие', ydd: 'одежда, аксессуары', ytd: 'текстура', ycd: 'анимация', ymap: 'карта', ybn: 'коллизия', ynv: 'навмеш', ytyp: 'описание объектов', ytf: 'прочее' };
function scanAssets() {
  var st = S.kb.settings, as = st.assetStats = st.assetStats || {}, ch = false;
  S.files.forEach(function (f) {
    if (f.sample || !f.sc) return; var g = f.sc.findings.find(function (x) { return x.rule && x.rule.id === 'c-lastasset'; }); if (!g) return;
    g.dets.forEach(function (n, text) {
      String(text).split(/\s+/).filter(function (w) { return /^[\w.\-@]+\.(ydr|yft|ydd|ytd|ycd|ymap|ybn|ynv|ytyp|ytf)$/i.test(w); }).slice(0, 6).forEach(function (w) {
        var e = as[w] = as[w] || { n: 0, hs: {} }; if (!e.hs[f.hash]) { e.hs[f.hash] = 1; e.n++; ch = true; var ks = Object.keys(e.hs); if (ks.length > 100) delete e.hs[ks[0]]; }
      });
    });
  });
  if (ch) { var ks2 = Object.keys(as); if (ks2.length > 1500) ks2.sort(function (a, b) { return as[a].n - as[b].n; }).slice(0, ks2.length - 1200).forEach(function (k) { delete as[k]; }); saveKB(); }
}
function renderAssets() {
  scanAssets();
  var as = S.kb.settings.assetStats || {}, names = Object.keys(as), ext = {}, total = 0;
  names.forEach(function (k) { var x = (/\.(\w+)$/.exec(k) || [])[1].toLowerCase(); ext[x] = ext[x] || { logs: 0, uniq: 0 }; ext[x].logs += as[k].n; ext[x].uniq++; total += as[k].n; });
  var h = '<div class="card"><h3 class="sec" style="margin:0">Ассеты перед падением <span class="n">' + names.length + '</span></h3><p class="hint" style="margin:6px 0 0;max-width:80ch">Здесь копятся файлы из строк «Last loaded asset» ваших логов с дампом: какие ассеты чаще стоят прямо перед падением. Один и тот же файл в нескольких логах разных игроков указывает на сбойный ресурс сервера, а не на компьютер игрока. Данные накапливаются от сессии к сессии.</p></div>';
  if (!names.length) return $('#view').innerHTML = h + '<div class="card empty">Пока нет логов с «Last loaded asset». Добавьте client.log, в котором есть MINIDUMP.</div>';
  var ek = Object.keys(ext).sort(function (a, b) { return ext[b].logs - ext[a].logs; });
  h += '<div class="card"><div class="stats">' + ek.map(function (k) { return '<div><b>' + ext[k].logs + '</b><span>.' + esc(k) + (ASSET_KIND[k] ? ' · ' + ASSET_KIND[k] : '') + ', файлов ' + ext[k].uniq + '</span></div>'; }).join('') + '</div></div>';
  var top = names.sort(function (a, b) { return as[b].n - as[a].n || (a < b ? -1 : 1); }).slice(0, 40);
  h += '<div class="card"><h3 class="sec" style="margin:0 0 8px">Чаще всего <span class="n">' + top.length + '</span></h3><div class="list">' + top.map(function (k) { return '<div class="uk"><div class="uk-h"><b>' + esc(M(k)) + '</b><span class="cnt">в ' + as[k].n + ' ' + (as[k].n % 10 === 1 && as[k].n % 100 !== 11 ? 'логе' : 'логах') + '</span></div>' + (as[k].n >= 3 ? '<p class="hint" style="margin:4px 0 0">Повторяется в нескольких логах: вероятный сбойный ресурс сервера, стоит передать разработчикам.</p>' : '') + '</div>'; }).join('') + '</div><div class="row-actions"><button class="btn sm" data-act="assetsCopy">Копировать список</button><button class="btn sm ghost" data-act="assetsReset">Сбросить</button></div></div>';
  $('#view').innerHTML = h;
}
function assetsText() { var as = S.kb.settings.assetStats || {}; return 'Ассеты перед падением (логов с файлом):\n' + Object.keys(as).sort(function (a, b) { return as[b].n - as[a].n; }).slice(0, 40).map(function (k) { return as[k].n + '\t' + k; }).join('\n'); }

/* ---------- Удобство: мини-карта лога, шапка диагноза, горячие клавиши, самодиагностика, защита от ошибок ---------- */
/* Тонкая полоса прогресса сверху при разборе нескольких файлов */
var progT = 0;
function setProgress(p) {
  var el = document.getElementById('prog'); if (!el) { el = document.createElement('div'); el.id = 'prog'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  clearTimeout(progT); el.style.opacity = '1'; el.style.width = Math.round(p * 100) + '%';
  if (p >= 1) progT = setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.style.width = '0'; }, 250); }, 400);
}
/* Мини-карта: полоска справа от лога, где цветом видно, в каком месте файла ошибки. Клик и перетаскивание прокручивают лог. */
var MM = { f: null, buckets: null, H: 0, drag: false };
function mmColors() {
  var cs = getComputedStyle(document.documentElement), g = function (n, d) { return (cs.getPropertyValue(n) || d).trim() || d; };
  return { 7: g('--crit', '#C4203F'), 6: g('--err', '#D9480F'), 5: g('--warn', '#B7791F'), 4: g('--unk', '#6B7A99'), 1: g('--ok', '#2F855A'), mk: g('--accent', '#2457D6'), vp: g('--ink', '#222') };
}
function mmBuild(f) {
  var cv = $('#mm'); if (!cv || !f || !f.view) return;
  var H = cv.clientHeight || 300, n = f.view.length, ls = f.parsed.lineSev, b = new Uint8Array(H), mk = new Uint8Array(H), i, y;
  for (i = 0; i < n; i++) { y = Math.min(H - 1, Math.floor(i * H / Math.max(1, n))); var s = ls[f.view[i]]; if (s >= SEV.unk && s > b[y]) b[y] = s; else if (s === SEV.ok && !b[y]) b[y] = SEV.ok; }
  f.marks.forEach(function (ln) { var p = f.view.indexOf(ln); if (p >= 0) mk[Math.min(H - 1, Math.floor(p * H / Math.max(1, n)))] = 1; });
  MM.f = f; MM.buckets = b; MM.marks = mk; MM.H = H;
}
function drawMinimap() {
  var f = active(), cv = $('#mm'), sc = $('#sc'); if (!f || !cv || !sc || !f.view) return;
  var H = cv.clientHeight || 300;
  if (MM.f !== f || MM.H !== H || !MM.buckets || MM.n !== f.view.length || MM.nm !== f.marks.length) { mmBuild(f); MM.n = f.view.length; MM.nm = f.marks.length; }
  var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 14;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  var x = cv.getContext('2d'), C = mmColors(), b = MM.buckets, y;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  for (y = 0; y < H; y++) if (b[y]) { x.fillStyle = C[b[y]] || C[4]; x.globalAlpha = b[y] === SEV.ok ? .35 : 1; x.fillRect(0, y, W, 1.4); }
  x.globalAlpha = 1; x.fillStyle = C.mk; for (y = 0; y < H; y++) if (MM.marks[y]) x.fillRect(W - 4, y, 4, 2);
  var tot = totalH(f) || 1, top = sc.scrollTop / tot * H, hh = Math.max(6, sc.clientHeight / tot * H);
  x.globalAlpha = .16; x.fillStyle = C.vp; x.fillRect(0, top, W, hh); x.globalAlpha = .7; x.strokeStyle = C.vp; x.lineWidth = 1; x.strokeRect(.5, top + .5, W - 1, Math.max(1, hh - 1)); x.globalAlpha = 1;
}
function mmSeek(ev) {
  var f = active(), cv = $('#mm'), sc = $('#sc'); if (!f || !cv || !sc || !f.view || !f.view.length) return;
  var r = cv.getBoundingClientRect(), p = Math.max(0, Math.min(1, (ev.clientY - r.top) / Math.max(1, r.height)));
  sc.scrollTop = Math.max(0, p * totalH(f) - sc.clientHeight / 2);
}
document.addEventListener('mousedown', function (ev) { if (ev.target && ev.target.id === 'mm') { MM.drag = true; mmSeek(ev); ev.preventDefault(); } });
document.addEventListener('mousemove', function (ev) { if (MM.drag) mmSeek(ev); });
document.addEventListener('mouseup', function () { MM.drag = false; });

/* Липкая шапка в просмотре лога: вывод диагноза всегда на виду */
function logHeadHtml(f) {
  var v = f.sc.verdict || {}, fnd = f.sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; })[0];
  return '<div class="lvh st-' + (v.status || 'unk') + '"><span class="st st-' + (v.status || 'unk') + '">' + (STRU[v.status] || 'Неясно') + '</span><span class="lvh-t">' + esc(M(v.headline || (fnd && fnd.title) || f.label)) + '</span><button class="btn sm ghost" data-act="tab" data-tab="diag">К диагнозу</button></div>';
}

/* Горячие клавиши для разбора очереди: J и K листают дела, R копирует ответ, E закрывает дело. */
document.addEventListener('keydown', function (ev) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || S.bind) return;
  var tg = ev.target && ev.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (ev.target && ev.target.isContentEditable)) return;
  if ($('#panelHost') && $('#panelHost').firstChild) return;
  var taken = Object.keys(keyMap()).map(function (k) { return keyMap()[k]; });
  if (taken.indexOf(ev.code) >= 0) return;
  if (ev.code === 'KeyJ') { ev.preventDefault(); stepFile(1); }
  else if (ev.code === 'KeyK') { ev.preventDefault(); stepFile(-1); }
  else if (ev.code === 'KeyR' && S.active) { var f = active(); if (f && !String(window.getSelection && window.getSelection())) { ev.preventDefault(); copyText(replyText(f, ''), 'Ответ игроку', 'Отправьте ответ игроку.', 'Ответ скопирован.'); } }
  else if (ev.code === 'KeyE' && S.active) { ev.preventDefault(); openSolve(); }
}, true);

/* Самодиагностика: что хранит приложение и как с ним связь */
async function selfCheck() {
  var out = [], kbKb = 0; try { kbKb = Math.round(JSON.stringify(S.kb).length / 1024); } catch (e) {}
  out.push(['Версия интерфейса', APP_VERSION + (S.shellVer ? ', оболочка ' + S.shellVer : '')]);
  out.push(['Открыто логов', String(S.files.length)]);
  out.push(['База знаний', kbKb + ' КБ']);
  try { var all = await LS.index(); out.push(['Сохранённые логи', all.length + ' шт., ' + fmtSize(all.reduce(function (a, m) { return a + (m.size || 0); }, 0))]); } catch (e) { out.push(['Сохранённые логи', 'недоступно']); }
  try { if (navigator.storage && navigator.storage.estimate) { var es = await navigator.storage.estimate(); out.push(['Хранилище', fmtSize(es.usage || 0) + ' из ' + fmtSize(es.quota || 0)]); } } catch (e) {}
  out.push(['Сеть', navigator.onLine ? 'есть' : 'нет']);
  if (window.nativeApp && window.nativeApp.gatedFetch) { var t0 = Date.now(); try { var r = await window.nativeApp.gatedFetch('/v1/ping', {}); out.push(['Связь с сервером', (r && r.status && r.status < 500 ? 'работает' : 'не отвечает') + ', ' + (Date.now() - t0) + ' мс']); } catch (e) { out.push(['Связь с сервером', 'нет ответа']); } }
  out.push(['Ошибки интерфейса', ERRLOG.length ? ERRLOG.join(' | ') : 'нет']);
  return out;
}
async function openSelfCheck() {
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Проверка приложения"><b>Проверка приложения</b><p class="hint" style="margin:0">Проверяю…</p></div></div>';
  var rows = await selfCheck();
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Проверка приложения"><b>Проверка приложения</b><table class="tbl"><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
    '<div class="row-actions"><button class="btn sm" data-act="selfCopy">Копировать</button><button class="btn sm" data-act="selfClear" title="Удаляет сохранённые копии логов. База знаний и заметки остаются.">Очистить сохранённые логи</button><button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
  S.selfRows = rows;
}
document.addEventListener('click', function (ev) {
  var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null; if (!t) return;
  var a = t.getAttribute('data-act');
  if (a === 'selfCheck') openSelfCheck();
  else if (a === 'selfCopy') copyText((S.selfRows || []).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'), 'Проверка приложения', '', 'Скопировано.');
  else if (a === 'selfClear') { try { LS.clear(); status('Сохранённые копии логов удалены. Открытые логи остались в окне.'); } catch (e) {} openSelfCheck(); }
});

/* Черновики: заметки сохраняются по мере ввода, а не только при уходе из поля */
var draftT = 0;
document.addEventListener('input', function (ev) {
  var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-act'); if (!a || (a !== 'rnote' && a !== 'cnote')) return;
  clearTimeout(draftT); draftT = setTimeout(function () {
    var v = t.value.trim();
    if (a === 'rnote') { var k = t.getAttribute('data-key'); if (v) S.kb.ruleNotes[k] = t.value; else delete S.kb.ruleNotes[k]; }
    else { var cn = S.kb.settings.caseNotes = S.kb.settings.caseNotes || {}, g = t.getAttribute('data-gid'); if (v) cn[g] = t.value; else delete cn[g]; }
    saveKB();
  }, 700);
});
window.addEventListener('beforeunload', function () { clearTimeout(draftT); });

/* Защита от падений: ошибка в одной кнопке не должна оставлять окно «мёртвым» без объяснения */
var lastErrToast = 0;
function errToast() {
  if (Date.now() - lastErrToast < 15000) return; lastErrToast = Date.now();
  toast('Что-то пошло не так в этом действии. Остальное работает. Подробности можно отправить через «Сообщить о проблеме».');
}
window.addEventListener('error', errToast);
window.addEventListener('unhandledrejection', errToast);
if (window.nativeApp && window.nativeApp.appOk) { try { setTimeout(function () { window.nativeApp.appOk(APP_VERSION); }, 2500); } catch (e) {} }

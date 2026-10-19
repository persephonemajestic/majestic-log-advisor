/* ---------- Телефон: два экрана (список логов и разбор), верхняя панель и вкладки внизу, как в приложениях iPhone ----------
   Включается на узком экране (до 760 px) — на сайте для телефона и в узком окне. Разметка компьютерной версии не меняется:
   поверх неё добавляются панели, а лишнее прячется стилями html.mob. */
var MQ = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false, addEventListener: function () {} };
var MS = { scr: 'list', built: false, want: false, wantN: -1 };
var MI = {
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 8.5h8M8 12h8M8 15.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  diag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12.5h4l2.5-6.5 4 13 2.5-7.5 1.2 1H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14M5 9.5h10M5 13.5h14M5 17.5h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  hist: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18" cy="12" r="1.7" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
var MTABS = [['list', 'Логи'], ['diag', 'Диагноз'], ['log', 'Лог'], ['hist', 'История'], ['more', 'Ещё']];
var MSTAT = { bad: 'Сбой', warn: 'Есть замечания', ok: 'Успешно', unk: 'Без итога' };
/* на компьютере узкое окно остаётся компьютерным (там свои стрелки вкладок); телефонная раскладка — на сайте и на сенсорных экранах */
var COARSE = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
function isMob() { return !!MQ.matches && (WEB || !!COARSE.matches); }
function mobBuild() {
  if (MS.built) return; MS.built = true;
  var top = document.createElement('header'); top.id = 'mTop'; top.className = 'mtop';
  top.innerHTML = '<button class="mt-b mt-back" type="button" data-m="back" aria-label="К списку логов">' + MI.back + '<span>Логи</span></button>' +
    '<div class="mt-t"><b id="mTitle">Логи</b><span id="mSub"></span></div>' +
    '<button class="mt-b mt-add" type="button" data-m="add" aria-label="Добавить логи">' + MI.add + '</button>';
  document.body.insertBefore(top, document.body.firstChild);
  var tb = document.createElement('nav'); tb.id = 'mTab'; tb.className = 'mtab'; tb.setAttribute('aria-label', 'Разделы');
  tb.innerHTML = MTABS.map(function (x) { return '<button type="button" data-m="tab" data-t="' + x[0] + '">' + MI[x[0]] + '<span>' + x[1] + '</span><i class="mn" hidden></i></button>'; }).join('');
  document.body.appendChild(tb);
  var sh = document.createElement('div'); sh.id = 'mSheet'; sh.className = 'msheet'; sh.setAttribute('aria-hidden', 'true');
  document.body.appendChild(sh);
  document.addEventListener('click', mobClick, true);
  window.addEventListener('popstate', function () { if (!isMob()) return; if (mSheetOpen()) { mSheet(false); return; } if (MS.scr !== 'list') mobScr('list', true); });
}
function mobApply() {
  var on = isMob(); document.documentElement.classList.toggle('mob', on);
  if (!on) return; mobBuild(); document.documentElement.setAttribute('data-ms', MS.scr); mobSync();
  /* iPhone в Safari: одна подсказка, как поставить на экран «Домой» (иначе Safari может со временем стереть код устройства) */
  if (WEB && IOS && !navigator.standalone && !lsGet('mla.a2hs') && !document.getElementById('mHint')) { var sd = document.querySelector('.side'), sq = document.querySelector('.side-q'); if (sd && sq) { var hn = document.createElement('div'); hn.id = 'mHint'; hn.className = 'mhint'; hn.innerHTML = '<div><b>Установите как приложение</b>Нажмите «Поделиться» <span class="ios-share" aria-hidden="true"></span> внизу Safari → «На экран „Домой“».</div><button type="button" data-m="a2hs" aria-label="Скрыть подсказку">×</button>'; sq.insertAdjacentElement('afterend', hn); } }
  var d = document.getElementById('drop'); if (d && !d.getAttribute('data-m')) { d.setAttribute('data-m', '1'); d.innerHTML = '<b>' + MI.add + 'Выбрать файлы</b>main.log, client.log, zip, дамп или журнал Windows'; }
}
function mobScr(scr, fromPop) {
  var was = MS.scr; MS.scr = scr; document.documentElement.setAttribute('data-ms', scr);
  if (!fromPop) { try { if (scr !== 'list' && was === 'list') history.pushState({ m: 'view' }, ''); else if (scr === 'list' && history.state && history.state.m === 'view') { history.back(); } } catch (e) {} }
  mobSync(); window.scrollTo(0, 0);
}
function mobClick(e) {
  if (!isMob()) return;
  var t = e.target.closest && e.target.closest('[data-m]');
  /* открыли лог из списка — после отрисовки показываем экран разбора */
  if (!t) { var o = e.target.closest && e.target.closest('.side [data-act]'); if (o && /^(open|gcase|openDiag|copen)$/.test(o.getAttribute('data-act')) && !e.target.closest('[data-act="rm"],[data-act="ej"],.pinb')) MS.want = true; var oo = e.target.closest && e.target.closest('#view [data-act="openDiag"], #view [data-act="copen"], #view [data-act="sjump"]'); if (oo) setTimeout(function () { window.scrollTo(0, 0); }, 0); return; }
  var k = t.getAttribute('data-m');
  if (k === 'back') { e.preventDefault(); mobScr('list'); }
  else if (k === 'add') { e.preventDefault(); $('#fileIn').click(); }
  else if (k === 'tab') {
    e.preventDefault(); var tab = t.getAttribute('data-t');
    if (tab === 'more') return mSheet(true);
    if (tab === 'list') return mobScr('list');
    if ((tab === 'diag' || tab === 'log') && !active()) { status('Сначала добавьте лог кнопкой «+» или выберите его в списке.'); return mobScr('list'); }
    S.tab = tab; S.sel = -1; render(); mobScr('view');
  }
  else if (k === 'a2hs') { e.preventDefault(); lsSet('mla.a2hs', '1'); var mh = document.getElementById('mHint'); if (mh) mh.remove(); }
  else if (k === 'sheet') { e.preventDefault(); mSheet(false); }
  else if (k === 'go') { e.preventDefault(); var g = t.getAttribute('data-g'); mSheet(false); setTimeout(function () { mobGo(g); }, 60); }
}
function mobGo(g) {
  if (g.indexOf('tab:') === 0) { S.tab = g.slice(4); S.sel = -1; render(); mobScr('view'); return; }
  if (g === 'theme') { $('#btnTheme').click(); return; }
  if (g === 'copycode') { webCopy(webDev()); status('Код устройства скопирован. В другом браузере или в приложении на экране «Домой»: «У меня уже есть код доступа» → вставить.'); return; }
  var b = document.getElementById(g); if (b) b.click();
}
function mSheetOpen() { var s = document.getElementById('mSheet'); return !!(s && s.classList.contains('open')); }
function mSheet(on) {
  var s = document.getElementById('mSheet'); if (!s) return;
  if (!on) { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); return; }
  var main = { diag: 1, log: 1, hist: 1 }, tabs = Array.prototype.slice.call(document.querySelectorAll('#tabs .tab')).filter(function (x) { return !main[x.getAttribute('data-tab')]; });
  var row = function (g, label, sub) { return '<button class="ms-r" type="button" data-m="go" data-g="' + g + '"><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + MI.chev + '</button>'; };
  var vis = function (id) { var b = document.getElementById(id); return b && !b.hidden; };
  var theme = ($('#btnTheme') && $('#btnTheme').textContent || '').replace(/^Тема:\s*/, '');
  var h = '<div class="ms-bg" data-m="sheet"></div><div class="ms-box" role="dialog" aria-label="Ещё"><div class="ms-grab" aria-hidden="true"></div>' +
    '<div class="ms-h"><b>Ещё</b><button class="ms-x" type="button" data-m="sheet">Готово</button></div>' +
    (tabs.length ? '<div class="ms-g"><div class="ms-gt">Разделы</div>' + tabs.map(function (x) { var n = x.querySelector('.n'); return row('tab:' + x.getAttribute('data-tab'), x.firstChild.textContent, n ? n.textContent : ''); }).join('') + '</div>' : '') +
    '<div class="ms-g"><div class="ms-gt">Действия</div>' + row('btnDump', 'Только дамп или журнал Windows') + row('btnSet', 'Настройки') + row('theme', 'Тема оформления', theme) + '</div>' +
    (WEB ? '<div class="ms-g"><div class="ms-gt">Доступ</div>' + row('copycode', 'Скопировать код устройства', webDev() + ' — для входа в другом браузере') + '</div>' : '') +
    '<div class="ms-g"><div class="ms-gt">Справка</div>' + row('btnHelp', 'Инструкция') + row('btnNew', 'Что нового') + (vis('btnBug') ? row('btnBug', 'Сообщить о проблеме') : '') + '</div>' +
    '<div class="ms-ver">' + ($('#ver') ? $('#ver').innerHTML : '') + '</div></div>';
  s.innerHTML = h; s.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(function () { s.classList.add('open'); });
  try { if (!(history.state && history.state.m === 'sheet')) history.pushState({ m: 'sheet', prev: history.state && history.state.m }, ''); } catch (e) {}
}
function mobSync() {
  if (!MS.built || !isMob()) return;
  var f = active(), view = MS.scr !== 'list', tl = $('#mTitle'), sb = $('#mSub'), top = $('#mTop');
  var tabName = { diag: 'Диагноз', log: 'Лог', hist: 'История', cmp: 'Сравнение', rep: 'Отчёты', all: 'Все логи', stats: 'Сводка', case: 'Дело', mass: 'Массовые проблемы' }[S.tab] || '';
  var fileTab = S.tab === 'diag' || S.tab === 'log' || S.tab === 'case';
  if (!view) { tl.textContent = 'Логи'; sb.textContent = ''; sb.className = ''; }
  else if (fileTab && f) { tl.textContent = f.label; var st = f.sc && f.sc.verdict ? f.sc.verdict.status : 'unk'; sb.textContent = (MSTAT[st] || '') + (S.tab !== 'diag' ? ' · ' + tabName : ''); sb.className = 'st-' + st; }
  else { tl.textContent = tabName || 'Логи'; sb.textContent = ''; sb.className = ''; }
  top.classList.toggle('in', view);
  document.documentElement.setAttribute('data-tab', view ? S.tab : 'list');
  var cur = view ? (S.tab === 'diag' || S.tab === 'log' || S.tab === 'hist' ? S.tab : 'more') : 'list';
  document.querySelectorAll('#mTab [data-t]').forEach(function (b) { var t = b.getAttribute('data-t'); if (t === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  var n = S.files.filter(function (x) { return !x.sample; }).length, mn = document.querySelector('#mTab [data-t="list"] .mn');
  if (mn) { mn.hidden = !n; mn.textContent = n > 99 ? '99+' : String(n); }
}
/* перерисовка: если пользователь только что выбрал или добавил лог — показать разбор */
function realN() { return S.files.filter(function (x) { return !x.sample; }).length; }
render = (function (orig) { return function () {
  orig.apply(this, arguments); if (!isMob()) return;
  var go = (MS.want && active()) || (MS.wantN >= 0 && realN() > MS.wantN && active());
  if (go) { MS.want = false; MS.wantN = -1; var fixTab = S.tab !== 'diag' && S.tab !== 'log' && S.tab !== 'case'; if (fixTab) S.tab = 'diag'; if (MS.scr === 'list') mobScr('view'); if (fixTab) orig.apply(this, arguments); }
  mobSync();
}; })(render);
readFiles = (function (orig) { return function () { if (isMob()) MS.wantN = realN(); return orig.apply(this, arguments); }; })(readFiles);
if (MQ.addEventListener) MQ.addEventListener('change', mobApply); else if (MQ.addListener) MQ.addListener(mobApply);
mobApply();

/* ---------- Телефон: окно лога ----------
   Строки лога на весь экран между панелями. Вверху только поиск и «Фильтры» (режим, срез, уровень, вид — в выпадающей панели),
   внизу крупные ▲ ▼ — переход между проблемами без прокрутки страницы. Объяснение строки выезжает листом снизу. */
function mobProblems(f) { var min = S.lvl && S.lvl >= SEV.warn ? S.lvl : SEV.warn; return f.parsed.entries.filter(function (e) { return e.sev >= min; }); }
function mobLogCount() {
  var f = active(), el = document.getElementById('mlCnt'); if (!f || !el) return;
  var ps = mobProblems(f), i = -1; for (var k = 0; k < ps.length; k++) if (S.sel >= ps[k].i && S.sel <= ps[k].j) { i = k; break; }
  el.textContent = !ps.length ? 'Проблем нет' : i >= 0 ? 'Проблема ' + (i + 1) + ' из ' + ps.length : 'Проблем: ' + ps.length;
}
function mobLog() {
  var lv = document.querySelector('.logview'); if (!lv || lv.querySelector('.mlbar')) return;
  var lts = lv.querySelectorAll(':scope > .lt'), lt1 = lts[0], lt2 = lts[1];
  var fl = document.createElement('div'); fl.className = 'mlfilt'; fl.id = 'mlFilt'; fl.hidden = !MS.filt;
  if (lt1) { var nav = lt1.querySelector('.lt-nav'); if (nav) nav.remove(); fl.appendChild(lt1); }
  if (lt2) { var lvl = lt2.querySelector('#lvlSel'), vm = lt2.querySelector('.vmenu'); var row = document.createElement('div'); row.className = 'lt'; if (lvl) row.appendChild(lvl); if (vm) { vm.open = false; row.appendChild(vm); } fl.appendChild(row); var cnt = lt2.querySelector('#logCnt'); if (cnt) fl.appendChild(cnt); }
  var fb = document.createElement('button'); fb.type = 'button'; fb.className = 'btn mlf' + (MS.filt ? ' on' : ''); fb.setAttribute('data-m', 'lfilt'); fb.setAttribute('aria-expanded', String(!!MS.filt)); fb.textContent = 'Фильтры';
  if (lt2) { lt2.classList.add('mlsearch'); lt2.appendChild(fb); lt2.insertAdjacentElement('afterend', fl); }
  var bar = document.createElement('div'); bar.className = 'mlbar';
  bar.innerHTML = '<button class="btn" type="button" data-act="nav" data-dir="-1" aria-label="Предыдущая проблема">' + MI.back.replace('M15 5l-7 7 7 7', 'M5 15l7-7 7 7') + '</button><span id="mlCnt" role="status" aria-live="polite"></span><button class="btn" type="button" data-act="nav" data-dir="1" aria-label="Следующая проблема">' + MI.back.replace('M15 5l-7 7 7 7', 'M5 9l7 7 7-7') + '</button>';
  lv.appendChild(bar); mobLogCount();
}
renderLogShell = (function (orig) { return function () { var r = orig.apply(this, arguments); if (isMob()) mobLog(); return r; }; })(renderLogShell);
drawInspector = (function (orig) { return function (f) {
  orig.apply(this, arguments); if (!isMob()) return;
  var box = document.getElementById('ins'); if (!box) return;
  var on = S.sel >= 0 && !box.querySelector(':scope > .hint') && !!box.textContent.trim(); box.classList.toggle('mon', on);
  if (on && !box.querySelector('.mins-x')) box.insertAdjacentHTML('afterbegin', '<div class="mins-h"><b>Строка лога</b><button class="mins-x" type="button" data-m="insx">Закрыть</button></div>');
  mobLogCount();
}; })(drawInspector);
/* переход к строке: на телефоне страница не прокручивается, строка встаёт в верхнюю треть (нижнюю закрывает лист с объяснением) */
jump = (function (orig) { return function (line) {
  orig.apply(this, arguments); if (!isMob()) return;
  mobSync(); window.scrollTo(0, 0); var f = active(), sc = $('#sc'); if (!f || !sc || !f.view) return;
  var pos = f.view.indexOf(line); if (pos < 0) return; sc.scrollTop = Math.max(0, offs(f, pos) - sc.clientHeight * 0.2); drawRows(); mobLogCount();
}; })(jump);
document.addEventListener('click', function (e) {
  var t = e.target.closest && e.target.closest('[data-m="lfilt"], [data-m="insx"]'); if (!t || !isMob()) return; e.preventDefault();
  if (t.getAttribute('data-m') === 'lfilt') { MS.filt = !MS.filt; var fl = document.getElementById('mlFilt'); if (fl) fl.hidden = !MS.filt; t.classList.toggle('on', MS.filt); t.setAttribute('aria-expanded', String(MS.filt)); }
  else { S.sel = -1; var f = active(); if (f) { drawRows(); drawInspector(f); } }
});

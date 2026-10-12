/* ---------- Умное автообновление ----------
   Скачанная версия применяется сама, но только в незаметный момент: окно не в фокусе 2 минуты или 5 минут без действий,
   ни одно окно не открыто, курсор не в поле ввода, ничего не перетаскивается и не загружается.
   Перед перезагрузкой сохраняется состояние (лог, вкладка, фильтры, прокрутка, раскрытые папки), после — восстанавливается.
   Выключается в «Настройках»; тогда версия применяется при следующем запуске, как раньше. */
var AA_FAST = !!window.__aaFast, AA_BLUR = AA_FAST ? 300 : 2 * 60000, AA_IDLE = AA_FAST ? 600 : 5 * 60000, AA_POLL = AA_FAST ? 150 : 15000, AA_RESUME_TTL = 10 * 60000; /* __aaFast — только для тестов */
var aaAct = Date.now(), aaBlur = document.hasFocus() ? 0 : Date.now(), aaTimer = 0, aaBusy = false;
function autoApplyOn() { return S.kb.settings.autoUpdate !== false && S.kb.settings.autoApply !== false; }
['pointerdown', 'keydown', 'wheel', 'input', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { aaAct = Date.now(); }, { capture: true, passive: true }); });
window.addEventListener('focus', function () { aaBlur = 0; aaAct = Date.now(); });
window.addEventListener('blur', function () { aaBlur = Date.now(); });

/* сейчас можно перезагрузить незаметно? */
function aaQuiet(now) {
  now = now || Date.now();
  var away = aaBlur && now - aaBlur >= AA_BLUR, idle = now - aaAct >= AA_IDLE;
  if (!away && !idle) return false;
  if (typeof popBusy === 'function' && popBusy()) return false;
  if (document.querySelector('.panel, #upOv, dialog[open]')) return false;
  var ae = document.activeElement; if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return false;
  if (typeof dragSrc !== 'undefined' && dragSrc) return false;
  if (S.renaming || S.restoring || (extQ && extQ.length)) return false;
  if (/^(Разбираю|Читаю|Восстанавливаю)/.test((($('#status') || {}).textContent) || '')) return false;
  if (S.files.some(function (f) { return f.sysBusy || f.diagBusy; })) return false;
  return true;
}
function aaSnapshot() {
  var f = active(), sc = $('#sc');
  return { at: Date.now(), from: APP_VERSION, tab: S.tab, hash: f ? f.hash : '', sel: S.sel, q: S.q, mode: S.mode, scope: S.scope, lvl: S.lvl, quiet: S.quiet, ctx: S.ctx,
    open: Object.keys(S.open || {}), y: window.scrollY || 0, logTop: sc ? sc.scrollTop : 0 };
}
function aaApply(shell) {
  if (aaBusy) return; aaBusy = true;
  S.kb.settings.resume = aaSnapshot(); saveKB();
  setTimeout(function () { try { if (shell) window.nativeApp.relaunch(); else window.nativeApp.reloadApp(); } catch (e) { aaBusy = false; } }, 150);
}
function aaWatch(ver, shell) {
  clearInterval(aaTimer);
  if (!autoApplyOn() || !window.nativeApp || !window.nativeApp.reloadApp) return;
  aaTimer = setInterval(function () { if (aaQuiet()) { clearInterval(aaTimer); aaApply(shell); } }, AA_POLL);
}
/* после перезагрузки: вернуть пользователя туда, где он был */
function aaResume() {
  var st = S.kb.settings, r = st.resume; if (!r) return false;
  delete st.resume; saveKB();
  if (Date.now() - r.at > AA_RESUME_TTL) return false;
  var f = r.hash && S.files.find(function (x) { return x.hash === r.hash; });
  if (f) S.active = f.id;
  ['tab', 'q', 'mode', 'scope', 'lvl', 'quiet', 'ctx'].forEach(function (k) { if (r[k] !== undefined) S[k] = r[k]; });
  if (S.scope === 'time') S.scope = 'all';
  S.sel = typeof r.sel === 'number' ? r.sel : -1; S.open = S.open || {}; (r.open || []).forEach(function (g) { S.open[g] = 1; });
  render();
  setTimeout(function () { try { window.scrollTo(0, r.y || 0); var sc = $('#sc'); if (sc && r.logTop) { sc.scrollTop = r.logTop; if (typeof drawRows === 'function') drawRows(); } } catch (e) {} }, 60);
  if (r.from && r.from !== APP_VERSION) status('Приложение обновилось до версии ' + APP_VERSION + ' и вернуло вас туда же. Что нового — кнопка «Что нового» вверху.');
  return true;
}

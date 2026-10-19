var LA = window.LA, SEV = LA.SEV;
var SEVN = ['', 'ok', 'noise', 'info', 'unk', 'warn', 'err', 'crit'];
var SEVRU = { crit: 'Критично', err: 'Ошибка', warn: 'Внимание', info: 'Заметка', ok: 'Успех', noise: 'Шум', unk: 'Неопознано' };
var STRU = { ok: 'Успех', bad: 'Сбой', warn: 'Внимание', unk: 'Неясно' };
var SRCRU = { guide: 'из руководства', obs: 'по наблюдению в логах', infer: 'вывод, в руководстве нет', web: 'по открытым источникам', user: 'ваше правило', team: 'правило команды' };
var SRCTIP = { team: 'Общее правило команды из файла rules.json в репозитории проекта', user: 'Правило, которое добавили вы или коллега через «Добавить решение»', guide: 'Правило взято из документа «Руководство по диагностике ошибок и работе с логами»', obs: 'Строка встречается в успешных заходах загруженных логов, поэтому считается шумом', web: 'Случая нет в руководстве. Объяснение собрано по справкам Rockstar, форумам RAGE и cfx.re и реальным логам. Проверяйте его', infer: 'Этого случая нет в руководстве. Объяснение построено по логам и общим признакам, проверяйте его' };
var PSTEPS_UI = [['admin', 'Администратор'], ['pirate', 'Очистка файлов'], ['backup', 'Резервная копия'], ['patch', 'Патч игры'], ['job', 'Процесс игры'], ['inject', 'Внедрение'], ['injected', 'Клиент внедрён'], ['entry', 'Запуск клиента'], ['finished', 'Готово'], ['window', 'Окно игры']];
var SAMPLE = null, APP_VERSION = '2026-10-19.129';
var ROW = 20, KBKEY = 'majestic-log-advisor.kb.v1';

var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var S = { files: [], active: null, tab: 'diag', mask: true, kb: loadKB(), mode: 'problems', ctx: true, scope: 'all', quiet: false, q: '', sel: -1, learnQ: '', learnF: 'all', uid: 0, lvl: 0, cmpA: 0, cmpB: 0, histTag: null };
applyRules();
function M(s) { return S.mask ? LA.mask(s) : String(s); }
/* Переход между вкладками и логами: новое содержимое мягко проявляется (CSS #view.vin; при «уменьшить анимацию» выключено) */
var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function animView() { var v = document.getElementById('view'); if (!v || !v.animate || (RM && RM.matches)) return; try { if (v._an) v._an.cancel(); v._an = v.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2, .7, .2, 1)' }); } catch (e) {} }

function fixKB(k) { k.status = k.status || {}; k.custom = k.custom || []; k.tags = k.tags || {}; k.hist = k.hist || {}; k.merged = k.merged || {}; k.settings = k.settings || {}; return k; }
function loadKB() {
  if (window.nativeApp) { try { var nr = window.nativeApp.kbLoad(); if (nr) { var nk = JSON.parse(nr); if (nk && nk.v === 1) return fixKB(nk); } } catch (e) {} return fixKB(LA.newKB()); }
  try { var raw = localStorage.getItem(KBKEY); if (raw) { var k = JSON.parse(raw); if (k && k.v === 1) return fixKB(k); } } catch (e) {}
  return fixKB(LA.newKB());
}
function saveKB() { if (window.nativeApp) { try { window.nativeApp.kbSave(JSON.stringify(S.kb)); } catch (e) {} return; } try { localStorage.setItem(KBKEY, JSON.stringify(S.kb)); } catch (e) {} }

var toastT = 0;
function toast(t) {
  var el = document.getElementById('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 4500);
}
/* Открылось окно: старое уведомление убираем, чтобы не закрывало его содержимое */
if (window.MutationObserver && document.getElementById('panelHost')) new MutationObserver(function () { var el = document.getElementById('toast'); if (el && document.querySelector('#panelHost .panel')) el.classList.remove('on'); }).observe(document.getElementById('panelHost'), { childList: true });
function status(t) { $('#status').textContent = t || ''; if (t && !/^Разбираю/.test(t) && t.length < 220) toast(t); }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
function fnv(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16) + '-' + s.length; }
/* То же значение, что fnv, но длинный текст считается частями с паузами для окна */
async function fnvAsync(s, pause) { var h = 2166136261 >>> 0, CH = 4000000; for (var a = 0; a < s.length; a += CH) { var e = Math.min(s.length, a + CH); for (var i = a; i < e; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } if (e < s.length) await pause(); } return h.toString(16) + '-' + s.length; }
function niceName(n) { return n.replace(/^[0-9a-f]{8}-/i, ''); }
function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ'; }


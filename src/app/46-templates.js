/* ---------- Шаблоны ответов команды (тексты из плагина SupportTemplates) ----------
   Хранятся на сервере команды (не в GitHub): загружает тот, кто знает пароль администратора, у остальных появляются сами.
   Подбор шаблона: по тексту игрока в тикете, по тексту со скриншота и по найденной в логе проблеме.
   Сначала ключевые слова на этом компьютере, затем (если на сервере есть ИИ) ИИ выбирает из списка названий. */
var MAJESTIC_GUILD = '530693013622489088';
var TPL = { at: 0, by: '', sets: [] }, TPLH = { hints: {}, stats: {}, pending: [] };
function tplLoadCache() { var c = (S.kb.settings || {}).tplCache; if (c && c.sets) TPL = c; var h = (S.kb.settings || {}).tplHints; if (h && h.hints) TPLH = h; }
function tplSaveCache() { S.kb.settings.tplCache = TPL; saveKB(); }
/* Разбор файла SupportTemplates.config.json ({"raw": "..."}) или того же текста: «## Проект», «### Название», дальше текст шаблона */
function tplParse(text) {
  var raw = String(text || ''); try { var j = JSON.parse(raw); if (j && typeof j.raw === 'string') raw = j.raw; } catch (e) {}
  var sets = [], cur = null, item = null;
  raw.replace(/\r\n/g, '\n').split('\n').forEach(function (l) {
    var h2 = /^##\s+(?!#)(.+?)\s*$/.exec(l), h3 = /^###\s+(.+?)\s*$/.exec(l);
    if (h2) { cur = { name: h2[1].trim(), items: [] }; sets.push(cur); item = null; return; }
    if (h3) { if (!cur) { cur = { name: 'Шаблоны', items: [] }; sets.push(cur); } item = { t: h3[1].trim(), body: '' }; cur.items.push(item); return; }
    if (item) item.body += l + '\n';
  });
  sets.forEach(function (st) { st.items.forEach(function (x) { x.body = x.body.replace(/^\n+|\s+$/g, ''); x.hide = /активатор|activator/i.test(x.body); }); st.items = st.items.filter(function (x) { return x.body; }); });
  return sets.filter(function (st) { return st.items.length; });
}
async function tplFetch() {
  if (!srvOn()) return;
  var r = await srv('/v1/tpl', {}); if (!r || !r.ok || r.none || !r.sets) return;
  if (r.at !== TPL.at) { TPL = { at: r.at, by: r.by || '', sets: r.sets }; tplSaveCache(); }
  var h = await srv('/v1/tplhints', {}); if (h && h.ok) { TPLH = { hints: h.hints || {}, stats: h.stats || {}, pending: h.pending || [] }; S.kb.settings.tplHints = TPLH; saveKB(); }
}
function tplHint(set, t) { return ((TPLH.hints[set] || {})[t]) || { say: [], when: '' }; }
function tplFit(set, t) { var c = (TPLH.stats[set] || {})[t]; return c ? { up: c[0] || 0, down: c[1] || 0 } : { up: 0, down: 0 }; }
/* основы слов: «задонатил» и «донат» сводятся к общему началу */
function stems(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z0-9]+/).filter(function (w) { return w.length >= 3; }).map(function (w) { return w.slice(0, Math.min(w.length, 5)); }); }
function tplSetFor(guild, want) {
  var sets = TPL.sets || []; if (!sets.length) return null;
  var by = function (re) { return sets.find(function (s) { return re.test(s.name); }); };
  if (want) { var w = sets.find(function (s) { return s.name === want; }); if (w) return w; }
  var mem = ((S.kb.settings || {}).tplGuild || {})[guild]; if (mem) { var m = sets.find(function (s) { return s.name === mem; }); if (m) return m; }
  if (guild && guild !== MAJESTIC_GUILD) return by(/росси|russia/i) || sets[0];
  return by(/majestic/i) || sets[0];
}
/* Ключевые слова по названию шаблона: работают, даже если тексты шаблонов поменяются */
var TPL_KEYS = [
  [/технический раздел форума/i, /техраздел|технический раздел/i],
  [/Проблемы с аккаунтом/i, /восстанов\S* (аккаунт|доступ)|двухфактор|\b2fa\b|взлом|украли (акк|аккаунт)|смен\S* почт|потерял\S* доступ|не помню пароль/i],
  [/Баг репорт/i, /\bбаг\w*|\bbug\b|недоработк|не работает (функци|кнопк|систем)|сломал\S* (квест|работ|функци)|не засчит/i],
  [/Проблемы с донатом/i, /закинул\S*|закинуть|пополнил\S*|донат|задонат|не (пришл|зачисл|начисл)\S* (донат|коин|валют|деньг|средств)|деньги не (пришли|зачисл)|mj ?coin|коин\S*|списал\S* (деньг|средств)|оплатил\S*.*не (пришл|получил)|перевод.*не (пришл|дош)/i],
  [/Вопросы по акции/i, /откат|кэшбэк|кешбек|cashback|акци[яиюей]|наград\S* за (акци|ивент)|не (выдал|получил)\S* наград/i],
  [/Ключ GTAV уже использован/i, /ключ\S* .*(использован|актив)|актив\S* ключ/i],
  [/Временная блокировка/i, /временн\S* блок|ограничен\S* .*(транзакц|перевод)|блок\S* .*(денеж|перевод|транзакц)/i],
  [/Обращение к администрации/i, /забрал\S* .*(машин|дом|вещ|деньг|имущ)|нарушил\S* правил|друг(ой|ие) игрок|игрок\S* (убил|ограбил|обманул|оскорбл)|игров\S* механик|администрац|\bадмин\S*|\/report|репорт|наказан|\bдм\b|\bdm\b|обман\S*|скам|\bкинул\S*|украл\S* (машин|имущ|деньг|вещ)|пропал\S* (машин|дом|имущ|вещ|предмет)|фракци|организаци|работ[аеуы] (не платит|в игре)|nonrp|нон ?рп|ролев/i],
  [/Купить ключ/i, /купить\S* .*(гта|gta|ключ)|где (купить|взять) (гта|gta|игру|ключ)/i],
  [/Улучшение проекта/i, /предлагаю|предложени|улучшени|идея для/i],
  [/Twitch Drops/i, /twitch|твич|дропс|drops/i],
  [/Вопросы по форуму/i, /форум\S* .*(аккаунт|войти|регистрац|не могу|ошибк)/i],
  [/Вопросы по Media/i, /\bмедиа\b|\bmedia\b|стать (стример|блогер|медиа)/i],
  [/Разбаны Амнистии Жалобы/i, /разбан|амнист|жалоб\S* на|забанил\S*|забанен|\bбан\S* (аккаунт|навсегда|на \d)/i],
  [/Разбан Telegram \/ Discord/i, /(бан|забан)\S* .*(телеграм|telegram|дискорд|discord)|(телеграм|telegram|дискорд|discord)\S* .*(бан|забан)/i],
  [/Мерч/i, /мерч|majestic\.store|футболк|худи/i],
  [/код подтверждения SMS/i, /\bсмс\b|\bsms\b|код подтвержд|не приходит код/i],
  [/Войти в аккаунт/i, /кнопк\S* .*войти|не нажимается .*войти/i],
  [/299 ReadProcessMemory/i, /\b299\b|readprocessmemory|writeprocessmemory|отказано в доступе|freetype/i],
  [/Переустановка VC/i, /вечн\S* загрузк|бесконечн\S* загрузк|загрузка .*(не заканчива|бесконеч)/i],
  [/бонус код/i, /бонус.?код|\/bonus|premium.*код|код.*premium/i],
  [/Мало способов оплаты/i, /(мало|нет|не вижу) способ\S* оплат|способ\S* (оплаты|пополнения) (нет|недоступ)/i],
  [/Неактуальный промокод/i, /промо.?код/i],
  [/UTF-8/i, /кириллиц|кракозябр|иероглиф|знаки вопроса вместо|юникод|\butf/i],
  [/CEF браузера/i, /\bcef\b|браузер rockstar|белый экран (лаунчер|rockstar)/i],
  [/синхронизацией мини-игр/i, /мини.?игр|рассинхрон/i],
  [/ReShade \/ ENB \/ Commandline/i, /reshade|решейд|\benb\b|commandline|dxgi\.dll|dinput8|d3d11\.dll|графическ\S* мод/i],
  [/Долгая проверка файлов/i, /долг\S* .*(проверк|загрузк|скачив)|медленн\S* .*(загрузк|скачив)|проверк\S* файлов .*долго|скачивает .*медленно/i],
  [/Legacy/i, /enhanced|энханс|legacy|легаси/i],
  [/Черный экран/i, /ч[её]рн\S* экран/i],
  [/^Проблемы с соединением/i, /server not responding|сервер не отвечает|не отвечает сервер|соединени|не (подключа|могу подключ)|\bпинг\b|кикает|\bdisconnect|потер\S* (связ|соедин)/i],
  [/Ошибка внедрения патча/i, /внедрени\S* патч|закрывается .*при запуске|gta v вылетел|вылетел\S*|вылет\S*|краш\S*|\bcrash/i],
  [/проверить лицензию/i, /лицензи|backup-drm|drm/i],
  [/Навигатор/i, /навигатор|маршрут|\bgps\b|фиолетов/i],
  [/звуков при сворачивании/i, /звук\S* .*сворач|сворач\S* .*звук/i],
  [/версия Steam/i, /запускается (версия )?(steam|стим)|steam_api64|(steam|стим)\S* вместо/i],
  [/версия Epic/i, /запускается (версия )?epic|eossdk/i],
  [/Epic Online Services/i, /epic online|\beos\b|владени\S* игрой/i],
  [/миникарта/i, /миникарт|\bрадар|карт[аы] (нет|пропал)/i],
  [/SocialClub уже был использован/i, /social ?club\S* .*(использован|занят)|сошиал\S* .*использован/i],
  [/чужой аккаунт в бане/i, /чуж\S* аккаунт/i],
  [/VCRUNTIME140_1/i, /vcruntime/i],
  [/Фризит/i, /фриз|\bфпс\b|\bfps\b|тормоз|подвиса|лагает инвентар|инвентар\S* .*(завис|лаг)/i],
  [/Не грузит текстуры/i, /текстур/i],
  [/Универсальное решение/i, /не запускается|не запускает|игра не открывается/i],
  [/скачать ресурс/i, /скачать ресурс|не удалось скачать/i],
  [/redux/i, /redux|редукс|одежд\S* (пропал|не отображ|прозрачн)|натурал виж/i],
  [/голосов/i, /голосов|\bвойс|\bvoice|микрофон|не слышно (игроков|других|людей)/i],
  [/Удаление кэша Majestic/i, /(очист|удал|почист)\S* (кэш|кеш)/i],
  [/Удаление кэша Russia/i, /(кэш|кеш)\S* .*(росси|russia)/i],
  [/Проблемы с модами/i, /мод\S* (majestic|маджестик|проекта)|вкладк\S* .*мод/i],
  [/инициализации данных \/ RGL/i, /инициализаци\S* данных|\brgl\b|rockstar games launcher\S* .*(ошибк|не запуск|не открыва)/i],
  [/1\.500\.7/i, /1\.500\.7|1\.000\.7/i],
  [/Windows 7/i, /windows ?[78]\b|винд\S* ?[78]\b/i],
  [/Выходит из аккаунта Social Club/i, /вход не выполнен|выходит из (аккаунта )?social|выкидывает из (аккаунта )?social/i],
  [/telegram ботом/i, /телеграм.?бот|telegram ?bot|бот\S* .*(не отвечает|привяз)/i],
  [/ERR_GFX_D3D_INIT/i, /err_gfx_d3d_init|d3d_init/i],
  [/EU поддержку/i, /\b(pl|de)\b serv|польск\S* сервер|немецк\S* сервер/i],
  [/Завис курсор/i, /курсор/i],
  [/Раздвоение интерфейса/i, /раздвоен|съезжает разрешен|интерфейс\S* .*(двоит|съехал|раздвоил)/i],
  [/Ошибка при пополнени/i, /ошибк\S* .*(пополнен|оплат)|не проходит оплата|оплата не проходит|не могу (оплатить|пополнить)/i],
  [/капч/i, /капч/i]
];
var TPL_SKIP = /Название сервера|список IP/i;
/* \\b в JavaScript не видит границу у русских слов — заменяем на свою границу слова */
var WB = '(?:(?<![а-яёa-z0-9_])(?=[а-яёa-z0-9_])|(?<=[а-яёa-z0-9_])(?![а-яёa-z0-9_]))';
/* очки шаблона: ключевые слова + фразы-примеры команды; отметки «подходит / не подходит» немного поднимают или опускают */
function tplLocal(set, text) {
  var t = String(text || '').toLowerCase(); if (!set || t.length < 3) return [];
  var ts = {}; stems(t).forEach(function (w) { ts[w] = 1; });
  var out = [];
  set.items.forEach(function (x, i) {
    if (x.hide || TPL_SKIP.test(x.t)) return;
    var n = 0, k = TPL_KEYS.find(function (p) { return p[0].test(x.t); });
    if (k && k[1]) { var g = k.re || (k.re = new RegExp(k[1].source.replace(/\\b/g, WB), 'gi')); n = (t.match(g) || []).length; }
    tplHint(set.name, x.t).say.forEach(function (ph) { var ps = stems(ph), hit = ps.filter(function (w) { return ts[w]; }).length; if (ps.length && hit >= Math.min(2, ps.length) && hit / ps.length >= 0.6) n += 2; });
    if (!n) return;
    var f = tplFit(set.name, x.t); out.push({ i: i, score: n + 2 * (f.up - f.down) / (f.up + f.down + 3) });
  });
  return out.filter(function (x) { return x.score > 0.3; }).sort(function (a, b) { return b.score - a.score || a.i - b.i; }).slice(0, 3);
}
var TPL_SYS = 'Ты помогаешь саппорту игрового проекта (мультиплеер GTA V) выбрать готовый шаблон ответа на обращение игрока. ' +
  'Техподдержка отвечает только на технические вопросы. Игровая механика, правила, ситуации с другими игроками, имущество, фракции, наказания в игре — шаблон про обращение к администрации. ' +
  'Разбаны, амнистии, жалобы — шаблон про разбаны. Донат и оплата — шаблоны про донат или ошибку пополнения. Ошибки запуска и вылеты — технические шаблоны. ' +
  'Ответь ТОЛЬКО JSON: {"pick": [номера шаблонов из списка, до 3, лучший первым], "why": "одна короткая фраза по-русски, почему", "ask": "если по обращению непонятно, какой шаблон нужен, — короткий вопрос игроку на «Вы», иначе пустая строка"}. ' +
  'Выбирай только из списка. Если ничего не подходит — pick пустой.';
/* Подбор: ключевые слова, затем ИИ (по названиям шаблонов). Возвращает до трёх шаблонов с пояснением. */
async function tplMatch(text, opt) {
  opt = opt || {}; var set = tplSetFor(opt.guild, opt.set); if (!set) return null;
  var text2 = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 3000), loc = tplLocal(set, text2), pick = loc.map(function (x) { return x.i; }), why = '', ask = '', src = pick.length ? 'ключевые слова' : '';
  /* ключевые слова уверенно указали на один шаблон — ИИ не спрашиваем, бесплатный лимит не тратится */
  var sure = loc[0] && loc[0].score >= 2 && (!loc[1] || loc[0].score > loc[1].score);
  var aiWanted = !sure && text2.length >= 12, aiErr = '';
  if (opt.ai !== false && aiWanted && !srvOn()) aiErr = 'нет входа на сервер команды — откройте Majestic Log Advisor и войдите';
  else if (opt.ai !== false && aiWanted) {
    var list = set.items.map(function (x, i) { if (x.hide || TPL_SKIP.test(x.t)) return null; var h = tplHint(set.name, x.t); return (i + 1) + '. ' + x.t + (h.when ? ' — когда: ' + h.when : '') + (h.say.length ? ' — игроки пишут: ' + h.say.slice(0, 4).join('; ') : ''); }).filter(Boolean).join('\n');
    var a = await srv('/v1/ai', { body: { system: TPL_SYS, input: 'Шаблоны:\n' + list + '\n\nОбращение игрока:\n' + LA.mask(text2) + (loc.length ? '\n\nПо ключевым словам подходят: ' + loc.map(function (x) { return x.i + 1; }).join(', ') : ''), max: 400 } });
    var j = null; if (a && a.ok) { try { j = JSON.parse(String(a.text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) {} }
    /* причина, по которой ИИ не помог, — показывается в окне «Разбор», чтобы было понятно, что чинить */
    aiErr = !a ? 'сервер команды не ответил (нет интернета или ключ Gemini не задан на сервере)' : a.error === 'limit' ? 'ваш дневной лимит запросов к ИИ исчерпан' : a.error === 'rate' ? 'бесплатный лимит Gemini на сегодня исчерпан' : !a.ok ? (a.detail || a.error || 'ошибка сервера') : !j ? 'ИИ ответил не по формату' : '';
    if (j && Array.isArray(j.pick)) {
      var ai = j.pick.map(function (n) { return (+n) - 1; }).filter(function (i) { return set.items[i] && !set.items[i].hide; });
      if (ai.length || !pick.length) { pick = ai.concat(pick.filter(function (i) { return ai.indexOf(i) < 0; })).slice(0, 3); src = 'ИИ'; }
      why = String(j.why || '').slice(0, 200); ask = String(j.ask || '').slice(0, 300);
    }
  }
  var V = opt.vars || {}, fill = function (b) { return tplFill(b, V); };
  return { set: set.name, sets: (TPL.sets || []).map(function (s) { return s.name; }), src: src, why: why, ask: ask, sure: !!sure, more: opt.ai === false && aiWanted, aiErr: aiErr,
    pick: pick.map(function (i) { var f = tplFit(set.name, set.items[i].t); return { t: set.items[i].t, body: fill(set.items[i].body), up: f.up, down: f.down }; }),
    all: set.items.filter(function (x) { return !x.hide; }).map(function (x) { return { t: x.t, body: fill(x.body) }; }) };
}
/* Подстановки в тексте шаблона: {ник}, {статик}, {сервер} — из тикета, {файл}, {моды}, {код} — из лога.
   Если данных нет, метка остаётся как есть — саппорт увидит её и допишет. */
function tplFill(body, V) {
  return String(body || '').replace(/\{(ник|статик|сервер|файл|моды|код)\}/gi, function (m, k) { var v = V[k.toLowerCase()]; return v ? String(v) : m; });
}
/* отметка саппорта из окна «Разбор»: подходит / не подходит, или фраза-пример своими словами (уходит на подтверждение администратору) */
async function tplFeedback(b) {
  if (!b || ((!b.set || !b.t) && b.kind !== 'ev')) return { ok: false };
  if (b.kind === 'fit') { var r = await srv('/v1/tplfit', { body: { set: b.set, t: b.t, v: b.v === 1 ? 1 : -1 } }); if (r && r.ok) { TPLH.stats[b.set] = TPLH.stats[b.set] || {}; TPLH.stats[b.set][b.t] = [r.up, r.down]; } return { ok: !!(r && r.ok), up: r && r.up, down: r && r.down }; }
  if (b.kind === 'ev') { var r3 = await srv('/v1/tplev', { body: { ev: String(b.ev || ''), src: String(b.src || '') } }); return { ok: !!(r3 && r3.ok) }; }
  if (b.kind === 'say') { var say = LA.mask(String(b.say || '')).slice(0, 140); var r2 = await srv('/v1/tplhint/suggest', { body: { set: b.set, t: b.t, say: say } }); return { ok: !!(r2 && r2.ok) }; }
  return { ok: false };
}
function tplRemember(guild, name) { if (!guild || !name) return; var st = S.kb.settings; st.tplGuild = st.tplGuild || {}; st.tplGuild[guild] = name; saveKB(); }

/* ---------- Настройки: шаблоны команды ---------- */
function tplSettingsHtml() {
  var n = (TPL.sets || []).reduce(function (a, s) { return a + s.items.filter(function (x) { return !x.hide; }).length; }, 0);
  return '<h4 style="margin:10px 0 2px">Шаблоны ответов команды</h4><p class="hint" style="margin:0 0 6px">' + (n ? 'Загружено ' + n + ' шаблонов (' + (TPL.sets || []).map(function (s) { return esc(s.name) + ': ' + s.items.length; }).join(', ') + ')' + (TPL.at ? ', обновлены ' + esc(fmtDT(TPL.at)) + (TPL.by ? ' (' + esc(TPL.by) + ')' : '') : '') + '. Плагин Discord подбирает их по тексту игрока, скриншоту и логу.' : 'Шаблонов пока нет. Загрузите файл SupportTemplates.config.json — шаблоны появятся у всей команды.') + '</p>' +
    (srvOn() ? '<div class="row-actions" style="justify-content:flex-start"><button class="btn sm" data-act="tplUpload">Загрузить файл для команды…</button><button class="btn sm" data-act="tplHints">Подсказки для подбора' + (TPLH.pending.length ? ' (' + TPLH.pending.length + ' на проверке)' : '') + '</button><button class="btn sm ghost" data-act="tplRefresh">Обновить</button></div>' : '<p class="hint" style="margin:0">Шаблоны приходят с сервера команды — нужен вход в приложение.</p>');
}
function tplUploadDialog() {
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Шаблоны для команды" data-act="noop" style="max-width:560px"><b>Шаблоны ответов для команды</b>' +
    '<p class="hint" style="margin:4px 0 8px">Выберите файл SupportTemplates.config.json (или текст шаблонов: «## Проект», «### Название»). Шаблоны заменят прежние у всех. Нужен пароль администратора — тот же, что на странице доступа.</p>' +
    '<input type="file" id="tplFile" accept=".json,.md,.txt,application/json,text/plain"><label class="nl" style="margin-top:8px">Пароль администратора<input type="text" id="tplPw" autocomplete="off" style="-webkit-text-security:disc"></label><div class="hint" id="tplMsg" style="margin-top:6px"></div>' +
    '<div class="row-actions"><button class="btn sm primary" data-act="tplSend">Загрузить</button><button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
}
async function tplSend() {
  var f = $('#tplFile').files[0], pw = $('#tplPw').value, msg = $('#tplMsg');
  if (!f) { msg.textContent = 'Выберите файл.'; return; }
  var sets = tplParse(await f.text()); if (!sets.length) { msg.textContent = 'В файле не нашлось шаблонов («### Название» и текст под ним).'; return; }
  msg.textContent = 'Загружаю ' + sets.reduce(function (a, s) { return a + s.items.length; }, 0) + ' шаблонов…';
  var r = await srv('/v1/tpl/put', { body: { pass: pw, sets: sets } });
  if (!r) { msg.textContent = 'Не получилось: неверный пароль или нет связи с сервером.'; return; }
  if (!r.ok) { msg.textContent = r.error === 'pass' ? 'Неверный пароль администратора.' : 'Сервер не принял шаблоны (' + r.error + ').'; return; }
  await tplFetch(); msg.textContent = 'Готово: ' + r.n + ' шаблонов, у команды появятся при следующей проверке (до 30 минут) или по кнопке «Обновить».';
  hiddenTplNote(sets);
}
function hiddenTplNote(sets) { var h = []; sets.forEach(function (s) { s.items.forEach(function (x) { if (x.hide) h.push(x.t); }); }); if (h.length) status('Не предлагаются автоматически: ' + h.join(', ') + '.'); }
/* ---------- Подсказки для подбора: фразы игроков (своими словами) и «когда отправлять»; меняет администратор ---------- */
var TPLPW = '';
function tplHintsDialog(selSet, selT) {
  var sets = TPL.sets || [], set = sets.find(function (s) { return s.name === selSet; }) || sets[0];
  if (!set) { status('Сначала загрузите шаблоны команды.'); return; }
  var it = set.items.find(function (x) { return x.t === selT; }) || set.items.filter(function (x) { return !x.hide; })[0], h = tplHint(set.name, it.t), f = tplFit(set.name, it.t);
  var pend = TPLH.pending.map(function (p) { return '<li style="display:grid;gap:4px;padding:6px 0;border-bottom:1px solid var(--line)"><div><b>' + esc(p.t) + '</b> <span class="mut">' + esc(p.set) + (p.by ? ' · ' + esc(p.by) : '') + '</span></div>' + (p.say ? '<div>Игроки пишут: «' + esc(p.say) + '»</div>' : '') + (p.when ? '<div>Когда отправлять: ' + esc(p.when) + '</div>' : '') + '<div class="row-actions" style="justify-content:flex-start;margin:0"><button class="btn sm primary" data-act="tphOk" data-id="' + esc(p.id) + '">Принять</button><button class="btn sm ghost" data-act="tphNo" data-id="' + esc(p.id) + '">Отклонить</button></div></li>'; }).join('');
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Подсказки для подбора" data-act="noop" style="max-width:720px;width:100%;max-height:90vh;overflow:auto"><b>Подсказки для подбора шаблонов</b>' +
    '<p class="hint" style="margin:4px 0 8px">Фразы — как игроки обычно описывают проблему, своими словами команды (без ников и копий сообщений). «Когда отправлять» — короткое пояснение для ИИ. Менять может только администратор.</p>' +
    '<label class="nl">Пароль администратора<input type="text" id="tphPw" autocomplete="off" style="-webkit-text-security:disc" value="' + esc(TPLPW) + '"></label>' +
    (pend ? '<h4 style="margin:12px 0 2px">На проверке (' + TPLH.pending.length + ')</h4><ul style="list-style:none;margin:0;padding:0">' + pend + '</ul>' : '') +
    '<h4 style="margin:12px 0 4px">Шаблон</h4><div class="row-actions" style="justify-content:flex-start;margin:0"><select class="sel" id="tphSet">' + sets.map(function (s) { return '<option' + (s === set ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select><select class="sel" id="tphT" style="max-width:420px">' + set.items.filter(function (x) { return !x.hide; }).map(function (x) { return '<option' + (x === it ? ' selected' : '') + '>' + esc(x.t) + '</option>'; }).join('') + '</select></div>' +
    '<p class="hint" style="margin:6px 0">Отметки саппортов: подходит ' + f.up + ', не подходит ' + f.down + '.</p>' +
    '<label class="nl">Когда отправлять<input type="text" id="tphWhen" value="' + esc(h.when) + '" placeholder="Например: вопросы игровой механики, ситуации с другими игроками"></label>' +
    '<label class="nl" style="margin-top:6px">Игроки пишут (по одной фразе в строке)<textarea class="note" id="tphSay" style="height:120px" placeholder="не пришли коины&#10;задонатил и ничего не пришло">' + esc(h.say.join('\n')) + '</textarea></label><div class="hint" id="tphMsg" style="margin-top:6px"></div>' +
    '<div class="row-actions"><button class="btn sm primary" data-act="tphSave">Сохранить для команды</button><button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
  $('#tphSet').addEventListener('change', function () { TPLPW = $('#tphPw').value; tplHintsDialog(this.value); });
  $('#tphT').addEventListener('change', function () { TPLPW = $('#tphPw').value; tplHintsDialog($('#tphSet').value, this.value); });
}
async function tplHintsAdmin(body) {
  TPLPW = $('#tphPw').value; var msg = $('#tphMsg');
  var r = await srv('/v1/tplhint/admin', { body: Object.assign({ pass: TPLPW }, body) });
  if (!r || !r.ok) { if (msg) msg.textContent = r && r.error === 'pass' ? 'Неверный пароль администратора.' : 'Не получилось сохранить: нет связи с сервером или неверный пароль.'; return false; }
  await tplFetch(); return true;
}
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('[data-act]'); if (!a) return; var act = a.getAttribute('data-act');
  if (act === 'tplHints') { tplFetch().then(function () { tplHintsDialog(); }); }
  else if (act === 'tphOk' || act === 'tphNo') { var cs = $('#tphSet').value, ct = $('#tphT').value; tplHintsAdmin({ action: act === 'tphOk' ? 'approve' : 'reject', id: a.getAttribute('data-id') }).then(function (ok) { if (ok) tplHintsDialog(cs, ct); }); }
  else if (act === 'tphSave') { var s1 = $('#tphSet').value, t1 = $('#tphT').value; tplHintsAdmin({ action: 'set', set: s1, t: t1, when: $('#tphWhen').value, say: $('#tphSay').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) }).then(function (ok) { if (ok) { tplHintsDialog(s1, t1); var m = $('#tphMsg'); if (m) m.textContent = 'Сохранено — подбор у команды учтёт это при следующей проверке (до 30 минут).'; } }); }
  else if (act === 'tplUpload') tplUploadDialog();
  else if (act === 'tplSend') tplSend();
  else if (act === 'tplRefresh') tplFetch().then(function () { status('Шаблоны: ' + (TPL.sets || []).reduce(function (n, s) { return n + s.items.length; }, 0) + '.'); var b = $('#tplBox'); if (b) b.innerHTML = tplSettingsHtml(); });
});
tplLoadCache();
setTimeout(function () { tplFetch(); }, 4000); setInterval(function () { tplFetch(); }, 30 * 60000);

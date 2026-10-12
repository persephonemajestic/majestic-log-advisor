/* Ядро анализатора логов Majestic RP: парсер, правила, сценарии, самообучение. Работает и в браузере, и в Node. */
(function (root) {
'use strict';

var SEV = { none: 0, ok: 1, noise: 2, info: 3, unk: 4, warn: 5, err: 6, crit: 7 };
var ANSI = /\x1b?\[\d{1,3}(?:;\d{1,3})*m/g;
var MAINRE = /^\[(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d(?:\.\d+)?)\]\s*(?:\[(\w+)\]\s*)?(?:\[\s*\(([^)]*)\)\s*\]\s*)?(.*)$/;
var CLRE = /^\[(\d\d:\d\d:\d\d(?:\.\d+)?)\]((?:\[[^\]]*\])*)\s?(.*)$/;
var MJ = /dlc_(?:mj|maj|map)_|majestic|[\\\/]cache[\\\/]/i;
var GTA = /Grand Theft Auto|GTAV|x64[a-z]\.rpf|dlc_?mp|update\.rpf|common\.rpf/i;

function msgOf(t) { var x = /message:\s*(?:'([^']*)|"((?:[^"\\]|\\.)*)")/.exec(t); return x ? (x[1] != null ? x[1] : x[2].replace(/\\'/g, "'")).replace(/\\r\\n/g, ' ').trim() : ''; }
function owner(s) { if (MJ.test(s)) return 'mj'; if (GTA.test(s)) return 'gta'; return '?'; }

/* ---------- Правила ----------
   src: guide = из руководства компании; obs = наблюдение по загруженным логам (встречается в успешных заходах);
        infer = вывод по общим признакам, в руководстве этого нет */
var RULES = [];
function R(o) { o.idx = RULES.length; RULES.push(o); return o; }

var TPL_NET = 'Проблемы с соединением / Server not responding';
var TPL_INJ = 'Ошибка внедрения патча / Закрывается игра при запуске / GTA V вылетела';
var TPL_MODS = 'Не удаляют моды (redux), проблемы с одеждой';
var TPL_RES = 'Не удалось скачать ресурс «название файла»';


/* ----- справочник кодов RAGE / GTA V (открытые источники: справка Rockstar, форумы RAGE и cfx.re, сводки по ошибкам GTA V для ПК) ----- */
var ERR_LOOP = ['Повторяется много раз подряд: разовой очистки кеша мало. Порядок: убрать все моды из папки игры; «Очистить кеш» в лаунчере и дождаться полной перепроверки; проверить целостность GTA V; проверить диск (chkdsk, состояние SMART) и временно отключить сторонний антивирус.',
  'Если после этого краш остаётся: передать дальше с client.log и main.log той же попытки, минидампом и временем краша.'];
var ERRDICT = [
  { re: /^ERR_STR_FAILURE/, t: 'внутренний сбой игры (потоковая загрузка)', cause: 'Игра сообщила «Ошибка игры, перезагрузите систему и запустите игру заново». Чаще всего это сбой при подгрузке данных: повреждённый кеш, нехватка памяти или дисковые ошибки.', fix: ['Перезагрузить компьютер и запустить игру заново.', 'Нажать «Очистить кеш» в лаунчере и дождаться перепроверки файлов.', 'Проверить целостность файлов GTA V и свободное место на диске.'] },
  { re: /^ERR_FIL_PACK/, t: 'не открывается архив игры (.rpf)', cause: 'Игра не смогла прочитать упакованный архив (.rpf) с ресурсами. Обычно архив повреждён или подменён: правки через OpenIV, моды в папке игры, антивирус изменил файл, ошибки на диске. Для Majestic сюда же относится повреждённый кеш ресурсов. Лаунчер в этом случае сам включает перепроверку ресурсов (needResourceCheck).',
    fix: ['Убрать моды: OpenIV, ReShade, ENB, сторонние сборки из папки игры (разрешённые моды лежат в папке модификаций лаунчера).', 'Нажать «Очистить кеш» в лаунчере и дождаться полной перепроверки файлов Majestic.', 'Проверить целостность файлов GTA V (Steam, Epic или Rockstar Games Launcher).', 'Диск: проверить на ошибки (chkdsk), игру держать на исправном диске, а не на съёмном и не на сетевом.'] },
  { re: /^ERR_SYS_(?:STREAMERREAD|PAR_\d+)/, t: 'повреждены данные игры', cause: 'Игра прочитала повреждённые данные. Источник обычно один: битые файлы GTA V или кеш Majestic.', fix: ['Перезагрузить компьютер и повторить запуск.', 'Проверить целостность файлов GTA V.', 'Нажать «Очистить кеш» в лаунчере и перепроверить файлы Majestic.'] },
  { re: /^ERR_(?:SYS_(?:THREAD|PURE|NOSTREAMINGHANDLES)|SCR_TEXT_MEM_\d+|GFX_RENDERTARGET)/, t: 'сбой игры (чаще лечится перезагрузкой)', cause: 'Внутренний сбой игры: не хватило ресурсов системы (дескрипторы, память) или поток завершился с ошибкой. Единичный случай обычно проходит после перезагрузки компьютера.', fix: ['Перезагрузить компьютер, закрыть лишние программы (браузеры, записывающие и оверлейные программы).', 'Если повторяется: убрать графические моды, проверить файл подкачки (не отключать, лучше задать размер вручную), обновить драйвер видеокарты.'] },
  { re: /^ERR_NET_WINSOCK/, t: 'ошибка сети Windows (WinSock)', cause: 'Сетевой стек Windows вернул ошибку. Часто виноваты VPN, сторонний сетевой драйвер или фильтр антивируса.', fix: ['Перезагрузить компьютер, отключить VPN и прокси, повторить запуск.', 'Если повторяется: от администратора выполнить netsh winsock reset и перезагрузиться.', 'Временно отключить сетевые функции антивируса и сторонние фаерволы.'] },
  { re: /^ERR_GFX_(?:INIT|WIN|D3D_SWAPCHAIN_ALLOC_\d+|D3D_VER_\d+|D3D_SHADER_\d+)/, t: 'не стартовала графика (DirectX / видеокарта)', cause: 'Игра не смогла создать окно или графическое устройство. Причины по частоте: драйвер видеокарты, графические моды (ReShade, ENB), DirectX, игра запущена не на дискретной видеокарте (ноутбуки).', fix: ['Убрать графические моды, обновить драйвер видеокарты (лучше чистой установкой).', 'Установить DirectX End-User Runtime, проверить, что видеокарта поддерживает DirectX 11.', 'На ноутбуке запустить игру на дискретной видеокарте (Параметры графики Windows → GTA5.exe → Высокая производительность).', 'Сбросить settings.xml (Документы → Rockstar Games → GTA V).'] },
  { re: /^ERR_GFX_STATE/, t: 'сбой состояния графики (обычно драйвер видеокарты)', cause: 'Игра упала при работе с видеокартой. Справка Rockstar связывает ошибку с драйвером видеокарты: свежим с дефектом или устаревшим.', fix: ['Обновить драйвер видеокарты чистой установкой; если ошибка появилась после обновления, откатить на предыдущую версию драйвера.', 'В свойствах GTA5.exe (вкладка «Совместимость») отключить оптимизацию во весь экран и включить запуск от имени администратора.', 'Убрать разгон видеокарты и графические моды (ReShade, ENB).'] },
  { re: /^ERR_GFX_D3D_DEFERRED_MEM/, t: 'не хватило видеопамяти', cause: 'DirectX остался без памяти: видеопамяти мало для выбранных настроек и текстур (часто на графических модах).', fix: ['Снизить качество текстур и разрешение, убрать графические моды.', 'Закрыть программы, которые держат видеопамять (браузеры, стримы, оверлеи).'] },
  { re: /^ERR_AUD_/, t: 'ошибка звука', cause: 'Игра не смогла инициализировать звуковое устройство. Мешают виртуальные аудиоустройства, сломанный драйвер или отключённое устройство вывода по умолчанию.', fix: ['Выбрать рабочее устройство вывода по умолчанию, отключить виртуальные аудиоустройства (программы смены голоса, виртуальные кабели).', 'Обновить или переустановить звуковой драйвер, перезагрузить компьютер.'] },
  { re: /^ERR_SYS_(?:TIMER_RDTSC|SETTINGS|MINREQ_\w+)/, t: 'компьютер не проходит по требованиям игры', cause: 'Железо не отвечает минимальным требованиям GTA V (процессор, память, видеопамять) или не поддерживает нужную инструкцию.', fix: ['Сверить компьютер с требованиями GTA V (в том числе объём видеопамяти и оперативной памяти).', 'Если железо подходит, сбросить settings.xml и проверить драйверы.'] },
  { re: /^ERR_MEM_/, t: 'не хватило оперативной памяти', cause: 'Игре не хватило ОЗУ или виртуальной памяти (файла подкачки), чаще на слабых ПК и при тяжёлых модах.', fix: ['Закрыть браузер и тяжёлые программы, перезагрузить компьютер.', 'Включить файл подкачки Windows с автоматическим размером (или не меньше 16 ГБ) на диске с достаточным местом.', 'Убрать графические моды, снизить настройки текстур.'] },
  { re: /^ERR_GEN_/, t: 'общая ошибка игры', cause: 'Игра остановилась из-за внутренней ошибки. Часто это повреждённые файлы или сторонние моды.', fix: ['Убрать моды: OpenIV, ReShade, ENB, сторонние сборки из папки игры.', 'Нажать «Очистить кеш» в лаунчере и дождаться проверки файлов.', 'Если повторяется, собрать свежие main.log и client.log и передать дальше.'] },
  { re: /^ERR_SYS_(?:INVALIDRESOURCE|CRC\w*)/, t: 'повреждён ресурс игры', cause: 'Игра прочитала ресурс с неверной контрольной суммой: файл повреждён или изменён модом.', fix: ['Убрать моды и подменённые файлы из папки игры.', 'Очистить кеш лаунчера и дать ему перепроверить файлы.'] },
  { re: /^ERR_FIL_(?!PACK)/, t: 'игра не смогла прочитать файл', cause: 'Файл игры недоступен или повреждён: закрыт антивирусом, лежит на проблемном диске или изменён.', fix: ['Добавить папку игры в исключения антивируса.', 'Проверить диск с игрой на ошибки (chkdsk) и свободное место.', 'Очистить кеш лаунчера и перепроверить файлы.'] },
];
function errInfo(code) { for (var i = 0; i < ERRDICT.length; i++) if (ERRDICT[i].re.test(code)) return ERRDICT[i]; return null; }

/* ----- main.log ----- */
R({ id: 'm-drm', kind: 'main', kw: 'backup-drm-mismatch', re: /reason:\s*'backup-drm-mismatch'/, sev: 'crit', src: 'guide',
  title: 'Не пройдена проверка лицензии (DRM)',
  detail: function (m, t) { return msgOf(t); },
  cause: 'Файл лицензии в папке игры (steam_api64.dll у Steam, EOSSDK-Win64-Shipping.dll у Epic) не совпадает с оригиналом. Лаунчер каждый раз берёт его из папки игры, поэтому чинить нужно именно там. Если в message написано source "..." not found in GTA folder, файла в папке игры нет вообще. У версии из Rockstar Launcher и при вручную указанной папке проверка не выполняется.',
  fix: ['Переустановить лицензионную GTA V и убрать подменённые файлы.', 'Если файлы не менялись, а ошибка остаётся: включить VPN и повторить запуск.'],
  tpl: ['Не удалось проверить лицензию игры'] });

R({ id: 'm-manifest', kind: 'main', kw: 'reason:', re: /reason:\s*'(?:manifest-error|backup-failed)'/, sev: 'crit', src: 'guide',
  title: 'Не скачался список файлов обновления',
  detail: function (m, t) { return msgOf(t); },
  cause: 'Лаунчер не смог скачать manifest / update.json с CDN. Обычно виноваты интернет, VPN, DNS или блокировка соединения. Игроку это выглядит как «висит на проверке файлов».',
  fix: ['Проверить интернет, VPN и DNS.', 'Отключить прокси и фаервол, повторить запуск.'], tpl: [TPL_NET] });

R({ id: 'm-enhanced', kind: 'main', kw: 'gta-enhanced', re: /reason:\s*'gta-enhanced'/, sev: 'crit', src: 'guide',
  title: 'Установлена GTA V Enhanced вместо Legacy',
  cause: 'Majestic работает только на версии Legacy. Это не поломка, просто не та версия игры.',
  fix: ['Установить GTA V Legacy и указать путь к ней. В Steam и Epic это отдельная позиция в библиотеке, докупать ничего не нужно.'], tpl: ['Версия игры Legacy'] });

R({ id: 'm-install', kind: 'main', kw: 'install-invalid', re: /reason:\s*'install-invalid'/, sev: 'crit', src: 'guide',
  title: 'Папка с игрой не прошла проверку',
  detail: function (m, t) { return msgOf(t); },
  refine: function (m, t) {
    if (/not-found/.test(t)) return { key: 'nf', cause: 'not-found: по указанному пути файлов игры нет вообще.', fix: ['Переуказать путь к папке с GTA V (Legacy) или переустановить игру.'] };
    if (/corrupted/.test(t)) return { key: 'cor', cause: 'corrupted: файлы на месте, но повреждены или подменены.', fix: ['Проверить целостность файлов игры.'] };
    return null;
  },
  cause: 'Лаунчер проверил папку с игрой и остался недоволен. Слово в конце message говорит, в чём дело: not-found или corrupted.',
  fix: ['not-found: переуказать путь или переустановить игру.', 'corrupted: проверить целостность файлов игры.'] });

R({ id: 'm-setpath', kind: 'main', kw: 'setPath rejected', re: /setPath rejected/, sev: 'err', src: 'guide',
  title: 'Лаунчер не принял выбранную папку',
  detail: function (m, t) { return (/path:\s*'([^']*)'/.exec(t) || [])[1] || ''; },
  cause: 'В выбранной папке нет GTA5.exe (reason: no-executable). Частая причина: игрок выбрал корень вроде C:\\Program Files\\Epic Games, а не папку самой игры.',
  fix: ['Указать папку, где лежит GTA5.exe (версия Legacy).'] });

R({ id: 'm-elev', kind: 'main', kw: ['elevation-failed', 'permissionsRepair: elevated'], re: /maintenance:fix-permissions fail[^]*?elevation-failed|permissionsRepair: elevated command failed/, sev: 'warn', warnAt: 1, src: 'obs',
  title: 'Исправление прав не выполнено: нет подтверждения администратора (UAC)',
  cause: 'Лаунчер пытался выдать себе права на папки, но Windows не дала повышение прав: игрок отклонил запрос UAC, нет прав администратора или запрос закрыт. Следом обычно идёт «permissions-failed».',
  fix: ['Запустить лаунчер от имени администратора и согласиться на запрос Windows (UAC).', 'Если учётная запись без прав администратора, войти под администратором.', 'Проверить, что папка игры не на защищённом диске и не под контролем антивируса (контролируемый доступ к папкам).'] });

R({ id: 'm-garbage', kind: 'main', kw: ['garbage'], re: /patcher: (?:addon (?:reported garbage GTA backup path|produced garbage output)|silent since garbage output)/, sev: 'warn', warnAt: 1, src: 'obs',
  title: 'Патчер вернул мусорный вывод (путь к резервной копии GTA5.exe нечитаем)',
  cause: 'Аддон патчера выдал нечитаемый путь вместо резервной копии GTA5.exe и был перезапущен. Так бывает, когда внедрение блокирует антивирус или процесс патчера повреждён; если лаунчер отказался после «giving up», игра не будет пропатчена.',
  fix: ['Добавить папку %appdata%\\majestic-launcher и папку GTA V в исключения антивируса и Защитника Windows.', 'Закрыть Rockstar Games Launcher, GTA5.exe и SocialClubHelper.exe и запустить Majestic от имени администратора.', 'Если «giving up» повторяется: переустановить лаунчер поверх с очисткой кеша.'] });

R({ id: 'm-launchfail', kind: 'main', kw: 'game launch failed', re: /game launch failed \{[^}]*?reason:\s*'([^']+)'(?:[^}]*?message:\s*'([^']*)')?/, sev: 'warn', warnAt: 1, src: 'obs', loopAt: 3,
  title: 'Запуск игры не удался (лаунчер не получил манифест)',
  detail: function (m) { return m[1] + (m[2] ? ': ' + m[2].slice(0, 120) : ''); },
  /* общее правило уступает частному: если у причины есть своё правило ниже по списку (права, диск, патчер, таймаут…), берётся оно */
  test: function (m, t, e) { var me = this; for (var i = me.idx + 1; i < RULES.length; i++) { var r = RULES[i]; if (r.kind !== 'main' || r.custom || r.sev === 'noise' || r.sev === 'ok') continue; var kws = r.kws || (Array.isArray(r.kw) ? r.kw : [r.kw]), hit = false; for (var k = 0; k < kws.length; k++) if (kws[k] && t.indexOf(kws[k]) !== -1) { hit = true; break; } if (hit && r.re.test(t)) return false; } return true; },
  refine: function (m) { var rs = m[1], net = /manifest|network|fetch|cdn|dns|socket|connect/i.test(rs + ' ' + (m[2] || '')); return net ? null : { key: rs, title: 'Запуск игры не удался: ' + rs, cause: 'Лаунчер прервал запуск с причиной «' + rs + '»' + (m[2] ? ' (' + m[2].slice(0, 120) + ')' : '') + '. Отдельного правила для этой причины нет: смотрите сообщение и строки рядом, а также находки выше.', fix: ['Перезапустить лаунчер от имени администратора и повторить запуск.', 'Если повторяется: прислать main.log сразу после ошибки и указать время попытки.'] }; },
  cause: 'Лаунчер не смог получить манифест обновления (update.json) с CDN Majestic: обрыв или таймаут сети. Это сеть игрока или провайдера, не повреждение файлов игры.',
  fix: ['Проверить, открывается ли https://cdn.majestic-files.net/ в браузере; отключить VPN и прокси.', 'Сменить DNS на 1.1.1.1 / 8.8.8.8 и повторить запуск.', 'Добавить лаунчер в исключения антивируса и брандмауэра.'] });

R({ id: 'm-perm', kind: 'main', kw: 'permissions-failed', re: /reason:\s*'permissions-failed'/, sev: 'crit', src: 'guide',
  title: 'Нет прав на запись в папку',
  detail: function (m, t) { return msgOf(t); },
  cause: 'Windows запрещает лаунчеру писать в папку (EPERM). Какие именно папки закрыты, видно в message. Место на диске тут ни при чём.',
  fix: ['Нажать «Починить доступ к папкам» в настройках лаунчера и запустить его от администратора.',
    'Если включён «Контролируемый доступ к папкам» (Defender): разрешить приложения Majestic Launcher.exe и GTA5.exe в списке «Разрешить работу приложения…». Папку игры в «Защищённые папки» добавлять нельзя, станет хуже.',
    'Не помогло: выдать полный доступ группам «Все», «Прошедшие проверку», «Владельцы устройства» на C:\\Games, MAJESTIC_GTA, cache (каждая подпапка отдельно), AppData\\Local\\MajesticLauncher, AppData\\Roaming\\majestic-launcher, затем перезапустить лаунчер.'] });

R({ id: 'm-srvfiles', kind: 'main', kw: 'server-files-failed', re: /reason:\s*'server-files-failed'/, sev: 'crit', src: 'guide',
  title: 'Не загрузились файлы сервера',
  detail: function (m, t) { return msgOf(t); },
  refine: function (m, t) {
    if (/ENOSPC/.test(t)) return { key: 'space', title: 'Файлы сервера: на диске кончилось место', cause: 'ENOSPC: no space left on device. Слово write рядом это просто название операции.', fix: ['Освободить место или выбрать другой диск в настройках лаунчера.'] };
    if (/expected .* got/.test(t)) return { key: 'bad', title: 'Файлы сервера: файл скачался повреждённым', cause: 'В message указано expected ..., got ...: контрольная сумма не совпала.', fix: ['Перекачать файлы сервера (очистить кеш и перепроверить).'] };
    if (/fetch failed/.test(t)) return { key: 'net', title: 'Файлы сервера: загрузка оборвалась', cause: 'fetch failed: соединение прервалось во время скачивания.', fix: ['Проверить сеть, VPN и фаервол.'] };
    return null;
  },
  cause: 'Файлы сервера не скачались или не записались на диск. Причину говорит message: ENOSPC (нет места), expected..got (файл повреждён), fetch failed (обрыв загрузки).',
  fix: ['Смотреть message и действовать по причине.'], tpl: [TPL_RES] });

R({ id: 'm-disk', kind: 'main', kw: "reason: 'disk-space'", re: /reason:\s*'disk-space'/, sev: 'crit', src: 'guide',
  title: 'Недостаточно места на диске',
  detail: function (m, t) { return msgOf(t); },
  cause: 'Лаунчер сам пишет, сколько нужно и сколько свободно. Освобождать надо с запасом.',
  fix: ['Освободить место на диске с игрой или выбрать другой диск в настройках.'] });

R({ id: 'm-timeout', kind: 'main', kw: 'imeout', re: /reason:\s*'timeout'|patcher: timeout — killing worker/, sev: 'crit', src: 'guide',
  title: 'Вечная загрузка: запуск прерван по таймауту (3 минуты)',
  cause: 'Лаунчер ждал не интернет, а игру. По «Играть» он сам поднимает платформу (Rockstar Games Launcher, Steam или Epic). Если платформа не поднялась, он ждёт процесс, которого нет, и через 3 минуты сдаётся. Частая причина: не хватает прав запустить платформу, либо она висит в фоне в сломанном виде.',
  fix: ['Уточнить у игрока: что появляется на экране после «Играть», открывается ли платформа, запускается ли она сама без Majestic, меняется ли результат если открыть платформу заранее.',
    'Снять галку «Запускать от имени администратора» у платформы и у GTA5.exe (лаунчер работает без прав администратора и не может запустить такое приложение).',
    'Закрыть зависшие процессы платформы через диспетчер задач и повторить запуск. Если платформа не открывается сама по себе, чинить надо её, а не Majestic.'] });

R({ id: 'm-busy', kind: 'main', kw: 'ERR_FAILED_TO_PATCH_LAUNCHER', re: /ERR_FAILED_TO_PATCH_LAUNCHER|Launcher patches failed/, sev: 'crit', src: 'guide',
  title: 'Патчер не смог изменить Rockstar Games Launcher',
  cause: 'Обычно Rockstar Launcher уже запущен, висит в фоне в сломанном виде, или патчеру не хватает прав до него дотянуться.',
  fix: ['Закрыть через диспетчер задач Rockstar Games Launcher, RockstarService.exe, GTA5.exe и SocialClubHelper.exe, затем запустить Majestic от администратора.',
    'Уточнить: запускается ли Rockstar Launcher сам без Majestic, заходит ли игрок в обычную GTA V Online. Если нет, проблема в самом Rockstar Launcher, нужна его переустановка.',
    'Проверить, нет ли галки «Запускать от имени администратора» у Rockstar Launcher или GTA5.exe.'],
  tpl: ['Ошибка инициализации данных / RGL', TPL_INJ] });

R({ id: 'm-inject', kind: 'main', kw: 'ERR_FAILED_TO_INJECT', re: /ERR_FAILED_TO_INJECT/, sev: 'crit', src: 'guide',
  title: 'Клиент Majestic не смог встроиться в игру (injection)',
  cause: 'Rockstar Launcher пропатчился, а клиент не встроился в GTA V. Почти всегда мешает антивирус или защита памяти. Игра не откроется или мелькнёт окном и закроется.',
  fix: ['Добавить папки игры и лаунчера в исключения антивируса и Defender.', 'Отключить сторонние защиты памяти, запустить от администратора.'], tpl: [TPL_INJ] });

R({ id: 'm-sac', kind: 'main', kw: ['Failed to get handle', 'ReadProcessMemory'], re: /Failed to get handle:\s*299|ReadProcessMemory или WriteProcessMemory был выполнен только частично|Only part of a ReadProcessMemory or WriteProcessMemory request was completed/i, sev: 'crit', top: true, src: 'guide',
  title: 'Smart App Control блокирует доступ к памяти игры',
  cause: 'Ошибка 299 (ReadProcessMemory/WriteProcessMemory выполнен частично) рядом с ERR_FAILED_TO_INJECT означает «Интеллектуальное управление приложениями» в Windows 11.',
  fix: ['Параметры → Конфиденциальность и защита → Безопасность Windows → Управление приложениями и браузером → Параметры службы: Интеллектуальное управление приложениями → «Отключено».', 'Предупредить игрока: включить обратно можно только переустановкой Windows.'], tpl: [TPL_INJ] });

/* commandline.txt — файл параметров запуска GTA, а не мод: патчер его замечает, но сам по себе запуск он обычно не ломает.
   Чаще всего остаётся от графических сборок (Redux и похожих). Отдельное правило стоит раньше «мода», чтобы не путать. */
R({ id: 'm-cmdline', kind: 'main', kw: 'commandline', re: /Detected commandline\.txt but not disabled/i, sev: 'warn', src: 'team',
  title: 'В папке игры лежит commandline.txt (это не мод)',
  detail: function (m, t) { var p = /\(([A-Za-z]:\\[^)]+)\)/.exec(t); return p ? p[1] : ''; },
  cause: 'commandline.txt — файл с параметрами запуска GTA V. Это не мод вроде ReShade, ENB или OpenIV, и сам по себе запуск он обычно не останавливает. Чаще всего он остаётся после графической сборки (Redux и похожих) или его создают вручную; лишние параметры в нём могут мешать запуску и графике.',
  fix: ['Удалить commandline.txt из папки игры (или перенести в папку модификаций лаунчера, если параметры нужны).',
    'Если ставился Redux или другая графическая сборка: удалить её полностью и проверить файлы игры (Steam / Epic / Rockstar Launcher → «Проверить файлы»).',
    'Настоящие моды, которые нужно убирать из папки игры: ReShade (dxgi.dll, d3d11.dll, reshade-shaders), ENB (enbseries, d3d11.dll), OpenIV (папка mods, OpenIV.asi), ASI-загрузчики (dinput8.dll).'] });

R({ id: 'm-blockmod', kind: 'main', kw: 'MAJESTIC:', re: /Detected (.+?) but not disabled|Found blocking mod/, sev: 'crit', top: true, src: 'guide',
  title: 'МОД В ПАПКЕ ИГРЫ: главная причина крашей и незапуска',
  detail: function (m, t) {
    var p = /\(([A-Za-z]:\\[^)]+)\)/.exec(t); if (p) return p[1];
    var f = /Found blocking mod:?\s*(?:Delete file from game directory\s*)?([^⏎]*)/.exec(t); return f ? f[1].trim().slice(0, 140) : '';
  },
  cause: 'Патчер нашёл файл мода (OpenIV, ReShade, ENB) в корне папки игры. Моды разрешены только в папке модификаций лаунчера. Сама строка Detected… not disabled не значит, что запуск остановлен; отказ именно на этом шаге подтверждает строка Found blocking mod с именем файла.',
  fix: ['Отправить шаблон «Решение проблемы с ReShade / ENB / Commandline»: перенести dxgi.dll, dinput8.dll, d3d11.dll, commandline.txt и папку ReShade в папку модификаций лаунчера.',
    'Если файлы уже в папке модификаций, а проблема осталась: битый мод или не та версия. Сторонние сборки (Redux, NaturalVision) совместимость не гарантируют.',
    'Проверить папку игры: если в логе source: rockstar, а папка называется не Grand Theft Auto V Legacy (GTA MODES, GTAV), это копия игры под моды. Копию нужно удалить, путь указать на настоящую установку.'],
  tpl: ['Решение проблемы с ReShade / ENB / Commandline', 'Проблемы с модами Majestic', TPL_MODS] });

/* ERR_FAILED_TO_LAUNCH_PLATFORM: на практике лечится переустановкой платформы поверх (Steam, Rockstar Games Launcher, Epic) — подтверждено саппортом */
R({ id: 'm-platform', kind: 'main', kw: 'ERR_FAILED_TO_LAUNCH_PLATFORM', re: /ERR_FAILED_TO_LAUNCH_PLATFORM/, sev: 'crit', top: true, src: 'team',
  title: 'Лаунчер не смог запустить платформу игры (ERR_FAILED_TO_LAUNCH_PLATFORM)',
  cause: 'Majestic не смог запустить платформу, на которой куплена игра: Steam, Rockstar Games Launcher (RGL) или Epic Games. Почти всегда повреждена установка самой платформы. Решение — переустановить платформу поверх текущей: игра и библиотека при этом не удаляются.',
  fix: ['Переустановить платформу поверх, ничего не удаляя: скачать установщик с официального сайта и установить в ту же папку. Steam — store.steampowered.com/about; Rockstar Games Launcher — rockstargames.com/downloads; Epic Games — store.epicgames.com/download. Игра и библиотека останутся.',
    'После установки перезагрузить компьютер, открыть платформу один раз самостоятельно (войти в аккаунт, дождаться обновлений), затем запускать игру через Majestic.',
    'Если не помогло: снять «Запускать от имени администратора» у платформы и у GTA5.exe, закрыть зависшие процессы платформы в диспетчере задач и повторить.'] });

R({ id: 'm-patchmod', kind: 'main', kw: ['majestic-patcher.node', 'specified module could not be found'], re: /majestic-patcher\.node|The specified module could not be found/, sev: 'crit', src: 'infer',
  title: 'Не найден модуль патчера (majestic-patcher.node)',
  cause: 'Windows сообщает, что файл majestic-patcher.node (или его зависимость) не найден. В руководстве такой ошибки нет. Обычно файл удалил или заблокировал антивирус, либо установка лаунчера неполная или повреждена; запуск при этом не доходит до игры.',
  fix: ['Добавить папку лаунчера (AppData\\Local\\MajesticLauncher*) в исключения антивируса и Defender, проверить карантин антивируса.', 'Переустановить лаунчер (удалить папку лаунчера и поставить заново с сайта).', 'Если не помогло: передать main.log дальше, готового решения в руководстве нет.'], tpl: [TPL_INJ] });

R({ id: 'm-patcherr', kind: 'main', kw: "reason: 'patcher-error'", re: /reason:\s*'patcher-error'/, sev: 'crit', src: 'guide',
  title: 'Запуск завершился ошибкой патчера (patcher-error)',
  detail: function (m, t) { return msgOf(t); },
  refine: function (m, t) {
    if (/ERR_GAME_CRASHED/.test(t)) return { key: 'crash', title: 'GTA V стартовала и упала на этапе патчера (ERR_GAME_CRASHED)',
      cause: 'Игра успела запуститься и завершилась. Сначала ищите выше строку Found blocking mod: она называет конкретный файл мода в папке игры. Если её нет, это реальный краш GTA V.',
      fix: ['Если есть Found blocking mod: удалить мод или перенести в папку модификаций лаунчера.',
        'Если нет: попросить client.log той же попытки и проверить моды, целостность файлов, settings.xml и драйвер видеокарты.',
        'Если в client.log есть MINIDUMP, разбирать по инструкции (Last loaded asset, Last pos). Дамп лежит в %appdata%\\majestic-launcher\\Multiplayer\\crashdumps.'] };
    return null;
  },
  cause: 'Итог запуска при сбое патчера. Конкретный код лежит в поле message, его нужно искать по руководству.',
  fix: ['Прочитать message и найти код в руководстве.'], tpl: [TPL_INJ] });

R({ id: 'm-patchcrash', kind: 'main', kw: 'ERR_PATCHER_CRASH', re: /ERR_PATCHER_CRASH|worker exited without result/, sev: 'err', src: 'infer',
  title: 'Процесс патчера завершился без результата (ERR_PATCHER_CRASH)',
  cause: 'Такого кода в руководстве нет. По логу видно, что процесс патчера закрылся сам (код выхода 0) и не вернул итог, запуск при этом отменён. Возможные причины: антивирус или защита убила процесс, сбой Rockstar Launcher во время патча.',
  fix: ['Закрыть процессы Rockstar (Rockstar Games Launcher, RockstarService.exe, SocialClubHelper.exe, GTA5.exe), запустить Majestic от администратора.', 'Добавить папки игры и лаунчера в исключения антивируса.', 'При повторении собрать majestic-patcher.log и main.log и передать дальше: по руководству готового решения для этого кода нет.'], tpl: [TPL_INJ] });

R({ id: 'm-crashdet', kind: 'main', kw: 'crash detected', re: /crashService: crash detected[^]*?internalError:\s*'([^']*)'/, sev: 'err', src: 'guide', loopAt: 3,
  title: 'Лаунчер зафиксировал краш игры',
  detail: function (m) { return m[1]; },
  refine: function (m) {
    var c = m[1];
    if (!c) return { key: 'nocode', title: 'Краш игры без кода ошибки', cause: 'Игра упала, а код ERR_… не определён (в client.log такой краш виден как MINIDUMP без строки ERR_). По руководству диагноз по коду поставить нельзя: нужна базовая диагностика и, если вылет повторяется, дамп.', fix: ['Проверить, нет ли Found blocking mod в этой же попытке (мод в корне игры).', 'Базовая диагностика: целостность файлов GTA V, настройки settings.xml, драйвер видеокарты, убрать моды, антивирус.', 'Запросить client.log той же попытки: Last loaded asset, Last pos. Дамп: %appdata%\\majestic-launcher\\Multiplayer\\crashdumps.'], tpl: [TPL_INJ] };
    if (c === 'ERR_SYS_FILELOAD') return { key: c, title: 'Краш игры: код ERR_SYS_FILELOAD причину не называет', rt: 'игра вылетает после запуска', cause: 'Игра упала, а лаунчер записал последний код из client.log: ERR_SYS_FILELOAD. Сам по себе он фоновый (Missing rpf перехватывается клиентом), поэтому настоящую причину ищите в client.log этой попытки перед завершением: Last loaded asset, MINIDUMP, оверлеи, ошибки стримера.', fix: ['Открыть client.log и найти строки перед «MINIDUMP» или «Shutting down»: Last loaded asset, Texture info, ошибки скриптов.', 'Если в client.log причины нет, запросить у игрока свежий лог сразу после вылета.'] };
    if (/^ERR_GEN_ZLIB/.test(c)) return { key: c, title: 'Краш игры: ' + c + ' (повреждены данные)', cause: 'Ошибка вызова zlib: данные игры повреждены. Смотрите client.log: Error on asset reading покажет, чей файл.', fix: ['GTA V: проверить целостность файлов. Majestic: очистить кеш и перепроверить файлы.'], tpl: [TPL_RES] };
    if (c === 'ERR_GFX_D3D_INIT') return { key: c, title: 'Краш игры: ERR_GFX_D3D_INIT (графика)', cause: 'Отвалилась графика: моды, драйвер видеокарты, DirectX.', fix: ['Обновить драйвер видеокарты, убрать графические моды, сбросить settings.xml, проверить файлы игры.'], tpl: ['Ошибка при инициализации (ERR_GFX_D3D_INIT)', TPL_MODS] };
    var di = errInfo(c); if (di) return { key: c, src: 'web', title: 'Краш игры: ' + c + ' (' + di.t + ')', cause: di.cause + ' Лаунчер зафиксировал краш с этим кодом и включил самовосстановление ресурсов (needResourceCheck). Подробности: client.log той же попытки.', fix: di.fix };
    return { key: c, title: 'Краш игры: ' + c + ' (в руководстве не описан)', cause: 'Лаунчер зафиксировал краш с кодом ' + c + '. В руководстве такого кода нет. Если в client.log рядом сообщение «Игровые данные повреждены», по смыслу это порча данных (как ZLIB / FILELOAD), иначе искать код по тексту Error message.', fix: ['Открыть client.log той же попытки: Error message, MINIDUMP, Last loaded asset.', 'Базовая диагностика: проверить целостность файлов GTA V, очистить кеш Majestic, убрать моды, обновить драйвер.', 'Не помогло: передать client.log, main.log и дамп из %appdata%\\majestic-launcher\\Multiplayer\\crashdumps.'] };
  },
  cause: 'crashService увидел падение игры и включил самовосстановление (needResourceCheck): при следующем запуске лаунчер перепроверит ресурсы. Код в internalError такой же, как в client.log.',
  fix: ['Открыть client.log той же попытки и искать этот код ERR_… по разбору client.log.'] });

R({ id: 'm-net', kind: 'main', kw: ['http ← failed', 'api base probe failed', 'updater check failed', 'masterlist refresh failed', 'http failover', 'news:list fail', 'user fetch after restore failed', 'hostingAuthPing: failed'],
  re: /http ← failed|api base probe failed|updater check failed|masterlist refresh failed|http failover|ipc news:list fail|user fetch after restore failed|hostingAuthPing: failed/, sev: 'warn', src: 'guide',
  title: 'Нет связи с серверами Majestic',
  detail: function (m, t) { var c = /cause:\s*'([^']*)'|code:\s*'([^']*)'|message:\s*'([^']*)'/.exec(t); return c ? (c[1] || c[2] || c[3]) : ''; },
  cause: 'Запросы к api.majestic-files.net / .com не доходят (ENOTFOUND значит, что имя сервера не разрешилось, то есть DNS; TIMEOUT значит, что ответа нет). Обычно виноваты провайдер, VPN или DNS.',
  fix: ['Проверить интернет, VPN и DNS (при необходимости сменить DNS на 8.8.8.8 / 1.1.1.1).', 'Отключить прокси и фаервол, повторить запуск.'], tpl: [TPL_NET] });

R({ id: 'm-dl', kind: 'main', kw: 'download: retrying file', re: /download: retrying file/, sev: 'info', warnAt: 20, src: 'infer',
  title: 'Повторные попытки скачать файл с другого хоста',
  detail: function (m, t) { return (/error:\s*'([^']*)'/.exec(t) || [])[1] || ''; },
  cause: 'Лаунчер переключается на запасной хост, когда загрузка обрывается (terminated, fetch failed). Единичные повторы нормальны; десятки означают нестабильную сеть или блокировку CDN.',
  fix: ['Если повторов много и загрузка не завершается: проверить сеть, VPN, фаервол.'], tpl: [TPL_RES] });

R({ id: 'm-auth401', kind: 'main', kw: 'auth:login fail', re: /auth:login fail[^]*?(?:401|Invalid credentials)/, sev: 'warn', src: 'infer',
  title: 'Вход в аккаунт отклонён (HTTP 401, Invalid credentials)',
  cause: 'Сервер ответил 401 с кодом 4023: неверный логин или пароль. К запуску игры это отношения не имеет, но игрок не сможет войти в лаунчер.',
  fix: ['Попросить проверить логин и пароль (раскладка, Caps Lock), пройти капчу заново.', 'Если пароль забыт: восстановление через сайт.'] });

R({ id: 'm-rendauth', kind: 'main', kw: 'renderer load failed', re: /renderer load failed[^]*?role:\s*'(\w+)'/, sev: 'warn', src: 'infer',
  title: 'Не загрузилось окно лаунчера (renderer load failed)',
  detail: function (m, t) { var c = /errorCode:\s*(-?\d+)/.exec(t); return 'role ' + m[1] + (c ? ', errorCode ' + c[1] : ''); },
  cause: 'Встроенный браузер лаунчера не смог загрузить страницу (role auth: окно входа с проверкой Cloudflare Turnstile). errorCode -3 значит, что загрузка прервана. Обычно сеть, VPN или блокировка challenges.cloudflare.com.',
  fix: ['Проверить сеть, VPN, DNS, перезапустить лаунчер.'], tpl: [TPL_NET] });

R({ id: 'm-gpu', kind: 'main', kw: ['crash captured', 'renderer crashed'], re: /renderer crashed|renderer gone|crash captured[^]*?child process (\w+) gone: (\w+)/, sev: 'warn', src: 'infer',
  title: 'Упал внутренний процесс интерфейса лаунчера',
  detail: function (m, t) { var c = /child process (\w+) gone: (\w+)/.exec(t); return c ? c[1] + ' ' + c[2] : (/reason:\s*'(\w+)'/.exec(t) || [])[1] || ''; },
  cause: 'Сам лаунчер (не игра) потерял процесс GPU или Utility. Это окно интерфейса, оно не влияет на GTA V напрямую. Чаще всего драйвер видеокарты, нехватка памяти или стороннее ПО поверх окон.',
  fix: ['Обновить драйвер видеокарты, перезапустить лаунчер.', 'Закрыть программы с оверлеями и записью экрана.'] });

R({ id: 'm-cancel', kind: 'main', kw: 'game.play cancelled', re: /game\.play cancelled during (\S+)/, sev: 'info', src: 'guide',
  title: 'Запуск отменён',
  detail: function (m) { return 'на стадии ' + m[1]; },
  cause: 'Есть game.play cancelled, значит всё, что ниже, ломается закономерно: оборванные загрузки, «процесс убит», нет shutdown complete. Это следы отмены, а не ошибка запуска. Если рядом ERR_PATCHER_CRASH, отмена вызвана сбоем патчера.',
  fix: ['Попросить повторить запуск и не прерывать его.'] });

R({ id: 'm-ok1', kind: 'main', kw: 'while game is alive', re: /while game is alive/, sev: 'ok', src: 'guide',
  title: 'GTA V запущена (подтверждение)', cause: 'Строка while game is alive лучшее доказательство, что игра стартовала.', fix: [] });
R({ id: 'm-ok2', kind: 'main', kw: 'pipeline completed', re: /pipeline completed \{ success: true/, sev: 'ok', src: 'guide',
  title: 'Патчер отработал успешно', cause: 'Патч Rockstar Launcher и внедрение клиента прошли.', fix: [] });

R({ id: 'm-n1', kind: 'main', kw: 'killGameProcesses: kill failed', re: /killGameProcesses: kill failed/, sev: 'noise', src: 'obs',
  title: 'taskkill: процесса нет (не ошибка)', cause: 'Лаунчер перед запуском пытается закрыть процессы Rockstar. Сообщение «There is no running instance of the task» значит, что закрывать было нечего.', fix: [] });
R({ id: 'm-n2', kind: 'main', kw: 'saved state malformed', re: /windowState: saved state malformed/, sev: 'noise', src: 'obs',
  title: 'Сохранённое состояние окна повреждено (игнорируется)', cause: 'Лаунчер сам игнорирует этот файл. На запуск не влияет.', fix: [] });
R({ id: 'm-n3', kind: 'main', kw: 'transitionAuthToMain', re: /transitionAuthToMain: main window already open/, sev: 'noise', src: 'obs',
  title: 'Главное окно уже открыто (no-op)', cause: 'Служебное сообщение о переходе между окнами.', fix: [] });
R({ id: 'm-n4', kind: 'main', kw: 'crashService: -crash', re: /crashService: -crash без crashinfo\.log|crashService: no crashinfo\.log|crashinfo\.log unparseable/, sev: 'noise', src: 'obs',
  title: 'crashService: нет crashinfo.log', cause: 'Служебная запись о проверке падений. Без других признаков краша ничего не значит.', fix: [] });


R({ id: 'm-gfxinject', kind: 'main', kw: 'graphics mod DLL', re: /Failed to inject\s+graphics mod DLL:\s*(0x[0-9a-fA-F]+|\d+)/, sev: 'err', src: 'web',
  title: 'Не встроился графический мод (ReShade / ENB)',
  detail: function (m) { return 'код ' + m[1]; },
  cause: 'Патчер не смог подгрузить DLL графического мода в игру. Код 0x12b (299) значит «WriteProcessMemory выполнен частично»: запись в память игры блокирует антивирус, защита памяти или Smart App Control. Игра при этом может запуститься без мода или вылететь.',
  fix: ['Добавить папки игры и лаунчера в исключения антивируса и Defender, отключить сторонние защиты памяти.', 'Windows 11: проверить «Интеллектуальное управление приложениями» (Smart App Control), если включено, оно блокирует встраивание.', 'Временно убрать графический мод из списка модов лаунчера и проверить, запускается ли игра без него.', 'Моды ReShade / ENB хранить только в папке модификаций лаунчера, не в корне игры.'], tpl: [TPL_INJ, TPL_MODS] });

R({ id: 'm-handle6', kind: 'main', kw: 'Failed to get handle', re: /Failed to get handle:\s*6\b/, sev: 'err', src: 'web',
  title: 'Патчер потерял процесс игры (Failed to get handle: 6)',
  cause: 'Ошибка 6 (неверный дескриптор): патчер не смог открыть процесс GTA V. Чаще всего игра успела закрыться или упасть раньше встраивания, либо доступ к процессу закрыт антивирусом или правами. Это не то же самое, что ошибка 299 (Smart App Control).',
  fix: ['Закрыть через диспетчер задач Rockstar Games Launcher, RockstarService.exe, SocialClubHelper.exe и GTA5.exe, запустить Majestic от администратора.', 'Добавить папки игры и лаунчера в исключения антивируса, снять галку «Запускать от имени администратора» у Rockstar Launcher и GTA5.exe.', 'Проверить, запускается ли обычная GTA V Online через Rockstar без Majestic. Если нет, чинить надо Rockstar Games Launcher.'], tpl: [TPL_INJ] });

R({ id: 'm-permfail', kind: 'main', kw: 'wrote permissions files', re: /wrote permissions files[^}]*failed:\s*([1-9]\d*)/, sev: 'err', src: 'web',
  title: 'Лаунчер не смог записать файлы прав',
  detail: function (m) { return 'не записано: ' + m[1]; },
  cause: 'Строка game.play: wrote permissions files показывает failed больше нуля: часть файлов лаунчер записать не смог. Обычно это отсутствие прав на папку игры или кеша.',
  fix: ['Нажать «Починить доступ к папкам» в настройках лаунчера и запустить его от администратора.', 'Если не помогает: выдать полный доступ папкам Majestic по инструкции из шаблона про права доступа.'] });

R({ id: 'm-http5xx', kind: 'main', kw: 'non-2xx', re: /http ← non-2xx[^]*?url:\s*'([^']*)'[^]*?status:\s*(5\d\d|429|403|451)\b(?![^]*?Login confirmation)/, sev: 'warn', src: 'web',
  title: 'Сервер Majestic ответил ошибкой',
  detail: function (m) { return m[2] + ' ' + m[1].replace(/\?.*$/, '').replace(/^https?:\/\//, ''); },
  refine: function (m) {
    var c = m[2];
    if (c === '429') return { key: c, title: 'Сервер Majestic ограничил частоту запросов (429)', cause: 'Слишком много запросов с одного адреса за короткое время. Бывает при частых перезапусках лаунчера или общем адресе (VPN, офисная сеть).', fix: ['Подождать несколько минут, не перезапуская лаунчер.', 'Отключить VPN или сменить его сервер.'] };
    if (c === '403' || c === '451') return { key: c, title: 'Сервер Majestic закрыл доступ (' + c + ')', cause: 'Запрос отклонён: чаще всего блокировка по IP, региону или VPN, реже ограничение аккаунта.', fix: ['Проверить, не включён ли VPN, и повторить без него (или с другим сервером).', 'Если без VPN то же самое: проверить, нет ли ограничений на аккаунт.'] };
    return { key: '5xx', title: 'Сбой на стороне серверов Majestic (' + c + ')', cause: 'Сервис ответил внутренней ошибкой. У игрока это не чинится, обычно проходит само.', fix: ['Подождать и повторить запуск через несколько минут.', 'Если жалоб много: проверить сообщения о технических работах и сообщить дальше.'] };
  },
  cause: 'Сервер вернул код ошибки.', fix: ['Повторить запуск через несколько минут.'] });

R({ id: 'm-2fa', kind: 'main', kw: 'Login confirmation', re: /Login confirmation code required|"error":4012/, sev: 'info', src: 'web',
  title: 'Вход требует код подтверждения с почты',
  cause: 'Сервер просит код подтверждения входа (отправляется на привязанную почту). Это штатный шаг, а не поломка. Если игрок «не может войти», стоит узнать, дошёл ли код: проверить папку «Спам» и правильность привязанной почты.',
  fix: ['Попросить игрока проверить почту, включая «Спам», и ввести код.', 'Если код не приходит: повторить запрос позже, не запрашивать его много раз подряд.'] });

R({ id: 'm-n5', kind: 'main', kw: 'hash mismatch', re: /download: (?:version mismatch with )?hash mismatch/, sev: 'noise', src: 'obs',
  title: 'Ресурс обновился, лаунчер перекачивает файл (норма)', cause: 'Строки «hash mismatch — re-downloading» появляются при каждом обновлении ресурсов сервера, их тысячи в обычных логах. Проблемой они становятся только вместе с оборванной загрузкой (fetch failed, ENOSPC) или повторяющимся отказом запуска.', fix: [] });

R({ id: 'm-n6', kind: 'main', kw: 'reg query', re: /winRegistry: reg query failed|Command failed: reg query|unable to find the specified registry/, sev: 'noise', src: 'obs',
  title: 'Реестр: нужного ключа нет (норма)', cause: 'Лаунчер проверяет необязательные ключи реестра. Отсутствие ключа ни о чём не говорит.', fix: [] });

R({ id: 'm-n7', kind: 'main', kw: ['crashBundler', 'cleanup unlink failed', 'scan already in flight'], re: /crashBundler: optional source missing|crashService: cleanup unlink failed|crashService: scan already in flight|crash captured \(noop reporter\)/, sev: 'noise', src: 'obs',
  title: 'Служебные записи о краш-отчётах (норма)', cause: 'Лаунчер собирает необязательные файлы краш-отчёта и убирает за собой. Отсутствие lastnodes.bin или patcher.log не ошибка.', fix: [] });

R({ id: 'm-n8', kind: 'main', kw: 'token/verify', re: /token\/verify[^]*?status:\s*401/, sev: 'noise', src: 'obs',
  title: 'Сессия устарела при запуске (норма)', cause: 'Лаунчер проверил сохранённый токен, а он просрочен. Дальше он просит войти заново. Само по себе не поломка.', fix: [] });

R({ id: 'm-n9', kind: 'main', kw: ['Mod directory not found', 'from mod list', 'Swiper Loop', 'OTS parsing', 'AudioContext encountered'], re: /Mod directory not found|Removed \S+ from mod list|Swiper Loop Warning|OTS parsing error|AudioContext encountered an error/, sev: 'noise', src: 'obs',
  title: 'Необязательные служебные сообщения (норма)', cause: 'Папки модов нет, нечего убирать из списка модов или интерфейс лаунчера выдал предупреждение. На запуск не влияет.', fix: [] });

R({ id: 'm-clrfail', kind: 'main', kw: 'target not removed', re: /maintenance\.clearCache: target not removed[^]*?target:\s*'((?:[^'\\]|\\.)*)'[^]*?error:\s*"?'?(E[A-Z]+)[^]*?unlink\s+'?\\?'?((?:[^'"\\]|\\\\|\\.)*)/, sev: 'warn', src: 'web',
  title: 'Очистка кеша: часть файлов не удалилась',
  detail: function (m) { return m[2] + ': ' + m[1].split(/\\+/).slice(-2).join('\\'); },
  refine: function (m) {
    var code = m[2], tgt = m[1];
    if (code === 'EBUSY') return { key: 'busy', sev: 'noise', title: 'Очистка кеша: файл занят другим процессом (EBUSY, норма)', cause: 'Файл (чаще всего лог cef.log в папке logs) открыт самим лаунчером или игрой, поэтому Windows не даёт его удалить. Сам кеш при этом очищен, на работу это не влияет.', fix: [] };
    if (code === 'EPERM' || code === 'EACCES') return { key: 'perm', title: 'Очистка кеша: нет прав на удаление файла (' + code + ')', cause: 'Windows или антивирус запретили удалить файл (в логе, например, steam_api64.dll из папки Multiplayer\\backup). Один такой файл не страшен. Если же после очистки игра по-прежнему падает с ERR_SYS_FILELOAD или ERR_FIL_PACK, значит у лаунчера нет прав на свою папку или файлы блокирует защита.', fix: ['Нажать «Починить доступ к папкам» в настройках лаунчера и запустить лаунчер от имени администратора.', 'Закрыть игру, Steam / Epic / Rockstar Launcher и повторить «Очистить кеш».', 'Добавить папки игры и лаунчера (AppData\\Roaming\\majestic-launcher) в исключения антивируса и Defender.'] };
    return { key: code, title: 'Очистка кеша: файл не удалён (' + code + ')', cause: 'Лаунчер не смог удалить файл при очистке кеша, код ' + code + '.', fix: ['Закрыть игру и лаунчер, повторить очистку; при повторении проверить права и антивирус.'] };
  },
  cause: 'Файл при очистке кеша не удалился.', fix: ['Повторить очистку при закрытой игре.'] });

R({ id: 'm-maint', kind: 'main', kw: ['clearAssetCache: done', 'clearCache: done', 'permissionsRepair: done'], re: /maintenance\.(clearAssetCache|clearCache): done|permissionsRepair: done/, sev: 'info', src: 'web',
  title: 'Выполнено обслуживание лаунчера',
  detail: function (m) { return m[1] === 'clearAssetCache' ? 'очищен кеш ассетов' : m[1] === 'clearCache' ? 'очищен кеш Multiplayer' : 'починены права доступа'; },
  refine: function (m) { var k = m[1] || 'perm'; return { key: k, title: k === 'clearAssetCache' ? 'Игрок очистил кеш ассетов' : k === 'clearCache' ? 'Игрок очистил кеш Multiplayer' : 'Игрок запустил «Починить доступ к папкам»', cause: k === 'perm' ? 'Лаунчер перенастроил права на папки игры и Multiplayer. Это ручное действие из настроек, оно показывает, что игрок уже пробовал лечить проблему.' : 'Ручная очистка из настроек лаунчера. Показывает, что игрок уже пробовал лечить проблему. Сравните время с попытками запуска: помогло ли.', fix: [] }; },
  cause: 'Ручное обслуживание из настроек лаунчера.', fix: [] });

R({ id: 'm-n10', kind: 'main', kw: 'wrote permissions files', re: /wrote permissions files[^}]*failed:\s*0/, sev: 'noise', src: 'obs',
  title: 'Файлы прав записаны без ошибок (норма)', cause: 'Лаунчер записал файлы прав, ошибок нет (failed: 0).', fix: [] });

R({ id: 'm-tokverify', kind: 'main', kw: 'non-2xx', re: /http ← non-2xx[^]*?id\/token\/(?:verify|login)/, sev: 'info', src: 'obs',
  title: 'Сервер отклонил запрос авторизации (401/403)', cause: 'Проверка сохранённого токена (verify) или вход (login) вернули 401/403: сессия устарела, пароль неверный или нужен код подтверждения. На запуск игры напрямую не влияет, но игрок может не войти в лаунчер.', fix: ['Если игрок не может войти: выйти из аккаунта в лаунчере и войти снова, проверить пароль и код подтверждения из почты.'] });

R({ id: 'm-ipcnet', kind: 'main', kw: ['auth:get-current-user fail', 'masterlist:refresh fail'], re: /ipc (?:auth:get-current-user|masterlist:refresh) fail[^]*?(?:Network unreachable|ENOTFOUND|NETWORK)/, sev: 'warn', src: 'infer',
  title: 'Лаунчер не достучался до серверов (сеть недоступна)', cause: 'Запросы лаунчера к серверам Majestic завершились ошибкой NETWORK / ENOTFOUND: нет интернета или не разрешается DNS-имя.',
  fix: ['Проверить интернет, отключить VPN и прокси, сменить DNS (например 8.8.8.8 и 1.1.1.1).', 'Проверить, что антивирус или фаервол не блокируют лаунчер.'] });

R({ id: 'm-n13', kind: 'main', kw: ['Main URL is not available', 'disableWebInstaller', '[CLIENT MODS]', 'Crashdump does not exist', 'media-proxy: upstream', 'ERR_CANCELED', 'asset-cache: upstream fetch failed', 'http ← unparseable', 'crash captured (noop reporter)', 'existing file hash failed'], re: /asset-cache: upstream fetch failed|http ← unparseable|crash captured \(noop reporter\)|download: existing file hash failed|\[URL\] Main URL is not available, using mirror|disableWebInstaller is set|\[CLIENT MODS\] Checking installed mods|\[CRASH\] Crashdump does not exist|media-proxy: upstream fetch failed|API Error: Network error \| Code: ERR_CANCELED/, sev: 'noise', warnAt: 100, src: 'infer',
  title: 'Служебные сообщения лаунчера (основной адрес недоступен, берётся зеркало)', cause: 'Лаунчер переключился на зеркало загрузки, отменил запрос или сообщил, что дампа нет. Единицы строк норма. Сотни «Main URL is not available» значат, что у игрока плохо открывается основной CDN (провайдер, VPN, DNS).', fix: ['Если строк сотни: сменить DNS (1.1.1.1 / 8.8.8.8), отключить VPN, проверить антивирус и брандмауэр.'] });

R({ id: 'm-ssl', kind: 'main', kw: ['ERR_SSL_PROTOCOL_ERROR', 'ERR_CONNECTION_TIMED_OUT', 'ERR_CONNECTION_CLOSED'], re: /net::(ERR_(?:SSL_PROTOCOL_ERROR|CONNECTION_TIMED_OUT|CONNECTION_CLOSED))/, sev: 'warn', warnAt: 2, src: 'obs', loopAt: 5,
  title: 'Лаунчер не смог защищённо подключиться к серверам Majestic',
  detail: function (m) { return m[1]; },
  cause: 'Обрыв или подмена защищённого соединения (SSL): VPN или прокси, антивирус с проверкой HTTPS, неверные дата и время на ПК, блокировка провайдера.',
  fix: ['Проверить дату, время и часовой пояс Windows.', 'Отключить VPN, прокси и проверку HTTPS в антивирусе.', 'Сменить DNS на 1.1.1.1 / 8.8.8.8 и повторить.'] });

R({ id: 'm-n14', kind: 'main', kw: 'Cannot download differentially', re: /Cannot download differentially, fallback to full download/, sev: 'noise', warnAt: 20, src: 'obs',
  title: 'Разностная загрузка не сработала, лаунчер качает файл целиком', cause: 'Контрольная сумма не совпала, лаунчер скачал полный файл. Само по себе безопасно, лишь замедляет обновление.', fix: [] });

R({ id: 'm-stall', kind: 'main', kw: 'Download stalled', re: /Download stalled[^]*?Restarting for URL: (\S+)/, sev: 'warn', warnAt: 3, src: 'obs',
  title: 'Загрузка файла зависает и перезапускается',
  detail: function (m) { return m[1].replace(/[?#].*$/, '').slice(0, 90); },
  cause: 'Лаунчер не получал данные и перезапускал скачивание. Единичные случаи норма; если повторяются, у игрока нестабильное или медленное соединение либо CDN режется провайдером, VPN или антивирусом.',
  fix: ['Отключить VPN, проверить скорость и стабильность интернета.', 'Сменить DNS на 1.1.1.1 / 8.8.8.8, по возможности подключиться по кабелю.', 'Добавить лаунчер в исключения антивируса и брандмауэра.'] });

R({ id: 'm-broken', kind: 'main', kw: 'broken file access detected', re: /broken file access detected[^]*?broken:\s*\[([^\]]*)\]/, sev: 'crit', src: 'obs', loopAt: 3,
  title: 'Нет доступа к папке игры (EPERM): нужна «починка» прав',
  detail: function (m) { return m[1].replace(/\s+/g, ' ').trim().slice(0, 200); },
  cause: 'Лаунчер обнаружил, что Windows отказывает в доступе к папке игры или её кешу (EPERM) и запросил исправление прав с повышением. Причины: папка игры на защищённом диске или в чужом профиле, «Контролируемый доступ к папкам» Защитника, антивирус, папка создана под другим пользователем.',
  fix: ['Запустить лаунчер от имени администратора и согласиться на запрос UAC при «исправлении прав».', 'Добавить папку игры и %appdata%\\majestic-launcher в исключения антивируса и отключить «Контролируемый доступ к папкам».', 'Если не помогло: перенести игру в папку на другом диске без ограничений (например D:\\Games\\MAJESTIC_GTA).'] });

R({ id: 'm-bkeperm', kind: 'main', kw: 'transient fs error', re: /backup: transient fs error, retrying[^]*?error:\s*"?(EPERM|EBUSY|EACCES)[^\n]*/, sev: 'warn', warnAt: 3, src: 'obs',
  title: 'Файлы резервной копии заблокированы (антивирус или другой процесс)',
  detail: function (m) { return m[1]; },
  cause: 'Лаунчер не смог заменить файл в папке backup: доступ закрыт другим процессом (чаще антивирусом). После нескольких повторов запуск может оборваться с ошибкой бэкапа.',
  fix: ['Добавить %appdata%\\majestic-launcher\\Multiplayer в исключения антивируса.', 'Закрыть Rockstar Games Launcher и GTA5.exe, запустить Majestic от имени администратора.'] });

R({ id: 'm-reg', kind: 'main', kw: 'winRegistry: reg add failed', re: /winRegistry: reg add failed/, sev: 'warn', warnAt: 3, src: 'obs',
  title: 'Лаунчер не может записать значение в реестр Windows',
  cause: 'Команда reg add отклонена: политика безопасности, антивирус или ограниченная учётная запись. Сами по себе строки не мешают запуску, но «последний сервер» не сохранится.',
  fix: ['Запустить лаунчер от имени администратора.', 'Проверить, что антивирус не блокирует reg.exe.'] });

R({ id: 'm-dlclose', kind: 'main', kw: ['Connection closed prematurely', 'stream closed prematurely'], re: /Download error for URL: (\S+)[^]*?Connection closed prematurely|Response stream closed prematurely for URL: (\S+)/, sev: 'warn', warnAt: 2, src: 'obs',
  title: 'Загрузка файла оборвалась на полпути (соединение закрыто)',
  detail: function (m) { return (m[1] || m[2] || '').replace(/[?#].*$/, '').slice(0, 100); },
  cause: 'Сервер или провайдер закрыл соединение до конца скачивания. Единичные обрывы лаунчер переживает повтором; повторяющиеся значат нестабильную сеть, VPN, прокси или блокировку CDN.',
  fix: ['Отключить VPN и прокси, сменить DNS на 1.1.1.1 / 8.8.8.8.', 'Проверить антивирус и брандмауэр, добавить лаунчер в исключения.'] });

R({ id: 'm-modsnet', kind: 'main', kw: ['catalog fetch failed', 'categories fetch failed'], re: /mods: (?:catalog|categories) fetch failed \(all hosts\)/, sev: 'warn', warnAt: 3, src: 'obs',
  title: 'Каталог модификаций не загрузился (все адреса недоступны)',
  cause: 'Лаунчер не смог получить список разрешённых модов ни с основного, ни с зеркальных адресов: у игрока нет связи с серверами Majestic или блокирует сеть. На запуск игры сам по себе не влияет.',
  fix: ['Проверить интернет, отключить VPN и прокси, сменить DNS.'] });

R({ id: 'm-workerexit', kind: 'main', kw: 'worker exited without result', re: /patcher: worker exited without result \{ code: (?!0\b)(-?\d+)/, sev: 'warn', warnAt: 1, src: 'obs',
  title: 'Процесс патчера завершился аварийно',
  detail: function (m) { return 'код ' + m[1]; },
  cause: 'Рабочий процесс патчера упал без результата (ненулевой код выхода). Чаще всего его завершил антивирус или в системе не хватает библиотек (Visual C++).',
  fix: ['Добавить папки лаунчера и GTA V в исключения антивируса.', 'Установить Visual C++ Redistributable (x64) и перезапустить лаунчер.'] });

R({ id: 'm-n15', kind: 'main', kw: ['elevated kill failed', 'Error terminating', 'AUTH UTILS', 'crashUploader', 'crashService: upload failed', 'disk-space pre-check', 'Login confirmation code required', 'ipc auth:', 'backup: primary host failed', 'http ← non-2xx'], re: /killGameProcesses: elevated kill failed|\[GAME PROCESS TOOL\] Error terminating|\[AUTH UTILS\] Failed to get \w+ token, is not present|crashUploader: (?:network error|non-\dxx response)|crashService: upload failed|download: disk-space pre-check failed|ipc auth:[\w-]+ fail|backup: primary host failed, retrying via mirror|http ← non-2xx[^]*?(?:status: 40[13]|Login confirmation|User token invalid)/, sev: 'noise', warnAt: 60, src: 'infer',
  title: 'Служебные предупреждения лаунчера (процесс не найден, вход, выгрузка отчётов)', cause: 'Лаунчер пытался закрыть процесс, которого нет, не нашёл сохранённый токен входа, не смог выгрузить отчёт о крахе или перешёл на зеркало. Единичные строки нормальны. Ошибки входа (auth:login fail) значат неверный пароль или код подтверждения: это не поломка клиента.', fix: [] });

R({ id: 'm-n12', kind: 'main', kw: 'unparseable', re: /crashinfo\.log unparseable/, sev: 'noise', src: 'obs',
  title: 'Служебный файл crashinfo.log не разобран (норма)', cause: 'Лаунчер не смог разобрать старый crashinfo.log и убрал его в архив. Не влияет на запуск.', fix: [] });

R({ id: 'm-n11', kind: 'main', kw: 'worker exited without result', re: /patcher: worker exited without result \{ code: 0 \}/, sev: 'noise', src: 'obs',
  title: 'Патчер остановлен вручную (норма после отмены)', cause: 'Игрок отменил запуск, лаунчер убил процесс патчера: строка про завершение без результата идёт сразу за «cancel — killing worker».', fix: [] });

/* ----- client.log ----- */
R({ id: 'c-fileload', kind: 'client', kw: 'ERR_SYS_FILELOAD', re: /ERR_SYS_FILELOAD/, sev: 'noise', warnAt: 100000, src: 'guide',
  title: 'ERR_SYS_FILELOAD / Missing rpf: фоновый шум (на вылет не влияет)',
  cause: 'Строки «ERR_SYS_FILELOAD, Missing rpf: …» с Callstack перехватываются хуками клиента, игра после них продолжает работу. Разработчикам это известно. Причиной вылета их считать нельзя: ищите настоящий триггер перед падением (Last loaded asset, код исключения, оверлеи, ошибки стримера).', fix: [] });

R({ id: 'c-d3d', kind: 'client', kw: 'ERR_GFX_D3D_INIT', re: /ERR_GFX_D3D_INIT/, sev: 'crit', src: 'guide',
  title: 'ERR_GFX_D3D_INIT: отвалилась графика (чёрный экран или вылет)',
  cause: 'Три причины по частоте: графические модификации (Redux, ReShade, ENB, замененные текстуры), драйвер видеокарты, DirectX. Обычная проверка файлов моды не удаляет, игрок может не знать о них.',
  fix: ['Обновить драйвер видеокарты.', 'Сбросить settings.xml, проверить файлы игры, переустановить DirectX.', 'Если стоят графические моды, сначала убрать их.'], tpl: ['Ошибка при инициализации (ERR_GFX_D3D_INIT)', TPL_MODS] });

R({ id: 'c-zlib', kind: 'client', kw: ['ZLib', 'ERR_GEN_ZLIB'], re: /ERR_GEN_ZLIB\w*|ZLib inflate error/, sev: 'crit', src: 'guide',
  title: 'ZLib / ERR_GEN_ZLIB: повреждены данные',
  cause: 'Игра не смогла открыть файл, значит он повреждён. Ссылка rsg.ms/verify стандартная подсказка проверить файлы. Рядом часто MINIDUMP.',
  fix: ['Смотреть строку Error on asset reading. Collection [...]: путь в папку GTA V значит повреждена игра (проверить целостность), путь в cache/ или dlc_mj_* значит повреждён кеш Majestic (очистить кеш и перепроверить файлы).'], tpl: [TPL_RES] });

R({ id: 'c-asset', kind: 'client', kw: 'Error on asset reading', re: /Error on asset reading\.\s*Collection \[([^\]]*)\]/, sev: 'crit', src: 'guide',
  title: 'Ошибка чтения ресурса (Error on asset reading)',
  detail: function (m) { return m[1]; },
  refine: function (m) {
    var o = owner(m[1]);
    if (o === 'mj') return { key: 'mj', title: 'Ошибка чтения ресурса Majestic (повреждён кеш)', cause: 'Путь ведёт в файлы Majestic (cache/, collection, dlc_mj_*).', fix: ['Нажать «Очистить кеш» и перепроверить файлы.'] };
    if (o === 'gta') return { key: 'gta', title: 'Ошибка чтения файла GTA V (повреждена игра)', cause: 'Путь ведёт в папку GTA V.', fix: ['Проверить целостность файлов GTA V.'] };
    return null;
  },
  cause: 'Игра не смогла прочитать файл. Чей он, видно по пути в Collection [...].', fix: ['GTA V: проверить целостность. Majestic: очистить кеш и перепроверить файлы.'] });

R({ id: 'c-mem', kind: 'client', kw: 'ERR_MEM_', re: /ERR_MEM_\w+/, sev: 'crit', src: 'guide',
  title: 'ERR_MEM_*: ошибка при обращении к памяти',
  cause: 'Официальной расшифровки у Rockstar нет, единой причины тоже. Строки часто идут парой, номер в конце (_1, _4, _5) роли не играет.',
  fix: ['Убрать сторонние сборки и графические моды, перенести разрешённые моды из корня игры в папку модификаций лаунчера, проверить целостность файлов GTA V.',
    'Проверить файл подкачки (особенно если вылеты через 10–15 минут или в crashcontext.log PageFile Free: (0Mb)): Win+R → sysdm.cpl → Дополнительно → Быстродействие → Параметры → Дополнительно → Виртуальная память → Изменить; галку автовыбора снять, на системном диске «Размер по выбору системы», перезагрузить ПК.',
    'Ни модов, ни подкачки не нашлось: передать дальше с client.log, main.log, majestic-patcher.log и минидампом. Готового шаблона нет.'] });

R({ id: 'c-oversized', kind: 'client', kw: 'Oversized file', re: /Oversized file \(>(\d+)MB\) (\S+?\.rpf)/, sev: 'crit', src: 'obs', loopAt: 3,
  title: 'Файл архива больше допустимого размера (нестандартный .rpf)',
  detail: function (m) { return m[2] + ' (>' + m[1] + ' МБ)'; },
  refine: function (m) { return { key: m[2], title: 'Слишком большой архив ' + m[2] + ' (>' + m[1] + ' МБ)' }; },
  cause: 'Клиент отказался грузить архив, который сильно больше обычного. В логах такие случаи шли вместе с ERR_STR_FAILURE_3. Чаще всего это сторонний или подменённый архив (графические паки вроде «graphics», «armor», правки через OpenIV), которого нет в чистой сборке.',
  fix: ['Убрать из папки игры сторонние .rpf и моды графики/брони, вернуть оригинальные файлы.', 'Нажать «Очистить кеш» в лаунчере и дождаться полной перепроверки.', 'Проверить целостность файлов GTA V.'] });

R({ id: 'c-memalloc', kind: 'client', kw: 'Memory alloc failed', re: /Composer - Memory alloc failed/, sev: 'crit', top: true, src: 'obs',
  title: 'Не хватило памяти при сборке одежды персонажей (Composer)',
  cause: 'Игра не смогла выделить память под текстуры одежды: оперативной памяти или видеопамяти мало, файл подкачки мал либо забит, много лишних программ.',
  fix: ['Закрыть браузер, Discord-оверлеи и фоновые программы, освободить оперативную память.', 'Увеличить или включить файл подкачки Windows (не меньше 16 ГБ, на SSD).', 'Снизить настройки текстур и дальность прорисовки; проверить, что видеокарты хватает по видеопамяти.', 'Убрать моды одежды и графики.'] });

R({ id: 'c-n-hooksmisc', kind: 'client', kw: ['Frag type is null', 'Ring buffer overflow', 'Failed to register graphics', 'Offline cloud auth', 'Exception caught while invoking timer callback', "Error in event 'render' handler", 'Model hash:', 'Asset type:', 'Could not load https://cdn.majestic-files'], re: /Frag type is null|Ring buffer overflow|Failed to register graphics|Offline cloud auth: (?:unexpected HTTP code|no chain token)|Exception caught while invoking timer callback|\[MpEvents\] Error in event 'render' handler|^Model hash: \d+|^Asset type: \d+|\(View \w+\) Could not load https:\/\/cdn\.majestic-files\S+ \(ERR_TIMED_OUT\)/, sev: 'noise', warnAt: 200, src: 'infer',
  title: 'Мелкие предупреждения движка и подгрузки (на игрока не влияют)', cause: 'Нет модели или фрагмента у объекта, переполнение звукового буфера, не получен токен офлайн-авторизации из-за таймаута сети, ошибка в обработчике отрисовки. Единичные такие строки есть у большинства игроков.', fix: [] });

R({ id: 'c-uta', kind: 'client', kw: 'UpdateTextureAccelerated', re: /UpdateTextureAccelerated: Failed to query ID3D11Texture2D (0x[0-9a-f]+)/i, sev: 'crit', src: 'obs',
  title: 'Сбой вывода интерфейса через видеокарту (UpdateTextureAccelerated)',
  detail: function (m) { return m[1]; },
  cause: 'Встроенный браузер интерфейса не смог получить текстуру Direct3D (код 0x80070057): тысячи строк подряд. Чаще всего на ноутбуке интерфейс или игра работают на встроенной графике (Intel UHD) вместо дискретной видеокарты, либо драйвер видеокарты устарел или повреждён. Интерфейс может не отображаться или мерцать.',
  fix: ['Windows → Параметры → Система → Дисплей → Графика: задать для игры и лаунчера «Высокая производительность».', 'Обновить драйвер видеокарты (чистая установка NVIDIA/AMD, для Intel — с сайта производителя).', 'Отключить наложения (оверлеи Discord, Steam, GeForce Experience) и повторить.'] });

R({ id: 'c-lastasset', kind: 'client', kw: 'Last loaded asset', re: /Last loaded asset:\s*(\S[^⏎]*)/, sev: 'warn', warnAt: 1, top: true, src: 'obs',
  title: 'Последние загруженные ассеты перед дампом',
  detail: function (m) { return m[1].trim().slice(0, 160); },
  refine: function (m) {
    var names = m[1].trim().split(/\s+/).filter(Boolean), kinds = { ydr: 'модель объекта', yft: 'модель транспорта или оружия (фрагмент)', ydd: 'одежда или аксессуар персонажа', ytd: 'текстура', ycd: 'анимация', ymap: 'карта (расстановка объектов)', ybn: 'коллизия', ynv: 'навмеш' };
    var parts = names.slice(0, 4).map(function (n) { var x = /\.(\w+)$/.exec(n); return n + (x && kinds[x[1].toLowerCase()] ? ' (' + kinds[x[1].toLowerCase()] + ')' : ''); });
    var custom = names.some(function (n) { return /^mj_|_SET\d|_M\d+\.|mp_[mf]_freemode_01_mp_[mf]_(?:clothes|xmas)/i.test(n); });
    return { key: 'a', title: 'Краш движка при загрузке ассета: ' + parts.join(', '), cause: 'Перед сохранением дампа движок последним загружал: ' + parts.join(', ') + '. Это место, где игра упала при подгрузке или отрисовке геометрии или текстуры' + (custom ? ' (кастомный ресурс сервера: транспорт, одежда или карта Majestic)' : ' (стандартный ассет GTA V)') + '. По одной такой строке причину не поставить: если игрок падает на том же ассете повторно, виноват этот ресурс или повреждённый кеш; если на разных, ищите конфликт модов, нехватку памяти и оверлеи.', fix: ['Сравнить Last loaded asset в нескольких логах игрока: повторяется ли ассет.', 'Очистить кеш в лаунчере и дождаться перепроверки ресурсов.', 'Убрать моды графики, одежды и транспорта (OpenIV, ReShade, ENB, Redux).', 'Если ассет один и тот же у разных игроков: передать название ассета разработчикам.'] };
  } });

R({ id: 'c-overlay', kind: 'client', kw: ['discordhook', 'RTSSHooks', 'bandicam', 'nvspcap', 'GameOverlayRenderer', 'graphics-hook', 'Overwolf', 'MSIAfterburner', 'ReShade', 'reshade'], re: /(discordhook(?:64)?\.dll|RTSSHooks64?\.dll|bandihook(?:64)?\.dll|bdcam\w*\.dll|nvspcap64\.dll|graphics-hook64\.dll|owclient\w*\.dll|MSIAfterburner\w*|ReShade(?:64)?\.dll|reshade-shaders)/i, sev: 'warn', warnAt: 1, src: 'infer',
  title: 'В игру подгружены сторонние оверлеи или графические хуки',
  detail: function (m) { return m[1]; },
  refine: function (m) { var n = m[1].toLowerCase(); var label = /discordhook/.test(n) ? 'оверлей Discord' : /rtss/.test(n) ? 'RivaTuner (RTSS)' : /band|bdcam/.test(n) ? 'Bandicam' : /nvspcap/.test(n) ? 'NVIDIA ShadowPlay' : /graphics-hook/.test(n) ? 'захват OBS' : /owclient/.test(n) ? 'Overwolf' : /afterburner/.test(n) ? 'MSI Afterburner' : 'ReShade'; return { key: label, title: 'Сторонний хук в игре: ' + label + ' (' + m[1] + ')' }; },
  cause: 'Эти библиотеки перехватывают d3d11/dxgi и вызовы отрисовки. Сами по себе они не доказывают, что вылет из-за них, но при сбоях рендера, зависаниях интерфейса и дампах после Last loaded asset это первый кандидат на конфликт.',
  fix: ['Отключить оверлеи (Discord, Steam, GeForce Experience, RivaTuner, Bandicam, Overwolf, MSI Afterburner) и повторить запуск.', 'Убрать ReShade и подобные надстройки из папки игры.'] });

R({ id: 'c-pool', kind: 'client', kw: ['Pool is full', 'Pool Full'], re: /(?:Item in pool (\w+)[^⏎]*?can't be allocated\. Pool is full|(\w+) Pool Full, Size == (\d+))/, sev: 'warn', src: 'web',
  title: 'Переполнен пул движка игры',
  detail: function (m) { return m[1] || (m[2] + ', размер ' + m[3]); },
  refine: function (m) { var n = m[1] || m[2]; return { key: n, title: 'Переполнен пул движка игры: ' + n }; },
  cause: 'У движка GTA V фиксированные таблицы объектов (пулы). Когда таблица заполнена, новый объект создать нельзя, и если это случается в момент подгрузки, игра падает. Размер пулов задаёт клиент мультиплеера, а не компьютер игрока; переполнение бывает при большом числе игроков, транспорта и объектов рядом.',
  fix: ['Перезайти на сервер; если вылет повторяется в одном и том же месте (мероприятие, большая толпа), на время уйти из этого места.', 'Передать разработчикам имя пула из лога и время вылета: лечится на стороне клиента, переустановка и очистка кеша здесь не помогают.'] });

R({ id: 'c-dxhook', kind: 'client', kw: ['hooked DirectX', 'hooked Direct'], re: /Something else hooked DirectX context|hooked DirectX context/, sev: 'warn', src: 'web',
  title: 'Другая программа перехватила DirectX (оверлей)',
  cause: 'Клиент не может встроиться в отрисовку: её уже перехватила другая программа. Чаще всего это RivaTuner (RTSS, ставится с MSI Afterburner), Fraps, Streamlabs OBS или похожие оверлеи.',
  fix: ['Полностью закрыть RivaTuner/MSI Afterburner, Fraps, Streamlabs OBS и другие оверлеи (в том числе в трее) и запустить игру заново.', 'Если не помогло: отключить оверлеи Discord, Steam и NVIDIA, перезагрузить компьютер.'] });

R({ id: 'c-nativefail', kind: 'client', kw: 'Native call failed', re: /Native call failed: (\w+)/, sev: 'warn', warnAt: 20, src: 'obs',
  title: 'Нативный вызов игры упал с исключением (скрипт отрисовки)',
  detail: function (m) { return m[1]; },
  cause: 'Скрипт вызвал нативную функцию (например setDrawOrigin при отрисовке 3D-текста), та вернула нарушение доступа к памяти (0xC0000005), alt:V перехватил его. Игрок мог видеть пропавшие подписи над объектами, зависание интерфейса или просадки FPS. Если дампа (MINIDUMP) после этого нет, клиент не упал, это ошибка скрипта.',
  fix: ['Отключить оверлеи и графические моды (ReShade, ENB, RivaTuner), обновить драйвер видеокарты.', 'Если повторяется у многих игроков с одним и тем же вызовом: передать название нативной функции разработчикам.'] });

R({ id: 'c-abort', kind: 'client', kw: 'abort() called', re: /abort\(\) called/, sev: 'crit', src: 'obs',
  title: 'Клиент аварийно завершён (abort)',
  cause: 'Сам клиент вызвал аварийное завершение (abort) и закрыл игру без обычного сообщения об ошибке. Это именно краш, а не закрытие игроком. Причину показывают строки перед ним: последний загруженный ресурс, нехватка памяти, сбой скрипта или графики.',
  fix: ['Посмотреть последние 20–40 строк перед этой записью и назвать игроку, что происходило (загрузка ресурса, телепорт, интерфейс).', '«Очистить кеш» в лаунчере, убрать оверлеи и моды, обновить драйвер видеокарты.', 'Если повторяется: передать client.log и время краша дальше.'] });
R({ id: 'm-abort', kind: 'main', kw: 'abort() called', re: /abort\(\) called/, sev: 'crit', src: 'obs',
  title: 'В отчёте о сбое: клиент аварийно завершён (abort)',
  cause: 'Сам клиент вызвал аварийное завершение (abort) и закрыл игру без обычного сообщения об ошибке. Это именно краш, а не закрытие игроком. Причину показывают строки перед ним: последний загруженный ресурс, нехватка памяти, сбой скрипта или графики.',
  fix: ['Посмотреть последние 20–40 строк перед этой записью и назвать игроку, что происходило (загрузка ресурса, телепорт, интерфейс).', '«Очистить кеш» в лаунчере, убрать оверлеи и моды, обновить драйвер видеокарты.', 'Если повторяется: передать client.log и время краша дальше.'] });
R({ id: 'c-webgl-lost', kind: 'client', kw: ['CONTEXT_LOST_WEBGL', 'GL_CONTEXT_LOST', 'Too many active WebGL contexts'], re: /CONTEXT_LOST_WEBGL|GL_CONTEXT_LOST_KHR|Too many active WebGL contexts/, sev: 'warn', src: 'obs',
  title: 'Потерян графический контекст интерфейса (WebGL)',
  cause: 'Окно интерфейса (меню, телефон, панель) потеряло графический контекст: драйвер видеокарты сбросил его или открыто слишком много окон с 3D. Игрок видит чёрный или замерший интерфейс при живой игре.',
  fix: ['Обновить драйвер видеокарты (чистая установка), отключить оверлеи (Discord, Steam, MSI Afterburner, GeForce Experience).', 'Перезайти на сервер: интерфейс создаётся заново.'] });
R({ id: 'l-verifier-extra', kind: 'main', kw: '[verifier] Unexpected file', re: /\[verifier\] Unexpected file: ([^\r\n]+)/, sev: 'warn', src: 'obs',
  title: 'В папке игры есть лишние файлы (проверка целостности)',
  detail: function (m) { return m[1].trim().slice(0, 140); },
  cause: 'Проверка файлов нашла в папке GTA V файлы, которых нет в оригинальной сборке (например update.rpf или dlc.rpf). Это следы старых сборок, модов или ручной замены файлов, и они могут ломать загрузку ресурсов.',
  fix: ['Убрать моды и сторонние сборки из папки игры, вернуть оригинальные файлы GTA V (проверка целостности в Steam / Epic / Rockstar Launcher).', 'Затем «Очистить кеш» в лаунчере и запустить игру заново.'] });
R({ id: 'l-nowindow', kind: 'main', kw: 'No game or BattlEye window exists', re: /No game or BattlEye window exists for game tracking/, sev: 'info', src: 'obs',
  title: 'Лаунчер не увидел окно игры',
  cause: 'Лаунчер не нашёл окно игры или BattlEye для слежения. Сам по себе не ошибка, но вместе с закрытием игры сразу после старта указывает, что игра упала на запуске.',
  fix: ['Смотреть client.log той же попытки: что игра успела записать до закрытия.', 'Проверить антивирус и BattlEye (переустановить службу из лаунчера).'] });
R({ id: 'c-n-script2', kind: 'client', kw: ['Exception offset', 'Exception code', 'Error code:', 'Syntax error parsing inline', 'Cannot set player into vehicle', 'Request has been terminated', 'without a usable error body', "(reading 'mp')", 'Cannot convert undefined or null'], re: /^\s*Exception (?:offset|code)|^\s*Error code: \d+|Syntax error parsing inline property declaration|Cannot set player into vehicle|ResponseError \{ code: UnknownError|without a usable error body|reading 'mp'|Cannot convert undefined or null to object|^\[MpEvents\] Error in event '[\w.]+' handler: TypeError/, sev: 'noise', warnAt: 200, src: 'infer',
  title: 'Ошибки отдельных скриптов и интерфейса (на запуск не влияют)', cause: 'Ошибки в обработчиках событий скриптов и вёрстке интерфейса. Видны почти в каждом логе и сами по себе причиной проблемы игрока не бывают.', fix: [] });

R({ id: 'c-queue-net', kind: 'client', kw: ['CEF error', 'QUEUE SSE'], re: /\[QUEUE SSE\]: (?:request error CEF error: (ERR_[A-Z0-9_]+)|queue error '([^']*)'|(?:terminal queue error|'internal' failed \d+ times in a row - giving up))/, sev: 'warn', warnAt: 3, src: 'obs', loopAt: 6,
  title: 'Обрыв связи с очередью входа на сервер',
  detail: function (m) { return m[1] || ('queue error ' + m[2]); },
  refine: function (m) {
    var c = m[1] || ''; var map = { ERR_CONNECTION_CLOSED: 'соединение закрыто', ERR_CONNECTION_TIMED_OUT: 'таймаут соединения', ERR_SSL_PROTOCOL_ERROR: 'ошибка защищённого соединения (SSL)' };
    return { key: c || 'queue', title: 'Обрыв связи с очередью входа' + (map[c] ? ': ' + map[c] : ' (сервер очереди ответил ошибкой)') };
  },
  cause: 'Это сетевая ошибка встроенного браузера лаунчера, а не краш игры. Связь с очередью входа оборвалась (провайдер, VPN, антивирус или брандмауэр режет соединение, либо сбой на стороне сервера). Клиент переподключается сам; важно, если повторяется часто и игрок не может войти.',
  fix: ['Отключить VPN и прокси, попробовать другую сеть (раздача с телефона).', 'Проверить антивирус и брандмауэр: добавить лаунчер и игру в исключения.', 'Если ошибка у многих игроков сразу: сбой на стороне сервера, не у игрока.'] });

R({ id: 'c-platform', kind: 'client', kw: 'ERR_FAILED_TO_LAUNCH_PLATFORM', re: /ERR_FAILED_TO_LAUNCH_PLATFORM/, sev: 'crit', top: true, src: 'team',
  title: 'Лаунчер не смог запустить платформу игры (ERR_FAILED_TO_LAUNCH_PLATFORM)',
  cause: 'Патчер Majestic не смог запустить платформу, на которой куплена игра: Steam, Rockstar Games Launcher (RGL) или Epic Games. Почти всегда повреждена установка самой платформы. Решение — переустановить платформу поверх текущей.',
  fix: ['Переустановить платформу поверх, ничего не удаляя: скачать установщик с официального сайта и установить в ту же папку (Steam, Rockstar Games Launcher или Epic Games). Игра и библиотека останутся.', 'После установки перезагрузить компьютер, открыть платформу один раз самостоятельно, затем запускать игру через Majestic.', 'Если не помогло: снять «Запускать от имени администратора» у платформы и у GTA5.exe, закрыть зависшие процессы платформы и повторить.'] });

R({ id: 'c-errcode', kind: 'client', kw: 'ERR_', re: /\b(ERR_(?!CONNECTION_|SSL_|INTERNET_|NAME_|TIMED_OUT|NETWORK_)[A-Z0-9_]{3,})\b(?: happened)?/, sev: 'crit', src: 'infer', loopAt: 3,
  title: 'Код ошибки игры, которого нет в руководстве',
  detail: function (m) { return m[1]; },
  refine: function (m, t) {
    var di = errInfo(m[1]); if (di) return { key: m[1], src: 'web', title: m[1] + ': ' + di.t, cause: di.cause, fix: di.fix };
    var o = { key: m[1], title: 'Код ' + m[1] + ': в руководстве не описан' };
    if (/повреждены|corrupt/i.test(t)) { o.cause = 'В тексте ошибки сказано «Игровые данные повреждены». По смыслу это порча данных, как у ZLIB / FILELOAD. Кода в руководстве нет.'; o.fix = ['Проверить целостность файлов GTA V, очистить кеш Majestic и перепроверить файлы.', 'Убрать моды. Если вылет повторяется: передать client.log и дамп.']; }
    return o;
  },
  cause: 'В client.log ищется именно код ERR_…, расшифровка идёт следом после Error message:. Для этого кода готового разбора нет.',
  fix: ['Прочитать Error message: рядом и найти по тексту решение в руководстве.', 'Если решения нет: собрать client.log, main.log и minidump и передать дальше.'],
  test: function (m, t) { return !/^ERR_(SYS_FILELOAD|GFX_D3D_INIT|GEN_ZLIB|MEM_|FAILED_TO_LAUNCH_PLATFORM)/.test(m[1]) && !/Missing rpf/.test(t) || false; } });

R({ id: 'c-dump', kind: 'client', kw: 'MINIDUMP', re: /MINIDUMP: Temporary dump saved/, sev: 'crit', src: 'guide',
  title: 'MINIDUMP: игра упала и сохранила дамп краша',
  cause: 'Строка подтверждает краш. Адреса Callstack саппорт не расшифровывает, смотрите контекст: Last loaded asset (последний загруженный файл), Last pos (координаты, нужны если вылет повторяется в одном месте). Texture info, Last deleted vehicle model, Last dynamic object created приложите как контекст, но по одной такой строке диагноз не ставьте.',
  fix: ['Проверить моды, целостность файлов, settings.xml, драйвер видеокарты.', 'Дамп: кнопка «Файл краш-репорта» в окне ошибки или Win+R → %appdata%\\majestic-launcher\\Multiplayer\\crashdumps.',
    'При передаче случая приложить .dmp или zip из этой папки, client.log той же попытки, время краша, Last pos, что делал игрок и повторяется ли вылет. Дамп просить только при настоящем краше без готового решения.'] });

R({ id: 'c-shut', kind: 'client', kw: 'Shutting down', re: /^Shutting down/, sev: 'info', src: 'guide',
  title: 'Shutting down (завершение клиента)', cause: 'Если строке предшествует MINIDUMP, это обработка краша, а не штатный выход (примерно в половине случаев).', fix: [] });

R({ id: 'c-weapfirst', kind: 'client', kw: 'First seen:', re: /First seen:\s*(\S+)/, sev: 'crit', top: true, src: 'guide',
  title: 'МОД В ИГРЕ: сторонний мод на оружие (чужой файл в First seen)',
  detail: function (m) { return m[1]; },
  test: function (m) { var s = m[1]; return !/^commoncrc:\/data\/ai\/weapons\.meta$/i.test(s) && !MJ.test(s) && !/^dlc_?mp\w*CRC/i.test(s); },
  cause: 'Штатный файл в First seen: commoncrc:/data/ai/weapons.meta. Незнакомое имя значит, что сторонний мод переписал файлы игры. Проверка файлов игры такие моды не убирает.',
  fix: ['Сказать прямо, что установлены сторонние модификации и их нужно удалить (не спрашивать, стоят ли они).'], tpl: [TPL_MODS] });

R({ id: 'c-conn', kind: 'client', kw: 'Connection failed', re: /Connection failed:\s*(.*)/, sev: 'crit', src: 'guide',
  title: 'Не удалось подключиться к игровому серверу (Server not responding)',
  detail: function (m) { return m[1]; },
  cause: 'Клиент отправил запрос на подключение и не получил ответ от сервера. Обычно виноваты соединение игрока (провайдер, VPN, DNS, фаервол), реже сервер недоступен.',
  fix: ['Проверить интернет, VPN, DNS, отключить прокси и фаервол.', 'Попробовать зайти позже или на другой сервер: исключить недоступность сервера.'], tpl: [TPL_NET] });

R({ id: 'c-n-stack', kind: 'client', kw: 'at ', re: /^at\s.*\(?\/[\w.-]+\.js:\d+:\d+\)?$/, sev: 'noise', src: 'obs',
  title: 'Строки стека JS-скриптов (at … /main.js)', cause: 'Продолжение предупреждения скрипта сервера (js.script). Само по себе не диагноз.', fix: [] });

R({ id: 'c-join-timeout', kind: 'client', kw: 'Status code: -', re: /Failed to connect to \S+ via HTTP\. Status code: -\d+/, sev: 'warn', src: 'infer',
  title: 'Нет ответа при подключении к серверу (Status code -28, таймаут)',
  detail: function (m, t) { return (/Status code: (-\d+)/.exec(t) || [])[1] || ''; },
  cause: 'Код -28 значит таймаут: запрос к api.majestic-files.net не получил ответа. В логе с этим кодом игрок всё же мог подключиться позже, поэтому смотрите на Connected with id.',
  fix: ['Проверить интернет, VPN и DNS.'], tpl: [TPL_NET] });

R({ id: 'c-join-https', kind: 'client', kw: 'via HTTPS. Status code', re: /Failed to connect to (\S+) via HTTPS\. Status code: (-?\d+)/, sev: 'warn', warnAt: 2, src: 'obs',
  title: 'Не удалось подключиться к серверу по HTTPS (таймаут)',
  detail: function (m) { return m[1] + ' · код ' + m[2]; },
  cause: 'Клиент не дождался ответа api.majestic-files.net по HTTPS (код -28 = таймаут, ~5 секунд). Клиент пробует запасной путь, поэтому единичный случай не страшен. Если вход так и не удался, виноват интернет: провайдер, VPN, блокировка или антивирус.',
  fix: ['Отключить VPN и прокси, проверить, открывается ли api.majestic-files.net в браузере.', 'Сменить DNS на 1.1.1.1 / 8.8.8.8, попробовать другую сеть.', 'Добавить лаунчер и игру в исключения антивируса и брандмауэра.'] });

R({ id: 'c-n-join400', kind: 'client', kw: 'Failed to connect to', re: /Failed to connect to \S+ via HTTP\. Status code: 400/, sev: 'noise', src: 'obs',
  title: 'Запрос join по HTTP вернул 400 (есть в успешных заходах)', cause: 'Встречается во всех загруженных логах, в том числе там, где игрок успешно зашёл.', fix: [] });
R({ id: 'c-n-auth', kind: 'client', kw: 'MJ Auth: Error fetching', re: /MJ Auth: Error fetching/, sev: 'noise', src: 'guide',
  title: 'MJ Auth: Error fetching (не признак проблемы)', cause: 'Строка есть во всех логах, включая успешные заходы. Окно входа рисует встроенный браузер; если окна авторизации нет совсем, проверять сеть, VPN, DNS.', fix: [] });
R({ id: 'c-n-loc', kind: 'client', kw: 'No localized string', re: /No localized string found/, sev: 'noise', src: 'obs',
  title: 'Нет локализованной строки', cause: 'Интерфейс не нашёл перевод. Есть в успешных заходах.', fix: [] });
R({ id: 'c-n-pool', kind: 'client', kw: ['Item in pool', 'Cannot destroy'], re: /Item in pool .* can't be allocated|Cannot destroy (?:NetworkObject|Player|Vehicle|Ped|Object)/, sev: 'noise', src: 'guide',
  title: 'Item in pool / Cannot destroy NetworkObject (основной мусор)', cause: 'Набираются тысячами и забивают файл. Метка [Error] сама по себе ничего не значит.', fix: [] });
R({ id: 'c-n-find', kind: 'client', kw: 'FindDataFile', re: /CDataFileMgr::FindDataFile\(\) -> Failed to find/, sev: 'noise', src: 'guide',
  title: 'FindDataFile: Failed to find (около 27 за заход, норма)', cause: 'Читать только если рядом ERR_SYS_FILELOAD.', fix: [] });
R({ id: 'c-n-dup', kind: 'client', kw: ['Duplicate weapon item', 'First seen:'], re: /Duplicate weapon item|First seen:/, sev: 'noise', src: 'guide',
  title: 'Duplicate weapon item (норма около 6 строк)', cause: 'Наши паки оружия пересекаются со штатными файлами игры. Подозрителен только чужой файл в First seen или число строк заметно выше нормы.', fix: [] });
R({ id: 'c-n-store', kind: 'client', kw: ['Store not found for', "Can't find asset store"], re: /Store not found for \S+|Can't find asset store/, sev: 'noise', src: 'guide',
  title: 'Store not found / Can\'t find asset store', cause: 'Есть в обычных заходах (в руководстве сказано про asset store; Store not found for … встречается в успешных заходах загруженных логов).', fix: [] });
R({ id: 'c-n-hooks', kind: 'client', kw: ['Pattern ', 'Invalid SocialClub', 'UnholsterClips'], re: /Pattern [0-9a-f ?]+ not found|Invalid SocialClub WndProc signature|UnholsterClips: target\/appendFrom/, sev: 'noise', src: 'obs',
  title: 'Предупреждения хуков (Pattern not found, SocialClub WndProc, UnholsterClips)', cause: 'Встречаются в успешных заходах загруженных логов, самостоятельно проблемой не являются.', fix: [] });
R({ id: 'c-n-split', kind: 'client', kw: ['Resource splitting', 'Custom encryption'], re: /Resource splitting mode|Custom encryption mode/, sev: 'noise', src: 'obs',
  title: 'Режим ресурсов (Resource splitting / Custom encryption)', cause: 'Служебные сообщения клиента.', fix: [] });
R({ id: 'c-ok1', kind: 'client', kw: 'Game Started in', re: /Game Started in (\d+) ms/, sev: 'ok', src: 'guide', detail: function (m) { return m[1] + ' мс'; },
  title: 'Game Started: движок запустился', cause: 'Если ошибка выше этой строки, вылет был на загрузке ресурсов.', fix: [] });
R({ id: 'c-ok2', kind: 'client', kw: 'Connected with id', re: /Connected with id:\s*(\d+)/, sev: 'ok', src: 'guide', detail: function (m) { return 'id ' + m[1]; },
  title: 'Connected: клиент подключился к серверу', cause: 'Игрок зашёл. Метки [Error] выше можно пропустить, если нет кода ERR_….', fix: [] });
R({ id: 'c-n-web', kind: 'client', kw: '', re: /^view 0x/, sev: 'noise', src: 'guide', nodeIs: 'web',
  title: 'Сообщения веб-интерфейса', cause: 'Строки [WEB, ...] пишет веб-интерфейс, это не ошибка.', fix: [] });


R({ id: 'c-n-misc', kind: 'client', kw: ['Remote ID getter', 'Deprecation warning', 'DISCORD INITIALIZED', 'siren settings override', "Can't load asset file", 'crashOnFatalError', 'Network tick was', 'Arguments:', '_isAMomentObject'], re: /Remote ID getter is not defined|Deprecation warning: value provided|DISCORD INITIALIZED|siren settings override but vehicle has no siren|Can't load asset file "categories\.dat\d+\.rel"|crashOnFatalError|\[voicemgr\] Network tick|^Arguments:|_isAMomentObject/, sev: 'noise', src: 'obs',
  title: 'Служебные предупреждения клиента (норма)', cause: 'Эти строки есть почти в каждом успешном заходе: заглушки совместимости, предупреждение библиотеки дат, инициализация Discord, отсутствие сирены у машины. Сами по себе не диагноз.', fix: [] });

R({ id: 'c-n-stack', kind: 'client', kw: ['Error', '    at ', '  at ', ' at ', '(/main.js', '(/vendors.js', '(/client-old.js', '<bootstrapper>'], re: /^\s*at\s[^⏎]*:\d+(?::\d+)?\)?(?: ⏎|$)|^Error(?: ⏎|$)/, sev: 'noise', src: 'infer',
  title: 'Хвост стека скрипта (продолжение предыдущей ошибки)', cause: 'Строки «at …js:N:N» продолжают сообщение об ошибке скрипта выше. Смотрите ту строку, а не эти.', fix: [] });

R({ id: 'c-n-srcdump', kind: 'client', kw: ['  ', 'Allocator', "': '", 'Event handler', 'return;', '...e,', '} was too long', 'mp_default', 'self.remove(key', 'return fn(...args)', 'argsToMp', 'Failed to wait for callback', 'textures:', ' - input (first', ' - output (first', ' - avail_', ' - total_', ' - leftData', ' - processChunk', ' - ensureData', ' - Msg:', ' - Last requested'], re: /^Event handler[^]*|^ {8,}\S|^ {2,}(?:if \(|const |__private|return\b|\}|[\w$.]+\(.*\);?$)|^\s*- Allocator:|^\s*'\d+': '[\w-]+',?$|^\s+(?:\} was too long \d+|if \(event\.startsWith|return;|this\.dispatchLocal|mp_default\.events|self\.remove|return fn\(|\.\.\.e,|textures: t,|\}|const t = e\.textures|se = !0)|^\s*- (?:input|output) \(first|^\s*- (?:avail_in|avail_out|total_in|total_out|leftData|processChunkRes|ensureDataAvailableRes|Msg|Last requested file)\b|^\s+Error: Failed to wait for callback/, sev: 'noise', src: 'infer',
  title: 'Текст кода скрипта или подробности ошибки (продолжение соседней строки)', cause: 'Скрипт выводит фрагмент собственного кода или технические подробности под основной ошибкой. Смотрите строку выше (например, ZLib или «too long»).', fix: [] });

R({ id: 'c-n-model', kind: 'client', kw: 'Failed to request model', re: /Failed to request model/, sev: 'noise', warnAt: 30000, src: 'obs',
  title: 'Не подгрузились модели объектов (подгрузка по сети)', cause: 'Клиент не успел получить модели объектов рядом: в логах это тысячи строк почти у каждого игрока. Сама по себе не причина вылета.', fix: [] });

R({ id: 'c-n-curl', kind: 'client', kw: ['HTTP Request failed, curl code', "Can't fetch audio file", 'Playback error', 'played audio:', "Can't create audio channel"], re: /Can't create audio channel|HTTP Request failed, curl code: \d+|Can't fetch audio file|Playback error: all is OK|\[ND Sound\]Error \d+|played audio:/, sev: 'noise', warnAt: 40, src: 'infer',
  title: 'Не загрузились звуки с сервера (curl, таймаут CDN)', cause: 'Клиент не смог скачать звуковой файл (curl code 28 = таймаут). Это косметика: звука не будет. Если таких строк десятки, у игрока нестабильное соединение или блокировка CDN.', fix: ['Проверить стабильность интернета, отключить VPN.'] });

R({ id: 'c-n-script', kind: 'client', kw: ['Creating blip in dimension', 'CObjectSyncData pool', 'increasing pool size', 'Promise resolved after being resolved', 'Timer callback in resource', '[mango]', 'local build skipped', '[MACRO]', 'Full paths without', 'voicemgr', 'Exception caught while invoking event callback', "reading 'type'", "reading 'side'", 'News message not found', 'Fast disconnect detected', 'Trying to connect to voice server', 'update takes too long', 'Trace:', 'Failed to parse args when sending', 'baseobject is invalid', 'getTime is not a function', 'Promise.allSettled', 'BicycleMotion NULL', 'this.scriptID', 'Proxima Nova', 'Failed to update game activity', 'Archetype is null', 'AudioPos index lock', 'NAVMESH_REGION_RADIUS', 'animDict doesnt exist', 'too many audio instances', 'No default slot found', '[VehicleInfoService]', 'Failed to create object with model', 'autoanim-null', 'isMelee', 'pvoicemgr', '} undefined undefined'], re: /animDict doesnt exist|too many audio instances|No default slot found for componentId|\[VehicleInfoService\] Unknown model hash|^\} undefined undefined|Failed to create object with model|\[autoanim-null\]|reading 'isMelee'|\[pvoicemgr\] Player not found|Archetype is null|AudioPos index lock|NAVMESH_REGION_RADIUS is not defined|getTime is not a function|Promise\.allSettled|BicycleMotion NULL|Failed to wait for callback: \(\) => this\.scriptID|Font "[^"]+" not found|Discord: Failed to update game activity|Fast disconnect detected|Trying to connect to voice server|update takes too long|^Trace:|Failed to parse args when sending|baseobject is invalid|Creating blip in dimension|CObjectSyncData pool .* is full|increasing pool size|Promise resolved after being resolved|Timer callback in resource .* took|\[mango\] error occured|\[Entity\] local build skipped|\[MACRO\] macro \d+ is already running|Full paths without \/|\[voicemgr\] Failed to change device|Exception caught while invoking event callback|Cannot read properties of (?:null|undefined) \(reading '(?:type|side)'\)|\[VN\] Unhandled promise rejection at \w+:\/client-old\.js|News message not found/, sev: 'noise', warnAt: 300, src: 'infer',
  title: 'Внутренние предупреждения скриптов клиента (на игрока не влияют)', cause: 'Ошибки самих скриптов игры: блипы, лимиты пулов, необработанные промисы, таймеры. Это ошибки разработки, которые видны почти в каждом логе, и причиной проблемы игрока они сами не бывают.', fix: [] });

R({ id: 'c-n-paired', kind: 'client', kw: ['[PairedScene]'], re: /\[PairedScene\] (?:ptfx asset|audio bank) \S+ not loaded/, sev: 'noise', warnAt: 60, src: 'infer',
  title: 'Не подгрузились эффекты или звук сцены (косметика)', cause: 'Парная сцена не нашла эффект или звуковой банк: на геймплей не влияет, если нет вылетов рядом.', fix: [] });

R({ id: 'c-n-tick', kind: 'client', kw: ['tick was too long', 'was too long'], re: /Resource \S+ tick was too long \d+ ms|Event handler function[^]*?was too long/, sev: 'noise', warnAt: 150, src: 'infer',
  title: 'Скрипты работают медленно (редко норма, много значит просадки FPS)', cause: 'Единичные строки «tick was too long» есть в обычных заходах. Если их сотни, ПК не справляется: нагрузка на процессор, фоновые программы, перегрев.', fix: ['Закрыть лишние программы, проверить нагрузку на процессор и температуру.', 'Снизить настройки графики и дальность прорисовки.'] });

R({ id: 'c-n-pkt', kind: 'client', kw: ['Packet failed to send', 'Peer limiter blocked'], re: /Packet failed to send|Peer limiter blocked the packet/, sev: 'noise', warnAt: 400, src: 'infer',
  title: 'Потери сетевых пакетов (единичные строки норма, сотни значат нестабильное соединение)', cause: 'Пара десятков строк «Packet failed to send» бывает и в успешных заходах. Если их сотни и игрок жалуется на рывки или разрывы, соединение нестабильное: Wi-Fi, VPN, перегруженный канал.', fix: ['Проверить стабильность соединения (пинг, потери), по возможности подключиться по кабелю.', 'Отключить VPN или сменить его сервер, закрыть программы, нагружающие канал (торренты, обновления).'] });

var BY_KIND = { main: [], client: [] };
RULES.forEach(function (r) { BY_KIND[r.kind].push(r); r.kws = Array.isArray(r.kw) ? r.kw : [r.kw]; });

/* ---------- Парсер ---------- */
function stripAnsi(s) { return s.replace(ANSI, ''); }

function detectKind(lines, name) {
  var a = 0, b = 0, n = 0;
  for (var i = 0; i < lines.length && n < 60; i++) {
    var l = lines[i]; if (!l) continue; n++;
    if (/^\[\d{4}-\d\d-\d\d /.test(l)) a++; else if (/^\[\d\d:\d\d:\d\d/.test(l)) b++;
  }
  if (a > b) return 'main';
  if (b > a) return 'client';
  return /client/i.test(name || '') ? 'client' : 'main';
}

function normLvl(l) {
  l = (l || '').toLowerCase();
  if (l === 'error' || l === 'err' || l === 'fatal') return 'error';
  if (l === 'warn' || l === 'warning') return 'warn';
  if (l === 'debug' || l === 'trace') return 'debug';
  return 'info';
}

/* Разбор и сканирование идут шагами: синхронно целиком (parse/scan) или частями с паузами для окна (analyzeAsync). */
function parseInit(text, name) {
  var lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { kind: detectKind(lines, name), lines: lines, entries: [], lineEntry: new Int32Array(lines.length).fill(-1), cur: null, i: 0 };
}
function parseRun(st, n) {
  var lines = st.lines, kind = st.kind, entries = st.entries, lineEntry = st.lineEntry, cur = st.cur, end = Math.min(lines.length, st.i + n);
  for (var i = st.i; i < end; i++) {
    var ln = lines[i], m = null;
    if (ln.charCodeAt(0) === 91) m = kind === 'main' ? MAINRE.exec(ln) : CLRE.exec(ln);
    if (m) {
      var e;
      if (kind === 'main') {
        e = { i: i, j: i, date: m[1], ts: m[2], lvl: normLvl(m[3]), node: m[4] ? m[4].trim() : '', text: stripAnsi(m[5] || ''), rid: -1, key: '', det: '', sev: 0 };
      } else {
        var tags = [], tm, tr = /\[([^\]]*)\]/g, lvl = 'info', node = '';
        while ((tm = tr.exec(m[2]))) tags.push(tm[1]);
        for (var k = 0; k < tags.length; k++) {
          var tl = tags[k].toLowerCase();
          if (tl === 'error' || tl === 'warning' || tl === 'warn' || tl === 'info' || tl === 'debug') lvl = normLvl(tl);
          else if (!node) node = tags[k].split(',')[0].trim().toLowerCase();
        }
        e = { i: i, j: i, date: '', ts: m[1], lvl: lvl, node: node, text: stripAnsi(m[3] || ''), rid: -1, key: '', det: '', sev: 0 };
      }
      entries.push(e); cur = e; lineEntry[i] = entries.length - 1;
    } else if (cur) {
      cur.j = i; lineEntry[i] = entries.length - 1;
      if (cur.text.length < 2500) cur.text += ' ⏎ ' + stripAnsi(ln).trim();
    }
  }
  st.i = end; st.cur = cur;
  return end >= lines.length;
}
function parseDone(st) { return { kind: st.kind, lines: st.lines, entries: st.entries, lineEntry: st.lineEntry }; }
function parse(text, name) { var st = parseInit(text, name); parseRun(st, Infinity); return parseDone(st); }

function toMsSlow(s) { var p = s.split(/[:.]/); return ((+p[0]) * 3600 + (+p[1]) * 60 + (+p[2])) * 1000 + (p[3] ? +(p[3] + '00').slice(0, 3) : 0); }
/* Быстрый путь для обычного «ЧЧ:ММ:СС.ммм» без split и регулярок; всё необычное — прежним способом */
function tsMs(s) {
  if (s.length < 8 || s.charCodeAt(2) !== 58 || s.charCodeAt(5) !== 58) return toMsSlow(s);
  var d = [0, 1, 3, 4, 6, 7], v = [];
  for (var k = 0; k < 6; k++) { var c = s.charCodeAt(d[k]) - 48; if (c < 0 || c > 9) return toMsSlow(s); v.push(c); }
  var ms = ((v[0] * 10 + v[1]) * 3600 + (v[2] * 10 + v[3]) * 60 + v[4] * 10 + v[5]) * 1000;
  if (s.length === 8) return ms;
  if (s.charCodeAt(8) !== 46 || s.length === 9) return toMsSlow(s);
  var f = 0, n = 0;
  for (var j = 9; j < s.length; j++) { var x = s.charCodeAt(j) - 48; if (x < 0 || x > 9) return toMsSlow(s); if (n < 3) { f = f * 10 + x; n++; } }
  while (n < 3) { f *= 10; n++; }
  return ms + f;
}
var dayCache = { s: null, v: 0 };
function toMs(e, kind) {
  var ms = tsMs(e.ts);
  if (kind === 'main' && e.date) { if (dayCache.s !== e.date) { dayCache.s = e.date; dayCache.v = Date.parse(e.date + 'T00:00:00Z'); } ms += dayCache.v; }
  return ms;
}

function signature(e) {
  var s = e.text.split(' ⏎ ')[0];
  s = s.replace(/[A-Za-z]:\\Users\\[^\\]+/gi, 'C:\\Users\\<u>').replace(/0x[0-9a-fA-F]+/g, '0x#').replace(/\b[0-9a-f]{8,}\b/gi, '#h').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return s.slice(0, 180);
}

/* ---------- Выдача прав на папку: короткая команда для игрока ----------
   icacls с группой «Пользователи» по SID (*S-1-5-32-545)
   работает одинаково в PowerShell и командной строке и не зависит от языка Windows. Права «изменение» (M), не «полный доступ». */
var PERM_IDS = { 'm-perm': 1, 'm-permfail': 1, 'm-elev': 1, 'm-clrfail:perm': 1 };
function permFolders(g, env) {
  var out = [], seen = {}, add = function (p) { p = String(p).replace(/[\\\/]+$/, ''); if (!/^[A-Za-z]:\\/.test(p)) return; var k = p.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(p); };
  Array.from(g.dets.keys()).forEach(function (d) { var re = /([A-Za-z]:\\[^'"\n⏎*?<>|,]+)/g, m; while ((m = re.exec(d))) { var p = m[1].trim().replace(/[\\\/]+/g, '\\'); if (/\.[A-Za-z0-9]{1,5}$/.test(p.split('\\').pop())) p = p.slice(0, p.lastIndexOf('\\')); add(p); } });
  var gp = env && env.path ? String(env.path).replace(/[\\\/]+/g, '\\').replace(/\\$/, '') : '';
  if (gp) out = out.map(function (p) { return p.toLowerCase().indexOf(gp.toLowerCase() + '\\') === 0 ? gp : p; }).filter(function (p, i, a) { return a.indexOf(p) === i; });
  if (!out.length) { if (gp) add(gp); out.push('$env:LOCALAPPDATA\\MajesticLauncher', '$env:APPDATA\\majestic-launcher'); }
  return out.slice(0, 3);
}
/* Путь внутри профиля пользователя пишется через $env:USERPROFILE: имя пользователя не попадает в ответ и маскирование его не испортит */
function permCommand(folder) { var f = String(folder).replace(/^[A-Za-z]:\\Users\\[^\\]+/i, '$env:USERPROFILE'); return 'icacls "' + f + '" /grant "*S-1-5-32-545:(OI)(CI)M" /T /C'; }
function addPermCommand(res) {
  res.findings.forEach(function (g) {
    if (!(PERM_IDS[g.key] || PERM_IDS[g.rule.id]) || g.permCmd) return;
    var fl = permFolders(g, res.env); if (!fl.length) return;
    g.permCmd = fl.map(permCommand);
    g.fix = (g.fix || []).concat(['Если права не выдались через лаунчер: открыть PowerShell от имени администратора (правый клик по «Пуск» → «Терминал (администратор)»), вставить и выполнить: ' + g.permCmd.join(' ; ') + '. Команда даёт пользователям компьютера право на изменение файлов в ' + (fl.length > 1 ? 'этих папках' : 'этой папке') + ', после неё перезапустить лаунчер.']);
  });
}

/* ---------- Сканирование правилами ---------- */
/* Индекс ключевых слов: одна регулярка по всем словам правил вместо indexOf каждого слова для каждой строки.
   Результат тот же, что у прежнего перебора: правило-кандидат — то, чьё слово есть в строке; проверяются в исходном порядке.
   Слова идут от длинных к коротким, поиск сдвигается на 1 символ после совпадения (пересечения не теряются),
   а более короткие слова, которые являются началом найденного, добавляются через карту префиксов. */
function kwIndex(rules) {
  if (rules.__kw && rules.__kw.n === rules.length) return rules.__kw;
  var words = [], byWord = Object.create(null), always = [];
  rules.forEach(function (r, pos) {
    var empty = false;
    r.kws.forEach(function (w) { if (!w) { empty = true; return; } if (!byWord[w]) { byWord[w] = []; words.push(w); } if (byWord[w][byWord[w].length - 1] !== pos) byWord[w].push(pos); });
    if (empty) always.push(pos);
  });
  words.sort(function (a, b) { return b.length - a.length; });
  var pre = Object.create(null);
  words.forEach(function (w) { var lst = []; words.forEach(function (k) { if (w.lastIndexOf(k, 0) === 0) lst.push.apply(lst, byWord[k]); }); pre[w] = lst; });
  var re = words.length ? new RegExp(words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g') : null;
  var idx = { n: rules.length, re: re, pre: pre, always: always, stamp: new Int32Array(rules.length), gen: 0 };
  try { Object.defineProperty(rules, '__kw', { value: idx, configurable: true, writable: true }); } catch (e) { rules.__kw = idx; }
  return idx;
}
function candidates(ix, t) {
  var g = ++ix.gen, out = ix.always.slice(), st = ix.stamp, m, i;
  if (g > 2e9) { st.fill(0); g = ix.gen = 1; }
  for (i = 0; i < out.length; i++) st[out[i]] = g;
  if (ix.re) { ix.re.lastIndex = 0; while ((m = ix.re.exec(t))) { var l = ix.pre[m[0]]; for (i = 0; i < l.length; i++) if (st[l[i]] !== g) { st[l[i]] = g; out.push(l[i]); } ix.re.lastIndex = m.index + 1; } }
  return out.sort(function (a, b) { return a - b; });
}
function scanInit(parsed) { var rules = BY_KIND[parsed.kind]; return { parsed: parsed, rules: rules, groups: new Map(), unk: new Map(), ix: kwIndex(rules), i: 0 }; }
function scanRun(st, n) {
  var es = st.parsed.entries, rules = st.rules, groups = st.groups, unk = st.unk, ix = st.ix, end = Math.min(es.length, st.i + n);
  for (var i = st.i; i < end; i++) {
    var e = es[i], t = e.text, hit = null, m = null, cand = candidates(ix, t);
    for (var ci = 0; ci < cand.length; ci++) {
      var rule = rules[cand[ci]];
      if (rule.nodeIs && e.node !== rule.nodeIs) continue;
      m = rule.re.exec(t); if (!m) continue;
      if (rule.test && !rule.test(m, t, e)) continue;
      hit = rule; break;
    }
    if (hit) {
      e.rid = hit.idx;
      var ref = hit.refine ? hit.refine(m, t) : null;
      e.key = hit.id + (ref && ref.key ? ':' + ref.key : '');
      e.det = hit.detail ? hit.detail(m, t) : '';
      var g = groups.get(e.key);
      if (!g) { g = { key: e.key, rule: hit, rt: ref && ref.rt, rfix: ref && ref.fix && ref.src === 'web' ? ref.fix : null, title: (ref && ref.title) || hit.title, cause: (ref && ref.cause) || hit.cause, fix: (ref && ref.fix) || hit.fix, tpl: hit.tpl || [], src: (ref && ref.src) || hit.src, sev: (ref && ref.sev) || hit.sev, count: 0, entries: [], dets: new Map() }; groups.set(e.key, g); }
      g.count++; if (g.entries.length < 400) g.entries.push(i);
      if (e.det) g.dets.set(e.det, (g.dets.get(e.det) || 0) + 1);
    } else if (e.lvl === 'error' || e.lvl === 'warn') {
      e.sig = signature(e);
      var u = unk.get(e.sig);
      if (!u) { u = { sig: e.sig, sample: t.split(' ⏎ ')[0].slice(0, 300), lvl: e.lvl, count: 0, entries: [] }; unk.set(e.sig, u); }
      u.count++; if (u.entries.length < 200) u.entries.push(i);
    }
  }
  st.i = end;
  return end >= es.length;
}
function scanDone(st) {
  var parsed = st.parsed, kind = parsed.kind, es = parsed.entries, groups = st.groups, unk = st.unk;
  var findings = Array.from(groups.values());
  findings.forEach(function (g) { if (g.rule.warnAt && g.count >= g.rule.warnAt) g.sev = 'warn'; });
  findings.forEach(function (g) { if (g.rule.loopAt && g.count >= g.rule.loopAt) { g.loop = true; g.cause = g.cause + ' Повторилось ' + g.count + ' раз.'; g.fix = ERR_LOOP.concat(g.fix || []); } });
  findings.sort(function (a, b) { return (b.rule.top ? 1 : 0) - (a.rule.top ? 1 : 0) || SEV[b.sev] - SEV[a.sev] || b.count - a.count; });
  var res = { kind: kind, findings: findings, unknown: Array.from(unk.values()).sort(function (a, b) { return b.count - a.count; }), keyed: groups };
  res.mods = modInfo(kind, groups, es);
  if (kind === 'main') res.attempts = mainAttempts(es, parsed);
  else res.stage = clientStage(es, parsed, groups);
  res.patcher = kind === 'client' ? patcherInfo(es) : null;
  if (res.patcher) res.kindName = 'patcher';
  res.verdict = kind === 'main' ? mainVerdict(res, parsed) : res.patcher ? patcherVerdict(res.patcher) : clientVerdict(res, parsed);
  res.env = res.patcher ? patcherEnv(res.patcher) : envInfo(kind, es);
  addPermCommand(res);
  res.root = rootCause(res);
  if (res.root) res.verdict.lines.unshift('Главная причина: ' + res.root.title + '. ' + res.root.why);
  if (res.env && res.verdict.status !== 'ok') {
    res.verdict.lines.push('Окружение: ' + (res.env.platformRu || 'платформа не определена') + (res.env.gpu ? ', ' + res.env.gpu + (res.env.vram ? ' (' + res.env.vram + ' ГБ)' : '') : '') + (res.env.gameVer ? ', сборка игры ' + res.env.gameVer : '') + (res.env.path ? (res.env.pathLabel || ', игра в ') + res.env.path : '') + '.' + (res.env.hints.length ? ' Обратите внимание: ' + res.env.hints.join('; ') + '.' : ''));
  }
  res.range = es.length ? { from: es[0].date ? es[0].date + ' ' + es[0].ts : es[0].ts, to: es[es.length - 1].date ? es[es.length - 1].date + ' ' + es[es.length - 1].ts : es[es.length - 1].ts } : null;
  return res;
}
function scan(parsed) { var st = scanInit(parsed); scanRun(st, Infinity); return scanDone(st); }
/* Разбор большого лога без замирания окна: работа частями по ~25 мс, между ними окно рисуется и принимает клики.
   pause(доля) — функция паузы (возвращает Promise), её даёт интерфейс. */
async function analyzeAsync(text, name, pause) {
  var now = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };
  var st = parseInit(text, name), n = st.lines.length || 1, done = false, t0;
  while (!done) { t0 = now(); while (!done && now() - t0 < 25) done = parseRun(st, 5000); if (!done && pause) await pause(st.i / n * 0.35); }
  var parsed = parseDone(st), ss = scanInit(parsed), m = parsed.entries.length || 1; done = false;
  while (!done) { t0 = now(); while (!done && now() - t0 < 25) done = scanRun(ss, 2000); if (!done && pause) await pause(0.35 + ss.i / m * 0.6); }
  return { parsed: parsed, sc: scanDone(ss) };
}


/* ---------- Окружение, хронология и главная причина ---------- */
var PLAT = { steam: 'Steam', epic: 'Epic Games', rockstar: 'Rockstar Games Launcher' };
var ENVQ = /GPU:|VRAM|Game version|Game path:/i;
function envClient(es) {
  var gpu = '', vram = 0, gver = '', edition = '', path = '';
  for (var i = 0; i < es.length; i++) {
    var t = es[i].text, m;
    if (!ENVQ.test(t)) continue;
    if (!gpu && (m = /GPU:\s*(.+)$/.exec(t))) gpu = m[1].trim();
    else if (!vram && (m = /Dedicated VRAM:\s*(\d+)\s*GB/i.exec(t))) vram = +m[1];
    else if (!gver && (m = /Game version:\s*(\d+)(?:\s+on\s+([\w ]+))?/i.exec(t))) { gver = m[1]; edition = (m[2] || '').trim(); }
    else if (!path && (m = /Game path:\s*(.+)$/.exec(t))) path = m[1].trim();
  }
  if (!gpu && !gver && !path) return null;
  var hints = [];
  if (vram && vram <= 2) hints.push('мало видеопамяти (' + vram + ' ГБ): поставить минимальные настройки графики, закрыть браузер и программы с видео');
  if (/^intel|uhd graphics|vega \d+ graphics|radeon\(tm\) graphics|^amd radeon graphics$/i.test(gpu)) hints.push('игра запущена на встроенной графике (' + gpu + '): на ноутбуке выбрать дискретную видеокарту в Параметры Windows → Дисплей → Графика');
  if (/[^\x00-\x7F]/.test(path)) hints.push('в пути к игре есть не латинские символы, это иногда ломает доступ к файлам: переустановить игру в путь из латиницы');
  if (/onedrive/i.test(path)) hints.push('игра лежит внутри OneDrive: перенести из OneDrive');
  return { platform: '', platformRu: edition, path: path, drive: (/^([a-z]):/i.exec(path) || [])[1] || '', gpu: gpu, vram: vram, gameVer: gver, hints: hints };
}
/* ---------- majestic-patcher.log ---------- */
var PSTEPS = [
  ['admin', /Is running as administrator:\s*(\w+)/, 'Запуск от администратора'],
  ['pirate', /Deleting pirate files/, 'Очистка файлов игры'],
  ['backup', /GTA backup file location/, 'Резервная копия GTA5.exe'],
  ['patch', /Launcher patch completed/, 'Патч игры'],
  ['job', /Attached GTAV\.exe to kill-on-close job/, 'Привязка процесса игры'],
  ['inject', /Injecting Majestic Multiplayer client/, 'Внедрение клиента'],
  ['injected', /Injected DLL successfully/, 'Клиент внедрён'],
  ['entry', /Calling the entrypoint/, 'Запуск клиента'],
  ['finished', /Injection finished/, 'Внедрение завершено'],
  ['window', /Waiting for the GTA V game window/, 'Ожидание окна игры']
];
function patcherInfo(es) {
  var n = 0, hit = 0, i;
  for (i = 0; i < es.length && i < 40; i++) { n++; if (/^(?:\[\w+\]\s*)?MAJESTIC:/.test(es[i].text)) hit++; }
  if (!n || hit < Math.min(3, n)) return null;
  var P = { steps: {}, order: [], admin: null, launcher: '', join: '', errors: [], first: es[0], last: es[es.length - 1] };
  for (var j = 0; j < es.length; j++) {
    var e = es[j], lm = /^\[(\w+)\]\s*/.exec(e.text), t = e.text.replace(/^\[\w+\]\s*/, '').replace(/^MAJESTIC:\s*/, ''), lv = lm ? normLvl(lm[1]) : e.lvl;
    if (lv === 'error' || lv === 'warn') P.errors.push({ ts: e.ts, text: t, i: e.i });
    for (var k = 0; k < PSTEPS.length; k++) {
      var m = PSTEPS[k][1].exec(t);
      if (m && !P.steps[PSTEPS[k][0]]) { P.steps[PSTEPS[k][0]] = e; P.order.push(PSTEPS[k][0]); if (PSTEPS[k][0] === 'admin') P.admin = /true/i.test(m[1]); }
    }
    var l = /Launcher location:\s*(.+)$/.exec(t); if (l) P.launcher = l[1].trim();
    var c = /Connect address is:\s*([^\s,]+)/.exec(t); if (c) P.join = c[1].replace(/[.,]+$/, '');
  }
  return P;
}
function sec(a, b) { function ms(e) { var m = /^(\d+):(\d+):(\d+)/.exec(e.ts); return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 0; } var d = ms(b) - ms(a); return d < 0 ? d + 86400 : d; }
function patcherVerdict(P) {
  var v = { status: 'unk', headline: '', lines: [] }, S2 = P.steps, last = P.order.length ? P.order[P.order.length - 1] : '';
  var slow = [];
  if (S2.pirate && S2.backup) { var d1 = sec(S2.pirate, S2.backup); if (d1 >= 40) slow.push('очистка файлов игры заняла ' + d1 + ' с (антивирус или медленный диск проверяет файлы)'); }
  if (S2.inject && S2.injected) { var d2 = sec(S2.inject, S2.injected); if (d2 >= 30) slow.push('внедрение клиента заняло ' + d2 + ' с (антивирус задерживает процесс)'); }
  if (P.errors.length) {
    v.status = 'bad'; v.headline = 'Патчер сообщил об ошибке: ' + P.errors[0].text.slice(0, 140);
    v.lines.push('Строк с ошибками и предупреждениями: ' + P.errors.length + '. Последний шаг патчера: ' + ((PSTEPS.filter(function (x) { return x[0] === last; })[0] || [0, 0, 'нет'])[2]) + '.');
  } else if (S2.finished) {
    v.status = 'ok'; v.headline = 'Патчер отработал: клиент внедрён, ждёт окно игры';
    v.lines.push('Все шаги пройдены до «Injection finished»' + (P.join ? ', сервер ' + P.join : '') + '. Если игрок всё равно не зашёл, смотрите client.log и main.log: патчер свою часть выполнил.');
  } else {
    v.status = 'bad';
    var why = !S2.patch ? ['патч игры не завершился', 'Антивирус или защита Windows блокирует изменение файлов игры. Добавить папки игры и лаунчера в исключения, запустить лаунчер от администратора.']
      : !S2.injected ? ['клиент не удалось внедрить в процесс игры', 'Внедрение блокирует антивирус или защита Windows (Smart App Control, Defender). Добавить игру и лаунчер в исключения, проверить моды и оверлеи (Discord, MSI Afterburner, GeForce Experience).']
      : ['клиент внедрён, но не запущен', 'Процесс игры мог завершиться сразу после внедрения. Смотрите client.log за это же время и проверьте целостность файлов игры.'];
    v.headline = 'Патчер остановился: ' + why[0]; v.lines.push('Лог обрывается на шаге «' + ((PSTEPS.filter(function (x) { return x[0] === last; })[0] || [0, 0, 'нет'])[2]) + '». ' + why[1]);
  }
  if (P.admin === false) { v.status = v.status === 'ok' ? 'warn' : v.status; v.lines.push('Патчер запущен без прав администратора: запускать лаунчер от имени администратора.'); }
  if (slow.length) v.lines.push('Замечено: ' + slow.join('; ') + '.');
  return v;
}
function patcherEnv(P) {
  var hints = [], path = P.launcher;
  if (/[^\x00-\x7F]/.test(path)) hints.push('в пути к лаунчеру есть не латинские символы (имя пользователя Windows): создать нового пользователя с латинским именем');
  if (P.admin === false) hints.push('нет прав администратора');
  return { platform: '', platformRu: 'Патчер', pathLabel: ', лаунчер ', path: path, drive: (/^([a-z]):/i.exec(path) || [])[1] || '', hints: hints };
}

function envInfo(kind, es) {
  if (kind === 'client') return envClient(es);
  var plat = '', path = '';
  for (var i = 0; i < es.length; i++) {
    var t = es[i].text;
    if (t.indexOf('derivedPlatform') !== -1) {
      var a = /derivedPlatform:\s*'([^']*)'/.exec(t), b = /path:\s*'((?:[^'\\]|\\.)*)'/.exec(t);
      if (a) plat = a[1]; if (b) path = b[1].replace(/\\\\/g, '\\');
    }
  }
  if (!plat && !path) return null;
  var hints = [];
  if (/[^\x00-\x7F]/.test(path)) hints.push('в пути к игре есть не латинские символы, это иногда ломает патчер и доступ к файлам: лучше перенести игру в папку с латинским путём');
  if (/onedrive/i.test(path)) hints.push('игра лежит внутри OneDrive, синхронизация может блокировать файлы: перенести игру из OneDrive');
  if (/^[a-z]:\\program files/i.test(path)) hints.push('игра в Program Files: могут потребоваться права администратора на запись');
  if (/^\\\\/.test(path)) hints.push('игра на сетевом диске: так запускать нельзя, нужен локальный диск');
  return { platform: plat, platformRu: PLAT[plat] || plat, path: path, drive: (/^([a-z]):/i.exec(path) || [])[1] || '', hints: hints };
}
function hasGroup(res, ids) {
  var out = [];
  res.findings.forEach(function (g) { for (var i = 0; i < ids.length; i++) if (g.rule.id === ids[i]) { out.push(g); break; } });
  return out;
}
function rootCause(res) {
  var st = res.verdict.status; if (st === 'ok' || st === 'unk') return null;
  if (res.mods) return null;
  var prot = hasGroup(res, ['m-sac', 'm-gfxinject', 'm-inject', 'm-handle6']);
  if (prot.length) return { id: 'protect', title: 'защита Windows или антивирус блокирует игру', why: 'Найдено: ' + prot.slice(0, 3).map(function (g) { return g.title; }).join('; ') + '. Все эти находки указывают на один источник: запись в память игры или в её файлы запрещена. Чинить нужно защиту, а не игру.' };
  var pm = hasGroup(res, ['m-patchmod']);
  if (pm.length) return { id: 'install', title: 'повреждена или неполная установка лаунчера', why: pm[0].title + ' (' + pm[0].count + ' раз). Сетевые сбои рядом вторичны. Нужно переустановить лаунчер поверх, а антивирус добавить в исключения: он мог удалить файл патчера.' };
  var crashy = hasGroup(res, ['m-crashdet', 'm-patchcrash', 'c-errcode', 'c-zlib', 'c-d3d', 'c-dump', 'c-lastasset']);
  var net = hasGroup(res, ['m-net', 'm-dl', 'm-http5xx', 'c-conn']);
  if (net.length >= 2 && !crashy.length) return { id: 'net', title: 'нестабильное соединение игрока', why: 'Сразу несколько сетевых находок: ' + net.slice(0, 3).map(function (g) { return g.title; }).join('; ') + '. Это одна причина (сеть, VPN, DNS), а не несколько разных поломок.' };
  var loops = res.findings.filter(function (g) { return g.loop; });
  if (loops.length && loops[0].key === 'm-crashdet:ERR_SYS_FILELOAD') return { id: 'loop', title: 'игра стабильно вылетает после запуска', why: 'Краш повторился ' + loops[0].count + ' ' + plur(loops[0].count, 'раз', 'раза', 'раз') + '. Код ERR_SYS_FILELOAD, который пишет лаунчер, причину не называет: нужен client.log одной из этих попыток (Last loaded asset, MINIDUMP) и дамп краша. Пока его нет, базовые шаги: моды, целостность GTA V, драйвер видеокарты.' };
  if (loops.length) return { id: 'loop', title: 'повреждены файлы игры или кеш (ошибка повторяется)', why: loops[0].title + ' повторяется ' + loops[0].count + ' ' + plur(loops[0].count, 'раз', 'раза', 'раз') + '. Разовая очистка не помогла, поэтому нужно проверить целостность GTA V, диск и антивирус.' };
  return null;
}
function plur(n, a, b, c) { var m = n % 100, d = n % 10; return (m > 10 && m < 20) ? c : d === 1 ? a : (d > 1 && d < 5) ? b : c; }
function fmtT(a) { return (a.date ? a.date.slice(5) + ' ' : '') + a.ts.slice(0, 5); }
function timelineLines(res, es) {
  var A = res.attempts || [], L = [], i;
  if (A.length < 2) return L;
  var bad = function (a) { return a.out === 'fail' || a.out === 'crash'; }, good = function (a) { return a.out === 'ok' || a.out === 'patched'; };
  var tail = 0; for (i = A.length - 1; i >= 0 && bad(A[i]); i--) tail++;
  var firstBad = -1; for (i = 0; i < A.length; i++) if (bad(A[i])) { firstBad = i; break; }
  if (firstBad === -1) return L;
  var okBefore = -1; for (i = firstBad - 1; i >= 0; i--) if (good(A[i])) { okBefore = i; break; }
  if (tail >= 2) L.push((tail > 1 && plur(tail, 1, 2, 5) !== 5 ? 'Последние ' + tail + ' попытки' : 'Последние ' + tail + ' попыток') + ' подряд неудачные (с ' + fmtT(A[A.length - tail]) + '): это устойчивая поломка, а не случайность.');
  else if (good(A[A.length - 1])) { var nb = A.filter(bad).length; L.push('Последняя попытка успешна после ' + nb + ' неудачных (' + fmtT(A[A.length - 1]) + '): проблема, похоже, ушла. Уточните у игрока, что он менял между попытками.'); }
  if (okBefore >= 0 && tail >= 1) L.push('Сначала игра запускалась (' + fmtT(A[okBefore]) + '), сбои начались с ' + fmtT(A[firstBad]) + '. Спросите, что изменилось перед этим: обновление игры или Windows, установка модов, драйвер, антивирус.');
  if (!res.mods) {
    var fa = A[firstBad], fms = toMs({ ts: fa.ts, date: fa.date }, 'main'), upd = false;
    for (i = 0; i < es.length; i++) if (es[i].key === 'm-n5') { var d = fms - toMs(es[i], 'main'); if (d >= 0 && d <= 30 * 60000) { upd = true; break; } }
    if (upd) L.push('Незадолго до первого сбоя лаунчер перекачивал файлы (обновление ресурсов). Если сбои начались после обновления, поможет «Очистить кеш» и полная перепроверка файлов.');
  }
  return L;
}

function modInfo(kind, groups, es) {
  var key = kind === 'main' ? 'm-blockmod' : 'c-weapfirst', g = groups.get(key); if (!g) return null;
  var paths = [], names = [], found = false, seen = {};
  for (var i = 0; i < es.length; i++) {
    var e = es[i]; if (e.key !== key) continue;
    if (kind === 'client') { if (e.det && !seen[e.det]) { seen[e.det] = 1; paths.push(e.det); } continue; }
    if (e.text.indexOf('Found blocking mod') !== -1) {
      found = true; var re = /Found blocking mod:?\s*(?:Delete file from game directory\s*)?([^⏎]*)/g, x;
      while ((x = re.exec(e.text))) { var n = x[1].trim().slice(0, 100); if (n && !seen['n' + n]) { seen['n' + n] = 1; names.push(n); } }
    }
    var p = /\(([A-Za-z]:\\[^)]+)\)/.exec(e.text);
    if (p && !seen[p[1]]) { seen[p[1]] = 1; paths.push(p[1]); }
  }
  var base = function (s) { return s.split(/[\\\/\s]/).pop().toLowerCase(); }, have = {};
  paths.forEach(function (p) { have[base(p)] = 1; });
  var files = paths.slice(0, 12);
  names.forEach(function (n) { if (!have[base(n)]) files.push(n); });
  return { kind: kind, files: files.slice(0, 14), found: found, count: g.count, line: es[g.entries[0]].i, key: key };
}

function mainAttempts(es, parsed) {
  var A = [], cur = null;
  function open(e) { if (cur && !cur.out) { cur.out = 'unk'; } cur = { line: e.i, ts: e.ts, date: e.date, out: null, reason: '', message: '', server: '', stage: '', patch: '' }; A.push(cur); }
  for (var i = 0; i < es.length; i++) {
    var e = es[i], t = e.text;
    if (t.indexOf('game.play: zombie process sweep') !== -1) open(e);
    else if (t.indexOf('game launch failed') !== -1) {
      if (!cur || cur.out === 'fail' || cur.out === 'cancel') open(e);
      cur.out = 'fail'; cur.fline = e.i;
      cur.reason = (/reason:\s*'([^']*)'/.exec(t) || [])[1] || '';
      cur.message = msgOf(t);
      cur.server = (/serverId:\s*'([^']*)'/.exec(t) || [])[1] || cur.server;
    } else if (t.indexOf('while game is alive') !== -1) {
      if (!cur || cur.out === 'fail' || cur.out === 'cancel') open(e);
      if (cur.out !== 'fail') cur.out = 'ok';
    } else if (t.indexOf('game.play cancelled') !== -1) {
      if (!cur || cur.out) open(e);
      cur.out = 'cancel'; cur.stage = (/cancelled during (\S+)/.exec(t) || [])[1] || ''; cur.fline = e.i;
    } else if (t.indexOf('pipeline completed') !== -1) {
      if (cur) { cur.patch = /success: true/.test(t) ? 'ok' : ((/error:\s*'([^']*)'/.exec(t) || [])[1] || 'fail'); if (cur.patch === 'ok' && !cur.out) cur.out = 'patched'; }
    } else if (t.indexOf('crashService: crash detected') !== -1) {
      if (!cur) open(e);
      if (cur.out !== 'fail') { cur.out = 'crash'; cur.fline = e.i; cur.reason = 'crash'; cur.message = (/internalError:\s*'([^']*)'/.exec(t) || [])[1] || ''; }
    }
  }
  if (cur && !cur.out) cur.out = 'unk';
  return A;
}

function mainVerdict(res, parsed) {
  var A = res.attempts, ok = 0, fail = 0, crash = 0, cancel = 0, unk = 0, reasons = new Map();
  A.forEach(function (a) {
    if (a.out === 'ok' || a.out === 'patched') ok++;
    else if (a.out === 'fail' || a.out === 'crash') { if (a.out === 'crash') crash++; else fail++; var k = a.out === 'crash' ? 'краш игры ' + (a.message || 'без кода') : (a.reason || '?') + (a.message ? ' / ' + a.message.slice(0, 80) : ''); reasons.set(k, (reasons.get(k) || 0) + 1); }
    else if (a.out === 'cancel') cancel++; else unk++;
  });
  var v = { status: 'unk', headline: '', lines: [], counts: { attempts: A.length, ok: ok, fail: fail + crash, cancel: cancel, unk: unk } };
  if (!A.length) {
    var crit = res.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }), es0 = parsed.entries.filter(function (e) { return e.date; });
    var acts = res.findings.filter(function (g) { return g.sev === 'info'; }).map(function (g) { return g.title + (g.count > 1 ? ' ×' + g.count : ''); });
    var span = '';
    if (es0.length > 1) { var t0 = toMs(es0[0], 'main'), t1 = toMs(es0[es0.length - 1], 'main'), mins = Math.max(0, Math.round((t1 - t0) / 60000)); span = 'Лаунчер работал с ' + fmtT(es0[0]) + ' до ' + fmtT(es0[es0.length - 1]) + ' (' + (mins >= 120 ? Math.round(mins / 60) + ' ч' : mins + ' мин') + ')'; }
    if (crit.length) { v.status = 'warn'; v.headline = 'Запуска игры не было, но лаунчер сообщил о проблеме: ' + crit[0].title; }
    else { v.status = 'unk'; v.headline = 'Лаунчер открывали, но «Играть» не нажимали'; }
    if (span) v.lines.push(span + ', строки запуска игры (game.play) за это время нет.');
    if (crit.length) v.lines.push('Проблемы вне запуска игры: ' + crit.slice(0, 3).map(function (g) { return g.title; }).join('; ') + '. Начните с них: они мешают ещё до нажатия «Играть».');
    if (acts.length) v.lines.push('Что лаунчер делал: ' + acts.slice(0, 4).join('; ') + '.');
    if (!crit.length) v.lines.push('Ошибок в этом логе нет, по нему причину не определить. Каждое «Играть» открывается строкой game.play: zombie process sweep. Попросите игрока нажать «Играть» один раз, запомнить время, дождаться ошибки и сразу прислать лог (или прислать client.log, если игра всё же запускалась).');
    else v.lines.push('Каждое «Играть» открывается строкой game.play: zombie process sweep. Если проблема в самой игре, попросите нажать «Играть» один раз, дождаться ошибки и сразу прислать лог.');
    return v;
  }
  var last = A[A.length - 1];
  if (last.out === 'ok') { v.status = 'ok'; v.headline = 'Последняя попытка успешна: игра запущена'; }
  else if (last.out === 'patched') { v.status = 'ok'; v.headline = 'Последняя попытка: патчер отработал, запуск не оборвался'; }
  else if (last.out === 'fail') { v.status = 'bad'; v.headline = 'Последняя попытка закончилась отказом: ' + last.reason + (last.message ? ' (' + last.message.slice(0, 90) + ')' : ''); }
  else if (last.out === 'crash') { v.status = 'bad'; v.headline = 'Последняя попытка: игра запустилась и упала' + ' (' + (last.message || 'без кода ошибки') + ')'; }
  else if (last.out === 'cancel') { v.status = 'warn'; v.headline = 'Последняя попытка отменена' + (last.stage ? ' на стадии ' + last.stage : '') + (last.patch && last.patch !== 'ok' ? '; патчер: ' + last.patch : ''); }
  else {
    v.status = 'unk'; v.headline = 'Последняя попытка без итога: лог снят во время запуска';
    var lastE = parsed.entries[parsed.entries.length - 1], dur = lastE && lastE.date && last.date ? Math.round((toMs(lastE, 'main') - toMs({ ts: last.ts, date: last.date }, 'main')) / 1000) : null;
    v.lines.push('Попытка началась в ' + fmtT(last) + (last.stage ? ', последняя стадия: ' + last.stage : '') + (dur != null ? ', лог заканчивается через ' + dur + ' с' : '') + '. Итога (запуск, отказ или отмена) в логе нет: скорее всего, лог скопировали, пока игра ещё запускалась, или лаунчер закрыли. Попросите дождаться входа или ошибки и прислать лог заново.');
  }
  v.lines.push('Попыток запуска: ' + A.length + ' (успешных ' + ok + ', отказов ' + fail + (crash ? ', крашей игры ' + crash : '') + ', отмен ' + cancel + (unk ? ', без итога ' + unk : '') + ').');
  if (reasons.size) v.lines.push('Причины неудач: ' + Array.from(reasons.entries()).map(function (x) { return x[0] + ' ×' + x[1]; }).join('; ') + '.');
  var bm = res.keyed.get('m-blockmod');
  if (res.mods) { v.lines.unshift('ПРИОРИТЕТ: в папке игры найдены моды (' + res.mods.files.slice(0, 4).join('; ') + '). Любой мод вне папки модификаций лаунчера это главная причина крашей и незапуска, сначала уберите его.'); if (v.status === 'unk') v.status = 'warn'; }
  if (bm && A.some(function (a) { return /ERR_GAME_CRASHED/.test(a.message); })) {
    var files = new Set(); parsed.entries.forEach(function (e) { if (e.rid >= 0 && RULES[e.rid].id === 'm-blockmod' && e.text.indexOf('Found blocking mod') !== -1) { var re = /Found blocking mod:?\s*(?:Delete file from game directory\s*)?([^⏎]*)/g, x; while ((x = re.exec(e.text))) files.add(x[1].trim().slice(0, 100)); } });
    if (files.size) v.lines.push('Вероятная причина: перед ERR_GAME_CRASHED патчер называет файлы мода в папке игры (Found blocking mod): ' + Array.from(files).slice(0, 4).join('; ') + '. По руководству сначала нужно убрать их или перенести в папку модификаций лаунчера.');
  }
  if (last.out === 'ok' || last.out === 'patched') {
    var after = {}; parsed.entries.forEach(function (e) { if (e.key && e.i >= last.line) after[e.key] = 1; });
    var before = res.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn && !g.rule.top && !/mod/.test(g.rule.id) && g.count > 0 && !after[g.key]; });
    before.forEach(function (g) { g.before = true; });
    if (before.length) {
      v.lines.push('Проблемы, найденные в логе, были до последней успешной попытки и в ней не повторились: ' + before.slice(0, 3).map(function (g) { return g.title; }).join('; ') + '. Если игрок жалуется сейчас, нужен свежий лог.');
    }
  }
  timelineLines(res, parsed.entries).forEach(function (x) { v.lines.push(x); });
  if (ok && (fail || crash)) v.lines.push('Часть попыток закончилась успешно, значит проблема нестабильная: сравните время неудач с действиями игрока.');
  if (A.some(function (a) { return a.out === 'patched'; })) v.lines.push('Пометка «патчер отработал» значит, что патч и внедрение прошли. Строки while game is alive (прямое подтверждение запуска) при этом нет.');
  return v;
}

function clientStage(es, parsed, groups) {
  var st = { started: null, connected: null, dump: null, shut: null, inited: null, ctx: [] };
  for (var i = 0; i < es.length; i++) {
    var e = es[i], t = e.text;
    if (t.indexOf('Majestic Multiplayer inited') !== -1 && !st.inited) st.inited = e;
    else if (t.indexOf('Game Started in') !== -1) st.started = e;
    else if (t.indexOf('Connected with id') !== -1) st.connected = e;
    else if (t.indexOf('MINIDUMP: Temporary dump saved') !== -1 && !st.dump) {
      st.dump = e;
      for (var k = i + 1; k < es.length && k < i + 12; k++) {
        var x = es[k].text;
        if (/Last (loaded asset|pos|deleted vehicle model|dynamic object created|str desctutor hash)|Texture info/.test(x)) st.ctx.push({ line: es[k].i, text: x });
      }
    } else if (t.lastIndexOf('Shutting down', 0) === 0) st.shut = e;
  }
  return st;
}

/* Что было прямо перед MINIDUMP: пул, окно интерфейса, ошибка скрипта */
function preDumpHints(parsed, st) {
  var es = parsed.entries, di = st.dump ? parsed.lineEntry[st.dump.i] : -1, out = { lines: [], pool: '' };
  if (di < 0) return out;
  var dt = toMs(st.dump, 'client'), cef = false, js = null;
  for (var k = di - 1, n = 0; k >= 0 && n < 25; k--) {
    var e = es[k], gap = dt - toMs(e, 'client'); if (gap < 0) gap += 86400000; if (gap > 60000) break;
    if (e.rid >= 0 && RULES[e.rid].id === 'c-pool' && !out.pool) out.pool = e.det;
    if (n < 6 && (e.node === 'web' || /^\[web\]/.test(e.text)) && /Removing cef impl|Add view store entry|Creating (?:web)?view|destroy(?:ing)? view/i.test(e.text)) cef = true;
    if (!js && gap <= 15000 && e.lvl === 'error' && /js\.script|\.js:\d+|TypeError|ReferenceError|RangeError/.test(e.node + ' ' + e.text)) {
      var rid = e.rid >= 0 ? RULES[e.rid].id : '';
      if (rid === 'c-n-stack' || /^\s*at\s/.test(e.text)) { for (var h = k - 1; h >= 0 && h > k - 30; h--) { if (es[h].lvl === 'error' && !/^\s*at\s/.test(es[h].text)) { js = es[h]; break; } } if (!js) js = e; }
      else if (!(e.rid >= 0 && RULES[e.rid].sev === 'noise')) js = e;
    }
    n++;
  }
  if (out.pool) out.lines.push('Перед дампом движок сообщил, что переполнен пул «' + out.pool + '». Это прямая причина вылета на стороне клиента, а не компьютера игрока: передать разработчикам имя пула и время.');
  if (cef) out.lines.push('Дамп записан сразу после того, как открылось или закрылось окно интерфейса сервера (встроенный браузер). Шаги: закрыть оверлеи; в Windows отключить «Планирование графического процессора с аппаратным ускорением» (Параметры → Система → Дисплей → Графика); на ноутбуке задать игре и лаунчеру «Высокая производительность»; обновить драйвер видеокарты.');
  if (js) out.lines.push('За ' + Math.max(1, Math.round(((dt - toMs(js, 'client') + 86400000) % 86400000) / 1000)) + ' с до дампа упал скрипт сервера (строка ' + (js.i + 1) + '): ' + js.text.split(' ⏎ ')[0].slice(0, 140) + '. Если вылет повторяется в том же действии, передать строку разработчикам.');
  return out;
}

function uniqRule(gs) { var seen = {}; return gs.filter(function (g) { if (seen[g.rule.id]) return false; seen[g.rule.id] = 1; return true; }); }

function clientVerdict(res, parsed) {
  var st = res.stage, crits = res.findings.filter(function (g) { return g.sev === 'crit' && g.rule.id !== 'c-dump' && g.rule.id !== 'c-conn'; });
  var v = { status: 'unk', headline: '', lines: [] };
  var started = st.started ? (/Game Started in (\d+) ms/.exec(st.started.text) || [])[1] : null;
  if (st.connected) {
    if (crits.length) { v.status = 'warn'; v.headline = 'Игрок подключился к серверу, но в логе был код ошибки'; v.lines.push('Код: ' + uniqRule(crits).map(function (g) { return g.title; }).join('; ') + '. Игра после этого всё же дошла до Connected. Лаунчер включает самовосстановление, возможно вылет был на предыдущем заходе.'); }
    else if (st.dump) { var ph0 = preDumpHints(parsed, st); v.status = 'warn'; v.headline = ph0.pool ? 'Вылет посреди игры: переполнен пул движка (' + ph0.pool + ')' : 'Игрок зашёл на сервер, но клиент потом упал (MINIDUMP)'; v.lines.push('Подключение к серверу было (Connected), затем клиент записал дамп краша. Это вылет посреди игры, а не проблема захода: смотрите дамп и журнал Windows, они покажут модуль и причину.'); ph0.lines.forEach(function (x) { v.lines.push(x); }); }
    else { v.status = 'ok'; v.headline = 'Заход успешный: клиент подключился к серверу'; v.lines.push('Есть Game Started' + (started ? ' (' + Math.round(started / 1000) + ' с)' : '') + ' и Connected with id. Метки [Error] в этом логе это шум, диагноз по ним не ставится.'); }
    return v;
  }
  var conn = res.keyed.get('c-conn');
  if (conn) {
    v.status = 'bad'; v.headline = 'Подключение к серверу не удалось: ' + ([].concat(Array.from(conn.dets.keys()))[0] || 'нет ответа');
    v.lines.push('Игра запущена' + (st.started ? ' (Game Started есть)' : '') + ', но клиент не получил ответ от сервера и до Connected не дошёл. Это соединение игрока, а не вылет игры.');
    return v;
  }
  if (crits.length) {
    v.status = 'bad'; v.headline = (crits[0].rule && crits[0].rule.id === 'c-uta' ? 'Интерфейс не отобразился: ' : 'Вылет с кодом ошибки: ') + crits[0].title;
    v.lines.push(st.started ? 'Движок успел запуститься (Game Started), до подключения к серверу не дошло.' : 'Вылет до Game Started, то есть на загрузке ресурсов.');
    return v;
  }
  if (st.dump) {
    v.status = 'bad';
    var ph = preDumpHints(parsed, st);
    var dt = st.inited ? Math.round((toMs(st.dump, 'client') - toMs(st.inited, 'client')) / 100) / 10 : null;
    if (!st.started) { v.headline = 'Краш на старте игры (MINIDUMP), кода ERR_ нет'; v.lines.push('Клиент инициализировался' + (dt != null ? ', через ' + dt + ' с сохранился дамп' : '') + ', Game Started не наступил. Код ERR_… в логе отсутствует.'); v.lines.push('При вылетах на старте помогает закрыть всё лишнее: оверлеи (Discord, RivaTuner, OBS), программы записи и мониторинга. На видеокартах NVIDIA известный виновник падений на старте мультиплееров — служба «NVIDIA Display Container LS»: её можно на время остановить в «Службах» Windows и проверить запуск.'); }
    else { v.headline = 'Краш после запуска игры (MINIDUMP), кода ERR_ нет'; v.lines.push('Game Started был, подключения к серверу (Connected) нет.'); }
    v.lines.push('Диагноз по руководству ставится по коду ERR_…, а его нет. Идти по базовой диагностике: моды, целостность файлов, settings.xml, драйвер; если вылет повторяется, передать дамп и client.log.');
    if (ph.pool) v.headline = 'Краш: переполнен пул движка (' + ph.pool + ')';
    ph.lines.forEach(function (x) { v.lines.splice(v.lines.length - 1, 0, x); });
    return v;
  }
  if (st.started) { v.status = 'warn'; v.headline = 'Игра запущена, но подключения к серверу в логе нет'; v.lines.push('Нет ни Connected with id, ни краша, ни ERR_… Возможно, игрок закрыл игру сам или клиент завис при подключении: смотрите, что было после Game Started и есть ли ошибки сети.'); return v; }
  v.status = 'unk'; v.headline = 'Запуск оборвался до загрузки игры, причина в этом логе не видна';
  v.lines.push('Нет ни Game Started, ни ERR_…, ни MINIDUMP. Проверьте, что файл относится к нужной попытке (время совпадает с жалобой), и просмотрите main.log той же попытки.');
  return v;
}

/* ---------- База знаний (самообучение) ---------- */
function newKB() { return { v: 1, sigs: {}, ruleNotes: {}, seen: {}, files: 0, custom: [], tags: {}, hist: {}, merged: {}, settings: {} }; }

function outcomeOf(scanRes) {
  var s = scanRes.verdict.status;
  return s === 'ok' ? 'ok' : s === 'bad' ? 'bad' : 'unk';
}

/* Обучение: для каждой неопознанной строки считаем, в скольких успешных и неуспешных файлах она встречалась */
function learn(kb, fileHash, scanRes) {
  if (kb.seen[fileHash]) return false;
  kb.seen[fileHash] = 1; kb.files++;
  var oc = outcomeOf(scanRes);
  scanRes.unknown.forEach(function (u) {
    var key = scanRes.kind + '|' + u.sig, r = kb.sigs[key];
    if (!r) r = kb.sigs[key] = { kind: scanRes.kind, sig: u.sig, sample: u.sample, lvl: u.lvl, ok: 0, bad: 0, unk: 0, hits: 0, label: '', note: '' };
    r.hits += u.count;
    if (oc === 'ok') r.ok++; else if (oc === 'bad') r.bad++; else r.unk++;
  });
  return true;
}

/* Вердикт по сигнатуре: ручная метка важнее статистики */
function classify(rec) {
  if (!rec) return { cls: 'new', text: 'новая' };
  if (rec.label === 'noise') return { cls: 'noise', text: 'шум (отметили вы)' };
  if (rec.label === 'problem') return { cls: 'problem', text: 'проблема (отметили вы)' };
  if (rec.ok >= 2 && rec.bad === 0) return { cls: 'noise', text: 'похоже на шум: есть в ' + rec.ok + ' успешных заходах, в сбойных нет' };
  if (rec.ok >= 1 && rec.bad === 0) return { cls: 'maybe-noise', text: 'есть в успешном заходе, в сбойных не встречалась (пока 1 файл)' };
  if (rec.bad >= 2 && rec.ok === 0) return { cls: 'suspect', text: 'кандидат в причину: есть в ' + rec.bad + ' сбойных заходах, в успешных нет' };
  if (rec.bad >= 1 && rec.ok === 0) return { cls: 'maybe-suspect', text: 'встречалась только в сбойном заходе (пока 1 файл)' };
  if (rec.ok && rec.bad) return { cls: 'mixed', text: 'есть и в успешных (' + rec.ok + '), и в сбойных (' + rec.bad + ') заходах: сама по себе не причина' };
  return { cls: 'new', text: 'недостаточно данных' };
}

/* Проставить серьёзность каждой записи с учётом базы знаний */
function applyKB(parsed, sc, kb) {
  var es = parsed.entries, i;
  sc.unknown.forEach(function (u) {
    var rec = kb && kb.sigs[sc.kind + '|' + u.sig];
    u.rec = rec || null; u.cls = classify(rec);
    u.sev = (u.cls.cls === 'noise') ? 'noise' : (u.cls.cls === 'problem' || u.cls.cls === 'suspect') ? 'err' : (u.lvl === 'error' ? 'unk' : 'unk');
  });
  var usev = new Map(); sc.unknown.forEach(function (u) { usev.set(u.sig, u.sev); });
  var sevByKey = new Map(); sc.findings.forEach(function (g) { sevByKey.set(g.key, g.sev); });
  var lineSev = new Uint8Array(parsed.lines.length);
  for (i = 0; i < es.length; i++) {
    var e = es[i], s = 'none';
    if (e.rid >= 0) s = sevByKey.get(e.key) || 'none';
    else if (e.sig) s = usev.get(e.sig) || 'unk';
    e.sev = SEV[s];
    if (e.sev) for (var l = e.i; l <= e.j; l++) lineSev[l] = e.sev;
  }
  parsed.lineSev = lineSev;
}

/* ---------- Свои правила (из интерфейса) ---------- */
var BUILTIN = RULES.length;
function customRe(p) {
  var m = /^\/(.+)\/([a-z]*)$/.exec(p);
  if (m) return new RegExp(m[1], m[2].replace(/[^imsu]/g, '') || 'i');
  return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
function setCustomRules(list) {
  RULES.length = BUILTIN;
  BY_KIND.main = BY_KIND.main.filter(function (r) { return !r.custom; });
  BY_KIND.client = BY_KIND.client.filter(function (r) { return !r.custom; });
  var bad = 0;
  (list || []).forEach(function (c) {
    if (!c || !c.pattern || (c.kind !== 'main' && c.kind !== 'client')) { bad++; return; }
    var re; try { re = customRe(String(c.pattern)); } catch (e) { bad++; return; }
    var r = { id: 'u-' + c.id, kind: c.kind, kw: '', kws: [''], re: re, sev: SEV[c.sev] ? c.sev : 'err', src: c.team ? 'team' : 'user', custom: true,
      title: c.title || String(c.pattern).slice(0, 80), cause: c.cause || '', fix: c.fix || [], tpl: [],
      detail: function (m, t) { return t.split(' ⏎ ')[0].slice(0, 200); }, idx: RULES.length };
    RULES.push(r); BY_KIND[c.kind].unshift(r);
  });
  return bad;
}

/* ---------- Ответ игроку ---------- */
var STAFF = /^(Уточнить|Попросить|Передать|Отправить шаблон|Смотреть|Прочитать|При передаче|При повторении|Предупредить|Сказать|Открыть client\.log|Если решения нет|Если не помогло: передать|Файл GTA V:|Файл Majestic:)/;
var REPLY = {
  'm-timeout': ['Откройте Rockstar Games Launcher (или Steam/Epic) вручную и дождитесь полной загрузки, потом нажмите «Играть» в Majestic.', 'Снимите галку «Запускать от имени администратора» у платформы и у GTA5.exe (свойства файла → Совместимость).', 'Закройте зависшие процессы платформы в диспетчере задач (Rockstar Games Launcher, RockstarService.exe, SocialClubHelper.exe, GTA5.exe) и повторите запуск.'],
  'm-platform': ['Переустановите платформу, на которой куплена игра (Steam, Rockstar Games Launcher или Epic Games), поверх текущей — ничего не удаляя: скачайте установщик с официального сайта и установите в ту же папку. Игра и библиотека останутся на месте.', 'Перезагрузите компьютер, откройте платформу один раз сами (войдите в аккаунт и дождитесь обновлений), затем запустите игру через лаунчер Majestic.'],
  'm-busy': ['Закройте в диспетчере задач Rockstar Games Launcher, RockstarService.exe, GTA5.exe и SocialClubHelper.exe.', 'Запустите Majestic от имени администратора и нажмите «Играть».'],
  'm-patchmod': ['Добавьте папку лаунчера (AppData\\Local\\MajesticLauncher) в исключения антивируса и Защитника Windows, проверьте карантин антивируса.', 'Удалите папку лаунчера и установите лаунчер заново с официального сайта.'],
  'm-patcherr': null,
  'm-patchcrash': ['Закройте процессы Rockstar (Rockstar Games Launcher, RockstarService.exe, SocialClubHelper.exe, GTA5.exe) и запустите Majestic от имени администратора.', 'Добавьте папки игры и лаунчера в исключения антивируса.'],
  'm-crashdet': ['Проверьте папку GTA V: в ней не должно быть модов (dxgi.dll, ReShade, ENB, DLSS-файлов nvngx_*.dll и т.п.). Перенесите их в папку модификаций лаунчера или удалите.', 'Запустите проверку файлов игры в вашей платформе (Steam/Epic/Rockstar), обновите драйвер видеокарты.', 'Если игра падает снова, пришлите свежие main.log и client.log.'],
  'c-zlib': ['Проверьте целостность файлов GTA V в вашей платформе.', 'В настройках лаунчера очистите кеш и перепроверьте файлы Majestic.'],
  'c-asset': ['Проверьте целостность файлов GTA V в вашей платформе.', 'В настройках лаунчера очистите кеш и перепроверьте файлы Majestic.'],
  'c-d3d': ['Обновите драйвер видеокарты (лучше чистая установка).', 'Уберите графические моды (Redux, ReShade, ENB, замену текстур), если они стоят.', 'Проверьте целостность файлов игры и сбросьте настройки графики (удалите settings.xml в Documents\\Rockstar Games\\GTA V).'],
  'c-mem': ['Уберите сторонние сборки и графические моды, перенесите разрешённые моды из корня игры в папку модификаций лаунчера.', 'Проверьте целостность файлов GTA V и увеличьте файл подкачки Windows.'],
  'c-dump': ['Уберите моды из папки игры, проверьте целостность файлов GTA V, обновите драйвер видеокарты.', 'Сбросьте настройки графики (удалите settings.xml в Documents\\Rockstar Games\\GTA V).', 'Если краш повторится, пришлите папку краш-дампов: Win+R → %appdata%\\majestic-launcher\\Multiplayer\\crashdumps.'],
  'c-errcode': ['Проверьте целостность файлов игры, уберите моды, обновите драйвер видеокарты.', 'Если ошибка остаётся, пришлите код ошибки со скриншота и свежие main.log и client.log.'],
  'c-weapfirst': ['В игре обнаружены сторонние моды на оружие. Удалите их (в том числе из папки игры) и проверьте целостность файлов GTA V.'],
  'c-conn': ['Проверьте интернет, отключите VPN и прокси, при необходимости смените DNS на 8.8.8.8 / 1.1.1.1.', 'Попробуйте зайти позже или на другой сервер.'],
  'c-join-timeout': ['Проверьте интернет, отключите VPN и прокси, при необходимости смените DNS на 8.8.8.8 / 1.1.1.1.'],
  'm-auth401': ['Проверьте логин и пароль (раскладка, Caps Lock) и заново пройдите капчу. Если пароль забыт, восстановите его через сайт.'],
  'm-cancel': ['Нажмите «Играть» ещё раз и не прерывайте запуск до входа в игру.'],
  'm-srvfiles': ['Проверьте свободное место на диске с игрой и права на запись в папку, затем повторите запуск.'],
  'm-install': ['Укажите папку игры в настройках лаунчера заново или проверьте целостность файлов GTA V.'],
  'm-sac': ['Перейдите в «Параметры» → «Конфиденциальность и безопасность» → «Безопасность Windows» → «Управление приложениями и браузером».', 'Нажмите «Параметры службы: Интеллектуальное управление приложениями».', 'Выберите режим «Отключено».', 'Перезагрузите компьютер и запустите игру.'],
  'm-gpu': ['Обновите драйвер видеокарты и перезапустите лаунчер. Закройте программы с оверлеями и записью экрана.']
};
REPLY['m-patcherr'] = REPLY['m-crashdet'];
REPLY['m-crashdet:ERR_SYS_FILELOAD'] = ['Проверьте папку GTA V: в ней не должно быть модов (dxgi.dll, ReShade, ENB, DLSS-файлов nvngx_*.dll и т.п.). Перенесите их в папку модификаций лаунчера или удалите.', 'Запустите проверку файлов игры в вашей платформе (Steam/Epic/Rockstar), обновите драйвер видеокарты.', 'Если игра снова вылетит, сразу пришлите client.log и файл краш-отчёта: Win+R → %appdata%\\majestic-launcher\\Multiplayer\\crashdumps (самый свежий файл).'];
REPLY['m-srvfiles:net'] = ['Загрузка файлов сервера оборвалась из-за связи: проверьте интернет, отключите VPN и прокси, добавьте лаунчер в исключения фаервола и антивируса, затем повторите запуск.'];
REPLY['m-srvfiles:bad'] = ['Файл сервера скачался повреждённым: в настройках лаунчера очистите кеш и дождитесь полной перепроверки файлов, затем повторите запуск.'];
REPLY['m-srvfiles:space'] = ['На диске с игрой закончилось место: освободите несколько гигабайт (или выберите другой диск для файлов лаунчера) и повторите запуск.'];
REPLY['c-platform'] = REPLY['m-platform'];
function replySteps(g) {
  if (REPLY[g.key]) return REPLY[g.key];
  if (g.rfix && (g.rule.id === 'c-errcode' || g.rule.id === 'm-crashdet')) { var rf = g.rfix.filter(function (x) { return !STAFF.test(x); }); if (rf.length) return rf; }
  var base = REPLY[g.rule.id];
  if (base) return base;
  var f = (g.fix || []).filter(function (x) { return !STAFF.test(x); });
  return f;
}
var REPLY_BYE = 'Выполните шаги выше, перезапустите лаунчер и напишите, получилось ли. Если проблема останется, пришлите свежие main.log и client.log.';
function composeReply(sc, o) {
  o = o || {};
  var hello = o.hello || 'Здравствуйте!', bye = o.bye || REPLY_BYE;
  var L = [hello, ''], n = 0, used = {};
  var probs = sc.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  var mf = (sc.mods ? sc.mods.files.slice() : []), seenB = {};
  (o.folderMods || []).forEach(function (x) { mf.push(x); });
  mf = mf.filter(function (x) { var b = String(x).split(/[\\\/]/).filter(Boolean).pop().toLowerCase(); if (seenB[b]) return false; seenB[b] = 1; return true; });
  if (o.only) { probs = probs.filter(function (g) { return g.key === o.only; }); if (o.only !== 'mods') mf = []; }
  if (mf.length) {
    n++;
    L.push('Главная причина: в папке с игрой лежат сторонние файлы (моды):');
    mf.slice(0, 8).forEach(function (x) { L.push('  • ' + x); });
    L.push('С ними игра не запускается или вылетает. Перенесите эти файлы в папку модификаций лаунчера или удалите их из папки GTA V, затем запустите игру снова. Проверка файлов игры такие моды не убирает.');
    L.push('');
    probs = probs.filter(function (g) { return g.rule.id !== 'm-blockmod' && g.rule.id !== 'c-weapfirst'; });
  }
  if (o.only === 'mods') probs = [];
  var shown = 0, strong = probs.filter(function (g) { return SEV[g.sev] >= SEV.err; });
  if (strong.length) probs = strong;
  var firsts = {};
  probs.forEach(function (g) {
    if (shown >= 3 || used[g.rule.id]) return;
    var steps = replySteps(g);
    if (steps.length && firsts[steps[0]]) return;
    if (mf.length && (g.rule.id === 'm-patcherr' || g.rule.id === 'm-crashdet') ) return;
    if (steps.length) firsts[steps[0]] = 1; if (!steps.length && !(o.kb && o.kb.ruleNotes[g.key])) return;
    used[g.rule.id] = 1; shown++; n++;
    L.push((mf.length ? 'Также: ' : 'Проблема: ') + (g.rt ? g.rt.charAt(0).toUpperCase() + g.rt.slice(1) : g.title));
    steps.forEach(function (x, i) { L.push('  ' + (i + 1) + '. ' + x); });
    var nt = o.kb && o.kb.ruleNotes[g.key]; if (nt) L.push('  Что ещё помогало: ' + nt.replace(/\s+/g, ' ').slice(0, 300));
    L.push('');
  });
  if (o.extra && !o.only) o.extra.slice(0, 2).forEach(function (x) {
    if (!x || !x.title || !x.steps || !x.steps.length) return; n++;
    L.push((n > 1 ? 'Также: ' : 'Проблема: ') + x.title);
    x.steps.slice(0, 4).forEach(function (s, i) { L.push('  ' + (i + 1) + '. ' + s); }); L.push('');
  });
  if (!n) {
    if (sc.verdict.status === 'ok') L.push('В присланном логе ошибок запуска нет: игра запустилась и подключилась к серверу. Опишите, что именно не работает, и пришлите лог за момент проблемы.');
    else L.push('По присланному логу точную причину определить не удалось. Пришлите, пожалуйста, свежие main.log и client.log сразу после неудачной попытки запуска, а также скриншот ошибки, если она появляется.');
    L.push('');
  }
  L.push(bye);
  return L.join('\n');
}

/* ---------- Сравнение двух разборов ---------- */
function diffScans(a, b) {
  var ka = {}, kb = {};
  a.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).forEach(function (g) { ka[g.key] = g; });
  b.findings.filter(function (g) { return SEV[g.sev] >= SEV.warn; }).forEach(function (g) { kb[g.key] = g; });
  var only = function (x, y) { return Object.keys(x).filter(function (k) { return !y[k]; }).map(function (k) { return x[k]; }); };
  var both = Object.keys(ka).filter(function (k) { return kb[k]; }).map(function (k) { return { a: ka[k], b: kb[k] }; });
  var ma = a.mods ? a.mods.files.slice() : [], mb = b.mods ? b.mods.files.slice() : [];
  return { gone: only(ka, kb), fresh: only(kb, ka), both: both,
    modsGone: ma.filter(function (x) { return mb.indexOf(x) < 0; }), modsFresh: mb.filter(function (x) { return ma.indexOf(x) < 0; }), modsKept: ma.filter(function (x) { return mb.indexOf(x) >= 0; }),
    sa: a.verdict.status, sb: b.verdict.status, ha: a.verdict.headline, hb: b.verdict.headline };
}

/* ---------- Проверка папки игры ---------- */
var STD_FILES = ['gta5.exe', 'playgtav.exe', 'gtavlauncher.exe', 'gtavlanguageselect.exe', 'bink2w64.dll', 'd3dcompiler_46.dll', 'd3dcsx_46.dll', 'gfsdk_shadowlib.win64.dll', 'gfsdk_txaa.win64.dll', 'gfsdk_txaa_alpharesolve.win64.dll', 'nvpmapi.core.win64.dll', 'cudart64_65.dll', 'steam_api64.dll', 'eossdk-win64-shipping.dll', 'amd_ags_x64.dll', 'common.rpf', 'x64a.rpf', 'x64b.rpf', 'x64c.rpf', 'x64d.rpf', 'x64e.rpf', 'x64f.rpf', 'x64g.rpf', 'x64h.rpf', 'x64i.rpf', 'x64j.rpf', 'x64k.rpf', 'x64l.rpf', 'x64m.rpf', 'x64n.rpf', 'x64o.rpf', 'x64p.rpf', 'x64q.rpf', 'x64r.rpf', 'x64s.rpf', 'x64t.rpf', 'x64u.rpf', 'x64v.rpf', 'x64w.rpf', 'steam_appid.txt', 'installscript.vdf', 'index.bin', 'version.txt', 'readme.txt', 'eula.txt', 'uninstall.exe', 'gta5_be.exe', 'gta5_eac.exe'];
var MOD_DLL = { 'dxgi.dll': 'ReShade / ENB (подмена DirectX)', 'd3d11.dll': 'ReShade / ENB (подмена DirectX)', 'd3d9.dll': 'ReShade (подмена DirectX)', 'd3d10.dll': 'графический мод', 'dinput8.dll': 'ASI-загрузчик / ScriptHook', 'version.dll': 'ASI-загрузчик', 'winmm.dll': 'ASI-загрузчик', 'dsound.dll': 'ASI-загрузчик', 'xinput1_3.dll': 'мод', 'xinput9_1_0.dll': 'мод', 'openiv.asi': 'OpenIV', 'scripthookv.dll': 'ScriptHookV', 'd3dcompiler_47.dll': 'ReShade / ENB (в стандартной игре нет)', 'opengl32.dll': 'графический мод', 'nvngx_dlssnr.dll': 'NVIDIA DLSS (сторонний файл)', 'nvngx_dlss.dll': 'NVIDIA DLSS (сторонний файл)', 'nvngx_dlssg.dll': 'NVIDIA DLSS (сторонний файл)' };
var MOD_NAME = [[/^reshade.*\.(ini|log|dll)$/i, 'ReShade'], [/^enb.*\.(ini|dll|fx)$/i, 'ENB'], [/^scripthookvdotnet.*/i, 'ScriptHookVDotNet'], [/\.asi$/i, 'ASI-плагин'], [/^nvngx.*\.dll$/i, 'NVIDIA DLSS (сторонний файл)'], [/^commandline\.txt$/i, 'commandline.txt (параметры запуска, часто остаётся от Redux — удалить)'], [/^(menyoo|trainer|nativetrainer).*/i, 'трейнер'], [/^dlss.*\.dll$/i, 'DLSS']];
var MOD_DIR = { mods: 'папка mods (OpenIV)', scripts: 'папка scripts (скрипты)', plugins: 'папка plugins', 'reshade-shaders': 'шейдеры ReShade', 'reshade-presets': 'пресеты ReShade', enbseries: 'ENB', openiv: 'OpenIV', lspdfr: 'LSPDFR', 'x64\\patch': 'патч в x64' };
function gameFolder(entries) {
  var mods = [], unknown = [], seenN = {};
  entries.forEach(function (e) {
    var n = e.name, l = n.toLowerCase(); if (seenN[l]) return; seenN[l] = 1;
    if (e.dir) { if (MOD_DIR[l]) mods.push({ name: n + '\\', why: MOD_DIR[l], dir: true }); return; }
    if (MOD_DLL[l]) { mods.push({ name: n, why: MOD_DLL[l] }); return; }
    for (var i = 0; i < MOD_NAME.length; i++) if (MOD_NAME[i][0].test(n)) { mods.push({ name: n, why: MOD_NAME[i][1] }); return; }
    if (STD_FILES.indexOf(l) >= 0) return;
    if (/\.(dll|asi|exe|ini|lua|cfg|cs|bat|vbs)$/i.test(n)) unknown.push({ name: n, why: 'нет в списке стандартных файлов GTA V, проверьте' });
  });
  return { mods: mods, unknown: unknown, total: entries.length };
}
function guessGamePaths(parsed) {
  var cnt = {}, txt = parsed.lines.join('\n'), re = /([A-Za-z]:(?:\\\\|\\|\/)[^'"()\r\n<>|*?]*?(?:GTAV|GTA ?5[^\\\/'"]*|Grand Theft Auto V?[^\\\/'"]*))(?=[\\\/'"() ]|$)/g, m;
  while ((m = re.exec(txt))) {
    var p = m[1].replace(/\\\\/g, '\\');
    if (/majestic|appdata|rockstar games\\social|documents/i.test(p)) continue;
    cnt[p] = (cnt[p] || 0) + 1;
  }
  return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 4);
}


/* ---------- Повторяющиеся проблемы: отчёты ---------- */
function histTime(e) {
  var t = e.from && /^\d{4}-\d\d-\d\d/.test(e.from) ? Date.parse(String(e.from).replace(' ', 'T').slice(0, 19)) : NaN;
  return isNaN(t) ? (e.added || 0) : t;
}
function clusterReports(hist, o) {
  o = o || {}; var min = Math.max(2, o.min || 3), win = Math.max(1, o.hours || 6) * 3600000, by = {}, out = [];
  Object.keys(hist || {}).forEach(function (h) {
    var e = hist[h];
    (e.probs || []).forEach(function (p) { if ((SEV[p.s] || 0) < SEV.warn) return; (by[p.k] = by[p.k] || []).push({ h: h, e: e, p: p, t: histTime(e) }); });
  });
  Object.keys(by).forEach(function (k) {
    var arr = by[k].sort(function (a, b) { return a.t - b.t; }), cur = null;
    arr.forEach(function (x) {
      if (!cur || x.t - cur.start > win) { cur = { id: k + '@' + x.t, key: k, start: x.t, end: x.t, items: [] }; out.push(cur); }
      cur.items.push(x); cur.end = x.t;
    });
  });
  out = out.filter(function (c) { return c.items.length >= min; });
  out.forEach(function (c) {
    var first = c.items[0].p, best = c.items.map(function (x) { return x.p; });
    c.title = first.t; c.n = c.items.length;
    c.sev = best.reduce(function (m, p) { return SEV[p.s] > SEV[m] ? p.s : m; }, first.s);
    c.cause = (best.find(function (p) { return p.c; }) || {}).c || '';
    c.fix = (best.find(function (p) { return p.f && p.f.length; }) || {}).f || [];
    var ex = {}; best.forEach(function (p) { (p.x || []).forEach(function (l) { ex[l] = (ex[l] || 0) + 1; }); });
    c.examples = Object.keys(ex).sort(function (a, b) { return ex[b] - ex[a]; }).slice(0, 3);
    c.kinds = { main: 0, client: 0 }; c.items.forEach(function (x) { c.kinds[x.e.kind] = (c.kinds[x.e.kind] || 0) + 1; });
    c.bad = c.items.filter(function (x) { return x.e.status === 'bad'; }).length;
  });
  var grp = {}, res = [];
  out.forEach(function (c) { var sg = c.items.map(function (x) { return x.h; }).sort().join('|'); (grp[sg] = grp[sg] || []).push(c); });
  Object.keys(grp).forEach(function (g) { var a = grp[g].sort(function (x, y) { return SEV[y.sev] - SEV[x.sev]; }), m = a[0]; m.also = a.slice(1).map(function (c) { return c.title; }); res.push(m); });
  return res.sort(function (a, b) { return b.n - a.n || b.end - a.end; });
}

/* ---------- Дело: несколько логов одного игрока вместе ---------- */
function h32(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h.toString(36); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtTs(ms) { var d = new Date(ms); return pad2(d.getUTCDate()) + '.' + pad2(d.getUTCMonth() + 1) + ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds()); }
function clientDay(it) {
  var m = /(\d{4})-(\d\d)-(\d\d)[_T ](\d\d)-(\d\d)-(\d\d)/.exec(it.name || '');
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (it.mtime) { var d = new Date(it.mtime); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
  return null;
}
function itemEvents(it) {
  var sc = it.sc, es = it.parsed.entries, ev = [], kind = sc.kind, day = null, t0 = 0;
  if (!es.length) return ev;
  if (kind === 'client') { day = clientDay(it); if (day == null) return ev; t0 = toMs(es[0], 'client'); }
  function T(e) { if (kind === 'main') return toMs(e, 'main'); var t = toMs(e, 'client'); return day + t + (t < t0 - 2 * 3600000 ? 86400000 : 0); }
  function push(e, label, k) { ev.push({ t: T(e), line: e.i, label: label, kind: k, file: it.label, fkind: kind }); }
  if (kind === 'main') {
    (sc.attempts || []).forEach(function (a, i) {
      var k = a.out === 'fail' || a.out === 'crash' ? 'bad' : a.out === 'ok' || a.out === 'patched' ? 'ok' : a.out === 'cancel' ? 'warn' : 'info';
      var lab = a.out === 'ok' ? 'Запуск игры успешен' : a.out === 'patched' ? 'Патчер отработал, запуск не оборвался' : a.out === 'crash' ? 'Краш игры' + (a.message ? ' ' + a.message : '') : a.out === 'fail' ? 'Отказ запуска: ' + a.reason + (a.message ? ' (' + a.message.slice(0, 60) + ')' : '') : a.out === 'cancel' ? 'Запуск отменён' : 'Попытка без итога';
      ev.push({ t: toMs({ ts: a.ts, date: a.date }, 'main'), line: a.line, label: lab, kind: k, file: it.label, fkind: kind });
    });
    es.forEach(function (e) { if (e.key && e.key.indexOf('m-maint') === 0) { var g = sc.keyed.get(e.key); push(e, g ? g.title : 'Обслуживание лаунчера', 'info'); } });
  } else {
    var st = sc.stage || {};
    if (st.inited) push(st.inited, 'Клиент запущен', 'info');
    if (st.started) push(st.started, 'Движок игры запустился', 'info');
    if (st.connected) push(st.connected, 'Подключился к серверу', 'ok');
    sc.findings.forEach(function (g) { if ((g.rule.id === 'c-conn' || g.sev === 'crit') && g.rule.id !== 'c-dump') push(es[g.entries[0]], g.title, 'bad'); });
    if (st.dump) push(st.dump, 'Краш игры (MINIDUMP)', 'bad');
    if (st.shut) push(st.shut, 'Клиент закрылся', 'info');
  }
  return ev;
}
function problemKeys(sc) { var m = {}; sc.findings.forEach(function (g) { if (SEV[g.sev] >= SEV.warn) m[g.key] = g.title; }); return m; }
function caseSummary(items) {
  var r = { n: { main: 0, client: 0 }, status: 'unk', headline: '', lines: [], root: null, timeline: [], delta: null, asks: [], findings: [] };
  if (!items.length) return r;
  var merged = new Map(), mods = null, all = [];
  items.forEach(function (it) {
    r.n[it.sc.kind]++;
    if (it.sc.mods && !mods) mods = it.sc.mods;
    it.sc.findings.forEach(function (g) {
      var m = merged.get(g.key);
      if (!m) { m = { key: g.key, rule: g.rule, title: g.title, sev: g.sev, src: g.src, cause: g.cause, fix: g.fix, tpl: g.tpl, count: 0, loop: false, files: [], dets: g.dets }; merged.set(g.key, m); }
      m.count += g.count; if (g.loop) m.loop = true; m.files.push(it.label);
      if (SEV[g.sev] > SEV[m.sev]) m.sev = g.sev;
    });
    itemEvents(it).forEach(function (e) { all.push(e); });
  });
  var fs = Array.from(merged.values());
  fs.forEach(function (m) { if (m.rule.loopAt && m.count >= m.rule.loopAt) m.loop = true; });
  fs.sort(function (a, b) { return (b.rule.top ? 1 : 0) - (a.rule.top ? 1 : 0) || SEV[b.sev] - SEV[a.sev] || b.count - a.count; });
  r.findings = fs;
  all.sort(function (a, b) { return a.t - b.t; });
  r.timeline = all;
  var judged = all.filter(function (e) { return e.kind === 'ok' || e.kind === 'bad'; }), last = judged[judged.length - 1];
  var bads = judged.filter(function (e) { return e.kind === 'bad'; }), oks = judged.filter(function (e) { return e.kind === 'ok'; });
  var top = fs.filter(function (g) { return SEV[g.sev] >= SEV.warn; });
  if (!last) { r.status = top.length ? 'warn' : 'unk'; r.headline = top.length ? 'Итог по логам дела неясен, но есть проблемы' : 'В логах дела нет ни успешных, ни неудачных запусков'; }
  else if (last.kind === 'ok') { r.status = 'ok'; r.headline = bads.length ? 'Дело, похоже, решено: последний запуск успешен (' + fmtTs(last.t) + ')' : 'Сбоев в логах дела нет: запуск успешен (' + fmtTs(last.t) + ')'; }
  else { r.status = 'bad'; r.headline = 'Проблема сохраняется: последняя неудача ' + fmtTs(last.t) + ' (' + last.label + ')'; }
  var modT = null; items.forEach(function (it) { if (!it.sc.mods) return; var ev = itemEvents(it); if (ev.length && (modT == null || ev[0].t < modT)) modT = ev[0].t; });
  var corrLine = '';
  if (modT != null && oks.some(function (e) { return e.t < modT; }) && bads.some(function (e) { return e.t >= modT; })) corrLine = 'Совпадение по времени: до появления модов запуски были успешными, после них начались сбои. Скорее всего, причина в модах.';
  r.lines.push('Логов в деле: ' + items.length + ' (main: ' + r.n.main + ', client: ' + r.n.client + '). Неудач: ' + bads.length + ', успешных запусков: ' + oks.length + '.');
  if (corrLine) r.lines.push(corrLine);
  if (r.status === 'bad' || r.status === 'warn') {
    var shadow = { findings: fs, mods: mods, verdict: { status: r.status } }; r.root = rootCause(shadow);
    if (r.root) r.lines.push('Главная причина: ' + r.root.title + '. ' + r.root.why);
    else if (mods) r.lines.push('Главная причина: моды в папке игры (' + mods.files.slice(0, 3).map(baseName2).join('; ') + '). Сначала уберите их.');
    else if (top.length) r.lines.push('Самая значимая находка: ' + top[0].title + (top.length > 1 ? '. Ещё проблем: ' + (top.length - 1) : '') + '.');
  }
  /* до и после: самый ранний и самый поздний лог одного типа */
  var d = { items: [], gone: [], fresh: [], stay: [] };
  ['main', 'client'].forEach(function (k) {
    var L = items.filter(function (it) { return it.sc.kind === k; }).map(function (it) { var e = itemEvents(it); return { it: it, t: e.length ? e[0].t : null }; }).filter(function (x) { return x.t != null; }).sort(function (a, b) { return a.t - b.t; });
    if (L.length < 2) return;
    var a = problemKeys(L[0].it.sc), b = problemKeys(L[L.length - 1].it.sc), row = { kind: k, from: L[0].it.label, to: L[L.length - 1].it.label, gone: [], fresh: [], stay: [] };
    Object.keys(a).forEach(function (x) { (b[x] ? row.stay : row.gone).push(a[x]); });
    Object.keys(b).forEach(function (x) { if (!a[x]) row.fresh.push(b[x]); });
    d.items.push(row);
  });
  if (d.items.length) {
    r.delta = d.items;
    d.items.forEach(function (row) { r.lines.push('Сравнение ' + row.kind + ' (' + row.from + ' → ' + row.to + '): исчезло ' + row.gone.length + ', появилось ' + row.fresh.length + ', осталось ' + row.stay.length + '.'); });
  }
  /* что попросить дальше */
  function ask(text, kind) { r.asks.push({ id: h32(text), text: text, kind: kind }); }
  if (!r.n.main) ask('Прислать main.log (логи лаунчера: Настройки → Логи или папка majestic-launcher).', 'need');
  if (!r.n.client) ask('Прислать client.log (папка Multiplayer\\logs в majestic-launcher) после попытки зайти в игру.', 'need');
  if (mods) ask('Убрать моды из папки игры (' + mods.files.slice(0, 3).map(baseName2).join(', ') + '), перенести нужные в папку модификаций лаунчера.', 'do');
  if (r.status === 'bad' || r.status === 'warn') {
    var seen = {}, ordered = top.filter(function (g) { return g.loop; }).concat(top.filter(function (g) { return !g.loop; })); ordered.slice(0, 3).forEach(function (g) { (g.fix || []).slice(0, g.loop ? 3 : 2).forEach(function (x) { if (!seen[x] && r.asks.length < 7) { seen[x] = 1; ask(x, 'do'); } }); });
    ask('После выполненных шагов запустить игру ещё раз и прислать новые main.log и client.log, добавить их в эту же папку.', 'need');
  }
  r.mods = mods;
  return r;
}
function baseName2(p) { return String(p).split(/[\\\/]/).filter(Boolean).pop() || String(p); }

/* ---------- Маскирование персональных данных ---------- */
function mask(s) {
  return String(s)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?!(?:ycd|ytd|ydr|yft|ydd|ymap|ybn|ymt|ynv|ytyp|ysc|rpf|meta|rel|dat|xml|dll|exe)\b)[A-Za-z]{2,}/g, '***@***')
    .replace(/\b(?!(?:127|0)\.)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b(?!\.\d)/g, '***.***.***.***')
    .replace(/(Users[\\\/]+)[^\\\/'"\r\n⏎]{1,64}?(?=[\\\/])/gi, '$1<user>')
    .replace(/(Users[\\\/]+)(?!<user>)(?:[^\\\/\s'")]+)/gi, '$1<user>')
    .replace(/(Users%2F|Users\/)(?:%[0-9A-Fa-f]{2})+/g, '$1<user>')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, '***токен***')
    .replace(/\b(password|passwd|pwd|secret)(["']?\s*[:=]\s*["']?)([^\s"',;}]+)/gi, '$1$2***')
    .replace(/\b((?:access_|refresh_|auth_|id_)?token|authorization|bearer|session_?id|api_?key)(["']?\s*[:=]\s*["']?|\s+)([A-Za-z0-9._~+\/=-]{12,})/gi, '$1$2***');
}

var LA = root.LA = { permCommand: permCommand, h32: h32, caseSummary: caseSummary, stripAnsi: stripAnsi, SEV: SEV, RULES: RULES, parse: parse, scan: scan, analyzeAsync: analyzeAsync, learn: learn, classify: classify, applyKB: applyKB, newKB: newKB, setCustomRules: setCustomRules, composeReply: composeReply, REPLY_BYE: REPLY_BYE, diffScans: diffScans, gameFolder: gameFolder, guessGamePaths: guessGamePaths, mask: mask, clusterReports: clusterReports, histTime: histTime, signature: signature, detectKind: detectKind, owner: owner, toMs: toMs };
if (typeof module !== 'undefined' && module.exports) module.exports = root.LA;
})(typeof window !== 'undefined' ? window : globalThis);

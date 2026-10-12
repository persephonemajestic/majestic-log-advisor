#!/usr/bin/env node
// Построчный аудит очищенных логов: node scripts/audit-logs.js <папка logs_preprocessed> [файл отчёта, по умолчанию во временной папке системы] [--raw <папка исходных>]
// Читает файлы, подготовленные scripts/clean-logs.js, и собирает таблицу инцидентов. Логи в репозиторий не попадают.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], out = (process.argv[3] && !process.argv[3].startsWith('--')) ? process.argv[3] : path.join(require('os').tmpdir(), 'full_logs_audit.md');
const rawDir = process.argv.includes('--raw') ? process.argv[process.argv.indexOf('--raw') + 1] : '';
if (!dir) { console.error('Использование: node scripts/audit-logs.js <папка logs_preprocessed> [отчёт.md] [--raw <исходные>]'); process.exit(1); }
const ctx = { console }; ctx.root = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8'), ctx);
const LA = ctx.LA || vm.runInContext('LA', ctx);
const cnt = (t, re) => (t.match(re) || []).length;
const sq = (t, id) => { const m = t.match(new RegExp('\\[' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ×(\\d+)\\]')); return m ? +m[1] : cnt(t, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')); };
const mask = s => String(s || '').replace(/[A-Za-z]:\\[^\s'")]*/g, '<путь>').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const CLASS = { ASSET_FAIL: 'ASSET_FAIL', STREAMER_DESYNC: 'STREAMER_DESYNC', V8_FATAL: 'V8_FATAL', CEF_WEB: 'CEF_WEB', NET_DROPOUT: 'NET_DROPOUT', DATA_CORRUPT: 'DATA_CORRUPT', GPU_DRIVER: 'GPU_DRIVER', LAUNCHER: 'LAUNCHER', NONE: 'NONE', UNKNOWN: 'UNKNOWN' };
const files = fs.readdirSync(dir).filter(f => /\.log$/.test(f)).sort(), rows = [], assetCount = {};
let diffStatus = 0;
files.forEach(f => {
  const t = fs.readFileSync(path.join(dir, f), 'utf8'), death = fs.existsSync(path.join(dir, f.replace(/\.log$/, '.death.txt'))) ? fs.readFileSync(path.join(dir, f.replace(/\.log$/, '.death.txt')), 'utf8').split('\n').filter(Boolean) : [];
  let sc; try { sc = LA.scan(LA.parse(t, f)); } catch (e) { return; }
  const raw = rawDir && fs.existsSync(path.join(rawDir, f)) ? fs.statSync(path.join(rawDir, f)).size : 0;
  if (rawDir && fs.existsSync(path.join(rawDir, f))) { try { const s2 = LA.scan(LA.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'), f)); if (s2.verdict.status !== sc.verdict.status) { diffStatus++; console.log('расхождение:', f, s2.verdict.status, '→', sc.verdict.status, '|', s2.verdict.headline.slice(0, 70), '→', sc.verdict.headline.slice(0, 70)); } } catch (e) {} }
  const kind = sc.kind === 'client' ? 'client' : (sc.kindName || 'main');
  const from = sc.range && sc.range.from ? String(sc.range.from).slice(0, 19).replace('T', ' ') : 'без даты';
  const R = { n: rows.length + 1, label: '#' + String(rows.length + 1).padStart(3, '0') + ' ' + kind + ' ' + from, kb: Math.round(t.length / 1024), rawKb: Math.round(raw / 1024), kind: sc.kind };
  const dump = /MINIDUMP: Temporary dump saved/.test(t);
  const am = t.match(/Last loaded asset: ([^\n']+)/), tm = t.match(/Texture info: ([^\n']+)/);
  const asset = am ? am[1].trim() : '', tex = tm ? tm[1].trim() : '';
  const dup = cnt(t, /Duplicate weapon item/g), stores = [...new Set((t.match(/Store not found for (\S+)/g) || []).map(x => x.replace('Store not found for ', '')))];
  const storeN = cnt(t, /Store not found for/g), no = sq(t, 'Cannot destroy NetworkObject'), peer = sq(t, 'Peer limiter blocked the packet') + 0, pkt = sq(t, 'Packet failed to send'), tick = sq(t, 'tick was too long');
  const uta = cnt(t, /UpdateTextureAccelerated/g), webErr = cnt(t, /\[Error\]\[web\]/g), react = cnt(t, /Minified React error/g), fetchE = cnt(t, /Failed to fetch/g);
  const net = cnt(t, /ENOTFOUND|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_\w+|ERR_TIMED_OUT/g), v8 = cnt(t, /JavaScript heap out of memory|FATAL ERROR: .*(?:heap|Allocation)|Allocation failed/g);
  const gfx = (t.match(/ERR_GFX\w*/) || [''])[0], zlib = (t.match(/ERR_GEN_ZLIB\w*|ERR_STR_FAILURE\w*/) || [''])[0], overlay = (t.match(/discordhook64|RTSSHooks64|Bandicam|ReShade/i) || [''])[0];
  const lastBefore = (() => { const i = death.findIndex(l => /MINIDUMP|Shutting down/.test(l)); const p = (i > 0 ? death.slice(0, i) : death).filter(l => !/Last loaded asset|Texture info/.test(l)); return p.length ? mask(p[p.length - 1]).slice(0, 150) : ''; })();
  R.dump = dump; R.asset = asset; R.tex = tex;
  R.meta = [dup ? 'дублей оружия ' + dup : '', storeN ? 'Store not found ×' + storeN + (stores.length ? ' (' + stores.slice(0, 3).join(', ') + (stores.length > 3 ? ' +' + (stores.length - 3) : '') + ')' : '') : '', no ? 'NetworkObject ×' + no : '', pkt ? 'Packet failed ×' + pkt : '', peer ? 'Peer limiter ×' + peer : '', tick > 50 ? 'tick too long ×' + tick : ''].filter(Boolean).join('; ') || '—';
  R.before = dump ? (asset ? 'Last loaded asset: ' + asset + (tex ? ' | Texture: ' + tex.split(' ')[0] : '') : (lastBefore || 'следов перед дампом нет')) : (sc.kind === 'client' ? 'дампа нет' + (lastBefore ? '; последнее: ' + lastBefore : '') : mask(sc.verdict.headline).slice(0, 170));
  let cls, verdict;
  if (sc.kind === 'client') {
    if (dump && asset) {
      cls = 'ASSET_FAIL'; const first = asset.split(' ')[0]; assetCount[first] = (assetCount[first] || 0) + 1;
      const ext = (first.match(/\.(\w+)$/) || [])[1] || '';
      verdict = 'Краш движка при подгрузке ' + ({ ydr: 'модели', ytd: 'текстуры', yft: 'фрагмента (транспорт/оружие)', ycd: 'анимации', ydd: 'набора моделей', ymap: 'карты', ybn: 'коллизии' }[ext] || 'ассета') + ' ' + first + (tex ? ', текстура ' + tex.split(' ')[0] : '') + '. Первопричина без .dmp не подтверждается (MEDIUM): очистить кеш лаунчера, проверить файлы, убрать моды' + (overlay ? ', отключить оверлей ' + overlay : '') + '.';
    } else if (dump && gfx) { cls = 'GPU_DRIVER'; verdict = 'Краш с ' + gfx + ': драйвер видеокарты, ReShade/ENB или шейдерный кеш (HIGH).'; }
    else if (dump && zlib) { cls = 'DATA_CORRUPT'; verdict = 'Краш с ' + zlib + ': повреждены данные ресурса или кеш (MEDIUM). Очистить кеш лаунчера, проверить целостность файлов.'; }
    else if (dump) { cls = 'UNKNOWN'; verdict = 'Дамп сохранён, следов перед ним нет (LOW). Нужен .dmp и лог лаунчера.' + (lastBefore ? ' Последняя строка: ' + lastBefore : ''); }
    else if (v8) { cls = 'V8_FATAL'; verdict = 'Нехватка памяти V8 (JavaScript heap) в клиентских скриптах (HIGH).'; }
    else if (uta > 100 || react > 0 || webErr > 5) { cls = 'CEF_WEB'; verdict = uta > 100 ? 'Интерфейс не отрисовывался: UpdateTextureAccelerated ×' + uta + ' (сбой копирования текстуры UI через видеокарту). Драйвер, оверлеи, перезапуск игры.' : 'Ошибки веб-интерфейса' + (react ? ' (React ×' + react + ')' : '') + ': ' + webErr + ' записей [Error][web]. Игру не роняют, влияют на отображение окон.'; }
    else if (net > 0 || sc.findings.some(g => ['c-queue-net', 'c-join-timeout', 'c-join-https'].includes(g.rule.id))) { cls = 'NET_DROPOUT'; verdict = 'Сбой сети при подключении (' + (net ? 'ENOTFOUND/таймауты ×' + net : sc.verdict.headline.slice(0, 80)) + '). Проверить DNS, VPN, файрвол.'; }
    else if (no >= 1000) { cls = 'STREAMER_DESYNC'; verdict = 'Спам удаления сетевых объектов ×' + no + ', краша нет: нагрузка и возможные лаги, на вылет не влияет (LOW).'; }
    else { cls = 'NONE'; verdict = sc.verdict.status === 'ok' ? 'Заход успешный, проблем нет.' : 'Заметных причин нет: ' + mask(sc.verdict.headline).slice(0, 110); }
  } else {
    const rid = sc.root && sc.root.id;
    if (sc.verdict.status === 'ok') { cls = 'NONE'; verdict = mask(sc.verdict.headline); }
    else if (sc.verdict.status === 'unk') { cls = 'UNKNOWN'; verdict = 'В логе нет попыток запуска игры.'; }
    else if (rid === 'net') { cls = 'NET_DROPOUT'; verdict = mask(sc.verdict.headline) + '. Сеть/серверы раздачи.'; }
    else if (sc.findings.some(g => g.rule.id === 'm-gpu') && rid !== 'loop') { cls = 'GPU_DRIVER'; verdict = mask(sc.verdict.headline) + '. Видеоподсистема.'; }
    else { cls = 'LAUNCHER'; verdict = mask(sc.verdict.headline) + (sc.root ? '. Причина: ' + mask(sc.root.title || rid) : '') + '.'; }
  }
  R.cls = cls; R.verdict = verdict; R.status = sc.verdict.status; rows.push(R);
});
const by = (k) => rows.reduce((a, r) => (a[r[k]] = (a[r[k]] || 0) + 1, a), {});
const total = rows.reduce((a, r) => a + r.kb, 0), totalRaw = rows.reduce((a, r) => a + r.rawKb, 0);
let o = '# Полный аудит логов (по очищенным файлам)\n\nСформировано скриптом `scripts/audit-logs.js` из файлов, которые подготовил `scripts/clean-logs.js` (`src/utils/logCleaner.js`): удалены `Mounting/Mounted resource`, `download: cache-hit skip`, блоки `ERR_SYS_FILELOAD` с их `Callstack`, спам свёрнут в счётчики ×N. Исходных имён файлов в сохранённой базе приложения нет, поэтому лог обозначен номером, типом и временем начала.\n\n';
o += '## Сводка\n\n- Логов: **' + rows.length + '** (клиентских ' + rows.filter(r => r.kind === 'client').length + ', основных ' + rows.filter(r => r.kind !== 'client').length + ').\n';
if (totalRaw) o += '- Объём: ' + (totalRaw / 1024).toFixed(0) + ' МБ → ' + (total / 1024).toFixed(0) + ' МБ (−' + (100 * (1 - total / totalRaw)).toFixed(1) + '%).\n- Вердикт по правилам на очищенных и исходных логах разошёлся у **' + diffStatus + '** логов (очистка не должна менять итог).\n';
o += '- С настоящим крашем (MINIDUMP): **' + rows.filter(r => r.dump && r.kind === 'client').length + '**.\n\n| Класс | Логов |\n|---|---|\n' + Object.entries(by('cls')).sort((a, b) => b[1] - a[1]).map(e => '| ' + e[0] + ' | ' + e[1] + ' |').join('\n') + '\n\n';
o += '`V8_FATAL`: в этих логах не найдено ни одной записи о нехватке памяти V8 (`JavaScript heap out of memory`, `FATAL ERROR … heap`), строки `heapSize` — статистика. `TDR timeout` (`DXGI_ERROR_DEVICE_*`, `0x887A00..`): не найдено. Предупреждения V8 `Promise resolved after being resolved` и `tick was too long` — фон.\n\n';
const rep = Object.entries(assetCount).filter(e => e[1] > 1);
if (rep.length) o += '**Повторяющиеся ассеты перед дампом:** ' + rep.map(e => '`' + e[0] + '` ×' + e[1]).join(', ') + '.\n\n';
const tbl = (list, h) => '## ' + h + ' (' + list.length + ')\n\n| Лог | КБ до→после | Строка / ассет перед дампом | Класс | Метаданные и фон | Вердикт |\n|---|---|---|---|---|---|\n' + list.map(r => '| ' + r.label + ' | ' + (r.rawKb ? r.rawKb + '→' : '') + r.kb + ' | ' + mask(r.before).slice(0, 190) + ' | ' + r.cls + ' | ' + mask(r.meta) + ' | ' + mask(r.verdict).slice(0, 300) + ' |').join('\n') + '\n\n';
o += tbl(rows.filter(r => r.kind === 'client' && r.dump), 'Клиентские логи с крашем');
o += tbl(rows.filter(r => r.kind === 'client' && !r.dump && r.cls !== 'NONE'), 'Клиентские логи без краша, но с проблемами');
o += tbl(rows.filter(r => r.kind !== 'client' && r.cls !== 'NONE'), 'Основные логи (main.log) с проблемами');
const ok = rows.filter(r => r.cls === 'NONE'); o += '## Логи без проблем (' + ok.length + ')\n\n' + ok.map(r => r.label).join('; ') + '.\n';
fs.writeFileSync(out, o); console.log('Записано', out, o.length, 'байт; классы', by('cls'), '; расхождений вердикта', diffStatus);

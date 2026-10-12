#!/usr/bin/env node
// Пакетная очистка логов: node scripts/clean-logs.js <папка с логами> [папка результата=logs_preprocessed]
// Результат кладётся рядом с репозиторием и в git не попадает (см. .gitignore). Выводит статистику по размеру и шуму.
const fs = require('fs'), path = require('path');
const LogCleaner = require('../src/utils/logCleaner.js');
const inDir = process.argv[2], outDir = process.argv[3] || path.join(__dirname, '..', 'logs_preprocessed');
if (!inDir) { console.error('Использование: node scripts/clean-logs.js <папка с логами> [папка результата]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const tot = { n: 0, inB: 0, outB: 0, inL: 0, outL: 0, removed: {}, squashed: {}, byKind: {} }, rows = [];
for (const f of fs.readdirSync(inDir).filter(x => /\.log$/i.test(x)).sort()) {
  const t = fs.readFileSync(path.join(inDir, f), 'utf8'), r = LogCleaner.clean(t);
  fs.writeFileSync(path.join(outDir, f), r.text);
  fs.writeFileSync(path.join(outDir, f.replace(/\.log$/i, '.death.txt')), r.death.join('\n') + '\n');
  const s = r.stats; tot.n++; tot.inB += s.inBytes; tot.outB += s.outBytes; tot.inL += s.inLines; tot.outL += s.outLines;
  for (const k in s.removed) tot.removed[k] = (tot.removed[k] || 0) + s.removed[k];
  for (const k in s.squashed) tot.squashed[k] = (tot.squashed[k] || 0) + s.squashed[k];
  rows.push({ f, inB: s.inBytes, outB: s.outBytes, trig: r.trigger.kind });
}
const mb = b => (b / 1048576).toFixed(1) + ' МБ', pc = (a, b) => (100 * (1 - b / a)).toFixed(1) + '%';
console.log('Логов: ' + tot.n + ', строк: ' + tot.inL.toLocaleString('ru') + ' → ' + tot.outL.toLocaleString('ru') + ' (−' + pc(tot.inL, tot.outL) + ')');
console.log('Размер: ' + mb(tot.inB) + ' → ' + mb(tot.outB) + ' (шум и повторы −' + pc(tot.inB, tot.outB) + ')');
console.log('Удалено строк:', tot.removed);
console.log('Свёрнуто повторов:', tot.squashed);
const tr = {}; rows.forEach(r => { tr[r.trig || 'нет точки смерти'] = (tr[r.trig || 'нет точки смерти'] || 0) + 1; }); console.log('Точка смерти:', tr);
fs.writeFileSync(path.join(outDir, '_stats.json'), JSON.stringify({ total: tot, files: rows }, null, 1));

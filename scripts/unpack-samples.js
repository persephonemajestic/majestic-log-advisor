#!/usr/bin/env node
/* Распаковка выгрузки обезличенных логов (закрытый репозиторий: days/ГГГГ-ММ-ДД.jsonl) в папку с файлами .log,
   чтобы прогнать по ним audit-logs.js, uncovered-lines.js и регрессию tests/golden.js (LOGS_DIR=<папка>).
   Использование: node scripts/unpack-samples.js <папка репозитория с выгрузкой> <папка для логов> */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Использование: node scripts/unpack-samples.js <выгрузка> <папка для логов>'); process.exit(2); }
const dir = path.join(src, 'days'); if (!fs.existsSync(dir)) { console.error('Нет папки days/ в ' + src); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
let n = 0, bad = 0; const kinds = { client: 0, main: 0 };
for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d\d-\d\d\.jsonl$/.test(x)).sort()) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line); if (!/^[0-9a-f]+-\d+$/.test(r.h) || (r.k !== 'client' && r.k !== 'main')) throw new Error('поля');
      const text = zlib.gunzipSync(Buffer.from(r.gz, 'base64')).toString('utf8');
      fs.writeFileSync(path.join(out, r.k + '_' + f.slice(0, 10) + '_' + r.h + '.log'), text); n++; kinds[r.k]++;
    } catch (e) { bad++; }
  }
}
console.log('Распаковано логов: ' + n + ' (client ' + kinds.client + ', main ' + kinds.main + ')' + (bad ? ', пропущено повреждённых: ' + bad : ''));

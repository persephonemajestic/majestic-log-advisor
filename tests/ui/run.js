// Запуск всех UI-тестов по очереди (каждый в своём процессе, с таймаутом).
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => /\.test\.js$/.test(f)).sort(); let bad = 0;
for (const f of files) { console.log('== ' + f); const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 150000 }); process.stdout.write(r.stdout || ''); if (r.status !== 0) { bad++; process.stderr.write((r.stderr || '').slice(0, 800)); } }
console.log(bad ? 'UI FAIL: ' + bad : 'UI OK: ' + files.length); process.exit(bad ? 1 : 0);

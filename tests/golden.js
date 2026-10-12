// Регрессия на реальных логах. Логи в репозиторий не кладём (там данные игроков).
// Проверка:  LOGS_DIR=/путь/к/логам node tests/golden.js
// Обновить эталон после осознанного изменения правил:  LOGS_DIR=... node tests/golden.js --update
const fs = require('fs'), path = require('path');
const dir = process.env.LOGS_DIR;
if (!dir || !fs.existsSync(dir)) { console.log('SKIP golden: задайте LOGS_DIR с папкой логов'); process.exit(0); }
const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const LA = new Function(code + '; return LA;').call({});
const gf = path.join(__dirname, 'golden.json');
const cur = {};
for (const f of fs.readdirSync(dir).filter(f => /\.log$/.test(f)).sort()) {
  const name = f.replace(/^[0-9a-f]{8}-/, '');
  const sc = LA.scan(LA.parse(fs.readFileSync(path.join(dir, f), 'utf8'), name));
  cur[name] = { status: sc.verdict.status, headline: sc.verdict.headline, root: sc.root ? sc.root.id : '', ids: Array.from(new Set(sc.findings.map(g => g.rule.id))).sort(), crit: sc.findings.filter(g => g.sev === 'crit').map(g => g.key).sort(), unknown: sc.unknown.length };
}
if (process.argv.includes('--update')) { fs.writeFileSync(gf, JSON.stringify(cur, null, 1)); console.log('golden обновлён:', Object.keys(cur).length); process.exit(0); }
const exp = JSON.parse(fs.readFileSync(gf, 'utf8')); let bad = 0;
for (const n of Object.keys(exp)) {
  if (!cur[n]) { console.log('нет лога', n); continue; }
  const a = JSON.stringify(exp[n]), b = JSON.stringify(cur[n]);
  if (a !== b) { bad++; console.error('РАЗЛИЧИЕ', n, '\n  было ', a, '\n  стало', b); }
}
if (bad) { console.error('FAIL golden:', bad); process.exit(1); }
console.log('OK golden', Object.keys(exp).length);

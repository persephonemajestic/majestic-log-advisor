// Единый запуск: ядро, регрессия на логах (если задан LOGS_DIR), UI-тесты (если установлен playwright).
const { spawnSync } = require('child_process'), path = require('path');
let bad = 0;
for (const f of ['run.js', 'golden.js', 'admin.test.js', 'ai-cache.test.js', 'worker-sig.test.mjs', 'worker-samples.test.mjs', 'worker-web.test.mjs', 'ext-receiver.test.js', 'plugins/installer.test.js', 'plugins/plugin.test.js', 'ui/run.js']) { const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }); if (r.status !== 0) bad++; }
console.log(bad ? 'ВСЕГО: ошибки в ' + bad : 'ВСЕГО: всё хорошо'); process.exit(bad ? 1 : 0);

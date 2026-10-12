// Код компьютера (HWID): хеш MachineGuid Windows
const crypto = require('crypto');
const os = require('os');
module.exports = function getHwid() {
  let id = '';
  try { const out = require('child_process').execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true }); const m = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out); if (m) id = m[1]; } catch (e) {}
  if (!id) id = os.hostname() + '|' + (os.cpus()[0] || {}).model + '|' + os.totalmem();
  const h = crypto.createHash('sha256').update('majestic-log-advisor|' + id).digest('hex').slice(0, 20).toUpperCase();
  return h.match(/.{5}/g).join('-');
};

// Неизменный загрузчик: берёт более новый main.js/preload.js из папки обновлений, иначе встроенные.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.APP_DIR = __dirname;
const WORKER = 'https://majestic-log-advisor.requesteadm.workers.dev';
const SHELL_URL = WORKER + '/v1/shell/';
const getHwid = () => { try { return require(path.join(__dirname, 'hwid.js'))(); } catch (e) { return ''; } };
const verOf = (t) => { const m = /SHELL_VERSION\s*=\s*'([^']+)'/.exec(t || ''); return m ? m[1] : ''; };
const newer = (a, b) => { const x = a.split(/[-.]/).map(Number), y = b.split(/[-.]/).map(Number); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
const dir = () => path.join(app.getPath('userData'), 'shell');
function ok(t) { try { new vm.Script(t); return true; } catch (e) { return false; } }
let entry = path.join(__dirname, 'main.js');
try {
  const m = path.join(dir(), 'main.js'), p = path.join(dir(), 'preload.js');
  if (fs.existsSync(m) && fs.existsSync(p)) {
    const t = fs.readFileSync(m, 'utf8'), b = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    if (ok(t) && ok(fs.readFileSync(p, 'utf8')) && newer(verOf(t), verOf(b))) entry = m;
  }
} catch (e) {}
try { require(entry); } catch (e) { if (entry !== path.join(__dirname, 'main.js')) { try { fs.rmSync(dir(), { recursive: true, force: true }); } catch (x) {} require(path.join(__dirname, 'main.js')); } else throw e; }
app.whenReady().then(async () => {
  try {
    const { net } = require('electron');
    const get = async (n) => { const r = await net.fetch(SHELL_URL + n + '?t=' + Date.now(), { cache: 'no-store', headers: { 'X-HWID': getHwid() } }); if (!r.ok) throw new Error(n); return r.text(); };
    const m = await get('main.js'), p = await get('preload.js'), hw = await get('hwid.js');
    const cur = verOf(fs.readFileSync(entry, 'utf8'));
    if (!ok(m) || !ok(p) || !ok(hw) || m.length < 2000 || !newer(verOf(m), cur)) return;
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), 'main.js.tmp'), m); fs.writeFileSync(path.join(dir(), 'preload.js.tmp'), p); fs.writeFileSync(path.join(dir(), 'hwid.js'), hw);
    fs.renameSync(path.join(dir(), 'preload.js.tmp'), path.join(dir(), 'preload.js')); fs.renameSync(path.join(dir(), 'main.js.tmp'), path.join(dir(), 'main.js'));
  } catch (e) {}
});

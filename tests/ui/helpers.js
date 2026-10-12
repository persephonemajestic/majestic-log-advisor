// Общие помощники UI-тестов: запуск браузера, синтетические логи, проверки.
const fs = require('fs'), os = require('os'), path = require('path');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('SKIP ui: установите playwright (npm i playwright)'); process.exit(0); }
const INDEX = require('url').pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mla-'));
let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
async function launch(w, h) {
  let b; try { if (process.platform !== 'linux') throw 0; b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const p = await (await b.newContext({ viewport: { width: w || 1360, height: h || 900 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); await p.goto(INDEX); await p.waitForTimeout(700);
  return { b, p, errs };
}
const L = (d, t, lvl, msg) => `[${d} ${t}] [${lvl}]  [ (game)              ] ${msg}`;
function mainLog(name, o) {
  o = o || {}; const d = o.date || '2026-10-06', lines = []; let n = 0;
  (o.attempts || ['fail']).forEach((a, i) => {
    const t = (x) => `${o.hour || 11}:${String(10 + i).padStart(2, '0')}:${x}`;
    lines.push(L(d, t('00.000'), 'info', 'game.play: zombie process sweep'));
    if (a === 'ok') lines.push(L(d, t('05.000'), 'info', 'patcher: while game is alive'));
    else if (a === 'crash') lines.push(L(d, t('05.000'), 'info', "crashService: crash detected → armed needResourceCheck self-heal { internalError: 'ERR_FIL_PACK_3', scope: 'x' }"));
    else lines.push(L(d, t('10.000'), 'error', "game launch failed { reason: 'patcher-error', message: 'The specified module could not be found.' }"));
    n++;
  });
  (o.extra || []).forEach(x => lines.push(x));
  const f = path.join(TMP, name); fs.writeFileSync(f, lines.join('\n') + '\n'); return f;
}
function clientLog(name, o) {
  o = o || {}; const lines = ['[18:58:35.840] Logger initialized', '[18:58:39.108] Majestic Multiplayer inited'];
  if (o.crash) lines.push('[18:58:43.100][error] ERR_FIL_PACK_3 happened', '[18:58:43.200] MINIDUMP: Temporary dump saved to x', '[18:58:44.000] Shutting down');
  else lines.push('[18:59:10.000] Game Started in 31000 ms', '[18:59:20.000] Connected with id 5');
  (o.extra || []).forEach(x => lines.push(x));
  const f = path.join(TMP, name); fs.writeFileSync(f, lines.join('\n') + '\n'); return f;
}
async function load(p, files) {
  await p.setInputFiles('#fileIn', files);
  await p.waitForFunction(() => /Добавлено|Пропущены/.test(document.querySelector('#status').textContent), null, { timeout: 60000 });
  await p.waitForTimeout(400); if (await p.locator('[data-act=ldOk]').count()) await p.click('[data-act=ldOk]'); await p.waitForTimeout(300);
}
const done = async (b, errs) => { if (errs.length) { failed++; console.log('FAIL page errors', errs); } await b.close(); process.exit(failed ? 1 : 0); };
function dump(time, name) {
  const parts = [], pos = { n: 32 + 3 * 12 }, add = (b) => { const o = pos.n; parts.push([o, b]); pos.n += b.length; return o; };
  const str = (s) => { const b = Buffer.from(s, 'utf16le'), h = Buffer.alloc(4); h.writeUInt32LE(b.length); return Buffer.concat([h, b, Buffer.alloc(2)]); };
  const names = ['C:\\Games\\GTA5.exe', 'C:\\Windows\\System32\\nvwgf2umx.dll'].map(s => add(str(s)));
  const mb = Buffer.alloc(4 + 216); mb.writeUInt32LE(2, 0);
  [[0x7ff600000000n, 0x2000000], [0x7ffa00000000n, 0x1000000]].forEach((m, i) => { mb.writeBigUInt64LE(m[0], 4 + i * 108); mb.writeUInt32LE(m[1], 12 + i * 108); mb.writeUInt32LE(names[i], 24 + i * 108); });
  const modRva = add(mb), ctx = Buffer.alloc(1232), rip = 0x7ff600000000n + 0x1234n; ctx.writeBigUInt64LE(rip, 0xf8); ctx.writeBigUInt64LE(0x50f0000010n, 0x98); const ctxRva = add(ctx);
  const stack = Buffer.alloc(256); stack.writeBigUInt64LE(0x7ffa00000000n + 0x99n, 16); const stRva = add(stack);
  const tb = Buffer.alloc(52); tb.writeUInt32LE(1, 0); tb.writeUInt32LE(77, 4); tb.writeBigUInt64LE(0x50f0000000n, 28); tb.writeUInt32LE(256, 36); tb.writeUInt32LE(stRva, 40); tb.writeUInt32LE(1232, 44); tb.writeUInt32LE(ctxRva, 48); const thRva = add(tb);
  const ex = Buffer.alloc(168); ex.writeUInt32LE(77, 0); ex.writeUInt32LE(0xC0000005, 8); ex.writeBigUInt64LE(rip, 24); ex.writeUInt32LE(2, 32); ex.writeBigUInt64LE(1n, 40); ex.writeBigUInt64LE(0x8n, 48); ex.writeUInt32LE(1232, 160); ex.writeUInt32LE(ctxRva, 164); const exRva = add(ex);
  const buf = Buffer.alloc(pos.n); buf.write('MDMP', 0); buf.writeUInt32LE(0xA793, 4); buf.writeUInt32LE(3, 8); buf.writeUInt32LE(32, 12); buf.writeUInt32LE(time || 1791370611, 20);
  [[4, modRva, mb.length], [3, thRva, tb.length], [6, exRva, 168]].forEach((d, i) => { buf.writeUInt32LE(d[0], 32 + i * 12); buf.writeUInt32LE(d[2], 36 + i * 12); buf.writeUInt32LE(d[1], 40 + i * 12); });
  parts.forEach(([o, b]) => b.copy(buf, o)); const f = path.join(TMP, name || 'crashdump.dmp'); fs.writeFileSync(f, buf); return f;
}
module.exports = { dump, launch, ok, load, mainLog, clientLog, done, TMP };

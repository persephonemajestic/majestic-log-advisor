#!/usr/bin/env node
// Тестовый запуск ИИ-разбора из консоли: node scripts/ai-request.js <лог> [--call] [--out файл.json]
// Открывает index.html в headless-браузере (нужен playwright), загружает лог, нажимает «Разобрать с ИИ» и перехватывает запрос,
// который приложение отправило бы модели (системный промпт + очищенные данные). С --call и GEMINI_API_KEY отправляет его в Gemini
// и печатает сырой JSON ответа (ключ из окружения, в файлы не пишется).
const fs = require('fs'), path = require('path');
const file = process.argv[2], call = process.argv.includes('--call'), outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : '';
if (!file) { console.error('Использование: node scripts/ai-request.js <лог> [--call] [--out файл.json]'); process.exit(1); }
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.error('Нужен playwright: npm i playwright'); process.exit(1); }
(async () => {
  let b; try { b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' }); } catch (e) { b = await chromium.launch(); }
  const p = await (await b.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
  await p.addInitScript(() => { window.__req = null; const fn = async () => ({ text: '' }); fn.json = async (turns) => { window.__req = turns; return { category: 'UNKNOWN', summary: 'x', technical_cause: 'x', solutions: ['x'] }; }; window.claude = { use: async n => n === 'sample' ? fn : null }; });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await p.waitForTimeout(700);
  await p.setInputFiles('#fileIn', file);
  await p.waitForFunction(() => /Добавлено|Пропущены/.test(document.querySelector('#status').textContent), null, { timeout: 120000 });
  await p.waitForTimeout(500); if (await p.locator('[data-act=ldOk]').count()) await p.click('[data-act=ldOk]');
  await p.click('[data-act=diagRun]'); await p.waitForFunction(() => window.__req, null, { timeout: 15000 });
  const t = await p.evaluate(() => window.__req); await b.close();
  const req = { system: t[0].content, input: t[1].content, inputChars: t[1].content.length, rawBytes: fs.statSync(file).size };
  console.error('Лог: ' + path.basename(file) + ' ' + (req.rawBytes / 1024).toFixed(0) + ' КБ → запрос к модели ' + (req.inputChars / 1024).toFixed(1) + ' КБ (' + (100 * (1 - req.inputChars / req.rawBytes)).toFixed(1) + '% меньше), системный промпт ' + (req.system.length / 1024).toFixed(1) + ' КБ');
  if (out) fs.writeFileSync(out, JSON.stringify(req, null, 1));
  if (!call) { console.log(req.input); return; }
  const key = process.env.GEMINI_API_KEY; if (!key) { console.error('Для --call задайте GEMINI_API_KEY'); process.exit(2); }
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: 'user', parts: [{ text: req.input }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } }) });
  const j = await r.json(); const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(x => x.text || '').join('');
  console.log(txt || JSON.stringify(j, null, 1));
})();

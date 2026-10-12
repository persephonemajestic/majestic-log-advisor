// Сервер: записи об известных причинах подписей краша (/v1/shared/sig) на подменённом хранилище.
import W from '../worker/worker.js';
const kv = new Map(), HWID = 'AAAAA-BBBBB-CCCCC-DDDDD';
const env = { ACCESS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); } } };
kv.set('h:' + HWID, JSON.stringify({ n: 'Тестер', seen: Date.now() }));
const call = async (path, body, hw = HWID) => { const r = await W.fetch(new Request('https://x' + path, { method: body ? 'POST' : 'GET', headers: { 'X-HWID': hw, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env); return { s: r.status, j: await r.json().catch(() => ({})) }; };
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
ok((await call('/v1/shared/sig', { sig: 'GTA5.exe+0x1234', ver: '1.0', cause: 'x' }, 'FFFFF-FFFFF-FFFFF-FFFFF')).s !== 200, 'без доступа запись не принимается');
ok((await call('/v1/shared/sig', { sig: 'плохо', cause: 'x' })).s === 400, 'неверная подпись отклоняется');
ok((await call('/v1/shared/sig', { sig: 'GTA5.exe+0x1234', ver: '1.0', cause: '' })).s === 400, 'пустая причина отклоняется');
ok((await call('/v1/shared/sig', { sig: 'GTA5.exe+0x1234', ver: '1.0.3407.0', cause: 'причина', outcome: 'fixed', fixedIn: '1.0.3411.0', fix: ['шаг'] })).j.ok, 'запись сохраняется');
let sh = (await call('/v1/shared')).j, r = sh.sigs && sh.sigs['gta5.exe+0x1234@1.0.3407.0'];
ok(r && r.cause === 'причина' && r.outcome === 'fixed' && r.by === 'Тестер' && r.fix.length === 1, 'запись видна в общей базе с автором');
await call('/v1/shared/sig', { sig: 'GTA5.exe+0x1234', ver: '1.0.3407.0', cause: 'другая', outcome: 'чушь' });
sh = (await call('/v1/shared')).j; ok(sh.sigs['gta5.exe+0x1234@1.0.3407.0'].cause === 'другая' && sh.sigs['gta5.exe+0x1234@1.0.3407.0'].outcome === 'open', 'правка заменяет запись, неизвестный исход → open');
await call('/v1/shared/sig', { sig: 'GTA5.exe+0x1234', ver: '1.0.3407.0', del: true });
sh = (await call('/v1/shared')).j; ok(!sh.sigs['gta5.exe+0x1234@1.0.3407.0'], 'запись удаляется');
process.exit(bad ? 1 : 0);

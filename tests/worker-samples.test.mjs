// Сервер: приём обезличенных логов (/v1/samples/put), срок хранения, выгрузка в закрытый репозиторий одним коммитом без истории.
import W from '../worker/worker.js';
const kv = new Map(), ttl = new Map(), HWID = 'AAAAA-BBBBB-CCCCC-DDDDD';
const env = { GH_TOKEN: 't', GH_SAMPLES_REPO: 'owner/samples', ACCESS: {
  get: async (k) => kv.get(k) ?? null, put: async (k, v, o) => { kv.set(k, v); if (o && o.expirationTtl) ttl.set(k, o.expirationTtl); }, delete: async (k) => { kv.delete(k); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) } };
kv.set('h:' + HWID, JSON.stringify({ n: 'Тестер', seen: Date.now() }));
const call = async (path, body) => { const r = await W.fetch(new Request('https://x' + path, { method: 'POST', headers: { 'X-HWID': HWID, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env); return { s: r.status, j: await r.json().catch(() => ({})) }; };
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
ok((await call('/v1/samples/put', { h: 'zz', k: 'client', gz: 'AAAA' })).s === 400, 'неверный хеш отклоняется');
ok((await call('/v1/samples/put', { h: 'abc123-100', k: 'client', gz: 'не base64' })).s === 400, 'неверные данные отклоняются');
ok((await call('/v1/samples/put', { h: 'abc123-100', k: 'client', gz: 'H4sIAAAA', len: 100 })).j.ok, 'лог принят');
ok(ttl.get('smp:abc123-100') === 7 * 86400, 'хранится 7 дней (автоудаление)');
ok((await call('/v1/samples/put', { h: 'abc123-100', k: 'client', gz: 'H4sIAAAA' })).j.dup, 'дубль не перезаписывается');
await call('/v1/samples/put', { h: 'def456-200', k: 'main', gz: 'H4sIBBBB' });
const calls = []; globalThis.fetch = async (url, init) => { const b = init.body ? JSON.parse(init.body) : null; calls.push({ url: String(url), method: init.method, b }); const sha = 's' + calls.length;
  if (/\/git\/refs\/heads\/main$/.test(url)) return new Response(JSON.stringify({}), { status: 422 });
  return new Response(JSON.stringify({ sha }), { status: 201 }); };
let pr; await W.scheduled({}, env, { waitUntil: (x) => { pr = x; } }); const res = await pr;
ok(res && res.ok && res.n === 2, 'выгрузка по расписанию прошла: ' + JSON.stringify(res));
const blob = calls.find((c) => /\/git\/blobs$/.test(c.url)), commit = calls.find((c) => /\/git\/commits$/.test(c.url)), ref = calls.find((c) => c.method === 'POST' && /\/git\/refs$/.test(c.url));
ok(blob && blob.b.content.split('\n').filter(Boolean).length === 2 && /"gz":"H4sIAAAA"/.test(blob.b.content), 'файл дня содержит оба лога');
ok(commit && Array.isArray(commit.b.parents) && commit.b.parents.length === 0, 'коммит без родителей: старые логи не остаются в истории');
ok(ref && ref.b.ref === 'refs/heads/main', 'пустой репозиторий: ветка создаётся');
ok(calls.every((c) => c.url.startsWith('https://api.github.com/repos/owner/samples/')), 'запросы только в заданный репозиторий');
for (let i = 0; i < 300; i++) kv.set('smpn:' + new Date().toISOString().slice(0, 10), '300');
ok((await call('/v1/samples/put', { h: 'fff000-1', k: 'client', gz: 'H4sI' })).j.full, 'дневной лимит соблюдается');
process.exit(bad ? 1 : 0);

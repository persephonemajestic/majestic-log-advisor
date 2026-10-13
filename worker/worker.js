// Шлюз доступа Majestic Log Advisor: отдаёт интерфейс, оболочку и правила только компьютерам из списка (KV ACCESS).
const HW = /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/;
const NOSTORE = { 'cache-control': 'no-store' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...NOSTORE } });
const deny = () => json({ ok: false }, 403);

async function who(req, env) {
  const h = (req.headers.get('X-HWID') || '').toUpperCase();
  if (!HW.test(h)) return null;
  const raw = await env.ACCESS.get('h:' + h);
  if (!raw) return null;
  let rec = {}; try { rec = JSON.parse(raw); } catch (e) {}
  if (!rec.seen || Date.now() - rec.seen > 6 * 3600 * 1000) { rec.seen = Date.now(); try { await env.ACCESS.put('h:' + h, JSON.stringify(rec)); await touchAv(env); } catch (e) {} }
  return { h, n: rec.n || '' };
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function isAdmin(req, env) { const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '').trim(), p = String(env.ADMIN_PASS || '').trim(); return p.length > 0 && t.length > 0 && same(t, p); }

const normTag = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
async function touchAv(env) { try { await env.ACCESS.put('av', String(Date.now())); } catch (e) {} }
async function getNews(env) { try { const r = await env.ACCESS.get('news'); const l = r ? JSON.parse(r) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } }
export class Presence {
  constructor(state) { this.m = new Map(); }
  async fetch(req) {
    const u = new URL(req.url), h = u.searchParams.get('h'), now = Date.now();
    if (h) this.m.set(h, { t: now, n: u.searchParams.get('n') || '' });
    for (const [k, v] of this.m) if (now - v.t > 100000) this.m.delete(k);
    return new Response(JSON.stringify({ count: this.m.size, names: [...this.m.values()].map((v) => v.n || 'без имени').sort() }), { headers: { 'content-type': 'application/json' } });
  }
}
const FILES = { '/v1/app': '/index.html', '/v1/rules': '/rules.json', '/v1/shell/main.js': '/shell/main.js', '/v1/shell/preload.js': '/shell/preload.js', '/v1/shell/hwid.js': '/shell/hwid.js', '/v1/shell/icon.png': '/shell/icon.png', '/v1/shell/icon.ico': '/shell/icon.ico', '/v1/ver': '/ver.json' };

/* ---------- Обезличенные логи для улучшения правил ----------
   Приложение присылает очищенный от шума и замаскированный лог (сжатый gzip, base64). Храним 7 дней в KV с автоудалением.
   Раз в сутки (cron) и по кнопке в админ-панели выгружаем всё в закрытый GitHub-репозиторий одним коммитом без родителей:
   старые логи не остаются в истории ветки. Нужны секреты GH_TOKEN (fine-grained, Contents: Read and write только на этот репозиторий)
   и GH_SAMPLES_REPO («владелец/имя»). */
const SMP_TTL = 7 * 86400, SMP_DAY_MAX = 300, SMP_MAX_B64 = 3000000;
async function samplesExport(env) {
  if (!env.GH_TOKEN || !env.GH_SAMPLES_REPO) return { ok: false, error: 'На сервере не заданы GH_TOKEN и GH_SAMPLES_REPO' };
  const days = {}; let cursor, n = 0;
  do { const l = await env.ACCESS.list({ prefix: 'smp:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); if (!raw) continue; let r; try { r = JSON.parse(raw); } catch (e) { continue; } const d = new Date(r.at || 0).toISOString().slice(0, 10); (days[d] = days[d] || []).push(JSON.stringify(Object.assign({ h: k.name.slice(4) }, r))); n++; } cursor = l.list_complete ? null : l.cursor; } while (cursor);
  const api = 'https://api.github.com/repos/' + env.GH_SAMPLES_REPO, H = { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'majestic-log-advisor', 'Content-Type': 'application/json' };
  const gh = async (path, method, body) => { const r = await fetch(api + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; };
  const tree = [{ path: 'README.md', mode: '100644', type: 'blob', content: '# Обезличенные логи Majestic Log Advisor\n\nВыгрузка ' + new Date().toISOString() + ', логов: ' + n + '. Каждый файл days/ГГГГ-ММ-ДД.jsonl: одна строка на лог, поле gz — gzip+base64 очищенного и замаскированного текста. Хранится 7 дней, каждая выгрузка заменяет содержимое целиком.\n' }];
  for (const d of Object.keys(days).sort()) { const b = await gh('/git/blobs', 'POST', { content: days[d].join('\n') + '\n', encoding: 'utf-8' }); if (!b.ok) return { ok: false, error: 'blob ' + b.status }; tree.push({ path: 'days/' + d + '.jsonl', mode: '100644', type: 'blob', sha: b.j.sha }); }
  const t = await gh('/git/trees', 'POST', { tree }); if (!t.ok) return { ok: false, error: 'tree ' + t.status };
  const c = await gh('/git/commits', 'POST', { message: 'Выгрузка логов: ' + n, tree: t.j.sha, parents: [] }); if (!c.ok) return { ok: false, error: 'commit ' + c.status };
  let r = await gh('/git/refs/heads/main', 'PATCH', { sha: c.j.sha, force: true });
  if (!r.ok) r = await gh('/git/refs', 'POST', { ref: 'refs/heads/main', sha: c.j.sha });
  if (!r.ok) return { ok: false, error: 'ref ' + r.status };
  await env.ACCESS.put('smpx', JSON.stringify({ at: Date.now(), n }));
  return { ok: true, n, days: Object.keys(days).length };
}

export default {
  async scheduled(ev, env, ctx) { ctx.waitUntil(samplesExport(env).catch(() => null)); },
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/v1/samples/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const h = String(b.h || ''), k = b.k === 'main' ? 'main' : b.k === 'client' ? 'client' : '', gz = String(b.gz || '');
      if (!/^[0-9a-f]{1,16}-\d{1,9}$/.test(h) || !k || !/^[A-Za-z0-9+\/=]+$/.test(gz) || gz.length > SMP_MAX_B64) return json({ ok: false }, 400);
      if (await env.ACCESS.get('smp:' + h)) return json({ ok: true, dup: true });
      const dk = 'smpn:' + new Date().toISOString().slice(0, 10); let dn = 0; try { dn = +(await env.ACCESS.get(dk)) || 0; } catch (e) {}
      if (dn >= SMP_DAY_MAX) return json({ ok: true, full: true });
      await env.ACCESS.put('smp:' + h, JSON.stringify({ k, at: Date.now(), v: String(b.v || '').slice(0, 20), len: +b.len || 0, gz }), { expirationTtl: SMP_TTL });
      await env.ACCESS.put(dk, String(dn + 1), { expirationTtl: 3 * 86400 });
      return json({ ok: true });
    }
    if (p === '/v1/check') { const u = await who(req, env); return u ? json({ ok: true, n: u.n }) : deny(); }
    if (p === '/v1/rules') {
      if (!(await who(req, env))) return deny();
      try { const raw = await env.ACCESS.get('rules'); if (raw) return new Response(raw, { headers: { 'content-type': 'application/json; charset=utf-8', ...NOSTORE } }); } catch (e) {}
    }
    if (FILES[p]) {
      if (!(await who(req, env))) return deny();
      const r = await env.ASSETS.fetch(new Request(url.origin + FILES[p]));
      if (!r.ok) return json({ ok: false }, 404);
      const h = new Headers(r.headers); h.set('cache-control', 'no-store');
      return new Response(r.body, { status: 200, headers: h });
    }
    if (p === '/v1/pulse') {
      const u0 = await who(req, env); if (!u0) return deny();
      const news = await getNews(env); let n = 0, ver = {};
      try { const raw = await env.ACCESS.get('d:' + new Date().toISOString().slice(0, 10)); if (raw) n = (JSON.parse(raw).n) | 0; } catch (e) {}
      try { const r = await env.ASSETS.fetch(new Request(url.origin + '/ver.json')); if (r.ok) ver = await r.json(); } catch (e) {}
      let on = null; try { if (env.PRESENCE) { const st = env.PRESENCE.get(env.PRESENCE.idFromName('p')); const pr = await st.fetch('https://p/beat?h=' + encodeURIComponent(u0.h) + '&n=' + encodeURIComponent(u0.n || '')); on = await pr.json(); } } catch (e) {}
      let sv = '', rv = ''; try { sv = (await env.ACCESS.get('sv')) || ''; rv = (await env.ACCESS.get('rv')) || ''; } catch (e) {}
      return json({ ok: true, news: news[0] ? news[0].id : '', n, app: ver.app || '', shell: ver.shell || '', sv, rv, online: on ? on.count : null, names: on ? on.names : [] });
    }
    if (p === '/v1/shared') {
      const u1 = await who(req, env); if (!u1) return deny();
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      return json({ ok: true, me: u1.n || 'без имени', sv: (await env.ACCESS.get('sv')) || '', notes: sh.notes || {}, replies: sh.replies || {}, sigs: sh.sigs || {} });
    }
    if (p === '/v1/shared/vote' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const key = String(b.key || '').slice(0, 80), at = +b.at || 0, me = u.n || 'без имени';
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      const arr = (sh.replies || {})[key] || [], it = arr.find((x) => x.at === at);
      if (!it) return json({ ok: false }, 404);
      it.votes = (it.votes || []).filter((n) => n !== me); if (b.on) it.votes.push(me);
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    /* Известные причины подписей краша: одна запись на «модуль+смещение@версия», последняя правка побеждает */
    if (p === '/v1/shared/sig' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n), sig = t(b.sig, 120).toLowerCase(), ver = t(b.ver, 40);
      if (!/^[\w.\-]+\+0x[0-9a-f]+$/.test(sig)) return json({ ok: false }, 400);
      const key = sig + (ver ? '@' + ver : '');
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      sh.sigs = sh.sigs || {};
      if (b.del) delete sh.sigs[key];
      else {
        const outcome = ['fixed', 'helped', 'nohelp', 'open'].indexOf(b.outcome) >= 0 ? b.outcome : 'open', cause = t(b.cause, 1500);
        if (!cause) return json({ ok: false }, 400);
        sh.sigs[key] = { sig, ver, cause, outcome, fixedIn: t(b.fixedIn, 40), fix: (Array.isArray(b.fix) ? b.fix : []).map((x) => t(x, 300)).filter(Boolean).slice(0, 6), by: u.n || 'без имени', at: Date.now() };
        const ks = Object.keys(sh.sigs); if (ks.length > 500) { ks.sort((a, c) => sh.sigs[a].at - sh.sigs[c].at); delete sh.sigs[ks[0]]; }
      }
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    if (p === '/v1/shared/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const kind = b.kind === 'reply' ? 'replies' : b.kind === 'note' ? 'notes' : '', key = String(b.key || '').slice(0, 80), text = String(b.text || '').trim().slice(0, 2500);
      if (!kind || !key) return json({ ok: false }, 400);
      let sh = { notes: {}, replies: {} }; try { const raw = await env.ACCESS.get('shared'); if (raw) sh = JSON.parse(raw); } catch (e) {}
      sh.notes = sh.notes || {}; sh.replies = sh.replies || {};
      const arr = (sh[kind][key] || []).filter((x) => !(x.by === (u.n || 'без имени') && (kind === 'notes' || x.text === text)));
      if (text) arr.unshift({ by: u.n || 'без имени', at: Date.now(), text, v: String(b.v || '').slice(0, 20), votes: [] });
      if (arr.length) sh[kind][key] = arr.slice(0, 5); else delete sh[kind][key];
      if (Object.keys(sh[kind]).length > 300) delete sh[kind][Object.keys(sh[kind])[0]];
      await env.ACCESS.put('shared', JSON.stringify(sh)); const sv = String(Date.now()); await env.ACCESS.put('sv', sv);
      return json({ ok: true, sv });
    }
    if (p === '/v1/ai' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'no_key' }, 503);
      let b = {}; try { b = await req.json(); } catch (e) {}
      const sys = String(b.system || '').slice(0, 20000), inp = String(b.input || '').slice(0, 60000); if (inp.length < 20) return json({ ok: false, error: 'bad' }, 400);
      /* скриншот от игрока (быстрый разбор из плагина Discord): JPEG/PNG/WebP в base64, не больше ~4 МБ; в KV не сохраняется */
      const img = b.image && /^image\/(jpeg|png|webp)$/.test(String(b.image.mime || '')) && typeof b.image.data === 'string' && b.image.data.length <= 6000000 && /^[A-Za-z0-9+/=]+$/.test(b.image.data.slice(0, 200)) ? { mime_type: b.image.mime, data: b.image.data } : null;
      const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
      /* кэш: тот же запрос к той же модели и промпту отдаётся из KV и не тратит дневной лимит */
      let ck = ''; try { const dg = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(model + '\n' + sys + '\n' + inp + '\n' + (parseInt(b.max, 10) || 0) + (img ? '\n' + img.data : ''))); ck = 'ac:' + Array.from(new Uint8Array(dg)).slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join(''); } catch (e) {}
      if (ck && !b.fresh) { try { const hit = await env.ACCESS.get(ck); if (hit) return json({ ok: true, text: hit, cached: true }); } catch (e) {} }
      const day = new Date().toISOString().slice(0, 10), qk = 'q:' + day + ':' + u.h; let q = 0; try { q = parseInt(await env.ACCESS.get(qk), 10) || 0; } catch (e) {}
      const lim = parseInt(env.AI_DAILY, 10) || 60; if (q >= lim) return json({ ok: false, error: 'limit' });
      try { await env.ACCESS.put(qk, String(q + 1), { expirationTtl: 172800 }); } catch (e) {}
      let r; try {
        r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: inp }].concat(img ? [{ inline_data: img }] : []) }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: Math.max(256, Math.min(parseInt(b.max, 10) || 8192, 8192)) } }) });
      } catch (e) { return json({ ok: false, error: 'upstream', detail: 'нет связи с Gemini' }); }
      if (!r.ok) { let m = ''; try { m = ((await r.json()).error || {}).message || ''; } catch (e) {} return json({ ok: false, error: r.status === 429 ? 'rate' : 'upstream', detail: 'Gemini ' + r.status + (m ? ': ' + String(m).slice(0, 160) : '') }); }
      let j = {}; try { j = await r.json(); } catch (e) {}
      const t = (((j.candidates || [])[0] || {}).content || {}).parts; const text = t ? t.map(x => x.text || '').join('') : '';
      if (!text) return json({ ok: false, error: 'empty', detail: 'Gemini вернул пустой ответ' + (((j.candidates || [])[0] || {}).finishReason ? ' (' + j.candidates[0].finishReason + ')' : '') });
      if (ck) { try { await env.ACCESS.put(ck, text, { expirationTtl: 604800 }); } catch (e) {} }
      return json({ ok: true, text });
    }
    /* Шаблоны ответов команды (из плагина SupportTemplates): читают все, у кого есть доступ; загружает только тот, кто знает пароль администратора */
    if (p === '/v1/tpl') { const u = await who(req, env); if (!u) return deny(); const raw = await env.ACCESS.get('tpl'); if (!raw) return json({ ok: true, none: true }); try { return json(Object.assign({ ok: true }, JSON.parse(raw))); } catch (e) { return json({ ok: true, none: true }); } }
    if (p === '/v1/tpl/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const pw = String(env.ADMIN_PASS || '').trim(); if (!pw || !same(String(b.pass || '').trim(), pw)) return json({ ok: false, error: 'pass' }, 403);
      const sets = (Array.isArray(b.sets) ? b.sets : []).slice(0, 6).map((st) => ({ name: String(st.name || '').slice(0, 60), items: (Array.isArray(st.items) ? st.items : []).slice(0, 300).map((x) => ({ t: String(x.t || '').slice(0, 160), body: String(x.body || '').slice(0, 6000), hide: !!x.hide })).filter((x) => x.t && x.body) })).filter((st) => st.name && st.items.length);
      if (!sets.length) return json({ ok: false, error: 'empty' }, 400);
      const out = JSON.stringify({ at: Date.now(), by: u.n || '', sets }); if (out.length > 900000) return json({ ok: false, error: 'size' }, 413);
      await env.ACCESS.put('tpl', out); return json({ ok: true, n: sets.reduce((a, st) => a + st.items.length, 0) });
    }
    if (p === '/v1/ai/ping') { const u = await who(req, env); if (!u) return deny(); return json({ ok: !!env.GEMINI_API_KEY }); }
    if (p === '/v1/backup/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const kb = typeof b.kb === 'string' ? b.kb : ''; if (kb.length < 10 || kb.length > 4000000) return json({ ok: false }, 400);
      await env.ACCESS.put('b:' + u.h, JSON.stringify({ at: Date.now(), kb })); return json({ ok: true });
    }
    if (p === '/v1/backup/get') {
      const u = await who(req, env); if (!u) return deny();
      const raw = await env.ACCESS.get('b:' + u.h); if (!raw) return json({ ok: true, none: true });
      let r = {}; try { r = JSON.parse(raw); } catch (e) {} return json({ ok: true, at: r.at || 0, kb: r.kb || '' });
    }
    if (p === '/v1/report' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const text = String(b.text || '').trim().slice(0, 3000), link = String(b.link || '').trim().slice(0, 500);
      let shot = typeof b.shot === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.shot) ? b.shot : ''; if (shot.length > 1500000) shot = '';
      if (!text && !link && !shot) return json({ ok: false }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await env.ACCESS.put('rp:' + id, JSON.stringify({ id, at: Date.now(), by: u.n || 'без имени', page: String(b.page || '').slice(0, 60), text, link, v: String(b.v || '').slice(0, 20), diag: String(b.diag || '').slice(0, 1500), shot }), { expirationTtl: 90 * 86400 });
      await touchAv(env);
      return json({ ok: true });
    }
    if (p === '/v1/news') { if (!(await who(req, env))) return deny(); return json({ ok: true, list: await getNews(env) }); }
    if (p === '/v1/tickets/get') {
      const u = await who(req, env); if (!u) return deny();
      const tag = normTag(url.searchParams.get('tag')), hash = String(url.searchParams.get('hash') || '').slice(0, 24);
      let rec = null, hit = null;
      if (tag) { const raw = await env.ACCESS.get('t:' + tag); if (raw) { try { rec = JSON.parse(raw); } catch (e) {} } }
      if (hash) { const raw = await env.ACCESS.get('lh:' + hash); if (raw) { try { hit = JSON.parse(raw); } catch (e) {} } }
      return json({ ok: true, rec, hit });
    }
    if (p === '/v1/tickets/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const tag = normTag(b.tag), hash = String(b.hash || '').slice(0, 24); if (!tag || !hash) return json({ ok: false }, 400);
      const it = { hash, at: Date.now(), by: u.n || 'без имени', v: String(b.v || '').slice(0, 12), st: String(b.st || '').slice(0, 12), head: String(b.head || '').slice(0, 200), keys: (Array.isArray(b.keys) ? b.keys : []).slice(0, 6).map((x) => String(x).slice(0, 120)) };
      let rec = { tag: String(b.tag).trim().slice(0, 60), items: [] }; const raw = await env.ACCESS.get('t:' + tag); if (raw) { try { rec = JSON.parse(raw); } catch (e) {} }
      rec.items = [it].concat((rec.items || []).filter((x) => x.hash !== hash)).slice(0, 20);
      await env.ACCESS.put('t:' + tag, JSON.stringify(rec));
      await env.ACCESS.put('lh:' + hash, JSON.stringify({ at: it.at, by: it.by, tag: rec.tag, st: it.st }));
      return json({ ok: true });
    }
    if (p === '/v1/logs/put' && Date.now() < Date.parse('2026-10-14T23:59:59+03:00') && req.method === 'POST') { const u = await who(req, env); if (!u) return deny(); return json({ ok: true, added: 0, paused: true }); }
    if (p === '/v1/logs/put' && req.method === 'POST') {
      const u = await who(req, env); if (!u) return deny();
      let b = {}; try { b = await req.json(); } catch (e) {}
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40), day = new Date().toISOString().slice(0, 10), TTL = { expirationTtl: 45 * 86400 };
      let acc = null, added = 0;
      for (const it of items) {
        const hash = String(it.hash || '').slice(0, 24); if (!/^[0-9a-z-]{4,24}$/i.test(hash)) continue;
        if (await env.ACCESS.get('r:' + hash)) continue;
        await env.ACCESS.put('r:' + hash, '1', TTL);
        if (!acc) { acc = { n: 0, bad: 0, mods: 0, probs: {} }; try { const raw = await env.ACCESS.get('d:' + day); if (raw) acc = JSON.parse(raw); } catch (e) {} }
        acc.n++; if (it.st === 'bad') acc.bad++; if (it.mods) acc.mods++;
        const bv = /^[0-9][0-9.]{0,14}$/.test(String(it.bv || '')) ? String(it.bv) : '';
        if (bv) { acc.bv = acc.bv || {}; const x = acc.bv[bv] = acc.bv[bv] || { n: 0, bad: 0 }; x.n++; if (it.st === 'bad') x.bad++; }
        for (const pr of (Array.isArray(it.probs) ? it.probs : []).slice(0, 8)) {
          const k = String(pr.k || '').slice(0, 80); if (!k) continue;
          if (!acc.probs[k] && Object.keys(acc.probs).length >= 200) continue;
          const o = acc.probs[k] = acc.probs[k] || { t: String(pr.t || k).slice(0, 160), c: 0, fx: (Array.isArray(pr.fx) ? pr.fx : []).slice(0, 3).map((x) => String(x).slice(0, 220)) };
          o.c++; if (bv) { o.b = o.b || {}; if (o.b[bv] || Object.keys(o.b).length < 6) o.b[bv] = (o.b[bv] || 0) + 1; }
        }
        added++;
      }
      if (acc && added) await env.ACCESS.put('d:' + day, JSON.stringify(acc), TTL);
      return json({ ok: true, added });
    }
    if (p === '/v1/stats') {
      const u = await who(req, env); if (!u) return deny();
      const n = Math.max(1, Math.min(14, parseInt(url.searchParams.get('days') || '7', 10) || 7)), out = [];
      for (let i = 0; i < n; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const raw = await env.ACCESS.get('d:' + d); if (raw) { try { out.push(Object.assign({ d }, JSON.parse(raw))); } catch (e) {} } }
      return json({ ok: true, today: new Date().toISOString().slice(0, 10), days: out });
    }
    if (p === '/admin') return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', ...NOSTORE, 'x-robots-tag': 'noindex' } });
    if (p === '/admin/api' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ ok: false, error: env.ADMIN_PASS ? 'Неверный пароль' : 'На сервере не задан пароль ADMIN_PASS' }, 401);
      let b = {}; try { b = await req.json(); } catch (e) {}
      if (b.action === 'list') {
        const out = []; let cursor;
        do { const l = await env.ACCESS.list({ prefix: 'h:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); let r = {}; try { r = JSON.parse(raw); } catch (e) {} out.push({ h: k.name.slice(2), n: r.n || '', added: r.added || 0, seen: r.seen || 0 }); } cursor = l.list_complete ? null : l.cursor; } while (cursor);
        out.sort((a, c) => (c.seen || 0) - (a.seen || 0));
        return json({ ok: true, list: out });
      }
      if (b.action === 'rulesGet') { let rl = []; try { const raw = await env.ACCESS.get('rules'); if (raw) rl = JSON.parse(raw).rules || []; } catch (e) {} return json({ ok: true, rules: rl }); }
      if (b.action === 'rulesSet') {
        const rl = (Array.isArray(b.rules) ? b.rules : []).slice(0, 200).map((r, i) => ({ id: String(r.id || 'r' + Date.now().toString(36) + i).slice(0, 40), kind: r.kind === 'client' ? 'client' : 'main', pattern: String(r.pattern || '').slice(0, 200), title: String(r.title || '').slice(0, 160), sev: ['info', 'warn', 'err', 'crit'].includes(r.sev) ? r.sev : 'err', cause: String(r.cause || '').slice(0, 800), fix: (Array.isArray(r.fix) ? r.fix : []).slice(0, 10).map((x) => String(x).slice(0, 400)) })).filter((r) => r.pattern);
        await env.ACCESS.put('rules', JSON.stringify({ v: 1, rules: rl })); await env.ACCESS.put('rv', String(Date.now())); return json({ ok: true, n: rl.length });
      }
      if (b.action === 'stats') {
        const out = [];
        for (let i = 0; i < 14; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const raw = await env.ACCESS.get('d:' + d); if (raw) { try { const o = JSON.parse(raw); out.push({ d, n: o.n | 0, bad: o.bad | 0, mods: o.mods | 0, probs: Object.keys(o.probs || {}).map((k) => ({ k, t: o.probs[k].t, c: o.probs[k].c | 0 })) }); } catch (e) {} } }
        return json({ ok: true, days: out });
      }
      if (b.action === 'reportList') {
        const out = []; let cursor;
        do { const l = await env.ACCESS.list({ prefix: 'rp:', cursor }); for (const k of l.keys) { const raw = await env.ACCESS.get(k.name); let r = {}; try { r = JSON.parse(raw); } catch (e) {} if (r.id) { r.hasShot = !!r.shot; delete r.shot; out.push(r); } } cursor = l.list_complete ? null : l.cursor; } while (cursor);
        out.sort((a, c) => c.at - a.at); return json({ ok: true, list: out.slice(0, 100) });
      }
      if (b.action === 'reportShot') { const raw = await env.ACCESS.get('rp:' + String(b.id || '').slice(0, 20)); let r = {}; try { r = JSON.parse(raw); } catch (e) {} return json({ ok: true, shot: r.shot || '' }); }
      if (b.action === 'reportDel') { await env.ACCESS.delete('rp:' + String(b.id || '').slice(0, 20)); await touchAv(env); return json({ ok: true }); }
      if (b.action === 'newsList') return json({ ok: true, list: await getNews(env) });
      if (b.action === 'newsAdd') {
        const text = String(b.text || '').trim().slice(0, 1500); if (!text) return json({ ok: false, error: 'Пустой текст' }, 400);
        const list = await getNews(env); list.unshift({ id: Date.now().toString(36), at: Date.now(), text }); await env.ACCESS.put('news', JSON.stringify(list.slice(0, 30))); await touchAv(env); return json({ ok: true });
      }
      if (b.action === 'samplesExport') return json(await samplesExport(env));
      if (b.action === 'samplesInfo') { let n = 0, cursor; do { const l = await env.ACCESS.list({ prefix: 'smp:', cursor }); n += l.keys.length; cursor = l.list_complete ? null : l.cursor; } while (cursor); let x = null; try { x = JSON.parse(await env.ACCESS.get('smpx')); } catch (e) {} return json({ ok: true, n, last: x, repo: env.GH_SAMPLES_REPO || '', ready: !!(env.GH_TOKEN && env.GH_SAMPLES_REPO) }); }
      if (b.action === 'ping') return json({ ok: true, v: (await env.ACCESS.get('av')) || '0' });
      if (b.action === 'newsDel') { const list = (await getNews(env)).filter((x) => x.id !== b.id); await env.ACCESS.put('news', JSON.stringify(list)); await touchAv(env); return json({ ok: true }); }
      const h = String(b.h || '').trim().toUpperCase();
      if (!HW.test(h)) return json({ ok: false, error: 'Код должен быть вида XXXXX-XXXXX-XXXXX-XXXXX' }, 400);
      if (b.action === 'add') { const old = await env.ACCESS.get('h:' + h); let r = {}; try { r = old ? JSON.parse(old) : {}; } catch (e) {} await env.ACCESS.put('h:' + h, JSON.stringify({ n: String(b.n || '').slice(0, 80), added: r.added || Date.now(), seen: r.seen || 0 })); await touchAv(env); return json({ ok: true }); }
      if (b.action === 'del') { await env.ACCESS.delete('h:' + h); await touchAv(env); return json({ ok: true }); }
      return json({ ok: false, error: 'Неизвестное действие' }, 400);
    }
    return new Response('Not found', { status: 404, headers: NOSTORE });
  }
};

const ADMIN_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Доступ</title>
<style>[hidden]{display:none!important}:root{--bg:#eef1f5;--ink:#0c1420;--mut:#5c6879;--line:#cdd3dc;--card:#fff;--acc:#1d4ed8;--bad:#b4233a}@media(prefers-color-scheme:dark){:root{--bg:#0b111a;--ink:#e6ecf5;--mut:#93a1b5;--line:#263244;--card:#121a26;--acc:#6b8cff;--bad:#ff7a8c}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:820px;margin:0 auto;padding:28px 16px;display:grid;gap:16px}h1{margin:0;font-size:22px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:12px}
textarea{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-width:0;flex:1 1 280px;resize:vertical}input{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;min-width:0}button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:8px 14px;cursor:pointer}button.p{background:var(--acc);border-color:var(--acc);color:#fff}button.d{color:var(--bad)}
.row{display:flex;gap:8px;flex-wrap:wrap}.row input{flex:1 1 180px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}code{font:600 13px Consolas,monospace}.m{color:var(--mut);font-size:13px}.w{overflow-x:auto}</style></head><body><main>
<h1>Доступ к анализатору логов</h1>
<div class="card" id="login"><div class="row"><input type="password" id="pw" placeholder="Пароль администратора" autocomplete="current-password"><button class="p" id="go">Войти</button></div><div class="m" id="msg"></div></div>
<div id="app" hidden><div class="card"><b>Добавить компьютер</b><div class="row"><input id="h" placeholder="Код: XXXXX-XXXXX-XXXXX-XXXXX"><input id="n" placeholder="Имя (необязательно)"><button class="p" id="add">Выдать доступ</button></div><div class="m" id="msg2"></div></div>
<div class="card"><b>Объявление для команды</b><div class="m">Появится у всех пользователей при следующем запуске приложения.</div><div class="row"><textarea id="nt" rows="3" placeholder="Например: Добавлено правило про ошибку 0x80070005, обновите приложение"></textarea><button class="p" id="nadd">Отправить</button></div><div class="m" id="msg3"></div><div class="w"><table><tbody id="nl"></tbody></table></div></div>
<div class="card"><b>Правила команды</b><div class="m">Правила появляются у всех в приложении без обновления. Новое правило применяется к строкам лога, где есть указанный текст.</div><div class="row"><select id="rk"><option value="main">main.log</option><option value="client">client.log</option></select><select id="rs"><option value="err">Ошибка</option><option value="warn">Предупреждение</option><option value="crit">Критично</option><option value="info">Информация</option></select><input id="rp" placeholder="Что искать в строке лога"><input id="rt" placeholder="Название проблемы"></div><div class="row"><textarea id="rc" rows="2" placeholder="Причина проблемы"></textarea><textarea id="rf" rows="3" placeholder="Шаги решения, каждый с новой строки"></textarea></div><div class="row"><button class="p" id="radd">Добавить правило</button></div><div class="m" id="msg4"></div><div class="w"><table><tbody id="rl"></tbody></table></div></div>
<div class="m" id="live"></div>
<div class="card"><b>Статистика команды за 14 дней</b> <button id="stR">Обновить</button><div class="w" id="stBox"></div></div>
<div class="card"><b>Логи для обучения</b> <button id="smX">Выгрузить сейчас</button><div class="w" id="smBox"><span class="m">Загрузка…</span></div></div>
<div class="card"><b>Сообщения о проблемах <span class="m" id="rcnt"></span></b><div class="w"><table><tbody id="rpl"></tbody></table></div></div>
<div class="card"><b>Разрешённые компьютеры <span class="m" id="cnt"></span></b><div class="w"><table><thead><tr><th>Код</th><th>Имя</th><th>Последний вход</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div></div>
<script>
const $=s=>document.querySelector(s);let PW='';try{PW=sessionStorage.getItem('pw')||''}catch(e){}
async function api(b){const r=await fetch('/admin/api',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+PW},body:JSON.stringify(b)});return r.json()}
const fmt=t=>t?new Date(t).toLocaleString('ru'):'ещё не заходил';const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SIG={};const same=(k,v)=>{const x=JSON.stringify(v);if(SIG[k]===x)return true;SIG[k]=x;return false};
async function load(){const r=await api({action:'list'});if(!r.ok){$('#msg').textContent=r.error||'Ошибка';$('#login').hidden=false;$('#app').hidden=true;return}
$('#login').hidden=true;$('#app').hidden=false;if(same('l',r.list))return;$('#cnt').textContent='('+r.list.length+')';
$('#tb').innerHTML=r.list.map(x=>'<tr><td><code>'+esc(x.h)+'</code></td><td>'+esc(x.n)+'</td><td class="m">'+fmt(x.seen)+'</td><td><button class="d" data-h="'+esc(x.h)+'">Отозвать</button></td></tr>').join('')||'<tr><td colspan="4" class="m">Список пуст</td></tr>'}
$('#go').onclick=()=>{PW=$('#pw').value;try{sessionStorage.setItem('pw',PW)}catch(e){}load().then(()=>poll(true));loadNews();loadRules();loadReports();loadStats();loadSmp()};$('#pw').onkeydown=e=>{if(e.key==='Enter')$('#go').click()};
$('#add').onclick=async()=>{const r=await api({action:'add',h:$('#h').value,n:$('#n').value});$('#msg2').textContent=r.ok?'Доступ выдан.':(r.error||'Ошибка');if(r.ok){$('#h').value='';$('#n').value='';load()}};
$('#tb').onclick=async e=>{const h=e.target.getAttribute&&e.target.getAttribute('data-h');if(!h)return;if(e.target.dataset.sure!=='1'){e.target.dataset.sure='1';e.target.textContent='Точно отозвать?';return}await api({action:'del',h});load()};
async function loadNews(){const r=await api({action:'newsList'});if(!r.ok||same('n',r.list))return;$('#nl').innerHTML=r.list.map(x=>'<tr><td class="m">'+fmt(x.at)+'</td><td>'+esc(x.text)+'</td><td><button class="d" data-n="'+esc(x.id)+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Объявлений нет</td></tr>'}
$('#nadd').onclick=async()=>{const r=await api({action:'newsAdd',text:$('#nt').value});$('#msg3').textContent=r.ok?'Отправлено.':(r.error||'Ошибка');if(r.ok){$('#nt').value='';loadNews()}};
$('#nl').onclick=async e=>{const n=e.target.getAttribute&&e.target.getAttribute('data-n');if(!n)return;await api({action:'newsDel',id:n});loadNews()};
let RULES=[];
async function loadRules(){const r=await api({action:'rulesGet'});if(!r.ok)return;RULES=r.rules;drawRules()}
function drawRules(){$('#rl').innerHTML=RULES.map((x,i)=>'<tr><td class="m">'+esc(x.kind)+'</td><td><b>'+esc(x.title||x.pattern)+'</b><div class="m">'+esc(x.pattern)+'</div></td><td><button class="d" data-r="'+i+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Правил нет</td></tr>'}
async function saveRules(){const r=await api({action:'rulesSet',rules:RULES});$('#msg4').textContent=r.ok?'Сохранено: '+r.n+'. Правила дойдут до приложений в течение минуты.':(r.error||'Ошибка');return r}
$('#radd').onclick=async()=>{const pat=$('#rp').value.trim();if(!pat){$('#msg4').textContent='Укажите, что искать в строке лога';return}RULES.push({kind:$('#rk').value,sev:$('#rs').value,pattern:pat,title:$('#rt').value.trim(),cause:$('#rc').value.trim(),fix:$('#rf').value.split('\\n').map(x=>x.trim()).filter(Boolean)});const r=await saveRules();if(r.ok){$('#rp').value=$('#rt').value=$('#rc').value=$('#rf').value='';drawRules()}else{RULES.pop()}};
$('#rl').onclick=async e=>{const i=e.target.getAttribute&&e.target.getAttribute('data-r');if(i===null||i===undefined)return;RULES.splice(+i,1);await saveRules();drawRules()};
async function loadStats(){const r=await api({action:'stats'});if(!r.ok||same('st',r.days))return;const days=r.days;if(!days.length){$('#stBox').innerHTML='<div class="m">Данных пока нет</div>';return}const tot=days.reduce((a,x)=>({n:a.n+x.n,bad:a.bad+x.bad,mods:a.mods+x.mods}),{n:0,bad:0,mods:0});const pm={};days.forEach(x=>x.probs.forEach(p=>{const o=pm[p.k]=pm[p.k]||{t:p.t,c:0};o.c+=p.c}));const top=Object.keys(pm).map(k=>pm[k]).sort((a,b)=>b.c-a.c).slice(0,10);$('#stBox').innerHTML='<div class="m">Логов: '+tot.n+', с провалом запуска: '+tot.bad+' ('+(tot.n?Math.round(tot.bad*100/tot.n):0)+'%), с модами: '+tot.mods+'</div><table><tbody>'+days.map(x=>'<tr><td class="m">'+esc(x.d)+'</td><td>'+x.n+' логов</td><td>'+x.bad+' провалов</td><td>'+x.mods+' с модами</td></tr>').join('')+'</tbody></table><b>Частые проблемы</b><table><tbody>'+top.map(p=>'<tr><td>'+esc(p.t)+'</td><td>'+p.c+'</td></tr>').join('')+'</tbody></table>'}
$('#stR').onclick=()=>{SIG.st='';loadStats()};
async function loadSmp(){const r=await api({action:'samplesInfo'});if(!r.ok)return;$('#smBox').innerHTML='Хранится обезличенных логов: <b>'+r.n+'</b> (7 дней). '+(r.ready?'Выгрузка в закрытый репозиторий '+esc(r.repo)+(r.last?': последняя '+fmt(r.last.at)+', логов '+r.last.n:': ещё не было')+'.':'<span class="m">Выгрузка не настроена: задайте секреты GH_TOKEN и GH_SAMPLES_REPO в Cloudflare.</span>')}
$('#smX').onclick=async()=>{$('#smX').disabled=true;const r=await api({action:'samplesExport'});$('#smX').disabled=false;alert(r.ok?'Выгружено логов: '+r.n:'Ошибка: '+(r.error||'нет ответа'));loadSmp()};
async function loadReports(){const r=await api({action:'reportList'});if(!r.ok||same('r',r.list))return;document.title=r.list.length?'('+r.list.length+') Доступ':'Доступ';$('#rcnt').textContent=r.list.length?'('+r.list.length+')':'';$('#rpl').innerHTML=r.list.map(x=>'<tr><td class="m" style="white-space:nowrap">'+fmt(x.at)+'<br>'+esc(x.by)+'<br>'+esc(x.v||'')+'</td><td><b>'+esc(x.page||'—')+'</b><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(x.text)+'</div>'+(/^https?:\\/\\//.test(x.link)?'<div><a href="'+esc(x.link)+'" target="_blank" rel="noopener">'+esc(x.link)+'</a></div>':x.link?'<div class="m">'+esc(x.link)+'</div>':'')+(x.diag?'<details><summary class="m">Сведения о приложении</summary><div class="m" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(x.diag)+'</div></details>':'')+(x.hasShot?'<div><button data-s="'+esc(x.id)+'">Показать скриншот</button></div>':'')+'<div data-i="'+esc(x.id)+'"></div></td><td><button class="d" data-rd="'+esc(x.id)+'">Удалить</button></td></tr>').join('')||'<tr><td class="m">Сообщений нет</td></tr>'}
$('#rpl').onclick=async e=>{const t=e.target,s=t.getAttribute&&t.getAttribute('data-s'),d=t.getAttribute&&t.getAttribute('data-rd');if(s){const r=await api({action:'reportShot',id:s});const box=t.parentNode.nextSibling;box.innerHTML=r.shot?'<img src="'+r.shot+'" style="max-width:100%;border-radius:8px;margin-top:6px">':'<span class="m">Нет картинки</span>'}if(d){await api({action:'reportDel',id:d});loadReports()}};
let AV=null,BUSY=false;
function stamp(){const d=new Date(),p=n=>(n<10?'0':'')+n;$('#live').textContent='Обновляется само. Проверено в '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
async function poll(force){if(BUSY||!PW||$('#app').hidden||(document.hidden&&!force))return;BUSY=true;try{const r=await api({action:'ping'});if(r.ok){if(force||r.v!==AV){AV=r.v;await Promise.all([load(),loadNews(),loadReports(),loadStats()])}stamp()}}catch(e){$('#live').textContent='Нет связи, пробую снова…'}BUSY=false}
setInterval(()=>poll(false),15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(true)});
if(PW){load().then(()=>poll(true));loadNews();loadRules();loadReports();loadStats();loadSmp()}
</script></main></body></html>`;

/**
 * @name MajesticLogImport
 * @version 1.2.1
 * @description Кнопка «В анализатор» на логах и дампах в ваших тикетах: файл и данные игрока уходят в Majestic Log Advisor.
 * @author persephonemajestic
 * @source https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/betterdiscord
 * @updateUrl https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/betterdiscord/MajesticLogImport.plugin.js
 */
/* Кнопка появляется только у вложений .log, .txt, .zip, .dmp, .evtx в ветках, где вы участник.
   «Все файлы тикета» отправляет разом все такие вложения из загруженных сообщений ветки.
   Файл забирает само приложение (оно слушает только ваш компьютер, 127.0.0.1) по ключу из «Настроек» приложения.
   Если приложение закрыто, отправка встаёт в очередь и уйдёт, когда приложение запустится.
   Плагин сам проверяет обновления раз в 6 часов и ставит новую версию из репозитория. */
const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "queue", MAX_AGE = 20 * 3600 * 1000, VERSION = "1.2.1";
const UPDATE_URL = "https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/betterdiscord/MajesticLogImport.plugin.js";

/* Данные игрока из текста: подписанные поля («Ник:», «Статик:», «Сервер:») и ник вида Имя_Фамилия.
   Сначала свои сообщения игрока, потом поля формы тикета, потом текст бота; строки про саппорта пропускаются. */
const STOP = /\s*(?:[,;|/(]|\s-\s|\s—\s|$|\s+(?:ник|nick|статик|static|стат|id|сервер|server|discord|дискорд|проблема|описание)(?=[\s:.,;!?*-]|$))/i;
const STAFF = /саппорт|support|модератор|администратор|админ|staff|принял|сотрудник|агент|хелпер|helper/i;
const PRE = "(?:^|[^A-Za-zА-Яа-яЁё_])", SEP = "([\\s*]*[:\\-—№#][\\s*]*|\\s+)";
const NICK_RE = new RegExp(PRE + "(?:ник(?:нейм)?|nick(?:name)?|имя\\s+(?:в\\s+игре|персонажа)|игровое\\s+имя)" + SEP + "([A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24})(?![A-Za-zА-Яа-яЁё])", "i");
const STATIC_RE = new RegExp(PRE + "(?:статик|static(?:\\s*id)?|стат\\.?|статический\\s+(?:id|номер)|id\\s+персонажа|паспорт)[\\s:\\-—№#*]*(\\d{1,7})(?!\\d)", "i");
const SERVER_RE = new RegExp(PRE + "(?:сервер|server)(?![A-Za-zА-Яа-яЁё])" + SEP + "([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 \\-]{0,30})", "i");
function cut(v) { v = String(v || "").split(/\n|⏎/)[0]; const m = STOP.exec(v); return (m ? v.slice(0, m.index) : v).replace(/[*_`~]+$/, "").replace(/^[*_`~:\s-]+/, "").trim(); }
const punct = (s) => /[:\-—№#]/.test(s);
function fromText(p, t, own) {
    if (!p.nick) {
        const n = NICK_RE.exec(t);
        if (n && (punct(n[1]) || /^[A-Z][a-z]+[ _][A-Z][a-z]+$/.test(n[2]))) p.nick = n[2];
        else if (own) { const u = /(?:^|[^A-Za-z_])([A-Z][a-z]{1,15}_[A-Z][a-z]{1,20})(?![A-Za-z_])/.exec(t); if (u) p.nick = u[1]; }
    }
    if (!p.static) { const s = STATIC_RE.exec(t); if (s) p.static = s[1]; }
    if (!p.server) {
        const v = SERVER_RE.exec(t);
        if (v) { const x = cut(v[2]); if (x && x.length <= 24 && (punct(v[1]) || /^[A-Z0-9]/.test(x)) && !/^(не|нет|любой|все)(\s|$)/i.test(x)) p.server = x; }
        if (!p.server) { const d = /(?:^|[^\d])(\d{1,2})\s*(?:-?(?:й|ой|ый|м|ом))?\s*сервер/i.exec(t); if (d) p.server = d[1]; }
    }
}
function extractPlayer(texts, fields, botTexts) {
    const p = { nick: "", static: "", server: "" };
    for (const t of texts || []) fromText(p, String(t || ""), true);
    for (const f of fields || []) {
        const n = String(f.name || ""), v = String(f.value || "").trim();
        if (STAFF.test(n)) continue;
        if (!p.nick && /(?:^|[^а-яёa-z])ник|nick|игров\S*\s+имя|имя\s+(?:в\s+игре|персонажа)/i.test(n)) { const x = cut(v); if (/^[A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24}$/.test(x)) p.nick = x; }
        else if (!p.static && /статик|static|паспорт|id\s*персонажа/i.test(n)) { const d = /\d{1,7}/.exec(v); if (d) p.static = d[0]; }
        else if (!p.server && /сервер|server/i.test(n)) { const x = cut(v); if (x && x.length <= 24) p.server = x; }
    }
    for (const t of botTexts || []) for (const line of String(t || "").split(/\n/)) if (!STAFF.test(line)) fromText(p, line, false);
    return p;
}
const cmpVer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

module.exports = class MajesticLogImport {
    constructor(meta) { this.meta = meta || {}; this.obs = null; this.timer = 0; this.upTimer = 0; }

    cfg() { return Object.assign({ token: "", port: 47615 }, BdApi.Data.load("MajesticLogImport", "settings") || {}); }
    setCfg(c) { BdApi.Data.save("MajesticLogImport", "settings", c); }
    store(n) { return BdApi.Webpack.getStore(n); }
    toast(t, type) { try { BdApi.UI.showToast(t, { type: type || "info" }); } catch (e) {} }
    fetch() { const f = (BdApi.Net && BdApi.Net.fetch) || fetch; return f.apply(null, arguments); }

    start() {
        this.obs = new MutationObserver(() => { clearTimeout(this.scanT); this.scanT = setTimeout(() => this.scan(), 150); });
        this.obs.observe(document.body, { childList: true, subtree: true });
        this.scan();
        this.timer = setInterval(() => this.flush(), 20000);
        this.upT = setTimeout(() => this.checkUpdate(), 15000);
        this.upTimer = setInterval(() => this.checkUpdate(), 6 * 3600 * 1000);
        BdApi.DOM.addStyle("MajesticLogImport", ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}.mla-all{font-weight:600}");
    }
    stop() {
        if (this.obs) this.obs.disconnect(); this.obs = null; clearInterval(this.timer); clearInterval(this.upTimer); clearTimeout(this.upT);
        BdApi.DOM.removeStyle("MajesticLogImport");
        document.querySelectorAll(".mla-btn").forEach(b => b.remove());
        document.querySelectorAll("[data-mla]").forEach(a => a.removeAttribute("data-mla"));
    }

    /* только ветки, в которых вы участник */
    joined(channelId) {
        const ch = this.store("ChannelStore")?.getChannel(channelId);
        if (!ch || !(ch.isThread ? ch.isThread() : ch.type === 11 || ch.type === 12)) return false;
        const jt = this.store("JoinedThreadsStore");
        return !!(jt && jt.hasJoined(channelId));
    }
    messages(channelId) { let list = []; try { const all = this.store("MessageStore")?.getMessages(channelId); list = all?.toArray ? all.toArray() : (all?._array || []); } catch (e) {} return list; }
    /* все логи и дампы из загруженных сообщений ветки */
    /* игрок ветки: автор первого сообщения не от бота (обычно тот, кто открыл тикет) */
    playerId(channelId) { const m = this.messages(channelId).find(x => x && x.author && !x.author.bot); return m ? m.author.id : ""; }
    attachments(channelId) {
        const out = [], seen = {}, pid = this.playerId(channelId);
        for (const m of this.messages(channelId)) for (const a of (pid && m?.author?.id !== pid ? [] : (m && m.attachments) || [])) {
            const name = a.filename || a.name || "", url = a.url || "";
            if (!FILE_RE.test(name) || !/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//.test(url) || seen[url]) continue;
            seen[url] = 1; out.push({ messageId: m.id, url, name });
        }
        return out;
    }

    scan() {
        let firstCh = "", firstBtn = null;
        for (const a of document.querySelectorAll('a[href*="/attachments/"]:not([data-mla])')) {
            a.setAttribute("data-mla", "1");
            let url; try { url = new URL(a.href); } catch (e) { continue; }
            if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(url.hostname)) continue;
            const name = decodeURIComponent(url.pathname.split("/").pop() || "");
            if (!FILE_RE.test(name)) continue;
            const li = a.closest('[id^="chat-messages-"]'); if (!li) continue;
            const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id); if (!m) continue;
            if (!this.joined(m[1])) continue;
            const b = document.createElement("button");
            b.className = "mla-btn mla-one"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor"; b.dataset.ch = m[1];
            b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.send(m[1], m[2], a.href, name, b); });
            a.insertAdjacentElement("afterend", b);
        }
        /* одна кнопка «Все файлы тикета» — у первого файла ветки на экране */
        const one = document.querySelector(".mla-one");
        if (one) { firstCh = one.dataset.ch; firstBtn = one; }
        const all = document.querySelector(".mla-all");
        const n = firstCh ? this.attachments(firstCh).length : 0;
        if (all && (!firstBtn || all.previousElementSibling !== firstBtn || all.dataset.ch !== firstCh || n < 2)) all.remove();
        if (firstBtn && n >= 2 && !document.querySelector(".mla-all")) {
            const b = document.createElement("button");
            b.className = "mla-btn mla-all"; b.type = "button"; b.dataset.ch = firstCh; b.textContent = "Все файлы тикета (" + n + ")"; b.title = "Отправить в анализатор все логи и дампы игрока из этой ветки (файлы саппортов не берутся)";
            b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.sendAll(firstCh, b); });
            firstBtn.insertAdjacentElement("afterend", b);
        }
    }

    player(channelId, messageId) {
        const ch = this.store("ChannelStore")?.getChannel(channelId), ms = this.store("MessageStore");
        const msg = ms?.getMessage(channelId, messageId), au = msg?.author || {};
        const base = { id: au.id || "", name: au.globalName || au.global_name || au.username || "", username: au.username || "",
            link: "https://discord.com/channels/" + (ch?.guild_id || "@me") + "/" + channelId + "/" + messageId };
        const list = this.messages(channelId);
        /* текст пишет сам игрок; формы тикета присылает бот — их поля тоже берём, сообщения саппортов — нет */
        const texts = list.filter(x => x?.author?.id === au.id).map(x => String(x.content || ""));
        if (msg?.content) texts.push(String(msg.content));
        const fields = [], bot = [];
        for (const x of list) if (x?.author?.id === au.id || x?.author?.bot) for (const em of x.embeds || []) {
            for (const f of em.fields || []) fields.push({ name: f.name || f.rawName || "", value: f.value || f.rawValue || "" });
            if (x?.author?.bot) bot.push(String(em.description || em.rawDescription || ""));
        }
        return { ticket: ch?.name || "", ticketId: channelId, player: Object.assign(base, extractPlayer(texts, fields, bot)) };
    }

    /* Файл скачивает сам Discord (у приложения может не быть доступа к серверам Discord) и отдаёт приложению.
       Если скачать не вышло — просим приложение скачать само (/v1/import). */
    async post(body) {
        const c = this.cfg(), base = "http://127.0.0.1:" + (c.port || 47615);
        if (!c.token) throw new Error("token");
        let buf = null;
        if (/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//.test(body.url || "")) {
            try { const d = await this.fetch(body.url); if (d.ok) { const ab = await d.arrayBuffer(); if (ab.byteLength && ab.byteLength <= 250 * 1048576) buf = new Uint8Array(ab); } } catch (e) {}
        }
        let r;
        if (buf) {
            const meta = btoa(unescape(encodeURIComponent(JSON.stringify(body))));
            const up = { method: "POST", headers: { "content-type": "application/octet-stream", "x-mla-token": c.token, "x-mla-meta": meta }, body: buf };
            try { r = await this.fetch(base + "/v1/upload", up); } catch (e) { r = await fetch(base + "/v1/upload", up); }
        } else {
            r = await this.fetch(base + "/v1/import", { method: "POST", headers: { "content-type": "application/json", "x-mla-token": c.token }, body: JSON.stringify(body) });
        }
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (r.status === 401) throw new Error("token");
        if (!r.ok || !j.ok) { const err = new Error(j.error || ("http " + r.status)); err.app = true; throw err; }
        return j;
    }
    enqueue(body) {
        const q = (BdApi.Data.load("MajesticLogImport", QKEY) || []).filter(x => Date.now() - x.at < MAX_AGE && x.body.url !== body.url);
        q.push({ at: Date.now(), body }); BdApi.Data.save("MajesticLogImport", QKEY, q);
    }

    async send(channelId, messageId, url, name, btn) {
        const body = Object.assign({ url, name }, this.player(channelId, messageId));
        if (btn) { btn.disabled = true; btn.textContent = "Отправляю…"; }
        try {
            const j = await this.post(body);
            if (btn) btn.textContent = j.dup ? "✓ Уже в анализаторе" : "✓ В анализаторе";
            this.toast((j.dup ? "Уже в анализаторе: " : "Отправлено в анализатор: ") + name, "success");
        } catch (e) {
            if (String(e.message) === "token") { if (btn) { btn.disabled = false; btn.textContent = "В анализатор"; } this.toast("Вставьте ключ из «Настроек» Majestic Log Advisor в настройки плагина", "error"); return; }
            if (e.app) { if (btn) { btn.disabled = false; btn.textContent = "В анализатор"; } this.toast("Анализатор не принял файл: " + e.message, "error"); return; }
            this.enqueue(body);
            if (btn) btn.textContent = "⏳ В очереди";
            this.toast("Приложение не отвечает: файл отправится, когда Majestic Log Advisor запустится", "warning");
        }
    }

    async sendAll(channelId, btn) {
        const list = this.attachments(channelId); if (!list.length) return;
        if (btn) { btn.disabled = true; btn.textContent = "Отправляю " + list.length + "…"; }
        let sent = 0, dup = 0, queued = 0, failed = 0;
        for (const a of list) {
            const body = Object.assign({ url: a.url, name: a.name }, this.player(channelId, a.messageId));
            try { const j = await this.post(body); if (j.dup) dup++; else sent++; }
            catch (e) {
                if (String(e.message) === "token") { if (btn) { btn.disabled = false; btn.textContent = "Все файлы тикета (" + list.length + ")"; } this.toast("Вставьте ключ из «Настроек» Majestic Log Advisor в настройки плагина", "error"); return; }
                if (e.app) { failed++; continue; }
                this.enqueue(body); queued++;
            }
        }
        if (btn) btn.textContent = queued ? "⏳ В очереди: " + queued : "✓ Все в анализаторе";
        this.toast("Файлы тикета: отправлено " + sent + (dup ? ", уже были " + dup : "") + (queued ? ", в очереди " + queued + " (приложение не отвечает)" : "") + (failed ? ", не приняты " + failed : ""), queued || failed ? "warning" : "success");
    }

    async flush() {
        const q = (BdApi.Data.load("MajesticLogImport", QKEY) || []).filter(x => Date.now() - x.at < MAX_AGE);
        if (!q.length) return;
        let i = 0;
        for (; i < q.length; i++) { try { await this.post(q[i].body); } catch (e) { break; } }
        BdApi.Data.save("MajesticLogImport", QKEY, q.slice(i));
        if (i) this.toast("Файлы из очереди отправлены в анализатор: " + i, "success");
    }

    /* Обновление: скачать файл из репозитория, проверить, что это этот плагин и он новее, и записать поверх. BetterDiscord перезапустит плагин сам. */
    async checkUpdate() {
        try {
            const r = await this.fetch(UPDATE_URL + "?t=" + Date.now()); if (!r.ok) return;
            const src = await r.text(), v = (/@version\s+([\d.]+)/.exec(src) || [])[1];
            const cur = this.meta.version || VERSION;
            if (!v || cmpVer(v, cur) <= 0 || src.length < 5000 || !/@name\s+MajesticLogImport\b/.test(src) || !/module\.exports\s*=\s*class\s+MajesticLogImport/.test(src) || !/module\.exports\.extractPlayer = extractPlayer;\s*$/.test(src)) return;
            if (BdApi.Data.load("MajesticLogImport", "updated") === v) return;
            let wrote = false;
            try {
                const fs = require("fs"), path = require("path"), dir = (BdApi.Plugins && BdApi.Plugins.folder) || "";
                const file = path.join(dir, (this.meta.filename) || "MajesticLogImport.plugin.js");
                if (dir) { fs.writeFileSync(file, src); wrote = true; }
            } catch (e) {}
            BdApi.Data.save("MajesticLogImport", "updated", v);
            this.toast(wrote ? "MajesticLogImport обновлён до " + v : "Вышел MajesticLogImport " + v + ": обновите плагин через Majestic Plugin Installer", wrote ? "success" : "info");
        } catch (e) {}
    }

    getSettingsPanel() {
        const c = this.cfg(), el = document.createElement("div");
        el.style.cssText = "display:grid;gap:10px;color:var(--text-normal, #dbdee1);padding:4px 0";
        const inp = "width:100%;box-sizing:border-box;padding:9px 10px;border-radius:6px;border:1px solid var(--input-border, rgba(255,255,255,.18));background:var(--input-background, rgba(0,0,0,.28));color:var(--text-normal, #dbdee1);font-size:14px;outline:none";
        el.innerHTML = '<div>Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord» → «Скопировать ключ»):</div><input type="text" class="mla-key" placeholder="Вставьте ключ сюда (Ctrl+V)" spellcheck="false" style="' + inp + '"><div>Порт (обычно 47615):</div><input type="number" class="mla-port" style="' + inp + ';width:140px"><button class="mla-btn mla-test" type="button" style="justify-self:start;margin:0">Проверить связь с анализатором</button>';
        const k = el.querySelector(".mla-key"), p = el.querySelector(".mla-port");
        k.value = c.token; p.value = c.port;
        const save = () => this.setCfg({ token: k.value.trim(), port: parseInt(p.value, 10) || 47615 });
        ["input", "change"].forEach((ev) => { k.addEventListener(ev, save); p.addEventListener(ev, save); });
        el.querySelector(".mla-test").addEventListener("click", async () => {
            save();
            const base = "http://127.0.0.1:" + (parseInt(p.value, 10) || 47615);
            try { const r = await this.fetch(base + "/v1/ping"); const j = await r.json(); if (!j.ok) return this.toast("Анализатор не ответил", "error"); }
            catch (e) { return this.toast("Анализатор не запущен или порт неверный", "error"); }
            if (!k.value.trim()) return this.toast("Связь есть, но ключ не вставлен: «Настройки» приложения → «Плагин Discord»", "warning");
            try { const r = await this.fetch(base + "/v1/import", { method: "POST", headers: { "content-type": "application/json", "x-mla-token": k.value.trim() }, body: "{}" }); this.toast(r.status === 401 ? "Ключ не подходит: скопируйте его заново в «Настройках» приложения" : "Связь с анализатором есть, ключ подходит", r.status === 401 ? "error" : "success"); }
            catch (e) { this.toast("Анализатор не отвечает", "error"); }
        });
        return el;
    }
};
module.exports.extractPlayer = extractPlayer;

/**
 * @name MajesticLogImport
 * @version 1.0.0
 * @description Кнопка «В анализатор» на логах и дампах в ваших тикетах: файл и данные игрока уходят в Majestic Log Advisor.
 * @author persephonemajestic
 * @source https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/betterdiscord
 * @updateUrl https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/betterdiscord/MajesticLogImport.plugin.js
 */
/* Кнопка появляется только у вложений .log, .txt, .zip, .dmp, .evtx в ветках, где вы участник.
   Файл забирает само приложение (оно слушает только ваш компьютер, 127.0.0.1) по ключу из «Настроек» приложения.
   Если приложение закрыто, отправка встаёт в очередь и уйдёт, когда приложение запустится. */
const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "queue", MAX_AGE = 20 * 3600 * 1000;

module.exports = class MajesticLogImport {
    constructor(meta) { this.meta = meta; this.obs = null; this.timer = 0; }

    cfg() { return Object.assign({ token: "", port: 47615 }, BdApi.Data.load("MajesticLogImport", "settings") || {}); }
    setCfg(c) { BdApi.Data.save("MajesticLogImport", "settings", c); }
    store(n) { return BdApi.Webpack.getStore(n); }
    toast(t, type) { try { BdApi.UI.showToast(t, { type: type || "info" }); } catch (e) {} }

    start() {
        this.obs = new MutationObserver(() => { clearTimeout(this.scanT); this.scanT = setTimeout(() => this.scan(), 150); });
        this.obs.observe(document.body, { childList: true, subtree: true });
        this.scan();
        this.timer = setInterval(() => this.flush(), 20000);
        BdApi.DOM.addStyle("MajesticLogImport", ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}");
    }
    stop() {
        if (this.obs) this.obs.disconnect(); this.obs = null; clearInterval(this.timer);
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

    scan() {
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
            b.className = "mla-btn"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor";
            b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.send(m[1], m[2], a.href, name, b); });
            a.insertAdjacentElement("afterend", b);
        }
    }

    player(channelId, messageId) {
        const ch = this.store("ChannelStore")?.getChannel(channelId), ms = this.store("MessageStore");
        const msg = ms?.getMessage(channelId, messageId), au = msg?.author || {};
        const p = { id: au.id || "", name: au.globalName || au.global_name || au.username || "", username: au.username || "", nick: "", static: "", server: "",
            link: "https://discord.com/channels/" + (ch?.guild_id || "@me") + "/" + channelId + "/" + messageId };
        let list = []; try { const all = ms?.getMessages(channelId); list = all?.toArray ? all.toArray() : (all?._array || []); } catch (e) {}
        const texts = list.filter(x => x?.author?.id === au.id).map(x => String(x.content || ""));
        if (msg?.content) texts.push(String(msg.content));
        for (const t of texts) {
            const n = /(?:ник(?:нейм)?|nick(?:name)?|имя\s+(?:в\s+игре|персонажа))\s*[:\-—]?\s*([A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24})/i.exec(t) || /\b([A-Z][a-z]{1,15}_[A-Z][a-z]{1,20})\b/.exec(t);
            if (n && !p.nick) p.nick = n[1];
            const s = /(?:статик|static|стат\.?|id\s+персонажа)\s*[:\-—№#]?\s*(\d{1,7})\b/i.exec(t); if (s && !p.static) p.static = s[1];
            const v = /(?:сервер|server)\s*[:\-—]?\s*([A-Za-zА-Яа-я0-9-]{2,20})/i.exec(t); if (v && !p.server) p.server = v[1];
        }
        return { ticket: ch?.name || "", ticketId: channelId, player: p };
    }

    async post(body) {
        const c = this.cfg();
        if (!c.token) throw new Error("token");
        const opts = { method: "POST", headers: { "content-type": "application/json", "x-mla-token": c.token }, body: JSON.stringify(body) };
        const f = BdApi.Net?.fetch || fetch;
        const r = await f("http://127.0.0.1:" + (c.port || 47615) + "/v1/import", opts);
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (r.status === 401) throw new Error("token");
        if (!r.ok || !j.ok) throw new Error(j.error || ("http " + r.status));
        return j;
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
            const q = (BdApi.Data.load("MajesticLogImport", QKEY) || []).filter(x => Date.now() - x.at < MAX_AGE && x.body.url !== url);
            q.push({ at: Date.now(), body }); BdApi.Data.save("MajesticLogImport", QKEY, q);
            if (btn) btn.textContent = "⏳ В очереди";
            this.toast("Приложение не отвечает: файл отправится, когда Majestic Log Advisor запустится", "warning");
        }
    }

    async flush() {
        const q = (BdApi.Data.load("MajesticLogImport", QKEY) || []).filter(x => Date.now() - x.at < MAX_AGE);
        if (!q.length) return;
        let i = 0;
        for (; i < q.length; i++) { try { await this.post(q[i].body); } catch (e) { break; } }
        BdApi.Data.save("MajesticLogImport", QKEY, q.slice(i));
        if (i) this.toast("Файлы из очереди отправлены в анализатор: " + i, "success");
    }

    getSettingsPanel() {
        const c = this.cfg(), el = document.createElement("div");
        el.style.cssText = "display:grid;gap:10px;color:var(--text-normal);padding:4px 0";
        el.innerHTML = '<div>Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord»):</div><input type="text" class="mla-key" style="padding:8px;border-radius:4px;border:1px solid var(--background-modifier-accent);background:var(--input-background);color:var(--text-normal)"><div>Порт (обычно 47615):</div><input type="number" class="mla-port" style="padding:8px;width:120px;border-radius:4px;border:1px solid var(--background-modifier-accent);background:var(--input-background);color:var(--text-normal)"><button class="mla-btn mla-test" type="button" style="justify-self:start;margin:0">Проверить связь</button>';
        const k = el.querySelector(".mla-key"), p = el.querySelector(".mla-port");
        k.value = c.token; p.value = c.port;
        const save = () => this.setCfg({ token: k.value.trim(), port: parseInt(p.value, 10) || 47615 });
        k.addEventListener("change", save); p.addEventListener("change", save);
        el.querySelector(".mla-test").addEventListener("click", async () => {
            save();
            try { const f = BdApi.Net?.fetch || fetch; const r = await f("http://127.0.0.1:" + (parseInt(p.value, 10) || 47615) + "/v1/ping"); const j = await r.json(); this.toast(j.ok ? "Связь с анализатором есть" : "Анализатор не ответил", j.ok ? "success" : "error"); }
            catch (e) { this.toast("Анализатор не запущен или порт неверный", "error"); }
        });
        return el;
    }
};

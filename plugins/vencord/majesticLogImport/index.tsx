/*
 * MajesticLogImport — кнопка «В анализатор» на логах и дампах в ваших тикетах.
 * Файл и данные игрока уходят в Majestic Log Advisor на этом компьютере.
 * https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/vencord
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Button, ChannelStore, JoinedThreadsStore, MessageStore, React, showToast } from "@webpack/common";

import { cmpVer, extractPlayer } from "./extract";

const Native = VencordNative.pluginHelpers.MajesticLogImport as PluginNative<typeof import("./native")>;

const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "MajesticLogImport.queue", MAX_AGE = 20 * 3600 * 1000, VERSION = "1.2.1";

const settings = definePluginSettings({
    token: { type: OptionType.STRING, description: "Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord»)", default: "" },
    port: { type: OptionType.NUMBER, description: "Порт приложения (обычно 47615)", default: 47615 },
    check: { type: OptionType.COMPONENT, description: "Проверить связь с Majestic Log Advisor и ключ", component: () => React.createElement(Button, { onClick: () => checkLink(), size: Button.Sizes?.SMALL }, "Проверить связь с анализатором") }
});

/* Проверка связи: запущено ли приложение на этом компьютере и подходит ли ключ */
async function checkLink() {
    const port = Number(settings.store.port) || 47615, token = settings.store.token || "";
    if (!(await Native.ping(port))) return showToast("Анализатор не отвечает: запустите Majestic Log Advisor (порт " + port + ")", "failure");
    if (!token) return showToast("Связь есть, но ключ не вставлен: «Настройки» приложения → «Плагин Discord» → «Скопировать ключ»", "message");
    const r = await Native.checkToken(port, token);
    showToast(r === "ok" ? "Связь с анализатором есть, ключ подходит" : r === "token" ? "Ключ не подходит: скопируйте его заново в «Настройках» приложения" : "Анализатор не отвечает", r === "ok" ? "success" : "failure");
}

type Body = { url: string; name: string; ticket: string; ticketId: string; player: Record<string, string>; };

function joined(channelId: string) {
    const ch: any = ChannelStore.getChannel(channelId);
    if (!ch || !(typeof ch.isThread === "function" ? ch.isThread() : ch.type === 11 || ch.type === 12)) return false;
    return !!JoinedThreadsStore?.hasJoined(channelId);
}

function messagesOf(channelId: string): any[] {
    try { const all: any = MessageStore.getMessages(channelId); return all?.toArray ? all.toArray() : (all?._array ?? []); } catch { return []; }
}

/* все логи и дампы из загруженных сообщений ветки */
/* игрок ветки: автор первого сообщения не от бота (обычно тот, кто открыл тикет); файлы саппортов не берём */
function playerIdOf(channelId: string) { const m = messagesOf(channelId).find(x => x?.author && !x.author.bot); return m ? String(m.author.id) : ""; }
function attachmentsOf(channelId: string) {
    const out: { messageId: string; url: string; name: string; }[] = [], seen: Record<string, 1> = {}, pid = playerIdOf(channelId);
    for (const m of messagesOf(channelId)) for (const a of (pid && m?.author?.id !== pid ? [] : m?.attachments ?? [])) {
        const name = a.filename ?? a.name ?? "", url = a.url ?? "";
        if (!FILE_RE.test(name) || !/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//.test(url) || seen[url]) continue;
        seen[url] = 1; out.push({ messageId: m.id, url, name });
    }
    return out;
}

function playerOf(channelId: string, messageId: string) {
    const ch: any = ChannelStore.getChannel(channelId);
    const msg: any = MessageStore.getMessage(channelId, messageId), au: any = msg?.author ?? {};
    const base: Record<string, string> = {
        id: au.id ?? "", name: au.globalName ?? au.global_name ?? au.username ?? "", username: au.username ?? "",
        link: `https://discord.com/channels/${ch?.guild_id ?? "@me"}/${channelId}/${messageId}`
    };
    const list = messagesOf(channelId);
    /* текст пишет сам игрок; формы тикета присылает бот — их поля тоже берём, сообщения саппортов — нет */
    const texts = list.filter(x => x?.author?.id === au.id).map(x => String(x.content ?? ""));
    if (msg?.content) texts.push(String(msg.content));
    const fields: { name: string; value: string; }[] = [], bot: string[] = [];
    for (const x of list) if (x?.author?.id === au.id || x?.author?.bot) for (const em of x.embeds ?? []) {
        for (const f of em.fields ?? []) fields.push({ name: f.name ?? f.rawName ?? "", value: f.value ?? f.rawValue ?? "" });
        if (x?.author?.bot) bot.push(String(em.description ?? em.rawDescription ?? ""));
    }
    return { ticket: ch?.name ?? "", ticketId: channelId, player: { ...base, ...extractPlayer(texts, fields, bot) } };
}

function loadQ(): { at: number; body: Body; }[] { try { return (JSON.parse(localStorage.getItem(QKEY) ?? "[]") as any[]).filter(x => Date.now() - x.at < MAX_AGE); } catch { return []; } }
function saveQ(q: any[]) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { } }

async function post(body: Body) {
    const { token, port } = settings.store;
    if (!token) return { ok: false, error: "token", status: 401, dup: false };
    return Native.sendFile(Number(port) || 47615, token, body);
}

function enqueue(body: Body) { saveQ(loadQ().filter(x => x.body.url !== body.url).concat([{ at: Date.now(), body }])); }

async function send(channelId: string, messageId: string, url: string, name: string, btn: HTMLButtonElement) {
    const body: Body = { url, name, ...playerOf(channelId, messageId) };
    btn.disabled = true; btn.textContent = "Отправляю…";
    const r = await post(body);
    if (r.ok) { btn.textContent = r.dup ? "✓ Уже в анализаторе" : "✓ В анализаторе"; showToast((r.dup ? "Уже в анализаторе: " : "Отправлено в анализатор: ") + name, "success"); return; }
    if (r.status === 401 || r.error === "token") { btn.disabled = false; btn.textContent = "В анализатор"; showToast("Вставьте ключ из «Настроек» Majestic Log Advisor в настройки плагина", "failure"); return; }
    if (r.status === 0) {
        enqueue(body);
        btn.textContent = "⏳ В очереди";
        showToast("Приложение не отвечает: файл отправится, когда Majestic Log Advisor запустится", "message");
        return;
    }
    btn.disabled = false; btn.textContent = "В анализатор";
    showToast("Анализатор не принял файл: " + (r.error || r.status), "failure");
}

async function sendAll(channelId: string, btn: HTMLButtonElement) {
    const list = attachmentsOf(channelId); if (!list.length) return;
    btn.disabled = true; btn.textContent = "Отправляю " + list.length + "…";
    let sent = 0, dup = 0, queued = 0, failed = 0;
    for (const a of list) {
        const body: Body = { url: a.url, name: a.name, ...playerOf(channelId, a.messageId) };
        const r = await post(body);
        if (r.ok) { if (r.dup) dup++; else sent++; continue; }
        if (r.status === 401 || r.error === "token") { btn.disabled = false; btn.textContent = "Все файлы тикета (" + list.length + ")"; showToast("Вставьте ключ из «Настроек» Majestic Log Advisor в настройки плагина", "failure"); return; }
        if (r.status === 0) { enqueue(body); queued++; } else failed++;
    }
    btn.textContent = queued ? "⏳ В очереди: " + queued : "✓ Все в анализаторе";
    showToast("Файлы тикета: отправлено " + sent + (dup ? ", уже были " + dup : "") + (queued ? ", в очереди " + queued + " (приложение не отвечает)" : "") + (failed ? ", не приняты " + failed : ""), queued || failed ? "message" : "success");
}

/* Новая версия: Vencord собирается из исходников, поэтому плагин только сообщает, а ставит её Majestic Plugin Installer */
async function checkUpdate() {
    try {
        const v = await Native.latest(); if (!v || cmpVer(v, VERSION) <= 0) return;
        if (localStorage.getItem("MajesticLogImport.told") === v) return;
        localStorage.setItem("MajesticLogImport.told", v);
        showToast("Вышел MajesticLogImport " + v + ": запустите Majestic Plugin Installer, он обновит плагин и не тронет остальные", "message");
    } catch { }
}

async function flush() {
    const q = loadQ(); if (!q.length) return;
    let i = 0;
    for (; i < q.length; i++) { const r = await post(q[i].body); if (!r.ok && r.status === 0) break; }
    saveQ(q.slice(i));
    if (i) showToast("Файлы из очереди отправлены в анализатор: " + i, "success");
}

function scan() {
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/attachments/"]:not([data-mla])'))) {
        a.setAttribute("data-mla", "1");
        let url: URL; try { url = new URL(a.href); } catch { continue; }
        if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(url.hostname)) continue;
        const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        if (!FILE_RE.test(name)) continue;
        const li = a.closest('[id^="chat-messages-"]'); if (!li) continue;
        const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id); if (!m) continue;
        if (!joined(m[1])) continue;
        const b = document.createElement("button");
        b.className = "mla-btn mla-one"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor"; b.dataset.ch = m[1];
        b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); send(m[1], m[2], a.href, name, b); });
        a.insertAdjacentElement("afterend", b);
    }
    /* одна кнопка «Все файлы тикета» — у первого файла ветки на экране */
    const first = document.querySelector<HTMLButtonElement>(".mla-one"), ch = first?.dataset.ch ?? "";
    const n = ch ? attachmentsOf(ch).length : 0, all = document.querySelector<HTMLButtonElement>(".mla-all");
    if (all && (!first || all.previousElementSibling !== first || all.dataset.ch !== ch || n < 2)) all.remove();
    if (first && n >= 2 && !document.querySelector(".mla-all")) {
        const b = document.createElement("button");
        b.className = "mla-btn mla-all"; b.type = "button"; b.dataset.ch = ch; b.textContent = "Все файлы тикета (" + n + ")"; b.title = "Отправить в анализатор все логи и дампы игрока из этой ветки (файлы саппортов не берутся)";
        b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); sendAll(ch, b); });
        first.insertAdjacentElement("afterend", b);
    }
}

let obs: MutationObserver | null = null, timer = 0, scanT = 0, upT = 0, upTimer = 0, style: HTMLStyleElement | null = null;

export default definePlugin({
    name: "MajesticLogImport",
    description: "Кнопка «В анализатор» на логах и дампах в ваших тикетах: файл и данные игрока уходят в Majestic Log Advisor",
    authors: [{ name: "persephonemajestic", id: 1197438268187365488n }],
    settings,
    start() {
        style = document.createElement("style");
        style.textContent = ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}.mla-all{font-weight:600}";
        document.head.appendChild(style);
        obs = new MutationObserver(() => { clearTimeout(scanT); scanT = window.setTimeout(scan, 150); });
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
        timer = window.setInterval(flush, 20000);
        upT = window.setTimeout(checkUpdate, 15000);
        upTimer = window.setInterval(checkUpdate, 6 * 3600 * 1000);
    },
    stop() {
        obs?.disconnect(); obs = null; clearInterval(timer); clearTimeout(upT); clearInterval(upTimer); style?.remove(); style = null;
        document.querySelectorAll(".mla-btn").forEach(b => b.remove());
        document.querySelectorAll("[data-mla]").forEach(a => a.removeAttribute("data-mla"));
    }
});

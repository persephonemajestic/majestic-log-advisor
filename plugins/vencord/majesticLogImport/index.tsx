/*
 * MajesticLogImport — кнопка «В анализатор» на логах и дампах в ваших тикетах.
 * Файл и данные игрока уходят в Majestic Log Advisor на этом компьютере.
 * https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/vencord
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ChannelStore, JoinedThreadsStore, MessageStore, showToast } from "@webpack/common";

const Native = VencordNative.pluginHelpers.MajesticLogImport as PluginNative<typeof import("./native")>;

const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "MajesticLogImport.queue", MAX_AGE = 20 * 3600 * 1000;

const settings = definePluginSettings({
    token: { type: OptionType.STRING, description: "Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord»)", default: "" },
    port: { type: OptionType.NUMBER, description: "Порт приложения (обычно 47615)", default: 47615 }
});

type Body = { url: string; name: string; ticket: string; ticketId: string; player: Record<string, string>; };

function joined(channelId: string) {
    const ch: any = ChannelStore.getChannel(channelId);
    if (!ch || !(typeof ch.isThread === "function" ? ch.isThread() : ch.type === 11 || ch.type === 12)) return false;
    return !!JoinedThreadsStore?.hasJoined(channelId);
}

function playerOf(channelId: string, messageId: string) {
    const ch: any = ChannelStore.getChannel(channelId);
    const msg: any = MessageStore.getMessage(channelId, messageId), au: any = msg?.author ?? {};
    const p: Record<string, string> = {
        id: au.id ?? "", name: au.globalName ?? au.global_name ?? au.username ?? "", username: au.username ?? "", nick: "", static: "", server: "",
        link: `https://discord.com/channels/${ch?.guild_id ?? "@me"}/${channelId}/${messageId}`
    };
    let list: any[] = [];
    try { const all: any = MessageStore.getMessages(channelId); list = all?.toArray ? all.toArray() : (all?._array ?? []); } catch { }
    const texts = list.filter(x => x?.author?.id === au.id).map(x => String(x.content ?? ""));
    if (msg?.content) texts.push(String(msg.content));
    for (const t of texts) {
        const n = /(?:ник(?:нейм)?|nick(?:name)?|имя\s+(?:в\s+игре|персонажа))\s*[:\-—]?\s*([A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24})/i.exec(t) ?? /\b([A-Z][a-z]{1,15}_[A-Z][a-z]{1,20})\b/.exec(t);
        if (n && !p.nick) p.nick = n[1];
        const s = /(?:статик|static|стат\.?|id\s+персонажа)\s*[:\-—№#]?\s*(\d{1,7})\b/i.exec(t); if (s && !p.static) p.static = s[1];
        const v = /(?:сервер|server)\s*[:\-—]?\s*([A-Za-zА-Яа-я0-9-]{2,20})/i.exec(t); if (v && !p.server) p.server = v[1];
    }
    return { ticket: ch?.name ?? "", ticketId: channelId, player: p };
}

function loadQ(): { at: number; body: Body; }[] { try { return (JSON.parse(localStorage.getItem(QKEY) ?? "[]") as any[]).filter(x => Date.now() - x.at < MAX_AGE); } catch { return []; } }
function saveQ(q: any[]) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { } }

async function post(body: Body) {
    const { token, port } = settings.store;
    if (!token) return { ok: false, error: "token", status: 401, dup: false };
    return Native.send(Number(port) || 47615, token, body);
}

async function send(channelId: string, messageId: string, url: string, name: string, btn: HTMLButtonElement) {
    const body: Body = { url, name, ...playerOf(channelId, messageId) };
    btn.disabled = true; btn.textContent = "Отправляю…";
    const r = await post(body);
    if (r.ok) { btn.textContent = r.dup ? "✓ Уже в анализаторе" : "✓ В анализаторе"; showToast((r.dup ? "Уже в анализаторе: " : "Отправлено в анализатор: ") + name, "success"); return; }
    if (r.status === 401 || r.error === "token") { btn.disabled = false; btn.textContent = "В анализатор"; showToast("Вставьте ключ из «Настроек» Majestic Log Advisor в настройки плагина", "failure"); return; }
    if (r.status === 0) {
        saveQ(loadQ().filter(x => x.body.url !== url).concat([{ at: Date.now(), body }]));
        btn.textContent = "⏳ В очереди";
        showToast("Приложение не отвечает: файл отправится, когда Majestic Log Advisor запустится", "message");
        return;
    }
    btn.disabled = false; btn.textContent = "В анализатор";
    showToast("Анализатор не принял файл: " + (r.error || r.status), "failure");
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
        b.className = "mla-btn"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor";
        b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); send(m[1], m[2], a.href, name, b); });
        a.insertAdjacentElement("afterend", b);
    }
}

let obs: MutationObserver | null = null, timer = 0, scanT = 0, style: HTMLStyleElement | null = null;

export default definePlugin({
    name: "MajesticLogImport",
    description: "Кнопка «В анализатор» на логах и дампах в ваших тикетах: файл и данные игрока уходят в Majestic Log Advisor",
    authors: [{ name: "persephonemajestic", id: 0n }],
    settings,
    start() {
        style = document.createElement("style");
        style.textContent = ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}";
        document.head.appendChild(style);
        obs = new MutationObserver(() => { clearTimeout(scanT); scanT = window.setTimeout(scan, 150); });
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
        timer = window.setInterval(flush, 20000);
    },
    stop() {
        obs?.disconnect(); obs = null; clearInterval(timer); style?.remove(); style = null;
        document.querySelectorAll(".mla-btn").forEach(b => b.remove());
        document.querySelectorAll("[data-mla]").forEach(a => a.removeAttribute("data-mla"));
    }
});

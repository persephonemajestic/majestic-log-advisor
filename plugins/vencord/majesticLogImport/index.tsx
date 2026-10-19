/*
 * MajesticLogImport — «Разбор» логов и скриншотов прямо в тикете и кнопка «В анализатор» на логах и дампах.
 * Файл и данные игрока уходят в Majestic Log Advisor на этом компьютере. Ctrl+Shift+L — разбор последнего лога тикета.
 * https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/vencord
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { Button, ChannelStore, JoinedThreadsStore, MessageStore, React, SelectedChannelStore, showToast as vcShowToast, UserStore } from "@webpack/common";

import { cmpVer, extractPlayer } from "./extract";
import { makeQuickUI, MLA_HOTKEY, MLA_QCSS, quickErr } from "./quickui";

/* Vencord (октябрь 2026): showToast принимает объект { text, variant }; тип «message/success/failure» переводим в variant */
function showToast(text: string, kind: string = "message") { try { (vcShowToast as any)({ text, variant: kind === "success" ? "success" : kind === "failure" ? "critical" : "default" }); } catch { } }

const Native = VencordNative.pluginHelpers.MajesticLogImport as PluginNative<typeof import("./native")>;

const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "MajesticLogImport.queue", MAX_AGE = 20 * 3600 * 1000, VERSION = "1.7.9";
const LOG_RE = /\.(log|txt|zip)$/i, IMG_RE = /\.(png|jpe?g|webp)$/i, CDN_RE = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//;

const settings = definePluginSettings({
    token: { type: OptionType.STRING, description: "Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord»)", default: "" },
    port: { type: OptionType.NUMBER, description: "Порт приложения (обычно 47615)", default: 47615 },
    check: { type: OptionType.COMPONENT, description: "Проверить связь с Majestic Log Advisor и ключ", component: () => React.createElement(Button, { onClick: () => checkLink(), size: Button.Sizes?.SMALL }, "Проверить связь с анализатором") },
    badges: { type: OptionType.BOOLEAN, description: "Значки на логах в тикетах: плагин сам разбирает логи игрока в открытой ветке и подписывает итог рядом с файлом («МОД», «Сеть игрока», «Успех», «старый»…). Нужен запущенный анализатор.", default: true },
    hotkey: { type: OptionType.COMPONENT, description: "Горячая клавиша " + MLA_HOTKEY + ": в открытой ветке тикета — разбор последнего лога игрока (если логов нет — скриншота, если нет и его — подбор шаблона по тексту игрока)", component: () => React.createElement(Button, { onClick: () => hotkey(), size: Button.Sizes?.SMALL }, "Попробовать " + MLA_HOTKEY) }
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
/* игрок ветки: автор первого сообщения не от бота и не вы сами (тикет мог открыть бот, а вы — написать первым) */
function playerIdOf(channelId: string) { let me = ""; try { me = String(UserStore?.getCurrentUser()?.id ?? ""); } catch { } const m = messagesOf(channelId).find(x => x?.author && !x.author.bot && String(x.author.id) !== me); return m ? String(m.author.id) : ""; }
function attachmentsOf(channelId: string, re: RegExp = FILE_RE) {
    const out: { messageId: string; url: string; name: string; size: number; }[] = [], seen: Record<string, 1> = {}, pid = playerIdOf(channelId);
    for (const m of messagesOf(channelId)) for (const a of (pid && m?.author?.id !== pid ? [] : m?.attachments ?? [])) {
        const name = a.filename ?? a.name ?? "", url = a.url ?? "";
        if (!re.test(name) || !CDN_RE.test(url) || seen[url]) continue;
        seen[url] = 1; out.push({ messageId: m.id, url, name, size: a.size ?? 0 });
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

async function send(channelId: string, messageId: string, url: string, name: string, btn0: HTMLButtonElement | null) {
    if (!CDN_RE.test(url)) return showToast("В анализатор отправляются только файлы из тикета (логи, архивы, дампы)", "message");
    const body: Body = { url, name, ...playerOf(channelId, messageId) };
    const btn = btn0 ?? document.createElement("button");
    btn.disabled = true; btn.textContent = "Отправляю…";
    const r = await post(body);
    if (r.ok) { btn.textContent = r.dup ? "✓ Уже в анализаторе" : "✓ В анализаторе"; btn.disabled = false; btn.title = "Нажмите ещё раз, чтобы открыть файл в анализаторе снова"; showToast((r.dup ? "Уже в анализаторе: " : "Отправлено в анализатор: ") + name, "success"); return; }
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
    btn.textContent = queued ? "⏳ В очереди: " + queued : "✓ Все в анализаторе"; btn.disabled = false;
    showToast("Файлы тикета: отправлено " + sent + (dup ? ", уже были " + dup : "") + (queued ? ", в очереди " + queued + " (приложение не отвечает)" : "") + (failed ? ", не приняты " + failed : ""), queued || failed ? "message" : "success");
}

/* ---------- Быстрый разбор: окно поверх Discord, значки на логах, Ctrl+Shift+L ---------- */
function copyText(t: string) { try { (window as any).DiscordNative?.clipboard?.copy(t); return; } catch { } try { navigator.clipboard.writeText(t); } catch { } }
const ui = makeQuickUI({ insert: (t: string) => { try { insertTextIntoChatInputBox(t); return true; } catch { return false; } }, copy: copyText, toast: (t: string, k: string) => showToast(t, k === "error" ? "failure" : k === "info" ? "message" : k) });
const qres = new Map<string, any>();
const keyOf = (u: string) => u.replace(/[?#].*$/, "");
function msgAt(channelId: string, messageId: string) { try { const t: any = (MessageStore.getMessage(channelId, messageId) as any)?.timestamp; return t ? +new Date(t) : 0; } catch { return 0; } }
/* что пишет игрок: его сообщения в ветке и поля формы тикета от бота (сообщения саппортов не берём) */
const STAFF_RE = /саппорт|support|модератор|администратор|админ|staff|принял|сотрудник|агент|хелпер|helper/i;
const TICKET_STAFF = /специалист|взял\S* .*обращени|саппорт|support|модератор|администратор|staff|принял|сотрудник|агент|хелпер|helper|меняет название|закрыл\S* (тикет|обращени)/i;
/* приветствие бота тикетов — не описание проблемы */
const TICKET_WELCOME = /благодарим вас за обращение|специалист поддержки присоединится|при необходимости, дополните|некорректного поведения|агент имеет право|будьте вежливы|^\s*здравствуйте,/i;
const DESC_RE = /описание проблемы/i;
function ticketText(channelId: string, max: number) {
    const pid = playerIdOf(channelId), out: string[] = [];
    for (const m of messagesOf(channelId)) {
        if (m?.author?.id === pid && m.content) out.push(String(m.content));
        /* бот тикетов пишет описание проблемы обычным сообщением; служебные строки («Специалист … взял обращение») пропускаем */
        if (m?.author?.bot && m.content) for (const line of String(m.content).split("\n")) if (line.trim() && !TICKET_STAFF.test(line) && !TICKET_WELCOME.test(line)) out.push(line);
        if (m?.author?.bot || m?.author?.id === pid) for (const em of m.embeds ?? []) { for (const f of em.fields ?? []) if (!STAFF_RE.test(f.name ?? f.rawName ?? "")) out.push((f.name ?? f.rawName ?? "") + ": " + (f.value ?? f.rawValue ?? "")); if (m?.author?.bot && (em.description ?? em.rawDescription)) for (const line of String(em.description ?? em.rawDescription).split("\n")) if (line.trim() && !TICKET_WELCOME.test(line) && !TICKET_STAFF.test(line)) out.push(line); }
    }
    const t = out.join("\n").trim(); return t.length > max ? t.slice(t.length - max) : t;
}
/* mode: badge — значок, full — окно, text — подбор шаблона только по тексту тикета */
/* noai: сначала быстрый ответ без ИИ (окно открывается сразу), ИИ уточняет вторым запросом */
async function quick(channelId: string, messageId: string, url: string, name: string, mode: string, set = "", noai = false) {
    const ck = keyOf(url) + "|" + set + "|" + (noai ? 0 : 1), hit = qres.get(ck); if (hit && (mode === "text" ? Date.now() - hit._at < 60000 : mode === "badge" || hit._mode !== "badge")) return hit;
    const { token, port } = settings.store; if (!token) throw Object.assign(new Error("token"), { status: 401 });
    const ch: any = ChannelStore.getChannel(channelId);
    const meta = { name, url: keyOf(url), ticket: ch?.name ?? "", guild: ch?.guild_id ?? "", set, msgAt: msgAt(channelId, messageId), siblings: attachmentsOf(channelId).map(x => x.name), mode, noai, player: messageId ? playerOf(channelId, messageId).player : null, text: mode === "full" ? ticketText(channelId, 1500) : "" };
    const r: any = await Native.quick(Number(port) || 47615, token, url, meta, mode === "text" ? (url.startsWith("msg:") ? msgText(channelId, messageId) : ticketText(channelId, 4000)) : "");
    if (!r || r.status !== 200 || !r.j?.ok) throw Object.assign(new Error(r?.j?.error || ""), { status: r?.status ?? 0 });
    r.j._mode = mode; r.j._at = Date.now(); if (!r.j.tpl?.aiErr) qres.set(ck, r.j); if (qres.size > 80) qres.delete(qres.keys().next().value as string);
    return r.j;
}
/* отметка «подходит / не подходит» или фраза к шаблону — в приложение, оттуда команде */
async function fb(o: any) { const { token, port } = settings.store; if (!token) return; try { await Native.quick(Number(port) || 47615, token, "", { name: "fb.txt", mode: "fb" }, JSON.stringify(o)); } catch { } }
async function openQuick(channelId: string, messageId: string, url: string, name: string, set = "") {
    const text = /^(ticket|msg):/.test(url);
    ui.loading(url.startsWith("msg:") ? "сообщение" : text ? "тикет" : name);
    try {
        const mode = text ? "text" : "full", ctx: any = { key: url + "|" + set, open: !text && FILE_RE.test(name) ? () => send(channelId, messageId, url, name, null) : null, reload: (s: string) => openQuick(channelId, messageId, url, name, s), fb };
        const r = await quick(channelId, messageId, url, name, mode, set, true); ui.show(r, ctx);
        if (r.tpl?.more) { try { const r2 = await quick(channelId, messageId, url, name, mode, set, false); ui.show(r2, { ...ctx, update: true }); } catch { } finally { ui.settle(ctx.key); } }
    }
    catch (e: any) { ui.error(e.status === -1 ? e.message : quickErr(e.status, e.message)); }
}
/* тикет без файлов: подобрать шаблон команды по тому, что написал игрок */
function textQuick(ch: string) {
    const pid = playerIdOf(ch), first = messagesOf(ch).find(m => m?.author?.id === pid);
    if (!ticketText(ch, 50)) return showToast("Игрок в этом тикете ещё ничего не написал", "message");
    openQuick(ch, first ? String(first.id) : "", "ticket:" + ch, "ticket.txt");
}
function hotkey(chIn?: string) {
    const ch = chIn || SelectedChannelStore.getChannelId();
    if (!ch || !joined(ch)) return showToast("Откройте ветку тикета, в которой вы участник, и нажмите " + MLA_HOTKEY + " ещё раз", "message");
    const a = attachmentsOf(ch, LOG_RE).pop() ?? attachmentsOf(ch, IMG_RE).pop();
    if (!a) return textQuick(ch);
    openQuick(ch, a.messageId, a.url, a.name);
}
/* кнопка «Анализировать» под описанием проблемы */
/* «Анализировать» — под описанием проблемы от бота тикетов; если описания нет — под первым сообщением игрока */
const prefetched: Record<string, 1> = {};
function descId(ch: string) {
    const list = messagesOf(ch), d = list.find(m => m?.author?.bot && DESC_RE.test(String(m.content ?? "") + " " + (m.embeds ?? []).map((e: any) => (e.title ?? "") + " " + (e.description ?? e.rawDescription ?? "") + " " + (e.fields ?? []).map((f: any) => f.name ?? f.rawName ?? "").join(" ")).join(" ")));
    if (d) return String(d.id); const pid = playerIdOf(ch), p = list.find(m => m?.author?.id === pid); return p ? String(p.id) : "";
}
function ticketButton(li: Element, ch: string, mid: string) {
    if (li.querySelector(".mla-tk") || descId(ch) !== mid) return;
    const acc = li.querySelector('[id^="message-accessories-"]') ?? li, b = document.createElement("button");
    b.className = "mla-btn mla-tk"; b.type = "button"; b.textContent = "Анализировать"; b.title = "Разбор обращения: логи и скриншоты игрока, если есть, и готовый шаблон команды по описанию проблемы. " + MLA_HOTKEY + " — то же с клавиатуры";
    b.style.marginLeft = "0"; b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); hotkey(ch); });
    const bar = document.createElement("div"); bar.className = "mla-imgbar mla-tkbar"; bar.appendChild(b); acc.appendChild(bar);
    /* заранее подобрать шаблон без ИИ — окно «Анализировать» откроется мгновенно */
    if (!prefetched[ch] && !attachmentsOf(ch, LOG_RE).length && settings.store.token && Date.now() > downUntil) { prefetched[ch] = 1; quick(ch, mid, "ticket:" + ch, "ticket.txt", "text", "", true).catch(() => { }); }
}
/* текст одного сообщения: сам текст, заголовки, описание и поля встроенных блоков */
function msgText(ch: string, mid: string) {
    let m: any = null; try { m = MessageStore.getMessage(ch, mid); } catch { }
    if (!m) return ""; const out: string[] = [String(m.content ?? "")];
    for (const em of m.embeds ?? []) { out.push(em.title ?? em.rawTitle ?? "", em.description ?? em.rawDescription ?? ""); for (const f of em.fields ?? []) out.push((f.name ?? f.rawName ?? "") + ": " + (f.value ?? f.rawValue ?? "")); }
    return out.filter(x => x && x.trim()).join("\n").trim().slice(0, 4000);
}
/* «Анализировать» у любого сообщения в любом канале: одна плавающая кнопка поверх сообщения под курсором.
   В сами сообщения ничего не вставляется — высота сообщений не меняется, лента при прокрутке не прыгает. */
let hb: HTMLButtonElement | null = null, hbLi: Element | null = null, hbAt: string[] | null = null;
const hbOk = new Map<string, boolean>();
function hbHide() { if (hb) hb.style.display = "none"; hbLi = null; }
function hbEligible(ch: string, mid: string) {
    const k = ch + ":" + mid; if (hbOk.has(k)) return hbOk.get(k)!;
    let ok = false; try { const me = String(UserStore?.getCurrentUser()?.id ?? ""), m: any = MessageStore.getMessage(ch, mid); ok = !!m && !(me && String(m.author?.id) === me) && msgText(ch, mid).length >= 4; } catch { }
    if (hbOk.size > 500) hbOk.clear(); hbOk.set(k, ok); return ok;
}
const onOver = (e: MouseEvent) => {
    const t = e.target as HTMLElement; if (!hb || t === hb) return; const li = t.closest?.('[id^="chat-messages-"]');
    if (!li) return hbHide(); const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id); if (!m || (hbLi === li && hb.style.display === "block")) return;
    if (!hbEligible(m[1], m[2])) return hbHide();
    const r = li.getBoundingClientRect(); hbLi = li; hbAt = [m[1], m[2]];
    hb.style.display = "block"; hb.style.top = Math.max(0, r.bottom - 26) + "px"; hb.style.left = Math.max(0, r.right - hb.offsetWidth - 16) + "px";
};
const onScroll = () => hbHide();
function hoverStart() {
    hb = document.createElement("button"); hb.className = "mla-btn mla-hb"; hb.type = "button"; hb.textContent = "Анализировать"; hb.title = "Подобрать ответ по тексту этого сообщения";
    hb.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); const t = hbAt; hbHide(); if (t) openQuick(t[0], t[1], "msg:" + t[0] + ":" + t[1], "message.txt"); });
    document.body.appendChild(hb);
    document.addEventListener("mouseover", onOver, { passive: true }); document.addEventListener("scroll", onScroll, { capture: true, passive: true });
}
function hoverStop() { document.removeEventListener("mouseover", onOver); document.removeEventListener("scroll", onScroll, true); hb?.remove(); hb = null; }
const onKey = (e: KeyboardEvent) => { if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyL") { e.preventDefault(); e.stopPropagation(); hotkey(); } };
let bq: any[] = [], bBusy = false, downUntil = 0;
function putBadge(anchor: HTMLElement, r: any, channelId: string, messageId: string, url: string, name: string) {
    if (!anchor.isConnected || anchor.nextElementSibling?.classList.contains("mla-badge")) return;
    anchor.insertAdjacentElement("afterend", ui.badge(r, () => ui.show(r, { open: () => send(channelId, messageId, url, name, null) })));
}
function queueBadge(channelId: string, messageId: string, url: string, name: string, anchor: HTMLElement) {
    const done = qres.get(keyOf(url)); if (done) return putBadge(anchor, done, channelId, messageId, url, name);
    const att = attachmentsOf(channelId, LOG_RE).find(x => keyOf(x.url) === keyOf(url));
    if (!att || att.size > 40 * 1048576 || Date.now() < downUntil) return;
    bq.push({ channelId, messageId, url, name, anchor }); pumpBadges();
}
async function pumpBadges() {
    if (bBusy) return; bBusy = true;
    try {
        while (bq.length) {
            const it = bq.shift(); if (!it.anchor.isConnected) continue;
            try { putBadge(it.anchor, await quick(it.channelId, it.messageId, it.url, it.name, "badge"), it.channelId, it.messageId, it.url, it.name); }
            catch (e: any) { if ([0, 401, 404, 501].includes(e.status)) { downUntil = Date.now() + 60000; bq = []; } }
        }
    } finally { bBusy = false; }
}
function imgButton(li: Element, channelId: string, messageId: string, url: string, name: string) {
    const acc = li.querySelector('[id^="message-accessories-"]') ?? li, key = keyOf(url); let bar = li.querySelector<HTMLElement>(".mla-imgbar:not(.mla-mbar)");
    if (bar && Array.from(bar.children).some((x: any) => x.dataset.u === key)) return;
    if (!bar) { bar = document.createElement("div"); bar.className = "mla-imgbar"; acc.appendChild(bar); }
    const b = document.createElement("button"); b.className = "mla-btn"; b.type = "button"; b.dataset.u = key;
    b.textContent = "Разбор скриншота" + (bar.children.length ? " " + (bar.children.length + 1) : ""); b.title = "Распознать ошибку на скриншоте (текст читает ИИ; чёрные полосы ищутся на этом компьютере) и предложить ответ игроку";
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openQuick(channelId, messageId, url, name); });
    bar.appendChild(b);
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
        if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(url.hostname) || !/^\/attachments\//.test(url.pathname)) continue;
        const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const li = a.closest('[id^="chat-messages-"]'); if (!li) continue;
        const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id); if (!m) continue;
        if (IMG_RE.test(name)) { if (joined(m[1])) imgButton(li, m[1], m[2], a.href, name); continue; }
        if (!FILE_RE.test(name)) continue;
        if (!joined(m[1])) continue;
        if (LOG_RE.test(name)) {
            const q = document.createElement("button");
            q.className = "mla-btn mla-q"; q.type = "button"; q.textContent = "Разбор"; q.title = "Причина, как чинить и готовый ответ игроку — в окне поверх Discord. " + MLA_HOTKEY + " — разбор последнего лога тикета";
            q.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openQuick(m[1], m[2], a.href, name); });
            a.insertAdjacentElement("afterend", q);
            if (settings.store.badges !== false) queueBadge(m[1], m[2], a.href, name, a);
        }
        const b = document.createElement("button");
        b.className = "mla-btn mla-one"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor"; b.dataset.ch = m[1];
        b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); send(m[1], m[2], a.href, name, b); });
        (a.nextElementSibling?.classList.contains("mla-q") ? a.nextElementSibling : a).insertAdjacentElement("afterend", b);
    }
    for (const li of Array.from(document.querySelectorAll('[id^="chat-messages-"]:not([data-mlat])'))) {
        li.setAttribute("data-mlat", "1"); const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id);
        if (!m) continue;
        if (joined(m[1])) ticketButton(li, m[1], m[2]);
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
    description: "«Разбор» логов и скриншотов в тикете: причина, как чинить и готовый ответ игроку. «В анализатор» отправляет файл в Majestic Log Advisor. Ctrl+Shift+L — разбор последнего лога тикета",
    authors: [{ name: "persephonemajestic", id: 1197438268187365488n }],
    settings,
    start() {
        style = document.createElement("style");
        style.textContent = MLA_QCSS + ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}.mla-all{font-weight:600}.mla-hb{position:fixed;z-index:100;margin:0;display:none;background:var(--background-floating,#111214);box-shadow:0 2px 8px rgba(0,0,0,.3)}";
        document.head.appendChild(style);
        obs = new MutationObserver(() => { clearTimeout(scanT); scanT = window.setTimeout(scan, 150); });
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
        timer = window.setInterval(flush, 20000);
        upT = window.setTimeout(checkUpdate, 15000);
        upTimer = window.setInterval(checkUpdate, 6 * 3600 * 1000);
        document.addEventListener("keydown", onKey, true);
        hoverStart();
        if (localStorage.getItem("MajesticLogImport.told150") !== "1") { localStorage.setItem("MajesticLogImport.told150", "1"); setTimeout(() => showToast("MajesticLogImport 1.5: «Разбор» у логов и скриншотов, «Анализировать» под описанием проблемы — готовый шаблон команды по тексту игрока. " + MLA_HOTKEY + " — разбор тикета с клавиатуры.", "message"), 4000); }
    },
    stop() {
        obs?.disconnect(); obs = null; clearInterval(timer); clearTimeout(upT); clearInterval(upTimer); style?.remove(); style = null;
        document.removeEventListener("keydown", onKey, true); hoverStop(); ui.close(); bq = [];
        document.querySelectorAll(".mla-btn, .mla-badge, .mla-imgbar").forEach(b => b.remove());
        document.querySelectorAll("[data-mla]").forEach(a => a.removeAttribute("data-mla"));
        document.querySelectorAll("[data-mlat]").forEach(a => a.removeAttribute("data-mlat"));
    }
});

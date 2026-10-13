/*
 * MajesticLogImport — нативная часть: запрос в Majestic Log Advisor на этом компьютере (127.0.0.1).
 * Выполняется в основном процессе Discord, поэтому ограничения страницы (CSP, CORS) не мешают.
 */

import { IpcMainInvokeEvent } from "electron";

const okPort = (p: number) => Number.isInteger(p) && p >= 1024 && p <= 65535;

export async function send(_: IpcMainInvokeEvent, port: number, token: string, body: unknown) {
    if (!okPort(port)) return { status: 0, ok: false, error: "port" };
    try {
        const r = await fetch(`http://127.0.0.1:${port}/v1/import`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-mla-token": String(token || "") },
            body: JSON.stringify(body)
        });
        let j: any = {};
        try { j = await r.json(); } catch { }
        return { status: r.status, ok: r.ok && !!j.ok, dup: !!j.dup, error: j.error || "" };
    } catch {
        return { status: 0, ok: false, error: "down" };
    }
}

/* Скачать вложение сетью Discord (у приложения может не быть доступа к серверам Discord) и отдать файл приложению.
   Если скачать не вышло — просим приложение скачать само (старый путь /v1/import). */
const CDN = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//;
export async function sendFile(_: IpcMainInvokeEvent, port: number, token: string, body: any) {
    if (!okPort(port)) return { status: 0, ok: false, error: "port" };
    const url = String(body?.url || "");
    let buf: Buffer | null = null, why = "";
    if (CDN.test(url)) {
        try { const r = await fetch(url); if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 250 * 1048576) { buf = null; why = "size"; } } else why = "http " + r.status; } catch (e: any) { why = String(e?.message || e); }
    }
    if (!buf) { const r = await send(_, port, token, body); return why && !r.ok && r.status ? { ...r, error: r.error + " (Discord: " + why + ")" } : r; }
    try {
        const meta = Buffer.from(JSON.stringify(body)).toString("base64");
        const r = await fetch(`http://127.0.0.1:${port}/v1/upload`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-mla-token": String(token || ""), "x-mla-meta": meta }, body: buf });
        let j: any = {}; try { j = await r.json(); } catch { }
        return { status: r.status, ok: r.ok && !!j.ok, dup: !!j.dup, error: j.error || "" };
    } catch {
        return { status: 0, ok: false, error: "down" };
    }
}

export async function ping(_: IpcMainInvokeEvent, port: number) {
    if (!okPort(port)) return false;
    try { const r = await fetch(`http://127.0.0.1:${port}/v1/ping`); const j: any = await r.json(); return !!j.ok; } catch { return false; }
}

/* Последняя версия плагина из списка установщика (только чтение, с GitHub) */
export async function latest(_: IpcMainInvokeEvent) {
    try {
        const r = await fetch("https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/manifest.json?t=" + Date.now());
        const j: any = await r.json();
        const p = (j?.plugins ?? []).find((x: any) => x?.id === "majesticLogImport");
        return typeof p?.version === "string" && /^\d+\.\d+\.\d+$/.test(p.version) ? p.version : "";
    } catch { return ""; }
}

/* Проверка ключа: приложение отвечает 401 на неверный ключ ещё до разбора запроса */
export async function checkToken(_: IpcMainInvokeEvent, port: number, token: string) {
    if (!okPort(port)) return "port";
    try { const r = await fetch(`http://127.0.0.1:${port}/v1/import`, { method: "POST", headers: { "content-type": "application/json", "x-mla-token": String(token || "") }, body: "{}" }); return r.status === 401 ? "token" : "ok"; } catch { return "down"; }
}

/* Быстрый разбор: Discord скачивает вложение (лог, zip или скриншот), приложение разбирает его и отвечает сводкой.
   В список логов приложения файл не попадает. status 0 — приложение не запущено, -1 — Discord не отдал файл. */
export async function quick(_: IpcMainInvokeEvent, port: number, token: string, url: string, meta: any, text?: string) {
    if (!okPort(port)) return { status: 0, j: { ok: false, error: "port" } };
    let buf: Buffer;
    if (meta?.mode === "text" || meta?.mode === "fb") buf = Buffer.from(String(text || " ").slice(0, 8000), "utf8");
    else {
        if (!CDN.test(String(url || ""))) return { status: 400, j: { ok: false, error: "url" } };
        try { const r = await fetch(url); if (!r.ok) return { status: -1, j: { ok: false, error: "Discord не отдал файл (" + r.status + ")" } }; buf = Buffer.from(await r.arrayBuffer()); }
        catch (e: any) { return { status: -1, j: { ok: false, error: "Discord не отдал файл: " + String(e?.message || e) } }; }
    }
    try {
        const r = await fetch(`http://127.0.0.1:${port}/v1/quick`, { method: "POST", headers: { "content-type": "application/octet-stream", "x-mla-token": String(token || ""), "x-mla-meta": Buffer.from(JSON.stringify(meta || {})).toString("base64") }, body: buf });
        let j: any = {}; try { j = await r.json(); } catch { }
        return { status: r.status, j };
    } catch { return { status: 0, j: { ok: false, error: "down" } }; }
}

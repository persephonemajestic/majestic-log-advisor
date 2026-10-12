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

export async function ping(_: IpcMainInvokeEvent, port: number) {
    if (!okPort(port)) return false;
    try { const r = await fetch(`http://127.0.0.1:${port}/v1/ping`); const j: any = await r.json(); return !!j.ok; } catch { return false; }
}

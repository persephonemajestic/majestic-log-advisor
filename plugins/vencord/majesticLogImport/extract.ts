/* Данные игрока из текста тикета: подписанные поля («Ник:», «Статик:», «Сервер:») и ник вида Имя_Фамилия.
   Та же логика, что в версии для BetterDiscord (тест сверяет обе). */
export const STOP = /\s*(?:[,;|/(]|\s-\s|\s—\s|$|\s+(?:ник|nick|статик|static|стат|id|сервер|server|discord|дискорд|проблема|описание)(?=[\s:.,;!?*-]|$))/i;
export function cut(v: any) { v = String(v || "").split(/\n|⏎/)[0]; const m = STOP.exec(v); return (m ? v.slice(0, m.index) : v).replace(/[*_`~]+$/, "").replace(/^[*_`~:\s-]+/, "").trim(); }
export function extractPlayer(texts: string[], fields?: { name?: string; value?: string; }[]) {
    const p = { nick: "", static: "", server: "" };
    for (const f of fields ?? []) {
        const n = String(f.name || "").toLowerCase(), v = String(f.value || "").trim();
        if (!p.nick && /ник|nick|имя/.test(n)) { const x = cut(v); if (/^[A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24}$/.test(x)) p.nick = x; }
        else if (!p.static && /статик|static|паспорт|id\s*персонажа/.test(n)) { const d = /\d{1,7}/.exec(v); if (d) p.static = d[0]; }
        else if (!p.server && /сервер|server/.test(n)) { const x = cut(v); if (x && x.length <= 24) p.server = x; }
    }
    for (const t0 of texts) {
        const t = String(t0 || "");
        if (!p.nick) { const n = /(?:ник(?:нейм)?|nick(?:name)?|имя\s+(?:в\s+игре|персонажа)|игровое\s+имя)[\s:\-—*]*([A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24})(?![A-Za-zА-Яа-яЁё])/i.exec(t) || /\b([A-Z][a-z]{1,15}_[A-Z][a-z]{1,20})\b/.exec(t); if (n) p.nick = n[1]; }
        if (!p.static) { const s = /(?:статик|static(?:\s*id)?|стат\.?|статический\s+(?:id|номер)|id\s+персонажа|паспорт)[\s:\-—№#*]*(\d{1,7})(?!\d)/i.exec(t); if (s) p.static = s[1]; }
        if (!p.server) {
            const v = /(?:сервер|server)(?![A-Za-zА-Яа-яЁё])[\s:\-—№#*]*([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 \-]{0,30})/i.exec(t);
            if (v) { const x = cut(v[1]); if (x && !/^(не|нет|любой|все)(\s|$)/i.test(x)) p.server = x; }
            else { const d = /(?:^|[^\d])(\d{1,2})\s*(?:-?(?:й|ой|ый|м|ом))?\s*сервер/i.exec(t); if (d) p.server = d[1]; }
        }
    }
    return p;
}
export const cmpVer = (a: string, b: string) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

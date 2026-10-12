/* Та же логика, что в версии для BetterDiscord (тест сверяет обе). */
/* Данные игрока из текста: подписанные поля («Ник:», «Статик:», «Сервер:») и ник вида Имя_Фамилия.
   Сначала свои сообщения игрока, потом поля формы тикета, потом текст бота; строки про саппорта пропускаются. */
export const STOP = /\s*(?:[,;|/(]|\s-\s|\s—\s|$|\s+(?:ник|nick|статик|static|стат|id|сервер|server|discord|дискорд|проблема|описание)(?=[\s:.,;!?*-]|$))/i;
const STAFF = /саппорт|support|модератор|администратор|админ|staff|принял|сотрудник|агент|хелпер|helper/i;
const PRE = "(?:^|[^A-Za-zА-Яа-яЁё_])", SEP = "([\\s*]*[:\\-—№#][\\s*]*|\\s+)";
const NICK_RE = new RegExp(PRE + "(?:ник(?:нейм)?|nick(?:name)?|имя\\s+(?:в\\s+игре|персонажа)|игровое\\s+имя)" + SEP + "([A-Za-zА-Яа-яЁё]{2,20}[ _][A-Za-zА-Яа-яЁё]{2,24})(?![A-Za-zА-Яа-яЁё])", "i");
const STATIC_RE = new RegExp(PRE + "(?:статик|static(?:\\s*id)?|стат\\.?|статический\\s+(?:id|номер)|id\\s+персонажа|паспорт)[\\s:\\-—№#*]*(\\d{1,7})(?!\\d)", "i");
const SERVER_RE = new RegExp(PRE + "(?:сервер|server)(?![A-Za-zА-Яа-яЁё])" + SEP + "([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 \\-]{0,30})", "i");
export function cut(v: any) { v = String(v || "").split(/\n|⏎/)[0]; const m = STOP.exec(v); return (m ? v.slice(0, m.index) : v).replace(/[*_`~]+$/, "").replace(/^[*_`~:\s-]+/, "").trim(); }
const punct = (s: string) => /[:\-—№#]/.test(s);
function fromText(p: { nick: string; static: string; server: string; }, t: string, own: boolean) {
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
export function extractPlayer(texts: string[], fields?: { name?: string; value?: string; }[], botTexts?: string[]) {
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
export const cmpVer = (a: string, b: string) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

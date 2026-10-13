// @ts-nocheck
/* MLA-QUICKUI-START — общий код окна «Разбор» для Vencord и BetterDiscord (в BetterDiscord вставляется скриптом plugins/sync-quickui.py) */
/* Окно быстрого разбора поверх Discord: причина, как чинить, предупреждения «тот ли файл», ключевые строки,
   ответ игроку (можно поправить прямо здесь) и кнопки: вставить ответ в чат, передать дальше, открыть в анализаторе. */
export const MLA_HOTKEY = "Ctrl+Shift+L";
export const MLA_QCSS = ".mla-pop{position:fixed;right:18px;top:64px;z-index:1000;width:min(440px,calc(100vw - 36px));max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--background-primary,#313338);color:var(--text-normal,#dbdee1);border:1px solid var(--background-modifier-accent,#4e5058);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.45);font-size:14px;line-height:1.45}" +
    ".mla-pop-h{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--background-modifier-accent,#4e5058)}.mla-pop-h b{flex:1;font-size:15px;line-height:1.35}.mla-pop-x{border:0;background:none;color:var(--interactive-normal,#b5bac1);font-size:20px;line-height:1;cursor:pointer;padding:0 2px}" +
    ".mla-pop-b{overflow:auto;padding:12px 16px;display:grid;gap:12px}.mla-pop-f{padding:10px 16px 12px;border-top:1px solid var(--background-modifier-accent,#4e5058);display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
    ".mla-sec>span{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;color:var(--header-secondary,#b5bac1);margin-bottom:4px}.mla-sec ol{margin:0;padding-left:20px;display:grid;gap:3px}.mla-why{color:var(--text-muted,#949ba4);font-size:13px;margin-top:2px}" +
    ".mla-warn{border-left:3px solid #f0b232;background:rgba(240,178,50,.1);padding:8px 10px;border-radius:6px;display:grid;gap:6px}.mla-warn .mla-b{justify-self:start}" +
    ".mla-lines{font-family:var(--font-code,Consolas,monospace);font-size:12px;background:var(--background-secondary,#2b2d31);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto}" +
    ".mla-ta{box-sizing:border-box;width:100%;min-height:150px;resize:vertical;background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);border:1px solid var(--background-modifier-accent,#4e5058);border-radius:6px;padding:8px;font:inherit;font-size:13px;user-select:text}" +
    ".mla-b{padding:6px 12px;border-radius:5px;border:1px solid var(--background-modifier-accent,#4e5058);background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);font-size:13px;cursor:pointer}.mla-b:hover{filter:brightness(1.15)}.mla-b.p{background:#5865f2;border-color:#5865f2;color:#fff;font-weight:600}" +
    ".mla-hint{flex-basis:100%;font-size:12px;color:var(--text-muted,#949ba4)}.mla-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none;background:#80848e}.mla-dot.bad{background:#f23f43}.mla-dot.warn{background:#f0b232}.mla-dot.ok{background:#23a55a}" +
    ".mla-badge{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600;vertical-align:middle;color:#fff;background:#80848e;cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mla-badge.bad{background:#da373c}.mla-badge.warn{background:#c58a12}.mla-badge.ok{background:#248046}" +
    ".mla-imgbar{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.mla-imgbar .mla-btn{margin-left:0}.mla-src{font-size:12px;color:var(--text-muted,#949ba4)}";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* env: { insert(text): boolean — вставить в поле сообщения; copy(text); toast(text, type); open(): отправить файл в анализатор } */
export function makeQuickUI(env) {
    let box = null;
    const close = () => { if (box) box.remove(); box = null; document.removeEventListener("keydown", onKey, true); };
    const onKey = (e) => { if (e.key === "Escape" && box) { e.stopPropagation(); close(); } };
    const shell = (title, tone) => {
        close();
        box = document.createElement("div"); box.className = "mla-pop"; box.setAttribute("role", "dialog");
        box.innerHTML = '<div class="mla-pop-h"><i class="mla-dot ' + (tone || "") + '"></i><b>' + esc(title) + '</b><button class="mla-pop-x" type="button" title="Закрыть (Esc)">×</button></div><div class="mla-pop-b"></div><div class="mla-pop-f"></div>';
        box.querySelector(".mla-pop-x").addEventListener("click", close);
        document.body.appendChild(box); document.addEventListener("keydown", onKey, true);
        ["mousedown", "keydown", "keypress", "paste"].forEach((ev) => box.addEventListener(ev, (e) => e.stopPropagation()));
        return box;
    };
    const put = (text, what) => { if (env.insert(text)) env.toast(what + " вставлен в поле сообщения: проверьте и отправьте", "success"); else { env.copy(text); env.toast(what + " скопирован: вставьте в чат (Ctrl+V)", "info"); } };
    function loading(name) {
        const b = shell("Разбираю " + (name || "файл") + "…");
        b.querySelector(".mla-pop-b").innerHTML = '<div class="mla-why">Файл разбирается в Majestic Log Advisor на этом компьютере.</div>';
    }
    function error(msg) {
        const b = shell("Разбор не получился", "bad");
        b.querySelector(".mla-pop-b").innerHTML = "<div>" + esc(msg) + "</div>";
        b.querySelector(".mla-pop-f").innerHTML = '<span class="mla-hint">' + MLA_HOTKEY + " — разбор последнего лога тикета</span>";
    }
    function show(r, ctx) {
        ctx = ctx || {};
        const tone = r.status === "bad" ? "bad" : r.status === "warn" ? "warn" : r.status === "ok" ? "ok" : "";
        const b = shell(r.headline || r.cause || r.name, tone), body = b.querySelector(".mla-pop-b"), foot = b.querySelector(".mla-pop-f");
        let h = "";
        (r.warnings || []).forEach((w, i) => { h += '<div class="mla-warn"><div>⚠ ' + esc(w.text) + "</div>" + (w.ask ? '<button class="mla-b" type="button" data-ask="' + i + '">Попросить у игрока</button>' : "") + "</div>"; });
        h += '<div class="mla-sec"><span>Причина</span><div>' + esc(r.cause || "—") + "</div>" + (r.why ? '<div class="mla-why">' + esc(r.why) + "</div>" : "") + (r.source ? '<div class="mla-src">Источник: ' + esc(r.source) + "</div>" : "") + "</div>";
        if (r.steps && r.steps.length) h += '<div class="mla-sec"><span>Как чинить</span><ol>' + r.steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>";
        if (r.also && r.also.length) h += '<div class="mla-sec"><span>Другие файлы архива</span><div class="mla-why">' + r.also.map(esc).join("<br>") + "</div></div>";
        if (r.lines && r.lines.length) h += '<details class="mla-sec"><summary style="cursor:pointer;color:var(--header-secondary,#b5bac1);font-size:12px;font-weight:600;text-transform:uppercase">' + (r.kind === "image" ? "Текст со скриншота" : "Строки лога") + " (" + r.lines.length + ')</summary><div class="mla-lines">' + r.lines.map((x) => (x.n ? "L" + x.n + "  " : "") + esc(x.t)).join("\n") + "</div></details>";
        if (r.reply) h += '<div class="mla-sec"><span>Ответ игроку — можно поправить</span><textarea class="mla-ta" spellcheck="true"></textarea></div>';
        body.innerHTML = h;
        const ta = body.querySelector(".mla-ta"); if (ta) ta.value = r.reply;
        body.querySelectorAll("[data-ask]").forEach((x) => x.addEventListener("click", () => put(r.warnings[+x.getAttribute("data-ask")].ask, "Текст")));
        foot.innerHTML = (r.reply ? '<button class="mla-b p" type="button" data-a="ins">Вставить ответ в чат</button><button class="mla-b" type="button" data-a="copy">Копировать</button>' : "") +
            (r.escalate ? '<button class="mla-b" type="button" data-a="esc" title="Вставить в чат сводку для старших: причина, что уже предложено, ключевые строки">Передать дальше</button>' : "") +
            (ctx.open ? '<button class="mla-b" type="button" data-a="open" title="Отправить файл в Majestic Log Advisor целиком">В анализатор</button>' : "") +
            '<span class="mla-hint">' + MLA_HOTKEY + " — разбор последнего лога тикета · Esc — закрыть</span>";
        const act = (a) => {
            if (a === "ins") { put(ta ? ta.value : r.reply, "Ответ"); close(); }
            else if (a === "copy") { env.copy(ta ? ta.value : r.reply); env.toast("Ответ скопирован", "success"); }
            else if (a === "esc") { put(r.escalate, "Текст для передачи"); close(); }
            else if (a === "open") { ctx.open(); close(); }
        };
        foot.querySelectorAll("[data-a]").forEach((x) => x.addEventListener("click", () => act(x.getAttribute("data-a"))));
    }
    /* значок на вложении: коротко о результате, клик открывает окно */
    function badge(r, onClick) {
        const s = document.createElement("span");
        s.className = "mla-badge " + ((r.badge && r.badge.tone) || ""); s.textContent = (r.badge && r.badge.t) || "?";
        s.title = (r.cause || "") + (r.warnings && r.warnings.length ? "\n⚠ " + r.warnings.map((w) => w.text).join("\n⚠ ") : "") + "\nНажмите — разбор и ответ игроку";
        s.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return s;
    }
    return { show, loading, error, close, badge };
}
/* понятный текст ошибки связи с приложением */
export function quickErr(status, err) {
    if (status === 0) return "Majestic Log Advisor не запущен. Откройте приложение и нажмите «Разбор» ещё раз.";
    if (status === 401) return "Плагин не подключён к анализатору: в настройках плагина нажмите «Подключить к анализатору».";
    if (status === 404 || err === "old") return "Обновите Majestic Log Advisor: эта версия не умеет быстрый разбор («Ещё» → «Обновление»).";
    if (err === "window") return "Окно Majestic Log Advisor ещё загружается — повторите через пару секунд.";
    if (err === "timeout") return "Разбор занял слишком долго. Откройте файл в анализаторе целиком.";
    if (err === "size") return "Файл слишком большой для быстрого разбора — откройте его в анализаторе.";
    if (err === "type") return "Такой файл быстрый разбор не читает.";
    return "Анализатор не смог разобрать файл" + (err ? ": " + err : "") + ".";
}
/* MLA-QUICKUI-END */

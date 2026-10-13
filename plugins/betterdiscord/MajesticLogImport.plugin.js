/**
 * @name MajesticLogImport
 * @version 1.7.3
 * @description «Разбор» логов и скриншотов прямо в тикете: причина, как чинить и готовый ответ игроку одной кнопкой. «В анализатор» отправляет файл в Majestic Log Advisor. Ctrl+Shift+L — разбор последнего лога тикета.
 * @author persephonemajestic
 * @source https://github.com/persephonemajestic/majestic-log-advisor/tree/main/plugins/betterdiscord
 * @updateUrl https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/betterdiscord/MajesticLogImport.plugin.js
 */
/* Кнопка появляется только у вложений .log, .txt, .zip, .dmp, .evtx в ветках, где вы участник.
   «Все файлы тикета» отправляет разом все такие вложения из загруженных сообщений ветки.
   Файл забирает само приложение (оно слушает только ваш компьютер, 127.0.0.1) по ключу из «Настроек» приложения.
   Если приложение закрыто, отправка встаёт в очередь и уйдёт, когда приложение запустится.
   Плагин сам проверяет обновления раз в 6 часов и ставит новую версию из репозитория.
   «Разбор» (логи, zip, скриншоты): файл разбирается в приложении, но не добавляется в список; ответ — окно поверх Discord.
   Значки на логах: плагин сам разбирает логи игрока в открытой ветке и подписывает итог рядом с файлом (можно выключить). */
const FILE_RE = /\.(log|txt|zip|dmp|mdmp|evtx|xml)$/i;
const QKEY = "queue", MAX_AGE = 20 * 3600 * 1000, VERSION = "1.7.3";
const LOG_RE = /\.(log|txt|zip)$/i, IMG_RE = /\.(png|jpe?g|webp)$/i, CDN_RE = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//;

/* MLA-QUICKUI-START — общий код окна «Разбор» для Vencord и BetterDiscord (в BetterDiscord вставляется скриптом plugins/sync-quickui.py) */
/* Окно быстрого разбора поверх Discord: причина, как чинить, предупреждения «тот ли файл», ключевые строки,
   ответ игроку (можно поправить прямо здесь) и кнопки: вставить ответ в чат, передать дальше, открыть в анализаторе. */
const MLA_HOTKEY = "Ctrl+Shift+L";
const MLA_QCSS = ".mla-pop{position:fixed;right:18px;top:64px;z-index:1000;width:min(440px,calc(100vw - 36px));max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--background-primary,#313338);color:var(--text-normal,#dbdee1);border:1px solid var(--background-modifier-accent,#4e5058);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.45);font-size:14px;line-height:1.45}" +
    ".mla-pop-h{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--background-modifier-accent,#4e5058)}.mla-pop-h b{flex:1;font-size:15px;line-height:1.35}.mla-pop-x{border:0;background:none;color:var(--interactive-normal,#b5bac1);font-size:20px;line-height:1;cursor:pointer;padding:0 2px}" +
    ".mla-pop-b{overflow:auto;padding:12px 16px;display:grid;gap:12px}.mla-pop-f{padding:10px 16px 12px;border-top:1px solid var(--background-modifier-accent,#4e5058);display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
    ".mla-sec>span{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;color:var(--header-secondary,#b5bac1);margin-bottom:4px}.mla-sec ol{margin:0;padding-left:20px;display:grid;gap:3px}.mla-why{color:var(--text-muted,#949ba4);font-size:13px;margin-top:2px}" +
    ".mla-warn{border-left:3px solid #f0b232;background:rgba(240,178,50,.1);padding:8px 10px;border-radius:6px;display:grid;gap:6px}.mla-warn .mla-b{justify-self:start}" +
    ".mla-lines{font-family:var(--font-code,Consolas,monospace);font-size:12px;background:var(--background-secondary,#2b2d31);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto}" +
    ".mla-ta{box-sizing:border-box;width:100%;min-height:150px;resize:vertical;background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);border:1px solid var(--background-modifier-accent,#4e5058);border-radius:6px;padding:8px;font:inherit;font-size:13px;user-select:text}" +
    ".mla-b{padding:6px 12px;border-radius:5px;border:1px solid var(--background-modifier-accent,#4e5058);background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);font-size:13px;cursor:pointer}.mla-b:hover{filter:brightness(1.15)}.mla-b.p{background:#5865f2;border-color:#5865f2;color:#fff;font-weight:600}" +
    ".mla-hint{flex-basis:100%;font-size:12px;color:var(--text-muted,#949ba4)}.mla-dot{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none;background:#80848e}.mla-dot.bad{background:#f23f43}.mla-dot.warn{background:#f0b232}.mla-dot.ok{background:#23a55a}" +
    ".mla-badge{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600;vertical-align:middle;color:#fff;background:#80848e;cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mla-badge.bad{background:#da373c}.mla-badge.warn{background:#c58a12}.mla-badge.ok{background:#248046}" +
    ".mla-imgbar{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.mla-imgbar .mla-btn{margin-left:0}.mla-src{font-size:12px;color:var(--text-muted,#949ba4)}" +
    ".mla-tp{border:1px solid var(--background-modifier-accent,#4e5058);border-radius:6px;padding:7px 9px;display:grid;gap:6px;margin-top:6px}.mla-tp-h{display:flex;gap:8px;align-items:center}.mla-tp-h b{flex:1;font-size:13px}.mla-tp pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.45 var(--font-primary,inherit);max-height:180px;overflow:auto;color:var(--text-muted,#b5bac1)}" +
    ".mla-sets{display:inline-flex;gap:4px;margin-left:6px;text-transform:none;letter-spacing:0}.mla-sets button{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--background-modifier-accent,#4e5058);background:none;color:var(--text-muted,#b5bac1);cursor:pointer}.mla-sets button.on{background:#5865f2;border-color:#5865f2;color:#fff}" +
    ".mla-tp.sel{border-color:#5865f2;box-shadow:0 0 0 1px #5865f2}.mla-wait{font-style:italic}" +
    ".mla-tp-f{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mla-mini{font-size:12px;padding:2px 8px;border-radius:5px;border:1px solid var(--background-modifier-accent,#4e5058);background:none;color:var(--text-muted,#b5bac1);cursor:pointer}.mla-mini:hover{color:var(--text-normal,#dbdee1)}.mla-fit{font-size:11px;color:#23a55a;white-space:nowrap}" +
    ".mla-tq{box-sizing:border-box;width:100%;margin-top:8px;padding:6px 9px;border-radius:6px;border:1px solid var(--background-modifier-accent,#4e5058);background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);font:inherit;font-size:13px}";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* env: { insert(text): boolean — вставить в поле сообщения; copy(text); toast(text, type); open(): отправить файл в анализатор } */
function makeQuickUI(env) {
    let box = null, cur = { key: "", touched: false, keys: null };
    const close = () => { if (box) box.remove(); box = null; cur = { key: "", touched: false, keys: null }; document.removeEventListener("keydown", onKey, true); };
    /* клавиши в окне: Esc — закрыть; Enter — вставить выбранный шаблон (или ответ); Alt+1…3 — шаблон по номеру; ↑↓ — выбор шаблона */
    const onKey = (e) => {
        if (!box) return;
        if (e.key === "Escape") { e.stopPropagation(); close(); return; }
        const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "") && box.contains(document.activeElement);
        if (cur.keys && e.altKey && /^Digit[1-3]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); cur.keys.pick(+e.code.slice(5) - 1); return; }
        if (typing || !cur.keys) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); cur.keys.move(e.key === "ArrowDown" ? 1 : -1); }
        else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); cur.keys.enter(); }
    };
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
    /* ctx.key — какой файл или тикет в окне; ctx.update — обновление тем же окном (пришёл ответ ИИ): только если саппорт ещё ничего не трогал */
    function show(r, ctx) {
        ctx = ctx || {};
        if (ctx.update && (!box || cur.key !== ctx.key || cur.touched)) return false;
        const keep = ctx.key;
        const tone = r.status === "bad" ? "bad" : r.status === "warn" ? "warn" : r.status === "ok" ? "ok" : "";
        const b = shell(r.headline || r.cause || r.name, tone), body = b.querySelector(".mla-pop-b"), foot = b.querySelector(".mla-pop-f");
        cur.key = keep || ""; ["mousedown", "input"].forEach((ev) => b.addEventListener(ev, () => { cur.touched = true; }, true));
        const ev = (name) => { if (ctx.fb) ctx.fb({ kind: "ev", ev: name, src: (r.tpl && r.tpl.src) || "" }); };
        let h = "";
        (r.warnings || []).forEach((w, i) => { h += '<div class="mla-warn"><div>⚠ ' + esc(w.text) + "</div>" + (w.ask ? '<button class="mla-b" type="button" data-ask="' + i + '">Попросить у игрока</button>' : "") + "</div>"; });
        if (r.cause || r.kind !== "text") h += '<div class="mla-sec"><span>Причина</span><div>' + esc(r.cause || "—") + "</div>" + (r.why ? '<div class="mla-why">' + esc(r.why) + "</div>" : "") + (r.source ? '<div class="mla-src">Источник: ' + esc(r.source) + "</div>" : "") + "</div>";
        if (r.steps && r.steps.length) h += '<div class="mla-sec"><span>Как чинить</span><ol>' + r.steps.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>";
        if (r.also && r.also.length) h += '<div class="mla-sec"><span>Другие файлы архива</span><div class="mla-why">' + r.also.map(esc).join("<br>") + "</div></div>";
        if (r.lines && r.lines.length) h += '<details class="mla-sec"><summary style="cursor:pointer;color:var(--header-secondary,#b5bac1);font-size:12px;font-weight:600;text-transform:uppercase">' + (r.kind === "image" ? "Текст со скриншота" : "Строки лога") + " (" + r.lines.length + ')</summary><div class="mla-lines">' + r.lines.map((x) => (x.n ? "L" + x.n + "  " : "") + esc(x.t)).join("\n") + "</div></details>";
        const fitTxt = (x) => x.up + x.down ? '<span class="mla-fit" title="Отметки саппортов">подходит ' + x.up + " из " + (x.up + x.down) + "</span>" : "";
        const tp = r.tpl, tpl = (x, i) => '<div class="mla-tp"><div class="mla-tp-h"><b>' + esc(x.t) + "</b>" + fitTxt(x) + '<button class="mla-b p" type="button" data-tpi="' + i + '">Вставить</button><button class="mla-b" type="button" data-tpv="' + i + '">Текст</button></div>' +
            (ctx.fb ? '<div class="mla-tp-f"><button class="mla-mini" type="button" data-fit="1" data-i="' + i + '">👍 Подходит</button><button class="mla-mini" type="button" data-fit="-1" data-i="' + i + '">👎 Не подходит</button><button class="mla-mini" type="button" data-say="' + i + '" title="Добавить к шаблону фразу: как игроки обычно описывают эту проблему (своими словами, без ников)">+ фраза</button></div>' : "") +
            "<pre hidden>" + esc(x.body) + "</pre></div>";
        if (tp) {
            h += '<div class="mla-sec"><span>Шаблоны команды' + (tp.sets && tp.sets.length > 1 && ctx.reload ? '<span class="mla-sets">' + tp.sets.map((n) => '<button type="button" data-set="' + esc(n) + '" class="' + (n === tp.set ? "on" : "") + '">' + esc(n) + "</button>").join("") + "</span>" : "") + "</span>";
            if (tp.ask) h += '<div class="mla-warn"><div>❓ Уточните у игрока: ' + esc(tp.ask) + '</div><button class="mla-b" type="button" data-tpask="1">Спросить</button></div>';
            h += tp.pick.length ? tp.pick.map(tpl).join("") : '<div class="mla-why">Подходящий шаблон не найден — найдите вручную.</div>';
            if (tp.why) h += '<div class="mla-src">' + esc(tp.why) + (tp.src ? " · " + esc(tp.src) : "") + "</div>";
            h += '<input class="mla-tq" type="search" placeholder="Найти шаблон по названию или тексту…" spellcheck="false"><div class="mla-tl"></div></div>';
        } else if (r.kind === "text") h += '<div class="mla-why">Приложение не нашло шаблонов команды. В Majestic Log Advisor откройте «Ещё» → «Настройки» → «Шаблоны ответов команды»: если там «Шаблонов пока нет» — загрузите файл, если шаблоны есть — нажмите «Обновить» и повторите разбор.</div>';
        if (r.reply) h += '<div class="mla-sec"><span>Ответ игроку — можно поправить</span><textarea class="mla-ta" spellcheck="true"></textarea></div>';
        body.innerHTML = h;
        const ta = body.querySelector(".mla-ta"); if (ta) ta.value = r.reply;
        body.querySelectorAll("[data-ask]").forEach((x) => x.addEventListener("click", () => put(r.warnings[+x.getAttribute("data-ask")].ask, "Текст")));
        if (tp) {
            const wire = (root, list) => {
                const marked = {};
                const fit = (it, v, btn) => { if (marked[it.t] || !ctx.fb) return; marked[it.t] = 1; ctx.fb({ kind: "fit", set: tp.set, t: it.t, v }); if (btn) { const f = btn.closest(".mla-tp-f"); if (f) f.innerHTML = '<span class="mla-why">' + (v > 0 ? "Спасибо: отмечено «подходит»" : "Отмечено «не подходит» — найдите нужный шаблон поиском ниже") + "</span>"; } if (v < 0) { const q0 = body.querySelector(".mla-tq"); if (q0) q0.focus(); } };
                root.querySelectorAll("[data-tpi]").forEach((x) => x.addEventListener("click", () => { const i = +x.getAttribute("data-tpi"), it = list[i]; fit(it, 1, null); ev(list === tp.pick ? "r" + Math.min(i + 1, 3) : "search"); put(it.body, "Шаблон"); close(); }));
                root.querySelectorAll("[data-fit]").forEach((x) => x.addEventListener("click", () => fit(list[+x.getAttribute("data-i")], +x.getAttribute("data-fit"), x)));
                root.querySelectorAll("[data-say]").forEach((x) => x.addEventListener("click", () => {
                    const it = list[+x.getAttribute("data-say")], f = x.closest(".mla-tp-f");
                    f.innerHTML = '<input class="mla-tq" style="margin:0" placeholder="Как игроки описывают это (своими словами, без ников)" maxlength="140"><button class="mla-mini" type="button">Отправить</button>';
                    const inp = f.querySelector("input"), go = () => { const v = inp.value.trim(); if (v.length < 4) return; ctx.fb({ kind: "say", set: tp.set, t: it.t, say: v }); f.innerHTML = '<span class="mla-why">Фраза отправлена администратору на проверку</span>'; };
                    f.querySelector("button").addEventListener("click", go); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); }); inp.focus();
                }));
                root.querySelectorAll("[data-tpv]").forEach((x) => x.addEventListener("click", () => { const pre = x.closest(".mla-tp").querySelector("pre"); pre.hidden = !pre.hidden; x.textContent = pre.hidden ? "Текст" : "Скрыть"; }));
            };
            wire(body.querySelector(".mla-sec:has(.mla-tq)") || body, tp.pick);
            const q = body.querySelector(".mla-tq"), tl = body.querySelector(".mla-tl");
            if (q) q.addEventListener("input", () => {
                const s = q.value.trim().toLowerCase(); if (!s) { tl.innerHTML = ""; return; }
                const found = (tp.all || []).filter((x) => x.t.toLowerCase().includes(s) || x.body.toLowerCase().includes(s)).slice(0, 8);
                tl.innerHTML = found.length ? found.map(tpl).join("") : '<div class="mla-why">Ничего не нашлось.</div>'; wire(tl, found);
            });
            body.querySelectorAll("[data-set]").forEach((x) => x.addEventListener("click", () => ctx.reload(x.getAttribute("data-set"))));
            const ak = body.querySelector("[data-tpask]"); if (ak) ak.addEventListener("click", () => put(tp.ask, "Вопрос"));
            if (!ctx.update) ev(tp.pick.length ? "shown" : "none");
            if (tp.more) body.querySelector(".mla-sec:has(.mla-tq)")?.insertAdjacentHTML("beforeend", '<div class="mla-src mla-wait">ИИ уточняет подбор…</div>');
            /* выбор с клавиатуры */
            let sel = tp.pick.length ? 0 : -1;
            const cards = () => Array.from(body.querySelectorAll(".mla-sec:has(.mla-tq) > .mla-tp"));
            const mark = () => cards().forEach((c, i) => c.classList.toggle("sel", i === sel));
            mark();
            cur.keys = {
                pick: (i) => { const bt = cards()[i]?.querySelector("[data-tpi]"); if (bt) bt.click(); },
                move: (d) => { const n = cards().length; if (!n) return; sel = (sel + d + n) % n; mark(); cards()[sel].scrollIntoView({ block: "nearest" }); },
                enter: () => { if (sel >= 0) cur.keys.pick(sel); else { const ins = foot.querySelector('[data-a="ins"]'); if (ins) ins.click(); } }
            };
        } else cur.keys = { pick: () => {}, move: () => {}, enter: () => { const ins = foot.querySelector('[data-a="ins"]'); if (ins) ins.click(); } };
        foot.innerHTML = (r.reply ? '<button class="mla-b p" type="button" data-a="ins">Вставить ответ в чат</button><button class="mla-b" type="button" data-a="copy">Копировать</button>' : "") +
            (r.escalate ? '<button class="mla-b" type="button" data-a="esc" title="Вставить в чат сводку для старших: причина, что уже предложено, ключевые строки">Передать дальше</button>' : "") +
            (ctx.open ? '<button class="mla-b" type="button" data-a="open" title="Отправить файл в Majestic Log Advisor целиком">В анализатор</button>' : "") +
            '<span class="mla-hint">Enter — вставить выбранный' + (tp && tp.pick.length ? " шаблон · Alt+1…3 — шаблон по номеру · ↑↓ — выбор" : " ответ") + " · Esc — закрыть · " + MLA_HOTKEY + " — разбор тикета</span>";
        const act = (a) => {
            if (a === "ins") { ev("reply"); put(ta ? ta.value : r.reply, "Ответ"); close(); }
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
function quickErr(status, err) {
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

const UPDATE_URL = "https://raw.githubusercontent.com/persephonemajestic/majestic-log-advisor/main/plugins/betterdiscord/MajesticLogImport.plugin.js";

/* Данные игрока из текста: подписанные поля («Ник:», «Статик:», «Сервер:») и ник вида Имя_Фамилия.
   Сначала свои сообщения игрока, потом поля формы тикета, потом текст бота; строки про саппорта пропускаются. */
const STOP = /\s*(?:[,;|/(]|\s-\s|\s—\s|$|\s+(?:ник|nick|статик|static|стат|id|сервер|server|discord|дискорд|проблема|описание)(?=[\s:.,;!?*-]|$))/i;
const STAFF = /саппорт|support|модератор|администратор|админ|staff|принял|сотрудник|агент|хелпер|helper/i;
const TICKET_STAFF = /специалист|взял\S* .*обращени|саппорт|support|модератор|администратор|staff|принял|сотрудник|агент|хелпер|helper|меняет название|закрыл\S* (тикет|обращени)/i;
/* приветствие бота тикетов — не описание проблемы */
const TICKET_WELCOME = /благодарим вас за обращение|специалист поддержки присоединится|при необходимости, дополните|некорректного поведения|агент имеет право|будьте вежливы|^\s*здравствуйте,/i;
const DESC_RE = /описание проблемы/i;
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
    constructor(meta) { this.meta = meta || {}; this.obs = null; this.timer = 0; this.upTimer = 0; this.qres = new Map(); this.bq = []; this.bBusy = false; this.downUntil = 0; }

    cfg() { return Object.assign({ token: "", port: 47615, badges: true }, BdApi.Data.load("MajesticLogImport", "settings") || {}); }
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
        this.ui = makeQuickUI({ insert: (t) => this.insert(t), copy: (t) => this.copy(t), toast: (t, k) => this.toast(t, k) });
        this.onKey = (e) => { if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyL") { e.preventDefault(); e.stopPropagation(); this.hotkey(); } };
        document.addEventListener("keydown", this.onKey, true);
        if (BdApi.Data.load("MajesticLogImport", "told150") !== true) { BdApi.Data.save("MajesticLogImport", "told150", true); setTimeout(() => this.toast("MajesticLogImport 1.5: «Разбор» у логов и скриншотов, «Анализировать» под описанием проблемы — готовый шаблон команды по тексту игрока. " + MLA_HOTKEY + " — разбор тикета с клавиатуры.", "info"), 4000); }
        BdApi.DOM.addStyle("MajesticLogImport", MLA_QCSS + ".mla-btn{margin-left:8px;padding:2px 8px;border-radius:4px;border:1px solid var(--button-outline-brand-border,#5865f2);background:transparent;color:var(--text-link,#00a8fc);font-size:12px;cursor:pointer;vertical-align:middle}.mla-btn:hover{background:rgba(88,101,242,.15)}.mla-btn[disabled]{opacity:.6;cursor:default}.mla-all{font-weight:600}");
    }
    stop() {
        if (this.obs) this.obs.disconnect(); this.obs = null; clearInterval(this.timer); clearInterval(this.upTimer); clearTimeout(this.upT);
        BdApi.DOM.removeStyle("MajesticLogImport");
        document.removeEventListener("keydown", this.onKey, true); if (this.ui) this.ui.close(); this.bq = [];
        document.querySelectorAll(".mla-btn, .mla-badge, .mla-imgbar").forEach(b => b.remove());
        document.querySelectorAll("[data-mla]").forEach(a => a.removeAttribute("data-mla"));
        document.querySelectorAll("[data-mlat]").forEach(a => a.removeAttribute("data-mlat"));
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
    /* игрок ветки: автор первого сообщения не от бота и не вы сами (тикет мог открыть бот, а вы — написать первым) */
    playerId(channelId) { let me = ""; try { me = this.store("UserStore")?.getCurrentUser()?.id || ""; } catch (e) {} const m = this.messages(channelId).find(x => x && x.author && !x.author.bot && x.author.id !== me); return m ? m.author.id : ""; }
    attachments(channelId, re) {
        const out = [], seen = {}, pid = this.playerId(channelId); re = re || FILE_RE;
        for (const m of this.messages(channelId)) for (const a of (pid && m?.author?.id !== pid ? [] : (m && m.attachments) || [])) {
            const name = a.filename || a.name || "", url = a.url || "";
            if (!re.test(name) || !CDN_RE.test(url) || seen[url]) continue;
            seen[url] = 1; out.push({ messageId: m.id, url, name, size: a.size || 0 });
        }
        return out;
    }

    scan() {
        let firstCh = "", firstBtn = null;
        for (const a of document.querySelectorAll('a[href*="/attachments/"]:not([data-mla])')) {
            a.setAttribute("data-mla", "1");
            let url; try { url = new URL(a.href); } catch (e) { continue; }
            if (!/^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(url.hostname) || !/^\/attachments\//.test(url.pathname)) continue;
            const name = decodeURIComponent(url.pathname.split("/").pop() || "");
            const li = a.closest('[id^="chat-messages-"]'); if (!li) continue;
            const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id); if (!m) continue;
            if (IMG_RE.test(name)) { if (this.joined(m[1])) this.imgButton(li, m[1], m[2], a.href, name); continue; }
            if (!FILE_RE.test(name)) continue;
            if (!this.joined(m[1])) continue;
            if (LOG_RE.test(name)) {
                const q = document.createElement("button");
                q.className = "mla-btn mla-q"; q.type = "button"; q.textContent = "Разбор"; q.title = "Причина, как чинить и готовый ответ игроку — в окне поверх Discord. " + MLA_HOTKEY + " — разбор последнего лога тикета";
                q.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.openQuick(m[1], m[2], a.href, name); });
                a.insertAdjacentElement("afterend", q);
                if (this.cfg().badges !== false) this.queueBadge(m[1], m[2], a.href, name, a);
            }
            const b = document.createElement("button");
            b.className = "mla-btn mla-one"; b.type = "button"; b.textContent = "В анализатор"; b.title = "Отправить файл и данные игрока в Majestic Log Advisor"; b.dataset.ch = m[1];
            b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.send(m[1], m[2], a.href, name, b); });
            (a.nextElementSibling && a.nextElementSibling.classList.contains("mla-q") ? a.nextElementSibling : a).insertAdjacentElement("afterend", b);
        }
        for (const li of document.querySelectorAll('[id^="chat-messages-"]:not([data-mlat])')) {
            li.setAttribute("data-mlat", "1"); const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id);
            if (m && this.joined(m[1])) this.ticketButton(li, m[1], m[2]);
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
        if (!CDN_RE.test(url)) return this.toast("В анализатор отправляются только файлы из тикета (логи, архивы, дампы)", "info");
        const body = Object.assign({ url, name }, this.player(channelId, messageId));
        if (btn) { btn.disabled = true; btn.textContent = "Отправляю…"; }
        try {
            const j = await this.post(body);
            if (btn) { btn.textContent = j.dup ? "✓ Уже в анализаторе" : "✓ В анализаторе"; btn.disabled = false; btn.title = "Нажмите ещё раз, чтобы открыть файл в анализаторе снова"; }
            this.toast((j.dup ? "Уже в анализаторе: " : "Отправлено в анализатор: ") + name, "success");
        } catch (e) {
            if (String(e.message) === "token") { if (btn) { btn.disabled = false; btn.textContent = "В анализатор"; } if (!this.retried && await this.pair()) { this.retried = true; try { return await this.send(channelId, messageId, url, name, btn); } finally { this.retried = false; } } return; }
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
        if (btn) { btn.textContent = queued ? "⏳ В очереди: " + queued : "✓ Все в анализаторе"; btn.disabled = false; }
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

    /* ---------- Быстрый разбор ---------- */
    /* Ответ вставляется в поле сообщения открытого канала (как будто вы его напечатали) — отправляете вы сами */
    insert(text) {
        try {
            const CD = BdApi.Webpack.getModule((m) => m && typeof m.dispatchToLastSubscribed === "function" && m.emitter && typeof m.emitter.listeners === "function" && m.emitter.listeners("INSERT_TEXT").length, { searchExports: true });
            if (CD) { CD.dispatchToLastSubscribed("INSERT_TEXT", { plainText: text, rawText: text }); return true; }
        } catch (e) {}
        return false;
    }
    copy(text) { try { if (window.DiscordNative && DiscordNative.clipboard) return DiscordNative.clipboard.copy(text); } catch (e) {} try { navigator.clipboard.writeText(text); } catch (e) {} }
    msgAt(channelId, messageId) { try { const t = this.store("MessageStore")?.getMessage(channelId, messageId)?.timestamp; return t ? +new Date(t) : 0; } catch (e) { return 0; } }
    /* что пишет игрок: его сообщения в ветке и поля формы тикета от бота (сообщения саппортов не берём) */
    ticketText(channelId, max) {
        const list = this.messages(channelId), pid = this.playerId(channelId), out = [];
        for (const m of list) {
            if (m?.author?.id === pid && m.content) out.push(String(m.content));
            /* бот тикетов пишет описание проблемы обычным сообщением; служебные строки («Специалист … взял обращение») пропускаем */
            if (m?.author?.bot && m.content) for (const line of String(m.content).split("\n")) if (line.trim() && !TICKET_STAFF.test(line) && !TICKET_WELCOME.test(line)) out.push(line);
            if (m?.author?.bot || m?.author?.id === pid) for (const em of m.embeds || []) { for (const f of em.fields || []) if (!STAFF.test(f.name || f.rawName || "")) out.push((f.name || f.rawName || "") + ": " + (f.value || f.rawValue || "")); if (m?.author?.bot && (em.description || em.rawDescription)) for (const line of String(em.description || em.rawDescription).split("\n")) if (line.trim() && !TICKET_WELCOME.test(line) && !TICKET_STAFF.test(line)) out.push(line); }
        }
        const t = out.join("\n").trim(); return t.length > max ? t.slice(t.length - max) : t;
    }
    /* файл скачивает Discord, разбирает приложение; в список логов приложения файл не попадает.
       mode: badge — значок, full — окно, text — подбор шаблона только по тексту тикета */
    /* noai: сначала быстрый ответ без ИИ (окно открывается сразу), ИИ уточняет вторым запросом */
    async quick(channelId, messageId, url, name, mode, set, noai) {
        const c = this.cfg(), base = "http://127.0.0.1:" + (c.port || 47615), key = url.replace(/[?#].*$/, ""), ck = key + "|" + (set || "") + "|" + (noai ? 0 : 1);
        const hit = this.qres.get(ck); if (hit && (mode === "text" ? Date.now() - hit._at < 60000 : mode === "badge" || hit._mode !== "badge")) return hit;
        if (!c.token) { const e = new Error("token"); e.status = 401; throw e; }
        let buf;
        if (mode === "text") buf = new TextEncoder().encode(this.ticketText(channelId, 4000) || " ");
        else { const d = await this.fetch(url); if (!d.ok) { const e = new Error("Discord не отдал файл (" + d.status + ")"); e.status = -1; throw e; } buf = new Uint8Array(await d.arrayBuffer()); }
        const ch = this.store("ChannelStore")?.getChannel(channelId);
        const meta = { name, url: key, ticket: ch?.name || "", guild: ch?.guild_id || "", set: set || "", msgAt: this.msgAt(channelId, messageId), siblings: this.attachments(channelId).map((x) => x.name), mode: mode || "full", noai: !!noai, player: messageId ? this.player(channelId, messageId).player : null, text: mode === "full" ? this.ticketText(channelId, 1500) : "" };
        let r; try { r = await this.fetch(base + "/v1/quick", { method: "POST", headers: { "content-type": "application/octet-stream", "x-mla-token": c.token, "x-mla-meta": btoa(unescape(encodeURIComponent(JSON.stringify(meta)))) }, body: buf }); }
        catch (e) { const er = new Error("down"); er.status = 0; throw er; }
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok || !j.ok) { const e = new Error(j.error || ""); e.status = r.status; throw e; }
        j._mode = mode || "full"; j._at = Date.now(); this.qres.set(ck, j); if (this.qres.size > 80) this.qres.delete(this.qres.keys().next().value);
        return j;
    }
    /* отметка «подходит / не подходит» или фраза к шаблону — в приложение, оттуда команде */
    async fb(o) {
        const c = this.cfg(); if (!c.token) return;
        try { await this.fetch("http://127.0.0.1:" + (c.port || 47615) + "/v1/quick", { method: "POST", headers: { "content-type": "application/octet-stream", "x-mla-token": c.token, "x-mla-meta": btoa(unescape(encodeURIComponent(JSON.stringify({ name: "fb.txt", mode: "fb" })))) }, body: new TextEncoder().encode(JSON.stringify(o)) }); } catch (e) {}
    }
    async openQuick(channelId, messageId, url, name, set) {
        const text = url.indexOf("ticket:") === 0;
        this.ui.loading(text ? "тикет" : name);
        try {
            const mode = text ? "text" : "full", key = url + "|" + (set || "");
            const ctx = { key, open: !text && FILE_RE.test(name) ? () => this.send(channelId, messageId, url, name, null) : null, reload: (s) => this.openQuick(channelId, messageId, url, name, s), fb: (o) => this.fb(o) };
            const r = await this.quick(channelId, messageId, url, name, mode, set, true);
            this.ui.show(r, ctx);
            if (r.tpl && r.tpl.more) { try { const r2 = await this.quick(channelId, messageId, url, name, mode, set, false); this.ui.show(r2, Object.assign({}, ctx, { update: true })); } catch (e) {} }
        } catch (e) {
            if (e.status === 401 && !this.retried) { this.ui.close(); if (await this.pair()) { this.retried = true; try { return await this.openQuick(channelId, messageId, url, name, set); } finally { this.retried = false; } } return; }
            this.ui.error(e.status === -1 ? e.message : quickErr(e.status, e.message));
        }
    }
    /* Ctrl+Shift+L: последний лог игрока в открытой ветке (если логов нет — последний скриншот) */
    hotkey(chIn) {
        const ch = chIn || this.store("SelectedChannelStore")?.getChannelId();
        if (!ch || !this.joined(ch)) return this.toast("Откройте ветку тикета, в которой вы участник, и нажмите " + MLA_HOTKEY + " ещё раз", "info");
        const a = this.attachments(ch, LOG_RE).pop() || this.attachments(ch, IMG_RE).pop();
        if (!a) return this.textQuick(ch);
        this.openQuick(ch, a.messageId, a.url, a.name);
    }
    /* тикет без файлов: подобрать шаблон команды по тому, что написал игрок */
    textQuick(ch) {
        const pid = this.playerId(ch), first = this.messages(ch).find((m) => m?.author?.id === pid);
        if (!this.ticketText(ch, 50)) return this.toast("Игрок в этом тикете ещё ничего не написал", "info");
        this.openQuick(ch, first ? first.id : "", "ticket:" + ch, "ticket.txt");
    }
    /* кнопка «Анализировать» под описанием проблемы */
    /* «Анализировать» — под описанием проблемы от бота тикетов; если описания нет — под первым сообщением игрока */
    descId(ch) {
        const list = this.messages(ch), d = list.find((m) => m?.author?.bot && DESC_RE.test(String(m.content || "") + " " + (m.embeds || []).map((e) => (e.title || "") + " " + (e.description || e.rawDescription || "") + " " + (e.fields || []).map((f) => f.name || f.rawName || "").join(" ")).join(" ")));
        if (d) return d.id; const pid = this.playerId(ch), p = list.find((m) => m?.author?.id === pid); return p ? p.id : "";
    }
    ticketButton(li, ch, mid) {
        if (li.querySelector(".mla-tk") || this.descId(ch) !== mid) return;
        const acc = li.querySelector('[id^="message-accessories-"]') || li, b = document.createElement("button");
        b.className = "mla-btn mla-tk"; b.type = "button"; b.textContent = "Анализировать"; b.title = "Разбор обращения: логи и скриншоты игрока, если есть, и готовый шаблон команды по описанию проблемы. " + MLA_HOTKEY + " — то же с клавиатуры";
        b.style.marginLeft = "0"; b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.hotkey(ch); });
        const bar = document.createElement("div"); bar.className = "mla-imgbar mla-tkbar"; bar.appendChild(b); acc.appendChild(bar);
        /* заранее подобрать шаблон без ИИ — окно «Анализировать» откроется мгновенно */
        this.pre = this.pre || {}; if (!this.pre[ch] && !this.attachments(ch, LOG_RE).length && this.cfg().token && Date.now() > this.downUntil) { this.pre[ch] = 1; this.quick(ch, mid, "ticket:" + ch, "ticket.txt", "text", "", true).catch(() => {}); }
    }
    imgButton(li, channelId, messageId, url, name) {
        const acc = li.querySelector('[id^="message-accessories-"]') || li, key = url.replace(/[?#].*$/, ""); let bar = li.querySelector(".mla-imgbar");
        if (bar && Array.from(bar.children).some((x) => x.dataset.u === key)) return;
        if (!bar) { bar = document.createElement("div"); bar.className = "mla-imgbar"; acc.appendChild(bar); }
        const b = document.createElement("button"); b.className = "mla-btn"; b.type = "button"; b.dataset.u = key;
        b.textContent = "Разбор скриншота" + (bar.children.length ? " " + (bar.children.length + 1) : ""); b.title = "Распознать ошибку на скриншоте (текст читает ИИ; чёрные полосы ищутся на этом компьютере) и предложить ответ игроку";
        b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this.openQuick(channelId, messageId, url, name); });
        bar.appendChild(b);
    }
    /* значки: по одному файлу за раз, только когда анализатор доступен; большие файлы (больше 40 МБ) не трогаем */
    queueBadge(channelId, messageId, url, name, anchor) {
        const key = url.replace(/[?#].*$/, ""), done = this.qres.get(key);
        if (done) return this.putBadge(anchor, done, channelId, messageId, url, name);
        const att = this.attachments(channelId, LOG_RE).find((x) => x.url.replace(/[?#].*$/, "") === key);
        if (!att || att.size > 40 * 1048576 || Date.now() < this.downUntil) return;
        this.bq.push({ channelId, messageId, url, name, anchor }); this.pumpBadges();
    }
    async pumpBadges() {
        if (this.bBusy) return; this.bBusy = true;
        try {
            while (this.bq.length) {
                const it = this.bq.shift(); if (!it.anchor.isConnected) continue;
                try { const r = await this.quick(it.channelId, it.messageId, it.url, it.name, "badge"); this.putBadge(it.anchor, r, it.channelId, it.messageId, it.url, it.name); }
                catch (e) { if (e.status === 0 || e.status === 401 || e.status === 404 || e.status === 501) { this.downUntil = Date.now() + 60000; this.bq = []; } }
            }
        } finally { this.bBusy = false; }
    }
    putBadge(anchor, r, channelId, messageId, url, name) {
        if (!anchor.isConnected || (anchor.nextElementSibling && anchor.nextElementSibling.classList.contains("mla-badge"))) return;
        anchor.insertAdjacentElement("afterend", this.ui.badge(r, () => this.ui.show(r, { open: () => this.send(channelId, messageId, url, name, null) })));
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

    /* Проверка связи: приложение запущено и ключ подходит */
    async checkLink() {
        const c = this.cfg(), base = "http://127.0.0.1:" + (c.port || 47615);
        try { const r = await this.fetch(base + "/v1/ping"); const j = await r.json(); if (!j.ok) return this.toast("Анализатор не ответил", "error"); }
        catch (e) { return this.toast("Анализатор не запущен или порт неверный", "error"); }
        if (!c.token) return this.toast("Связь есть, но ключ не вставлен: «Настройки» приложения → «Плагин Discord» → «Скопировать ключ»", "warning");
        try { const r = await this.fetch(base + "/v1/import", { method: "POST", headers: { "content-type": "application/json", "x-mla-token": c.token }, body: "{}" }); this.toast(r.status === 401 ? "Ключ не подходит: скопируйте его заново в «Настройках» приложения" : "Связь с анализатором есть, ключ подходит", r.status === 401 ? "error" : "success"); }
        catch (e) { this.toast("Анализатор не отвечает", "error"); }
    }
    /* Вставить ключ из буфера обмена одной кнопкой: работает, даже если поле ввода в окне настроек недоступно */
    /* Подключение без ввода ключа: просим приложение, пользователь жмёт «Разрешить» в окне анализатора, ключ сохраняется сам */
    async pair(after) {
        if (this.pairing) return false; this.pairing = true;
        const c = this.cfg();
        this.toast("Подтвердите подключение в окне Majestic Log Advisor (кнопка «Разрешить»)", "info");
        try {
            const r = await this.fetch("http://127.0.0.1:" + (c.port || 47615) + "/v1/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: "BetterDiscord" }) });
            let j = {}; try { j = await r.json(); } catch (e) {}
            if (r.ok && j.ok && /^[0-9a-f]{32}$/i.test(j.token || "")) { this.setCfg(Object.assign(this.cfg(), { token: j.token })); this.toast("Плагин подключён к анализатору", "success"); if (after) after(j.token); return true; }
            this.toast(j.error === "denied" ? "Подключение отклонено в анализаторе" : r.status === 404 ? "Обновите Majestic Log Advisor: эта версия не умеет подключаться сама — вставьте ключ вручную" : "Анализатор не ответил на подключение", "error");
        } catch (e) { this.toast("Анализатор не запущен: откройте Majestic Log Advisor и нажмите «Подключить» ещё раз", "error"); }
        finally { this.pairing = false; }
        return false;
    }
    async pasteKey(after) {
        let s = "";
        try { if (window.DiscordNative && DiscordNative.clipboard && DiscordNative.clipboard.read) s = String(DiscordNative.clipboard.read() || ""); } catch (e) {}
        if (!s) { try { s = await navigator.clipboard.readText(); } catch (e) {} }
        s = String(s || "").trim();
        if (!/^[0-9a-f]{32}$/i.test(s)) return this.toast("В буфере нет ключа: в приложении нажмите «Настройки» → «Плагин Discord» → «Скопировать ключ»", "error");
        this.setCfg(Object.assign(this.cfg(), { token: s })); this.toast("Ключ вставлен", "success"); if (after) after(s);
        this.checkLink();
    }

    getSettingsPanel() {
        const c = this.cfg();
        /* В новых версиях BetterDiscord — его собственные поля настроек (с ними работают клик и ввод в окне Discord) */
        if (BdApi.UI && typeof BdApi.UI.buildSettingsPanel === "function") {
            try {
                return BdApi.UI.buildSettingsPanel({
                    settings: [
                        { type: "text", id: "token", name: "Ключ из Majestic Log Advisor", note: "В приложении: «Настройки» → «Плагин Discord» → «Скопировать ключ», затем вставьте сюда (Ctrl+V) или нажмите кнопку ниже.", value: c.token, placeholder: "Вставьте ключ сюда" },
                        { type: "number", id: "port", name: "Порт", note: "Обычно 47615", value: c.port || 47615 },
                        { type: "button", id: "pair", name: "Подключить к анализатору", note: "Самый простой способ: в окне Majestic Log Advisor появится запрос, нажмите «Разрешить» — ключ сохранится сам", children: "Подключить", onClick: () => this.pair() },
                        { type: "button", id: "paste", name: "Вставить ключ из буфера", note: "Берёт скопированный в приложении ключ и сразу проверяет связь", children: "Вставить ключ из буфера", onClick: () => this.pasteKey() },
                        { type: "button", id: "check", name: "Проверить связь с анализатором", note: "Приложение запущено и ключ подходит", children: "Проверить связь", onClick: () => this.checkLink() },
                        { type: "switch", id: "badges", name: "Значки на логах в тикетах", note: "Плагин сам разбирает логи игрока в открытой ветке и подписывает итог рядом с файлом: «МОД», «Сеть игрока», «Успех», «старый»… Нужен запущенный анализатор.", value: c.badges !== false },
                        { type: "button", id: "hotkey", name: "Горячая клавиша: " + MLA_HOTKEY, note: "В открытой ветке тикета — разбор последнего лога игрока (если логов нет — скриншота, если нет и его — подбор шаблона по тексту игрока)", children: "Попробовать", onClick: () => this.hotkey() }
                    ],
                    onChange: (cat, id, value) => { const n = this.cfg(); if (id === "token") n.token = String(value || "").trim(); else if (id === "port") n.port = parseInt(value, 10) || 47615; else if (id === "badges") n.badges = !!value; this.setCfg(n); }
                });
            } catch (e) {}
        }
        /* Старые версии BetterDiscord: обычная форма */
        const el = document.createElement("div");
        el.style.cssText = "display:grid;gap:10px;color:var(--text-normal, #dbdee1);padding:4px 0";
        const inp = "box-sizing:border-box;width:100%;height:38px;padding:0 10px;border-radius:6px;border:1px solid #4e5058;background:#1e1f22;color:#f2f3f5;font-size:14px;outline:none;pointer-events:auto;user-select:text";
        el.innerHTML = '<label style="display:grid;gap:6px"><span>Ключ из Majestic Log Advisor («Настройки» → «Плагин Discord» → «Скопировать ключ»):</span><input type="text" class="mla-key" placeholder="Вставьте ключ сюда (Ctrl+V)" spellcheck="false" autocomplete="off" style="' + inp + '"></label>' +
            '<label style="display:grid;gap:6px"><span>Порт (обычно 47615):</span><input type="number" class="mla-port" style="' + inp + ';width:140px"></label>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="mla-btn mla-pair" type="button" style="margin:0;padding:6px 12px;font-size:13px">Подключить к анализатору</button><button class="mla-btn mla-paste" type="button" style="margin:0;padding:6px 12px;font-size:13px">Вставить ключ из буфера</button><button class="mla-btn mla-test" type="button" style="margin:0;padding:6px 12px;font-size:13px">Проверить связь с анализатором</button></div>';
        const k = el.querySelector(".mla-key"), p = el.querySelector(".mla-port");
        k.value = c.token; p.value = c.port;
        const save = () => this.setCfg({ token: k.value.trim(), port: parseInt(p.value, 10) || 47615 });
        ["input", "change"].forEach((ev) => { k.addEventListener(ev, save); p.addEventListener(ev, save); });
        [k, p].forEach((x) => { x.addEventListener("mousedown", (e) => e.stopPropagation()); x.addEventListener("keydown", (e) => e.stopPropagation()); });
        el.querySelector(".mla-paste").addEventListener("click", () => this.pasteKey((s) => { k.value = s; }));
        const pb = el.querySelector(".mla-pair"); if (pb) pb.addEventListener("click", () => this.pair((s) => { k.value = s; }));
        el.querySelector(".mla-test").addEventListener("click", () => { save(); this.checkLink(); });
        return el;
    }
};
module.exports.extractPlayer = extractPlayer;

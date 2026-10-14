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
    ".mla-imgbar{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.mla-imgbar .mla-btn{margin-left:0}.mla-src{font-size:12px;color:var(--text-muted,#949ba4)}" +
    ".mla-tp{border:1px solid var(--background-modifier-accent,#4e5058);border-radius:6px;padding:7px 9px;display:grid;gap:6px;margin-top:6px}.mla-tp-h{display:flex;gap:8px;align-items:center}.mla-tp-h b{flex:1;font-size:13px}.mla-tp pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.45 var(--font-primary,inherit);max-height:180px;overflow:auto;color:var(--text-muted,#b5bac1)}" +
    ".mla-sets{display:inline-flex;gap:4px;margin-left:6px;text-transform:none;letter-spacing:0}.mla-sets button{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--background-modifier-accent,#4e5058);background:none;color:var(--text-muted,#b5bac1);cursor:pointer}.mla-sets button.on{background:#5865f2;border-color:#5865f2;color:#fff}" +
    ".mla-tp.sel{border-color:#5865f2;box-shadow:0 0 0 1px #5865f2}.mla-wait{font-style:italic}" +
    ".mla-tp-f{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.mla-mini{font-size:12px;padding:2px 8px;border-radius:5px;border:1px solid var(--background-modifier-accent,#4e5058);background:none;color:var(--text-muted,#b5bac1);cursor:pointer}.mla-mini:hover{color:var(--text-normal,#dbdee1)}.mla-fit{font-size:11px;color:#23a55a;white-space:nowrap}" +
    ".mla-tq{box-sizing:border-box;width:100%;margin-top:8px;padding:6px 9px;border-radius:6px;border:1px solid var(--background-modifier-accent,#4e5058);background:var(--background-secondary,#2b2d31);color:var(--text-normal,#dbdee1);font:inherit;font-size:13px}";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* env: { insert(text): boolean — вставить в поле сообщения; copy(text); toast(text, type); open(): отправить файл в анализатор } */
export function makeQuickUI(env) {
    let box = null, cur = { key: "", touched: false, keys: null };
    const close = () => { if (box) box.remove(); box = null; cur = { key: "", touched: false, keys: null }; document.removeEventListener("keydown", onKey, true); };
    /* клавиши в окне: Esc — закрыть; Enter — вставить выбранный шаблон (или ответ); Alt+1…3 — шаблон по номеру; ↑↓ — выбор шаблона */
    const onKey = (e) => {
        if (!box) return;
        if (e.key === "Escape") { e.stopPropagation(); close(); return; }
        const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || "") && box.contains(document.activeElement);
        if (cur.keys && e.altKey && /^Digit[1-3]$/.test(e.code)) { e.preventDefault(); e.stopPropagation(); cur.keys.pick(+e.code.slice(5) - 1); return; }
        /* фокус в поле сообщения Discord или другом поле вне окна — клавиши принадлежат Discord (Enter отправляет сообщение) */
        const ae = document.activeElement, outside = ae && ae !== document.body && !box.contains(ae) && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
        if (typing || outside || !cur.keys) return;
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
    /* после вставки окно закрывается: дальше Enter в поле сообщения отправляет его, а не вставляет шаблон */
    const put = (text, what) => { close(); if (env.insert(text)) env.toast(what + " вставлен в поле сообщения: проверьте и отправьте", "success"); else { env.copy(text); env.toast(what + " скопирован: вставьте в чат (Ctrl+V)", "info"); } };
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
            if (tp.why || tp.src) h += '<div class="mla-src">' + (tp.why ? esc(tp.why) + " · " : "") + "подобрано: " + esc(tp.src === "ИИ" ? "ИИ" : tp.src ? "по ключевым словам" : "—") + "</div>";
            if (tp.aiErr) h += '<div class="mla-src" style="color:var(--text-warning,#f0b232)">ИИ не помог: ' + esc(tp.aiErr) + "</div>";
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
    /* ИИ не ответил или окно уже трогали — убрать надпись «ИИ уточняет подбор…» */
    function settle(key) { if (box && cur.key === key) box.querySelectorAll(".mla-wait").forEach((x) => x.remove()); }
    return { show, loading, error, close, badge, settle };
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

/* ---------- События ---------- */
document.addEventListener('click', function (ev) {
  var t = ev.target.closest('[data-act]'); if (!t) return;
  var a = t.getAttribute('data-act'), f = active(), sf = sysOnlyOn() ? S.sysOnly : f;
  if (a === 'palRun') { palRun(+t.getAttribute('data-i')); return; }
  if (a === 'open') { if (ev.target.closest('[data-act="rm"]')) return; var was = S.active; S.lastTouch = null; S.active = +t.getAttribute('data-id'); S.sel = -1; render(); if (was !== S.active) animView(); }
  else if (a === 'undo') undoLast();
  else if (a === 'assetsCopy') copyText(assetsText(), 'Список ассетов', 'Скопируйте список.', 'Список скопирован.');
  else if (a === 'assetsReset') { S.kb.settings.assetStats = {}; saveKB(); renderAssets(); }
  else if (a === 'allArc') allToArc();
  else if (a === 'clrZone') { clearZone(t.getAttribute('data-z')); ev.stopPropagation(); }
  else if (a === 'rm') { var id = +t.getAttribute('data-id'); var rmf = S.files.find(function (x) { return x.id === id; }); if (rmf) LS.del(rmf.hash); delete S.pins[id]; S.files = S.files.filter(function (x) { return x.id !== id; }); if (S.active === id) S.active = S.files.length ? S.files[0].id : null; render(); ev.stopPropagation(); }
  else if (a === 'tab') { var wt = S.tab; S.tab = t.getAttribute('data-tab'); render(); if (wt !== S.tab) animView(); }
  else if (a === 'jump') jump(+t.getAttribute('data-line'));
  else if (a === 'lcopy') { ev.stopPropagation(); copyLine(+t.getAttribute('data-line')); }
  else if (a === 'pick') { if (rowsSelection()) return; S.sel = +t.getAttribute('data-line'); /* строки не перерисовываем: так работают двойной и тройной щелчок для выделения */ Array.prototype.forEach.call(document.querySelectorAll('#rows .ln.sel'), function (x) { x.classList.remove('sel'); }); t.classList.add('sel'); drawInspector(f); }
  else if (a === 'scope') { S.scope = t.getAttribute('data-v'); renderLogShell(f); }
  else if (a === 'quiet') { S.quiet = !S.quiet; renderLogShell(f); }
  else if (a === 'qSave') { var sq = savedQ().slice(), cq = S.q.trim(); if (cq && sq.indexOf(cq) < 0) { sq.unshift(cq); S.kb.settings.savedQ = sq.slice(0, 10); saveKB(); } drawSavedQ(); }
  else if (a === 'qUse') { S.q = savedQ()[+t.getAttribute('data-i')] || ''; var qi = $('#logQ'); if (qi) qi.value = S.q; refreshLog(true); drawSavedQ(); }
  else if (a === 'qDel') { var dq = savedQ().slice(); dq.splice(+t.getAttribute('data-i'), 1); S.kb.settings.savedQ = dq; saveKB(); drawSavedQ(); }
  else if (a === 'pats' || a === 'patsOpen') { S.patOpen = a === 'patsOpen' ? true : !S.patOpen; renderLogShell(f); }
  else if (a === 'patPick') { var pk = t.getAttribute('data-k'); if (S.pat === pk && S.patFid === f.id) { S.pat = ''; } else { S.pat = pk; S.patFid = f.id; S.mode = 'all'; } S.patOpen = false; renderLogShell(f); }
  else if (a === 'patClear') { S.pat = ''; renderLogShell(f); }
  else if (a === 'sigForm') { f.sigForm = !f.sigForm; renderView(); }
  else if (a === 'sigCancel') { f.sigForm = false; renderView(); }
  else if (a === 'sigSave' || a === 'sigDel') sigSave(f, a === 'sigDel');
  else if (a === 'permCopy') { var pg = f.sc.findings[+t.getAttribute('data-fi')]; if (pg && pg.permCmd) copyText(pg.permCmd.join(' ; '), 'Команда выдачи прав', 'Скопируйте команду и отправьте игроку.', 'Команда скопирована.'); }
  else if (a === 'extCopy') { var ek = $('#extKey'); if (ek) copyText(ek.textContent, 'Ключ для плагина Discord', 'Скопируйте ключ и вставьте в настройки плагина.', 'Ключ скопирован. Вставьте его в настройки плагина.'); }
  else if (a === 'extReset') { window.nativeApp.extReset().then(function () { openSettings(); status('Создан новый ключ. Вставьте его в настройки плагина заново.'); }); }
  else if (a === 'fold') { S.kb.settings.logFold = !foldOn(); saveKB(); renderLogShell(f); }
  else if (a === 'twin') timeWindow(f, +t.getAttribute('data-line'));
  else if (a === 'fragCopy') copyText(fragmentText(f, +t.getAttribute('data-line')), 'Фрагмент лога', 'Скопируйте фрагмент и вставьте в тикет.', 'Фрагмент скопирован, личные данные скрыты.');
  else if (a === 'mode') { S.mode = t.getAttribute('data-mode'); renderLogShell(f); }
  else if (a === 'report') copyText(buildReport(f), 'Отчёт для тикета');
  else if (a === 'reply') { var rfi = t.getAttribute('data-fi'); openReply(f, rfi === 'mods' ? 'mods' : (rfi != null ? f.sc.findings[+rfi].key : '')); }
  else if (a === 'replyCopy') copyText(replyText(f, ''), 'Ответ игроку', 'Скопируйте текст и вставьте его игроку.', 'Ответ скопирован. Вставьте его игроку.');
  else if (a === 'exphtml') exportReport(f, 'html');
  else if (a === 'exppdf') exportReport(f, 'pdf');
  else if (a === 'nav') navProblem(+t.getAttribute('data-dir'));
  else if (a === 'mark') { if (S.sel >= 0) { var ei2 = f.parsed.lineEntry[S.sel], st2 = ei2 >= 0 ? f.parsed.entries[ei2].i : S.sel, mi = f.marks.indexOf(st2); if (mi >= 0) f.marks.splice(mi, 1); else f.marks.push(st2); drawMarks(); drawRows(); drawInspector(f); } }
  else if (a === 'ruleNew') { var ru = t.getAttribute('data-ui'); openRuleForm(f, ru != null && f ? f.sc.unknown[+ru].sample : '', null); }
  else if (a === 'ruleLine') { var rl = f.parsed.entries[f.parsed.lineEntry[+t.getAttribute('data-line')]]; openRuleForm(f, rl ? rl.text.split(' ⏎ ')[0] : '', null); }
  else if (a === 'ruleEdit') { var re0 = S.kb.custom.find(function (x) { return String(x.id) === t.getAttribute('data-id'); }); if (re0) openRuleForm(f, '', re0); }
  else if (a === 'ruleDel') { S.kb.custom = S.kb.custom.filter(function (x) { return String(x.id) !== t.getAttribute('data-id'); }); saveKB(); applyRules(); rescanAll(); render(); if ($('#srulesHost')) openSettings(); status('Правило удалено.'); }
  else if (a === 'ruleSave') saveRule(t.getAttribute('data-id'));
  else if (a === 'rulePreview') { $('#rfErr').style.color = 'var(--muted)'; $('#rfErr').textContent = previewText(rulePreview()); }
  else if (a === 'histCopy') copyText(historyText(), 'История');
  else if (a === 'histDel') { var hk = t.getAttribute('data-key'); delete S.kb.hist[hk]; delete S.kb.tags[hk]; saveKB(); render(); }
  else if (a === 'statsCopy') copyText(statsText(), 'Сводка');
  else if (a === 'plLoad') { loadFound([S.found[+t.getAttribute('data-i')]]); }
  else if (a === 'plAll') { loadFound(S.found.slice(0, 40), true); }
  else if (a === 'plLatest') { var lm = S.found.find(function (x) { return !/client/i.test(x.name); }), lc = S.found.find(function (x) { return /client/i.test(x.name); }); loadFound([lm, lc].filter(Boolean)); }
  else if (a === 'plOpen') { try { window.nativeApp.openPath(S.found[0].path); } catch (e) {} }
  else if (a === 'updFile') { window.nativeApp.updateFromFile().then(function (r) { if (r && $('#updMsg')) $('#updMsg').textContent = r.msg || ''; }); }
  else if (a === 'updReset') { window.nativeApp.updateReset().then(function (r) { if (r && $('#updMsg')) $('#updMsg').textContent = r.msg || ''; }); }
  else if (a === 'updUrl') { window.nativeApp.updateCheck($('#updUrl').value.trim()).then(function (r) { $('#updMsg').textContent = r ? r.msg : ''; }); }
  else if (a === 'cp') copyText(aiPrompt(f, null), 'Вопрос для Claude', 'Скопируйте этот текст и вставьте в чат с Claude.');
  else if (a === 'cpf') copyText(aiPromptFinding(f, f.sc.findings[+t.getAttribute('data-fi')]), 'Вопрос для Claude', 'Скопируйте этот текст и вставьте в чат с Claude.');
  else if (a === 'cpu') copyText(aiPrompt(f, f.sc.unknown[+t.getAttribute('data-ui')]), 'Вопрос для Claude', 'Скопируйте этот текст и вставьте в чат с Claude.');
  else if (a === 'ai' || a === 'diagRun') runDiag(f, true);
  else if (a === 'sysAdd') $('#sysIn').click();
  else if (a === 'helpAsk') copyText(PLAYER_ASK, 'Сообщение игроку', 'Текст выделен, нажмите Ctrl+C.', 'Сообщение для игрока скопировано. Команду для журнала Windows копирует соседняя кнопка.');
  else if (a === 'sysCopy') copyText(sysText(sf), 'Сводка по дампу и журналу', 'Скопируйте сводку.', 'Сводка скопирована.');
  else if (a === 'sysClear') { sf.sys = null; LS.setSys(sf); drawSys(sf); status('Данные дампа и журнала убраны из этого лога.'); }
  else if (a === 'sysAiRun') runSysDiag(sf, !!(sf.sys && sf.sys.diag));
  else if (a === 'sysAiCopy') { if (sf.sys && sf.sys.diag) copyText(diagText(sf, sf.sys.diag), 'Диагноз', 'Скопируйте диагноз.', 'Диагноз скопирован.'); }
  else if (a === 'diagCopy') { if (f.diag) copyText(diagText(f), 'Диагноз', 'Скопируйте диагноз.', 'Диагноз скопирован.'); }
  else if (a === 'aif') { var gi2 = +t.getAttribute('data-fi'), gg = f.sc.findings[gi2], bf = $('#aif-' + gi2); runAI(aiPromptFinding(f, gg), bf, t, function (txt) { bf._txt = txt; bf.insertAdjacentHTML('beforeend', '<p class="hint" style="margin:6px 0 0">Это предложение нейросети, а не из руководства. Проверьте перед отправкой игроку.</p><div class="row-actions" style="margin-top:6px"><button class="btn sm" data-act="aifsave" data-fi="' + gi2 + '">Сохранить в мою заметку к этому случаю</button></div>'); }); }
  else if (a === 'aifsave') { var gi3 = +t.getAttribute('data-fi'), g3 = f.sc.findings[gi3], b3 = $('#aif-' + gi3), old3 = S.kb.ruleNotes[g3.key]; S.kb.ruleNotes[g3.key] = (old3 ? old3 + '\n\n' : '') + 'Решение (предложено нейросетью):\n' + (b3._txt || ''); saveKB(); status('Решение сохранено в заметку к случаю: «' + g3.title.slice(0, 50) + '».'); render(); }
  else if (a === 'aiu') { var ui = +t.getAttribute('data-ui'), uu = f.sc.unknown[ui], bx = $('#aiu-' + ui); runAI(aiPrompt(f, uu), bx, t, function (txt) { bx.insertAdjacentHTML('beforeend', '<div class="row-actions" style="margin-top:6px"><button class="btn sm" data-act="aisave" data-ui="' + ui + '">Сохранить как мою заметку</button></div>'); bx._txt = txt; }); }
  else if (a === 'aisave') { var ui2 = +t.getAttribute('data-ui'); var bx2 = $('#aiu-' + ui2); ensureRec(f.sc.kind, f.sc.unknown[ui2]).note = bx2._txt || ''; saveKB(); applyAll(); status('Ответ сохранён в базу знаний как заметка к этой строке.'); render(); }
  else if (a === 'label') { var u = f.sc.unknown[+t.getAttribute('data-ui')]; ensureRec(f.sc.kind, u).label = t.getAttribute('data-val'); saveKB(); applyAll(); render(); }
  else if (a === 'dxfb') { if (f && !f.sample) setFb(f, t.getAttribute('data-v')); }
  else if (a === 'fbExport') exportFb();
  else if (a === 'kbExport') exportKB();
  else if (a === 'kbImport') $('#kbIn').click();
  else if (a === 'kbReset') { if (t.dataset.sure) { S.kb = LA.newKB(); saveKB(); applyAll(); render(); status('База знаний очищена.'); } else { t.dataset.sure = '1'; t.textContent = 'Точно сбросить? Нажмите ещё раз'; } }
  else if (a === 'panelCopy') { var ta = $('#panelTa'); try { var rk = S.replyOnly ? (S.replyOnly === 'mods' ? 'mods-outside' : S.replyOnly) : mainKey(f), dflt = replyText(f, S.replyOnly); if (rk && ta.value.trim() && ta.value.trim() !== dflt.trim()) pushShared('reply', rk, ta.value.trim()); } catch (e) {} ta.select(); if (window.nativeApp) { try { window.nativeApp.copy(ta.value); status('Скопировано в буфер обмена.'); return; } catch (e) {} } try { navigator.clipboard.writeText(ta.value).then(function () { status('Скопировано в буфер обмена.'); }, function () {}); } catch (e) {} }
  else if (a === 'noop') { if (ev.target !== t) return; }
  else if (a === 'ldOk') { ldSaveTag(); $('#panelHost').innerHTML = ''; if (S.ld && S.ld.ids.length) { var lf = S.files.find(function (x) { return x.id === S.ld.ids[S.ld.ids.length - 1]; }); if (lf) S.active = lf.id; } var cmpF = null; if (S.ld && S.ld.ids.length) { var nf = S.files.find(function (x) { return x.id === S.ld.ids[S.ld.ids.length - 1]; }); if (nf) cmpF = nf; } S.ld = null; var pvf = cmpF && openCmpFor(cmpF); render(); if (pvf) status('Открыто сравнение с предыдущим логом этого тикета: ' + pvf.label); }
  else if (a === 'ldDrop') { var did = +t.getAttribute('data-id'), df = S.files.find(function (x) { return x.id === did; }); if (df) { LS.del(df.hash); delete S.kb.hist[df.hash]; delete S.kb.tags[df.hash]; S.files = S.files.filter(function (x) { return x.id !== did; }); if (S.active === did) S.active = S.files.length ? S.files[0].id : null; saveKB(); } var row = t.closest('.ld'); if (row) row.remove(); if (S.ld) S.ld.ids = S.ld.ids.filter(function (x) { return x !== did; }); status('Лог убран из приложения и истории.'); render(); }
  else if (a === 'repOpen') { ldSaveTag(); $('#panelHost').innerHTML = ''; S.tab = 'rep'; render(); }
  else if (a === 'repCopy') copyText(reportText(reports()[+t.getAttribute('data-i')]), 'Отчёт о повторяющейся проблеме', 'Скопируйте отчёт и вставьте его в сообщение или тикет.', 'Отчёт скопирован.');
  else if (a === 'repCsv') { var rc = reports()[+t.getAttribute('data-i')]; saveText('otchet-' + fmtDT(rc.start).slice(0, 10) + '.csv', repCsv(rc)); }
  else if (a === 'repHtml') { var rh = reports()[+t.getAttribute('data-i')]; saveText('otchet-' + fmtDT(rh.start).slice(0, 10) + '.html', repHtml(rh)); }
  else if (a === 'keyBind') { S.bind = t.getAttribute('data-k'); openSettings(); ev.stopPropagation(); }
  else if (a === 'keyClear') { (S.kb.settings.keys = S.kb.settings.keys || {})[t.getAttribute('data-k')] = ''; saveKB(); openSettings(); ev.stopPropagation(); }
  else if (a === 'keyReset') { S.kb.settings.keys = {}; saveKB(); openSettings(); }
  else if (a === 'massOpen') { $('#panelHost').innerHTML = ''; S.tab = 'mass'; render(); }
  else if (a === 'massCopy') copyText(massText(), 'Массовые проблемы', 'Скопируйте и отправьте команде.', 'Скопировано.');
  else if (a === 'massRefresh') { fetchMass(false); }
  else if (a === 'sampleOff') { setSamples(true); $('#panelHost').innerHTML = ''; status('Тестовые логи отключены. Вернуть их можно в «Настройках».'); }
  else if (a === 'sampleKeep') { $('#panelHost').innerHTML = ''; }
  else if (a === 'voteReply') { var vk = t.getAttribute('data-key'), vat = +t.getAttribute('data-at'), vit = (S.shared.replies[vk] || []).find(function (x) { return x.at === vat; }), von = !(vit && (vit.votes || []).indexOf(S.me) >= 0); if (vit) { vit.votes = (vit.votes || []).filter(function (n) { return n !== S.me; }); if (von) vit.votes.push(S.me); render(); srv('/v1/shared/vote', { body: { key: vk, at: vat, on: von } }).then(function () { fetchShared(); }); } }
  else if (a === 'panelDiscord') { copyText(discordFmt($('#panelTa').value), 'Ответ игроку', 'Отправьте ответ игроку.', 'Скопировано для Discord.'); }
  else if (a === 'panelPlain') { copyText(plainFmt($('#panelTa').value), 'Ответ игроку', 'Отправьте ответ игроку.', 'Скопировано простым текстом.'); }
  else if (a === 'tplSave') { var tn = $('#tplName').value.trim(), tx = $('#panelTa').value.trim(); if (!tn || !tx) { status('Введите название и текст шаблона.'); return; } var mt = myTpls(), ex = mt.findIndex(function (x) { return x.n === tn; }); if (ex >= 0) mt[ex].t = tx; else mt.push({ n: tn, t: tx }); saveKB(); status('Шаблон «' + tn + '» сохранён.'); }
  else if (a === 'tplDel') { var sel = document.querySelector('[data-act=tplPick]'), v = sel && sel.value; if (v && v[0] === 'u') { myTpls().splice(+v.slice(1), 1); saveKB(); var f2 = active(); if (f2) openReply(f2, S.replyOnly); status('Шаблон удалён.'); } else status('Выберите свой шаблон в списке.'); }
  else if (a === 'solveOpen') openSolve();
  else if (a === 'solveSave') solveFinish(true);
  else if (a === 'solveSkip') solveFinish(false);
  else if (a === 'useReply') { var ur = (S.shared.replies[mainKey(f)] || []).find(function (x) { return String(x.at) === t.getAttribute('data-at'); }); if (ur) { S.replyOnly = ''; openReply(f, ''); $('#panelTa').value = ur.text; } }
  else if (a === 'teamWeekCopy') copyText(teamWeekText(), 'Недельная сводка', 'Скопируйте и отправьте команде.', 'Скопировано.');
  else if (a === 'teamWeekPdf') { var th = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Недельная сводка</title><style>body{font:15px/1.6 system-ui,Segoe UI,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#0c1420}pre{white-space:pre-wrap;background:#eef1f5;padding:14px;border-radius:6px}</style></head><body><pre>' + esc(teamWeekText()) + '</pre></body></html>'; window.nativeApp.pdf('nedelya-komandy-' + isoDay(new Date()) + '.pdf', th).then(function (pr) { if (pr) status('PDF сохранён: ' + pr); }); }
  else if (a === 'bkNow') { backupMaybe(true).then(function (okb) { status(okb ? 'Копия базы знаний сохранена на сервере.' : 'Не удалось сохранить копию.'); }); }
  else if (a === 'bkRestore') { restoreBackup(); }
  else if (a === 'zoom') { stepZoom(+t.getAttribute('data-v')); }
  else if (a === 'lsClear') { LS.clear().then(function () { status('Сохранённые логи удалены. Логи в текущем списке останутся до закрытия приложения.'); }); }
  else if (a === 'askCopy') copyText(askText(f), 'Сообщение игроку', 'Отправьте это игроку.', 'Скопировано.');
  else if (a === 'newsOk') { S.kb.settings.newsSeen = (S.kb.settings.newsSeen || []).concat(S.newsFresh || []).slice(-60); saveKB(); $('#panelHost').innerHTML = ''; }
  else if (a === 'weekPdf') { exportWeekPdf(); }
  else if (a === 'preset') { applyPreset(+t.getAttribute('data-i')); }
  else if (a === 'presetDel') { (S.kb.settings.presets || []).splice(+t.getAttribute('data-i'), 1); saveKB(); renderAll(); ev.stopPropagation(); }
  else if (a === 'presetSave') { savePreset(); }
  else if (a === 'fl') { var fk = t.getAttribute('data-v'); S.allFlt[fk] = !S.allFlt[fk]; renderAll(); }
  else if (a === 'allF') { S.allF = t.getAttribute('data-v'); renderAll(); }
  else if (a === 'sjump') { S.active = +t.getAttribute('data-id'); S.tab = 'log'; S.sel = -1; render(); jump(+t.getAttribute('data-line')); }
  else if (a === 'ruleTeam') { var rt = S.kb.custom.find(function (x) { return String(x.id) === t.getAttribute('data-id'); }); if (rt) copyText(JSON.stringify({ id: 'r' + String(rt.id), kind: rt.kind, pattern: rt.pattern, title: rt.title, sev: rt.sev, cause: rt.cause, fix: rt.fix }, null, 2), 'Правило для команды', 'Добавьте этот блок в массив rules файла rules.json в репозитории проекта (или отправьте его администратору). После публикации правило появится у всех при запуске.'); }
  else if (a === 'weekCopy') copyText(weekText(), 'Недельный отчёт', 'Скопируйте отчёт и вставьте его в сообщение.', 'Отчёт скопирован.');
  else if (a === 'weekHtml') saveText('nedelya-' + fmtDT(Date.now()).slice(0, 10) + '.html', weekHtml());
  else if (a === 'newFolder') newFolder();
  else if (a === 'sideToggle') toggleSide();
  else if (a === 'gdel') deleteFolder(t.getAttribute('data-id'));
  else if (a === 'gsub') newFolder(t.getAttribute('data-id'));
  else if (a === 'gopen') { if (ev.target.closest('#gName')) return; if (ev.detail > 1 && t.classList.contains('folder')) return; toggleFolder(t.getAttribute('data-id')); }
  else if (a === 'gcase') openCaseTab(t.getAttribute('data-id'));
  else if (a === 'cjump') { var cf = +t.getAttribute('data-fid'); if (S.files.some(function (x) { return x.id === cf; })) { S.active = cf; jump(+t.getAttribute('data-line')); } }
  else if (a === 'caseexp') { var cx = caseData(); if (cx) exportHtmlDoc('delo-' + cx.fo.name.replace(/[^\w.\-а-яё]+/gi, '_').slice(0, 40), caseHtml(cx), 'html'); }
  else if (a === 'coutcome') setOutcome(t.getAttribute('data-gid'), t.getAttribute('data-res'));
  else if (a === 'copen') { S.active = +t.getAttribute('data-fid'); S.tab = 'diag'; S.sel = -1; render(); }
  else if (a === 'cmpCase') compareCases(t.getAttribute('data-a'), t.getAttribute('data-b'));
  else if (a === 'caseReply') { var cr = caseData(); if (cr) copyText(caseReplyText(cr), 'Ответ игроку', 'Скопируйте и отправьте игроку.', 'Ответ игроку скопирован.'); }
  else if (a === 'caseask') { var ck = caseData(); if (ck) copyText(caseAskText(ck), 'Сообщение игроку', 'Скопируйте и отправьте игроку.', 'Сообщение игроку скопировано.'); }
  else if (a === 'addLogs') $('#fileIn').click();
  else if (a === 'gadd') { S.gAdd = t.getAttribute('data-id'); $('#fileInG').click(); }
  else if (a === 'grename') { S.renaming = t.getAttribute('data-id'); renderList(); }
  else if (a === 'gsave') saveFolderName(t.getAttribute('data-id'));
  else if (a === 'geject') { var ef = S.files.find(function (x) { return x.id === +t.getAttribute('data-id'); }); if (ef) ejectFile(ef); ev.stopPropagation(); }
  else if (a === 'pin') { togglePin(+t.getAttribute('data-id')); ev.stopPropagation(); }
  else if (a === 'allSort') { S.allSort = t.getAttribute('data-v'); renderAll(); }
  else if (a === 'allCsv') saveText('vse-logi.csv', allCsv());
  else if (a === 'openDiag') { S.active = +t.getAttribute('data-id'); S.tab = 'diag'; S.sel = -1; render(); }
  else if (a === 'teamRefresh') loadTeam(true);
  else if (a === 'teamExport') copyText(JSON.stringify({ v: 1, rules: S.kb.custom.map(function (r) { return { id: String(r.id), kind: r.kind, pattern: r.pattern, title: r.title, sev: r.sev, cause: r.cause, fix: r.fix }; }) }, null, 2), 'Мои правила для команды', 'Добавьте эти правила в файл rules.json в репозитории проекта. После этого они появятся у всех при запуске.');
  else if (a === 'watchDl') { window.nativeApp.watchSet('downloads').then(function (r) { status(r && r.dir ? 'Слежу за папкой: ' + r.dir : 'Не удалось включить.'); openWatch(); }); }
  else if (a === 'watchPick') { window.nativeApp.watchSet('pick').then(function (r) { if (r && r.dir) status('Слежу за папкой: ' + r.dir); openWatch(); }); }
  else if (a === 'watchOff') { window.nativeApp.watchSet(null).then(function () { status('Автозагрузка выключена.'); openWatch(); }); }
  else if (a === 'urlGo') loadUrl($('#urlIn').value);
  else if (a === 'arcToggle') { S.kb.settings.arcOpen = S.kb.settings.arcOpen === false; saveKB(); renderList(); }
  else if (a === 'closePanel') { if (t.classList.contains('panel') && ev.target !== t) return; $('#panelHost').innerHTML = ''; }
});
document.addEventListener('keydown', function (ev) {
  if (S.bind) { ev.preventDefault(); ev.stopPropagation(); keyBindKey(ev); return; }
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && ev.code === 'KeyK') { ev.preventDefault(); openPalette(); return; }
  if (ev.target && ev.target.id === 'palQ') {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); PAL.sel = Math.min((PAL.shown || []).length - 1, PAL.sel + 1); palRender(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); PAL.sel = Math.max(0, PAL.sel - 1); palRender(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); palRun(PAL.sel); }
    else if (ev.key === 'Escape') $('#panelHost').innerHTML = '';
    return;
  }
  if (ev.target && ev.target.id === 'gName') { if (ev.key === 'Enter') { ev.preventDefault(); saveFolderName(S.renaming); } else if (ev.key === 'Escape') { S.renaming = null; renderList(); } return; }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.fi')) { ev.preventDefault(); ev.target.click(); }
  if (ev.key === 'Escape') $('#panelHost').innerHTML = '';
  if ((ev.ctrlKey || ev.metaKey) && S.tab === 'log' && !ev.altKey) { var zk = ev.key; if (zk === '+' || zk === '=' || ev.code === 'NumpadAdd') { ev.preventDefault(); stepZoom(1); return; } if (zk === '-' || ev.code === 'NumpadSubtract') { ev.preventDefault(); stepZoom(-1); return; } if (zk === '0' || ev.code === 'Numpad0') { ev.preventDefault(); stepZoom(0); return; } }
  if (ev.target && ev.target.id === 'sc' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); stepSel(ev.key === 'ArrowDown' ? 1 : -1); return; }
  var tg = ev.target.tagName; if (ev.ctrlKey || ev.metaKey || ev.altKey || tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
  var K = keyMap(), act = Object.keys(K).find(function (k) { return K[k] === ev.code; }); if (!act) return;
  if (act === 'nextProb' || act === 'prevProb') { if (S.tab === 'log') navProblem(act === 'nextProb' ? 1 : -1); }
  else if (act === 'nextLog') { ev.preventDefault(); stepFile(1); } else if (act === 'prevLog') { ev.preventDefault(); stepFile(-1); }
  else if (act === 'pin' && S.active) { togglePin(S.active); }
  else if (act === 'copy' && S.active && !String(window.getSelection && window.getSelection())) { var cf = active(); if (cf) copyCurrentReply(cf); }
});
document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'palQ') { PAL.sel = 0; palRender(); } });
document.addEventListener('change', function (ev) {
  var t = ev.target, a = t.getAttribute && t.getAttribute('data-act'), f = active();
  if (a === 'rnote') { var key = t.getAttribute('data-key'); if (t.value.trim()) S.kb.ruleNotes[key] = t.value; else delete S.kb.ruleNotes[key]; saveKB(); pushShared('note', key, t.value.trim()); }
  else if (a === 'unote') { var u = f.sc.unknown[+t.getAttribute('data-ui')]; ensureRec(f.sc.kind, u).note = t.value; saveKB(); }
  else if (a === 'knote') { var r = S.kb.sigs[t.getAttribute('data-key')]; if (r) { r.note = t.value; saveKB(); } }
  else if (t.id === 'patProb') { S.patProb = t.checked; var pf2 = active(); if (pf2) drawPatterns(pf2); }
  else if (t.id === 'ctxBox') { S.ctx = t.checked; refreshLog(true); }
  else if (t.id === 'wrapBox') { S.kb.settings.logWrap = t.checked; saveKB(); var wf = active(), wsc = $('#sc'); if (wsc && wf && wf.view) { var keepLn = wf.view[rowAt(wf, wsc.scrollTop)]; wsc.classList.toggle('wrap', t.checked); calcPre(wf); $('#sp').style.height = totalH(wf) + 'px'; var wp = wf.view.indexOf(keepLn); wsc.scrollTop = offs(wf, Math.max(0, wp)); drawRows(); } }
  else if (a === 'tstatus') { var sf = S.files.find(function (x) { return x.id === +t.getAttribute('data-id'); }); if (sf) { if (t.value === 'new') delete S.kb.status[sf.hash]; else S.kb.status[sf.hash] = t.value; saveKB(); ticketPush(sf); if (S.tab === 'all') renderAll(); } }
  else if (t.id === 'repMin' || t.id === 'repHours') { var v = parseInt(t.value, 10); if (t.id === 'repMin') S.kb.settings.repMin = Math.min(50, Math.max(2, v || 3)); else S.kb.settings.repHours = Math.min(168, Math.max(1, v || 6)); saveKB(); renderTabs(); renderReports(); }
  else if (t.getAttribute && t.getAttribute('data-act') === 'rfcopy') { var cr = LA.RULES[+t.value]; if (cr) { $('#rfTitle').value = cr.title || ''; $('#rfCause').value = cr.cause || ''; $('#rfFix').value = (cr.fix || []).join('\n'); $('#rfSev').value = cr.sev === 'noise' ? 'info' : cr.sev; $('#rfKind').value = cr.kind; } }
  else if (t.getAttribute && t.getAttribute('data-act') === 'cnote') { var cn = S.kb.settings.caseNotes = S.kb.settings.caseNotes || {}; if (t.value.trim()) cn[t.getAttribute('data-gid')] = t.value; else delete cn[t.getAttribute('data-gid')]; saveKB(); }
  else if (t.getAttribute && t.getAttribute('data-act') === 'cstatus') setCaseStatus(t.getAttribute('data-gid'), t.value);
  else if (t.getAttribute && t.getAttribute('data-act') === 'caseck') { var cs = S.kb.settings.caseChecks = S.kb.settings.caseChecks || {}, gm = cs[t.getAttribute('data-gid')] = cs[t.getAttribute('data-gid')] || {}; if (t.checked) gm[t.getAttribute('data-id')] = 1; else delete gm[t.getAttribute('data-id')]; saveKB();  var cdx = caseData(), cpv = $('#caseReplyPv'); if (cdx && cpv) cpv.textContent = caseReplyText(cdx); }
  else if (t.id === 'sysIn') { ingestSys(Array.prototype.slice.call(t.files), []); t.value = ''; }
  else if (t.id === 'fileIn') { readFiles(t.files); t.value = ''; }
  else if (t.id === 'fileInG') { S.target = S.gAdd; readFiles(t.files); t.value = ''; }
  else if (t.id === 'kbIn') { Array.prototype.slice.call(t.files).forEach(function (fl) { fl.text().then(importKB); }); t.value = ''; }
  else if (t.id === 'dirIn') { readFiles(t.files, true); t.value = ''; }
  else if (t.id === 'lvlSel') { S.lvl = +t.value; refreshLog(true); }
  else if (t.id === 'cmpA') { S.cmpA = +t.value; renderCompare(); }
  else if (t.id === 'cmpB') { S.cmpB = +t.value; renderCompare(); }
  else if (t.id === 'histSel') { S.histTag = t.value; renderHistory(); }
  else if (a === 'tag') { var tg = t.value.trim(); if (tg) S.kb.tags[f.hash] = tg; else delete S.kb.tags[f.hash]; if (!f.sample) recordHist(f); saveKB(); if (tg) { ticketPush(f); ticketLookup(f, false); } renderTabs(); renderList(); var pv2 = tg && prevSameTag(f); if (pv2) { S.cmpA = pv2.id; S.cmpB = f.id; status('Есть предыдущий лог этого тикета: ' + pv2.label + '. Откройте вкладку «Сравнение», чтобы увидеть, что изменилось.'); } }
});
document.addEventListener('input', function (ev) {
  var t = ev.target;
  if (t.id === 'patQ') { S.patQ = t.value; var pf = active(); if (pf) { drawPatterns(pf); var pq2 = $('#patQ'); if (pq2) { pq2.focus(); pq2.setSelectionRange(pq2.value.length, pq2.value.length); } } }
  if (t.id === 'logQ') { S.q = t.value; refreshLog(true); drawSavedQ(); }
  else if (t.id === 'rpHello' || t.id === 'rpBye') { var rf = active(); if (rf) fillReply(rf); }
  else if (t.id === 'allQ') { S.allQ = t.value; drawSearch(); }
  else if (t.id === 'massDay' || t.id === 'massWeek') { var nv = Math.max(2, parseInt(t.value, 10) || 0); S.kb.settings[t.id] = nv; saveKB(); if (S.mass) { renderTabs(); if (S.tab === 'mass') renderMass(); } }
  else if (t.id === 'shareBox') { S.kb.settings.shareLogs = !!t.checked; saveKB(); }
  else if (t.id === 'keepBox') { S.kb.settings.keepLogs = !!t.checked; saveKB(); if (t.checked) S.files.forEach(function (f) { LS.save(f); }); else LS.clear(); }
  else if (t.id === 'uiScale') { S.kb.settings.uiScale = +t.value; saveKB(); applyView(); }
  else if (t.id === 'density') { S.kb.settings.density = t.value; saveKB(); applyView(); }
  else if (t.id === 'sampleBox') { setSamples(!t.checked); }
  else if (t.id === 'aiAutoBox') { S.kb.settings.aiAuto = !!t.checked; saveKB(); }
  else if (t.getAttribute && t.getAttribute('data-act') === 'tplPick') { var pf = active(), pv2 = t.value; if (pf) { if (!pv2) fillReply(pf); else { var src = pv2[0] === 'b' ? QTPL[+pv2.slice(1)] : myTpls()[+pv2.slice(1)]; if (src) $('#panelTa').value = M(expandTpl(src.t, pf)); } } }
  else if (t.getAttribute && t.getAttribute('data-act') === 'rstyle') { var f = active(), rs = RSTYLES[t.value] || RSTYLES.std, st9 = S.kb.settings; st9.replyStyle = t.value; st9.hello = rs.hello; st9.bye = rs.bye; st9.replyShort = rs.short; saveKB(); if ($('#rpHello')) { $('#rpHello').value = rs.hello; $('#rpBye').value = rs.bye; } if ($('#panelTa') && f) fillReply(f); var pv9 = $('#replyPv'); if (pv9 && f) pv9.textContent = replyText(f, ''); }
  else if (t.id === 'autoUpd') { S.kb.settings.autoUpdate = !!t.checked; saveKB(); var aa = $('#autoApply'); if (aa) aa.disabled = !t.checked; }
  else if (t.id === 'autoApply') { S.kb.settings.autoApply = !!t.checked; saveKB(); if (!t.checked) clearInterval(aaTimer); else if (S.pendingUpd) aaWatch(S.pendingUpd, false); }
});
$('#btnAdd').addEventListener('click', function () { $('#fileIn').click(); });
$('#btnDir').addEventListener('click', function () { $('#dirIn').click(); });
$('#btnDump').addEventListener('click', openSysOnly);
var PLAYER_ASK = 'Здравствуйте! Чтобы разобраться с вылетом, пришлите, пожалуйста:\n1) Файл client.log: папка с игрой, затем logs (или launcher.log из папки лаунчера). Лучше сразу после вылета, до перезапуска игры.\n2) Если игра закрылась без ошибки, зайдите в папку с игрой, затем crashdumps (или CrashDumps) и пришлите самый свежий файл .dmp. Если файл большой, заархивируйте в zip.\nПишите время вылета и что делали в этот момент.';
function openHelp() {
  var sec = function (h, items) { return '<div><h4 style="margin:6px 0 4px">' + h + '</h4><ul style="margin:0;padding-left:20px;display:grid;gap:5px">' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>'; };
  $('#panelHost').innerHTML = '<div class="panel" data-act="closePanel"><div class="box" role="dialog" aria-label="Инструкция"><b>Как пользоваться</b>' +
    sec('Лог', ['Перетащите <code>client.log</code>, <code>launcher.log</code>, <code>main.log</code>, zip с логами или целую папку в окно. Можно сразу несколько файлов.', '«Диагноз» называет причину и сразу даёт готовый ответ игроку (кнопка «Копировать ответ» или клавиша R). «Лог» показывает сами строки, «Дело» собирает все логи одного игрока вместе.', 'Строка в логе кликается: справа появится объяснение. Выделенные строки копируются Ctrl+C.']) +
    sec('Дамп краша и журнал Windows', ['Под диагнозом есть строка «Дамп краша и журнал Windows». Добавьте туда <code>.dmp</code>, <code>.evtx</code> или zip краш-отчёта.', 'Дамп показывает модуль, где упал клиент, и код исключения. Журнал показывает синие экраны, сбои драйвера видеокарты, диска и памяти в те же минуты.', 'Если лога нет, нажмите «Только дамп» в меню «Ещё».', 'Кнопка «Разобрать с ИИ» отправляет короткую сводку (несколько строк), а не весь файл.']) +
    sec('Discord (плагин MajesticLogImport)', ['У логов и скриншотов игрока в тикете — кнопка «Разбор»: окно с причиной, как чинить, ключевыми строками и готовым ответом игроку. Ответ можно поправить и вставить в чат одной кнопкой.', '<b>Ctrl+Shift+L</b> в открытой ветке тикета — разбор последнего лога игрока без поиска файла.', 'Значки рядом с логами («МОД», «Сеть игрока», «старый»…) — итог разбора ещё до клика. Окно предупредит, если лог старый или не хватает client.log, и подставит вежливую просьбу.', 'Скриншоты: чёрные полосы по краям находятся сразу, текст ошибки на экране читает ИИ и сверяет с правилами анализатора.', '«Передать дальше» вставляет в чат сводку для старших: причина, что уже предложено, ключевые строки.', 'Шаблоны команды: окно предлагает подходящий шаблон по тексту игрока, скриншоту и логу; кнопка «Анализировать» под описанием проблемы от бота (или Ctrl+Shift+L). Отмечайте «Подходит / Не подходит» и добавляйте «+ фразу» — так подбор становится точнее у всей команды. В окне: Enter — вставить выбранный шаблон, Alt+1…3 — по номеру, ↑↓ — выбор.', 'В текстах шаблонов можно писать {ник}, {статик}, {сервер}, {файл}, {моды}, {код} — подставятся сами.']) +
    sec('Папки (дела)', ['Бросьте лог на другой лог: оба окажутся в новой папке. Бросьте лог на плитку папки: он добавится в неё.', 'У дела есть статус, итог и таймер ожидания игрока. Логи с одним номером тикета собираются в папку сами.']) +
    sec('Горячие клавиши', ['? показывает все клавиши, Ctrl+K открывает список команд, / — поиск по логу, 1–9 — вкладки. Свои клавиши назначаются в «Настройках».']) +
    '<div><h4 style="margin:6px 0 4px">Что попросить у игрока</h4><p class="hint" style="margin:0 0 6px">Готовое сообщение.</p><textarea readonly style="height:150px" id="askTxt">' + esc(PLAYER_ASK) + '</textarea></div>' +
    '<div class="row-actions"><button class="btn sm primary" data-act="helpAsk">Копировать сообщение</button><button class="btn sm ghost" data-act="closePanel">Закрыть</button></div></div></div>';
}
$('#btnHelp').addEventListener('click', openHelp);
$('#btnNew').addEventListener('click', showWhatsNew);
$('#btnSet').addEventListener('click', openSettings);
if (srvOn()) $('#btnBug').hidden = false;
/* неделя (до 18.10.2026) кнопка красная, чтобы её заметили; потом возвращается к обычному виду сама */
if (Date.now() < Date.parse('2026-10-18T23:59:59+05:00')) $('#btnBug').classList.add('bug-hot');
$('#btnBug').addEventListener('click', openBug);
/* Длинное название на карточке прокручивается вправо при наведении */
(function () {
  function go(nm) {
    var o = nm.scrollWidth - nm.clientWidth; if (o <= 2 || nm.classList.contains('run')) return;
    nm.classList.add('run'); nm.style.transition = 'text-indent ' + Math.max(.6, o / 45) + 's linear .25s'; nm.style.textIndent = -(o + 6) + 'px';
  }
  function stop(nm) { if (!nm.classList.contains('run')) return; nm.classList.remove('run'); nm.style.transition = 'text-indent .2s'; nm.style.textIndent = '0'; }
  document.addEventListener('mouseover', function (e) { var fi = e.target.closest && e.target.closest('.fi'); if (!fi || fi.contains(e.relatedTarget)) return; var nm = fi.querySelector('.nm'); if (nm) go(nm); });
  document.addEventListener('mouseout', function (e) { var fi = e.target.closest && e.target.closest('.fi'); if (!fi || fi.contains(e.relatedTarget)) return; var nm = fi.querySelector('.nm'); if (nm) stop(nm); });
})();
(function () {
  var mb = $('#btnMore'), mm = $('#moreMenu');
  function shut() { mm.hidden = true; mb.setAttribute('aria-expanded', 'false'); }
  mb.addEventListener('click', function (e) { e.stopPropagation(); mm.hidden = !mm.hidden; mb.setAttribute('aria-expanded', String(!mm.hidden)); });
  mm.addEventListener('click', function () { setTimeout(shut, 0); });
  document.addEventListener('click', function (e) { if (!mm.hidden && !e.target.closest('.more')) shut(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mm.hidden) shut(); });
})();
$('#btnTheme').addEventListener('click', function () { var o = ['auto', 'light', 'dark'], c = S.kb.settings.theme || 'auto'; S.kb.settings.theme = o[(o.indexOf(c) + 1) % 3]; saveKB(); applyTheme(S.kb.settings.theme); });
applyTheme(S.kb.settings.theme || 'auto'); applyView();
/* Настройка шапки: пункты меню «Ещё» можно перетаскивать на панель и обратно */
var BAR_IDS = ['btnHelp', 'btnNew', 'btnSet', 'btnUrl', 'btnWatch', 'btnLogs', 'btnUpd', 'btnDump', 'btnDir'], barDrag = null;
function applyBar() {
  var pins = (S.kb.settings.barPins || []).filter(function (x) { return BAR_IDS.indexOf(x) >= 0; }), acts = document.querySelector('.acts'), more = document.querySelector('.more'), mm = $('#moreMenu'), hint = $('#menuHint');
  BAR_IDS.forEach(function (id) { var b = $('#' + id); if (b) { b.draggable = true; if (pins.indexOf(id) < 0) { b.classList.add('mi'); b.classList.remove('pinned'); } } });
  pins.forEach(function (id) { var b = $('#' + id); if (!b) return; b.classList.remove('mi'); b.classList.add('pinned'); acts.insertBefore(b, more); });
  BAR_IDS.forEach(function (id) { if (pins.indexOf(id) < 0) { var b = $('#' + id); if (b) mm.insertBefore(b, hint); } });
}
function savePins() {
  var ids = Array.prototype.slice.call(document.querySelectorAll('.acts > .btn.pinned')).map(function (b) { return b.id; });
  S.kb.settings.barPins = ids; saveKB(); applyBar();
}
(function () {
  var acts = document.querySelector('.acts'), mm = $('#moreMenu'), mb = $('#btnMore'), opened = false;
  function clear() { barDrag = null; document.body.classList.remove('bardnd'); [acts, mm, mb].forEach(function (x) { x.classList.remove('dropok'); }); Array.prototype.forEach.call(acts.querySelectorAll('.pin-ins'), function (x) { x.classList.remove('pin-ins'); }); if (opened) { mm.hidden = true; mb.setAttribute('aria-expanded', 'false'); opened = false; } }
  document.addEventListener('dragstart', function (e) {
    var b = e.target.closest && e.target.closest('.acts .btn[draggable=true], #moreMenu .btn[draggable=true]'); if (!b || BAR_IDS.indexOf(b.id) < 0) return;
    barDrag = b.id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'bar:' + b.id); } catch (x) {}
    setTimeout(function () { document.body.classList.add('bardnd'); if (mm.hidden) { mm.hidden = false; opened = true; mb.setAttribute('aria-expanded', 'true'); } }, 0);
  });
  function over(e) {
    if (!barDrag) return; var inMenu = e.target.closest('#moreMenu') || e.target.closest('#btnMore'), inActs = !inMenu && e.target.closest('.acts');
    if (!inMenu && !inActs) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
    mm.classList.toggle('dropok', !!e.target.closest('#moreMenu')); mb.classList.toggle('dropok', !!e.target.closest('#btnMore')); acts.classList.toggle('dropok', !!inActs);
    Array.prototype.forEach.call(acts.querySelectorAll('.pin-ins'), function (x) { x.classList.remove('pin-ins'); });
    if (inActs) { var t = e.target.closest('.acts > .btn.pinned'); if (t && t.id !== barDrag) t.classList.add('pin-ins'); }
  }
  document.addEventListener('dragover', over);
  document.addEventListener('drop', function (e) {
    if (!barDrag) return; var inMenu = e.target.closest('#moreMenu') || e.target.closest('#btnMore'), inActs = !inMenu && e.target.closest('.acts'), b = $('#' + barDrag);
    if (!b || (!inMenu && !inActs)) { clear(); return; }
    e.preventDefault(); e.stopPropagation();
    if (inMenu) { b.classList.remove('pinned'); }
    else { var t = e.target.closest('.acts > .btn.pinned'); b.classList.add('pinned'); if (t && t !== b) acts.insertBefore(b, t); else if (!t) acts.insertBefore(b, document.querySelector('.more')); }
    savePins(); opened = true; clear();
  });
  document.addEventListener('dragend', clear);
})();
applyBar();
if (window.nativeApp) {
  if (window.nativeApp.fetchUrl) { $('#btnUrl').hidden = false; $('#btnUrl').addEventListener('click', openUrl); }
  if (window.nativeApp.watchSet) { $('#btnWatch').hidden = false; $('#btnWatch').addEventListener('click', openWatch); if (window.nativeApp.onWatch) window.nativeApp.onWatch(onWatch); }
  if (window.nativeApp.findLogs) { $('#btnLogs').hidden = false; $('#btnLogs').addEventListener('click', openLogsPanel); }
  if (window.nativeApp.updateInfo) { $('#btnUpd').hidden = false; $('#btnUpd').addEventListener('click', function () { var o = $('#upOv'); S.updDismiss = null; checkUpdates(true).then(function () { if (!$('#upOv')) openUpdate(); }); }); updatedNotice(); $('#updLine').addEventListener('click', function () { $('#btnUpd').click(); }); setTimeout(checkUpdates, 2000); setInterval(checkUpdates, 30 * 60 * 1000); setTimeout(fetchShared, 3000); setTimeout(backupMaybe, 25000); setInterval(backupMaybe, 6 * 3600000); setTimeout(pulse, 2500); setInterval(pulse, 40000); window.addEventListener('focus', function () { pulse(); }); }
}
var drop = $('#drop');
drop.addEventListener('click', function () { $('#fileIn').click(); });
['dragenter', 'dragover'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); if (!barDrag) drop.classList.add('over'); }); });
['dragleave', 'drop'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); if (n === 'drop' || e.target === document.documentElement) drop.classList.remove('over'); }); });
document.addEventListener('drop', function (e) {
  var dt = e.dataTransfer; if (!dt) return;
  var gtd = e.target.closest && e.target.closest('[data-gid]'); if (gtd && dt.files && dt.files.length) S.target = gtd.getAttribute('data-gid');
  var tlog = !gtd && !dragSrc && dt.files && dt.files.length && e.target.closest && e.target.closest('.flist > li[data-zone] > .fi[data-id]:not(.folder)'); if (tlog) S.mergeTarget = +tlog.getAttribute('data-id');
  var ents = []; if (dt.items) for (var i = 0; i < dt.items.length; i++) { var en = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry(); if (en) ents.push(en); }
  if (ents.some(function (x) { return x.isDirectory; })) { status('Читаю папку…'); walkEntries(ents).then(function (fl) { readFiles(fl, true); }); }
  else if (dt.files.length) readFiles(dt.files);
  else { var du = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').split(/\s+/)[0]; if (/^https:\/\//i.test(du) && window.nativeApp && window.nativeApp.fetchUrl) { status('Скачиваю по ссылке…'); loadUrl(du); } }
});
document.addEventListener('paste', function (e) {
  var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
  var cd = e.clipboardData; if (!cd) return;
  if (cd.files && cd.files.length) { readFiles(cd.files); return; }
  var tx = (cd.getData('text/plain') || '').trim(); if (/^https:\/\/\S+$/i.test(tx) && window.nativeApp && window.nativeApp.fetchUrl) { status('Скачиваю по ссылке…'); loadUrl(tx); }
});


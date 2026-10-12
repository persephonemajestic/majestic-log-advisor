/* ---------- Примеры ---------- */
var SAMPLE_MAIN = String.raw`[2026-07-29 12:55:00.100] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }
[2026-07-29 12:55:00.111] [info]  [ (patcher)           ] [patcher.stdout] [1;31m[11:43:01] MAJESTIC: Launcher patches failed: 5
[2026-07-29 12:55:00.112] [info]  [ (patcher)           ] [patcher.stdout] [11:43:01] MAJESTIC: GTAV ERROR: ERR_FAILED_TO_PATCH_LAUNCHER
[2026-07-29 12:55:00.113] [warn]  [ (game)              ] game launch failed {
  serverId: 'ru4',
  reason: 'launcher-busy',
  message: 'ERR_FAILED_TO_PATCH_LAUNCHER'
}
[2026-07-29 12:55:00.114] [debug] [ (ipc)               ] ipc game:play ok in 6120.0ms {}
[2026-07-29 12:56:15.001] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }
[2026-07-29 12:56:15.871] [warn]  [ (game)              ] game launch failed {
  serverId: 'ru4',
  reason: 'manifest-error',
  message: 'network-error: manifest fetch timed out: https://cdn.majestic-files.net/multiplayer/client/release/x64_win32/update.json'
}
[2026-07-29 12:58:00.001] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }
[2026-07-29 12:58:12.226] [warn]  [ (game)              ] game launch failed {
  serverId: 'ru7',
  reason: 'backup-drm-mismatch',
  message: '"steam_api64.dll" hash mismatch (expected 6c2ba02f69612492, got 4e837f8b990b8f18)'
}
[2026-07-29 13:01:00.001] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }
[2026-07-29 13:01:30.690] [info]  [ (patcher)           ] [patcher.stdout] [14:48:12] MAJESTIC: Detected OpenIV but not disabled (D:\GTAV\dinput8.dll)
[2026-07-29 13:01:51.660] [warn]  [ (game)              ] game launch failed {
  serverId: 'ru4',
  reason: 'patcher-error',
  message: 'ERR_GAME_CRASHED'
}
[2026-07-29 13:05:00.001] [info]  [ (game)              ] game.play: zombie process sweep { killedCount: 0, killed: [] }
[2026-07-29 13:05:20.100] [info]  [ (patcher)           ] patcher: pipeline completed { success: true, error: '' }
[2026-07-29 13:05:30.343] [debug] [ (crash)             ] crashService: -crash ping while game is alive — startup ping`;
var SAMPLE_CLIENT = String.raw`[18:58:35.840] Logger initialized
[18:58:35.840] MinHook initialized
[18:58:35.851] Connect URL: api.majestic-files.net:443/join/arbatsky
[18:58:35.852] Majestic Multiplayer build #1.23.3, branch release
[18:58:37.920] Game unpacked in 2010 ms
[18:58:37.920] Initing Majestic Multiplayer
[18:58:37.926] Initializing CGame
[18:58:38.588] =====================LOADED DLLS=====================
[18:58:38.588] D:\GTAV\GFSDK_ShadowLib.win64.dll
[18:58:38.589] C:\Users\player\AppData\Roaming\majestic-launcher\Multiplayer\majestic-client.dll
[18:58:38.590] =====================================================
[18:58:38.746][assets] [autoanim-null] Installed: CObject::PlayAutoStartAnim null-skeleton guard
[18:58:39.049] Game inited
[18:58:39.108] Majestic Multiplayer inited
[18:58:43.039][hooks] MINIDUMP: Temporary dump saved
[18:58:43.248][hooks] Last loaded asset:  
[18:58:43.248][hooks] Texture info:  
[18:58:43.248][hooks] Last deleted vehicle model 0x0
[18:58:43.248][hooks] Last pos: <no local player>
[18:58:43.248] Shutting down`;

S.mask = false; /* в интерфейсе ничего не прячем: маска мешала шаблонам (DNS и т.п.); на сервер логи по-прежнему уходят обезличенными */
var subEl = document.querySelector('#ver'); if (subEl) subEl.textContent = 'версия ' + APP_VERSION;
if (window.nativeApp && window.nativeApp.shellInfo) window.nativeApp.shellInfo().then(function (i) { if (!i || !i.hwid || !subEl) return; subEl.insertAdjacentHTML('beforeend', '<div style="margin-top:10px;font-family:var(--font)">Код компьютера<br><code id="hwidCode" style="user-select:all">' + esc(i.hwid) + '</code> <button class="btn sm ghost" id="hwidCopy" type="button">Копировать</button></div>'); var hb = document.getElementById('hwidCopy'); if (hb) hb.addEventListener('click', function () { try { window.nativeApp.copy(i.hwid); status('Код компьютера скопирован.'); } catch (e) {} }); }).catch(function () {});
S.kb.settings.launches = (S.kb.settings.launches || 0) + 1; saveKB();
(async function startFiles() {
  var restored = false;
  if (S.kb.settings.keepLogs !== false) { try { restored = await restoreLogs(); } catch (e) {} }
  try { aaResume(); } catch (e) {}
  if (!restored && !S.kb.settings.hideSamples) addTexts([{ name: 'пример-main.log', size: SAMPLE_MAIN.length, text: SAMPLE_MAIN, sample: true }, { name: 'пример-client.log', size: SAMPLE_CLIENT.length, text: SAMPLE_CLIENT, sample: true }]).then(function () { if (S.files.some(function (f) { return !f.sample; })) return; S.active = S.files[0] ? S.files[0].id : null; status('Показаны примеры. Добавьте свои логи, и примеры исчезнут.'); render(); });
})();
try { applySide(); } catch (e) {}
render();
checkAlerts();
loadTeam(false);
if (samplePromptDue()) { var spTry = 0, spT = setInterval(function () { spTry++; if (S.files.some(function (f) { return f.sample; }) || spTry > 8) { clearInterval(spT); if (samplePromptDue() && S.files.some(function (f) { return f.sample; })) popup('sample', 3, function () { if (samplePromptDue()) showSamplePrompt(); }); } }, 1500); }
if (srvOn()) { setTimeout(checkNews, 1500); setInterval(checkNews, 30 * 60 * 1000); setTimeout(fetchMass, 6000); setInterval(fetchMass, 30 * 60 * 1000); }
if (window.nativeApp && window.nativeApp.findLogs && !S.kb.settings.firstRun) { S.kb.settings.firstRun = 1; saveKB(); setTimeout(async function () { var fr = null; try { fr = await window.nativeApp.findLogs(); } catch (e) {} if (fr && fr.files && fr.files.length && !S.files.some(function (x) { return !x.sample; })) popup('logs', 5, function () { if (!S.files.some(function (x) { return !x.sample; })) openLogsPanel(); }); }, 4500); }
(function () { var st = S.kb.settings, fresh = !Object.keys(S.kb.hist).length && !Object.keys(S.kb.sigs).length; if (st.seenVer !== APP_VERSION) { st.seenVer = APP_VERSION; saveKB(); if (!fresh) setTimeout(showWhatsNew, 600); } })();

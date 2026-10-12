/* Разбор системных данных игрока: минидамп (.dmp) и журнал событий Windows.
   Работает и в браузере (глобальная SysDiag), и в Node (require). Без зависимостей.

   Дамп читается кусками (File.slice / fs): заголовок, каталог, потоки исключения, модулей, потоков,
   системы и 8 КБ стека потока-виновника. Полный дамп на гигабайты в память не грузится.
   Журнал событий: XML из wevtutil / «Сохранить как XML», CSV и текст из Просмотра событий,
   вывод Get-WinEvent | Format-List.

   API:
     await SysDiag.parseDump(reader)          -> разобранный дамп (reader = SysDiag.fileReader(file) | bufReader(uint8))
     SysDiag.analyzeDump(d)                   -> { sev, title, cause, fix[], facts[], suspects[], frames[] }
     SysDiag.parseEvents(text)                -> [{ ms, utc, log, id, provider, level, msg }]
     SysDiag.analyzeEvents(evts, { refMs })   -> { findings[], total, relevant }
     SysDiag.aiInput(sys, hint)               -> короткий текст для ИИ (до ~3500 символов)
     SysDiag.briefLine(sys)                   -> одна строка для общего разбора лога */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SysDiag = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var hex = function (v) { return '0x' + v.toString(16); };

  /* ---------- Чтение по кускам ---------- */
  function bufReader(u8) { return { size: u8.length, read: function (o, l) { return Promise.resolve(u8.subarray(o, Math.min(u8.length, o + l))); } }; }
  function fileReader(file) { return { size: file.size, read: function (o, l) { return file.slice(o, Math.min(file.size, o + l)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); } }; }
  function dvOf(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }

  /* ---------- Справочники ---------- */
  var EXC = {
    0xC0000005: 'ACCESS_VIOLATION', 0x80000003: 'BREAKPOINT', 0xC00000FD: 'STACK_OVERFLOW', 0xC0000094: 'INT_DIVIDE_BY_ZERO',
    0xC000001D: 'ILLEGAL_INSTRUCTION', 0xC0000374: 'HEAP_CORRUPTION', 0xC0000409: 'FAST_FAIL (STACK_BUFFER_OVERRUN)', 0xE06D7363: 'C++ EXCEPTION',
    0xC0000006: 'IN_PAGE_ERROR', 0xC0000017: 'NO_MEMORY', 0x80000004: 'SINGLE_STEP', 0xC0000096: 'PRIVILEGED_INSTRUCTION', 0xC0000142: 'DLL_INIT_FAILED', 0xC0000135: 'DLL_NOT_FOUND'
  };
  var FASTFAIL = { 0: 'нарушена защита стека (GS)', 1: 'нарушена проверка vtable', 2: 'повреждён «кукис» стека', 3: 'повреждён список (куча / список объектов)', 4: 'неверный стек', 5: 'недопустимый аргумент', 7: 'аварийное завершение приложения (abort / terminate)', 8: 'выход за границы массива' };
  var BUGCHECK = {
    0x116: 'VIDEO_TDR_FAILURE (видеодрайвер завис и не восстановился)', 0x117: 'VIDEO_TDR_TIMEOUT_DETECTED', 0x141: 'VIDEO_ENGINE_TIMEOUT_DETECTED', 0x119: 'VIDEO_SCHEDULER_INTERNAL_ERROR',
    0x1a: 'MEMORY_MANAGEMENT (память или ОЗУ)', 0x50: 'PAGE_FAULT_IN_NONPAGED_AREA (память, драйвер)', 0x3b: 'SYSTEM_SERVICE_EXCEPTION', 0xa: 'IRQL_NOT_LESS_OR_EQUAL (драйвер)', 0xd1: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL',
    0x124: 'WHEA_UNCORRECTABLE_ERROR (процессор, разгон, питание)', 0x133: 'DPC_WATCHDOG_VIOLATION', 0x139: 'KERNEL_SECURITY_CHECK_FAILURE', 0x7e: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 0x7a: 'KERNEL_DATA_INPAGE_ERROR (диск)',
    0xf4: 'CRITICAL_PROCESS_DIED', 0xc2: 'BAD_POOL_CALLER', 0x9f: 'DRIVER_POWER_STATE_FAILURE', 0xea: 'THREAD_STUCK_IN_DEVICE_DRIVER (видеодрайвер)', 0xe6: 'DRIVER_VERIFIER_DMA_VIOLATION', 0x19: 'BAD_POOL_HEADER', 0x1e: 'KMODE_EXCEPTION_NOT_HANDLED', 0xbe: 'ATTEMPTED_WRITE_TO_READONLY_MEMORY', 0xc5: 'DRIVER_CORRUPTED_EXPOOL', 0x154: 'UNEXPECTED_STORE_EXCEPTION (диск)', 0x1000007e: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED_M'
  };
  var MOD_RULES = [
    ['game', /^(gta5|gtav|playgtav|gta5_enhanced)\.exe$/i, 'GTA V'],
    ['gpu', /^(nvwgf2um|nvwgf2umx|nvd3dum|nvd3dumx|nvlddmkm|nvoglv64|nvoglv32|nvapi64|nvcuda|nvngx|nvdxgdmal?|atidxx64|atidxx32|atiumd64|atiumd6a|amdxc64|amdvlk64|aticfx64|atig6pxx|amdkmdag|igd10iumd64|igdumdim64|igdumd64|igc64|igxelpicd64|ig9icd64|d3d12core)\.(dll|sys)$/i, 'драйвер видеокарты'],
    ['overlay', /(discordhook|rtsshooks|gameoverlayrenderer|graphics-hook|bandihook|bdcam|owclient|ow-graphics|msiafterburner|nvspcap|nvtopps|medal|overwolf|fraps|dxtory|obs-|streamlabs|geforceexperience|nvsphelper|steamoverlay|xsplit|action_x64|reshade|specialk)/i, 'оверлей / хук'],
    ['anticheat', /^(beclient|bedaisy|battleye|easyanticheat)/i, 'BattlEye'],
    ['cef', /^(libcef|chrome_elf|chrome_child|cef_|libegl|libglesv2|d3dcompiler_47)/i, 'встроенный браузер (CEF)'],
    ['altv', /(altv|alt-v|alt_v|alt-client|majestic)/i, 'клиент alt:V / Majestic'],
    ['av', /(avast|aswhook|avgnt|avghook|klhk|kasper|kav|mcafee|mfehidk|eset|ekrn|bitdefender|bdhook|atc\.dll|norton|symantec|drweb|dwprot|mbam|malwarebytes|comodo|cmdvirth|360|huorong|sophos|trendmicro|tmumh)/i, 'антивирус']
  ];
  var SYS_PATH = /\\windows\\(system32|syswow64|winsxs|systemapps)\\|\\windows\\microsoft\.net\\/i;
  var MOD_DLLS = /^(d3d9|d3d10|d3d11|dxgi|dinput8|xinput1_[34]|xinput9_1_0|version|winmm|dsound|opengl32|wininet|vorbisfile|scripthookv|scripthookvdotnet|openiv|dsound)\.dll$/i;
  /* Шаги под конкретный антивирус (по имени модуля в процессе игры). Без команд PowerShell: только через интерфейс программ. */
  var AV = [
    [/avast|aswhook|avg/i, 'Avast / AVG', ['Avast и AVG мешают клиенту даже с исключениями: на время игры отключить все экраны защиты (значок в трее → «Управление экранами» → отключить до перезагрузки) и проверить запуск.', 'Если с отключённым антивирусом вылетов нет: удалить Avast/AVG и пользоваться Защитником Windows.']],
    [/klhk|kasper|kav/i, 'Kaspersky', ['Kaspersky: в «Настройки → Угрозы и исключения → Исключения» добавить папку игры и папку лаунчера Majestic, и в «Доверенные программы» добавить лаунчер и GTA5.exe с галочкой «Не проверять открываемые файлы».', 'Если не помогло: приостановить защиту на время игры и проверить; при повторе передать дальше.']],
    [/eset|ekrn|eamon|ehdrv/i, 'ESET', ['ESET: добавить папку игры и лаунчера в исключения («Дополнительные настройки → Исключения производительности»).', 'В ESET Internet Security на время игры отключить «Защиту сети» (IDS и защиту от ботнетов): на форуме ESET вылеты GTA Online связывали именно с ней.']],
    [/bitdefender|bdhook|atc\.dll/i, 'Bitdefender', ['Bitdefender: добавить папку игры и лаунчера в исключения, а GTA5.exe и лаунчер — в исключения «Расширенной защиты от угроз».', 'Проверить запуск с выключенной защитой; если вылетов нет, оставить исключения.']]
  ];
  function avInfo(name) { for (var i = 0; i < AV.length; i++) if (AV[i][0].test(name)) return { product: AV[i][1], fix: AV[i][2] }; return { product: 'антивирус', fix: ['Добавить папку игры и лаунчера Majestic в исключения антивируса.', 'Временно отключить защитный модуль и проверить.'] }; }

  function classifyModule(name, path) {
    for (var i = 0; i < MOD_RULES.length; i++) if (MOD_RULES[i][1].test(name)) return { cls: MOD_RULES[i][0], label: MOD_RULES[i][2] };
    if (/\.asi$/i.test(name)) return { cls: 'mod', label: 'ASI-плагин (мод)' };
    var sys = SYS_PATH.test(path || '');
    if (!sys && MOD_DLLS.test(name) && /gta|grand theft|rockstar|majestic/i.test(path || '')) return { cls: 'mod', label: 'подмена системной библиотеки в папке игры (ReShade / ENB / мод)' };
    if (/^(ntdll|kernelbase|kernel32|ucrtbase|vcruntime\d+|msvcp\d+|msvcr\d+|win32u|user32|gdi32|combase|rpcrt4)\.dll$/i.test(name)) return { cls: 'system', label: 'системная библиотека Windows' };
    return { cls: sys ? 'system' : 'other', label: sys ? 'Windows' : '' };
  }

  /* ---------- Минидамп ---------- */
  async function parseDump(rd, opts) {
    opts = opts || {}; var scanBytes = opts.scanBytes || 8192, maxFrames = opts.maxFrames || 24;
    var head = await rd.read(0, 32);
    if (head.length < 32 || dvOf(head).getUint32(0, true) !== 0x504d444d) throw new Error('Это не минидамп Windows: нет сигнатуры MDMP.');
    var hv = dvOf(head), nStreams = hv.getUint32(8, true), dirRva = hv.getUint32(12, true);
    if (nStreams > 512 || dirRva + nStreams * 12 > rd.size) throw new Error('Повреждён каталог потоков дампа.');
    var dir = await rd.read(dirRva, nStreams * 12), dv = dvOf(dir), S = {};
    for (var i = 0; i < nStreams; i++) S[dv.getUint32(i * 12, true)] = { size: dv.getUint32(i * 12 + 4, true), rva: dv.getUint32(i * 12 + 8, true) };
    var r = { size: rd.size, timeMs: hv.getUint32(20, true) * 1000, streams: Object.keys(S).map(Number), modules: [], threads: [], exception: null, registers: null, frames: [], fault: null, system: null };
    async function stream(id, max) { var s = S[id]; if (!s || s.rva + 4 > rd.size) return null; return await rd.read(s.rva, Math.min(s.size || max || 1 << 20, max || 1 << 22)); }
    /* система */
    var si = await stream(7, 64);
    if (si && si.length >= 24) { var sv = dvOf(si); r.system = { arch: sv.getUint16(0, true) === 9 ? 'x64' : String(sv.getUint16(0, true)), cpus: si[6], major: sv.getUint32(8, true), minor: sv.getUint32(12, true), build: sv.getUint32(16, true) }; r.system.os = r.system.major === 10 ? (r.system.build >= 22000 ? 'Windows 11' : 'Windows 10') : 'Windows ' + r.system.major + '.' + r.system.minor; }
    /* модули */
    var mb = await stream(4, 4 + 108 * 1500);
    if (mb && mb.length >= 4) {
      var mv = dvOf(mb), mc = Math.min(mv.getUint32(0, true), 1500), raws = [];
      for (var m = 0; m < mc; m++) { var mo = 4 + m * 108; if (mo + 108 > mb.length) break; var vms = mv.getUint32(mo + 32, true), vls = mv.getUint32(mo + 36, true); raws.push({ base: mv.getBigUint64(mo, true), size: mv.getUint32(mo + 8, true), timeDateStamp: mv.getUint32(mo + 16, true), nameRva: mv.getUint32(mo + 20, true), ver: mv.getUint32(mo + 24, true) === 0xFEEF04BD && (vms || vls) ? (vms >>> 16) + '.' + (vms & 0xFFFF) + '.' + (vls >>> 16) + '.' + (vls & 0xFFFF) : '' }); }
      var lo = Infinity, hi = 0; raws.forEach(function (x) { if (x.nameRva) { lo = Math.min(lo, x.nameRva); hi = Math.max(hi, x.nameRva); } });
      var blob = null; if (hi >= lo && hi - lo < 600000 && lo < rd.size) blob = await rd.read(lo, Math.min(rd.size - lo, hi - lo + 1100));
      for (var k = 0; k < raws.length; k++) {
        var x = raws[k], path = '';
        try {
          var bb = blob && x.nameRva >= lo ? blob : null, off = bb ? x.nameRva - lo : 0, src = bb;
          if (!src) { src = await rd.read(x.nameRva, 1100); off = 0; }
          if (src.length >= off + 4) { var n = dvOf(src).getUint32(off, true); path = new TextDecoder('utf-16le').decode(src.subarray(off + 4, off + 4 + Math.min(n, 1000))); }
        } catch (e) {}
        var nm = path.split(/[\\/]/).pop(), cl = classifyModule(nm, path);
        r.modules.push({ base: x.base, size: x.size, timeDateStamp: x.timeDateStamp, ver: x.ver, path: path, name: nm, cls: cl.cls, label: cl.label });
      }
    }
    /* потоки */
    var tb = await stream(3, 4 + 48 * 4000);
    if (tb && tb.length >= 4) {
      var tv = dvOf(tb), tc = Math.min(tv.getUint32(0, true), 4000);
      for (var t = 0; t < tc; t++) { var to = 4 + t * 48; if (to + 48 > tb.length) break; r.threads.push({ id: tv.getUint32(to, true), stackStart: tv.getBigUint64(to + 24, true), stackSize: tv.getUint32(to + 32, true), stackRva: tv.getUint32(to + 36, true), ctxSize: tv.getUint32(to + 40, true), ctxRva: tv.getUint32(to + 44, true) }); }
    }
    /* процесс: время запуска, память процесса и системы, имена потоков */
    var mi = await stream(15, 64);
    if (mi && mi.length >= 24) { var iv = dvOf(mi), fl = iv.getUint32(4, true); if (fl & 1) { r.misc = { pid: iv.getUint32(8, true) }; if (fl & 2) { var ct = iv.getUint32(12, true); if (ct) { r.misc.createMs = ct * 1000; r.misc.userSec = iv.getUint32(16, true); r.misc.kernelSec = iv.getUint32(20, true); if (r.timeMs && r.timeMs >= r.misc.createMs) r.misc.uptimeSec = Math.round((r.timeMs - r.misc.createMs) / 1000); } } } }
    var vb = await stream(22, 160);
    if (vb && vb.length >= 72) { var vv = dvOf(vb); r.vm = { faults: vv.getUint32(4, true), wsPeak: Number(vv.getBigUint64(8, true)), ws: Number(vv.getBigUint64(16, true)), commit: Number(vv.getBigUint64(56, true)), commitPeak: Number(vv.getBigUint64(64, true)) }; }
    var sm = await stream(21, 512);
    if (sm && sm.length >= 148) { var mv2 = dvOf(sm), pg = mv2.getUint32(8, true) || 4096; r.mem = { totalB: mv2.getUint32(12, true) * pg, availB: Number(mv2.getBigUint64(116, true)) * pg, committedB: Number(mv2.getBigUint64(124, true)) * pg, limitB: Number(mv2.getBigUint64(132, true)) * pg, peakB: Number(mv2.getBigUint64(140, true)) * pg }; if (!(r.mem.totalB > 0) || r.mem.limitB < r.mem.totalB / 2 || r.mem.committedB > r.mem.limitB * 1.01) r.mem = null; }
    var nb = await stream(24, 4 + 12 * 600);
    if (nb && nb.length >= 4) {
      var nv = dvOf(nb), nc = Math.min(nv.getUint32(0, true), 600); r.threadNames = {};
      for (var ni = 0; ni < nc; ni++) { var no = 4 + ni * 12; if (no + 12 > nb.length) break; try { var rva = Number(nv.getBigUint64(no + 4, true)); if (rva && rva + 8 < rd.size) { var nm0 = await rd.read(rva, 200), ln = dvOf(nm0).getUint32(0, true); r.threadNames[nv.getUint32(no, true)] = new TextDecoder('utf-16le').decode(nm0.subarray(4, 4 + Math.min(ln, 190))); } } catch (e) {} }
    }
    /* исключение */
    var eb = await stream(6, 168 + 16);
    if (eb && eb.length >= 168) {
      var ev = dvOf(eb), code = ev.getUint32(8, true), np = ev.getUint32(32, true), params = [];
      for (var p = 0; p < Math.min(np, 15); p++) params.push(ev.getBigUint64(40 + p * 8, true));
      r.exception = { threadId: ev.getUint32(0, true), code: code, codeHex: hex(code), codeName: EXC[code] || '', address: ev.getBigUint64(24, true), params: params, ctxSize: ev.getUint32(160, true), ctxRva: ev.getUint32(164, true) };
      if (code === 0xC0000005 && params.length >= 2) r.exception.access = { kind: ({ 0n: 'чтение', 1n: 'запись', 8n: 'выполнение (DEP)' })[params[0]] || 'неизвестно', address: params[1] };
      if (code === 0xC0000409 && params.length >= 1) r.exception.fastFail = Number(params[0]);
    }
    var thread = r.exception ? r.threads.find(function (z) { return z.id === r.exception.threadId; }) : null;
    async function regs(rva, size) { if (!rva || size < 0x100 || rva + 0x100 > rd.size) return null; var c = await rd.read(rva, 0x100), cv = dvOf(c); return { rip: cv.getBigUint64(0xF8, true), rsp: cv.getBigUint64(0x98, true), rbp: cv.getBigUint64(0xA0, true) }; }
    if (r.exception) r.registers = (await regs(r.exception.ctxRva, r.exception.ctxSize)) || (thread ? await regs(thread.ctxRva, thread.ctxSize) : null);
    function modAt(a) { for (var i = 0; i < r.modules.length; i++) { var m = r.modules[i]; if (a >= m.base && a < m.base + BigInt(m.size)) return m; } return null; }
    function where(a) { var m = modAt(a); return m ? { module: m.name, cls: m.cls, rva: a - m.base, text: m.name + '+' + hex(a - m.base) } : { module: '', cls: '', rva: 0n, text: hex(a) }; }
    if (r.exception) { var wa = where(r.exception.address); r.fault = { address: r.exception.address, module: wa.module, cls: wa.cls, offset: wa.rva, text: wa.text }; }
    /* стек: RIP + сканирование (уровень доверия scan) */
    if (r.registers) {
      var w0 = where(r.registers.rip); r.frames.push({ trust: 'context', text: w0.text, module: w0.module, cls: w0.cls });
      var st = thread && thread.stackStart <= r.registers.rsp && r.registers.rsp < thread.stackStart + BigInt(thread.stackSize) ? thread : null;
      if (st) {
        var off2 = Number(r.registers.rsp - st.stackStart), len = Math.min(st.stackSize - off2, scanBytes);
        if (len > 8 && st.stackRva + off2 < rd.size) {
          var sb = await rd.read(st.stackRva + off2, len), sv2 = dvOf(sb), last = 0n, seenF = {};
          /* сохранённые регионы памяти: по ним проверяем, что перед адресом возврата стоит инструкция CALL */
          var regs5 = []; var mb5 = await stream(5, 4 + 16 * 4000);
          if (mb5 && mb5.length >= 4) { var rv5 = dvOf(mb5), rc = Math.min(rv5.getUint32(0, true), 4000); for (var ri = 0; ri < rc; ri++) { var ro = 4 + ri * 16; if (ro + 16 > mb5.length) break; regs5.push({ start: rv5.getBigUint64(ro, true), size: rv5.getUint32(ro + 8, true), rva: rv5.getUint32(ro + 12, true) }); } }
          var checkCall = async function (v) {
            var reg = null; for (var ri2 = 0; ri2 < regs5.length; ri2++) { var g = regs5[ri2]; if (v - 8n >= g.start && v <= g.start + BigInt(g.size)) { reg = g; break; } }
            if (!reg) return 'unknown';
            var bytes = await rd.read(reg.rva + Number(v - 8n - reg.start), 8); if (bytes.length < 8) return 'unknown';
            var b5 = bytes[3] === 0xE8, b6 = bytes[2] === 0xFF && (bytes[3] === 0x15 || bytes[3] === 0x25), b2 = bytes[6] === 0xFF && (bytes[7] & 0xF8) === 0xD0, b3 = bytes[5] === 0xFF && (bytes[6] & 0x38) === 0x10 && (bytes[6] >> 6) === 1, b4 = bytes[4] === 0xFF && (bytes[5] & 0x38) === 0x10 && (bytes[5] >> 6) === 1, b7 = bytes[1] === 0xFF && (bytes[2] & 0x38) === 0x10 && (bytes[2] >> 6) === 2, b3m = bytes[5] === 0xFF && (bytes[6] & 0x38) === 0x10 && (bytes[6] >> 6) === 0, b4m = bytes[4] === 0xFF && (bytes[5] & 0x38) === 0x10 && (bytes[5] >> 6) === 0 && (bytes[5] & 7) === 4;
            return (b5 || b6 || b2 || b3 || b4 || b7 || b3m || b4m) ? 'verified' : 'rejected';
          };
          r.stackStats = { verified: 0, rejected: 0, unknown: 0 };
          for (var q = 0; q + 8 <= sb.length && r.frames.length < maxFrames; q += 8) {
            var v = sv2.getBigUint64(q, true); if (v === last || !modAt(v)) continue; last = v;
            var wv = where(v); if (wv.rva === 0n) continue; var ck = await checkCall(v); r.stackStats[ck]++; if (ck === 'rejected') continue;
            if (seenF[wv.text]) continue; seenF[wv.text] = 1; r.frames.push({ trust: ck === 'verified' ? 'verified' : 'scan', text: wv.text, module: wv.module, cls: wv.cls });
          }
        }
      }
    }
    /* строки из сохранённой памяти (стеки потоков): коды ERR_, ассеты, Last loaded asset */
    try { r.strings = await harvestStrings(rd, S[5], opts.stringBytes || 8 * 1048576); } catch (e) {}
    return r;
  }

  /* Известные ошибки клиента: подпись сбоя + условие по системе. Дополняется по мере сообщений разработчиков. */
  var KNOWN = [
    { sig: 'majestic-client.dll+0x64bcf2', builds: [17763, 17763], title: 'Известная ошибка клиента на Windows 10 1809', cause: 'Этот сбой (majestic-client.dll+0x64bcf2, запись по адресу из области ядра) связан со сборкой Windows 10 1809 (17763). Разработчикам он известен и исправлен в клиенте, старые дампы с этой подписью относятся к исправленной версии.', fix: ['Обновить клиент через лаунчер до свежей версии (проверка файлов, «Очистить кеш»).', 'Сборка 1809 снята с поддержки: рекомендовать обновить Windows 10 до 22H2 или Windows 11.', 'Если сбой повторяется на свежем клиенте, это новый случай: передать дамп разработчикам.'] }
  ];
  /* Подпись сбоя с версией модуля. Смещение без символов имеет смысл только внутри одной версии файла:
     после обновления клиента или игры код сдвигается, и то же смещение указывает на другую функцию.
     Работает и для разобранного дампа (d.modules), и для сжатой сводки (d.mv: «имя|версия»). */
  function cmpVer(a, b) { var x = String(a || '').split('.'), y = String(b || '').split('.'); for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0; if (p !== q) return p < q ? -1 : 1; } return 0; }
  function sigOf(d) {
    var f = d && d.fault; if (!f || !f.module || !f.text) return null;
    var name = String(f.module).toLowerCase(), ver = '';
    if (d.modules) { var m = d.modules.filter(function (x) { return String(x.name).toLowerCase() === name; })[0]; if (m && m.ver) ver = m.ver; }
    else if (d.mv) d.mv.forEach(function (x) { var p = String(x).split('|'); if (!ver && p[0].toLowerCase() === name && p[1]) ver = p[1]; });
    var base = String(f.text).toLowerCase();
    return { base: base, ver: ver, key: base + (ver ? '@' + ver : ''), module: f.module };
  }
  /* Ищет запись о подписи. Записи: { sig, ver?, builds?: [от, до], fixedIn?, ... }.
     state: exact — та же подпись и та же версия (или запись без версии); other — подпись совпала, но запись сделана для другой версии;
     regressed — запись говорит «исправлено в версии X», а дамп из версии X или новее. */
  function matchSig(sig, list, build) {
    if (!sig) return null; var other = null;
    for (var i = 0; i < (list || []).length; i++) {
      var r = list[i]; if (!r || String(r.sig || '').toLowerCase() !== sig.base) continue;
      if (r.builds && !(build >= r.builds[0] && build <= r.builds[1])) continue;
      if (r.ver && sig.ver && r.ver !== sig.ver) { if (!other) other = { rec: r, state: 'other' }; continue; }
      if (r.fixedIn && sig.ver && cmpVer(sig.ver, r.fixedIn) >= 0) return { rec: r, state: 'regressed' };
      return { rec: r, state: 'exact' };
    }
    return other;
  }

  async function harvestStrings(rd, st, budget) {
    if (!st || st.rva + 4 > rd.size) return null;
    var mb = await rd.read(st.rva, Math.min(st.size || 4 + 16 * 4000, 4 + 16 * 4000)), mv = dvOf(mb), cnt = Math.min(mv.getUint32(0, true), 4000), regs = [];
    for (var i = 0; i < cnt; i++) { var o = 4 + i * 16; if (o + 16 > mb.length) break; regs.push({ size: mv.getUint32(o + 8, true), rva: mv.getUint32(o + 12, true) }); }
    regs.sort(function (a, b) { return b.size - a.size; });
    var re = /Last loaded asset:?\s*([^\u0000\r\n]{1,200})|\b(ERR_[A-Z0-9_]{4,40})\b|\b([A-Za-z0-9_\-]{3,60}\.(?:ydr|yft|ytd|ydd|ycd|ymap|ybn))\b/g, codes = {}, assets = {}, last = {}, used = 0, dec8 = new TextDecoder('windows-1252'), dec16 = new TextDecoder('utf-16le');
    for (var k = 0; k < regs.length && used < budget; k++) {
      var g = regs[k]; if (!g.size || g.rva + g.size > rd.size) continue; used += g.size;
      var b = await rd.read(g.rva, g.size), texts = [dec8.decode(b)]; if (b.length > 64) texts.push(dec16.decode(b.subarray(0, b.length & ~1)));
      texts.forEach(function (t) { var m; re.lastIndex = 0; while ((m = re.exec(t))) { if (m[1]) last[m[1].trim().slice(0, 160)] = (last[m[1].trim().slice(0, 160)] || 0) + 1; else if (m[2]) { if (m[2] !== 'ERR_SYS_FILELOAD') codes[m[2]] = (codes[m[2]] || 0) + 1; } else if (m[3]) assets[m[3]] = (assets[m[3]] || 0) + 1; } });
    }
    var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n).map(function (k) { return { t: k, n: o[k] }; }); };
    var res = { codes: top(codes, 6), assets: top(assets, 8), last: top(last, 3) };
    return res.codes.length || res.assets.length || res.last.length ? res : null;
  }

  /* Версии из дампа: клиент, игра, драйвер видеокарты (с возрастом на момент дампа). */
  function driverNum(vendor, ver) {
    var p = String(ver || '').split('.'); if (p.length < 4) return '';
    if (vendor === 'NVIDIA') { var t = (p[2] + ('0000' + p[3]).slice(-4)).slice(-5); return t.slice(0, 3) + '.' + t.slice(3); }
    return ver;
  }
  function versionInfo(d) {
    var by = function (re) { return d.modules.filter(function (m) { return re.test(m.name); })[0]; }, o = {};
    var cl = by(/^majestic-client\.dll$/i), gm = by(/^gta5\.exe$/i); if (cl && cl.ver) o.client = cl.ver; if (gm && gm.ver) o.game = gm.ver;
    var gp = by(/^(nvwgf2umx|nvapi64|nvd3dumx)\.dll$/i) || by(/^(atidxx64|amdxc64|aticfx64)\.dll$/i) || by(/^(igd|igc|igxelp|ig9)/i);
    if (gp && gp.ver) { var vendor = /^(nv)/i.test(gp.name) ? 'NVIDIA' : /^(ati|amd)/i.test(gp.name) ? 'AMD' : 'Intel', ts = gp.timeDateStamp * 1000, dm = d.timeMs || Date.now(), ok = ts > Date.UTC(2015, 0, 1) && ts < dm + 86400000 * 30;
      o.gpu = { vendor: vendor, ver: gp.ver, num: driverNum(vendor, gp.ver), ts: ok ? ts : 0, ageMonths: ok ? Math.max(0, Math.round((dm - ts) / 2629800000)) : null, name: gp.name }; }
    return o;
  }
  /* Вывод по дампу без ИИ: правила по коду исключения и классу сбойного модуля. */
  function analyzeDump(d) {
    var ex = d.exception, f = d.fault, facts = [], fix = [], title = 'Сбой клиента', cause = '', sev = 'err';
    if (!ex) return { sev: 'warn', title: 'В дампе нет записи об исключении', cause: 'Файл прочитан, но потока исключения в нём нет: такой дамп снят вручную или игра завершилась штатно. Для разбора краша нужен дамп, созданный при падении.', fix: ['Попросить дамп, созданный в момент падения (папка краш-отчётов игры, рядом с логом).'], facts: [], suspects: [], frames: d.frames };
    var cls = f ? f.cls : '', mod = f && f.module ? f.module : '';
    facts.push('Исключение ' + ex.codeHex + (ex.codeName ? ' (' + ex.codeName + ')' : ''));
    if (f) facts.push('Место сбоя: ' + f.text + (cls && cls !== 'other' && cls !== 'system' ? ' (' + (MOD_RULES.filter(function (x) { return x[0] === cls; })[0] || [0, 0, cls])[2] + ')' : ''));
    if (ex.access) facts.push(ex.access.kind + ' памяти по адресу ' + hex(ex.access.address) + (ex.access.address < 0x10000n ? ' (нулевой указатель)' : ''));
    if (ex.fastFail != null) facts.push('Причина аварийного выхода: ' + (FASTFAIL[ex.fastFail] || 'код ' + ex.fastFail));
    var GB = function (b) { return (b / 1073741824).toFixed(1).replace(/\.0$/, '') + ' ГБ'; };
    if (d.misc && d.misc.uptimeSec != null) { var up = d.misc.uptimeSec; facts.push('Игра работала до падения: ' + (up < 90 ? up + ' с' : up < 7200 ? Math.round(up / 60) + ' мин' : (up / 3600).toFixed(1) + ' ч')); }
    if (ex && d.threadNames && d.threadNames[ex.threadId]) facts.push('Упавший поток: ' + d.threadNames[ex.threadId]);
    if (d.vm && d.vm.ws) facts.push('Память процесса: рабочий набор ' + GB(d.vm.ws) + ', выделено ' + GB(d.vm.commit));
    if (d.mem) facts.push('Память системы: ОЗУ ' + GB(d.mem.totalB) + ', свободно ' + GB(d.mem.availB) + ', выделено ' + GB(d.mem.committedB) + ' из ' + GB(d.mem.limitB) + ' (лимит с подкачкой)');
    if (d.system) facts.push('Система: ' + d.system.os + ' (сборка ' + d.system.build + '), ' + d.system.cpus + ' ядер');
    if (d.timeMs) facts.push('Время дампа (UTC): ' + new Date(d.timeMs).toISOString().replace('T', ' ').slice(0, 19));
    var common = ['Передать разработчикам: «' + (f ? f.text : ex.codeHex) + '» и версию клиента.'];
    if (cls === 'gpu') { title = 'Сбой драйвера видеокарты'; cause = 'Игра упала внутри драйвера видеокарты (' + mod + '). Причины: сбойный или сильно устаревший драйвер, перегрев или разгон видеокарты, нехватка видеопамяти, конфликт с оверлеем.'; fix = ['Чистая установка свежего драйвера видеокарты (с удалением старого через DDU).', 'Отключить разгон видеокарты и оверлеи (MSI Afterburner, RTSS, Discord, GeForce Experience, OBS).', 'Снизить качество текстур и отключить расширенные настройки дальности прорисовки.', 'Проверить температуры и память видеокарты под нагрузкой.']; }
    else if (cls === 'overlay') { title = 'Сбой в оверлее или хуке (' + mod + ')'; cause = 'Игра упала внутри стороннего модуля, который внедряется в процесс (оверлей, запись экрана, мониторинг). Такие модули часто ломают отрисовку.'; fix = ['Закрыть и удалить оверлей «' + mod + '» (Discord overlay, RTSS, Medal, Overwolf, OBS hook).', 'Запустить игру без сторонних программ и проверить, повторится ли краш.']; }
    else if (cls === 'av') { var avi = avInfo(mod); title = 'Сбой в модуле антивируса ' + (avi.product !== 'антивирус' ? avi.product + ' ' : '') + '(' + mod + ')'; cause = 'Антивирус внедряет свой модуль в процесс игры и упал вместе с ней.'; fix = avi.fix.slice(); }
    else if (cls === 'mod') { title = 'Сбой в моде или подмене библиотеки (' + mod + ')'; cause = 'В папке игры лежит сторонняя библиотека (ReShade, ENB, ASI-плагин, ScriptHook), и она нестабильна с клиентом.'; fix = ['Удалить моды и библиотеки из папки GTA V (разрешённые моды лежат в папке модификаций лаунчера).', 'Проверить целостность файлов игры и «Очистить кеш» в лаунчере.']; }
    else if (cls === 'cef') { title = 'Сбой встроенного браузера интерфейса (CEF)'; cause = 'Упал модуль браузера, который рисует интерфейс сервера (меню, телефон, панели).'; fix = ['«Очистить кеш» в лаунчере и переустановить лаунчер.', 'Обновить драйвер видеокарты, отключить оверлеи.', 'Проверить свободное место на диске и оперативную память.']; }
    else if (cls === 'altv') { title = 'Сбой в клиенте alt:V / Majestic (' + mod + ')'; cause = 'Упал собственный модуль клиента. Игроку помогает только перезапуск и очистка кеша, причину устраняют разработчики.'; fix = ['«Очистить кеш» в лаунчере, перезапустить.'].concat(common); }
    else if (cls === 'game') {
      title = 'Сбой в самом GTA5.exe'; cause = 'Игра упала в собственном коде: чаще всего при загрузке повреждённого или несовместимого ассета (модель, текстура, анимация), при нехватке памяти или из-за повреждённых файлов игры.';
      fix = ['Сверить с логом: «Last loaded asset» перед падением подскажет ресурс.', '«Очистить кеш» в лаунчере, проверить целостность файлов игры, убрать моды.', 'Проверить свободную оперативную память и файл подкачки.'];
    } else if (cls === 'system' || !cls) { title = 'Сбой в системной библиотеке' + (mod ? ' (' + mod + ')' : ''); cause = 'Падение в системной библиотеке почти всегда следствие сбоя в другом месте: повреждённая куча, нехватка памяти или вызов из стороннего модуля. Решающую роль играет стек вызовов.'; fix = ['Посмотреть стек в сводке: первый не системный модуль и есть кандидат.', 'Проверить оперативную память (MemTest), свободное место на диске, файл подкачки.'].concat(common); }
    else { title = 'Сбой в модуле ' + mod; cause = 'Падение внутри стороннего модуля «' + mod + '».'; fix = ['Определить, что это за программа, и удалить или обновить её.'].concat(common); }
    /* уточнение по коду */
    if (ex.code === 0xC0000374) { cause += ' Код 0xC0000374 означает повреждение кучи: память испортил какой-то модуль.'; sev = 'crit'; }
    else if (ex.code === 0xC0000017 || ex.code === 0xC00000FD) { title = ex.code === 0xC0000017 ? 'Не хватило памяти' : 'Переполнение стека'; cause = ex.code === 0xC0000017 ? 'Игре не хватило оперативной памяти или файла подкачки.' : 'Переполнение стека вызовов: бесконечная рекурсия в коде.'; fix = ex.code === 0xC0000017 ? ['Закрыть лишние программы, увеличить файл подкачки до 16 ГБ и больше.', 'Проверить свободное место на системном диске.'] : common; }
    else if (ex.code === 0xC0000006) { cause += ' Код 0xC0000006 (IN_PAGE_ERROR): система не смогла прочитать страницу с диска, это признак проблем с диском или повреждённого кеша.'; fix.unshift('Проверить диск (SMART, chkdsk) и заменить кабель или порт, если игра стоит на HDD.'); }
    else if (ex.code === 0xC0000409 && ex.fastFail === 7) { title = 'Клиент аварийно завершился сам (abort)'; cause = 'Клиент вызвал аварийный выход (terminate / abort) из-за внутренней ошибки, которую не смог обработать. Причину ищут по логу прямо перед падением.'; }
    else if (ex.code === 0xC0000142 || ex.code === 0xC0000135) { title = 'Не загрузилась библиотека'; cause = 'Системе не удалось загрузить нужную DLL (не найдена или не инициализировалась): не хватает Visual C++ Redistributable, DirectX или файл повреждён.'; fix = ['Установить Visual C++ Redistributable 2015–2022 (x64 и x86) и обновить DirectX.', 'Проверить антивирус: он мог удалить библиотеку.']; }
    else if (ex.access && ex.access.address < 0x10000n && cls === 'game') cause += ' Обращение к нулевому адресу: код игры получил пустой объект, ошибка в данных, а не в железе игрока.';
    if (ex.access && ex.access.address >= 0xFFFF800000000000n) { facts.push('Адрес из области ядра Windows: указатель испорчен или память отобрал драйвер'); cause += ' Адрес обращения лежит в области ядра (0xFFFF8…), а не в памяти игры: указатель испорчен либо память, выделенную драйвером (например видеокарты), забрали во время работы.'; }
    var gpuNear = d.frames.slice(1, 5).filter(function (x) { return x.cls === 'gpu'; })[0];
    if (gpuNear && cls !== 'gpu') { facts.push('В стеке рядом с местом сбоя драйвер видеокарты: ' + gpuNear.text); cause += ' Вызов шёл через драйвер видеокарты (' + gpuNear.module + '): возможна потеря устройства D3D (сброс драйвера, TDR). Сверить с журналом событий Windows: Display 4101, nvlddmkm.'; fix.push('Чистая установка драйвера видеокарты (DDU), отключить разгон и оверлеи, проверить температуры.'); }
    var lowMem = d.mem && d.mem.committedB >= d.mem.limitB * 0.93;
    if (lowMem) { facts.push('Система была на пределе памяти: занято ' + Math.round(d.mem.committedB / d.mem.limitB * 100) + '% лимита'); cause += ' В момент падения Windows исчерпала память вместе с файлом подкачки (занято ' + Math.round(d.mem.committedB / d.mem.limitB * 100) + '% лимита): это главный кандидат на причину, а не ошибка ассета.'; fix.unshift('Увеличить файл подкачки (16 ГБ и больше, на SSD), закрыть тяжёлые программы в фоне.'); if (sev === 'err') sev = 'crit'; }
    if (d.misc && d.misc.uptimeSec != null) {
      if (d.misc.uptimeSec < 60) { facts.push('Упало на старте, меньше минуты после запуска'); cause += ' Падение сразу после запуска указывает на файлы, моды или драйвер, а не на утечку.'; }
      else if (d.misc.uptimeSec > 3 * 3600 && !lowMem) { facts.push('Игра проработала больше 3 часов'); if (d.vm && d.vm.commit > 6 * 1073741824) cause += ' После долгой игры процесс раздул память (' + GB(d.vm.commit) + '): вероятна утечка, поможет перезапуск игры раз в пару часов.'; }
    }
    if (d.vm && d.vm.commit > 10 * 1073741824 && (d.misc == null || d.misc.uptimeSec == null || d.misc.uptimeSec > 1800)) facts.push('Процесс занимал очень много памяти (' + GB(d.vm.commit) + '), возможна утечка');
    /* производитель видеокарты по драйверам в дампе */
    var vend = ''; d.modules.forEach(function (m) { if (m.cls !== 'gpu' || vend) return; vend = /^(nv|nvapi|nvcuda|nvngx)/i.test(m.name) ? 'NVIDIA' : /^(ati|amd)/i.test(m.name) ? 'AMD' : /^ig/i.test(m.name) ? 'Intel' : ''; });
    if (d.strings) {
      if (d.strings.codes.length) facts.push('В памяти потока найдены коды ошибок клиента: ' + d.strings.codes.slice(0, 4).map(function (x) { return x.t + (x.n > 1 ? ' ×' + x.n : ''); }).join(', ') + ' (ориентир, строки могли остаться от прошлых событий)');
      if (d.strings.last.length) facts.push('Последний загруженный ассет из памяти: ' + d.strings.last[0].t.slice(0, 120));
      else if (d.strings.assets.length) facts.push('Файлы ресурсов в памяти потока: ' + d.strings.assets.slice(0, 4).map(function (x) { return x.t; }).join(', '));
    }
    var vi = versionInfo(d);
    if (vi.client) facts.push('Версия клиента Majestic: ' + vi.client + (vi.game ? ', GTA5.exe ' + vi.game : ''));
    if (vi.gpu) { facts.push('Драйвер ' + vi.gpu.vendor + ': ' + (vi.gpu.vendor === 'NVIDIA' ? vi.gpu.num + ' (файл ' + vi.gpu.ver + ')' : vi.gpu.ver) + (vi.gpu.ts ? ', собран ' + new Date(vi.gpu.ts).toISOString().slice(0, 10) + (vi.gpu.ageMonths != null ? ', на момент дампа ему ' + vi.gpu.ageMonths + ' мес.' : '') : '')); if (vi.gpu.ageMonths != null && vi.gpu.ageMonths >= 12) { cause += ' Драйвер видеокарты старше года (' + vi.gpu.ageMonths + ' мес.): обновление драйвера в приоритете.'; fix[(cls === 'gpu' || gpuNear) ? 'unshift' : 'push']('Обновить драйвер ' + vi.gpu.vendor + ' до свежего (текущий вышел ' + vi.gpu.ageMonths + ' мес. назад).'); } }
    if (vend) {
      facts.push('Видеокарта по драйверам в дампе: ' + vend);
      var gpuRel = cls === 'gpu' || gpuNear || (d.frames || []).some(function (x) { return x.cls === 'gpu'; });
      if (gpuRel) fix.push(vend === 'NVIDIA' ? 'NVIDIA: чистая установка драйвера с сайта NVIDIA (Custom, галочка «Выполнить чистую установку»), в панели NVIDIA для GTA5 и лаунчера режим питания «Предпочтителен максимум производительности».' : vend === 'AMD' ? 'AMD: чистая установка драйвера через AMD Cleanup Utility и свежий Adrenalin, отключить Radeon Anti-Lag, Boost и Chill для игры.' : 'Intel: игра работает на встроенной графике. Для ноутбука задать дискретную видеокарту в Параметры Windows, Система, Дисплей, Графика, затем обновить драйвер.');
    }
    var suspects = d.modules.filter(function (m) { return m.cls === 'overlay' || m.cls === 'av' || m.cls === 'mod' || m.cls === 'anticheat'; }).map(function (m) { return { name: m.name, cls: m.cls, label: m.label }; });
    /* антивирус встроен в процесс игры, но упало не в нём: один шаг под этот продукт */
    if (cls !== 'av') { var avm = d.modules.filter(function (m) { return m.cls === 'av'; })[0]; if (avm) { var av2 = avInfo(avm.name); facts.push('В процесс игры встроен модуль антивируса: ' + avm.name + (av2.product !== 'антивирус' ? ' (' + av2.product + ')' : '')); if (cls === 'game' || cls === 'other' || cls === 'altv' || cls === 'cef') fix.push('Если вылеты повторяются, проверить антивирус. ' + av2.fix[0]); } }
    /* Windows 11 24H2 (сборка 26100 и новее): Auto HDR вызывает зависания и вылеты игр */
    var gpuish = cls === 'gpu' || cls === 'cef' || gpuNear || (d.frames || []).some(function (x) { return x.cls === 'gpu'; });
    if (d.system && d.system.build >= 26100 && d.system.build < 27000 && gpuish) fix.push('Windows 11 24H2: отключить Auto HDR (Параметры → Система → Дисплей → Графика, для всех игр или для GTA5.exe). Microsoft подтвердила, что в этой версии он вызывает зависания и вылеты игр.');
    var km = matchSig(sigOf(d), KNOWN, d.system ? d.system.build : 0), known = km && km.state === 'exact' ? km.rec : null;
    if (known) { facts.unshift('Подпись сбоя и сборка Windows ' + d.system.build + ' совпали с уже исправленной известной ошибкой клиента'); title = known.title; cause = known.cause; fix = known.fix.slice(); sev = 'warn'; }
    return { sev: sev, title: title, cause: cause, fix: fix, facts: facts, suspects: suspects, frames: d.frames, known: !!known };
  }

  /* ---------- Журнал событий ---------- */

  /* ---------- EVTX (двоичный журнал Windows) ---------- */
  var TXT16 = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : null;
  function ftISO(lo, hi) { var t = (BigInt(hi) << 32n | BigInt(lo)); if (t === 0n) return ''; var ms = Number(t / 10000n) - 11644473600000; return new Date(ms).toISOString(); }
  function subText(c, dv, o, size, type) {
    var arr = type & 0x80, b = type & 0x7f, i, out = [];
    if (b === 1) { var s = TXT16.decode(c.subarray(o, o + size)); return s.replace(/\u0000+$/, '').replace(/\u0000/g, '\u0001'); }
    if (b === 2) { var a = ''; for (i = 0; i < size && c[o + i]; i++) a += String.fromCharCode(c[o + i]); return a; }
    var sz = { 3: 1, 4: 1, 5: 2, 6: 2, 7: 4, 8: 4, 9: 8, 10: 8, 11: 4, 12: 8, 13: 4, 15: 16, 17: 8, 18: 16, 20: 4, 21: 8 }[b];
    if (b === 14) { var h = ''; for (i = 0; i < Math.min(size, 24); i++) h += (c[o + i] < 16 ? '0' : '') + c[o + i].toString(16); return h; }
    if (b === 16) sz = size >= 8 ? 8 : 4;
    if (!sz) return '';
    var n = arr ? Math.floor(size / sz) : 1; if (n > 40) n = 40;
    for (i = 0; i < n; i++) {
      var q = o + i * sz, v = '';
      if (b === 3) v = String(dv.getInt8(q)); else if (b === 4) v = String(c[q]); else if (b === 5) v = String(dv.getInt16(q, true)); else if (b === 6) v = String(dv.getUint16(q, true));
      else if (b === 7) v = String(dv.getInt32(q, true)); else if (b === 8) v = String(dv.getUint32(q, true)); else if (b === 9) v = String(dv.getBigInt64(q, true)); else if (b === 10) v = String(dv.getBigUint64(q, true));
      else if (b === 11) v = String(dv.getFloat32(q, true)); else if (b === 12) v = String(dv.getFloat64(q, true)); else if (b === 13) v = dv.getUint32(q, true) ? 'true' : 'false';
      else if (b === 20) v = '0x' + dv.getUint32(q, true).toString(16); else if (b === 21) v = '0x' + dv.getBigUint64(q, true).toString(16);
      else if (b === 16) v = '0x' + (sz === 8 ? dv.getBigUint64(q, true) : dv.getUint32(q, true)).toString(16);
      else if (b === 17) v = ftISO(dv.getUint32(q, true), dv.getUint32(q + 4, true));
      else if (b === 18) v = dv.getUint16(q, true) + '-' + ('0' + dv.getUint16(q + 2, true)).slice(-2) + '-' + ('0' + dv.getUint16(q + 6, true)).slice(-2) + 'T' + ('0' + dv.getUint16(q + 8, true)).slice(-2) + ':' + ('0' + dv.getUint16(q + 10, true)).slice(-2) + ':' + ('0' + dv.getUint16(q + 12, true)).slice(-2) + 'Z';
      else if (b === 15) { var g = ''; for (var k = 0; k < 16; k++) g += (c[q + k] < 16 ? '0' : '') + c[q + k].toString(16); v = g; }
      out.push(v);
    }
    return out.join(',');
  }
  function Xml(c) { this.c = c; this.dv = dvOf(c); }
  Xml.prototype.name = function (st) {
    var c = this.c, dv = this.dv, off = dv.getUint32(st.p, true); st.p += 4;
    var at = off; if (off === st.p) { at = off; st.p += 10 + 2 * dv.getUint16(off + 6, true); }
    var n = dv.getUint16(at + 6, true); return TXT16.decode(c.subarray(at + 8, at + 8 + n * 2));
  };
  /* значение (атрибута или содержимого) -> строка; st.p указывает на токен */
  Xml.prototype.value = function (st, subs, parent) {
    var c = this.c, dv = this.dv, t = c[st.p] & 0x3f, p = st.p;
    if (t === 5) { var ty = c[p + 1]; if (ty === 1) { var n = dv.getUint16(p + 2, true); st.p = p + 4 + n * 2; return TXT16.decode(c.subarray(p + 4, p + 4 + n * 2)); } st.p = p + 2; return ''; }
    if (t === 0x0d || t === 0x0e) {
      var idx = dv.getUint16(p + 1, true); st.p = p + 4; var sv = subs && subs[idx]; if (!sv) return '';
      if ((sv.type & 0x7f) === 0x21) { return ''; }
      return subText(c, dv, sv.off, sv.size, sv.type);
    }
    st.p = p + 1; return '';
  };
  Xml.prototype.content = function (st, end, subs, parent) {
    var c = this.c, dv = this.dv;
    while (st.p < end) {
      var tk = c[st.p], t = tk & 0x3f;
      if (tk === 0x00) { st.p++; return; }
      if (tk === 0x04) { st.p++; return; }
      if (tk === 0x0f) { st.p += 4; continue; }
      if (tk === 0x0c) {
        var defOff = dv.getUint32(st.p + 6, true); st.p += 10;
        var dstart, dsize;
        if (defOff === st.p) { dsize = dv.getUint32(st.p + 20, true); dstart = st.p + 24; st.p = dstart + dsize; } else { dsize = dv.getUint32(defOff + 20, true); dstart = defOff + 24; }
        var cnt = dv.getUint32(st.p, true), q = st.p + 4, sub = [], dataPos = q + cnt * 4;
        for (var i = 0; i < cnt; i++) { var sz = dv.getUint16(q + i * 4, true), ty = c[q + i * 4 + 2]; sub.push({ size: sz, type: ty, off: dataPos }); dataPos += sz; }
        st.p = dataPos;
        var s2 = { p: dstart }; this.content(s2, dstart + dsize, sub, parent);
        continue;
      }
      if (t === 1) {
        st.p += 1 + 2 + 4; var el = { n: '', a: {}, k: [], t: '' };
        el.n = this.name(st);
        var attrEnd = st.p;
        if (tk & 0x40) { var asz = dv.getUint32(st.p, true); st.p += 4; attrEnd = st.p + asz; }
        while (st.p < attrEnd) { if ((c[st.p] & 0x3f) !== 6) break; st.p++; var an = this.name(st); el.a[an] = this.value(st, subs, el); }
        st.p = Math.max(st.p, attrEnd);
        var ct = c[st.p];
        if (ct === 0x03) { st.p++; } else if (ct === 0x02) { st.p++; this.content(st, end, subs, el); } else { st.p++; }
        parent.k.push(el); continue;
      }
      if (t === 5 || t === 0x0d || t === 0x0e) {
        if (t !== 5) { var sidx = dv.getUint16(st.p + 1, true), sv = subs && subs[sidx]; if (sv && (sv.type & 0x7f) === 0x21 && sv.size > 0) { var s3 = { p: sv.off }; this.content(s3, sv.off + sv.size, null, parent); st.p += 4; continue; } }
        var tx = this.value(st, subs, parent); if (tx) parent.t += tx; continue;
      }
      if (t === 7) { var cn = dv.getUint16(st.p + 1, true); parent.t += TXT16.decode(c.subarray(st.p + 3, st.p + 3 + cn * 2)); st.p += 3 + cn * 2; continue; }
      if (t === 8) { parent.t += String.fromCharCode(dv.getUint16(st.p + 1, true)); st.p += 3; continue; }
      if (t === 9) { st.p += 5; continue; }
      st.p++;
    }
  };
  function kid(e, n) { for (var i = 0; i < e.k.length; i++) if (e.k[i].n === n) return e.k[i]; return null; }
  function eventFromTree(root) {
    var ev = kid(root, 'Event'); if (!ev) return null;
    var sy = kid(ev, 'System'); if (!sy) return null;
    var pr = kid(sy, 'Provider'), id = kid(sy, 'EventID'), lv = kid(sy, 'Level'), tc = kid(sy, 'TimeCreated'), ch = kid(sy, 'Channel');
    var data = [], named = {}, ed = kid(ev, 'EventData') || kid(ev, 'UserData');
    function walk(n) { n.k.forEach(function (d) { if (d.n === 'Data') { var parts = (d.t || '').trim().split('\u0001').map(function (x) { return x.trim(); }); parts.forEach(function (x) { data.push(x); }); if (d.a.Name) named[d.a.Name] = parts.join(' / '); } else if (d.k.length) walk(d); else if (d.t && d.t.trim()) { data.push(d.t.trim()); named[d.n] = d.t.trim(); } }); }
    if (ed) walk(ed);
    var e = { ms: tc && tc.a.SystemTime ? Date.parse(tc.a.SystemTime) : 0, utc: true, log: ch ? ch.t.trim() : '', id: id ? parseInt(id.t, 10) || 0 : 0, provider: pr ? (pr.a.Name || '') : '', level: ({ 1: 'Critical', 2: 'Error', 3: 'Warning', 4: 'Information' })[lv ? lv.t.trim() : ''] || '', data: data, named: named, msg: '' };
    if (e.id === 1000 && /Application Error/i.test(e.provider) && data.length >= 8) e.msg = 'Faulting application name: ' + data[0] + ', version: ' + data[1] + ', Faulting module name: ' + data[3] + ', version: ' + data[4] + ', Exception code: ' + data[6] + ', Fault offset: ' + data[7] + (data[10] ? ', Faulting application path: ' + data[10] : '');
    else e.msg = Object.keys(named).map(function (k) { return k + '=' + named[k]; }).join(' ') + (Object.keys(named).length ? ' ' : '') + data.filter(function (x) { return x; }).join(' ');
    e.msg = e.msg.replace(/\s+/g, ' ').slice(0, 500);
    return e;
  }
  function parseEvtxChunk(c, out, want) {
    var dv = dvOf(c); if (c.length < 512 || dv.getUint32(0, true) !== 0x43666c45) return 0; /* 'ElfC' */
    var free = Math.min(dv.getUint32(48, true), c.length), p = 512, n = 0, x = new Xml(c);
    while (p + 28 < free) {
      if (dv.getUint32(p, true) !== 0x00002a2a) break;
      var size = dv.getUint32(p + 4, true); if (size < 32 || p + size > c.length) break;
      n++;
      try {
        var root = { n: '', a: {}, k: [], t: '' }, st = { p: p + 24 }; x.content(st, p + size - 4, null, root);
        var e = eventFromTree(root); if (e && (!want || want(e))) out.push(e);
      } catch (err) {}
      p += size;
    }
    return n;
  }
  /* Читает .evtx по кускам (64 КБ), оставляя только события, которые нужны (want). */
  async function parseEvtx(rd, want) {
    var h = await rd.read(0, 4096); if (h.length < 4096 || dvOf(h).getUint32(0, true) !== 0x46666c45) throw new Error('Это не журнал событий Windows (.evtx).');
    var out = [], total = 0;
    for (var o = 4096; o + 65536 <= rd.size + 1; o += 65536) { var ch = await rd.read(o, 65536); if (ch.length < 512) break; total += parseEvtxChunk(ch, out, want); }
    out.total = total; return out;
  }
  function isEvtx(u8) { return u8 && u8.length > 8 && u8[0] === 0x45 && u8[1] === 0x6c && u8[2] === 0x66 && u8[3] === 0x46 && u8[4] === 0x69; }

  function toMs(s, utc) { var t = Date.parse(utc && !/Z|[+-]\d\d:?\d\d$/.test(s) ? s + 'Z' : s); return isNaN(t) ? 0 : t; }
  function parseEvents(text) {
    var out = [], t = String(text || '').replace(/^\uFEFF/, '');
    if (/<Event[\s>]/.test(t)) {
      (t.match(/<Event[\s>][\s\S]*?<\/Event>/g) || []).forEach(function (b) {
        var g = function (re) { var m = re.exec(b); return m ? m[1] : ''; }, data = [], re = /<Data[^>]*>([\s\S]*?)<\/Data>/g, m;
        while ((m = re.exec(b))) data.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim());
        var msg = g(/<Message>([\s\S]*?)<\/Message>/) || data.join(' ');
        out.push({ ms: toMs(g(/SystemTime=['"]([^'"]+)/), true), utc: true, log: g(/<Channel>([^<]*)/), id: +g(/<EventID[^>]*>(\d+)/) || 0, provider: g(/<Provider[^>]*Name=['"]([^'"]+)/), level: ({ 1: 'Critical', 2: 'Error', 3: 'Warning', 4: 'Information' })[g(/<Level>(\d+)/)] || '', msg: msg.replace(/\s+/g, ' ').slice(0, 500) });
      });
      return out;
    }
    var lines = t.split(/\r?\n/), piped = lines.filter(function (l) { return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\|/.test(l); });
    if (piped.length) {
      piped.forEach(function (l) { var p = l.split('|'); out.push({ ms: toMs(p[0], false), utc: false, log: p[1] || '', id: +p[2] || 0, provider: p[3] || '', level: p[4] || '', msg: p.slice(5).join('|') }); });
      return out;
    }
    /* Get-WinEvent | Format-List */
    if (/^\s*(TimeCreated|ProviderName)\s*:/m.test(t)) {
      var cur = null, key = '';
      lines.forEach(function (l) {
        var m = /^(\w+)\s*:\s?(.*)$/.exec(l);
        if (m && /^(TimeCreated|ProviderName|Id|LogName|LevelDisplayName|Message|RecordId)$/.test(m[1])) {
          key = m[1]; if (key === 'TimeCreated' || (key === 'ProviderName' && !cur)) { cur = { ms: 0, utc: false, log: '', id: 0, provider: '', level: '', msg: '' }; out.push(cur); }
          if (!cur) return; if (key === 'TimeCreated') cur.ms = toMs(m[2].replace(/(\d+)\.(\d+)\.(\d+)/, '$3-$2-$1'), false) || Date.parse(m[2]) || 0;
          else if (key === 'ProviderName') cur.provider = m[2]; else if (key === 'Id') cur.id = +m[2] || 0; else if (key === 'LogName') cur.log = m[2]; else if (key === 'LevelDisplayName') cur.level = m[2]; else if (key === 'Message') cur.msg = m[2];
        } else if (cur && key === 'Message' && l.trim()) cur.msg += ' ' + l.trim();
      });
      out.forEach(function (e) { e.msg = e.msg.replace(/\s+/g, ' ').slice(0, 500); });
      return out;
    }
    /* CSV / TSV из Просмотра событий (без текста сообщений) */
    var hd = lines[0] || '', sep = hd.indexOf('\t') >= 0 ? '\t' : ',';
    if (/(Level|Уровень)/i.test(hd) && /(Event ?ID|Код события|Source|Источник)/i.test(hd)) {
      var cols = hd.split(sep).map(function (c) { return c.replace(/^"|"$/g, '').toLowerCase(); });
      var ix = function (re) { for (var i = 0; i < cols.length; i++) if (re.test(cols[i])) return i; return -1; }, iL = ix(/level|уровень/), iD = ix(/date|дата/), iS = ix(/source|источник/), iI = ix(/event ?id|код/);
      lines.slice(1).forEach(function (l) {
        if (!l.trim()) return; var p = l.split(sep).map(function (c) { return c.replace(/^"|"$/g, ''); }), ds = p[iD] || '', ms = 0, m = /(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2}:\d\d:\d\d)/.exec(ds);
        ms = m ? Date.parse(m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') + 'T' + m[4].padStart(8, '0')) : Date.parse(ds) || 0;
        out.push({ ms: ms, utc: false, log: '', id: +p[iI] || 0, provider: p[iS] || '', level: p[iL] || '', msg: '' });
      });
    }
    return out;
  }
  var GAMEPROC = /gta5|gtav|playgtav|majestic|altv|alt-v|battleye|beservice|socialclub|launcher/i;
  function faultInfo(e) {
    var d = e.data || [];
    if (d.length >= 8 && /^0x|^[0-9a-f]{8}$/i.test(d[6] || '')) return { app: d[0], appVer: d[1], mod: d[3], modVer: d[4], code: /^0x/i.test(d[6]) ? d[6] : '0x' + d[6], off: d[7] };
    var msg = e.msg, rx = function (re) { var m = re.exec(msg); return m ? m[1].trim() : ''; };
    return { app: rx(/(?:Faulting application name|Имя сбойного приложения):\s*([^,\s]+)/i), appVer: rx(/(?:Faulting application name|Имя сбойного приложения):\s*[^,]+,\s*(?:version|версия):\s*([\d.]+)/i), mod: rx(/(?:Faulting module name|Имя сбойного модуля):\s*([^,]+?),/i), modVer: '', code: rx(/(?:Exception code|Код исключения):\s*(0x[0-9a-f]+)/i), off: rx(/(?:Fault offset|Смещение ошибки):\s*(0x[0-9a-f]+)/i) };
  }
  /* Правила: возвращают найденное или null. rel = относится к игре / важно для стабильности системы. */
  var EV_RULES = [
    { id: 'app-crash', test: function (e) { return e.id === 1000 && /Application Error/i.test(e.provider); }, build: function (e) {
      var f = faultInfo(e), cl = classifyModule(f.mod || '', ''), game = GAMEPROC.test(f.app), dwm = /^(dwm|explorer)\.exe$/i.test(f.app), cn = EXC[parseInt(f.code, 16)] || '';
      var where = (f.mod || '?') + (f.off ? '+0x' + f.off.replace(/^0x/i, '').replace(/^0+(?=.)/, '') : '');
      return { rel: game || dwm, sev: game ? 'err' : 'warn', title: (dwm ? 'Системный процесс ' : '') + f.app + ' упал в ' + where + (f.code ? ' (' + f.code + (cn ? ' ' + cn : '') + ')' : ''),
        cause: dwm ? 'Диспетчер окон Windows упал: признак сбоя графики (драйвер видеокарты, оверлей, разгон) или нехватки памяти. Игра в такие моменты теряет окно и может упасть.' : 'Windows записала аварийное завершение процесса ' + f.app + (f.appVer ? ' (версия ' + f.appVer + ')' : '') + '. Модуль-виновник: ' + (f.mod || 'не указан') + (cl.label ? ' (' + cl.label + ')' : '') + '.',
        detail: [f.app, f.mod, f.code, f.off, f.modVer].join('|'), cls: cl.cls, mod: f.mod, code: f.code, off: f.off, modVer: f.modVer, app: f.app };
    } },
    { id: 'app-hang', test: function (e) { return e.id === 1002 && /Application Hang/i.test(e.provider); }, build: function (e) { var f = /(?:Program|Программа)\s+(\S+)/i.exec(e.msg), nm = (e.data && e.data[0]) || (f ? f[1] : '?'), game = GAMEPROC.test(nm + ' ' + e.msg); return { rel: game, sev: 'warn', detail: nm, title: 'Приложение зависло: ' + nm, cause: game ? 'Игра или лаунчер перестали отвечать, и система закрыла их. Частая причина: нехватка памяти, диск, антивирус.' : '' }; } },
    { id: 'kernel-power', test: function (e) { return e.id === 41 && /Kernel-Power/i.test(e.provider); }, build: function (e) {
      var bc = /(?:BugcheckCode|BugCheckCode)\D*(\d+)/i.exec(e.msg), n = bc ? +bc[1] : 0;
      return { rel: true, sev: 'crit', title: 'Компьютер перезагрузился без штатного выключения' + (n ? ' (синий экран ' + hex(n) + (BUGCHECK[n] ? ' ' + BUGCHECK[n] : '') + ')' : ''), cause: n ? 'Это был синий экран. ' + (BUGCHECK[n] || 'Код см. по справочнику BugCheck.') : 'Питание пропало или система зависла: перегрев, блок питания, разгон, нестабильная память или драйвер.', fix: ['Проверить температуры процессора и видеокарты под нагрузкой.', 'Сбросить разгон, проверить блок питания и оперативную память.', 'Обновить драйверы видеокарты и чипсета.'] };
    } },
    { id: 'bugcheck', test: function (e) { return e.id === 1001 && /BugCheck|SystemErrorReporting/i.test(e.provider); }, build: function (e) { var m = /0x([0-9a-f]{1,8})/i.exec(e.msg || (e.data && e.data[0]) || ''), n = m ? parseInt(m[1], 16) : 0; return { rel: true, sev: 'crit', title: 'Синий экран ' + (m ? hex(n) : '') + (BUGCHECK[n] ? ' ' + BUGCHECK[n] : ''), cause: 'Windows упала с синим экраном: это проблема системы или драйвера, а не клиента игры.', fix: ['Обновить драйверы, проверить ОЗУ (MemTest), температуры и разгон.'] }; } },
    { id: 'unexpected-shutdown', test: function (e) { return e.id === 6008; }, build: function () { return { rel: true, sev: 'warn', title: 'Предыдущее выключение было нештатным', cause: 'Компьютер выключили кнопкой, либо он завис или отключился питанием.' }; } },
    { id: 'gpu-tdr', test: function (e) { return (e.id === 4101 && /Display/i.test(e.provider)) || /^(nvlddmkm|amdkmdag|atikmpag)/i.test(e.provider) || (/nvlddmkm|amdkmdag|atikmpag|igfx/i.test(e.provider + ' ' + e.msg) && /(stopped responding|перестал отвечать|reset|сброс|восстановлен|recovered)/i.test(e.msg)); }, build: function () { return { rel: true, sev: 'err', title: 'Драйвер видеокарты завис и был перезапущен (TDR)', cause: 'Видеокарта не ответила вовремя, Windows сбросила драйвер. Игра в такой момент теряет графику и падает. Причины: драйвер, перегрев, разгон, нехватка питания.', fix: ['Чистая установка драйвера (DDU), сброс разгона, проверка температур.', 'Вернуть заводские частоты и напряжение видеокарты: разгон и андервольт (MSI Afterburner, профили в панели AMD/NVIDIA) — частая причина сбросов. Увеличение TdrDelay в реестре причину не лечит, только откладывает сброс.', 'Отключить оверлеи, проверить блок питания.'] }; } },
    { id: 'disk', test: function (e) { return e.level !== 'Information' && (/^(disk|stornvme|storahci|iaStor|ntfs|volmgr|Microsoft-Windows-Ntfs)/i.test(e.provider) && [7, 11, 51, 55, 98, 117, 129, 153, 157].indexOf(e.id) >= 0); }, build: function (e) { return { rel: true, sev: 'err', title: 'Ошибки диска или файловой системы (' + e.provider + ', ' + e.id + ')', cause: 'Windows фиксирует ошибки чтения / записи диска. Из-за них повреждается кеш игры и выдаются ошибки загрузки ресурсов (ERR_SYS_FILELOAD, ERR_FIL_PACK).', fix: ['Проверить SMART диска (CrystalDiskInfo) и выполнить chkdsk /f.', 'Перенести игру на здоровый диск (лучше SSD), «Очистить кеш» в лаунчере.'] }; } },
    { id: 'mem-exhaust', test: function (e) { return e.id === 2004 || /Resource-Exhaustion/i.test(e.provider); }, build: function (e) { return { rel: true, sev: 'err', title: 'Windows предупредила о нехватке памяти', cause: 'Система исчерпала виртуальную память: игре не хватает ОЗУ и файла подкачки, она может упасть или зависнуть.', fix: ['Закрыть тяжёлые программы (браузер, запись экрана).', 'Включить файл подкачки по выбору системы или задать 16 ГБ и больше.'] }; } },
    { id: 'dotnet', test: function (e) { return e.id === 1026 && /\.NET/i.test(e.provider); }, build: function (e) { var game = GAMEPROC.test(e.msg); return { rel: game, sev: 'warn', detail: e.msg.slice(0, 60), title: '.NET приложение упало' + (game ? ' (лаунчер / компонент игры)' : ''), cause: game ? 'Необработанное исключение в .NET-компоненте, связанном с игрой.' : '' }; } },
    { id: 'wer-leak', test: function (e) { return e.id === 1001 && /Windows Error Reporting/i.test(e.provider) && /RADAR_PRE_LEAK|MEMORY_LEAK/i.test((e.data || []).join(' ') + ' ' + e.msg); }, build: function (e) { var d = e.data || [], nm = d[5] || (/P1:\s*(\S+)/.exec(e.msg) || [])[1] || '?', game = GAMEPROC.test(nm + ' ' + e.msg); return { rel: game, sev: 'warn', detail: nm, title: 'Утечка памяти в процессе ' + nm, cause: 'Windows зафиксировала, что процесс игры раздул память и не отдавал её обратно. После долгой игры это кончается нехваткой памяти и вылетом.', fix: ['Закрыть лишнее в фоне (браузер, запись, оверлеи), увеличить файл подкачки.', 'Если вылет всегда после нескольких часов игры, перезапускать игру чаще.'] }; } },
    { id: 'live-kernel', test: function (e) { return (e.id === 117 || e.id === 141) && /Display|nvlddmkm|amdkmdag|LiveKernel|WER/i.test(e.provider + ' ' + e.msg) || /LiveKernelEvent/i.test((e.data || []).join(' ') + ' ' + e.msg); }, build: function (e) { return { rel: true, sev: 'err', detail: 'lke', title: 'Сбой видеодрайвера на уровне ядра (LiveKernelEvent)', cause: 'Видеокарта или её драйвер зависли, и Windows пришлось сбросить их. Игра при этом теряет окно или падает.', fix: ['Чисто переустановить драйвер видеокарты (DDU), проверить температуру и питание.', 'Снять разгон видеокарты и памяти, отключить оверлеи.'] }; } },
    { id: 'whea', test: function (e) { return /WHEA/i.test(e.provider); }, build: function (e) { return { rel: true, sev: 'crit', detail: 'whea', title: 'Аппаратная ошибка (WHEA)', cause: 'Процессор, память или шина PCIe сообщили об аппаратной ошибке. Чаще всего это разгон, нестабильное напряжение или неисправная память.', fix: ['Сбросить разгон и XMP/EXPO в BIOS, проверить память MemTest86.', 'Проверить температуры и блок питания.'] }; } },
    { id: 'net-link', test: function (e) { return (/NetworkProfile/i.test(e.provider) && e.id === 10001) || (/e1dexpress|e2f|rt640|rtl|Netwtw|Netwlv|ndis|Tcpip|NETwNs/i.test(e.provider) && [27, 10400, 32, 4202].indexOf(e.id) >= 0) || (e.id === 27 && /network link is disconnected|сетевое подключение разорвано/i.test(e.msg)); }, build: function () { return { rel: true, sev: 'warn', detail: 'net', title: 'Сетевой адаптер потерял связь', cause: 'Адаптер отключался во время сессии. Игра воспринимает это как потерю соединения с сервером.', fix: ['Проверить кабель или Wi-Fi, отключить энергосбережение сетевой карты, обновить драйвер.'] }; } },
    { id: 'defender', test: function (e) { return /Windows Defender/i.test(e.provider) && [1116, 1117, 1118, 1119, 5007].indexOf(e.id) >= 0 && /majestic|gta|rage|launcher|altv|ragemp/i.test(e.msg); }, build: function (e) { return { rel: true, sev: 'warn', detail: e.msg.slice(0, 60), title: 'Защитник Windows среагировал на файлы игры', cause: 'Антивирус мог удалить или заблокировать файл клиента. Это ломает запуск или вызывает вылет.', fix: ['Добавить папки Majestic и GTA V в исключения Защитника, затем проверить целостность файлов.'] }; } },
  ];
  function SYS_REL(e) { return isRelevant(e); }
  function isRelevant(e) { for (var i = 0; i < EV_RULES.length; i++) if (EV_RULES[i].test(e)) return !!EV_RULES[i].build(e).rel; return false; }
  function analyzeEvents(evts, o) {
    o = o || {}; var groups = {}, order = [], total = evts.length, relevant = 0, old = 0;
    /* окно анализа: 14 суток до самого свежего события (или до времени дампа); старые записи только считаются */
    var anchor = o.refMs || evts.reduce(function (m, e) { return e.ms > m ? e.ms : m; }, 0), from = anchor ? anchor - (o.days || 14) * 86400000 : 0, to = o.refMs ? o.refMs + 3 * 86400000 : Infinity;
    evts.forEach(function (e) {
      if (e.ms && (e.ms < from || e.ms > to)) { if (SYS_REL(e)) old++; return; }
      for (var i = 0; i < EV_RULES.length; i++) {
        var R = EV_RULES[i]; if (!R.test(e)) continue;
        var b = R.build(e); if (!b.rel) return; relevant++;
        var key = R.id + ':' + (b.detail || b.title), g = groups[key];
        if (!g) { g = groups[key] = { id: R.id, sev: b.sev, title: b.title, cause: b.cause || '', fix: b.fix || [], count: 0, first: e.ms, last: e.ms, utc: e.utc, cls: b.cls || '', mod: b.mod || '', code: b.code || '', near: false, same: false, off: b.off || '', modVer: b.modVer || '', app: b.app || '' }; order.push(g); }
        g.count++; g.first = Math.min(g.first, e.ms || g.first); g.last = Math.max(g.last, e.ms || g.last);
        if (o.refMs && e.ms && Math.abs(e.ms - o.refMs) <= (o.windowMs || 600000)) g.near = true;
        if (o.fault && g.mod && g.off && g.mod.toLowerCase() === o.fault.module.toLowerCase()) { try { if (BigInt('0x' + g.off.replace(/^0x/i, '')) === BigInt(o.fault.offset)) g.same = true; } catch (er) {} }
        return;
      }
    });
    var rank = { crit: 0, err: 1, warn: 2, info: 3 };
    order.sort(function (a, b) { return ((b.same ? 1 : 0) - (a.same ? 1 : 0)) || (b.near - a.near) || (rank[a.sev] - rank[b.sev]) || (b.count - a.count) || (b.last - a.last); });
    return { findings: order, total: total, relevant: relevant, older: old, days: o.days || 14 };
  }

  /* Краткое описание события для ленты: { title, sev } или null, если событие не важно для игры. */
  function eventBrief(e) { for (var i = 0; i < EV_RULES.length; i++) if (EV_RULES[i].test(e)) { var b = EV_RULES[i].build(e); return b.rel ? { id: EV_RULES[i].id, title: b.title, sev: b.sev } : null; } return null; }
  /* Сверка времени дампа (UTC) с местным временем строки лога (wallMs = местные часы как UTC-метка).
     Возвращает { tzMin, resSec, ok }: ok = разница кратна 30 минутам (часовой пояс) с точностью до residualMax секунд, то есть это тот же запуск. */
  function matchTime(dumpMs, wallMs, residualMax) {
    var diff = dumpMs - wallMs, q = Math.round(diff / 1800000) * 1800000, res = diff - q, mx = (residualMax || 90) * 1000;
    return { tzMin: Math.round(q / 60000), resSec: Math.round(res / 1000), ok: Math.abs(res) <= mx && Math.abs(q) <= 14 * 3600000, diffMin: Math.round(diff / 60000) };
  }

  /* Сравнение двух сводок дампов (summarizeDump): что поменялось между падениями. */
  function compareDumps(a, b) {
    var out = [], va = a.ver || {}, vb = b.ver || {};
    if (va.client !== vb.client && (va.client || vb.client)) out.push('Версия клиента: ' + (va.client || '?') + ' → ' + (vb.client || '?'));
    if (va.gpu && vb.gpu && va.gpu.ver !== vb.gpu.ver) out.push('Драйвер видеокарты: ' + (va.gpu.num || va.gpu.ver) + ' → ' + (vb.gpu.num || vb.gpu.ver));
    else if (!!va.gpu !== !!vb.gpu) out.push('Драйвер видеокарты ' + (va.gpu ? 'пропал из списка модулей' : 'появился в списке модулей'));
    if (a.win && b.win && a.win !== b.win) out.push('Сборка Windows: ' + a.win + ' → ' + b.win);
    var ma = {}, mb = {}; (a.mv || []).forEach(function (x) { var p = x.split('|'); ma[p[0].toLowerCase()] = p[1]; }); (b.mv || []).forEach(function (x) { var p = x.split('|'); mb[p[0].toLowerCase()] = p[1]; });
    var added = Object.keys(mb).filter(function (k) { return !(k in ma); }), gone = Object.keys(ma).filter(function (k) { return !(k in mb); });
    var ov = function (k) { var r = classifyModule(k, ''); return r.cls === 'overlay' || r.cls === 'av' || r.cls === 'mod' || r.cls === 'anticheat'; };
    var addedSus = added.filter(ov), goneSus = gone.filter(ov);
    if (addedSus.length) out.push('Появились подозрительные модули: ' + addedSus.slice(0, 5).join(', '));
    if (goneSus.length) out.push('Исчезли подозрительные модули: ' + goneSus.slice(0, 5).join(', '));
    var other = added.length - addedSus.length + gone.length - goneSus.length; if (other > 0) out.push('Прочих загруженных модулей изменилось: ' + other);
    var sameFault = a.fault && b.fault && a.fault.text === b.fault.text;
    out.push(sameFault ? 'Место сбоя то же: ' + a.fault.text : 'Место сбоя разное: ' + (a.fault ? a.fault.text : '?') + ' и ' + (b.fault ? b.fault.text : '?'));
    return out;
  }
  /* ---------- Вывод для ИИ и общего разбора ---------- */
  function fmtTime(ms, utc) { if (!ms) return ''; var s = new Date(ms).toISOString().replace('T', ' ').slice(0, 16); return s + (utc ? ' UTC' : ''); }
  function aiInput(sys, hint) {
    var L = [];
    if (hint) L.push('КОНТЕКСТ ЛОГА: ' + hint);
    if (sys.dump) {
      var d = sys.dump, a = sys.dump.an;
      L.push('МИНИДАМП:'); a.facts.forEach(function (x) { L.push('- ' + x); });
      if (a.frames.length) L.push('Стек (первые 8, scan = эвристика): ' + a.frames.slice(0, 8).map(function (x) { return x.text; }).join(' <- '));
      if (d.mods.length) L.push('Модули: ' + d.mods.slice(0, 20).join('; '));
      L.push('Всего модулей: ' + d.nMods + ', потоков: ' + d.nThreads + '. Предварительный вывод правил: ' + a.title + '.');
    }
    if (sys.ev) {
      L.push('ЖУРНАЛ СОБЫТИЙ WINDOWS (за 3 дня, только значимое для игры и стабильности), всего записей ' + sys.ev.an.total + ':');
      sys.ev.an.findings.slice(0, 10).forEach(function (g) { L.push('- ×' + g.count + (g.same ? ' [то же место, что в дампе]' : '') + (g.near ? ' [рядом с падением]' : '') + ' ' + g.title + (g.last ? ' | последний ' + fmtTime(g.last, g.utc) : '')); });
      if (!sys.ev.an.findings.length) L.push('- значимых событий не найдено');
    }
    L.push('Верни JSON по схеме. Оцени, это сбой игры, драйвера, системы или железа.');
    return L.join('\n').slice(0, 3500);
  }
  function briefLine(sys) {
    var p = [];
    if (sys.dump) p.push('дамп: ' + sys.dump.an.title + (sys.dump.fault ? ' [' + sys.dump.fault.text + ']' : ''));
    if (sys.ev && sys.ev.an.findings.length) p.push('журнал Windows: ' + sys.ev.an.findings.slice(0, 3).map(function (g) { return g.title.slice(0, 80) + (g.count > 1 ? ' ×' + g.count : ''); }).join('; '));
    return p.join(' | ').slice(0, 500);
  }

  /* Компактный вид дампа: без BigInt и списка всех модулей, безопасно хранить в базе. */
  function summarizeDump(d, name) {
    var an = analyzeDump(d), mods = d.modules.filter(function (m) { return m.cls && m.cls !== 'system' && m.cls !== 'other'; }).map(function (m) { return m.name + ' [' + m.label + ']'; });
    return { name: name || '', size: d.size, timeMs: d.timeMs, nMods: d.modules.length, nThreads: d.threads.length, mods: mods.slice(0, 30),
      ver: versionInfo(d), mv: d.modules.filter(function (m) { return m.cls !== 'system' && m.ver; }).slice(0, 140).map(function (m) { return m.name + '|' + m.ver; }), win: d.system ? d.system.build : 0,
      strings: d.strings || null,
      misc: d.misc ? { pid: d.misc.pid, createMs: d.misc.createMs || 0, uptimeSec: d.misc.uptimeSec == null ? null : d.misc.uptimeSec } : null, vm: d.vm || null, mem: d.mem || null, thread: d.exception && d.threadNames ? d.threadNames[d.exception.threadId] || '' : '',
      fault: d.fault ? { text: d.fault.text, module: d.fault.module, cls: d.fault.cls, offset: '0x' + d.fault.offset.toString(16) } : null,
      an: { known: !!an.known, sev: an.sev, title: an.title, cause: an.cause, fix: an.fix, facts: an.facts, suspects: an.suspects.slice(0, 10), frames: an.frames.slice(0, 16).map(function (x) { return { text: x.text, cls: x.cls, trust: x.trust }; }) } };
  }
  function summarizeEvents(an, name) { return { name: name || '', an: { total: an.total, relevant: an.relevant, older: an.older, findings: an.findings.slice(0, 20) } }; }
  return { sigOf: sigOf, matchSig: matchSig, cmpVer: cmpVer, KNOWN: KNOWN, compareDumps: compareDumps, versionInfo: versionInfo, eventBrief: eventBrief, matchTime: matchTime, isRelevant: isRelevant, summarizeDump: summarizeDump, summarizeEvents: summarizeEvents, parseEvtx: parseEvtx, isEvtx: isEvtx, parseDump: parseDump, analyzeDump: analyzeDump, parseEvents: parseEvents, analyzeEvents: analyzeEvents, aiInput: aiInput, briefLine: briefLine, classifyModule: classifyModule, bufReader: bufReader, fileReader: fileReader, EXC: EXC, BUGCHECK: BUGCHECK };
});

export function definePluginSettings(d: any) { const store: any = {}; for (const k in d) store[k] = d[k].default; (globalThis as any).__vcSettings = store; return { store, def: d }; }

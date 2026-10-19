const g: any = globalThis;
export const ChannelStore = { getChannel: (id: string) => g.__stores.ChannelStore.getChannel(id) };
export const MessageStore = { getMessage: (c: string, m: string) => g.__stores.MessageStore.getMessage(c, m), getMessages: (c: string) => g.__stores.MessageStore.getMessages(c) };
export const JoinedThreadsStore = { hasJoined: (id: string) => g.__stores.JoinedThreadsStore.hasJoined(id) };
/* как в Vencord с октября 2026: showToast({ text, variant }) */
export function showToast(d: any) { const v = d && d.variant; g.__toasts.push([d && d.text, v === 'success' ? 'success' : v === 'critical' ? 'failure' : 'message']); }
export const React = { createElement: (t: any, p: any, ...c: any[]) => ({ t, p, c }) };
export const Button: any = function () { return null; }; Button.Sizes = { SMALL: "small" };
export const SelectedChannelStore = { getChannelId: () => g.__selCh || "" };
export const UserStore = { getCurrentUser: () => (g.__me ? { id: g.__me } : null) };

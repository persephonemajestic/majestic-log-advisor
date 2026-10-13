const g: any = globalThis;
export const ChannelStore = { getChannel: (id: string) => g.__stores.ChannelStore.getChannel(id) };
export const MessageStore = { getMessage: (c: string, m: string) => g.__stores.MessageStore.getMessage(c, m), getMessages: (c: string) => g.__stores.MessageStore.getMessages(c) };
export const JoinedThreadsStore = { hasJoined: (id: string) => g.__stores.JoinedThreadsStore.hasJoined(id) };
export function showToast(m: string, t?: string) { g.__toasts.push([m, t]); }
export const React = { createElement: (t: any, p: any, ...c: any[]) => ({ t, p, c }) };
export const Button: any = function () { return null; }; Button.Sizes = { SMALL: "small" };
export const SelectedChannelStore = { getChannelId: () => g.__selCh || "" };

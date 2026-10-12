const g: any = globalThis;
export const ChannelStore = { getChannel: (id: string) => g.__stores.ChannelStore.getChannel(id) };
export const MessageStore = { getMessage: (c: string, m: string) => g.__stores.MessageStore.getMessage(c, m), getMessages: (c: string) => g.__stores.MessageStore.getMessages(c) };
export const JoinedThreadsStore = { hasJoined: (id: string) => g.__stores.JoinedThreadsStore.hasJoined(id) };
export function showToast(m: string, t?: string) { g.__toasts.push([m, t]); }

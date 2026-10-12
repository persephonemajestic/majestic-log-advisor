export enum OptionType { STRING, NUMBER, BIGINT, BOOLEAN, SELECT, SLIDER, COMPONENT, CUSTOM }
export type PluginNative<T> = any;
export default function definePlugin(p: any) { (globalThis as any).__vcPlugin = p; return p; }

// Messages between the notch (host) and a module frame. Both sides import this.

export type Lang = 'id' | 'en';

// `widget` names the widget a frame shows; module pages have none. `notching:view`
// tells a widget whether it covers the whole page (a full view, design 30 Oct §4).
export type HostMessage =
  | { type: 'notching:init'; moduleId: string; lang: Lang; widget?: string }
  | { type: 'notching:view'; full: boolean }
  | { type: 'notching:result'; id: number; ok: true; value: unknown }
  | { type: 'notching:result'; id: number; ok: false; error: string };

export type FrameMessage =
  | { type: 'notching:ready' }
  | { type: 'notching:call'; id: number; capability: string; method: string; args?: unknown }
  | { type: 'notching:key'; key: 'Escape' | 'Quit' }
  | { type: 'notching:expand'; height?: number } // height: the page height the full view wants
  | { type: 'notching:collapse' };

type Loose = Record<string, unknown>;
const isObject = (x: unknown): x is Loose => typeof x === 'object' && x !== null;

export function isHostMessage(x: unknown): x is HostMessage {
  if (!isObject(x)) return false;
  if (x.type === 'notching:init') {
    return typeof x.moduleId === 'string' && (x.lang === 'id' || x.lang === 'en')
      && (x.widget === undefined || typeof x.widget === 'string');
  }
  if (x.type === 'notching:view') return typeof x.full === 'boolean';
  if (x.type === 'notching:result') {
    return typeof x.id === 'number' && (x.ok === true || (x.ok === false && typeof x.error === 'string'));
  }
  return false;
}

export function isFrameMessage(x: unknown): x is FrameMessage {
  if (!isObject(x)) return false;
  switch (x.type) {
    case 'notching:ready':
    case 'notching:collapse':
      return true;
    case 'notching:expand':
      return x.height === undefined || (typeof x.height === 'number' && Number.isFinite(x.height));
    case 'notching:call':
      return typeof x.id === 'number' && typeof x.capability === 'string' && typeof x.method === 'string';
    case 'notching:key':
      return x.key === 'Escape' || x.key === 'Quit';
    default:
      return false;
  }
}

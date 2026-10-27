// Messages between the notch (host) and a module frame. Both sides import this.

export type Lang = 'id' | 'en';

export type HostMessage =
  | { type: 'notching:init'; moduleId: string; lang: Lang }
  | { type: 'notching:result'; id: number; ok: true; value: unknown }
  | { type: 'notching:result'; id: number; ok: false; error: string };

export type FrameMessage =
  | { type: 'notching:ready' }
  | { type: 'notching:call'; id: number; capability: string; method: string; args?: unknown }
  | { type: 'notching:key'; key: 'Escape' | 'Quit' };

type Loose = Record<string, unknown>;
const isObject = (x: unknown): x is Loose => typeof x === 'object' && x !== null;

export function isHostMessage(x: unknown): x is HostMessage {
  if (!isObject(x)) return false;
  if (x.type === 'notching:init') return typeof x.moduleId === 'string' && (x.lang === 'id' || x.lang === 'en');
  if (x.type === 'notching:result') {
    return typeof x.id === 'number' && (x.ok === true || (x.ok === false && typeof x.error === 'string'));
  }
  return false;
}

export function isFrameMessage(x: unknown): x is FrameMessage {
  if (!isObject(x)) return false;
  switch (x.type) {
    case 'notching:ready':
      return true;
    case 'notching:call':
      return typeof x.id === 'number' && typeof x.capability === 'string' && typeof x.method === 'string';
    case 'notching:key':
      return x.key === 'Escape' || x.key === 'Quit';
    default:
      return false;
  }
}

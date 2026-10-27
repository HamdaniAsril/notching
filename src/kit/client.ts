import { type FrameMessage, isHostMessage, type Lang } from './protocol';

// What a module sees of the notch.
export interface Kit {
  readonly moduleId: string;
  readonly lang: Lang;
  call<T>(capability: string, method: string, args?: unknown): Promise<T>;
}

// Resolves when the host says hello. Only messages from the parent window count;
// '*' as the target because the module cannot know the notch page's origin.
export function connectKit(win: Window = window): Promise<Kit> {
  const post = (msg: FrameMessage) => win.parent.postMessage(msg, '*');
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;

  return new Promise(resolve => {
    win.addEventListener('message', e => {
      if (e.source !== win.parent || !isHostMessage(e.data)) return;
      const msg = e.data;
      if (msg.type === 'notching:init') {
        resolve({
          moduleId: msg.moduleId,
          lang: msg.lang,
          call<T>(capability: string, method: string, args?: unknown): Promise<T> {
            const id = nextId++;
            return new Promise<T>((res, rej) => {
              pending.set(id, { resolve: res as (v: unknown) => void, reject: rej });
              post(args === undefined
                ? { type: 'notching:call', id, capability, method }
                : { type: 'notching:call', id, capability, method, args });
            });
          },
        });
        post({ type: 'notching:ready' });
        return;
      }
      const waiting = pending.get(msg.id);
      if (!waiting) return;
      pending.delete(msg.id);
      if (msg.ok) waiting.resolve(msg.value);
      else waiting.reject(new Error(msg.error));
    });

    // Focus can sit inside the module after a click, so Esc and Cmd+Q are passed up.
    win.document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        post({ type: 'notching:key', key: 'Escape' });
      } else if (e.metaKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        post({ type: 'notching:key', key: 'Quit' });
      }
    });
  });
}

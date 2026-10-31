import { type FrameMessage, isHostMessage, type Lang } from './protocol';

// What a module sees of the notch.
export interface Kit {
  readonly moduleId: string;
  readonly lang: Lang;
  readonly widget: string | null; // the widget this frame shows; null on a module page
  call<T>(capability: string, method: string, args?: unknown): Promise<T>;
  expand(height?: number): void; // asks to cover the whole page, made this tall if it can
  collapse(): void;
  lamp(on: boolean, color?: string, glow?: string): void; // Cermin's lamp on the panel; colors "#rrggbb"
  onView(cb: (full: boolean) => void): void;
}

// Resolves when the host says hello. Only messages from the parent window count;
// '*' as the target because the module cannot know the notch page's origin.
export function connectKit(win: Window = window): Promise<Kit> {
  const post = (msg: FrameMessage) => win.parent.postMessage(msg, '*');
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  const views: ((full: boolean) => void)[] = [];

  return new Promise(resolve => {
    win.addEventListener('message', e => {
      if (e.source !== win.parent || !isHostMessage(e.data)) return;
      const msg = e.data;
      if (msg.type === 'notching:view') {
        views.forEach(cb => cb(msg.full));
        return;
      }
      if (msg.type === 'notching:init') {
        resolve({
          moduleId: msg.moduleId,
          lang: msg.lang,
          widget: msg.widget ?? null,
          expand: height => post(height === undefined ? { type: 'notching:expand' } : { type: 'notching:expand', height }),
          collapse: () => post({ type: 'notching:collapse' }),
          lamp: (on, color, glow) => post({ type: 'notching:lamp', on, ...(color && { color }), ...(glow && { glow }) }),
          onView: cb => { views.push(cb); },
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

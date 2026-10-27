import type { Bridge } from '../bridge';
import type { HostStrings } from '../i18n';
import { type HostMessage, isFrameMessage, type Lang } from '../kit/protocol';
import type { ModuleInfo } from './types';

// A module that has not said "ready" by then gets the load-error text.
export const READY_TIMEOUT_MS = 3000;

export interface FrameHostDeps {
  bridge: Pick<Bridge, 'moduleCall' | 'moduleUrl' | 'moduleSandbox'>;
  setTimer: (fn: () => void, ms: number) => () => void;
  onKey: (key: 'Escape' | 'Quit') => void;
}

export interface FrameHost {
  readonly current: string | null; // id of the module whose frame is up
  show(module: ModuleInfo | null, lang: Lang, strings: HostStrings): void;
  clear(): void;
  destroy(): void;
}

// Each card runs in a sandboxed frame with an opaque origin: it cannot reach
// Tauri or this page. It talks only through postMessage, and a module is known by
// which frame a message comes from, never by what the message claims.
export function mountFrameHost(container: HTMLElement, deps: FrameHostDeps): FrameHost {
  const doc = container.ownerDocument;
  const view = doc.defaultView!;
  let frame: HTMLIFrameElement | null = null;
  let current: string | null = null;
  let currentLang: Lang | null = null;
  let cancelReady: (() => void) | null = null;

  function reset(): void {
    cancelReady?.();
    cancelReady = null;
    frame = null;
    current = null;
    currentLang = null;
    container.replaceChildren();
  }

  function text(cls: string, value: string): HTMLDivElement {
    const d = doc.createElement('div');
    d.className = cls;
    d.textContent = value;
    return d;
  }

  // Only to the frame the request came from, and only while it is still up.
  function reply(to: HTMLIFrameElement, msg: HostMessage): void {
    if (to === frame) to.contentWindow?.postMessage(msg, '*');
  }

  function onMessage(e: MessageEvent): void {
    if (!frame || e.source !== frame.contentWindow || !isFrameMessage(e.data)) return;
    const msg = e.data;
    const from = frame;
    const moduleId = current!;
    if (msg.type === 'notching:ready') {
      cancelReady?.();
      cancelReady = null;
    } else if (msg.type === 'notching:key') {
      deps.onKey(msg.key);
    } else {
      deps.bridge.moduleCall(moduleId, msg.capability, msg.method, msg.args).then(
        value => reply(from, { type: 'notching:result', id: msg.id, ok: true, value }),
        err => reply(from, { type: 'notching:result', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  view.addEventListener('message', onMessage);

  return {
    get current() { return current; },
    show(module, lang, strings) {
      if (module && frame && module.id === current && lang === currentLang) return;
      reset();
      if (!module) {
        const empty = text('notch-empty', '');
        empty.append(text('big', strings.emptyTitle), text('lab', strings.emptyHint));
        container.append(empty);
        return;
      }
      const f = doc.createElement('iframe');
      f.className = 'module-frame';
      f.setAttribute('sandbox', deps.bridge.moduleSandbox);
      f.title = module.name;
      f.style.height = `${module.card.height}px`;
      f.addEventListener('load', () => reply(f, { type: 'notching:init', moduleId: module.id, lang }));
      f.src = deps.bridge.moduleUrl(module.id, module.entry);
      frame = f;
      current = module.id;
      currentLang = lang;
      container.append(f);
      cancelReady = deps.setTimer(() => {
        cancelReady = null;
        if (f !== frame) return;
        reset();
        const error = text('notch-error', '');
        error.append(text('lab', strings.loadFailed));
        container.append(error);
      }, READY_TIMEOUT_MS);
    },
    clear: reset,
    destroy() {
      reset();
      view.removeEventListener('message', onMessage);
    },
  };
}

import type { Bridge } from '../bridge';
import type { HostStrings } from '../i18n';
import { type HostMessage, isFrameMessage, type Lang } from '../kit/protocol';

// A frame that has not said "ready" by then gets the load-error text.
export const READY_TIMEOUT_MS = 3000;

// One sandboxed frame: a widget on a page (`widget` set) or a module's page.
export interface FrameSpec {
  key: string;
  moduleId: string;
  entry: string;
  widget: string | null;
  title: string;
  height: number;
}

export interface FrameHostDeps {
  bridge: Pick<Bridge, 'moduleCall' | 'moduleUrl' | 'moduleSandbox'>;
  setTimer: (fn: () => void, ms: number) => () => void;
  onKey: (key: 'Escape' | 'Quit') => void;
  onExpand: (key: string, height?: number) => void;
  onCollapse: (key: string) => void;
}

export interface FrameHost {
  frame(spec: FrameSpec, lang: Lang, strings: HostStrings): HTMLElement; // the same box while key and lang hold
  keep(keys: string[]): void; // drops every other frame
  setFull(key: string, full: boolean): void;
  clear(): void;
  destroy(): void;
}

interface Entry {
  spec: FrameSpec;
  lang: Lang;
  box: HTMLElement;
  iframe: HTMLIFrameElement | null;
  cancelReady: (() => void) | null;
}

// Each frame has an opaque origin: it cannot reach Tauri or this page. It talks
// only through postMessage, and its package is known by which frame a message
// comes from, never by what the message claims.
export function mountFrameHost(deps: FrameHostDeps, doc: Document): FrameHost {
  const view = doc.defaultView!;
  const entries = new Map<string, Entry>();

  function drop(e: Entry): void {
    e.cancelReady?.();
    e.cancelReady = null;
    e.iframe = null;
    e.box.remove();
    entries.delete(e.spec.key);
  }

  // Only to a frame that is still up.
  function reply(e: Entry, to: HTMLIFrameElement, msg: HostMessage): void {
    if (entries.get(e.spec.key) === e && e.iframe === to) to.contentWindow?.postMessage(msg, '*');
  }

  function onMessage(ev: MessageEvent): void {
    if (!isFrameMessage(ev.data)) return;
    const e = [...entries.values()].find(x => x.iframe && ev.source === x.iframe.contentWindow);
    if (!e || !e.iframe) return;
    const msg = ev.data;
    const from = e.iframe;
    if (msg.type === 'notching:ready') {
      e.cancelReady?.();
      e.cancelReady = null;
    } else if (msg.type === 'notching:key') {
      deps.onKey(msg.key);
    } else if (msg.type === 'notching:expand') {
      deps.onExpand(e.spec.key, msg.height);
    } else if (msg.type === 'notching:collapse') {
      deps.onCollapse(e.spec.key);
    } else {
      deps.bridge.moduleCall(e.spec.moduleId, msg.capability, msg.method, msg.args).then(
        value => reply(e, from, { type: 'notching:result', id: msg.id, ok: true, value }),
        err => reply(e, from, { type: 'notching:result', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  view.addEventListener('message', onMessage);

  return {
    frame(spec, lang, strings) {
      const old = entries.get(spec.key);
      if (old && old.lang === lang && JSON.stringify(old.spec) === JSON.stringify(spec)) return old.box;
      if (old) drop(old);
      const box = doc.createElement('div');
      box.className = 'pg-frame';
      const f = doc.createElement('iframe');
      f.className = 'module-frame';
      f.setAttribute('sandbox', deps.bridge.moduleSandbox);
      f.title = spec.title;
      f.style.height = `${spec.height}px`;
      const init: HostMessage = spec.widget === null
        ? { type: 'notching:init', moduleId: spec.moduleId, lang }
        : { type: 'notching:init', moduleId: spec.moduleId, lang, widget: spec.widget };
      const e: Entry = { spec, lang, box, iframe: f, cancelReady: null };
      f.addEventListener('load', () => reply(e, f, init));
      f.src = deps.bridge.moduleUrl(spec.moduleId, spec.entry);
      box.append(f);
      e.cancelReady = deps.setTimer(() => {
        e.cancelReady = null;
        if (entries.get(spec.key) !== e) return;
        e.iframe = null;
        const err = doc.createElement('div');
        err.className = 'pg-error lab';
        err.textContent = strings.loadFailed;
        box.replaceChildren(err);
      }, READY_TIMEOUT_MS);
      entries.set(spec.key, e);
      return box;
    },
    keep(keys) {
      for (const e of [...entries.values()]) if (!keys.includes(e.spec.key)) drop(e);
    },
    setFull(key, full) {
      const e = entries.get(key);
      if (e?.iframe) reply(e, e.iframe, { type: 'notching:view', full });
    },
    clear() {
      for (const e of [...entries.values()]) drop(e);
    },
    destroy() {
      for (const e of [...entries.values()]) drop(e);
      view.removeEventListener('message', onMessage);
    },
  };
}

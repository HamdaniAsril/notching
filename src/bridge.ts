import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { containsPoint, type Rect } from './notch/hit';

export interface ScreenInfo {
  label: string;
  hasNotch: boolean;
  notchWidth: number;
  notchHeight: number;
}

// CSS px of the overlay window.
export interface PointerUpdate {
  inside: boolean;
  x: number;
  y: number;
}

// What the notch needs from the native side.
export interface Bridge {
  screenInfo(): Promise<ScreenInfo>;
  setHitRects(rects: Rect[]): Promise<void>;
  setPanelKey(key: boolean): Promise<void>;
  onPointer(cb: (p: PointerUpdate) => void): () => void;
  onResignKey(cb: () => void): () => void;
  quit(): Promise<void>;
}

// Stand-in for the native side in a normal browser (`npm run dev`).
// `?notch=1` fakes a 164 × 32 notch. A click outside the hit rects plays the
// part of the panel losing key status.
export function browserBridge(root: HTMLElement): Bridge {
  const doc = root.ownerDocument;
  const hasNotch = new URLSearchParams(doc.defaultView?.location.search ?? '').get('notch') === '1';
  let rects: Rect[] = [];
  let inside = false;
  const pointerSubs = new Set<(p: PointerUpdate) => void>();
  const resignSubs = new Set<() => void>();

  const local = (e: MouseEvent) => {
    const box = root.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  doc.addEventListener('mousemove', e => {
    const { x, y } = local(e);
    const now = containsPoint(rects, x, y);
    if (!now && !inside) return;
    inside = now;
    pointerSubs.forEach(cb => cb({ inside: now, x, y }));
  });
  doc.documentElement.addEventListener('mouseleave', () => {
    if (!inside) return;
    inside = false;
    pointerSubs.forEach(cb => cb({ inside: false, x: 0, y: 0 }));
  });
  doc.addEventListener('click', e => {
    const { x, y } = local(e);
    if (!containsPoint(rects, x, y)) resignSubs.forEach(cb => cb());
  });

  return {
    screenInfo: async () => ({ label: 'browser', hasNotch, notchWidth: hasNotch ? 164 : 0, notchHeight: hasNotch ? 32 : 0 }),
    setHitRects: async r => { rects = r; },
    setPanelKey: async key => console.info('setPanelKey', key),
    onPointer: cb => { pointerSubs.add(cb); return () => pointerSubs.delete(cb); },
    onResignKey: cb => { resignSubs.add(cb); return () => resignSubs.delete(cb); },
    quit: async () => console.info('quit'),
  };
}

// Turns tauri's async listen() into the synchronous unsubscribe the Bridge promises.
function syncUnlisten(pending: Promise<UnlistenFn>): () => void {
  let unlisten: UnlistenFn | null = null;
  let disposed = false;
  void pending.then(fn => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

// The native side: commands in src-tauri/src/commands.rs, events emitted to this window.
export function tauriBridge(): Bridge {
  const win = getCurrentWebviewWindow();
  return {
    screenInfo: () => invoke<ScreenInfo>('get_screen_info'),
    setHitRects: rects => invoke('set_hit_rects', { rects }),
    setPanelKey: key => invoke('set_panel_key', { key }),
    onPointer: cb => syncUnlisten(win.listen<PointerUpdate>('notch://pointer', e => cb(e.payload))),
    onResignKey: cb => syncUnlisten(win.listen('notch://resign-key', () => cb())),
    quit: () => invoke('quit_app'),
  };
}

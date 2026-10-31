import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ModuleState } from './modules/types';
import type { Rect } from './notch/hit';

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

// A notice for this screen (NoticeDto in src-tauri/src/notify.rs). moduleId is
// null for the sample from the settings window.
export interface Notice {
  moduleId: string | null;
  channel: string | null; // its widget decides the page a click opens
  title: string;
  detail: string;
  glow: boolean;
  seconds: number;
}

// The statuses beside the notch, in the order they started (StatusDto in
// src-tauri/src/status.rs); `screen` is the overlay window they show on. moduleId
// is null for the sample.
export interface LiveStatus {
  screen: string;
  items: { moduleId: string | null; text: string }[];
}

// What the notch needs from the native side.
export interface Bridge {
  screenInfo(): Promise<ScreenInfo>;
  setHitRects(rects: Rect[]): Promise<void>;
  setPanelKey(key: boolean): Promise<void>;
  onPointer(cb: (p: PointerUpdate) => void): () => void;
  onResignKey(cb: () => void): () => void;
  quit(): Promise<void>;
  moduleState(): Promise<ModuleState>;
  onModuleState(cb: (s: ModuleState) => void): () => void;
  setLastPage(page: string): Promise<void>; // a page id, 'modules' or 'module:<id>'
  moduleCall(moduleId: string, capability: string, method: string, args?: unknown): Promise<unknown>;
  moduleUrl(id: string, file: string): string;
  readonly moduleSandbox: string;
  openSettings(): Promise<void>;
  onNotice(cb: (n: Notice) => void): () => void;
  status(): Promise<LiveStatus | null>;
  onStatus(cb: (s: LiveStatus | null) => void): () => void;
  clearMissed(): Promise<void>;
}

// Turns tauri's async listen() into the synchronous unsubscribe the Bridge promises.
export function syncUnlisten(pending: Promise<UnlistenFn>): () => void {
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
    moduleState: () => invoke<ModuleState>('get_module_state'),
    // Broadcast to every window, so app-wide.
    onModuleState: cb => syncUnlisten(listen<ModuleState>('notching://module-state', e => cb(e.payload))),
    setLastPage: page => invoke('set_last_page', { page }),
    moduleCall: (moduleId, capability, method, args) => invoke('module_call', { moduleId, capability, method, args }),
    // macOS form of a custom protocol URL; Windows will need http://notchmod.localhost/.
    moduleUrl: (id, file) => `notchmod://localhost/${id}/${file}`,
    moduleSandbox: 'allow-scripts',
    openSettings: () => invoke('open_settings'),
    // Sent to the overlay on the screen under the cursor only.
    onNotice: cb => syncUnlisten(win.listen<Notice>('notching://notice', e => cb(e.payload))),
    clearMissed: () => invoke('clear_missed'),
    status: () => invoke<LiveStatus | null>('get_status'),
    // Broadcast to every window; each keeps it only for its own screen.
    onStatus: cb => syncUnlisten(listen<LiveStatus | null>('notching://status', e => cb(e.payload))),
  };
}

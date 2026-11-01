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

// Titipan's shelf (ShelfDto in src-tauri/src/shelf.rs): the same on every screen.
export interface ShelfItem {
  id: number;
  name: string;
  folder: boolean;
  state: 'ready' | 'receiving' | 'missing';
  thumb: string | null; // a data URL
}

export interface ShelfState {
  items: ShelfItem[];
}

// A file drag reached this screen's notch, then left or was dropped (shelf_drop.rs).
export type ShelfDrop = { phase: 'start' } | { phase: 'end'; dropped: boolean };
// A drag out of the shelf left this panel, or ended (shelf_drag.rs).
export type ShelfDrag = { phase: 'left' | 'end' };

// One screenshot (ShotDto in src-tauri/src/shot_service.rs), newest first in the
// list; `image` (the current picture) and `thumb` are notchshot: URLs.
export interface Shot {
  id: number;
  kind: 'screen' | 'window' | 'area';
  takenMs: number;
  width: number;
  height: number;
  saved: boolean;
  image: string;
  thumb: string;
}

// A capture landed on this screen, or a screenshot left the history (to every window).
export type ShotEvent = { phase: 'taken' | 'gone'; id: number };
// A screenshot's key: ours, still the Mac's own, held by another app, or the module is off.
export type KeyState = 'ok' | 'mac' | 'other' | 'off';
export interface ShotKeys {
  screen: KeyState; // ⌘⇧3
  pick: KeyState; // ⌘⇧4
}
// A screenshot dragged out of this panel left it, or the drag ended (shelf_drag.rs).
export type ShotDrag = { phase: 'left' | 'end' };

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
  shelf(refresh: boolean): Promise<ShelfState>; // refresh: check every file is still there
  onShelf(cb: (s: ShelfState) => void): () => void;
  shelfRemove(ids: number[]): Promise<void>;
  shelfClear(): Promise<void>;
  shelfStartDrag(ids: number[]): Promise<void>;
  shelfDropReady(): Promise<void>; // the drop zone shows: catch the drop over the panel
  onShelfDrop(cb: (e: ShelfDrop) => void): () => void;
  onShelfDrag(cb: (e: ShelfDrag) => void): () => void;
  shotList(): Promise<Shot[]>;
  shotCopy(id: number): Promise<void>;
  shotSave(id: number): Promise<string>; // the Desktop file's path
  shotDelete(id: number): Promise<void>;
  shotTakeScreen(): Promise<void>; // the screen of this panel
  shotPick(mode: 'window' | 'area'): Promise<void>;
  shotStartDrag(id: number): Promise<void>;
  shotKeys(): Promise<ShotKeys>;
  shotPermission(): Promise<boolean>;
  openKeyboardShortcuts(): Promise<void>;
  openScreenRecordingSettings(): Promise<void>;
  openEditor(id: number): Promise<void>;
  onShot(cb: (e: ShotEvent) => void): () => void;
  onShots(cb: (list: Shot[]) => void): () => void;
  onShotDrag(cb: (e: ShotDrag) => void): () => void;
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
// The rule for events: one Rust sends with `emit_to` (to one window) is heard with
// `win.listen`; only one it broadcasts with `app.emit` uses the global `listen`.
// A global listener is registered for any target, and Tauri hands it every
// `emit_to` too, whichever window that names: each overlay, parked ones included,
// would act on an event meant for another. A `win.listen` still hears broadcasts.
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
    shelf: refresh => invoke<ShelfState>('shelf_state', { refresh }),
    // Broadcast to every window: one shelf for every screen.
    onShelf: cb => syncUnlisten(listen<ShelfState>('notching://shelf', e => cb(e.payload))),
    shelfRemove: ids => invoke('shelf_remove', { ids }),
    shelfClear: () => invoke('shelf_clear'),
    shelfStartDrag: ids => invoke('shelf_start_drag', { ids }),
    shelfDropReady: () => invoke('shelf_drop_ready'),
    // Sent to this overlay only.
    onShelfDrop: cb => syncUnlisten(win.listen<ShelfDrop>('notching://shelf-drop', e => cb(e.payload))),
    onShelfDrag: cb => syncUnlisten(win.listen<ShelfDrag>('notching://shelf-drag', e => cb(e.payload))),
    shotList: () => invoke<Shot[]>('shot_list'),
    shotCopy: id => invoke('shot_copy', { id }),
    shotSave: id => invoke<string>('shot_save', { id }),
    shotDelete: id => invoke('shot_delete', { id }),
    shotTakeScreen: () => invoke('shot_take_screen'),
    shotPick: mode => invoke('shot_pick', { mode }),
    shotStartDrag: id => invoke('shot_start_drag', { id }),
    shotKeys: () => invoke<ShotKeys>('shot_keys'),
    shotPermission: () => invoke<boolean>('shot_permission'),
    openKeyboardShortcuts: () => invoke('open_keyboard_shortcuts'),
    openScreenRecordingSettings: () => invoke('open_screen_recording_settings'),
    // The editor window's command comes with the editor (plan 11, task 7).
    openEditor: id => invoke('open_editor', { id }),
    // `taken` to this overlay only, `gone` to every window: each checks the id.
    onShot: cb => syncUnlisten(win.listen<ShotEvent>('notching://shot', e => cb(e.payload))),
    // Broadcast to every window: one history for every screen.
    onShots: cb => syncUnlisten(listen<Shot[]>('notching://shots', e => cb(e.payload))),
    // Sent to this overlay only.
    onShotDrag: cb => syncUnlisten(win.listen<ShotDrag>('notching://shot-drag', e => cb(e.payload))),
  };
}

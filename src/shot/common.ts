import type { Bridge, Shot } from '../bridge';
import type { Lang } from '../kit/protocol';

// What Screenshot's pages ask of the core, as the bridge has it.
export type ShotBridge = Pick<Bridge,
  | 'shotCopy' | 'shotSave' | 'shotDelete' | 'shotTakeScreen' | 'shotPick' | 'shotStartDrag' | 'shotKeys'
  | 'shotPermission' | 'openKeyboardShortcuts' | 'openScreenRecordingSettings' | 'openEditor' | 'onShot'>;

export interface ShotDeps extends ShotBridge {
  lang: Lang;
  now(): number;
  close(): Promise<void>; // settles once the panel has closed
}

// Drawn in currentColor, as in the mockups.
export const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
export const SAVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
export const SAVED_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const DELETE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(doc: Document, cls: string, text = ''): HTMLButtonElement {
  const b = el(doc, 'button', cls, text);
  b.type = 'button';
  return b;
}

export function image(doc: Document, src: string): HTMLImageElement {
  const img = el(doc, 'img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

// Saving from a page: saved pictures (by URL, so an edited one can be saved
// again) and, for SAVE_FAILED_MS, those whose save failed. `redraw` shows a change.
export const SAVE_FAILED_MS = 2000;

export type SaveState = 'save' | 'saved' | 'failed';

export interface Saves {
  state(shot: Shot): SaveState;
  save(shot: Shot): void;
  destroy(): void;
}

export function saves(shotSave: ShotDeps['shotSave'], redraw: () => void): Saves {
  const saved = new Set<string>();
  const failed = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    state: shot => (shot.saved || saved.has(shot.image) ? 'saved' : failed.has(shot.image) ? 'failed' : 'save'),
    save(shot) {
      shotSave(shot.id).then(() => {
        saved.add(shot.image);
        redraw();
      }, e => {
        console.error('notching: screenshot not saved', e);
        failed.add(shot.image);
        redraw();
        const t = setTimeout(() => {
          timers.delete(t);
          failed.delete(shot.image);
          redraw();
        }, SAVE_FAILED_MS);
        timers.add(t);
      });
    },
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

// The editor, then the panel closes (§5). A failure is logged; the panel closes anyway.
export function openEditor(deps: Pick<ShotDeps, 'openEditor' | 'close'>, id: number): void {
  deps.openEditor(id).catch(e => console.error('notching: the editor did not open', e));
  void deps.close();
}

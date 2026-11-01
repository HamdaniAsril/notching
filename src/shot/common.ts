import type { Bridge } from '../bridge';
import type { Lang } from '../kit/protocol';
import { DRAG_SLOP } from '../shelf/view';

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

// A press on a picture: past DRAG_SLOP with the button down it drags the
// screenshot out (as Titipan's tiles do), else its click opens the editor.
export interface Presses {
  watch(pic: HTMLElement, id: number, onClick: () => void): void;
  destroy(): void;
}

export function presses(doc: Document, startDrag: (id: number) => void): Presses {
  let press: { id: number; x: number; y: number; dragged: boolean } | null = null;

  function onMove(e: MouseEvent): void {
    if (!press || press.dragged || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_SLOP) return;
    press.dragged = true;
    startDrag(press.id);
  }

  function onUp(): void {
    // Cleared after the click that follows, so that click knows it was a drag.
    setTimeout(() => { if (press && !press.dragged) press = null; }, 0);
  }

  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('mouseup', onUp);

  return {
    watch(pic, id, onClick) {
      pic.addEventListener('dragstart', e => e.preventDefault());
      pic.addEventListener('mousedown', e => {
        if (e.button === 0) press = { id, x: e.clientX, y: e.clientY, dragged: false };
      });
      pic.addEventListener('click', () => {
        const wasDrag = press?.dragged === true && press.id === id;
        press = null;
        if (!wasDrag) onClick();
      });
    },
    destroy() {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
    },
  };
}

// The editor, then the panel closes (§5). Its command may not be there yet.
export function openEditor(deps: Pick<ShotDeps, 'openEditor' | 'close'>, id: number): void {
  deps.openEditor(id).catch(() => {});
  void deps.close();
}

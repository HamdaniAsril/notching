import { invoke } from '@tauri-apps/api/core';
import { followCoreAccent } from '../kit/accent-tauri';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { dragBox, finish, isDrag, windowAt, type Box, type PickMode, type PickWindow, type Point } from './geometry';

// Same shape as PickState in src-tauri/src/shot_pick.rs. `cursor` is set only on
// the panel the cursor was on when the picker opened.
export interface PickState {
  mode: PickMode;
  windows: PickWindow[];
  cursor: Point | null;
}

export interface PickDeps {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
  dpr?(): number;
}

function el(doc: Document, cls: string): HTMLElement {
  const e = doc.createElement('div');
  e.className = cls;
  return e;
}

// One see-through panel per screen (shot_pick.rs). The screen is dimmed except
// for the window under the cursor, or the area being dragged, which `.pk-hole`
// cuts out with its shadow. Classes start with pk-.
export function mountPicker(root: HTMLElement, deps: PickDeps): { show(state: PickState): void } {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const hole = el(doc, 'pk-hole');
  const size = el(doc, 'pk-size');
  root.replaceChildren(hole, size);
  let state: PickState | null = null;
  let down: Point | null = null;

  const paint = (box: Box | null, drag = false) => {
    root.classList.toggle('pk-cut', box !== null);
    root.classList.toggle('pk-drag', box !== null && drag);
    if (!box) return;
    hole.style.left = `${box.x}px`;
    hole.style.top = `${box.y}px`;
    hole.style.width = `${box.w}px`;
    hole.style.height = `${box.h}px`;
    if (!drag) return;
    const dpr = deps.dpr?.() ?? win.devicePixelRatio ?? 1;
    size.textContent = `${Math.round(box.w * dpr)} × ${Math.round(box.h * dpr)}`;
    size.style.left = `${box.x + box.w}px`;
    size.style.top = `${Math.min(box.y + box.h + 8, win.innerHeight - 28)}px`;
  };
  const hover = (p: Point) => {
    if (!state || state.mode === 'area') return paint(null);
    const number = windowAt(state.windows, p.x, p.y);
    paint(state.windows.find(w => w.number === number) ?? null);
  };
  // An area stays on this panel's screen.
  const at = (e: MouseEvent): Point => ({
    x: Math.min(Math.max(e.clientX, 0), win.innerWidth),
    y: Math.min(Math.max(e.clientY, 0), win.innerHeight),
  });
  const close = (cmd: string, args?: Record<string, unknown>) => {
    state = null;
    down = null;
    paint(null);
    void (args ? deps.invoke(cmd, args) : deps.invoke(cmd));
  };

  doc.addEventListener('mousedown', e => {
    if (e.button === 0) down = at(e);
  });
  doc.addEventListener('mousemove', e => {
    const p = at(e);
    if (down && state?.mode !== 'window' && isDrag(down.x, down.y, p.x, p.y)) {
      paint(dragBox(down.x, down.y, p.x, p.y), true);
    } else {
      hover(p);
    }
  });
  doc.addEventListener('mouseup', e => {
    if (e.button !== 0 || !down || !state) return;
    const p = at(e);
    const choice = finish(state.mode, down, p, state.windows);
    down = null;
    if (choice) close('shot_pick_done', { choice });
    else hover(p);
  });
  doc.addEventListener('keydown', e => {
    if (e.key === 'Escape') close('shot_pick_cancel');
  });
  // Key moved to the panel on another screen: no stale outline here.
  win.addEventListener('blur', () => {
    if (!down) paint(null);
  });

  return {
    show(next) {
      state = next;
      down = null;
      if (next.cursor) hover(next.cursor);
      else paint(null);
    },
  };
}

// A freshly made panel's page can miss the first event, so it also asks. Each
// panel gets its own screen's state (`emit_to`), so it listens on its window only:
// a global listener would hear every panel's (see the rule in src/bridge.ts).
export async function start(): Promise<void> {
  void followCoreAccent();
  const picker = mountPicker(document.getElementById('pick-root')!, { invoke });
  await getCurrentWebviewWindow().listen<PickState>('notching://pick', e => picker.show(e.payload));
  const now = await invoke<PickState | null>('shot_pick_state');
  if (now) picker.show(now);
}

if ('__TAURI_INTERNALS__' in window) void start();

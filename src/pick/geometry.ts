// What a press and release on the picker mean (shot_pick.rs). Everything is in
// the panel's local points: origin at its screen's top-left, y down.

// A press that moves this far or less is a click, not a drag.
export const DRAG_SLOP = 4;

export type PickMode = 'both' | 'window' | 'area';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type PickWindow = Box & { number: number };

// Same shape as PickChoice in src-tauri/src/shot_pick.rs.
export type PickChoice = { kind: 'window'; number: number } | ({ kind: 'area' } & Box);

function inside(b: Box, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

// `windows` come front to back, so the first hit is the one on top.
export function windowAt(windows: PickWindow[], x: number, y: number): number | null {
  return windows.find(w => inside(w, x, y))?.number ?? null;
}

export function dragBox(ax: number, ay: number, bx: number, by: number): Box {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

export function isDrag(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(bx - ax) > DRAG_SLOP || Math.abs(by - ay) > DRAG_SLOP;
}

// Null keeps the picker up: a drag in window mode, a click in area mode, a click
// on no window, or an area too thin to hold a picture.
export function finish(mode: PickMode, down: Point, up: Point, windows: PickWindow[]): PickChoice | null {
  if (isDrag(down.x, down.y, up.x, up.y)) {
    const box = dragBox(down.x, down.y, up.x, up.y);
    return mode === 'window' || box.w < 1 || box.h < 1 ? null : { kind: 'area', ...box };
  }
  if (mode === 'area') return null;
  const number = windowAt(windows, down.x, down.y);
  return number === null ? null : { kind: 'window', number };
}

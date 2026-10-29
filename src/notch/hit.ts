import type { NotchController } from './controller';

// CSS px, origin at the top-left of the overlay window.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OVERLAY_SIZE = { w: 640, h: 360 } as const;

const CX = OVERLAY_SIZE.w / 2;

// Half-open edges: x ∈ [r.x, r.x + r.w).
export function containsPoint(rects: Rect[], x: number, y: number): boolean {
  return rects.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

// Areas that must catch the mouse; everything else in the overlay is click-through.
// `pill` is the pill's rect while it is visible, or null.
export function hitRects(c: NotchController, pill: Rect | null): Rect[] {
  if (c.phase === 'open') {
    // The larger of the target and the live size, so a panel shrinking to a
    // smaller card still catches clicks; down to the pill, so the gap between
    // them does too.
    const size = c.panelSize();
    const { pw, ph } = c.motion.springs;
    const w = Math.max(size.w, pw.x);
    const h = Math.max(size.h, ph.x, pill ? pill.y : 0);
    const panel = { x: CX - w / 2 - 12, y: 0, w: w + 24, h };
    return pill ? [panel, pill] : [panel];
  }

  if (c.phase === 'notify') {
    // The ears, so a click on the notice opens the panel.
    const { w, h } = c.noticeSize();
    return [{ x: CX - w / 2 - 12, y: 0, w: w + 24, h: h + 4 }];
  }

  const { notch, config } = c;
  const hover = c.phase === 'hover';
  if (notch) {
    const h = hover ? notch.height + 14 + config.dropDepth : notch.height + 10;
    return [{ x: CX - notch.width / 2 - 10, y: 0, w: notch.width + 20, h }];
  }
  const h = hover ? Math.max(34, 14 + config.dropDepth + config.thickness) : 34;
  return [{ x: CX - 60, y: 0, w: 120, h }];
}

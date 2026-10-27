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

// Areas that must catch the mouse; everything else in the overlay is click-through.
// `pill` is the pill's rect while it is visible, or null.
export function hitRects(c: NotchController, pill: Rect | null): Rect[] {
  if (c.phase === 'open') {
    const { w, h } = c.panelSize();
    const panel = { x: CX - w / 2 - 12, y: 0, w: w + 24, h };
    return pill ? [panel, pill] : [panel];
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

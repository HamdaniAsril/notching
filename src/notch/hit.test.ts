import { expect, test } from 'vitest';
import { containsPoint, hitRects } from './hit';
import { ctl, frames } from './test-helpers';

test('idle rects stay within the hot zone (no notch)', () =>
  expect(hitRects(ctl(null), null)).toEqual([{ x: 260, y: 0, w: 120, h: 34 }]));

test('idle rects stay within the hot zone (notch)', () =>
  expect(hitRects(ctl({ width: 164, height: 32 }), null)).toEqual([{ x: 228, y: 0, w: 184, h: 42 }]));

test('hover zone grows with drop depth', () => {
  const c = ctl(null, { dropDepth: 28 });
  c.pointer(true, 0);
  expect(hitRects(c, null)[0].h).toBe(46);
});

test('open rects cover the panel and the visible pill', () => {
  const c = ctl(null);
  c.click();
  const pill = { x: 280, y: 134, w: 80, h: 34 };
  expect(hitRects(c, pill)).toEqual([{ x: 108, y: 0, w: 424, h: 134 }, pill]);
});

test('a shrinking panel keeps its hit area until it has shrunk', () => {
  const c = ctl(null);
  c.click();
  frames(c, 240);
  c.setCard({ width: 300, height: 60 });
  expect(hitRects(c, null)[0].w).toBeGreaterThan(324);
  frames(c, 240);
  const r = hitRects(c, null)[0];
  expect(r.x).toBeCloseTo(158, 0);
  expect(r.w).toBeCloseTo(324, 0);
  expect(r.h).toBeCloseTo(94, 0);
});

test('the gap between panel and pill catches clicks', () => {
  const c = ctl(null);
  c.click();
  expect(hitRects(c, { x: 281, y: 134, w: 78, h: 34 })[0].h).toBe(134);
});

test('containsPoint uses half-open edges', () => {
  const r = [{ x: 0, y: 0, w: 10, h: 10 }];
  expect(containsPoint(r, 0, 0)).toBe(true);
  expect(containsPoint(r, 10, 5)).toBe(false);
});

test('a notice catches clicks on its ears', () => {
  const c = ctl({ width: 190, height: 32 });
  c.notify(3500);
  expect(hitRects(c, null)).toEqual([{ x: 320 - 245 - 12, y: 0, w: 490 + 24, h: 36 }]);
});


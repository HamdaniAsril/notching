import { expect, test } from 'vitest';
import { hitRects } from './hit';
import { ctl } from './test-helpers';

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
  expect(hitRects(c, pill)).toEqual([{ x: 108, y: 0, w: 424, h: 124 }, pill]);
});

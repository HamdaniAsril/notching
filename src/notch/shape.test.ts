import { expect, test } from 'vitest';
import { liquidDepth, notchPath, panelPath } from './shape';

const flat = { W: 42, H: 4, s: 0, bx: 0 };

test('lens is full depth at the centre and zero at and beyond the edges', () => {
  expect(liquidDepth(0, flat, 0.5)).toBeCloseTo(4);
  expect(liquidDepth(42, flat, 0.5)).toBe(0);
  expect(liquidDepth(-50, flat, 0.5)).toBe(0);
});

test('lens is never thinner than minH at the centre', () =>
  expect(liquidDepth(0, { ...flat, H: 0.1 }, 0.5)).toBeCloseTo(0.5));

test('bead profile halfway out', () =>
  expect(liquidDepth(21, { W: 42, H: 13, s: 1, bx: 0 }, 0)).toBeCloseTo(13 * Math.pow(0.75, 2.4)));

test('cursor bias moves the deepest point', () =>
  expect(liquidDepth(6, { W: 42, H: 13, s: 1, bx: 6 }, 0)).toBeCloseTo(13));

test('panel path for a 400 × 124 panel', () => expect(panelPath(400, 124)).toBe(
  'M -212.00 0 Q -200.00 0 -200.00 12.00 L -200.00 96.00 Q -200.00 124.00 -172.00 124.00 ' +
  'L 172.00 124.00 Q 200.00 124.00 200.00 96.00 L 200.00 12.00 Q 200.00 0 212.00 0 Z'));

test('notch path starts at the physical notch outline', () =>
  expect(notchPath({ width: 164, height: 32 }, { W: 70, H: 0, s: 0, bx: 0 }))
    .toMatch(/^M -88\.00 0 Q -82\.00 0 -82\.00 6\.00 L -82\.00 22\.00 /));

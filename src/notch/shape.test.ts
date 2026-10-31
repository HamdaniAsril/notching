import { expect, test } from 'vitest';
import { liquidDepth, notchPath, notchTabPath, panelFade, panelPath, topPillPath } from './shape';

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

test('panel fade is solid down to its start, then eases to the bottom opacity', () => {
  const stops = panelFade(0.15, 0.75);
  expect(stops[0]).toEqual({ offset: 0, opacity: 1 });
  expect(stops[1]).toEqual({ offset: 0.15, opacity: 1 });
  expect(stops[stops.length - 1].offset).toBeCloseTo(1);
  expect(stops[stops.length - 1].opacity).toBeCloseTo(0.75);
  for (let i = 1; i < stops.length; i++) expect(stops[i].opacity).toBeLessThanOrEqual(stops[i - 1].opacity);
});

const points = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map(m => [Number(m[1]), Number(m[2])]);
const letters = (d: string) => d.replace(/[^A-Z]/g, '');

test('the right tab mirrors the left one', () => {
  const notch = { width: 190, height: 32 };
  const left = notchTabPath(notch, 56);
  const right = notchTabPath(notch, 56, 'right');
  expect(letters(right)).toBe(letters(left));
  expect(points(right)).toEqual(points(left).map(([x, y]) => [x === 0 ? 0 : -x, y]));
  expect(notchTabPath(notch, 20)).toBe(notchTabPath(notch, 20, 'left'));
});

test('the top pill is a closed shape around the centre', () => {
  const d = topPillPath(46, 22);
  expect(d).toMatch(/^M -52\.00 0 /);
  expect(d).toMatch(/ 52\.00 0 Z$/);
  const xs = points(d).map(([x]) => x);
  expect(Math.min(...xs)).toBe(-52);
  expect(Math.max(...points(d).map(([, y]) => y))).toBe(22);
});

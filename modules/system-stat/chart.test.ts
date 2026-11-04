import { expect, test } from 'vitest';
import { areaPath, linePath, segments, WINDOW_S } from './chart';

const p = (ago: number, v: number | null) => ({ ago, v });

test('the chart covers one minute', () => {
  expect(WINDOW_S).toBe(60);
});

test('one unbroken run is one segment', () => {
  expect(segments([p(3, 10), p(1.5, 20), p(0, 30)])).toEqual([[p(3, 10), p(1.5, 20), p(0, 30)]]);
});

test('a gap of more than 4 s, while the card was shut, breaks the line', () => {
  const s = segments([p(50, 1), p(48.5, 2), p(10, 3), p(8.5, 4), p(0, 5)]);
  expect(s).toEqual([[p(50, 1), p(48.5, 2)], [p(10, 3), p(8.5, 4)], [p(0, 5)]]);
});

test('a missing reading breaks the line too', () => {
  expect(segments([p(3, 1), p(1.5, null), p(0, 2)])).toEqual([[p(3, 1)], [p(0, 2)]]);
  expect(segments([])).toEqual([]);
});

test('now is the right edge, a minute ago the left; 100 % is the top', () => {
  expect(linePath([p(60, 0), p(30, 50), p(0, 100)], 200, 56)).toBe('M0 56L100 28L200 0');
});

test('values outside 0–100 stay inside the chart', () => {
  expect(linePath([p(0, 140), p(0, -5)], 200, 56)).toBe('M200 0L200 56');
});

test('the area closes down to the floor', () => {
  expect(areaPath([p(60, 0), p(0, 100)], 200, 56)).toBe('M0 56L200 0L200 56L0 56Z');
  expect(areaPath([], 200, 56)).toBe('');
});

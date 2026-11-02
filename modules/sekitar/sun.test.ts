import { expect, test } from 'vitest';
import { sunState } from './sun';

// A day in Jakarta: sunrise 05:31, sunset 17:48, tomorrow's sunrise 05:31 again (in UTC+7).
const H = 3_600_000;
const at = (h: number, m = 0) => Date.UTC(2026, 9, 27, h - 7, m);
const SUN = { rise: at(5, 31), set: at(17, 48), nextRise: at(5, 31) + 24 * H };

test('at noon the sun is up and about half way', () => {
  const s = sunState(SUN, at(11, 40));
  expect(s.day).toBe(true);
  expect(s.progress).toBeCloseTo(0.5, 1);
  expect(s.untilMs).toBe(SUN.set - at(11, 40));
});

test('sunrise itself is day, sunset itself is not', () => {
  expect(sunState(SUN, SUN.rise)).toEqual({ day: true, progress: 0, untilMs: SUN.set - SUN.rise });
  expect(sunState(SUN, SUN.set)).toEqual({ day: false, progress: 1, untilMs: SUN.nextRise - SUN.set });
});

test('in the evening it is night, full progress, counting to tomorrow\'s sunrise', () => {
  const s = sunState(SUN, at(20));
  expect(s).toEqual({ day: false, progress: 1, untilMs: SUN.nextRise - at(20) });
});

test('before dawn it is night, no progress, counting to sunrise', () => {
  const s = sunState(SUN, at(4));
  expect(s).toEqual({ day: false, progress: 0, untilMs: SUN.rise - at(4) });
});

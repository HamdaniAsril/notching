import { expect, test } from 'vitest';
import { isNight, isWet, rainAt, rainHours, upcoming } from './hourly';

// Local times, so the test reads the same in any zone.
const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const day = (rain: (h: number) => number) =>
  Array.from({ length: 24 }, (_, h) => ({ at: t(27, h), temp: 25 + h / 4, code: 3, rain: rain(h) }));

test('upcoming starts at the current hour and takes eight', () => {
  const hours = day(() => 0);
  const got = upcoming(hours, t(27, 10, 18));
  expect(got).toHaveLength(8);
  expect(got[0].at).toBe(t(27, 10));
  expect(got[7].at).toBe(t(27, 17));
});

test('on the hour the hour that just began is the current one', () => {
  expect(upcoming(day(() => 0), t(27, 10))[0].at).toBe(t(27, 10));
});

test('upcoming takes fewer near the end of the data, and n is adjustable', () => {
  const hours = day(() => 0);
  expect(upcoming(hours, t(27, 21, 5))).toHaveLength(3);
  expect(upcoming(hours, t(27, 10, 18), 3).map(h => h.at)).toEqual([t(27, 10), t(27, 11), t(27, 12)]);
  expect(upcoming([], t(27, 10))).toEqual([]);
});

test('rainAt finds the first hour at 50 percent or more within the next 12 hours', () => {
  const hours = day(h => (h === 16 || h === 17 ? 60 : h === 12 ? 49 : 0));
  expect(rainAt(hours, t(27, 10, 18))).toBe(t(27, 16));
});

test('rainAt counts the current hour, ignores the past and anything beyond 12 hours', () => {
  expect(rainAt(day(h => (h === 10 ? 80 : 0)), t(27, 10, 18))).toBe(t(27, 10));
  expect(rainAt(day(h => (h === 8 ? 90 : 0)), t(27, 10, 18))).toBeNull();
  expect(rainAt(day(h => (h === 23 ? 90 : 0)), t(27, 10, 18))).toBeNull();
  expect(rainAt(day(h => (h === 22 ? 90 : 0)), t(27, 10, 0))).toBe(t(27, 22));
  expect(rainAt([], t(27, 10))).toBeNull();
});

test('isNight follows the sun times, carried to the day of the hour', () => {
  const sun = { rise: t(27, 5, 31), set: t(27, 17, 48), nextRise: t(28, 5, 31) };
  expect(isNight(sun, t(27, 12))).toBe(false);
  expect(isNight(sun, t(27, 20))).toBe(true);
  expect(isNight(sun, t(27, 3))).toBe(true);
  // Tomorrow's hours use today's times a day later.
  expect(isNight(sun, t(28, 12))).toBe(false);
  expect(isNight(sun, t(28, 22))).toBe(true);
  expect(isNight(sun, t(28, 2))).toBe(true);
  expect(isNight(null, t(27, 22))).toBe(false);
});

test('rainHours counts the hours in a row from the start with 50 percent or more', () => {
  const hours = day(h => (h === 16 || h === 17 ? 60 : h === 18 ? 49 : h === 20 ? 90 : 0));
  expect(rainHours(hours, t(27, 16))).toBe(2);
  expect(rainHours(hours, t(27, 17))).toBe(1);
  expect(rainHours(day(h => (h >= 20 ? 80 : 0)), t(27, 20))).toBe(4);
});

test('rainHours is 0 when the start is not a wet hour of the data', () => {
  expect(rainHours(day(() => 0), t(27, 16))).toBe(0);
  expect(rainHours(day(() => 90), t(28, 3))).toBe(0);
  expect(rainHours([], t(27, 16))).toBe(0);
});

test('isWet is 50 percent or more', () => {
  expect(isWet({ at: 0, temp: 20, code: 61, rain: 50 })).toBe(true);
  expect(isWet({ at: 0, temp: 20, code: 61, rain: 49 })).toBe(false);
});

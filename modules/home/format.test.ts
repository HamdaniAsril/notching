import { expect, test } from 'vitest';
import {
  clock, dayKey, degrees, dueAt, nearest, parseTime, reminderLabel, remaining, weatherKey,
} from './format';
import type { Reminder } from './types';

const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const NOW = new Date(2026, 9, 27, 10, 18);
const ID_WORDS = { today: 'Hari ini', tomorrow: 'Besok' };
const rem = (id: number, day: string, when: number | null, done = false): Reminder =>
  ({ id, title: `R${id}`, day, at: when, done, notified: false });

test('clock follows the language', () => {
  expect(clock(at(27, 10, 25), 'id')).toBe('10.25');
  expect(clock(at(27, 10, 25), 'en')).toBe('10:25');
  expect(clock(at(27, 9, 5), 'id')).toBe('09.05');
});

test('time left reads in hours and minutes', () => {
  expect(remaining(82 * 60000, 'id')).toBe('1 j 22 m');
  expect(remaining(82 * 60000, 'en')).toBe('1 h 22 m');
  expect(remaining(22 * 60000, 'id')).toBe('22 m');
  expect(remaining(-5, 'id')).toBe('0 m');
});

test('weather codes', () => {
  const cases: [number, string][] = [[0, 'clear'], [2, 'mostlyClear'], [3, 'cloudy'], [48, 'fog'], [53, 'drizzle'],
    [63, 'rain'], [81, 'showers'], [86, 'snow'], [95, 'storm'], [999, 'cloudy']];
  for (const [code, key] of cases) expect(weatherKey(code)).toBe(key);
});

test('times people type', () => {
  for (const ok of ['14.00', '14:00', '1400', '9', '09.30', '9:30', ' 7 ']) expect(parseTime(ok)).not.toBeNull();
  expect(parseTime('0930')).toEqual({ h: 9, m: 30 });
  expect(parseTime('9')).toEqual({ h: 9, m: 0 });
  for (const bad of ['25.00', '9.5', '12.60', 'abc', '', '1.2.3']) expect(parseTime(bad)).toBeNull();
});

test('a time already past today means tomorrow', () => {
  expect(dueAt({ h: 9, m: 0 }, NOW)).toEqual({ day: '2026-10-28', at: at(28, 9, 0) });
  expect(dueAt({ h: 14, m: 0 }, NOW)).toEqual({ day: '2026-10-27', at: at(27, 14, 0) });
  expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
});

test('labels for today, tomorrow and later', () => {
  expect(reminderLabel(rem(1, '2026-10-27', at(27, 14, 0)), NOW, 'id', ID_WORDS)).toBe('14.00');
  expect(reminderLabel(rem(2, '2026-10-27', null), NOW, 'id', ID_WORDS)).toBe('Hari ini');
  expect(reminderLabel(rem(3, '2026-10-28', at(28, 9, 0)), NOW, 'id', ID_WORDS)).toBe('Besok 09.00');
  expect(reminderLabel(rem(4, '2026-10-28', null), NOW, 'id', ID_WORDS)).toBe('Besok');
  expect(reminderLabel(rem(5, '2026-10-30', null), NOW, 'id', ID_WORDS)).toBe('30 Okt');
  expect(reminderLabel(rem(6, '2026-10-30', at(30, 8, 0)), NOW, 'id', ID_WORDS)).toBe('30 Okt 08.00');
});

test('the two nearest open reminders', () => {
  const list = [rem(3, '2026-10-28', at(28, 9, 0)), rem(2, '2026-10-27', null), rem(4, '2026-10-26', null, true),
    rem(1, '2026-10-27', at(27, 14, 0))];
  expect(nearest(list, 2).map(r => r.id)).toEqual([1, 2]);
  expect(nearest(list, 9).map(r => r.id)).toEqual([1, 2, 3]);
});

test('degrees', () => {
  expect(degrees(31.4)).toBe('31°');
  expect(degrees(-0.4)).toBe('0°');
  expect(degrees(-2.6)).toBe('-3°');
});

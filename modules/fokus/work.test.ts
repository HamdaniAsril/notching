import { expect, test } from 'vitest';
import { checkWork, DEFAULT_WORK, hm, timeText, workState } from './work';

const at = (d: number, h: number, m: number, s = 0) => new Date(2026, 9, d, h, m, s);
const MIN = 60_000;

test('Tuesday 10:18 on the default hours: working, 1:18 in, 6:42 to go', () => {
  const s = workState(DEFAULT_WORK, at(27, 10, 18));
  expect(s.kind).toBe('working');
  expect(s.workedMs).toBe(78 * MIN);
  expect(s.leftMs).toBe(402 * MIN);
  expect(s.progress).toBeCloseTo(78 / 480);
});

test('17:00 exactly is done, 08:00 is before, 09:00 exactly is working', () => {
  const done = workState(DEFAULT_WORK, at(27, 17, 0));
  expect(done).toMatchObject({ kind: 'done', workedMs: 480 * MIN, leftMs: 0, progress: 1 });
  const before = workState(DEFAULT_WORK, at(27, 8, 0));
  expect(before).toMatchObject({ kind: 'before', workedMs: 0, leftMs: 60 * MIN, progress: 0 });
  expect(workState(DEFAULT_WORK, at(27, 9, 0)).kind).toBe('working');
});

test('Saturday is off, Sunday too, until the days say otherwise', () => {
  expect(workState(DEFAULT_WORK, at(31, 10, 0))).toMatchObject({ kind: 'off', workedMs: 0, leftMs: 0, progress: 0 });
  expect(workState(DEFAULT_WORK, new Date(2026, 10, 1, 10, 0)).kind).toBe('off'); // Sunday 1 Nov
  expect(workState({ ...DEFAULT_WORK, days: [6] }, at(31, 10, 0)).kind).toBe('working');
});

test('seconds count: 10:18:30 is 78.5 minutes in', () => {
  expect(workState(DEFAULT_WORK, at(27, 10, 18, 30)).workedMs).toBe(78.5 * MIN);
});

test('checkWork keeps what is valid and defaults the rest', () => {
  expect(checkWork(undefined)).toEqual(DEFAULT_WORK);
  expect(checkWork({})).toEqual(DEFAULT_WORK);
  expect(checkWork({ start: '08:30', end: '16:00', days: [6, 0] })).toEqual({ start: '08:30', end: '16:00', days: [6, 0] });
  expect(checkWork({ start: '08:30' })).toEqual({ start: '08:30', end: '17:00', days: [1, 2, 3, 4, 5] });
  expect(checkWork({ start: '9:00', end: '25:00' })).toEqual(DEFAULT_WORK);
});

test('an end at or before the start falls back to the default hours', () => {
  expect(checkWork({ start: '18:00', end: '09:00' })).toEqual(DEFAULT_WORK);
  expect(checkWork({ start: '09:00', end: '09:00' })).toEqual(DEFAULT_WORK);
  expect(checkWork({ start: '18:00' })).toEqual(DEFAULT_WORK);
});

test('empty or out-of-range days fall back to the default days, keeping the times', () => {
  const days = DEFAULT_WORK.days;
  expect(checkWork({ days: [9] })).toEqual({ ...DEFAULT_WORK, days });
  expect(checkWork({ days: [] })).toEqual(DEFAULT_WORK);
  expect(checkWork({ days: [1, 7] }).days).toEqual(days);
  expect(checkWork({ days: [1.5] }).days).toEqual(days);
  expect(checkWork({ days: 'mon' }).days).toEqual(days);
  expect(checkWork({ start: '08:00', days: [-1] })).toEqual({ start: '08:00', end: '17:00', days });
  expect(checkWork({ days: [2, 2, 4] }).days).toEqual([2, 4]);
});

test('hm drops the hours under an hour, in both languages', () => {
  expect(hm(150 * MIN, 'id')).toBe('2 j 30 m');
  expect(hm(150 * MIN, 'en')).toBe('2 h 30 m');
  expect(hm(42 * MIN, 'id')).toBe('42 m');
  expect(hm(60 * MIN, 'en')).toBe('1 h 0 m');
  expect(hm(0, 'id')).toBe('0 m');
  expect(hm(-5 * MIN, 'id')).toBe('0 m');
  // A tick a few ms early still reads the minute that is about to start.
  expect(hm(78 * MIN - 5, 'id')).toBe('1 j 18 m');
});

test('timeText: 09.00 in Indonesian, 09:00 in English', () => {
  expect(timeText('09:00', 'id')).toBe('09.00');
  expect(timeText('09:05', 'en')).toBe('09:05');
  expect(timeText('17:30', 'en')).toBe('17:30');
});

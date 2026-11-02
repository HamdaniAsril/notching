import { expect, test } from 'vitest';
import { moonAge, moonInfo, SYNODIC_DAYS } from './moon';

// The real new and full moon of November 2026.
const NEW = Date.UTC(2026, 10, 9, 7, 2);
const FULL = Date.UTC(2026, 10, 24, 14, 53);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('the full moon of 24 Nov 2026 is full and almost all lit', () => {
  const m = moonInfo(FULL);
  expect(m.phase).toBe('full');
  expect(m.lit).toBeGreaterThanOrEqual(99);
  expect(m.toFull).toBe(0);
});

test('the new moon of 9 Nov 2026 is new', () => {
  const m = moonInfo(NEW);
  expect(m.phase).toBe('new');
  expect(m.lit).toBeLessThanOrEqual(1);
  expect(m.toNew).toBe(0);
});

test('the model finds the new and the full moon within a quarter of a day', () => {
  const scan = (centre: number, distance: (age: number) => number): number => {
    let best = centre;
    for (let t = centre - 2 * DAY; t <= centre + 2 * DAY; t += HOUR) {
      if (distance(moonInfo(t).age) < distance(moonInfo(best).age)) best = t;
    }
    return best;
  };
  const newest = scan(NEW, a => Math.min(a, SYNODIC_DAYS - a));
  const fullest = scan(FULL, a => Math.abs(a - SYNODIC_DAYS / 2));
  expect(Math.abs(newest - NEW)).toBeLessThan(DAY / 4);
  expect(Math.abs(fullest - FULL)).toBeLessThan(DAY / 4);
});

test('a day before the new moon and the full moon it is 1 day away', () => {
  expect(moonInfo(NEW - DAY).toNew).toBe(1);
  expect(moonInfo(FULL - DAY).toFull).toBe(1);
});

test('2 Nov 2026, just after last quarter, is a waning moon a week from new', () => {
  const m = moonInfo(Date.UTC(2026, 10, 2, 12, 0));
  expect(m.waxing).toBe(false);
  expect(m.lit).toBe(43);
  expect(m.phase).toBe('quarter');
  // New moon 9 Nov 07:02 is 6.8 days on, the full moon of 24 Nov 22.1. The mean rate is
  // slow for the full moon's three weeks, so that one reads a day short.
  expect(m.toNew).toBe(7);
  expect(m.toFull).toBe(21);
});

test('30 Oct 2026, four days after full, is a waning gibbous moon', () => {
  const m = moonInfo(Date.UTC(2026, 9, 30, 9, 32));
  expect(m.waxing).toBe(false);
  expect(m.phase).toBe('gibbous');
  expect(m.lit).toBe(77);
});

test('the age stays within one cycle, far before and after 2000 too', () => {
  for (const ms of [947182440000, 0, -1e12, 4e12, NEW, FULL]) {
    const a = moonAge(ms);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(SYNODIC_DAYS);
  }
});

test('over a cycle the phases come in order, the lit part growing then shrinking', () => {
  const order = ['new', 'crescent', 'quarter', 'gibbous', 'full', 'gibbous', 'quarter', 'crescent', 'new'];
  const seen: string[] = [];
  let last = -1;
  let waxingDone = false;
  // From the new moon of 9 Nov, hour by hour, to the next one (about 23 Dec).
  for (let t = NEW; t < NEW + 29.6 * DAY; t += HOUR) {
    const m = moonInfo(t);
    if (seen[seen.length - 1] !== m.phase) seen.push(m.phase);
    if (m.waxing && !waxingDone) {
      expect(m.lit).toBeGreaterThanOrEqual(last);
    } else {
      waxingDone = true;
      if (last >= 0 && !m.waxing) expect(m.lit).toBeLessThanOrEqual(last);
    }
    last = m.lit;
  }
  expect(seen).toEqual(order);
});

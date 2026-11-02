import { expect, test } from 'vitest';
import { moonAge, moonInfo, SYNODIC_DAYS } from './moon';

test('the full moon of 24 Nov 2026 is full and almost all lit', () => {
  const m = moonInfo(Date.UTC(2026, 10, 24, 14, 53));
  expect(m.phase).toBe('full');
  expect(m.lit).toBeGreaterThanOrEqual(99);
  expect(m.toFull).toBe(0);
});

test('the new moon of 9 Nov 2026 is new', () => {
  const m = moonInfo(Date.UTC(2026, 10, 9, 7, 2));
  expect(m.phase).toBe('new');
  expect(m.lit).toBeLessThanOrEqual(1);
  expect(m.toNew).toBe(0);
});

test('2 Nov 2026 is a waning half moon about a week from new', () => {
  const m = moonInfo(Date.UTC(2026, 10, 2, 12, 0));
  expect(m.waxing).toBe(false);
  expect(m.lit).toBe(50);
  expect(m.phase).toBe('quarter');
  expect(m.toNew).toBe(8);
  expect(m.toFull).toBe(23);
});

test('30 Oct 2026 is a waning gibbous moon', () => {
  const m = moonInfo(new Date(2026, 9, 30, 9, 32).getTime());
  expect(m.waxing).toBe(false);
  expect(m.phase).toBe('gibbous');
  expect(m.lit).toBe(83);
});

test('the age stays within one cycle, before the reference moon too', () => {
  for (const ms of [947182440000, 0, -1e12, 4e12, Date.UTC(2026, 10, 2)]) {
    const a = moonAge(ms);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(SYNODIC_DAYS);
  }
  expect(moonAge(947182440000)).toBe(0);
});

test('the phase bands follow the lit percent', () => {
  const at = (age: number) => moonInfo(947182440000 + age * 86400000);
  expect(at(5).phase).toBe('crescent');
  expect(at(5).waxing).toBe(true);
  expect(at(7.4).phase).toBe('quarter');
  expect(at(10).phase).toBe('gibbous');
  expect(at(22.1).phase).toBe('quarter');
  expect(at(25).phase).toBe('crescent');
  expect(at(25).waxing).toBe(false);
});

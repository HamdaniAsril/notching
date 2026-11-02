import { expect, test } from 'vitest';
import { dayOfYear, daysInYear, isoWeek, monthGrid, monthShort, shortDay, weekOf, zoneLabel } from './dates';

test('day of the year counts from 1', () => {
  expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
  expect(dayOfYear(new Date(2026, 9, 31))).toBe(304);
});

test('a leap year has 366 days', () => {
  expect(daysInYear(2026)).toBe(365);
  expect(daysInYear(2028)).toBe(366);
  expect(daysInYear(2100)).toBe(365);
});

test('ISO weeks, including week 53 on 1 Jan 2027', () => {
  expect(isoWeek(new Date(2026, 10, 2))).toBe(45);
  expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  expect(isoWeek(new Date(2024, 11, 30))).toBe(1);
});

test('the week runs Monday to Sunday', () => {
  const week = weekOf(new Date(2026, 10, 8));
  expect(week).toHaveLength(7);
  expect(week[0].getTime()).toBe(new Date(2026, 10, 2).getTime());
  expect(week[6].getTime()).toBe(new Date(2026, 10, 8).getTime());
  expect(weekOf(new Date(2026, 10, 2))[0].getDate()).toBe(2);
});

test('a week across a month end keeps counting', () => {
  expect(weekOf(new Date(2026, 9, 31)).map(d => d.getDate())).toEqual([26, 27, 28, 29, 30, 31, 1]);
});

test('the month grid is Monday first with nulls around the month', () => {
  const grid = monthGrid(new Date(2026, 9, 15));
  expect(grid[0]).toEqual([null, null, null, 1, 2, 3, 4]);
  expect(grid.every(r => r.length === 7)).toBe(true);
  expect(grid[grid.length - 1]).toEqual([26, 27, 28, 29, 30, 31, null]);
});

test('a month starting on Monday has no leading nulls', () => {
  expect(monthGrid(new Date(2026, 5, 1))[0][0]).toBe(1);
});

test('short day names are three uppercase letters', () => {
  expect(shortDay(new Date(2026, 10, 2), 'id')).toBe('SEN');
  expect(shortDay(new Date(2026, 10, 2), 'en')).toBe('MON');
});

test('short month names are three uppercase letters', () => {
  expect(monthShort(new Date(2026, 9, 31), 'id')).toBe('OKT');
  expect(monthShort(new Date(2026, 9, 31), 'en')).toBe('OCT');
  expect(monthShort(new Date(2026, 8, 1), 'en')).toBe('SEP');
});

test('the zone label is Intl short name', () => {
  const d = new Date(Date.UTC(2026, 10, 2, 12));
  expect(zoneLabel('id', d, 'Asia/Jakarta')).toMatch(/^(WIB|GMT\+7)$/);
  expect(zoneLabel('en', d, 'UTC')).toMatch(/UTC|GMT/);
});

import { expect, test } from 'vitest';
import { columnAt, dropIndex } from './drag';

test('dropIndex inserts before the first midpoint past the pointer', () => {
  expect([5, 20, 60].map(y => dropIndex([10, 30, 50], y))).toEqual([0, 1, 3]);
  expect(dropIndex([], 99)).toBe(0);
});

test('columnAt splits the row into four', () => {
  expect([99, 100, 399, -5, 450].map(x => columnAt(0, 400, x))).toEqual([0, 1, 3, 0, 3]);
  expect(columnAt(50, 400, 260)).toBe(2);
});

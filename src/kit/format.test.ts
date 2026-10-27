import { expect, test } from 'vitest';
import { formatBytes, formatPercent, formatRate } from './format';

test('percent', () => {
  expect(formatPercent(23.4)).toBe('23%');
  expect(formatPercent(101)).toBe('100%');
  expect(formatPercent(-1)).toBe('0%');
});

test('rates use base 1000 and the language decimal mark', () => {
  expect(formatRate(0, 'id')).toBe('0 B/s');
  expect(formatRate(850_000, 'id')).toBe('850 KB/s');
  expect(formatRate(1_200_000, 'id')).toBe('1,2 MB/s');
  expect(formatRate(1_200_000, 'en')).toBe('1.2 MB/s');
  expect(formatRate(12_400_000, 'en')).toBe('12 MB/s');
  expect(formatRate(999_700, 'en')).toBe('1 MB/s');
});

test('memory uses base 1024', () => {
  expect(formatBytes(16 * 1024 ** 3, 'id')).toBe('16 GB');
  expect(formatBytes(9.8 * 1024 ** 3, 'id')).toBe('9,8 GB');
});

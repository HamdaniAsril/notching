import { expect, test } from 'vitest';
import { fakePrefs } from './bridge-browser-prefs';

test('reads {} by default and keeps each module apart', () => {
  const call = fakePrefs();
  expect(call('a', 'read', undefined)).toEqual({});
  call('a', 'write', { value: { x: 1 } });
  expect(call('a', 'read', undefined)).toEqual({ x: 1 });
  expect(call('b', 'read', undefined)).toEqual({});
});

test('a write is a copy', () => {
  const call = fakePrefs();
  const v = { list: [1] };
  call('a', 'write', { value: v });
  v.list.push(2);
  expect(call('a', 'read', undefined)).toEqual({ list: [1] });
});

test('non-objects and over 16 KB are refused', () => {
  const call = fakePrefs();
  for (const value of [[1], 'x', null, 4]) expect(() => call('a', 'write', { value })).toThrow();
  expect(() => call('a', 'write', { value: { x: 'a'.repeat(17 * 1024) } })).toThrow('prefs too large');
  expect(call('a', 'read', undefined)).toEqual({});
});

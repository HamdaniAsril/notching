import { expect, test } from 'vitest';
import { fakeAwake } from './bridge-browser-awake';

test('the browser stand-in starts, adds and stops like the app', () => {
  const call = fakeAwake();
  const before = Date.now();
  const on = call('start', { minutes: 60 });
  expect(on.on).toBe(true);
  expect(on.until! - before).toBeGreaterThanOrEqual(3_600_000);
  expect(on.until! - before).toBeLessThan(3_605_000);
  expect(on.text).toBe('1:00');
  expect(call('add', { minutes: 15 }).text).toBe('1:15');
  expect(call('read', undefined).text).toBe('1:15');
  expect(call('stop', undefined).on).toBe(false);
  expect(call('start', { minutes: null })).toEqual({ on: true, until: null, forever: true, text: '∞' });
  expect(call('start', { minutes: 30 }).text).toBe('30m');
  expect(call('add', { minutes: 1440 }).text).toBe('24:00');
});

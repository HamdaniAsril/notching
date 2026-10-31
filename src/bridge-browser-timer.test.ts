import { expect, test } from 'vitest';
import { formatLeft } from '../modules/timer/ruler';
import { fakeTimer } from './bridge-browser-timer';

test('formatLeft matches the status beside the notch', () => {
  expect(formatLeft(402_000)).toBe('6:42');
  expect(formatLeft(401_001)).toBe('6:42');
  expect(formatLeft(3_600_000)).toBe('60:00');
  expect(formatLeft(1)).toBe('0:01');
});

test('the browser timer runs, pauses, resumes and ends like the core one', () => {
  let now = 1_000_000;
  const call = fakeTimer(() => now);
  expect(call('read', undefined)).toEqual({ state: 'idle', minutes: 30, until: null, left: null, text: null });
  expect(call('start', { minutes: 5 })).toEqual({ state: 'running', minutes: 5, until: now + 300_000, left: 300_000, text: '5:00' });
  now += 18_000;
  expect(call('pause', undefined)).toEqual({ state: 'paused', minutes: 5, until: null, left: 282_000, text: '4:42' });
  now += 999_000;
  expect(call('resume', undefined)).toMatchObject({ state: 'running', until: now + 282_000 });
  now += 282_000;
  expect(call('read', undefined)).toEqual({ state: 'idle', minutes: 5, until: null, left: null, text: null });
  call('start', { minutes: 25 });
  expect(call('stop', undefined)).toEqual({ state: 'idle', minutes: 25, until: null, left: null, text: null });
});

test('the browser timer refuses what the core refuses', () => {
  const call = fakeTimer(() => 0);
  expect(() => call('start', { minutes: 0 })).toThrow('minutes must be 1–60');
  expect(() => call('start', { minutes: 61 })).toThrow('minutes must be 1–60');
  expect(() => call('pause', undefined)).toThrow('the timer is not running');
  expect(() => call('resume', undefined)).toThrow('the timer is not paused');
  expect(() => call('add', undefined)).toThrow('unknown method add');
});

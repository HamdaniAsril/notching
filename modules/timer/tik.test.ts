import { expect, test, vi } from 'vitest';
import { checkPrefs, makeTicker, TIK_GAP_MS, tikFor } from './tik';

test('one minute passed is a tik, a fifth minute is the fuller one', () => {
  expect(tikFor(30, 31)).toBe('minute');
  expect(tikFor(31, 30)).toBe('five');
  expect(tikFor(34, 35)).toBe('five');
  expect(tikFor(36, 35)).toBe('five');
  expect(tikFor(35, 36)).toBe('minute');
  expect(tikFor(35, 34)).toBe('minute');
});

test('a ruler that has not moved a whole minute stays quiet', () => {
  expect(tikFor(30, 30)).toBeNull();
});

test('a jump over a fifth minute sounds as one', () => {
  expect(tikFor(31, 37)).toBe('five');
  expect(tikFor(37, 31)).toBe('five');
  expect(tikFor(31, 34)).toBe('minute');
  expect(tikFor(39, 36)).toBe('minute');
});

function ticker() {
  let now = 1000;
  const play = vi.fn();
  const t = makeTicker(play, () => now);
  return { t, play, wait: (ms: number) => { now += ms; } };
}

test('each minute passed plays once', () => {
  const { t, play, wait } = ticker();
  t.step(30, 31);
  wait(100);
  t.step(31, 32);
  wait(100);
  t.step(32, 32);
  expect(play.mock.calls).toEqual([['minute'], ['minute']]);
});

test('a fast drag never plays two tiks closer than the gap', () => {
  const { t, play, wait } = ticker();
  t.step(30, 31);
  wait(TIK_GAP_MS - 1);
  t.step(31, 32);
  wait(1);
  t.step(32, 33);
  expect(play.mock.calls).toEqual([['minute'], ['minute']]);
});

test('the sound is on unless the person turned it off', () => {
  expect(checkPrefs({ sound: false })).toEqual({ sound: false });
  expect(checkPrefs({ sound: true })).toEqual({ sound: true });
  for (const raw of [null, undefined, {}, { sound: 'no' }, 'x']) expect(checkPrefs(raw)).toEqual({ sound: true });
});

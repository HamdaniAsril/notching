import { expect, test } from 'vitest';
import { clockText, createNow, firstWord, isEmpty, position, type NowState } from './now';

const AT = 1_000_000;
const TRACK: NowState = {
  on: true, title: 'Jalan Braga', artist: 'Kolektif Senja', album: null,
  duration: 228, elapsed: 214, rate: 1, at: AT, app: 'com.apple.Music', art: null,
};
const NOTHING: NowState = { ...TRACK, title: null, artist: null, duration: null, elapsed: null, rate: 0, app: null };

test('position advances with rate x time since the read while playing', () => {
  expect(position(TRACK, AT)).toBe(214);
  expect(position(TRACK, AT + 5_000)).toBe(219);
  expect(position({ ...TRACK, rate: 2 }, AT + 5_000)).toBe(224);
});

test('position freezes when paused', () => {
  expect(position({ ...TRACK, rate: 0 }, AT + 60_000)).toBe(214);
});

test('position clamps to 0 and to the duration, and a read stamped in the future does not go back', () => {
  expect(position(TRACK, AT + 60_000)).toBe(228);
  expect(position({ ...TRACK, elapsed: -3 }, AT)).toBe(0);
  expect(position(TRACK, AT - 10_000)).toBe(214);
});

test('without a duration there is no upper clamp, and without a position it is 0', () => {
  expect(position({ ...TRACK, duration: null }, AT + 5_000)).toBe(219);
  expect(position({ ...TRACK, elapsed: null }, AT + 5_000)).toBe(0);
  expect(position({ ...TRACK, elapsed: null, rate: 0 }, AT + 5_000)).toBe(0);
});

test('empty when the helper is off or nothing has a title', () => {
  expect(isEmpty(TRACK)).toBe(false);
  expect(isEmpty({ ...TRACK, on: false })).toBe(true);
  expect(isEmpty({ ...NOTHING })).toBe(true);
  expect(isEmpty({ ...TRACK, title: '   ' })).toBe(true);
  expect(isEmpty({ ...TRACK, title: null, artist: 'Someone' })).toBe(true);
});

test('the first word of a title, for the tile with no artwork', () => {
  expect(firstWord('Jalan Braga')).toBe('Jalan');
  expect(firstWord('  Braga  ')).toBe('Braga');
  expect(firstWord('')).toBe('');
  expect(firstWord(null)).toBe('');
});

test('the clock text: 2.14 in Indonesian, 2:14 in English, hours kept', () => {
  expect(clockText(214, 'id')).toBe('3.34');
  expect(clockText(134, 'id')).toBe('2.14');
  expect(clockText(134, 'en')).toBe('2:14');
  expect(clockText(5, 'en')).toBe('0:05');
  expect(clockText(3725, 'en')).toBe('1:02:05');
  expect(clockText(3725.9, 'id')).toBe('1.02.05');
  expect(clockText(-4, 'en')).toBe('0:00');
});

test('the view: position, playing, empty', () => {
  const now = createNow();
  now.read(TRACK, AT);
  expect(now.view(AT + 2_000)).toMatchObject({ empty: false, playing: true, title: 'Jalan Braga', artist: 'Kolektif Senja', position: 216, duration: 228 });
  now.read({ ...TRACK, rate: 0 }, AT + 3_000);
  expect(now.view(AT + 9_000)).toMatchObject({ playing: false, position: 214 });
  now.read(NOTHING, AT + 10_000);
  expect(now.view(AT + 10_000)).toMatchObject({ empty: true, playing: false, title: '', position: 0 });
});

test('a refreshed timestamp that lands under 2 s behind does not move the bar back', () => {
  const now = createNow();
  now.read(TRACK, AT);
  expect(now.view(AT + 10_000).position).toBe(224);
  // The source gave no timestamp: the helper restamped the same reading 10 s later.
  now.read({ ...TRACK, elapsed: 223, at: AT + 10_000 }, AT + 10_000);
  expect(now.view(AT + 10_000).position).toBe(224);
  expect(now.view(AT + 10_500).position).toBe(224);
  expect(now.view(AT + 11_500).position).toBe(224.5);
});

test('a real seek back, a new track, or a pause still move the bar', () => {
  const now = createNow();
  now.read(TRACK, AT);
  expect(now.view(AT + 10_000).position).toBe(224);
  now.read({ ...TRACK, elapsed: 100, at: AT + 10_000 }, AT + 10_000);
  expect(now.view(AT + 10_000).position).toBe(100);
  now.read({ ...TRACK, title: 'Lain', elapsed: 99, at: AT + 10_000 }, AT + 10_000);
  expect(now.view(AT + 10_000).position).toBe(99);
  now.read({ ...TRACK, title: 'Lain', elapsed: 98.5, rate: 0, at: AT + 10_000 }, AT + 10_000);
  expect(now.view(AT + 12_000).position).toBe(98.5);
});

test('press flips playing at once, from the position now, and the next read after the grace corrects it', () => {
  const now = createNow();
  now.read(TRACK, AT);
  now.press(AT + 4_000);
  expect(now.view(AT + 4_000)).toMatchObject({ playing: false, position: 218 });
  expect(now.view(AT + 9_000).position).toBe(218);
  // A read after the grace says it is still playing: the bar follows the source.
  now.read({ ...TRACK, elapsed: 219, at: AT + 6_000 }, AT + 6_000);
  expect(now.view(AT + 6_000).playing).toBe(true);
});

test('within the grace a stale read does not flip the button back, and a read that agrees ends it', () => {
  const now = createNow();
  now.read(TRACK, AT);
  now.press(AT + 4_000);
  now.read(TRACK, AT + 4_300);
  expect(now.view(AT + 4_300).playing).toBe(false);
  now.read({ ...TRACK, rate: 0, elapsed: 218, at: AT + 4_500 }, AT + 4_600);
  expect(now.view(AT + 4_600)).toMatchObject({ playing: false, position: 218 });
  // The grace is over with that agreeing read: the next one is believed.
  now.read(TRACK, AT + 4_900);
  expect(now.view(AT + 4_900).playing).toBe(true);
});

test('press with nothing playing does nothing', () => {
  const now = createNow();
  now.read(NOTHING, AT);
  now.press(AT);
  expect(now.view(AT).playing).toBe(false);
});

import { expect, test } from 'vitest';
import { fakeMedia } from './bridge-browser-media';

test('the browser player plays "Jalan Braga", toggles, and starts over at the end', () => {
  let t = 5_000_000;
  const call = fakeMedia(null, () => t);
  expect(call('now', undefined)).toEqual({
    on: true, title: 'Jalan Braga', artist: 'Kolektif Senja', album: null, duration: 228, elapsed: 214, rate: 1, at: t, app: 'com.apple.Music', art: null,
  });
  t += 6_000;
  expect(call('command', 'toggle')).toEqual({ ok: true });
  expect(call('now', undefined)).toMatchObject({ elapsed: 220, rate: 0, at: t });
  t += 60_000;
  expect(call('now', undefined)).toMatchObject({ elapsed: 220, rate: 0 });
  call('command', 'toggle');
  expect(call('now', undefined)).toMatchObject({ elapsed: 220, rate: 1 });
  t += 20_000;
  expect(call('now', undefined)).toMatchObject({ elapsed: 0, rate: 1, at: t });
  t += 4_000;
  call('command', 'next');
  expect(call('now', undefined)).toMatchObject({ elapsed: 0, at: t });
});

test('only the five words are commands, and an unknown method is refused', () => {
  const call = fakeMedia();
  for (const w of ['toggle', 'play', 'pause', 'next', 'prev']) expect(call('command', w)).toEqual({ ok: true });
  expect(() => call('command', 'stop')).toThrow('unknown command');
  expect(() => call('seek', 3)).toThrow('unknown method');
});

test('?media=off is nothing playing, ?media=art has a picture and ?media=long long names', () => {
  expect((fakeMedia('long')('now', undefined) as { title: string }).title.length).toBeGreaterThan(60);
  const off = fakeMedia('off');
  expect(off('now', undefined)).toMatchObject({ on: false, title: null, rate: 0 });
  expect(() => off('command', 'toggle')).toThrow();
  expect((fakeMedia('art')('now', undefined) as { art: string }).art.startsWith('data:image/')).toBe(true);
});

test('the notch hears the same track: playing, then paused by a command', () => {
  const call = fakeMedia('art');
  expect(call.summary()).toMatchObject({ playing: true, title: 'Jalan Braga' });
  expect(call.summary().art!.startsWith('data:image/')).toBe(true);
  const heard: boolean[] = [];
  const off = call.onSummary(m => heard.push(m.playing));
  call('command', 'toggle');
  call('command', 'pause');
  call('command', 'next');
  call('command', 'play');
  off();
  call('command', 'toggle');
  expect(heard).toEqual([false, true]);
  expect(call.summary().playing).toBe(false);
});

test('?media=off is nothing playing beside the notch, and no picture without ?media=art', () => {
  expect(fakeMedia('off').summary()).toEqual({ playing: false, title: null, art: null });
  expect(fakeMedia().summary()).toEqual({ playing: true, title: 'Jalan Braga', art: null });
});

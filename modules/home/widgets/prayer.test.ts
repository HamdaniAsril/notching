// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import type { HomeSnapshot } from '../types';
import { at, host, NOW, SNAP } from './fixtures';
import { renderPrayer } from './prayer';

afterEach(() => { document.body.innerHTML = ''; });

const lit = (root: HTMLElement) => [...root.querySelectorAll('.hm-pr-segs .v-seg')].map(s => s.classList.contains('on'));

test('the next prayer shows its name in the accent, its time and what is left', () => {
  const root = host();
  renderPrayer(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.hm-prayer')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.hm-pr-label')!.textContent).toBe('Sholat berikutnya');
  const name = root.querySelector('.hm-pr-name')!;
  expect(name.textContent).toBe('Dzuhur');
  expect(name.classList.contains('v-acc')).toBe(true);
  const time = root.querySelector<HTMLElement>('.hm-pr-next .v-num')!;
  expect(time.textContent).toBe('11.40');
  expect(time.style.fontSize).toBe('30px');
  expect(root.querySelector('.hm-pr-left')!.textContent).toBe('1 j 22 m lagi');
});

test('five segments, the next prayer\'s in the accent and the earlier ones marked passed', () => {
  const root = host();
  renderPrayer(root, id, 'id').update(SNAP, NOW);
  expect(lit(root)).toEqual([false, true, false, false, false]);
  const segs = [...root.querySelectorAll('.hm-pr-segs .v-seg')];
  expect(segs.map(s => s.classList.contains('past'))).toEqual([true, false, false, false, false]);
  expect(root.querySelectorAll('svg')).toHaveLength(0);
});

test('the segment follows the next prayer through the day', () => {
  const root = host();
  const w = renderPrayer(root, id, 'id');
  const next = (name: 'asr' | 'maghrib' | 'isha' | 'fajr'): HomeSnapshot =>
    ({ ...SNAP, prayer: { today: [], prev: SNAP.prayer!.prev, next: { name, at: at(27, 16, 0) } } });
  w.update(next('asr'), NOW);
  expect(lit(root)).toEqual([false, false, true, false, false]);
  w.update(next('isha'), NOW);
  expect(lit(root)).toEqual([false, false, false, false, true]);
  // After Isya the next one is Subuh tomorrow: nothing is passed.
  w.update(next('fajr'), NOW);
  expect(lit(root)).toEqual([true, false, false, false, false]);
  expect(root.querySelectorAll('.v-seg.past')).toHaveLength(0);
});

test('English prayer names, times and countdown', () => {
  const root = host();
  renderPrayer(root, en, 'en').update(SNAP, NOW);
  expect(root.querySelector('.hm-pr-label')!.textContent).toBe('Next prayer');
  expect(root.querySelector('.hm-pr-name')!.textContent).toBe('Dhuhr');
  expect(root.querySelector('.hm-pr-next .v-num')!.textContent).toBe('11:40');
  expect(root.querySelector('.hm-pr-left')!.textContent).toBe('1 h 22 m left');
});

test('without a city it asks for one', () => {
  const root = host();
  renderPrayer(root, id, 'id').update({ ...SNAP, place: null, prayer: null }, NOW);
  expect(root.textContent).toContain('Atur kota di Pengaturan');
  expect(root.querySelector('.v-segs')).toBeNull();
});

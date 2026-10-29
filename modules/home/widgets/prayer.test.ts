// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { progress } from '../format';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { host, NOW, SNAP } from './fixtures';
import { renderPrayer } from './prayer';

afterEach(() => { document.body.innerHTML = ''; });

test('the next prayer shows its time, dots and what is left', () => {
  const root = host();
  renderPrayer(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.lab')!.textContent).toBe('Sholat');
  expect(root.querySelector('.wd-next')!.textContent).toBe('Dzuhur 11.40');
  expect(root.textContent).toContain('1 j 22 m');
  expect(root.querySelectorAll('.dbar circle')).toHaveLength(16);
  const lit = progress(SNAP.prayer!.prev.at, SNAP.prayer!.next.at, NOW.getTime(), 16);
  expect(root.querySelectorAll('.dbar circle[fill="#fff"]')).toHaveLength(lit);
});

test('English prayer names and times', () => {
  const root = host();
  renderPrayer(root, en, 'en').update(SNAP, NOW);
  expect(root.querySelector('.wd-next')!.textContent).toBe('Dhuhr 11:40');
  expect(root.textContent).toContain('1 h 22 m');
});

test('without a city it asks for one', () => {
  const root = host();
  renderPrayer(root, id, 'id').update({ ...SNAP, place: null, prayer: null }, NOW);
  expect(root.textContent).toContain('Atur kota di Pengaturan');
  expect(root.querySelector('.dbar')).toBeNull();
});

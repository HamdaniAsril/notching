// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { host } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderMoon } from './moon';

afterEach(() => { document.body.innerHTML = ''; });

const FULL = new Date(Date.UTC(2026, 10, 24, 14, 53));
const NEW = new Date(Date.UTC(2026, 10, 9, 7, 2));
const DAY = 24 * 3_600_000;
const WANING = new Date(Date.UTC(2026, 10, 2, 12, 0));

test('the card is flush and holds the moon, the phase with its percent and the days to the next', () => {
  const root = host();
  renderMoon(root, id, 'id').update(new Date(Date.UTC(2026, 10, 21, 12, 0)));
  const card = root.querySelector('.wd-moon')!;
  expect(card.classList.contains('v-card')).toBe(true);
  expect(card.classList.contains('flush')).toBe(true);
  expect(card.querySelector('svg.wd-moon-disk')).not.toBeNull();
  expect(card.querySelector('.wd-moon-title')!.textContent).toMatch(/^Cembung \d+%$/);
  expect(card.querySelector('.wd-moon-sub')!.textContent).toBe('Purnama 3 hari lagi');
  expect(card.querySelector('svg.dm')).toBeNull();
  expect(card.querySelector('.rd')).toBeNull();
});

test('at full moon the title is 100% and the sub says today', () => {
  const root = host();
  renderMoon(root, id, 'id').update(FULL);
  expect(root.querySelector('.wd-moon-title')!.textContent).toBe('Purnama 100%');
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Hari ini');
});

test('English names the phase and counts the days', () => {
  const root = host();
  renderMoon(root, en, 'en').update(WANING);
  expect(root.querySelector('.wd-moon-title')!.textContent).toBe('Half 43%');
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('New in 7 days');
});

test('the moon has a halo, a dark disk and a lit part, mirrored when waning', () => {
  const waxing = host();
  renderMoon(waxing, id, 'id').update(new Date(Date.UTC(2026, 10, 15, 12, 0)));
  const waning = host();
  renderMoon(waning, id, 'id').update(WANING);
  const svg = waxing.querySelector('svg.wd-moon-disk')!;
  expect(svg.getAttribute('width')).toBe('52');
  expect(svg.querySelectorAll('circle')).toHaveLength(2);
  expect(svg.querySelector('path')!.getAttribute('style')).toContain('--v-ink');
  expect(waxing.querySelector('svg.wd-moon-disk g')!.getAttribute('transform')).toBeNull();
  expect(waning.querySelector('svg.wd-moon-disk g')!.getAttribute('transform')).toContain('scale(-1');
});

test('the footer counts to the sooner of full and new', () => {
  const root = host();
  const w = renderMoon(root, id, 'id');
  w.update(new Date(Date.UTC(2026, 10, 12, 12, 0)));
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Purnama 12 hari lagi');
  w.update(NEW);
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Hari ini');
});

test('a single day reads in the singular in English', () => {
  const root = host();
  const w = renderMoon(root, en, 'en');
  w.update(new Date(NEW.getTime() - DAY));
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('New in 1 day');
  w.update(new Date(FULL.getTime() - DAY));
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Full in 1 day');
  renderMoon(root, id, 'id').update(new Date(NEW.getTime() - DAY));
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Baru 1 hari lagi');
});

test('the longest sub is the new-moon one in Indonesian', () => {
  const root = host();
  renderMoon(root, id, 'id').update(new Date(Date.UTC(2026, 10, 27, 12, 0)));
  expect(root.querySelector('.wd-moon-sub')!.textContent).toBe('Baru 11 hari lagi');
});

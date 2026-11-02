// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth } from '../../../src/kit/dots';
import { host } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderMoon } from './moon';

afterEach(() => { document.body.innerHTML = ''; });

const FULL = new Date(Date.UTC(2026, 10, 24, 14, 53));
const NEW = new Date(Date.UTC(2026, 10, 9, 7, 2));
const DAY = 24 * 3_600_000;
const WANING = new Date(Date.UTC(2026, 10, 2, 12, 0));

test('at full moon the number is 100 and fits beside the moon', () => {
  const root = host();
  renderMoon(root, id, 'id').update(FULL);
  const svg = root.querySelector('.wd-big svg.dm')!;
  const w = Number(svg.getAttribute('width'));
  expect(w).toBeLessThanOrEqual(109 - 40);
  // 100 does not fit at 6, 5 is still too wide, so it is 4.
  expect(w).toBe(dotWidth('100', 4));
  expect(root.querySelector('.lab')!.textContent).toBe('BULAN · PURNAMA');
  expect(root.textContent).toContain('Hari ini');
});

test('a smaller number keeps the big pitch', () => {
  const root = host();
  renderMoon(root, en, 'en').update(WANING);
  const lit = root.querySelector('.wd-big svg.dm')!;
  expect(lit.getAttribute('width')).toBe(String(dotWidth('43', 6)));
  expect(root.querySelector('.lab')!.textContent).toBe('MOON · HALF');
  expect(root.textContent).toContain('New in 7 days');
});

test('the moon is a disk with a lit part, mirrored when waning', () => {
  const waxing = host();
  renderMoon(waxing, id, 'id').update(new Date(Date.UTC(2026, 10, 15, 12, 0)));
  const waning = host();
  renderMoon(waning, id, 'id').update(WANING);
  expect(waxing.querySelector('svg.wd-moon-disk')!.getAttribute('width')).toBe('34');
  expect(waxing.querySelector('svg.wd-moon-disk g')!.getAttribute('transform')).toBeNull();
  expect(waning.querySelector('svg.wd-moon-disk g')!.getAttribute('transform')).toContain('scale(-1');
});

test('the footer counts to the sooner of full and new', () => {
  const root = host();
  const w = renderMoon(root, id, 'id');
  w.update(new Date(Date.UTC(2026, 10, 12, 12, 0)));
  expect(root.textContent).toContain('Purnama 12 hari');
  w.update(NEW);
  expect(root.textContent).toContain('Hari ini');
  expect(root.querySelector('.rd')).not.toBeNull();
});

test('a single day reads in the singular in English', () => {
  const root = host();
  const w = renderMoon(root, en, 'en');
  w.update(new Date(NEW.getTime() - DAY));
  expect(root.querySelector('.wd-moon-foot .lab')!.textContent).toBe('New in 1 day');
  w.update(new Date(FULL.getTime() - DAY));
  expect(root.querySelector('.wd-moon-foot .lab')!.textContent).toBe('Full in 1 day');
  renderMoon(root, id, 'id').update(new Date(NEW.getTime() - DAY));
  expect(root.querySelector('.wd-moon-foot .lab')!.textContent).toBe('Bulan baru 1 hari');
});

test('the longest footer is whole text, and may wrap', async () => {
  const root = host();
  renderMoon(root, id, 'id').update(new Date(Date.UTC(2026, 10, 12, 12, 0)));
  expect(root.querySelector('.wd-moon-foot .lab')!.textContent).toBe('Purnama 12 hari');
  renderMoon(root, id, 'id').update(new Date(Date.UTC(2026, 10, 27, 12, 0)));
  expect(root.querySelector('.wd-moon-foot .lab')!.textContent).toBe('Bulan baru 11 hari');
  // The module's CSS lets the footer label wrap: no ellipsis, no nowrap. Vitest blanks a
  // stylesheet imported as text, so the file is read from disk (vitest runs from the repo root).
  // @ts-expect-error no @types/node in this project
  const { readFileSync } = await import('node:fs');
  const css: string = readFileSync('modules/sekitar/style.css', 'utf8');
  const rule = /\.wd-moon-foot \.lab \{([^}]*)\}/.exec(css)![1];
  expect(rule).toContain('white-space: normal');
  expect(rule).not.toContain('nowrap');
  expect(rule).not.toContain('ellipsis');
});

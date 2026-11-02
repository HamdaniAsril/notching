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
const WANING = new Date(Date.UTC(2026, 10, 2, 12, 0));

test('at full moon the number is 100 and fits beside the moon', () => {
  const root = host();
  renderMoon(root, id, 'id').update(FULL);
  const svg = root.querySelector('.wd-big svg.dm')!;
  const w = Number(svg.getAttribute('width'));
  expect(w).toBeLessThanOrEqual(109 - 40);
  // 100 does not fit at 6, 5 is still too wide, so it is 4.
  expect(w).toBe(dotWidth('100', 4));
  expect(root.querySelector('.lab')!.textContent).toBe('Bulan · Purnama');
  expect(root.textContent).toContain('Hari ini');
});

test('a smaller number keeps the big pitch', () => {
  const root = host();
  renderMoon(root, en, 'en').update(WANING);
  const lit = root.querySelector('.wd-big svg.dm')!;
  expect(lit.getAttribute('width')).toBe(String(dotWidth('50', 6)));
  expect(root.querySelector('.lab')!.textContent).toBe('Moon · Half');
  expect(root.textContent).toContain('New in 8 days');
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
  expect(root.textContent).toContain('Purnama 13 hari');
  w.update(NEW);
  expect(root.textContent).toContain('Hari ini');
  expect(root.querySelector('.rd')).not.toBeNull();
});

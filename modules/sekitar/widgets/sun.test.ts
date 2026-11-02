// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { host, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderSun } from './sun';

afterEach(() => { document.body.innerHTML = ''; });

// Local times, so the test reads the same in any zone.
const t = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const WITH_SUN = { ...SNAP, sun: { rise: t(27, 5, 31), set: t(27, 17, 48), nextRise: t(28, 5, 31) } };

test('by day it counts to sunset, with both times in dots', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 9, 32));
  const text = root.textContent!;
  expect(text).toContain('MATAHARI');
  expect(text).toContain('8J 16M');
  expect(text).toContain('LAGI');
  expect(text).not.toContain('SAMPAI TERBIT');
  expect(root.querySelectorAll('.wd-sun-foot svg.dm')).toHaveLength(2);
  expect([...root.querySelectorAll('.wd-sun-foot .lab')].map(l => l.textContent)).toEqual(['terbit', 'terbenam']);
});

test('at night it counts to sunrise', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 20, 0));
  expect(root.textContent).toContain('9J 31M');
  expect(root.textContent).toContain('SAMPAI TERBIT');
  expect(root.textContent).not.toContain('LAGI');
});

test('English labels, and under an hour the hours are dropped', () => {
  const root = host();
  const w = renderSun(root, en, 'en');
  w.update(WITH_SUN, new Date(2026, 9, 27, 17, 18));
  expect(root.textContent).toContain('30M');
  expect(root.textContent).toContain('LEFT');
  expect(root.textContent).not.toContain('H ');
  w.update(WITH_SUN, new Date(2026, 9, 27, 21, 0));
  expect(root.textContent).toContain('TO SUNRISE');
});

test('the arc has a horizon, a passed part, a dim rest and a red dot at the progress point', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 11, 40));
  const svg = root.querySelector('svg.wd-sun-arc')!;
  expect(svg.getAttribute('width')).toBe('200');
  expect(svg.getAttribute('height')).toBe('40');
  expect(svg.querySelector('line')).not.toBeNull();
  expect(svg.querySelector('path.passed')!.getAttribute('d')).toMatch(/^M4 38Q/);
  expect(svg.querySelector('path.rest')!.getAttribute('d')).toMatch(/196 38$/);
  const dot = svg.querySelector('circle')!;
  // Half way along a Bézier from (4,38) via (100,-18) to (196,38) is (100, 10).
  expect(Number(dot.getAttribute('cx'))).toBeCloseTo(100, 0);
  expect(Number(dot.getAttribute('cy'))).toBeCloseTo(10, 0);
});

test('the dot rests at the end of the arc after sunset and at the start before sunrise', () => {
  const root = host();
  const w = renderSun(root, id, 'id');
  w.update(WITH_SUN, new Date(2026, 9, 27, 20, 0));
  expect(root.querySelector('circle')!.getAttribute('cx')).toBe('196');
  w.update(WITH_SUN, new Date(2026, 9, 27, 4, 0));
  expect(root.querySelector('circle')!.getAttribute('cx')).toBe('4');
});

test('without a city it asks for one', () => {
  const root = host();
  renderSun(root, id, 'id').update({ ...WITH_SUN, place: null, sun: null }, new Date(2026, 9, 27, 9, 32));
  expect(root.textContent).toBe(id.noPlace);
});

test('a city without sun times shows a dash', () => {
  const root = host();
  renderSun(root, id, 'id').update({ ...WITH_SUN, sun: null }, new Date(2026, 9, 27, 9, 32));
  expect(root.textContent).toContain('MATAHARI');
  expect(root.querySelector('svg.wd-sun-arc')).toBeNull();
  expect(root.textContent).toContain('—');
});

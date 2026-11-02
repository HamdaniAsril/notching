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

test('by day it counts to sunset, with both times in Barlow', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 9, 32));
  expect(root.querySelector('.wd-sun')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.wd-sun-top .v-lab')!.textContent).toBe('Matahari');
  expect(root.querySelector('.wd-sun-eta')!.textContent).toBe('Terbenam 8 j 16 m lagi');
  const times = [...root.querySelectorAll<HTMLElement>('.wd-sun-foot .v-num')];
  expect(times.map(n => n.textContent)).toEqual(['05.31', '17.48']);
  expect(times.map(n => n.style.fontSize)).toEqual(['16px', '16px']);
  expect([...root.querySelectorAll('.wd-sun-foot .v-lab')].map(l => l.textContent)).toEqual(['terbit', 'terbenam']);
  expect(root.querySelector('svg.dm')).toBeNull();
});

test('at night it counts to sunrise', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 20, 0));
  expect(root.querySelector('.wd-sun-eta')!.textContent).toBe('Terbit 9 j 31 m lagi');
});

test('English reads the times with a colon, and under an hour the hours are dropped', () => {
  const root = host();
  const w = renderSun(root, en, 'en');
  w.update(WITH_SUN, new Date(2026, 9, 27, 17, 18));
  expect(root.querySelector('.wd-sun-eta')!.textContent).toBe('Sunset in 30 m');
  expect([...root.querySelectorAll('.wd-sun-foot .v-num')].map(n => n.textContent)).toEqual(['05:31', '17:48']);
  expect([...root.querySelectorAll('.wd-sun-foot .v-lab')].map(l => l.textContent)).toEqual(['sunrise', 'sunset']);
  w.update(WITH_SUN, new Date(2026, 9, 27, 21, 0));
  expect(root.querySelector('.wd-sun-eta')!.textContent).toBe('Sunrise in 8 h 31 m');
});

test('by day the arc has a horizon, an accent part to the sun, a faint rest and an accent dot', () => {
  const root = host();
  renderSun(root, id, 'id').update(WITH_SUN, new Date(2026, 9, 27, 11, 40));
  const svg = root.querySelector('svg.wd-sun-arc')!;
  expect(svg.getAttribute('width')).toBe('210');
  expect(svg.getAttribute('height')).toBe('38');
  expect(svg.querySelector('line')).not.toBeNull();
  expect(svg.querySelector('path.passed')!.getAttribute('style')).toContain('--v-acc');
  expect(svg.querySelector('path.passed')!.getAttribute('d')).toMatch(/^M3 37Q/);
  expect(svg.querySelector('path.rest')!.getAttribute('style')).toContain('--v-faint');
  expect(svg.querySelector('path.rest')!.getAttribute('d')).toMatch(/207 37$/);
  const [glow, dot] = [...svg.querySelectorAll('circle')];
  expect(dot.getAttribute('style')).toContain('--v-acc');
  expect(glow.getAttribute('cx')).toBe(dot.getAttribute('cx'));
  // 11:40 is half way between 05:31 and 17:48 (about); the dot is near the middle of the arc.
  expect(Number(dot.getAttribute('cx'))).toBeGreaterThan(95);
  expect(Number(dot.getAttribute('cx'))).toBeLessThan(115);
  expect(Number(dot.getAttribute('cy'))).toBeLessThan(8);
  expect(root.querySelector('svg')!.innerHTML).not.toContain('--red');
});

test('at night the whole arc is faint and the dot rests dim at an end', () => {
  const root = host();
  const w = renderSun(root, id, 'id');
  w.update(WITH_SUN, new Date(2026, 9, 27, 20, 0));
  expect(root.querySelector('path.passed')).toBeNull();
  expect(root.querySelector('path.rest')!.getAttribute('d')).toMatch(/^M3 37Q.*207 37$/);
  expect(root.querySelectorAll('circle')).toHaveLength(1);
  expect(root.querySelector('circle')!.getAttribute('cx')).toBe('207');
  expect(root.querySelector('circle')!.getAttribute('style')).toContain('--v-dim');
  w.update(WITH_SUN, new Date(2026, 9, 27, 4, 0));
  expect(root.querySelector('circle')!.getAttribute('cx')).toBe('3');
});

test('without a city it asks for one', () => {
  const root = host();
  renderSun(root, id, 'id').update({ ...WITH_SUN, place: null, sun: null }, new Date(2026, 9, 27, 9, 32));
  expect(root.textContent).toBe(id.noPlace);
});

test('a city without sun times shows a dash', () => {
  const root = host();
  renderSun(root, id, 'id').update({ ...WITH_SUN, sun: null }, new Date(2026, 9, 27, 9, 32));
  expect(root.textContent).toContain('Matahari');
  expect(root.querySelector('svg.wd-sun-arc')).toBeNull();
  expect(root.textContent).toContain('—');
});

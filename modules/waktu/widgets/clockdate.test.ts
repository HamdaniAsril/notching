// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { renderClockDate } from './clockdate';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the top line has the city, zone and date; below it the time and the hour row', () => {
  const root = host();
  renderClockDate(root, 'id').update(NOW, 'Jakarta');
  const labs = [...root.querySelectorAll('.top .lab')].map(l => l.textContent!);
  expect(labs[0]).toContain('JAKARTA');
  expect(labs[0]).toContain(' · ');
  expect(labs[1]).toBe('SAB 31.10');
  expect(root.querySelectorAll('.wd-big svg.dm')).toHaveLength(1);
  const dots = [...root.querySelectorAll('.wd-row .d')];
  expect(dots).toHaveLength(24);
  expect(root.querySelectorAll('.wd-row .lit')).toHaveLength(9);
  expect(dots.findIndex(d => d.classList.contains('now'))).toBe(9);
});

test('without a city the left label is the zone alone', () => {
  const root = host();
  renderClockDate(root, 'id').update(NOW, null);
  const left = root.querySelector('.top .lab')!.textContent!;
  expect(left).not.toContain('·');
  expect(left.length).toBeGreaterThan(0);
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderClockDate(root, 'en');
  w.update(NOW, 'Jakarta');
  w.update(new Date(2026, 9, 31, 10, 0), 'Jakarta');
  expect(root.querySelectorAll('.wd-clockdate')).toHaveLength(1);
  expect(root.querySelectorAll('.wd-row .lit')).toHaveLength(10);
  expect(root.querySelector('.top .lab:last-child')!.textContent).toBe('SAT 31.10');
});

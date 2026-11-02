// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { icon, ICONS, weatherIcon } from './icons';
import { big, dotRow, el, small } from './widget';

test('a dot row has one dot per count, the lit ones and one now', () => {
  const row = dotRow(24, 9, 9);
  expect(row.className).toBe('wd-row');
  expect(row.children).toHaveLength(24);
  expect(row.querySelectorAll('.now')).toHaveLength(1);
  expect(row.querySelectorAll('.lit')).toHaveLength(9);
  expect(row.children[9].classList.contains('now')).toBe(true);
});

test('without a now marker no dot is red', () => {
  const row = dotRow(7, 3, null);
  expect(row.querySelectorAll('.now')).toHaveLength(0);
  expect(row.querySelectorAll('.lit')).toHaveLength(3);
});

test('a now dot inside the lit range is red, not white', () => {
  const row = dotRow(5, 4, 1);
  expect(row.children[1].classList.contains('now')).toBe(true);
  expect(row.children[1].classList.contains('lit')).toBe(false);
});

test('small text is a dot box at the given pitch', () => {
  const box = small('09:41', 3);
  expect(box.className).toBe('wd-small');
  expect(box.querySelector('svg.dm')?.getAttribute('height')).toBe('21');
  expect(small('1', 2, 'x').className).toBe('x');
});

test('big and el are the home helpers, moved', () => {
  const root = el('div');
  expect(big(root, '12').querySelector('svg.dm')).not.toBeNull();
  expect(el('span', 'a', 'b').textContent).toBe('b');
});

test('every icon is a 24 px Lucide svg in currentColor', () => {
  for (const svg of Object.values(ICONS)) {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"')).toBe(true);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg.endsWith('</svg>')).toBe(true);
  }
  expect(Object.keys(ICONS)).toHaveLength(12);
});

test('icon() sizes the svg inside an i.ic', () => {
  const i = icon('sun', 20);
  expect(i.tagName).toBe('I');
  expect(i.className).toBe('ic');
  const svg = i.querySelector('svg')!;
  expect(svg.getAttribute('width')).toBe('20');
  expect(svg.getAttribute('height')).toBe('20');
  expect(icon('sun').querySelector('svg')?.getAttribute('width')).toBe('16');
});

test('weather codes map to icons, night swaps the sun for the moon', () => {
  expect(weatherIcon(0, false)).toBe('sun');
  expect(weatherIcon(0, true)).toBe('moon');
  expect(weatherIcon(2, false)).toBe('cloud-sun');
  expect(weatherIcon(1, true)).toBe('cloud-moon');
  expect(weatherIcon(3, true)).toBe('cloud');
  expect(weatherIcon(45, false)).toBe('cloud-fog');
  expect(weatherIcon(53, false)).toBe('cloud-drizzle');
  expect(weatherIcon(63, false)).toBe('cloud-rain');
  expect(weatherIcon(81, false)).toBe('cloud-rain');
  expect(weatherIcon(73, false)).toBe('cloud-snow');
  expect(weatherIcon(95, false)).toBe('cloud-lightning');
});

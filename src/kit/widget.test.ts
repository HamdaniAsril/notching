// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { icon, ICONS, weatherIcon } from './icons';
import { el } from './widget';

test('el makes an element with its class and text', () => {
  const e = el('span', 'v-lab', 'Jakarta');
  expect(e.tagName).toBe('SPAN');
  expect(e.className).toBe('v-lab');
  expect(e.textContent).toBe('Jakarta');
});

test('every icon is a 24 px Lucide svg in currentColor', () => {
  for (const svg of Object.values(ICONS)) {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"')).toBe(true);
    expect(svg).toContain('stroke="currentColor"');
    expect(svg.endsWith('</svg>')).toBe(true);
  }
  expect(Object.keys(ICONS)).toHaveLength(13);
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

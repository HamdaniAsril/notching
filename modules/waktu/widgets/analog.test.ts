// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { handAngles, renderAnalog } from './analog';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the hands at 09:41:30', () => {
  expect(handAngles(NOW)).toEqual({ hour: 290.5, minute: 249, second: 180 });
});

test('noon and midnight put the hour hand at 0', () => {
  expect(handAngles(new Date(2026, 9, 31, 0, 0, 0)).hour).toBe(0);
  expect(handAngles(new Date(2026, 9, 31, 12, 0, 0)).hour).toBe(0);
});

test('the face fills the frame: 12 faint ticks, three hands, an accent pin and the city', () => {
  const root = host();
  renderAnalog(root, 'id').update(NOW, 'Jakarta');
  expect(root.querySelector('.wd-analog')!.classList.contains('flush')).toBe(true);
  const svg = root.querySelector('svg')!;
  expect(svg.getAttribute('width')).toBe('109');
  expect(svg.getAttribute('height')).toBe('104');
  expect(svg.querySelectorAll('line.tk')).toHaveLength(12);
  expect(svg.querySelectorAll('line.tk')[0].getAttribute('stroke')).toBe('#454941');
  expect(svg.querySelectorAll('circle.pin')).toHaveLength(1);
  expect(svg.querySelector('circle.pin')!.getAttribute('fill')).toBe('#c8f04a');
  expect(svg.querySelector('line.sec')!.getAttribute('stroke')).toBe('#c8f04a');
  expect(svg.querySelector('line.sec')!.getAttribute('transform')).toBe('rotate(180 54.5 52)');
  expect(svg.querySelector('line.hr')!.getAttribute('stroke')).toBe('#f3f5f0');
  expect(svg.querySelector('line.mn')!.getAttribute('stroke')).toBe('#f3f5f0');
  expect(svg.querySelector('text')!.textContent).toBe('Jakarta');
  // No red anywhere.
  expect(svg.outerHTML.toLowerCase()).not.toContain('#e8262e');
});

test('without a city the label is the zone; a long city name is shortened', () => {
  const root = host();
  const w = renderAnalog(root, 'id');
  w.update(NOW, null);
  expect(root.querySelector('svg text')!.textContent!.length).toBeGreaterThan(0);
  w.update(NOW, 'Kota Administrasi Jakarta Selatan');
  const label = root.querySelector('svg text')!.textContent!;
  expect(label.length).toBeLessThanOrEqual(16);
  expect(label.endsWith('…')).toBe(true);
});

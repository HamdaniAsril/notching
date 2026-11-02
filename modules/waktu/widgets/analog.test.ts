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

test('the face has 12 ticks, three hands, a pin and the zone', () => {
  const root = host();
  renderAnalog(root, 'id').update(NOW);
  const svg = root.querySelector('svg')!;
  expect(svg.getAttribute('width')).toBe('96');
  // 12 ticks; the pin is a circle too.
  expect(svg.querySelectorAll('circle.tk')).toHaveLength(12);
  expect(svg.querySelectorAll('circle.pin')).toHaveLength(1);
  expect(svg.querySelectorAll('line.sec')).toHaveLength(1);
  expect(svg.querySelector('line.sec')!.getAttribute('transform')).toBe('rotate(180 48 48)');
  expect(svg.querySelector('line.hr')!.getAttribute('stroke-width')).toBe('5');
  expect(svg.querySelector('line.mn')!.getAttribute('stroke-width')).toBe('2.5');
  expect(svg.querySelector('text')!.textContent!.length).toBeGreaterThan(0);
});

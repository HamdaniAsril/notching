// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { renderDate } from './date';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the date shows the day name with the accent dot, the big date and the month', () => {
  const root = host();
  renderDate(root, 'id').update(NOW);
  expect(root.querySelector('.hm-date')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.hm-date-top .v-lab')!.textContent).toBe('Selasa');
  expect(root.querySelector('.hm-date-top .hm-dot')).not.toBeNull();
  const day = root.querySelector<HTMLElement>('.v-num')!;
  expect(day.textContent).toBe('27');
  expect(day.style.fontSize).toBe('57px');
  expect(root.querySelector('.hm-date-month')!.textContent).toBe('Oktober 2026');
  expect(root.querySelectorAll('svg, .rd, .lab')).toHaveLength(0);
});

test('English names', () => {
  const root = host();
  renderDate(root, 'en').update(NOW);
  expect(root.querySelector('.hm-date-top .v-lab')!.textContent).toBe('Tuesday');
  expect(root.querySelector('.hm-date-month')!.textContent).toBe('October 2026');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderDate(root, 'id');
  w.update(NOW);
  w.update(new Date(2026, 9, 28, 0, 1));
  expect(root.querySelectorAll('.hm-date')).toHaveLength(1);
  expect(root.querySelector('.v-num')!.textContent).toBe('28');
});

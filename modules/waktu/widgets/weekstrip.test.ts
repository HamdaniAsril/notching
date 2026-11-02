// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { host } from './fixtures';
import { renderWeekStrip } from './weekstrip';

afterEach(() => { document.body.innerHTML = ''; });

// Sunday 8 Nov 2026, ISO week 45.
const SUNDAY = new Date(2026, 10, 8, 20, 0);

test('seven cells Monday to Sunday, the last one today', () => {
  const root = host();
  renderWeekStrip(root, 'id').update(SUNDAY);
  const cells = [...root.querySelectorAll('.wd-wk-cell')];
  expect(cells).toHaveLength(7);
  expect(cells[0].querySelector('.lab')!.textContent).toBe('SEN');
  expect(cells[6].querySelector('.lab')!.textContent).toBe('MIN');
  expect(root.querySelectorAll('.wd-wk-cell.today')).toHaveLength(1);
  expect(cells[6].classList.contains('today')).toBe(true);
  expect(cells[6].querySelector('.lab .rd')).not.toBeNull();
  expect(cells.slice(0, 6).every(c => c.classList.contains('past'))).toBe(true);
  expect(cells.map(c => c.querySelector('svg.dm')!.getAttribute('width'))).toHaveLength(7);
});

test('the right side shows the ISO week', () => {
  const root = host();
  renderWeekStrip(root, 'id').update(SUNDAY);
  const right = root.querySelector('.wd-wk-week')!;
  expect(right.querySelector('.lab')!.textContent).toBe('MGG');
  expect(right.querySelector('svg.dm')).not.toBeNull();
});

test('the left side has the long weekday, the day and the month', () => {
  const root = host();
  renderWeekStrip(root, 'id').update(SUNDAY);
  const left = root.querySelector('.wd-wk-today')!;
  expect(left.querySelector('.lab')!.textContent).toBe('MINGGU');
  expect(left.querySelector('svg.dm')).not.toBeNull();
  expect(left.querySelector('.wd-wk-month')!.textContent).toBe('NOV');
});

test('midweek, days before are past and days after are future', () => {
  const root = host();
  renderWeekStrip(root, 'en').update(new Date(2026, 10, 4, 9, 0));
  const cls = [...root.querySelectorAll('.wd-wk-cell')].map(c => c.classList.contains('today') ? 'today' : c.classList.contains('past') ? 'past' : 'future');
  expect(cls).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future']);
  expect(root.querySelector('.wd-wk-week .lab')!.textContent).toBe('WK');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderWeekStrip(root, 'id');
  w.update(SUNDAY);
  w.update(new Date(2026, 10, 9));
  expect(root.querySelectorAll('.wd-weekstrip')).toHaveLength(1);
  expect(root.querySelector('.wd-wk-cell.today .lab')!.textContent).toBe('SEN');
});

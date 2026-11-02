// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderCalendar } from './calendar';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('on 31 Oct 2026 exactly one cell is today and it reads 31', () => {
  const root = host();
  renderCalendar(root, id, 'id').update(NOW);
  const today = root.querySelectorAll('.wd-cal-grid .today');
  expect(today).toHaveLength(1);
  expect(today[0].textContent).toBe('31');
});

test('the grid has the 31 days of October and a header of 7 single letters', () => {
  const root = host();
  renderCalendar(root, id, 'id').update(NOW);
  const days = [...root.querySelectorAll('.wd-cal-grid .wd-cal-d')].filter(c => c.textContent);
  expect(days).toHaveLength(31);
  const head = [...root.querySelectorAll('.wd-cal-grid .wd-cal-h')].map(h => h.textContent);
  expect(head).toHaveLength(7);
  expect(head.every(h => h!.length === 1)).toBe(true);
});

test('Saturday and Sunday columns are marked', () => {
  const root = host();
  renderCalendar(root, en, 'en').update(NOW);
  // 1 Oct 2026 is a Thursday, so 3 Oct is a Saturday and 4 Oct a Sunday.
  const marked = [...root.querySelectorAll('.wd-cal-d.we')].map(c => c.textContent).filter(Boolean);
  expect(marked.slice(0, 4)).toEqual(['3', '4', '10', '11']);
  expect(root.querySelector('.wd-cal-d.we.today')!.textContent).toBe('31');
});

test('the month label and the year', () => {
  const idRoot = host();
  renderCalendar(idRoot, id, 'id').update(NOW);
  expect(idRoot.querySelector('.wd-cal-month')!.textContent).toBe('OKT');
  expect(idRoot.querySelector('.wd-cal-side .lab')!.textContent).toBe('KALENDER');
  expect(idRoot.querySelector('.wd-cal-side .lab:last-child')!.textContent).toBe('2026');
  const enRoot = host();
  renderCalendar(enRoot, en, 'en').update(NOW);
  expect(enRoot.querySelector('.wd-cal-month')!.textContent).toBe('OCT');
  expect(enRoot.querySelector('.wd-cal-side .lab')!.textContent).toBe('CALENDAR');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderCalendar(root, id, 'id');
  w.update(NOW);
  w.update(new Date(2026, 10, 2, 8, 0));
  expect(root.querySelectorAll('.wd-calendar')).toHaveLength(1);
  expect(root.querySelector('.wd-cal-month')!.textContent).toBe('NOV');
  expect(root.querySelector('.today')!.textContent).toBe('2');
});

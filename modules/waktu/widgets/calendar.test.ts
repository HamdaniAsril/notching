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
  const days = [...root.querySelectorAll('.wd-cal-grid .wd-cal-d:not(.out)')];
  expect(days).toHaveLength(31);
  const head = [...root.querySelectorAll('.wd-cal-grid .wd-cal-h')].map(h => h.textContent);
  expect(head).toEqual(['S', 'S', 'R', 'K', 'J', 'S', 'M']);
});

test('days of the months around fill the first and last week, dimmed', () => {
  const root = host();
  renderCalendar(root, id, 'id').update(NOW);
  const cells = [...root.querySelectorAll('.wd-cal-grid .wd-cal-d')];
  // 1 Oct 2026 is a Thursday, so the week starts on 28 Sep; the last week ends on Sunday 1 Nov.
  expect(cells.slice(0, 4).map(c => c.textContent)).toEqual(['28', '29', '30', '1']);
  expect(cells.slice(0, 4).map(c => c.classList.contains('out'))).toEqual([true, true, true, false]);
  expect(cells).toHaveLength(35);
  expect(cells[34].textContent).toBe('1');
  expect(cells[34].classList.contains('out')).toBe(true);
});

test('the month name and the year, and the title', () => {
  const idRoot = host();
  renderCalendar(idRoot, id, 'id').update(NOW);
  expect(idRoot.querySelector('.wd-cal-month')!.textContent).toBe('Oktober');
  expect(idRoot.querySelector('.wd-cal-year')!.textContent).toBe('2026');
  expect(idRoot.querySelector('.wd-cal-title')!.textContent).toBe('Kalender');
  const enRoot = host();
  renderCalendar(enRoot, en, 'en').update(NOW);
  expect(enRoot.querySelector('.wd-cal-month')!.textContent).toBe('October');
  expect(enRoot.querySelector('.wd-cal-title')!.textContent).toBe('Calendar');
});

test('a month of six weeks still fits: at most 7 rows of the grid', () => {
  const root = host();
  // 1 Aug 2026 is a Saturday: six weeks.
  renderCalendar(root, id, 'id').update(new Date(2026, 7, 15));
  expect(root.querySelectorAll('.wd-cal-grid .wd-cal-d')).toHaveLength(42);
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderCalendar(root, id, 'id');
  w.update(NOW);
  w.update(new Date(2026, 10, 2, 8, 0));
  expect(root.querySelectorAll('.wd-calendar')).toHaveLength(1);
  expect(root.querySelector('.wd-cal-month')!.textContent).toBe('November');
  expect(root.querySelector('.today')!.textContent).toBe('2');
});

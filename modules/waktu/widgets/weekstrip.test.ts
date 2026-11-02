// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { host } from './fixtures';
import { renderWeekStrip } from './weekstrip';

afterEach(() => { document.body.innerHTML = ''; });

// Sunday 8 Nov 2026, ISO week 45.
const SUNDAY = new Date(2026, 10, 8, 20, 0);

test('seven cells Monday to Sunday, the last one today in the accent pill', () => {
  const root = host();
  renderWeekStrip(root, id, 'id').update(SUNDAY);
  expect(root.querySelector('.wd-weekstrip')!.classList.contains('v-card')).toBe(true);
  const cells = [...root.querySelectorAll('.wd-wk-cell')];
  expect(cells).toHaveLength(7);
  expect(cells[0].querySelector('.wd-wk-name')!.textContent).toBe('Sen');
  expect(cells[6].querySelector('.wd-wk-name')!.textContent).toBe('Min');
  expect(root.querySelectorAll('.wd-wk-cell.today')).toHaveLength(1);
  expect(cells[6].classList.contains('today')).toBe(true);
  expect(cells.slice(0, 6).every(c => c.classList.contains('past'))).toBe(true);
  // The numbers are the dates 2 to 8 Nov, two digits each.
  expect(cells.map(c => c.querySelector('.v-num')!.textContent)).toEqual(['02', '03', '04', '05', '06', '07', '08']);
});

test('a day that falls in another month is dimmed', () => {
  const root = host();
  // Saturday 31 Oct 2026: Sunday 1 Nov is next month.
  renderWeekStrip(root, id, 'id').update(new Date(2026, 9, 31, 9, 41));
  const cells = [...root.querySelectorAll('.wd-wk-cell')];
  expect(cells.map(c => c.classList.contains('other'))).toEqual([false, false, false, false, false, false, true]);
  expect(cells[6].querySelector('.v-num')!.textContent).toBe('01');
  expect(cells[5].classList.contains('today')).toBe(true);
});

test('the right side shows the ISO week', () => {
  const root = host();
  renderWeekStrip(root, id, 'id').update(SUNDAY);
  const right = root.querySelector('.wd-wk-week')!;
  expect(right.querySelector('.v-lab')!.textContent).toBe('Minggu ke');
  expect(right.querySelector('.v-num')!.textContent).toBe('45');
});

test('the left side has the long weekday and the day with the month name', () => {
  const root = host();
  renderWeekStrip(root, id, 'id').update(new Date(2026, 9, 31, 9, 41));
  const left = root.querySelector('.wd-wk-today')!;
  expect(left.querySelector('.v-lab')!.textContent).toBe('Sabtu');
  expect(left.querySelector('.v-num')!.textContent).toBe('31 Oktober');
});

test('midweek, days before are past and days after are future', () => {
  const root = host();
  renderWeekStrip(root, en, 'en').update(new Date(2026, 10, 4, 9, 0));
  const cls = [...root.querySelectorAll('.wd-wk-cell')].map(c => c.classList.contains('today') ? 'today' : c.classList.contains('past') ? 'past' : 'future');
  expect(cls).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future']);
  expect(root.querySelector('.wd-wk-week .v-lab')!.textContent).toBe('Week');
  expect(root.querySelector('.wd-wk-today .v-lab')!.textContent).toBe('Wednesday');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderWeekStrip(root, id, 'id');
  w.update(SUNDAY);
  w.update(new Date(2026, 10, 9));
  expect(root.querySelectorAll('.wd-weekstrip')).toHaveLength(1);
  expect(root.querySelector('.wd-wk-cell.today .wd-wk-name')!.textContent).toBe('Sen');
});

// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { host, NOW } from './fixtures';
import { renderYearDay } from './yearday';

afterEach(() => { document.body.innerHTML = ''; });

test('31 Oct 2026 is day 304 with 61 days left', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(NOW);
  expect(root.querySelector('.wd-yearday')!.classList.contains('v-card')).toBe(true);
  const number = root.querySelector<HTMLElement>('.v-num')!;
  expect(number.textContent).toBe('304');
  expect(number.classList.contains('v-acc')).toBe(true);
  expect(number.style.fontSize).toBe('50px');
  expect([...root.querySelectorAll('.wd-top .v-lab, .wd-top .wd-year')].map(l => l.textContent)).toEqual(['Hari ke', '2026']);
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('61 hari lagi');
});

test('the bar is the part of the year gone', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(NOW);
  // 304 of 365.
  expect(root.querySelector<HTMLElement>('.v-bar .v-fill')!.style.width).toBe('83.29%');
  expect(root.querySelectorAll('.d, .wd-row, svg')).toHaveLength(0);
});

test('the last day of a leap year: 366, nothing left, a full bar', () => {
  const root = host();
  renderYearDay(root, 'id', id).update(new Date(2028, 11, 31, 12, 0));
  expect(root.querySelector('.v-num')!.textContent).toBe('366');
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('0 hari lagi');
  expect(root.querySelector<HTMLElement>('.v-bar .v-fill')!.style.width).toBe('100%');
});

test('English, and one day left reads in the singular', () => {
  const root = host();
  const w = renderYearDay(root, 'en', en);
  w.update(NOW);
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('61 days left');
  expect(root.querySelector('.wd-top .v-lab')!.textContent).toBe('Day');
  w.update(new Date(2026, 11, 30));
  expect(root.querySelector('.wd-yearday-left')!.textContent).toBe('1 day left');
});

// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { renderClockDate } from './clockdate';
import { host, NOW } from './fixtures';

afterEach(() => { document.body.innerHTML = ''; });

test('the top line has the city and the short date; below it the time, the seconds and the day bar', () => {
  const root = host();
  renderClockDate(root, 'id').update(NOW, 'Jakarta');
  expect(root.querySelector('.wd-clockdate')!.classList.contains('v-card')).toBe(true);
  expect(root.querySelector('.wd-top .wd-city')!.textContent).toBe('Jakarta');
  expect(root.querySelector('.wd-top .wd-date')!.textContent).toBe('Sab, 31 Okt');
  // Indonesian writes the time with a dot; the seconds are small and in the accent.
  const nums = [...root.querySelectorAll('.wd-time .v-num')];
  expect(nums.map(n => n.textContent)).toEqual(['09.41', '30']);
  expect(nums[0].classList.contains('v-acc')).toBe(false);
  expect(nums[1].classList.contains('v-acc')).toBe(true);
  expect((nums[0] as HTMLElement).style.fontSize).toBe('52px');
  expect((nums[1] as HTMLElement).style.fontSize).toBe('17px');
});

test('the day bar is the part of the day gone, with the percent beside it', () => {
  const root = host();
  renderClockDate(root, 'id').update(NOW, 'Jakarta');
  // 09:41:30 is 40.4% of the day.
  expect(root.querySelector<HTMLElement>('.wd-day .v-fill')!.style.width).toBe('40.38%');
  expect(root.querySelector('.wd-day .wd-pct')!.textContent).toBe('40% hari');
  expect(root.querySelectorAll('.d, .wd-row, svg')).toHaveLength(0);
});

test('midnight is 0% and the last second of the day is 100%', () => {
  const root = host();
  const w = renderClockDate(root, 'id');
  w.update(new Date(2026, 9, 31, 0, 0, 0), null);
  expect(root.querySelector('.wd-pct')!.textContent).toBe('0% hari');
  w.update(new Date(2026, 9, 31, 23, 59, 59), null);
  expect(root.querySelector('.wd-pct')!.textContent).toBe('100% hari');
});

test('without a city the left label is the zone alone', () => {
  const root = host();
  renderClockDate(root, 'id').update(NOW, null);
  const left = root.querySelector('.wd-top .wd-city')!.textContent!;
  expect(left).not.toContain('·');
  expect(left.length).toBeGreaterThan(0);
});

test('English: a colon in the time, "of day" and English day and month', () => {
  const root = host();
  renderClockDate(root, 'en').update(NOW, 'Jakarta');
  expect(root.querySelector('.wd-time .v-num')!.textContent).toBe('09:41');
  expect(root.querySelector('.wd-pct')!.textContent).toBe('40% of day');
  expect(root.querySelector('.wd-date')!.textContent).toBe('Sat, 31 Oct');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderClockDate(root, 'en');
  w.update(NOW, 'Jakarta');
  w.update(new Date(2026, 9, 31, 10, 0, 5), 'Jakarta');
  expect(root.querySelectorAll('.wd-clockdate')).toHaveLength(1);
  expect(root.querySelector('.wd-time .v-num')!.textContent).toBe('10:00');
  expect(root.querySelector('.wd-time .v-acc')!.textContent).toBe('05');
});

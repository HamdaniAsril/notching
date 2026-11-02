// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { dotWidth } from '../../../src/kit/dots';
import { at, host, NOW, rem, SNAP } from '../../home/widgets/fixtures';
import en from '../locales/en.json';
import id from '../locales/id.json';
import { renderWeek } from './week';

afterEach(() => { document.body.innerHTML = ''; });

test('seven day columns, Monday first, one of them today', () => {
  const root = host();
  renderWeek(root, id, 'id').update(SNAP, NOW);
  const cols = [...root.querySelectorAll('.wd-wk-day')];
  expect(cols).toHaveLength(7);
  expect(root.querySelectorAll('.wd-wk-day.today')).toHaveLength(1);
  expect(cols[1].classList.contains('today')).toBe(true);
  expect(cols.map(c => c.querySelector('.lab')!.textContent)).toEqual(['S', 'S', 'R', 'K', 'J', 'S', 'M']);
  expect(cols[1].querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('27', 2)));
  expect(cols[0].querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('26', 2)));
});

test('the top line has the month and the ISO week', () => {
  const root = host();
  renderWeek(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.wd-wk-head')!.textContent).toBe('OKTOBERMGG 44');
  const en1 = host();
  renderWeek(en1, en, 'en').update(SNAP, NOW);
  expect(en1.querySelector('.wd-wk-head')!.textContent).toBe('OCTOBERWK 44');
});

test('a day with an open reminder has a dot, one with only a done reminder has not', () => {
  const root = host();
  const rs = [...SNAP.reminders, rem(9, 'Selesai', '2026-10-29', null, true), rem(8, 'Jumat', '2026-10-30', null)];
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: rs }, NOW);
  const cols = [...root.querySelectorAll('.wd-wk-day')];
  expect(cols[1].classList.contains('has')).toBe(true);
  expect(cols[1].querySelector('.wd-wk-dot')).not.toBeNull();
  expect(cols[4].classList.contains('has')).toBe(true);
  expect(cols[3].classList.contains('has')).toBe(false);
  expect(cols[3].querySelector('.wd-wk-dot')).toBeNull();
  expect(root.querySelectorAll('.wd-wk-day.has')).toHaveLength(2);
});

test('the bottom shows the time and the title of the first open reminder', () => {
  const root = host();
  renderWeek(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.wd-wk-time')!.textContent).toBe('14.00');
  expect(root.querySelector('.wd-wk-title')!.textContent).toBe('Kirim invoice');
  const english = host();
  renderWeek(english, en, 'en').update(SNAP, NOW);
  expect(english.querySelector('.wd-wk-time')!.textContent).toBe('14:00');
});

test('an untimed reminder shows only the title', () => {
  const root = host();
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: [rem(2, 'Bayar listrik', '2026-10-27', null)] }, NOW);
  expect(root.querySelector('.wd-wk-time')).toBeNull();
  expect(root.querySelector('.wd-wk-title')!.textContent).toBe('Bayar listrik');
});

test('a reminder that is past is not shown, an empty week says so', () => {
  const root = host();
  const past = [rem(1, 'Pagi', '2026-10-27', at(27, 8, 0)), rem(2, 'Kemarin', '2026-10-26', null)];
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: past }, NOW);
  expect(root.querySelector('.wd-wk-title')!.textContent).toBe(id.weekEmpty);
  expect(root.querySelector('.wd-wk-time')).toBeNull();
  const english = host();
  renderWeek(english, en, 'en').update({ ...SNAP, reminders: [] }, NOW);
  expect(english.querySelector('.wd-wk-title')!.textContent).toBe('Nothing this week');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderWeek(root, id, 'id');
  w.update(SNAP, NOW);
  w.update(SNAP, new Date(2026, 9, 28, 9, 0));
  expect(root.querySelectorAll('.wd-week')).toHaveLength(1);
  expect(root.querySelectorAll('.wd-wk-day.today')).toHaveLength(1);
});

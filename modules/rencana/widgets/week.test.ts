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
  const cols = [...root.querySelectorAll('.wd-pk-day')];
  expect(cols).toHaveLength(7);
  expect(root.querySelectorAll('.wd-pk-day.today')).toHaveLength(1);
  expect(cols[1].classList.contains('today')).toBe(true);
  expect(cols.map(c => c.querySelector('.lab')!.textContent)).toEqual(['S', 'S', 'R', 'K', 'J', 'S', 'M']);
  expect(cols[1].querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('27', 2)));
  expect(cols[0].querySelector('svg.dm')!.getAttribute('width')).toBe(String(dotWidth('26', 2)));
});

test('the top line has the month and the ISO week', () => {
  const root = host();
  renderWeek(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.wd-pk-head')!.textContent).toBe('OKTOBERMGG 44');
  const en1 = host();
  renderWeek(en1, en, 'en').update(SNAP, NOW);
  expect(en1.querySelector('.wd-pk-head')!.textContent).toBe('OCTOBERWK 44');
});

test('a day with an open reminder has a dot, one with only a done reminder has not', () => {
  const root = host();
  const rs = [...SNAP.reminders, rem(9, 'Selesai', '2026-10-29', null, true), rem(8, 'Jumat', '2026-10-30', null)];
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: rs }, NOW);
  const cols = [...root.querySelectorAll('.wd-pk-day')];
  expect(cols[1].classList.contains('has')).toBe(true);
  expect(cols[1].querySelector('.wd-pk-dot')).not.toBeNull();
  expect(cols[4].classList.contains('has')).toBe(true);
  expect(cols[3].classList.contains('has')).toBe(false);
  expect(cols[3].querySelector('.wd-pk-dot')).toBeNull();
  expect(root.querySelectorAll('.wd-pk-day.has')).toHaveLength(2);
});

test('the bottom shows the time and the title of the first open reminder', () => {
  const root = host();
  renderWeek(root, id, 'id').update(SNAP, NOW);
  expect(root.querySelector('.wd-pk-time')!.textContent).toBe('14.00');
  expect(root.querySelector('.wd-pk-title')!.textContent).toBe('Kirim invoice');
  const english = host();
  renderWeek(english, en, 'en').update(SNAP, NOW);
  expect(english.querySelector('.wd-pk-time')!.textContent).toBe('14:00');
});

test('the cue names the day when the next reminder is not today', () => {
  // NOW is Tuesday 27 Oct 2026; 30 Oct is a Friday.
  const timed = { ...SNAP, reminders: [rem(5, 'Rapat', '2026-10-30', at(30, 9, 0))] };
  const root = host();
  renderWeek(root, id, 'id').update(timed, NOW);
  expect(root.querySelector('.wd-pk-time')!.textContent).toBe('JUM 09.00');
  const english = host();
  renderWeek(english, en, 'en').update(timed, NOW);
  expect(english.querySelector('.wd-pk-time')!.textContent).toBe('FRI 09:00');

  const untimed = { ...SNAP, reminders: [rem(6, 'Bayar pajak', '2026-10-30', null)] };
  const bare = host();
  renderWeek(bare, id, 'id').update(untimed, NOW);
  expect(bare.querySelector('.wd-pk-time')!.textContent).toBe('JUM');
  const bareEn = host();
  renderWeek(bareEn, en, 'en').update(untimed, NOW);
  expect(bareEn.querySelector('.wd-pk-time')!.textContent).toBe('FRI');
});

test('a reminder today keeps the bare time, and an untimed one today has no cue', () => {
  const root = host();
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: [rem(1, 'Kirim invoice', '2026-10-27', at(27, 14, 0))] }, NOW);
  expect(root.querySelector('.wd-pk-time')!.textContent).toBe('14.00');
});

test('an untimed reminder shows only the title', () => {
  const root = host();
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: [rem(2, 'Bayar listrik', '2026-10-27', null)] }, NOW);
  expect(root.querySelector('.wd-pk-time')).toBeNull();
  expect(root.querySelector('.wd-pk-title')!.textContent).toBe('Bayar listrik');
});

test('a reminder that is past is not shown, an empty week says so', () => {
  const root = host();
  const past = [rem(1, 'Pagi', '2026-10-27', at(27, 8, 0)), rem(2, 'Kemarin', '2026-10-26', null)];
  renderWeek(root, id, 'id').update({ ...SNAP, reminders: past }, NOW);
  expect(root.querySelector('.wd-pk-title')!.textContent).toBe(id.weekEmpty);
  expect(root.querySelector('.wd-pk-time')).toBeNull();
  const english = host();
  renderWeek(english, en, 'en').update({ ...SNAP, reminders: [] }, NOW);
  expect(english.querySelector('.wd-pk-title')!.textContent).toBe('Nothing this week');
});

test('an update replaces the content', () => {
  const root = host();
  const w = renderWeek(root, id, 'id');
  w.update(SNAP, NOW);
  w.update(SNAP, new Date(2026, 9, 28, 9, 0));
  expect(root.querySelectorAll('.wd-week')).toHaveLength(1);
  expect(root.querySelectorAll('.wd-pk-day.today')).toHaveLength(1);
});

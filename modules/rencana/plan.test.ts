import { expect, test } from 'vitest';
import { at, NOW, rem, SNAP } from '../home/widgets/fixtures';
import { nextThisWeek, nextTimed, openReminders, untilText } from './plan';

test('open reminders go by day, then time with untimed last, then id', () => {
  const rs = [
    rem(5, 'Lusa', '2026-10-28', null),
    rem(4, 'Tadi', '2026-10-27', at(27, 9, 0)),
    rem(2, 'Bayar listrik', '2026-10-27', null),
    rem(1, 'Kirim invoice', '2026-10-27', at(27, 14, 0)),
    rem(3, 'Selesai', '2026-10-26', null, true),
    rem(6, 'Juga lusa', '2026-10-28', null),
  ];
  expect(openReminders(rs).map(r => r.title)).toEqual(['Tadi', 'Kirim invoice', 'Bayar listrik', 'Lusa', 'Juga lusa']);
});

test('the next timed reminder is the first one ahead of now', () => {
  expect(nextTimed(SNAP.reminders, NOW)?.title).toBe('Kirim invoice');
});

test('a reminder at 10:00 today is already past', () => {
  const rs = [rem(1, 'Pagi', '2026-10-27', at(27, 10, 0))];
  expect(nextTimed(rs, NOW)).toBeNull();
  expect(nextThisWeek(rs, NOW)).toBeNull();
});

test('a done reminder is never next, and untimed ones are not timed', () => {
  expect(nextTimed([rem(1, 'Selesai', '2026-10-27', at(27, 14, 0), true)], NOW)).toBeNull();
  expect(nextTimed([rem(1, 'Hari ini', '2026-10-27', null)], NOW)).toBeNull();
});

test('on Sunday night an untimed reminder of that day is still this week, last Monday is not', () => {
  const sunday = new Date(2026, 10, 1, 23, 0);
  const rs = [rem(1, 'Senin lalu', '2026-10-26', null), rem(2, 'Minggu', '2026-11-01', null)];
  expect(nextThisWeek(rs, sunday)?.title).toBe('Minggu');
  expect(nextThisWeek([rs[0]], sunday)).toBeNull();
});

test('next this week skips what is past and what is in a later week', () => {
  const rs = [
    rem(1, 'Senin', '2026-10-26', null),
    rem(2, 'Pagi', '2026-10-27', at(27, 8, 0)),
    rem(3, 'Pekan depan', '2026-11-02', null),
    rem(4, 'Kamis', '2026-10-29', null),
  ];
  expect(nextThisWeek(rs, NOW)?.title).toBe('Kamis');
});

test('until text is minutes under an hour, hours under a day, then days, as a phrase', () => {
  expect(untilText(18 * 60000, 'id')).toBe('18 menit lagi');
  expect(untilText(18 * 60000, 'en')).toBe('in 18 min');
  expect(untilText(30_000, 'id')).toBe('1 menit lagi');
  expect(untilText(2.5 * 3600000, 'id')).toBe('2 jam lagi');
  expect(untilText(23.9 * 3600000, 'en')).toBe('in 23 h');
  expect(untilText(3 * 86400000 + 5, 'id')).toBe('3 hari lagi');
  expect(untilText(3 * 86400000, 'en')).toBe('in 3 days');
  expect(untilText(86400000, 'en')).toBe('in 1 day');
});

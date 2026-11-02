import type { Lang } from '../../src/kit/protocol';
import { weekOf } from '../../src/kit/dates';
import { dayKey, nearest } from '../home/format';
import type { Reminder } from '../home/types';

// The reminders not done, by day, then time (untimed last that day), then age.
export function openReminders(rs: Reminder[]): Reminder[] {
  return nearest(rs, Infinity);
}

// The first open reminder with a time still ahead.
export function nextTimed(rs: Reminder[], now: Date): Reminder | null {
  return openReminders(rs).find(r => r.at !== null && r.at > now.getTime()) ?? null;
}

// Past: an earlier day, or a time that has come. An untimed one stays until its day ends.
const isPast = (r: Reminder, now: Date): boolean =>
  r.day < dayKey(now) || (r.at !== null && r.at <= now.getTime());

// The first open reminder of Monday to Sunday around `now` that is not past.
export function nextThisWeek(rs: Reminder[], now: Date): Reminder | null {
  const days = new Set(weekOf(now).map(dayKey));
  return openReminders(rs).find(r => days.has(r.day) && !isPast(r, now)) ?? null;
}

// The days of this week that have an open reminder.
export function daysWithOpen(rs: Reminder[], now: Date): Set<string> {
  const days = new Set(weekOf(now).map(dayKey));
  return new Set(openReminders(rs).map(r => r.day).filter(d => days.has(d)));
}

// "18 menit lagi", "in 2 h", "3 hari lagi": the largest unit that fits, rounded down.
export function untilText(ms: number, lang: Lang): string {
  const id = lang === 'id';
  const phrase = (n: number, unit: string) => (id ? `${n} ${unit} lagi` : `in ${n} ${unit}`);
  if (ms < 3_600_000) return phrase(Math.max(1, Math.floor(ms / 60_000)), id ? 'menit' : 'min');
  if (ms < 86_400_000) return phrase(Math.floor(ms / 3_600_000), id ? 'jam' : 'h');
  const days = Math.floor(ms / 86_400_000);
  return phrase(days, id ? 'hari' : days === 1 ? 'day' : 'days');
}

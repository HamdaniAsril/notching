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

// "18 MNT", "2 J", "3 HARI": the largest unit that fits, rounded down.
export function untilText(ms: number, lang: Lang): string {
  const id = lang === 'id';
  if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))} ${id ? 'MNT' : 'MIN'}`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} ${id ? 'J' : 'H'}`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} ${id ? 'HARI' : days === 1 ? 'DAY' : 'DAYS'}`;
}

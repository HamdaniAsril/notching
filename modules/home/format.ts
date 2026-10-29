import type { Lang } from '../../src/kit/protocol';
import type { Reminder } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

// 24-hour local time: "10.25" in Indonesian, "10:25" in English (spec 5).
export function clock(ms: number, lang: Lang): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}${lang === 'id' ? '.' : ':'}${pad(d.getMinutes())}`;
}

// "1 j 22 m" / "1 h 22 m", or "22 m" under an hour.
export function remaining(ms: number, lang: Lang): string {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ${lang === 'id' ? 'j' : 'h'} ${m} m` : `${m} m`;
}

// Lit dots in a row of `count`: how far now is from the last prayer to the next.
export function progress(prev: number, next: number, now: number, count: number): number {
  const lit = Math.round((count * (now - prev)) / (next - prev));
  return Math.min(count, Math.max(0, lit));
}

export type WeatherKey = 'clear' | 'mostlyClear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'snow' | 'storm';

// WMO weather codes, as Open-Meteo sends them.
export function weatherKey(code: number): WeatherKey {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'mostlyClear';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'showers';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "14.00", "14:00", "1400", "9", "9.30": hours 0–23, minutes 0–59.
export function parseTime(text: string): { h: number; m: number } | null {
  const t = text.trim();
  const match = /^(\d{1,2})(?:[.:](\d{2}))?$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] === undefined ? 0 : Number(match[2]);
  return h <= 23 && m <= 59 ? { h, m } : null;
}

// Today at that time if it is still ahead, else tomorrow.
export function dueAt(t: { h: number; m: number }, now: Date): { day: string; at: number } {
  let due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
  if (due.getTime() <= now.getTime()) due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, t.h, t.m);
  return { day: dayKey(due), at: due.getTime() };
}

function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "14.00", "Hari ini", "Besok 09.00", "30 Okt".
export function reminderLabel(r: Reminder, now: Date, lang: Lang, s: { today: string; tomorrow: string }): string {
  const time = r.at === null ? '' : clock(r.at, lang);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (r.day === dayKey(now)) return time || s.today;
  const day = r.day === dayKey(tomorrow)
    ? s.tomorrow
    : new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(dateOf(r.day));
  return time ? `${day} ${time}` : day;
}

// Open reminders by day, then time (untimed ones last that day), then age.
export function nearest(reminders: Reminder[], n: number): Reminder[] {
  return reminders
    .filter(r => !r.done)
    .sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? Infinity) - (b.at ?? Infinity) || a.id - b.id)
    .slice(0, n);
}

export function degrees(v: number): string {
  return `${Math.round(v) || 0}°`;
}

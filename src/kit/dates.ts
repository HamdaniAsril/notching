import type { Lang } from './protocol';

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-US');

// 1-based, local calendar day.
export function dayOfYear(d: Date): number {
  return Math.round((utcDay(d) - Date.UTC(d.getFullYear(), 0, 1)) / DAY_MS) + 1;
}

export function daysInYear(y: number): number {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

// ISO 8601: the week belongs to the year of its Thursday.
export function isoWeek(d: Date): number {
  const dow = (d.getDay() + 6) % 7;
  const thursday = new Date(utcDay(d) + (3 - dow) * DAY_MS);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
}

// The 7 local dates, Monday to Sunday, around `d`.
export function weekOf(d: Date): Date[] {
  const dow = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + i));
}

// Rows of 7, Monday first; null outside the month.
export function monthGrid(d: Date): (number | null)[][] {
  const lead = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

// "SEN", "MON".
export function shortDay(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short' }).format(d).replace('.', '').slice(0, 3).toUpperCase();
}

// "OKT", "OCT".
export function monthShort(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(d).replace('.', '').slice(0, 3).toUpperCase();
}

// "WIB", or "GMT+7" when that is all Intl has for the zone.
export function zoneLabel(lang: Lang, d: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(locale(lang), { timeZone, timeZoneName: 'short' }).formatToParts(d);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
}

import type { Lang } from '../../src/kit/protocol';

// Jam kerja settings: times are "HH:MM", `days` are JS getDay() numbers (0 is Sunday).
export interface WorkPrefs {
  start: string;
  end: string;
  days: number[];
}

export const DEFAULT_WORK: WorkPrefs = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };

export type WorkKind = 'before' | 'working' | 'done' | 'off';

export interface WorkState {
  kind: WorkKind;
  workedMs: number;
  leftMs: number; // to the start before work, to the end while working
  progress: number; // 0..1 through the day's hours
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const minutes = (t: string): number => {
  const m = TIME.exec(t)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

const validDays = (d: unknown): d is number[] =>
  Array.isArray(d) && d.length > 0 && d.every(n => Number.isInteger(n) && n >= 0 && n <= 6);

// Whether `p` can be saved as it is: real times, the end after the start, at least one day.
export function validWork(p: WorkPrefs): boolean {
  return TIME.test(p.start) && TIME.test(p.end) && minutes(p.end) > minutes(p.start) && validDays(p.days);
}

// Whatever was stored, as full settings: a valid field is kept, a bad one is the default's.
// Times that do not make a day (bad, or the end not after the start) are both the default's.
export function checkWork(raw: unknown): WorkPrefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const time = (v: unknown, fallback: string) => (typeof v === 'string' && TIME.test(v) ? v : fallback);
  let start = time(r.start, DEFAULT_WORK.start);
  let end = time(r.end, DEFAULT_WORK.end);
  if (minutes(end) <= minutes(start)) {
    start = DEFAULT_WORK.start;
    end = DEFAULT_WORK.end;
  }
  const days = validDays(r.days) ? [...new Set(r.days)] : [...DEFAULT_WORK.days];
  return { start, end, days };
}

const at = (now: Date, t: string): number => {
  const m = minutes(t);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(m / 60), m % 60).getTime();
};

export function workState(p: WorkPrefs, now: Date): WorkState {
  if (!p.days.includes(now.getDay())) return { kind: 'off', workedMs: 0, leftMs: 0, progress: 0 };
  const start = at(now, p.start);
  const end = at(now, p.end);
  const t = now.getTime();
  if (t < start) return { kind: 'before', workedMs: 0, leftMs: start - t, progress: 0 };
  if (t >= end) return { kind: 'done', workedMs: end - start, leftMs: 0, progress: 1 };
  return { kind: 'working', workedMs: t - start, leftMs: end - t, progress: (t - start) / (end - start) };
}

// "2 J 30 M" / "2 H 30 M", or "42 M" under an hour. Rounded to the nearest minute so a
// tick that fires a few ms early still reads the minute it is for.
export function hm(ms: number, lang: Lang): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ${lang === 'id' ? 'J' : 'H'} ${m} M` : `${m} M`;
}

// "09.00" in Indonesian, "9:00" in English (24-hour, the hour unpadded).
export function timeText(t: string, lang: Lang): string {
  return lang === 'id' ? t.replace(':', '.') : `${Number(t.slice(0, 2))}:${t.slice(3)}`;
}

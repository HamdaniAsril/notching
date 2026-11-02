import type { Lang } from '../../../src/kit/protocol';
import { monthGrid, weekOf } from '../../../src/kit/dates';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';

export interface CalendarStrings {
  calendar: string;
}

// The days of the grid, Monday first: the month's own days, and the last days of the month
// before and the first of the next in the weeks that stick out.
function gridDays(now: Date): { day: number; out: boolean }[] {
  const cells = monthGrid(now).flat();
  const lead = cells.findIndex(c => c !== null);
  const before = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  let after = 0;
  return cells.map((day, i) => (day !== null ? { day, out: false } : { day: i < lead ? before - lead + 1 + i : ++after, out: true }));
}

// The widget's content for `now`: the title, the month and the year on the left, a Monday-first
// grid of the month on the right with today in an accent pill. Also what the editor's sample draws.
export function calendarView(s: CalendarStrings, lang: Lang, now: Date): HTMLElement {
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const w = el('div', 'v-card wd-calendar');
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const side = el('div', 'wd-cal-side');
  const name = el('div', 'wd-cal-name');
  name.append(num(month.charAt(0).toLocaleUpperCase(locale) + month.slice(1), 21, 'wd-cal-month'), num(String(now.getFullYear()), 11, 'wd-cal-year'));
  side.append(lab(s.calendar, 'ink wd-cal-title'), name);

  const grid = el('div', 'wd-cal-grid');
  const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  for (const d of weekOf(now)) grid.append(el('span', 'wd-cal-h', narrow.format(d).toUpperCase()));
  for (const { day, out } of gridDays(now)) {
    const cls = ['wd-cal-d', out ? 'out' : '', !out && day === now.getDate() ? 'today' : ''].filter(Boolean).join(' ');
    grid.append(el('span', cls, String(day)));
  }
  w.append(side, grid);
  return w;
}

// Kalender.
export function renderCalendar(root: HTMLElement, s: CalendarStrings, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(calendarView(s, lang, now));
    },
  };
}

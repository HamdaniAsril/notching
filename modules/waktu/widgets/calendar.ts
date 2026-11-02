import type { Lang } from '../../../src/kit/protocol';
import { monthGrid, monthShort, weekOf } from '../../../src/kit/dates';
import { el } from '../../../src/kit/widget';

export interface CalendarStrings {
  calendar: string;
}

// The widget's content for `now`: the month and year on the left, a Monday-first grid of
// the month on the right with today in a red pill. Also what the editor's sample draws.
export function calendarView(s: CalendarStrings, lang: Lang, now: Date): HTMLElement {
  const w = el('div', 'wd-calendar');
  const side = el('div', 'wd-cal-side');
  side.append(el('div', 'lab', s.calendar.toUpperCase()), el('div', 'wd-cal-month', monthShort(now, lang)), el('div', 'lab', String(now.getFullYear())));

  const grid = el('div', 'wd-cal-grid');
  const narrow = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'narrow' });
  for (const d of weekOf(now)) grid.append(el('span', 'wd-cal-h', narrow.format(d).toUpperCase()));
  monthGrid(now).flat().forEach((day, i) => {
    const cls = ['wd-cal-d', i % 7 >= 5 ? 'we' : '', day === now.getDate() ? 'today' : ''].filter(Boolean).join(' ');
    grid.append(el('span', cls, day ? String(day) : ''));
  });
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

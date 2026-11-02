import type { Lang } from '../../../src/kit/protocol';
import { isoWeek, monthShort, shortDay, weekOf } from '../../../src/kit/dates';
import { el, small } from '../../../src/kit/widget';

export interface WeekStripStrings {
  week: string;
}

// The strip's content for `now`: today's weekday, date and month on the left, the seven
// days of the week in the middle (today white with a red dot, past days dim) and the ISO
// week on the right. Also what the editor's sample draws.
export function weekStripView(s: WeekStripStrings, lang: Lang, now: Date): HTMLElement {
  const w = el('div', 'wd-weekstrip');

  const long = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'long' }).format(now);
  const left = el('div', 'wd-wk-today');
  const date = el('div', 'wd-wk-date');
  date.append(small(String(now.getDate()), 2), el('span', 'lab wd-wk-month', monthShort(now, lang)));
  left.append(el('div', 'lab', long.toUpperCase()), date);

  const days = el('div', 'wd-wk-days');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const d of weekOf(now)) {
    const t = d.getTime();
    const cell = el('div', `wd-wk-cell ${t === today ? 'today' : t < today ? 'past' : 'future'}`);
    const name = el('div', 'lab', shortDay(d, lang));
    if (t === today) name.append(el('i', 'rd'));
    cell.append(name, small(String(d.getDate()), 2));
    days.append(cell);
  }

  const week = el('div', 'wd-wk-week');
  week.append(el('div', 'lab', s.week.toUpperCase()), small(String(isoWeek(now)), 2));

  w.append(left, days, week);
  return w;
}

// Minggu ini.
export function renderWeekStrip(root: HTMLElement, s: WeekStripStrings, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(weekStripView(s, lang, now));
    },
  };
}

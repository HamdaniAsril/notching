import type { Lang } from '../../../src/kit/protocol';
import { isoWeek, shortDay, weekOf } from '../../../src/kit/dates';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';

export interface WeekStripStrings {
  week: string;
}

const cap = (s: string, locale: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

// The strip's content for `now`: today's weekday, date and month on the left, the seven days
// of the week in the middle (today in an accent pill, a day of another month dim) and the ISO
// week on the right. Also what the editor's sample draws.
export function weekStripView(s: WeekStripStrings, lang: Lang, now: Date): HTMLElement {
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const w = el('div', 'v-card wd-weekstrip');

  const long = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now);
  const left = el('div', 'wd-wk-today');
  left.append(lab(cap(long, locale)), num(`${now.getDate()} ${cap(month, locale)}`, 16, 'wd-wk-date'));

  const days = el('div', 'wd-wk-days');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const d of weekOf(now)) {
    const t = d.getTime();
    const cls = ['wd-wk-cell', t === today ? 'today' : t < today ? 'past' : 'future', d.getMonth() !== now.getMonth() ? 'other' : ''];
    const cell = el('div', cls.filter(Boolean).join(' '));
    const name = shortDay(d, lang);
    cell.append(el('span', 'wd-wk-name', name.charAt(0) + name.slice(1).toLowerCase()), num(String(d.getDate()).padStart(2, '0'), 14));
    days.append(cell);
  }

  const week = el('div', 'wd-wk-week');
  week.append(lab(s.week), num(String(isoWeek(now)), 16));

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

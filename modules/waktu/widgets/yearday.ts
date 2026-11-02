import type { Lang } from '../../../src/kit/protocol';
import { dayOfYear, daysInYear } from '../../../src/kit/dates';
import { big, dotRow, el } from '../../../src/kit/widget';

export interface YearDayStrings {
  dayOf: string;
  left: string; // "Sisa {n} hari"
  leftOne: string; // the same for one day
}

// The widget's content for `now`: "HARI KE" and the year over the day number in red, a bar
// of the 12 months and the days left. Also what the editor's sample draws.
export function yearDayView(root: HTMLElement, now: Date, s: YearDayStrings): HTMLElement {
  const day = dayOfYear(now);
  const left = daysInYear(now.getFullYear()) - day;
  const month = now.getMonth();
  const w = el('div', 'wd wd-yearday');
  const top = el('div', 'wd-top');
  top.append(el('div', 'lab', s.dayOf.toUpperCase()), el('div', 'lab', String(now.getFullYear())));
  const text = (left === 1 ? s.leftOne : s.left).replace('{n}', String(left)).toUpperCase();
  w.append(top, big(root, String(day)), dotRow(12, month, month), el('div', 'lab wd-yearday-left', text));
  return w;
}

// Hari ke-.
export function renderYearDay(root: HTMLElement, _lang: Lang, strings: YearDayStrings): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(yearDayView(root, now, strings));
    },
  };
}

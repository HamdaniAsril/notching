import type { Lang } from '../../../src/kit/protocol';
import { dayOfYear, daysInYear } from '../../../src/kit/dates';
import { bar, lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';

export interface YearDayStrings {
  dayOf: string;
  left: string; // "{n} hari lagi"
  leftOne: string; // the same for one day
}

// The widget's content for `now`: "Hari ke" and the year over the day number in the accent,
// a bar of the year gone and the days left. Also what the editor's sample draws.
export function yearDayView(_root: HTMLElement, now: Date, s: YearDayStrings): HTMLElement {
  const day = dayOfYear(now);
  const total = daysInYear(now.getFullYear());
  const left = total - day;
  const w = el('div', 'v-card wd-yearday');
  const top = el('div', 'wd-top');
  top.append(lab(s.dayOf, 'ink'), el('span', 'wd-year', String(now.getFullYear())));
  const foot = el('div', 'wd-foot');
  foot.append(bar(day / total), el('span', 'wd-yearday-left', (left === 1 ? s.leftOne : s.left).replace('{n}', String(left))));
  w.append(top, num(String(day), 50, 'v-acc wd-day-no'), foot);
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

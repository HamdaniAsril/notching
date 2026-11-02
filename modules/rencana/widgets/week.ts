import type { Lang } from '../../../src/kit/protocol';
import { isoWeek, weekOf } from '../../../src/kit/dates';
import { el, small } from '../../../src/kit/widget';
import { clock, dayKey } from '../../home/format';
import type { HomeSnapshot, Reminder } from '../../home/types';
import { daysWithOpen, nextThisWeek } from '../plan';

export interface WeekStrings {
  week: string;
  weekEmpty: string;
}

const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-US');

// The widget's content for `now`: the month and ISO week on top, the seven days with a dot
// under each that has an open reminder, and the next reminder of the week at the bottom.
// Also what the editor's sample draws.
export function weekView(s: WeekStrings, lang: Lang, rs: Reminder[], now: Date): HTMLElement {
  const w = el('div', 'wd wd-week');

  const head = el('div', 'wd-wk-head');
  const month = new Intl.DateTimeFormat(locale(lang), { month: 'long' }).format(now).toUpperCase();
  head.append(el('span', 'lab', month), el('span', 'lab', `${s.week.toUpperCase()} ${isoWeek(now)}`));

  const days = el('div', 'wd-wk-days');
  const open = daysWithOpen(rs, now);
  const today = dayKey(now);
  for (const d of weekOf(now)) {
    const key = dayKey(d);
    const col = el('div', `wd-wk-day${key === today ? ' today' : ''}${open.has(key) ? ' has' : ''}`);
    const letter = new Intl.DateTimeFormat(locale(lang), { weekday: 'narrow' }).format(d).toUpperCase();
    const num = el('div', 'wd-wk-num');
    num.append(small(String(d.getDate()), 2));
    col.append(el('div', 'lab', letter), num);
    if (open.has(key)) col.append(el('i', 'wd-wk-dot'));
    days.append(col);
  }

  const foot = el('div', 'wd-wk-foot');
  const next = nextThisWeek(rs, now);
  if (next) {
    if (next.at !== null) foot.append(el('div', 'lab wd-wk-time', clock(next.at, lang)));
    foot.append(el('div', 'wd-wk-title', next.title));
  } else {
    foot.append(el('div', 'wd-wk-title empty', s.weekEmpty));
  }

  w.append(head, days, foot);
  return w;
}

// Pekan ini.
export function renderWeek(root: HTMLElement, s: WeekStrings, lang: Lang): { update(snap: HomeSnapshot, now: Date): void } {
  return {
    update(snap, now) {
      root.replaceChildren(weekView(s, lang, snap.reminders, now));
    },
  };
}

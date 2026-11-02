import type { Lang } from '../../../src/kit/protocol';
import { isoWeek, shortDay, weekOf } from '../../../src/kit/dates';
import { el, small } from '../../../src/kit/widget';
import { clock, dayKey } from '../../home/format';
import type { HomeSnapshot, Reminder } from '../../home/types';
import { daysWithOpen, nextThisWeek } from '../plan';

export interface WeekStrings {
  week: string;
  weekEmpty: string;
}

// The reminder's own day ("2026-10-30") as a local date.
const dayDate = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Today: the time (nothing if untimed). Another day: "JUM 09.00", or "JUM" untimed.
function cue(r: Reminder, lang: Lang, today: string): string {
  const time = r.at === null ? '' : clock(r.at, lang);
  if (r.day === today) return time;
  return `${shortDay(dayDate(r.day), lang)}${time ? ` ${time}` : ''}`;
}

const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-US');

// The widget's content for `now`: the month and ISO week on top, the seven days with a dot
// under each that has an open reminder, and the next reminder of the week at the bottom.
// Also what the editor's sample draws.
export function weekView(s: WeekStrings, lang: Lang, rs: Reminder[], now: Date): HTMLElement {
  const w = el('div', 'wd wd-week');

  const head = el('div', 'wd-pk-head');
  const month = new Intl.DateTimeFormat(locale(lang), { month: 'long' }).format(now).toUpperCase();
  head.append(el('span', 'lab', month), el('span', 'lab', `${s.week.toUpperCase()} ${isoWeek(now)}`));

  const days = el('div', 'wd-pk-days');
  const open = daysWithOpen(rs, now);
  const today = dayKey(now);
  for (const d of weekOf(now)) {
    const key = dayKey(d);
    const col = el('div', `wd-pk-day${key === today ? ' today' : ''}${open.has(key) ? ' has' : ''}`);
    const letter = new Intl.DateTimeFormat(locale(lang), { weekday: 'narrow' }).format(d).toUpperCase();
    const num = el('div', 'wd-pk-num');
    num.append(small(String(d.getDate()), 2));
    col.append(el('div', 'lab', letter), num);
    if (open.has(key)) col.append(el('i', 'wd-pk-dot'));
    days.append(col);
  }

  const foot = el('div', 'wd-pk-foot');
  const next = nextThisWeek(rs, now);
  if (next) {
    const when = cue(next, lang, today);
    if (when) foot.append(el('div', 'lab wd-pk-time', when));
    foot.append(el('div', 'wd-pk-title', next.title));
  } else {
    foot.append(el('div', 'wd-pk-title empty', s.weekEmpty));
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

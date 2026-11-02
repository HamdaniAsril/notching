import type { Lang } from '../../../src/kit/protocol';
import { isoWeek, shortDay, weekOf } from '../../../src/kit/dates';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { clock, dayKey } from '../../home/format';
import type { HomeSnapshot, Reminder } from '../../home/types';
import { nextThisWeek } from '../plan';

export interface WeekStrings {
  week: string; // "Minggu" / "Week", before the ISO week number
  weekEmpty: string;
  widgets: { week: string };
}

// The reminder's own day ("2026-10-30") as a local date.
const dayDate = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// "JUM" to "Jum".
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Today: the time (nothing if untimed). Another day: "Jum 09.00", or "Jum" untimed.
function cue(r: Reminder, lang: Lang, today: string): string {
  const time = r.at === null ? '' : clock(r.at, lang);
  if (r.day === today) return time;
  return `${cap(shortDay(dayDate(r.day), lang))}${time ? ` ${time}` : ''}`;
}

const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-US');

// The widget's content for `now`: the name and ISO week on top, the seven days (the ones gone
// dim, today in an accent circle), and the next reminder of the week at the bottom.
// Also what the editor's sample draws.
export function weekView(s: WeekStrings, lang: Lang, rs: Reminder[], now: Date): HTMLElement {
  const w = el('div', 'v-card wd-week');

  const head = el('div', 'wd-pk-head');
  head.append(lab(s.widgets.week, 'ink'), el('span', 'wd-pk-wk', `${s.week} ${isoWeek(now)}`));

  const days = el('div', 'wd-pk-days');
  const today = dayKey(now);
  for (const d of weekOf(now)) {
    const key = dayKey(d);
    const col = el('div', `wd-pk-day${key === today ? ' today' : key < today ? ' past' : ''}`);
    const letter = new Intl.DateTimeFormat(locale(lang), { weekday: 'narrow' }).format(d).toUpperCase();
    const n = el('div', 'wd-pk-num');
    n.append(num(String(d.getDate()), 14));
    col.append(lab(letter, key === today ? 'ink' : ''), n);
    days.append(col);
  }

  const foot = el('div', 'wd-pk-foot');
  const next = nextThisWeek(rs, now);
  if (next) {
    const when = cue(next, lang, today);
    foot.append(el('i', 'wd-pk-dot'));
    if (when) foot.append(el('span', 'wd-pk-time', when));
    foot.append(el('span', 'wd-pk-title', next.title));
  } else {
    foot.append(el('span', 'wd-pk-title empty', s.weekEmpty));
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

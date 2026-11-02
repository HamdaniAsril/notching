import type { Lang } from '../../../src/kit/protocol';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { clock } from '../../home/format';
import type { HomeSnapshot, Reminder } from '../../home/types';
import { nextTimed, untilText } from '../plan';

export interface NextStrings {
  next: string;
  nextEmpty: string;
  today: string;
  tomorrow: string;
}

// "Hari ini", "Besok", the weekday within the coming week, else "Nov 15".
function dayLabel(r: Reminder, now: Date, lang: Lang, s: NextStrings): string {
  const [y, m, d] = r.day.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const ahead = Math.round((day.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  if (ahead <= 0) return s.today;
  if (ahead === 1) return s.tomorrow;
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  return ahead < 7
    ? new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(day)
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(day);
}

// The widget's content for `now`: the next reminder with a time. The name and a pill with the
// time left on top, the title big, the day at the bottom left and the time in the accent at the
// bottom right. Also what the editor's sample draws.
export function nextView(s: NextStrings, lang: Lang, rs: Reminder[], now: Date): HTMLElement {
  const w = el('div', 'v-card wd-next');
  const r = nextTimed(rs, now);
  const top = el('div', 'wd-nx-top');
  top.append(lab(s.next, 'ink'));
  if (!r || r.at === null) {
    w.append(top, el('div', 'wd-nx-empty', s.nextEmpty));
    return w;
  }
  top.append(el('span', 'v-pill soft', untilText(r.at - now.getTime(), lang)));
  const foot = el('div', 'wd-nx-foot');
  foot.append(el('span', 'wd-nx-detail', dayLabel(r, now, lang, s)), num(clock(r.at, lang), 18, 'v-acc'));
  w.append(top, el('div', 'wd-nx-title', r.title), foot);
  return w;
}

// Berikutnya.
export function renderNext(root: HTMLElement, s: NextStrings, lang: Lang): { update(snap: HomeSnapshot, now: Date): void } {
  return {
    update(snap, now) {
      root.replaceChildren(nextView(s, lang, snap.reminders, now));
    },
  };
}

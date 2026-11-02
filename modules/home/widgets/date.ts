import type { Lang } from '../../../src/kit/protocol';
import { lab, num } from '../../../src/kit/volt';
import { el } from './shared';

// The widget's content for `now`: the weekday with the accent dot over the date in big
// numbers and the month and year. Also what the editor's sample draws.
export function dateView(lang: Lang, now: Date): HTMLElement {
  const w = el('div', 'v-card hm-date');
  const top = el('div', 'hm-date-top');
  top.append(lab(new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(now), 'ink hm-date-day'), el('i', 'hm-dot'));
  w.append(top, num(String(now.getDate()), 57, 'hm-date-no'),
    el('div', 'hm-date-month', new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(now)));
  return w;
}

// Tanggal.
export function renderDate(root: HTMLElement, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(dateView(lang, now));
    },
  };
}

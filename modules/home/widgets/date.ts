import type { Lang } from '../../../src/kit/protocol';
import { big, el } from './shared';

// Tanggal: the red dot and the weekday, the date in dots, the month and year.
export function renderDate(root: HTMLElement, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      const w = el('div', 'wd');
      const top = el('div', 'lab');
      top.append(el('i', 'rd'), new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(now));
      w.append(top, big(root, String(now.getDate())),
        el('div', 'lab', new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(now)));
      root.replaceChildren(w);
    },
  };
}

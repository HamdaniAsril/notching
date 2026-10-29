import { dotBar } from '../../../src/kit/dots';
import type { Lang } from '../../../src/kit/protocol';
import { clock, progress, remaining } from '../format';
import type { HomeSnapshot } from '../types';
import { el, type HomeStrings, svgBox } from './shared';

const BAR_DOTS = 16;

// Waktu sholat: the next prayer and its time, how far it has come since the last
// one, and what is left.
export function renderPrayer(root: HTMLElement, strings: HomeStrings, lang: Lang):
  { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s, now) {
      const w = el('div', 'wd wd-prayer');
      w.append(el('div', 'lab', strings.prayer));
      if (!s.prayer) {
        w.append(el('div', 'lab', strings.noPlace));
      } else {
        const { prev, next } = s.prayer;
        const bar = svgBox('wd-bar', dotBar(BAR_DOTS, progress(prev.at, next.at, now.getTime(), BAR_DOTS)));
        w.append(el('div', 'wd-next', `${strings.prayers[next.name]} ${clock(next.at, lang)}`), bar,
          el('div', 'lab', remaining(next.at - now.getTime(), lang)));
      }
      root.replaceChildren(w);
    },
  };
}

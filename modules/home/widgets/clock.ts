import { zoneLabel } from '../../../src/kit/dates';
import type { Lang } from '../../../src/kit/protocol';
import { num } from '../../../src/kit/volt';
import { el, type HomeStrings } from './shared';

const pad = (n: number) => String(n).padStart(2, '0');

// The part of the day, as people say it: night until 4, then morning, midday, afternoon.
function dayPart(h: number, s: HomeStrings): string {
  if (h < 4) return s.dayparts.night;
  if (h < 11) return s.dayparts.morning;
  if (h < 15) return s.dayparts.noon;
  if (h < 18) return s.dayparts.afternoon;
  return s.dayparts.night;
}

// The widget's content for `now`: the hour in white over the minutes in the accent, with the
// part of the day top right and the time zone bottom right. Also what the editor's sample draws.
export function clockView(strings: HomeStrings, lang: Lang, now: Date): HTMLElement {
  const w = el('div', 'v-card hm-clock');
  const stack = el('div', 'hm-clock-stack');
  stack.append(num(pad(now.getHours()), 48, 'hm-clock-no'), num(pad(now.getMinutes()), 48, 'v-acc hm-clock-no'));
  const meta = el('div', 'hm-clock-meta');
  meta.append(el('span', 'hm-clock-part', dayPart(now.getHours(), strings)), el('span', 'hm-clock-zone', zoneLabel(lang, now)));
  w.append(stack, meta);
  return w;
}

// Jam: hours over minutes.
export function renderClock(root: HTMLElement, strings: HomeStrings, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(clockView(strings, lang, now));
    },
  };
}

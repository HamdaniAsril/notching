import type { Lang } from '../../../src/kit/protocol';
import { lab, num, segs } from '../../../src/kit/volt';
import { clock, remaining } from '../format';
import type { HomeSnapshot, PrayerName } from '../types';
import { el, type HomeStrings } from './shared';

// The five prayers of the day, in the order of the segments.
const ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// The widget's content: the next prayer's name in the accent over its time, and five segments
// with the next one lit (the ones before it dimmer than the ones after) over what is left.
// Also what the editor's sample draws.
export function prayerView(strings: HomeStrings, lang: Lang, s: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'v-card hm-prayer');
  w.append(lab(strings.nextPrayer, 'hm-pr-label'));
  if (!s.prayer) {
    w.append(el('div', 'hm-pr-empty', strings.noPlace));
    return w;
  }
  const { next } = s.prayer;
  const nameBox = el('div', 'hm-pr-next');
  nameBox.append(el('span', 'v-acc hm-pr-name', strings.prayers[next.name]), num(clock(next.at, lang), 30));

  const idx = ORDER.indexOf(next.name);
  const row = segs(ORDER.length, [idx], 'hm-pr-segs');
  for (let i = 0; i < idx; i++) row.children[i].classList.add('past');
  const foot = el('div', 'hm-pr-foot');
  foot.append(row, el('span', 'hm-pr-left', strings.left.replace('{t}', remaining(next.at - now.getTime(), lang))));

  w.append(nameBox, foot);
  return w;
}

// Waktu sholat: the next prayer and its time, which of the five it is, and what is left.
export function renderPrayer(root: HTMLElement, strings: HomeStrings, lang: Lang):
  { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s, now) {
      root.replaceChildren(prayerView(strings, lang, s, now));
    },
  };
}

import type { Lang } from '../../../src/kit/protocol';
import { icon, weatherIcon } from '../../../src/kit/icons';
import { el, small } from '../../../src/kit/widget';
import { clock, degrees } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { isNight, rainAt, upcoming } from '../hourly';

export interface HourlyStrings {
  noPlace: string;
  perHour: string;
  rainAt: string; // "HUJAN {t}"
  dry: string;
}

// "4 PM" in English; Indonesian reads the 24-hour clock.
function hourText(ms: number, lang: Lang): string {
  if (lang === 'id') return clock(ms, 'id');
  const h = new Date(ms).getHours();
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

// The strip's content for `now`: the label over the temperature on the left, eight hours in the
// middle (the current one white with a red icon, the rest dim) and the rain, or a dry spell, on the
// right. Also what the editor's sample draws. At 484 px: left 54, right at most 81, two gaps of 10,
// leaving 329 for eight cells of at most 41 (an icon of 12, 3, and four characters at 6.4).
export function hourlyView(s: HourlyStrings, lang: Lang, snap: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'wd-hourly');
  if (!snap.place) {
    w.append(el('div', 'lab', s.noPlace));
    return w;
  }
  const left = el('div', 'wd-hr-left');
  left.append(el('div', 'lab', s.perHour));
  if (snap.weather) left.append(small(degrees(snap.weather.temp), 2));
  w.append(left);

  const all = snap.weather?.hourly ?? [];
  const hours = upcoming(all, now.getTime());
  if (hours.length === 0) {
    w.append(el('div', 'lab', '—'));
    return w;
  }

  const cells = el('div', 'wd-hr-cells');
  hours.forEach((h, i) => {
    const cell = el('div', i === 0 && h.at <= now.getTime() ? 'wd-hr-cell now' : 'wd-hr-cell');
    const top = el('div', 'wd-hr-top');
    top.append(icon(weatherIcon(h.code, isNight(snap.sun, h.at)), 12), el('span', 'lab wd-hr-t', degrees(h.temp)));
    cell.append(top, el('div', 'lab wd-hr-h', String(new Date(h.at).getHours())));
    cells.append(cell);
  });

  const rain = rainAt(all, now.getTime());
  const right = el('div', 'lab wd-hr-right', rain === null ? s.dry : s.rainAt.replace('{t}', hourText(rain, lang)));
  w.append(cells, right);
  return w;
}

// Cuaca per jam.
export function renderHourly(root: HTMLElement, strings: HourlyStrings, lang: Lang): { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s, now) {
      root.replaceChildren(hourlyView(strings, lang, s, now));
    },
  };
}

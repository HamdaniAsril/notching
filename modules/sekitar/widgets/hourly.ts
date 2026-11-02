import type { Lang } from '../../../src/kit/protocol';
import { icon, weatherIcon } from '../../../src/kit/icons';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { clock, degrees } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { isNight, isWet, rainAt, rainHours, upcoming } from '../hourly';

export interface HourlyStrings {
  noPlace: string;
  perHour: string;
  now: string; // "Kini"
  rainAt: string; // "Hujan {t}"
  rainFor: string; // "Selama {n} jam"
  high: string;
  low: string;
}

// The strip's content for `now`: "Per jam" over the temperature now on the left, eight hours in
// the middle (the hour, the sky's icon and the temperature; "Kini" in bold for the current hour,
// its icon and those of wet hours in the accent) and on the right the next rain in the accent
// over how long it lasts, or the day's high over its low when no rain is coming. Also what the
// editor's sample draws. At 484 px: left 55, right at most 67, leaving about 330 for eight cells.
export function hourlyView(s: HourlyStrings, lang: Lang, snap: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'v-card wd-hourly');
  if (!snap.place) {
    w.append(lab(s.noPlace));
    return w;
  }
  const left = el('div', 'wd-hr-left');
  left.append(lab(s.perHour));
  if (snap.weather) left.append(num(degrees(snap.weather.temp), 19));
  w.append(left);

  const all = snap.weather?.hourly ?? [];
  const hours = upcoming(all, now.getTime());
  if (!snap.weather || hours.length === 0) {
    w.append(el('span', 'wd-hr-empty', '—'));
    return w;
  }

  const cells = el('div', 'wd-hr-cells');
  hours.forEach((h, i) => {
    const current = i === 0 && h.at <= now.getTime();
    const cell = el('div', current ? 'wd-hr-cell now' : 'wd-hr-cell');
    const ic = el('span', current || isWet(h) ? 'v-acc wd-hr-icon' : 'wd-hr-icon');
    ic.append(icon(weatherIcon(h.code, isNight(snap.sun, h.at)), 12));
    cell.append(el('span', 'wd-hr-h', current ? s.now : String(new Date(h.at).getHours())), ic, num(degrees(h.temp), 11));
    cells.append(cell);
  });

  const right = el('div', 'wd-hr-right');
  const rain = rainAt(all, now.getTime());
  if (rain === null) {
    right.append(el('span', 'wd-hr-high', `${s.high} ${degrees(snap.weather.max)}`), el('span', 'wd-hr-sub', `${s.low} ${degrees(snap.weather.min)}`));
  } else {
    right.append(
      el('span', 'v-acc wd-hr-rain', s.rainAt.replace('{t}', clock(rain, lang))),
      el('span', 'wd-hr-sub', s.rainFor.replace('{n}', String(rainHours(all, rain)))),
    );
  }
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

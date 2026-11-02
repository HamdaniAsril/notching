import type { Lang } from '../../../src/kit/protocol';
import { icon, weatherIcon } from '../../../src/kit/icons';
import { lab, num } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import { degrees, weatherKey, type WeatherKey } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { sunState } from '../sun';

export interface BigWeatherStrings {
  noPlace: string;
  weatherKinds: Record<WeatherKey, string>;
  high: string; // "Tertinggi"
  low: string; // "Terendah"
}

// Night is when the sun is down; without sun times it is simply 18.00 to 06.00.
const isNight = (s: HomeSnapshot, now: Date): boolean =>
  s.sun ? !sunState(s.sun, now.getTime()).day : now.getHours() < 6 || now.getHours() >= 18;

// The widget's content: the city, the temperature at 54 px and the sky at the left; the sky's
// icon in the accent over the high and low at the right. Also what the editor's sample draws.
export function bigWeatherView(_root: HTMLElement, strings: BigWeatherStrings, s: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'v-card wd-bigweather');
  if (!s.place) {
    w.append(lab(strings.noPlace));
    return w;
  }
  const w0 = s.weather;
  const main = el('div', 'wd-bw-main');
  main.append(lab(s.place.name, 'ink wd-bw-city'));
  if (!w0) {
    main.append(el('span', 'wd-bw-sky', '—'));
    w.append(main);
    return w;
  }
  main.append(num(degrees(w0.temp), 54, 'wd-bw-temp'), el('span', 'wd-bw-sky', strings.weatherKinds[weatherKey(w0.code)]));
  const side = el('div', 'wd-bw-side');
  const ic = el('span', 'v-acc wd-bw-icon');
  ic.append(icon(weatherIcon(w0.code, isNight(s, now)), 20));
  const range = el('div', 'wd-bw-range');
  range.append(el('span', 'wd-bw-high', `${strings.high} ${degrees(w0.max)}`), el('span', 'wd-bw-low', `${strings.low} ${degrees(w0.min)}`));
  side.append(ic, range);
  w.append(main, side);
  return w;
}

// Cuaca besar.
export function renderBigWeather(root: HTMLElement, strings: BigWeatherStrings, _lang: Lang): { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s, now) {
      root.replaceChildren(bigWeatherView(root, strings, s, now));
    },
  };
}

import type { Lang } from '../../../src/kit/protocol';
import { icon, weatherIcon } from '../../../src/kit/icons';
import { big, el } from '../../../src/kit/widget';
import { degrees, weatherKey, type WeatherKey } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { sunState } from '../sun';

export interface BigWeatherStrings {
  noPlace: string;
  weatherKinds: Record<WeatherKey, string>;
  high: string;
  low: string;
}

// Night is when the sun is down; without sun times it is simply 18.00 to 06.00.
const isNight = (s: HomeSnapshot, now: Date): boolean =>
  s.sun ? !sunState(s.sun, now.getTime()).day : now.getHours() < 6 || now.getHours() >= 18;

// The widget's content: the city over the temperature in dots and the sky, with the icon and
// the high and low at the right. Also what the editor's sample draws.
export function bigWeatherView(root: HTMLElement, strings: BigWeatherStrings, s: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'wd wd-bigweather');
  const w0 = s.weather;
  if (!s.place) {
    w.append(el('div', 'lab', strings.noPlace));
    return w;
  }
  const left = el('div', 'wd-bw-left');
  left.append(el('div', 'lab', s.place.name), w0 ? big(root, degrees(w0.temp)) : el('div', 'wd-big'));
  if (!w0) {
    left.append(el('div', 'lab', '—'));
    w.append(left);
    return w;
  }
  left.append(el('div', 'wd-bw-sky', strings.weatherKinds[weatherKey(w0.code)]));
  const right = el('div', 'wd-bw-right');
  right.append(
    icon(weatherIcon(w0.code, isNight(s, now)), 28),
    el('div', 'lab', `${strings.high} ${degrees(w0.max)}`),
    el('div', 'lab', `${strings.low} ${degrees(w0.min)}`),
  );
  w.append(left, right);
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

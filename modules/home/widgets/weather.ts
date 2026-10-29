import type { Lang } from '../../../src/kit/protocol';
import { degrees, weatherKey } from '../format';
import type { HomeSnapshot } from '../types';
import { big, el, type HomeStrings } from './shared';

// Cuaca: the city, the temperature in dots (dimmer than the date), the sky and the range.
export function renderWeather(root: HTMLElement, strings: HomeStrings, _lang: Lang): { update(s: HomeSnapshot): void } {
  return {
    update(s) {
      const w = el('div', 'wd wd-weather');
      const now = s.weather;
      const sub = !s.place ? strings.noPlace
        : now ? `${strings.weatherKinds[weatherKey(now.code)]} · ${degrees(now.min)}/${degrees(now.max)}` : '—';
      w.append(el('div', 'lab', s.place?.name ?? strings.weather),
        now ? big(root, degrees(now.temp)) : el('div', 'wd-big'), el('div', 'lab', sub));
      root.replaceChildren(w);
    },
  };
}

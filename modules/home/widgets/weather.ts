import type { Lang } from '../../../src/kit/protocol';
import { degrees, weatherKey } from '../format';
import type { HomeSnapshot } from '../types';
import { big, el, type HomeStrings } from './shared';

// Cuaca: the city, the temperature in dots (dimmer than the date), the sky, the range.
export function renderWeather(root: HTMLElement, strings: HomeStrings, _lang: Lang): { update(s: HomeSnapshot): void } {
  return {
    update(s) {
      const w = el('div', 'wd wd-weather');
      const now = s.weather;
      w.append(el('div', 'lab', s.place?.name ?? strings.weather), now ? big(root, degrees(now.temp)) : el('div', 'wd-big'));
      // A column is too narrow for "Berawan · 25°/33°" on one line.
      if (!s.place) w.append(el('div', 'lab', strings.noPlace));
      else if (!now) w.append(el('div', 'lab', '—'));
      else w.append(el('div', 'lab', strings.weatherKinds[weatherKey(now.code)]), el('div', 'lab', `${degrees(now.min)}/${degrees(now.max)}`));
      root.replaceChildren(w);
    },
  };
}

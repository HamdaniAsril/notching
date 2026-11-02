import { icon, weatherIcon } from '../../../src/kit/icons';
import type { Lang } from '../../../src/kit/protocol';
import { lab, num } from '../../../src/kit/volt';
import { degrees, weatherKey } from '../format';
import type { HomeSnapshot } from '../types';
import { el, type HomeStrings } from './shared';

// The widget's content: the city with the sky's icon in the accent, the big temperature, and
// the sky over the range. `now` picks the moon over the sun once the sun is down. Also what
// the editor's sample draws.
export function weatherView(strings: HomeStrings, s: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'v-card hm-weather');
  const top = el('div', 'hm-wx-top');
  top.append(lab(s.place?.name ?? strings.weather, 'ink hm-wx-city'));
  const foot = el('div', 'hm-wx-foot');
  const wx = s.weather;
  if (wx) {
    const night = !!s.sun && (now.getTime() < s.sun.rise || now.getTime() >= s.sun.set);
    const ic = el('span', 'v-acc hm-wx-icon');
    ic.append(icon(weatherIcon(wx.code, night), 16));
    top.append(ic);
    foot.append(el('span', 'hm-wx-sky', strings.weatherKinds[weatherKey(wx.code)]), el('span', 'hm-wx-range', `${degrees(wx.min)}/${degrees(wx.max)}`));
    w.append(top, num(degrees(wx.temp), 40, 'hm-wx-temp'), foot);
    return w;
  }
  // A column is too narrow for more than one line here.
  foot.append(el('span', 'hm-wx-range', s.place ? '—' : strings.noPlace));
  w.append(top, foot);
  return w;
}

// Cuaca.
export function renderWeather(root: HTMLElement, strings: HomeStrings, _lang: Lang): { update(s: HomeSnapshot, now?: Date): void } {
  return {
    update(s, now = new Date()) {
      root.replaceChildren(weatherView(strings, s, now));
    },
  };
}

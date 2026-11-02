import type { Lang } from '../../../src/kit/protocol';
import { icon } from '../../../src/kit/icons';
import { big, dotRow, el } from '../../../src/kit/widget';
import type { HomeSnapshot } from '../../home/types';

export interface AirStrings {
  noPlace: string;
  air: string; // "UDARA · AQI"
  airBands: string[]; // six labels, the cleanest first
}

// The US AQI bands: 0 good, 1 moderate, 2 unhealthy for some, 3 unhealthy, 4 very unhealthy, 5 hazardous.
export function aqiBand(aqi: number): number {
  return aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5;
}

// The widget's content: the index in dots, its band in words and six dots with the band's one red.
// Also what the editor's sample draws.
export function airView(root: HTMLElement, strings: AirStrings, s: HomeSnapshot): HTMLElement {
  const w = el('div', 'wd wd-air');
  if (!s.place) {
    w.append(el('div', 'lab', strings.noPlace));
    return w;
  }
  const top = el('div', 'wd-air-top');
  top.append(el('span', 'lab', strings.air), icon('wind', 14));
  if (!s.air) {
    w.append(top, el('div', 'lab', '—'));
    return w;
  }
  const band = aqiBand(s.air.aqi);
  w.append(top, big(root, String(s.air.aqi)), el('div', 'lab wd-air-band', strings.airBands[band]), dotRow(6, band, band));
  return w;
}

// Udara.
export function renderAir(root: HTMLElement, strings: AirStrings, _lang: Lang): { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s) {
      root.replaceChildren(airView(root, strings, s));
    },
  };
}

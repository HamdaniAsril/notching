import type { Lang } from '../../../src/kit/protocol';
import { lab, num, segs } from '../../../src/kit/volt';
import { el } from '../../../src/kit/widget';
import type { HomeSnapshot } from '../../home/types';

export interface AirStrings {
  noPlace: string;
  air: string; // "Kualitas udara"
  airAdvice: string[]; // six short lines, the cleanest air first
}

// The US AQI bands: 0 good, 1 moderate, 2 unhealthy for some, 3 unhealthy, 4 very unhealthy, 5 hazardous.
export function aqiBand(aqi: number): number {
  return aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5;
}

// The widget's content: the label, the index at 45 px with "AQI", five segments lit up to the band
// (the two worst bands light all five) and a short line of advice for the band. Also what the
// editor's sample draws.
export function airView(_root: HTMLElement, strings: AirStrings, s: HomeSnapshot): HTMLElement {
  const w = el('div', 'v-card wd-air');
  if (!s.place) {
    w.append(lab(strings.noPlace));
    return w;
  }
  const top = lab(strings.air, 'wd-air-label');
  if (!s.air) {
    w.append(top, el('span', 'wd-air-advice', '—'));
    return w;
  }
  const band = aqiBand(s.air.aqi);
  const value = el('div', 'wd-air-value');
  value.append(num(String(s.air.aqi), 45), el('span', 'wd-air-unit', 'AQI'));
  const foot = el('div', 'wd-air-foot');
  foot.append(segs(5, Math.min(5, band + 1), 'wd-air-segs'), el('span', 'wd-air-advice', strings.airAdvice[band]));
  w.append(top, value, foot);
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

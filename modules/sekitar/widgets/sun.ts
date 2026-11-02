import type { Lang } from '../../../src/kit/protocol';
import { lab, num } from '../../../src/kit/volt';
import { el, svgBox } from '../../../src/kit/widget';
import { clock, remaining } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { sunState } from '../sun';

export interface SunStrings {
  noPlace: string;
  sun: string;
  toSet: string; // "Terbenam {t} lagi"
  toRise: string; // "Terbit {t} lagi"
  rise: string;
  set: string;
}

// The arc is a quadratic Bézier across the 210 px card; the sun sits on it at the share of the
// day gone.
const W = 210;
const H = 38;
const P0 = [3, 37];
const P1 = [105, -30];
const P2 = [207, 37];

const lerp = (a: number[], b: number[], t: number): number[] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const n = (v: number): number => +v.toFixed(2);
const pt = (p: number[]): string => `${n(p[0])} ${n(p[1])}`;

// The horizon and the arc. By day the arc is accent as far as the sun has come and faint beyond,
// with an accent dot in a soft glow. At night the whole arc is faint and the sun rests dim at an end.
// The dot overhangs the box by a few pixels, so the svg does not clip it.
function arcSvg(progress: number, day: boolean): string {
  const t = Math.min(1, Math.max(0, progress));
  const sun = lerp(lerp(P0, P1, t), lerp(P1, P2, t), t);
  const stroke = (cls: string, color: string) => `class="${cls}" fill="none" style="stroke:${color}" stroke-width="1.2" stroke-linecap="round"`;
  const arc = day
    ? `<path ${stroke('rest', 'var(--v-faint)')} d="M${pt(sun)}Q${pt(lerp(P1, P2, t))} ${pt(P2)}"/>`
      + `<path ${stroke('passed', 'var(--v-acc)')} d="M${pt(P0)}Q${pt(lerp(P0, P1, t))} ${pt(sun)}"/>`
    : `<path ${stroke('rest', 'var(--v-faint)')} d="M${pt(P0)}Q${pt(P1)} ${pt(P2)}"/>`;
  const dot = day
    ? `<circle cx="${n(sun[0])}" cy="${n(sun[1])}" r="6.5" style="fill:var(--v-acc)" fill-opacity="0.2"/>`
      + `<circle cx="${n(sun[0])}" cy="${n(sun[1])}" r="3.7" style="fill:var(--v-acc)"/>`
    : `<circle cx="${n(sun[0])}" cy="${n(sun[1])}" r="3.7" style="fill:var(--v-dim)"/>`;
  return `<svg class="wd-sun-arc" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">`
    + `<line x1="0" y1="37" x2="${W}" y2="37" style="stroke:var(--v-track)" stroke-width="1"/>${arc}${dot}</svg>`;
}

// One of the two times: the time in Barlow and its label, on one baseline.
function side(label: string, time: string, labelFirst: boolean): HTMLElement {
  const d = el('div', 'wd-sun-side');
  const l = lab(label);
  d.append(...(labelFirst ? [l, num(time, 16)] : [num(time, 16), l]));
  return d;
}

// The widget's content for `now`: "Matahari" and the time to sunset (or to sunrise at night), the
// arc of the day and the two times. Also what the editor's sample draws.
export function sunView(s: SunStrings, lang: Lang, snap: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'v-card wd-sun');
  if (!snap.place) {
    w.append(lab(s.noPlace));
    return w;
  }
  const top = el('div', 'wd-sun-top');
  top.append(lab(s.sun, 'ink'));
  if (!snap.sun) {
    top.append(el('span', 'wd-sun-eta', '—'));
    w.append(top);
    return w;
  }
  const state = sunState(snap.sun, now.getTime());
  top.append(el('span', 'wd-sun-eta', (state.day ? s.toSet : s.toRise).replace('{t}', remaining(state.untilMs, lang))));
  const foot = el('div', 'wd-sun-foot');
  foot.append(side(s.rise, clock(snap.sun.rise, lang), false), side(s.set, clock(snap.sun.set, lang), true));
  w.append(top, svgBox('wd-sun-box', arcSvg(state.progress, state.day)), foot);
  return w;
}

// Matahari.
export function renderSun(root: HTMLElement, strings: SunStrings, lang: Lang): { update(s: HomeSnapshot, now: Date): void } {
  return {
    update(s, now) {
      root.replaceChildren(sunView(strings, lang, s, now));
    },
  };
}

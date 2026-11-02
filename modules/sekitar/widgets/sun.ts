import type { Lang } from '../../../src/kit/protocol';
import { el, small, svgBox } from '../../../src/kit/widget';
import { clock } from '../../home/format';
import type { HomeSnapshot } from '../../home/types';
import { remainingShort, sunState } from '../sun';

export interface SunStrings {
  noPlace: string;
  sun: string;
  toSet: string;
  toRise: string;
  rise: string;
  set: string;
}

// The arc is a quadratic Bézier; the sun sits on it at the share of the day gone.
const P0 = [4, 38];
const P1 = [100, -18];
const P2 = [196, 38];

const lerp = (a: number[], b: number[], t: number): number[] => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const n = (v: number): number => +v.toFixed(2);
const pt = (p: number[]): string => `${n(p[0])} ${n(p[1])}`;

// The horizon, the arc drawn white as far as the sun has come and dim beyond, and the red sun.
// The dot at either end overhangs the 40 px box by a few pixels, so the svg does not clip it.
function arcSvg(progress: number): string {
  const t = Math.min(1, Math.max(0, progress));
  const sun = lerp(lerp(P0, P1, t), lerp(P1, P2, t), t);
  const passed = `M${pt(P0)}Q${pt(lerp(P0, P1, t))} ${pt(sun)}`;
  const rest = `M${pt(sun)}Q${pt(lerp(P1, P2, t))} ${pt(P2)}`;
  const stroke = (cls: string, color: string) => `class="${cls}" fill="none" style="stroke:${color}" stroke-width="1.5"`;
  return `<svg class="wd-sun-arc" width="200" height="40" viewBox="0 0 200 40" style="overflow:visible">`
    + `<line x1="0" y1="38" x2="200" y2="38" style="stroke:var(--g3)" stroke-width="1"/>`
    + `<path ${stroke('rest', 'var(--g3)')} d="${rest}"/>`
    + `<path ${stroke('passed', 'var(--w)')} d="${passed}"/>`
    + `<circle cx="${n(sun[0])}" cy="${n(sun[1])}" r="4" style="fill:var(--red)"/></svg>`;
}

// The widget's content for `now`: the time to sunset (or to sunrise at night), the arc of the day
// and the two times. Also what the editor's sample draws.
export function sunView(s: SunStrings, lang: Lang, snap: HomeSnapshot, now: Date): HTMLElement {
  const w = el('div', 'wd wd-sun');
  if (!snap.place) {
    w.append(el('div', 'lab', s.noPlace));
    return w;
  }
  const top = el('div', 'wd-sun-top');
  top.append(el('span', 'lab', s.sun));
  if (!snap.sun) {
    top.append(el('span', 'lab', '—'));
    w.append(top);
    return w;
  }
  const state = sunState(snap.sun, now.getTime());
  const eta = el('span', 'lab wd-sun-eta');
  eta.append(el('span', 'wd-sun-n', remainingShort(state.untilMs, lang)), ` ${state.day ? s.toSet : s.toRise}`);
  top.append(eta);
  // The dot font has no full stop, so the times are drawn with a colon.
  const foot = el('div', 'wd-sun-foot');
  const left = el('div', 'wd-sun-side');
  left.append(el('span', 'lab', s.rise), small(clock(snap.sun.rise, 'en'), 3));
  const right = el('div', 'wd-sun-side');
  right.append(el('span', 'lab', s.set), small(clock(snap.sun.set, 'en'), 3));
  foot.append(left, right);
  w.append(top, svgBox('wd-sun-box', arcSvg(state.progress)), foot);
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

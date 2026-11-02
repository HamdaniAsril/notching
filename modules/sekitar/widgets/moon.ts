import type { Lang } from '../../../src/kit/protocol';
import { el, svgBox } from '../../../src/kit/widget';
import { moonInfo, type MoonInfo, type MoonPhase } from '../moon';

export interface MoonStrings {
  moonPhases: Record<MoonPhase, string>;
  fullIn: string; // "Purnama {n} hari lagi"
  fullInOne: string; // the same for one day
  newIn: string;
  newInOne: string;
  today: string;
}

const R = 20;
const HALO = 26;

// A 52 px moon: a faint halo, the dark side as a black disk, the lit part over it in ink. The
// terminator is half an ellipse as wide as the lit share is off half; a waning moon is the mirror image.
function moonSvg(m: MoonInfo): string {
  const u = 1 - (2 * m.lit) / 100; // 1 new, 0 half, -1 full
  const rx = Math.abs(u) * R;
  const sweep = u > 0 ? 0 : 1;
  const lit = `M${R} 0A${R} ${R} 0 0 1 ${R} ${2 * R}A${rx} ${R} 0 0 ${sweep} ${R} 0Z`;
  const mirror = m.waxing ? '' : ` transform="translate(${2 * R} 0) scale(-1 1)"`;
  const size = 2 * HALO;
  return `<svg class="wd-moon-disk" width="${size}" height="${size}" viewBox="${R - HALO} ${R - HALO} ${size} ${size}">`
    + `<circle cx="${R}" cy="${R}" r="${HALO}" fill="#f4efe6" fill-opacity="0.05"/>`
    + `<circle cx="${R}" cy="${R}" r="${R}" fill="#000"/>`
    + `<g${mirror}><path d="${lit}" style="fill:var(--v-ink)"/></g></svg>`;
}

// The widget's content for `now`, flush in its card: the moon, then the phase with its percent in
// Barlow and the days to the next full or new moon. Also what the editor's sample draws.
export function moonView(_root: HTMLElement, strings: MoonStrings, now: Date): HTMLElement {
  const m = moonInfo(now.getTime());
  const w = el('div', 'v-card flush wd-moon');
  const soon = Math.min(m.toFull, m.toNew);
  const full = m.toFull <= m.toNew;
  const one = soon === 1;
  const template = full ? (one ? strings.fullInOne : strings.fullIn) : (one ? strings.newInOne : strings.newIn);
  const text = soon === 0 ? strings.today : template.replace('{n}', String(soon));
  w.append(
    svgBox('wd-moon-box', moonSvg(m)),
    el('div', 'wd-moon-title', `${strings.moonPhases[m.phase]} ${m.lit}%`),
    el('div', 'wd-moon-sub', text),
  );
  return w;
}

// Bulan.
export function renderMoon(root: HTMLElement, strings: MoonStrings, _lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(moonView(root, strings, now));
    },
  };
}

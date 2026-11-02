import type { Lang } from '../../../src/kit/protocol';
import { dotText, dotWidth } from '../../../src/kit/dots';
import { COLUMN_PX, el, svgBox } from '../../../src/kit/widget';
import { moonInfo, type MoonInfo, type MoonPhase } from '../moon';

export interface MoonStrings {
  moonPhases: Record<MoonPhase, string>;
  fullIn: string; // "Purnama {n} hari"
  fullInOne: string; // the same for one day
  newIn: string;
  newInOne: string;
  today: string;
}

const R = 17;

// A 34 px moon: the dark side as a dim disk, the lit part over it. The terminator is half an
// ellipse as wide as the lit share is off half; a waning moon is the mirror image.
function moonSvg(m: MoonInfo): string {
  const u = 1 - (2 * m.lit) / 100; // 1 new, 0 half, -1 full
  const rx = Math.abs(u) * R;
  const sweep = u > 0 ? 0 : 1;
  const lit = `M${R} 0A${R} ${R} 0 0 1 ${R} ${2 * R}A${rx} ${R} 0 0 ${sweep} ${R} 0Z`;
  const mirror = m.waxing ? '' : ` transform="translate(${2 * R} 0) scale(-1 1)"`;
  return `<svg class="wd-moon-disk" width="${2 * R}" height="${2 * R}" viewBox="0 0 ${2 * R} ${2 * R}">`
    + `<circle cx="${R}" cy="${R}" r="${R}" style="fill:var(--g3)"/>`
    + `<g${mirror}><path d="${lit}" fill="#fff"/></g></svg>`;
}

// The percent shares the row with the moon: the biggest pitch of 6, 5, 4 that fits what is left.
function percent(root: HTMLElement, lit: number): HTMLElement {
  const text = String(lit);
  const room = (root.clientWidth || COLUMN_PX) - 40;
  const pitch = [6, 5, 4].find(p => dotWidth(text, p) <= room) ?? 4;
  return svgBox('wd-big', dotText(text, pitch));
}

// The widget's content for `now`. Also what the editor's sample draws.
export function moonView(root: HTMLElement, strings: MoonStrings, now: Date): HTMLElement {
  const m = moonInfo(now.getTime());
  const w = el('div', 'wd wd-moon');
  const row = el('div', 'wd-moon-row');
  const pct = el('div', 'wd-moon-pct');
  pct.append(percent(root, m.lit), el('div', 'lab', '%'));
  row.append(svgBox('wd-moon-box', moonSvg(m)), pct);
  const soon = Math.min(m.toFull, m.toNew);
  const full = m.toFull <= m.toNew;
  const one = soon === 1;
  const template = full ? (one ? strings.fullInOne : strings.fullIn) : (one ? strings.newInOne : strings.newIn);
  const text = soon === 0 ? strings.today : template.replace('{n}', String(soon));
  const foot = el('div', 'wd-moon-foot');
  foot.append(el('i', 'rd'), el('div', 'lab', text));
  w.append(el('div', 'lab', strings.moonPhases[m.phase]), row, foot);
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

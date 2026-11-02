import type { Lang } from '../../../src/kit/protocol';
import { zoneLabel } from '../../../src/kit/dates';
import { svgBox } from '../../../src/kit/widget';

// Degrees clockwise from 12 o'clock; the hour hand creeps with the minutes, the minute hand with the seconds.
export function handAngles(now: Date): { hour: number; minute: number; second: number } {
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const s = now.getSeconds();
  return { hour: h * 30 + m * 0.5, minute: m * 6 + s * 0.1, second: s * 6 };
}

// The face fills the 109 × 104 frame; the hands turn about its centre.
const W = 109;
const H = 104;
const CX = W / 2;
const CY = H / 2;
// The Volt colours as literals, so the editor's sample, outside the card's CSS, draws the same.
const INK = '#f3f5f0';
const FAINT = '#454941';
const MUTED = '#8c9187';
const ACCENT = '#c8f04a';
const NAME_MAX = 16;

// A hand from the centre, `len` long, as a line rotated about the pin.
const hand = (cls: string, deg: number, len: number, width: number, color: string, tail: number) =>
  `<line class="${cls}" x1="${CX}" y1="${CY + tail}" x2="${CX}" y2="${CY - len}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" transform="rotate(${deg} ${CX} ${CY})"/>`;

// A tick on the dial, `i` twelfths round: the quarters long, the rest short.
function tick(i: number): string {
  const [from, to] = i % 3 === 0 ? [47, 39.6] : [47, 44];
  const rad = (i * 30 * Math.PI) / 180;
  const at = (r: number) => [(CX + r * Math.sin(rad)).toFixed(2), (CY - r * Math.cos(rad)).toFixed(2)];
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);
  return `<line class="tk" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${FAINT}" stroke-width="1" stroke-linecap="round"/>`;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// The 109 × 104 face as SVG: 12 faint ticks, three hands, the city under the centre.
export function analogSvg(now: Date, lang: Lang, city: string | null = null): string {
  const a = handAngles(now);
  const name = city ?? zoneLabel(lang, now);
  const shown = name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name;
  const ticks = Array.from({ length: 12 }, (_, i) => tick(i)).join('');
  const label = `<text x="${CX}" y="${CY + 27}" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="9" font-weight="500" fill="${MUTED}">${escape(shown)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ticks}${label}`
    + hand('hr', a.hour, 28, 2.5, INK, 3) + hand('mn', a.minute, 38, 1.6, INK, 3)
    + hand('sec', a.second, 43, 1, ACCENT, 5) + `<circle class="pin" cx="${CX}" cy="${CY}" r="2.5" fill="${ACCENT}"/></svg>`;
}

// Jam analog.
export function renderAnalog(root: HTMLElement, lang: Lang): { update(now: Date, city: string | null): void } {
  return {
    update(now, city) {
      root.replaceChildren(svgBox('v-card flush wd-analog', analogSvg(now, lang, city)));
    },
  };
}

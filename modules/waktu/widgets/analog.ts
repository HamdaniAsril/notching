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

const C = 48;
const WHITE = '#fff';
const DIM = 'rgba(255,255,255,0.42)';
const RED = '#e8262e';

// A hand from the centre, `len` long, as a line rotated about the pin.
const hand = (cls: string, deg: number, len: number, width: number, color: string, tail = 0) =>
  `<line class="${cls}" x1="${C}" y1="${C + tail}" x2="${C}" y2="${C - len}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" transform="rotate(${deg} ${C} ${C})"/>`;

// The 96 × 96 face as SVG: 12 tick dots (the quarters bigger), three hands, the zone under 12.
// Colors are literal so the editor's sample, outside the card's CSS, draws the same.
export function analogSvg(now: Date, lang: Lang): string {
  const a = handAngles(now);
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const rad = (i * 30 * Math.PI) / 180;
    const r = i % 3 === 0 ? 2.2 : 1.4;
    return `<circle class="tk" cx="${(C + 42 * Math.sin(rad)).toFixed(2)}" cy="${(C - 42 * Math.cos(rad)).toFixed(2)}" r="${r}" fill="${i % 3 === 0 ? WHITE : DIM}"/>`;
  }).join('');
  const zone = `<text x="${C}" y="29" text-anchor="middle" font-family="Space Mono, ui-monospace, monospace" font-size="7" letter-spacing="0.6" fill="${DIM}">${zoneLabel(lang, now)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${ticks}${zone}`
    + hand('hr', a.hour, 22, 5, WHITE) + hand('mn', a.minute, 33, 2.5, WHITE)
    + hand('sec', a.second, 36, 1.2, RED, 8) + `<circle class="pin" cx="${C}" cy="${C}" r="3.5" fill="${RED}"/></svg>`;
}

// Jam analog.
export function renderAnalog(root: HTMLElement, lang: Lang): { update(now: Date): void } {
  return {
    update(now) {
      root.replaceChildren(svgBox('wd-analog', analogSvg(now, lang)));
    },
  };
}

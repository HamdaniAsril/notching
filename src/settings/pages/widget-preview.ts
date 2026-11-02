import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import { lab } from '../../kit/volt';
import enTimer from '../../../modules/timer/locales/en.json';
import idTimer from '../../../modules/timer/locales/id.json';
import { el } from '../controls';
import { packSample } from './widget-samples';

// A picture of a widget for the page editor: sample content drawn the way the
// widget draws it, at its size in the notch, on black. Not live data. The list's
// cards shrink it by a fixed amount in CSS, so it never stretches with the window.

// The Timer strip's picture: the idle strip at its default 30 minutes, with the end time it would have at
// 17.30 (17:30 in English). Its ruler is drawn as the strip's: ticks 8 px apart around the
// needle, 1 to 60, those up to 30 in ink.
const SAMPLE_MINUTES = 30;
const TICK_PX = 8;

function timerStripSample(lang: Lang): HTMLElement {
  const s = lang === 'en' ? enTimer : idTimer;
  const w = el('div', 'v-card ed-tm');
  const left = el('div', 'ed-tm-left');
  left.append(lab(s.label), el('span', 'v-num', s.clock.replace('{h}', '17').replace('{m}', '30')));
  const ruler = el('div', 'ed-tm-ruler');
  for (let m = 1; m <= 60; m++) {
    const at = `calc(50% + ${(m - SAMPLE_MINUTES) * TICK_PX}px)`;
    const tick = el('i', m % 5 === 0 ? 'ed-tm-tick long' : m <= SAMPLE_MINUTES ? 'ed-tm-tick on' : 'ed-tm-tick');
    tick.style.left = at;
    ruler.append(tick);
    if (m % 10 === 0) {
      const n = el('span', 'ed-tm-num', String(m));
      n.style.left = at;
      ruler.append(n);
    }
  }
  ruler.append(el('i', 'ed-tm-needle'));
  const right = el('div', 'ed-tm-right');
  right.append(lab(s.ruler), el('span', 'v-num v-acc', `${SAMPLE_MINUTES}:00`));
  w.append(left, ruler, right);
  return w;
}

// The sample content alone, for a column of the notch preview or a card. The home and pack
// widgets draw theirs with their own views (widget-samples.ts); the Timer strip still has its own.
export function widgetSample(w: CatalogWidget, lang: Lang): HTMLElement[] {
  switch (w.ref) {
    case 'timer/strip':
      return [timerStripSample(lang)];
    default:
      return packSample(w, lang) ?? [el('div', 'ed-plain', w.name)];
  }
}

export function widgetPreview(w: CatalogWidget, lang: Lang): HTMLElement {
  const shot = el('div', 'ed-shot');
  shot.dataset.width = String(w.width);
  shot.setAttribute('aria-hidden', 'true');
  shot.append(...widgetSample(w, lang));
  return shot;
}

import type { Lang } from '../../kit/protocol';
import type { CatalogWidget } from '../../pages/layout';
import { el } from '../controls';
import { packSample } from './widget-samples';

// A picture of a widget for the page editor: sample content drawn the way the
// widget draws it, at its size in the notch, on black. Not live data. The list's
// cards shrink it by a fixed amount in CSS, so it never stretches with the window.

const lab = (text: string) => el('div', 'lab', text);

// The sample content alone, for a column of the notch preview or a card. The home and pack
// widgets draw theirs with their own views (widget-samples.ts); the Timer strip still has its own.
export function widgetSample(w: CatalogWidget, lang: Lang): HTMLElement[] {
  switch (w.ref) {
    case 'timer/strip':
      return [lab('Timer'), el('i', 'ed-tm-ruler'), el('div', 'ed-tm-time', '30:00')];
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

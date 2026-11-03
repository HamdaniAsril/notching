import type { Lang } from '../../../src/kit/protocol';
import { icon } from '../../../src/kit/icons';
import { el } from '../../../src/kit/widget';
import type { NowView } from '../now';
import { controlButton, lineView, mountNow, setProgress, textView, type Actions, type MusikStrings, type NowWidget } from '../parts';

// The disc's label: the artwork, or the accent gradient (the same one as the other covers).
function hubView(v: NowView): HTMLElement {
  if (v.empty) return el('i', 'wd-mu-hub none');
  if (v.art) {
    const l = el('i', 'wd-mu-hub art');
    const img = el('img');
    img.src = v.art;
    img.alt = '';
    l.append(img);
    return l;
  }
  return el('i', 'wd-mu-hub tile');
}

// Musik kecil, one column: a disc (44 px, design 80) with two grooves, the label and the hole,
// the three controls over it; under it the title, the artist and a short line. Also what the
// editor's sample draws.
export function miniView(s: MusikStrings, lang: Lang, v: NowView): HTMLElement {
  const w = el('div', v.empty ? 'v-card wd-mu-mini empty' : 'v-card wd-mu-mini');

  const disc = el('div', 'wd-mu-disc');
  const ctrl = el('div', 'wd-mu-ctrl');
  const play = controlButton(s, v, 'toggle', 8, 'play');
  // Nothing playing: the dim note sits where the play button is.
  if (v.empty) play.replaceChildren(icon('music', 9));
  ctrl.append(controlButton(s, v, 'prev', 9), play, controlButton(s, v, 'next', 9));
  disc.append(el('i', 'wd-mu-groove one'), el('i', 'wd-mu-groove two'), hubView(v), el('i', 'wd-mu-hole'), ctrl);

  const text = el('div', 'wd-mu-text');
  const t = textView(s, v);
  text.append(t.title, t.artist);

  w.append(disc, text, lineView());
  setProgress(w, v, lang);
  return w;
}

export function renderMini(root: HTMLElement, s: MusikStrings, lang: Lang, act: Actions, clock: () => number = Date.now): NowWidget {
  return mountNow(root, lang, act, v => miniView(s, lang, v), clock);
}

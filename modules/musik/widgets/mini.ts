import type { Lang } from '../../../src/kit/protocol';
import { icon } from '../../../src/kit/icons';
import { el } from '../../../src/kit/widget';
import type { NowView } from '../now';
import { controlButton, mountNow, setProgress, textView, type Actions, type MusikStrings, type NowWidget } from '../parts';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The disc's face, all of it: the cover, the accent gradient (the same one as the other covers),
// or the dim track colour when nothing plays.
function faceView(v: NowView): HTMLElement {
  if (v.empty) return el('i', 'wd-mu-face none');
  if (v.art) {
    const f = el('i', 'wd-mu-face art');
    const img = el('img');
    img.src = v.art;
    img.alt = '';
    f.append(img);
    return f;
  }
  return el('i', 'wd-mu-face tile');
}

// The progress round the disc: a track ring and an accent arc, pathLength 100 so setProgress
// sets what is left as the dash offset.
function ringView(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'wd-mu-ring');
  svg.setAttribute('viewBox', '0 0 66 66');
  for (const cls of ['wd-mu-track', 'wd-mu-arc']) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '33');
    c.setAttribute('cy', '33');
    c.setAttribute('r', '32');
    c.setAttribute('pathLength', '100');
    svg.append(c);
  }
  return svg;
}

// Musik kecil, one column (owner, 3 Nov): a 60 px disc faced with the cover so it reads, two
// grooves over it, play/pause in the hole at its centre, prev and next on white inside it left
// and right; the progress as a ring round it; under it the title and the artist. Also what the
// editor's sample draws.
export function miniView(s: MusikStrings, lang: Lang, v: NowView): HTMLElement {
  const w = el('div', v.empty ? 'v-card wd-mu-mini empty' : 'v-card wd-mu-mini');

  const disc = el('div', 'wd-mu-disc');
  const hole = controlButton(s, v, 'toggle', 10, 'wd-mu-hole');
  // Nothing playing: the dim note sits in the hole.
  if (v.empty) hole.replaceChildren(icon('music', 10));
  disc.append(
    faceView(v), el('i', 'wd-mu-groove one'), el('i', 'wd-mu-groove two'),
    controlButton(s, v, 'prev', 8, 'wd-mu-side left'), hole, controlButton(s, v, 'next', 8, 'wd-mu-side right'),
  );
  const ring = el('div', 'wd-mu-ringbox');
  ring.append(ringView(), disc);

  const text = el('div', 'wd-mu-text');
  const t = textView(s, v);
  text.append(t.title, t.artist);

  w.append(ring, text);
  setProgress(w, v, lang);
  return w;
}

export function renderMini(root: HTMLElement, s: MusikStrings, lang: Lang, act: Actions, clock: () => number = Date.now): NowWidget {
  return mountNow(root, lang, act, v => miniView(s, lang, v), clock);
}

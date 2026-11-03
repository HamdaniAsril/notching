import type { Lang } from '../../../src/kit/protocol';
import { el } from '../../../src/kit/widget';
import type { NowView } from '../now';
import { controlButton, coverView, lineView, mountNow, setProgress, textView, type Actions, type MusikStrings, type NowWidget } from '../parts';

// Musik strip: the small cover, the title over the artist, the position, the line and the
// duration, then the controls with the accent play button. Also what the editor's sample draws.
export function stripView(s: MusikStrings, lang: Lang, v: NowView): HTMLElement {
  const w = el('div', v.empty ? 'v-card wd-mu-strip empty' : 'v-card wd-mu-strip');

  const id = el('div', 'wd-mu-id');
  const text = el('div', 'wd-mu-text');
  const t = textView(s, v);
  text.append(t.title, t.artist);
  id.append(coverView(v, 'wd-mu-cover'), text);

  const prog = el('div', 'wd-mu-prog');
  prog.append(el('span', 'wd-mu-cur'), lineView(), el('span', 'wd-mu-dur'));

  const ctrl = el('div', 'wd-mu-ctrl');
  ctrl.append(controlButton(s, v, 'prev', 11), controlButton(s, v, 'toggle', 11, 'play acc'), controlButton(s, v, 'next', 11));

  w.append(id, prog, ctrl);
  setProgress(w, v, lang);
  return w;
}

export function renderStrip(root: HTMLElement, s: MusikStrings, lang: Lang, act: Actions, clock: () => number = Date.now): NowWidget {
  return mountNow(root, lang, act, v => stripView(s, lang, v), clock);
}

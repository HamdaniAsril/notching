import type { Lang } from '../../../src/kit/protocol';
import { el } from '../../../src/kit/widget';
import type { NowView } from '../now';
import { controlButton, coverView, lineView, mountNow, setProgress, textView, type Actions, type MusikStrings, type NowWidget } from '../parts';

// Musik, two columns: the cover on the left (80 px, design 136). On the right the label in the
// accent, the title (at most two lines), the artist, the line with the two times, and the
// controls with the round white play button. Also what the editor's sample draws.
export function playerView(s: MusikStrings, lang: Lang, v: NowView): HTMLElement {
  const w = el('div', v.empty ? 'v-card wd-mu-player empty' : 'v-card wd-mu-player');
  const info = el('div', 'wd-mu-info');

  const top = el('div', 'wd-mu-top');
  const t = textView(s, v);
  if (!v.empty) top.append(el('div', 'v-acc wd-mu-label', s.nowPlaying));
  top.append(t.title, t.artist);

  const prog = el('div', 'wd-mu-prog');
  const times = el('div', 'wd-mu-times');
  times.append(el('span', 'wd-mu-cur'), el('span', 'wd-mu-dur'));
  prog.append(lineView(), times);

  const ctrl = el('div', 'wd-mu-ctrl');
  ctrl.append(controlButton(s, v, 'prev', 11), controlButton(s, v, 'toggle', 10, 'play'), controlButton(s, v, 'next', 11));

  info.append(top, prog, ctrl);
  w.append(coverView(v, 'wd-mu-cover'), info);
  setProgress(w, v, lang);
  return w;
}

export function renderPlayer(root: HTMLElement, s: MusikStrings, lang: Lang, act: Actions, clock: () => number = Date.now): NowWidget {
  return mountNow(root, lang, act, v => playerView(s, lang, v), clock);
}

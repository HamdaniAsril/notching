import type { Lang } from '../../src/kit/protocol';
import { icon, type IconName } from '../../src/kit/icons';
import { el } from '../../src/kit/widget';
import { clockText, createNow, firstWord, type Command, type NowState, type NowView } from './now';

export interface MusikStrings {
  nowPlaying: string; // "Sedang diputar"
  nothing: string; // "Tidak ada yang diputar"
  prev: string;
  next: string;
  play: string;
  pause: string;
}

export interface Actions {
  command(word: Command): void;
}

const DASH = '–';

// The cover: the artwork, or the accent tile with the first word of the title (a source with no
// picture, a video in a browser), or a dim note when nothing plays. `cls` is the size class.
export function coverView(v: NowView, cls: string): HTMLElement {
  if (v.empty) {
    const c = el('div', `${cls} none`);
    c.append(icon('music', 16));
    return c;
  }
  if (v.art) {
    const c = el('div', `${cls} art`);
    const img = el('img');
    img.src = v.art;
    img.alt = '';
    c.append(img);
    return c;
  }
  return el('div', `${cls} tile`, firstWord(v.title));
}

// One of the three buttons; it says what it does, and is dim and dead when nothing plays.
export function controlButton(s: MusikStrings, v: NowView, cmd: Command, px: number, cls = ''): HTMLButtonElement {
  const b = el('button', cls ? `wd-mu-btn ${cls}` : 'wd-mu-btn');
  b.type = 'button';
  b.dataset.cmd = cmd;
  const name: IconName = cmd === 'prev' ? 'skip-back' : cmd === 'next' ? 'skip-forward' : v.playing ? 'pause' : 'play';
  b.setAttribute('aria-label', cmd === 'prev' ? s.prev : cmd === 'next' ? s.next : v.playing ? s.pause : s.play);
  b.disabled = v.empty;
  b.append(icon(name, px));
  return b;
}

// The title, and under it the artist: what every widget prints about the track.
export function textView(s: MusikStrings, v: NowView): { title: HTMLElement; artist: HTMLElement } {
  return {
    title: el('div', 'wd-mu-title', v.empty ? s.nothing : v.title),
    artist: el('div', 'wd-mu-artist', v.artist),
  };
}

// The thin line, filled in ink up to the position.
export function lineView(): HTMLElement {
  const line = el('div', 'wd-mu-line');
  line.append(el('i', 'wd-mu-fill'));
  return line;
}

// The parts of a view that move with the clock, set in place so a click is never lost to a
// rebuild: the fill of the line and, where the widget has them, the two times.
export function setProgress(root: HTMLElement, v: NowView, lang: Lang): void {
  const frac = v.duration !== null && v.duration > 0 ? Math.min(1, Math.max(0, v.position / v.duration)) : 0;
  const fill = root.querySelector<HTMLElement>('.wd-mu-fill');
  if (fill) fill.style.width = `${Math.round(frac * 10000) / 100}%`;
  const cur = root.querySelector('.wd-mu-cur');
  if (cur) cur.textContent = v.empty ? DASH : clockText(v.position, lang);
  const dur = root.querySelector('.wd-mu-dur');
  if (dur) dur.textContent = v.duration !== null && v.duration > 0 ? clockText(v.duration, lang) : DASH;
}

export interface NowWidget {
  update(state: NowState): void; // a reading from the core
  tick(): void; // moves the position on by the clock between readings
}

// What the three widgets share: the state, the clicks and the redraw. `build` draws the widget
// for a view; the card is rebuilt only when the track, the button or the picture changes.
export function mountNow(
  root: HTMLElement,
  lang: Lang,
  act: Actions,
  build: (v: NowView) => HTMLElement,
  clock: () => number,
): NowWidget {
  const now = createNow();
  let ready = false;
  let shown = '';

  function draw(): void {
    if (!ready) return;
    const v = now.view(clock());
    const key = JSON.stringify([v.empty, v.playing, v.title, v.artist, v.art]);
    if (key !== shown) {
      shown = key;
      root.replaceChildren(build(v));
    }
    setProgress(root, v, lang);
  }

  root.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-cmd]');
    if (!b || b.disabled) return;
    const cmd = b.dataset.cmd as Command;
    if (cmd === 'toggle') {
      now.press(clock());
      draw();
    }
    act.command(cmd);
  });

  return {
    update(state) {
      ready = true;
      now.read(state, clock());
      draw();
    },
    tick: draw,
  };
}

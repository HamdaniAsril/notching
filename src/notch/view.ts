import { EAR_W, NOTICE_PILL, type NotchController, type Phase } from './controller';
import { type Beside, containsPoint, OVERLAY_SIZE, type Rect, hitRects } from './hit';
import { lensPath, notchPath, notchTabPath, panelFade, panelPath, topPillPath } from './shape';

export interface ViewDeps {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void; // only when the rects change (rounded to 1 px)
  onPhase: (p: Phase) => void; // only when the phase changes
  onQuit: () => void; // Cmd+Q while the panel is open
  onSelect: (id: string) => void; // a page icon in the pill was clicked
  onMore: () => void; // the ⋯ icon was clicked
  setTimer?: (fn: () => void, ms: number) => () => void; // for the music's pause; setTimeout if left out
}

// One page icon in the pill; `svg` is one of the fixed icons in src/pages/icons.ts.
export interface PillItem {
  id: string;
  label: string;
  svg: string;
  missed?: boolean; // a notice from a widget on it went unseen
}

// What the ears show. `icon` is the module's icon URL, null for the bell.
export interface NoticeView {
  icon: string | null;
  title: string;
  detail: string;
  glow: boolean;
}

// One status: its text (empty: the icon alone) and its module's icon URL (null: none).
export interface StatusView {
  text: string;
  icon: string | null;
}

// What plays (MediaSummary in src/bridge.ts): `art` is a data: URL, or null.
export interface MediaView {
  playing: boolean;
  title: string | null;
  art: string | null;
}

export interface NotchView {
  kick(): void;
  destroy(): void;
  readonly content: HTMLElement; // holds the card
  setPill(items: PillItem[], active: string | null, moreLabel: string): void;
  setNotice(n: NoticeView | null): void;
  setMissed(on: boolean): void; // the dot under the notch while idle
  setStatus(items: StatusView[]): void; // beside the notch, or in a pill on a lens; [] hides it
  setLamp(lamp: LampView | null): void; // Cermin's lamp; null: the usual panel
  setMedia(m: MediaView | null): void; // the cover and soundwave beside the notch, or in the lens's pill
}

// Cermin's lamp (design 31 Oct, Cermin §4, cermin-v6.html): a white panel whose
// added wings take the light's color, with a thin glow of a stronger one.
export interface LampView {
  color: string;
  glow: string;
}

// How far the lamp widens the panel on each side.
export const LAMP_WING = 130;
// The wings' color is solid this far in from the edge, then blends to white.
const LAMP_SOLID = 40;

const SVG_NS = 'http://www.w3.org/2000/svg';

// Line icons from beranda-nothing.html.
const ICON = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const MORE_ICON = ICON('<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>');

// Panel gradient, picked with the sliders in panel-gradient.html: solid for the top
// 15 %, then down to 75 % opacity at the bottom edge.
const PANEL_FADE_FROM = 0.15;
const PANEL_FADE_TO = 0.75;

const BELL_ICON = ICON('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>');

// How far the notch widens to the left to hold the missed-notice dot.
const MISSED_TAB = 20;
// How far it widens to the right to hold the status (live-status.html, A): the
// module's icon and up to 6 characters, so you can tell which one runs (owner, 31 Oct).
export const STATUS_TAB = 76;
// The status icon, white, just left of the text.
const ST_ICON = 12;
const ST_GAP = 5;
// The lens screen's status pill (live-status.html, B): 22 px tall, its width
// from the text, 7 px a character, and room for the dot.
const PILL_H = 22;
const PILL_PAD = 12;
const PILL_CHAR = 7;
const PILL_DOT = 14;
// Between two statuses: a thin line in a 12 px gap.
const ST_SEP = 12;

// Music beside the notch (design 3 Nov, §5): the cover in a tab left of the
// notch, the soundwave in one right of it, each in a square box as tall as the
// notch less 8 px, MU_IN from the notch's edge and MU_OUT from the tab's.
const MU_IN = 6;
const MU_OUT = 8;
// The missed dot's room, left of the cover.
const MU_DOT = 12;
// Five bars 2 px wide, 2 px apart, rising from 30 % to 100 % of the wave's height.
const BARS = 5;
const BAR_W = 2;
const BAR_GAP = 2;
const WAVE_W = BARS * BAR_W + (BARS - 1) * BAR_GAP;
// Each bar's beat (s), its start within it, and its height where motion is reduced.
const BAR_BEATS = [1.1, 0.9, 1.3, 1.0, 1.2];
const BAR_DELAYS = [-0.2, -0.6, -0.1, -0.8, -0.4];
const BAR_REST = [0.5, 0.8, 1, 0.7, 0.45];
// On a lens, between the cover and the waves.
const MU_GAP = 8;
// Paused, the music stays this long, so a short pause does not flicker.
export const MUSIC_LINGER_MS = 3000;
// Volt's accent and its deep shade, as the page's CSS variables so they follow
// the accent picked in Tampilan: the bars, and the cover of a track without artwork.
const ACC = 'var(--v-acc)';
const ACC_DEEP = 'var(--v-acc-deep)';

// The G2 glow from notif-v1.html: a gradient running round the notice's rim.
const GLOW_STOPS = ['#ff6ec4', '#7873f5', '#4adede', '#ffd166'];

// The settings window's preview mounts a second notch, so ids get a suffix.
let mounts = 0;

export function mountNotch(root: HTMLElement, c: NotchController, deps: ViewDeps): NotchView {
  const doc = root.ownerDocument;
  const { w: OW, h: OH } = OVERLAY_SIZE;
  const notch = c.notch;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'notch-svg');
  svg.setAttribute('width', String(OW));
  svg.setAttribute('height', String(OH));
  svg.setAttribute('viewBox', `${-OW / 2} 0 ${OW} ${OH}`);
  const liquid = doc.createElementNS(SVG_NS, 'path');
  const panel = doc.createElementNS(SVG_NS, 'path');
  const uid = ++mounts;
  const defs = doc.createElementNS(SVG_NS, 'defs');
  // The panel fades toward its bottom; the gradient spans the path's box, so it
  // stretches with the panel as it opens.
  const fade = doc.createElementNS(SVG_NS, 'linearGradient');
  fade.id = `notch-fade-${uid}`;
  fade.setAttribute('x1', '0');
  fade.setAttribute('y1', '0');
  fade.setAttribute('x2', '0');
  fade.setAttribute('y2', '1');
  for (const s of panelFade(PANEL_FADE_FROM, PANEL_FADE_TO)) {
    const stop = doc.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', s.offset.toFixed(3));
    stop.setAttribute('stop-color', '#000');
    stop.setAttribute('stop-opacity', s.opacity.toFixed(3));
    fade.append(stop);
  }
  panel.setAttribute('class', 'notch-panel');
  const gradient = doc.createElementNS(SVG_NS, 'linearGradient');
  gradient.id = `notice-grad-${uid}`;
  for (const [k, v] of Object.entries({ gradientUnits: 'userSpaceOnUse', x1: '-110', y1: '0', x2: '110', y2: '0', spreadMethod: 'reflect' })) {
    gradient.setAttribute(k, v);
  }
  GLOW_STOPS.forEach((color, i) => {
    const stop = doc.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', String(i / (GLOW_STOPS.length - 1)));
    stop.setAttribute('stop-color', color);
    gradient.append(stop);
  });
  const blur = doc.createElementNS(SVG_NS, 'filter');
  blur.id = `notice-blur-${uid}`;
  for (const [k, v] of Object.entries({ x: '-20%', y: '-50%', width: '140%', height: '300%' })) blur.setAttribute(k, v);
  const gauss = doc.createElementNS(SVG_NS, 'feGaussianBlur');
  gauss.setAttribute('stdDeviation', '3');
  blur.append(gauss);
  // Turns a module's black line icon white for the status, keeping its alpha. An
  // SVG filter: WebKit ignores CSS filter functions on parts of an SVG.
  const white = doc.createElementNS(SVG_NS, 'filter');
  white.id = `notch-white-${uid}`;
  white.setAttribute('color-interpolation-filters', 'sRGB');
  const matrix = doc.createElementNS(SVG_NS, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  matrix.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0');
  white.append(matrix);
  const lampFill = doc.createElementNS(SVG_NS, 'linearGradient');
  lampFill.id = `notch-lamp-${uid}`;
  const lampGlow = doc.createElementNS(SVG_NS, 'filter');
  lampGlow.id = `notch-lamp-glow-${uid}`;
  for (const [k, v] of Object.entries({ x: '-10%', y: '-10%', width: '120%', height: '125%' })) lampGlow.setAttribute(k, v);
  lampGlow.innerHTML = '<feFlood result="c"/><feComposite in="c" in2="SourceAlpha" operator="in" result="s"/>'
    + '<feGaussianBlur in="s" stdDeviation="2" result="near"/><feGaussianBlur in="s" stdDeviation="6" result="far"/>'
    + '<feMerge><feMergeNode in="far"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/></feMerge>';
  // The cover: a lime gradient, under the artwork clipped to the same rounded square.
  const muFill = doc.createElementNS(SVG_NS, 'linearGradient');
  muFill.id = `notch-mu-fill-${uid}`;
  for (const [k, v] of Object.entries({ x1: '0', y1: '0', x2: '1', y2: '1' })) muFill.setAttribute(k, v);
  [ACC, ACC_DEEP].forEach((color, i) => {
    const stop = doc.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', String(i));
    stop.style.setProperty('stop-color', color);
    muFill.append(stop);
  });
  const muClip = doc.createElementNS(SVG_NS, 'clipPath');
  muClip.id = `notch-mu-clip-${uid}`;
  const muClipRect = doc.createElementNS(SVG_NS, 'rect');
  muClip.append(muClipRect);
  defs.append(fade, gradient, blur, white, lampFill, lampGlow, muFill, muClip);
  const glow = doc.createElementNS(SVG_NS, 'g');
  glow.setAttribute('class', 'notice-glow');
  // A missed notice: the Volt accent dot, inside the notch widened to the
  // left, or under the lens on a screen without a notch.
  const dot = doc.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'missed-dot');
  dot.setAttribute('r', '3');
  dot.setAttribute('cx', String(notch ? -notch.width / 2 - MISSED_TAB / 2 + 2 : 0));
  dot.style.setProperty('fill', ACC);
  dot.setAttribute('display', 'none');
  const tab = doc.createElementNS(SVG_NS, 'path');
  tab.setAttribute('class', 'missed-tab');
  tab.setAttribute('display', 'none');
  if (notch) tab.setAttribute('d', notchTabPath(notch, MISSED_TAB));
  // The status: right of the notch, or in a small pill hanging from a lens. Text
  // is set as text, never markup.
  const stShape = doc.createElementNS(SVG_NS, 'path');
  stShape.setAttribute('class', notch ? 'st-tab' : 'st-pill');
  stShape.setAttribute('display', 'none');
  if (notch) stShape.setAttribute('d', notchTabPath(notch, STATUS_TAB, 'right'));
  // The statuses, side by side, rebuilt on each change. Module icons are black
  // line drawings: drawn white through the filter above.
  const stItems = doc.createElementNS(SVG_NS, 'g');
  stItems.setAttribute('class', 'st-items');
  stItems.setAttribute('display', 'none');
  // The music: a tab left of the notch for the cover (the right one is stShape's),
  // then the cover and the bars. The bars move by CSS alone (notch.css), and
  // stop with the group hidden.
  const muTab = doc.createElementNS(SVG_NS, 'path');
  muTab.setAttribute('class', 'mu-tab');
  muTab.setAttribute('display', 'none');
  const mu = doc.createElementNS(SVG_NS, 'g');
  mu.setAttribute('class', 'mu');
  mu.setAttribute('display', 'none');
  const muBg = doc.createElementNS(SVG_NS, 'rect');
  muBg.setAttribute('class', 'mu-art-bg');
  muBg.setAttribute('fill', `url(#${muFill.id})`);
  const muArt = doc.createElementNS(SVG_NS, 'image');
  muArt.setAttribute('class', 'mu-art');
  muArt.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  muArt.setAttribute('clip-path', `url(#${muClip.id})`);
  muArt.setAttribute('display', 'none');
  const muWaves = doc.createElementNS(SVG_NS, 'g');
  muWaves.setAttribute('class', 'mu-waves');
  for (let i = 0; i < BARS; i++) {
    const bar = doc.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('class', 'mu-bar');
    bar.setAttribute('width', String(BAR_W));
    bar.setAttribute('rx', String(BAR_W / 2));
    bar.style.setProperty('fill', ACC);
    bar.style.setProperty('--mu-t', `${BAR_BEATS[i]}s`);
    bar.style.setProperty('--mu-d', `${BAR_DELAYS[i]}s`);
    bar.style.setProperty('--mu-rest', String(BAR_REST[i]));
    muWaves.append(bar);
  }
  mu.append(muBg, muArt, muWaves);
  // Same stacking as the mockups: the lens under the panel, the physical notch over
  // it; the glow just under the panel, so only its rim shows.
  if (notch) svg.append(defs, glow, panel, liquid, tab, muTab, stShape, mu, dot, stItems);
  else svg.append(defs, liquid, glow, panel, stShape, mu, stItems, dot);

  // Styles are set through CSSOM only, never as style="" markup, so the page's CSP
  // needs no inline styles.
  const content = doc.createElement('div');
  content.className = 'notch-content';
  content.style.paddingTop = `${notch ? notch.height + 10 : 18}px`;

  const pill = doc.createElement('div');
  pill.className = 'notch-pill';

  // The ears: an icon on the left, title and detail on the right (notif-v1.html).
  const notice = doc.createElement('div');
  notice.className = 'notch-notice';
  const earL = doc.createElement('div');
  earL.className = 'ear l';
  const earR = doc.createElement('div');
  earR.className = 'ear r';
  const ears = notch
    ? { l: OW / 2 - notch.width / 2 - EAR_W + 14, r: OW / 2 + notch.width / 2 + 12, w: EAR_W - 24, h: notch.height }
    : { l: OW / 2 - NOTICE_PILL.w / 2 + 14, r: OW / 2 - NOTICE_PILL.w / 2 + 44, w: NOTICE_PILL.w - 58, h: NOTICE_PILL.h };
  earL.style.left = `${ears.l}px`;
  earL.style.height = `${ears.h}px`;
  earR.style.left = `${ears.r}px`;
  earR.style.width = `${ears.w}px`;
  earR.style.height = `${ears.h}px`;
  earR.style.lineHeight = `${ears.h}px`;
  notice.append(earL, earR);

  root.append(svg, content, pill, notice);

  let rafId: number | null = null;
  let last: number | null = null;
  let lastRects = '';
  let lastPhase = c.phase;
  let noticeGlow = false;
  let glowA = 0;
  let missed = false;
  let statuses: StatusView[] = [];
  // The music shows while it plays and for MUSIC_LINGER_MS after a pause.
  let musicOn = false;
  let playing = false;
  let art: string | null = null;
  let cancelLinger: (() => void) | null = null;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  });

  // Layout box, not getBoundingClientRect(): the entrance animation scales the pill.
  // offsetLeft ignores the translateX(-50%) that centres it, so subtract half the width.
  function pillRect(): Rect {
    return { x: pill.offsetLeft - pill.offsetWidth / 2, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight };
  }

  // Writes a style only when it changes.
  function setStyle(el: HTMLElement, prop: 'width' | 'top', value: string): void {
    if (el.style[prop] !== value) el.style[prop] = value;
  }

  let panelFill = '';
  let lamp: LampView | null = null;

  function setLamp(next: LampView | null): void {
    lamp = next;
    content.classList.toggle('lamp', next !== null);
    if (!next) {
      panel.removeAttribute('filter');
      kick();
      return;
    }
    // The stops are fractions of the lit panel's width.
    const w = c.panelSize().w;
    const at = (px: number) => Math.min(0.5, px / w);
    const stops: [number, string][] = [
      [0, next.color], [at(LAMP_SOLID), next.color], [at(LAMP_WING), '#fff'],
      [1 - at(LAMP_WING), '#fff'], [1 - at(LAMP_SOLID), next.color], [1, next.color],
    ];
    lampFill.innerHTML = stops.map(([o, col]) => `<stop offset="${o.toFixed(4)}" stop-color="${col}"/>`).join('');
    lampGlow.querySelector('feFlood')!.setAttribute('flood-color', next.glow);
    panel.setAttribute('filter', `url(#${lampGlow.id})`);
    kick();
  }

  function draw(): void {
    const s = c.motion.springs;
    const m = { W: s.W.x, H: s.H.x, s: s.s.x, bx: s.bx.x };
    liquid.setAttribute('d', notch ? notchPath(notch, m) : lensPath(m));
    panel.setAttribute('d', c.panelVisible ? panelPath(s.pw.x, s.ph.x) : '');
    // A notice stays solid beside the physical notch; closing keeps the last fill.
    if (c.phase === 'open' || c.phase === 'notify') {
      const fill = c.phase !== 'open' ? '#000' : lamp ? `url(#${lampFill.id})` : `url(#${fade.id})`;
      if (panelFill !== fill) panel.style.fill = panelFill = fill;
    }
    setStyle(content, 'width', `${c.panelSize().w}px`);
    // Under the panel's final height, like the mockups, so it does not ride the
    // opening bounce; a card change slides it there (CSS transition on top).
    setStyle(pill, 'top', `${c.panelSize().h + 10}px`);
    content.classList.toggle('show', c.contentVisible);
    pill.classList.toggle('show', c.pillVisible);
    notice.classList.toggle('show', c.noticeVisible);
    drawGlow();
    drawDot();
  }

  function drawGlow(): void {
    if (glowA <= 0.02 || !c.panelVisible) {
      if (glow.firstChild) glow.replaceChildren();
      return;
    }
    const d = panelPath(c.motion.springs.pw.x, c.motion.springs.ph.x);
    const rim = (width: string, filter: boolean) => {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', `url(#${gradient.id})`);
      path.setAttribute('stroke-width', width);
      if (filter) path.setAttribute('filter', `url(#${blur.id})`);
      return path;
    };
    glow.setAttribute('opacity', glowA.toFixed(3));
    glow.replaceChildren(rim('5', true), rim('2.2', false));
  }

  // The status and the music show while the notch rests: beside a notch also
  // under the pointer, on a lens only while idle, as the lens grows under the pointer.
  const resting = () => c.phase === 'idle' || (notch !== null && c.phase === 'hover');
  const statusShown = () => statuses.length > 0 && resting();
  const musicShown = () => musicOn && resting();

  // Writes an attribute only when it changes: drawDot runs every frame.
  function setAttr(el: Element, name: string, value: string): void {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  // The cover's (and the wave box's) side.
  const coverSize = () => (notch ? notch.height : PILL_H) - 8;
  const waveHeight = () => Math.max(10, Math.round(coverSize() * 0.6));
  // Beside a notch: the left tab, with room for the missed dot when it shows,
  // and the right one, which holds the statuses after the waves.
  const leftWidth = (withDot: boolean) => MU_IN + coverSize() + MU_OUT + (withDot ? MU_DOT : 0);
  const rightWidth = () => MU_IN + (coverSize() + WAVE_W) / 2
    + (statuses.length > 0 ? ST_SEP + contentWidth() : (coverSize() - WAVE_W) / 2) + MU_OUT;

  function drawDot(): void {
    const idle = c.phase === 'idle';
    const music = musicShown();
    const show = missed && idle ? 'inline' : 'none';
    const side = statusShown() || music ? 'inline' : 'none';
    setAttr(dot, 'display', show);
    setAttr(tab, 'display', music ? 'none' : show);
    setAttr(stShape, 'display', side);
    setAttr(stItems, 'display', statusShown() ? 'inline' : 'none');
    setAttr(mu, 'display', music ? 'inline' : 'none');
    setAttr(muTab, 'display', music && notch ? 'inline' : 'none');
    if (notch) {
      if (music) {
        setAttr(muTab, 'd', notchTabPath(notch, leftWidth(missed && idle)));
        setAttr(dot, 'cx', String(-notch.width / 2 - MU_IN - coverSize() - MU_DOT / 2 - 3));
      } else {
        setAttr(dot, 'cx', String(-notch.width / 2 - MISSED_TAB / 2 + 2));
      }
      setAttr(dot, 'cy', String(notch.height / 2));
    } else if (side === 'inline') {
      // In the pill, left of the text.
      dot.setAttribute('cx', String(-pillHalf() + PILL_PAD + 3));
      dot.setAttribute('cy', String(PILL_H / 2));
    } else {
      dot.setAttribute('cx', '0');
      dot.setAttribute('cy', String(c.config.thickness + 5));
    }
  }

  // The lens's pill: the music (cover, gap, waves), then the statuses.
  const musicWidth = () => coverSize() + MU_GAP + WAVE_W;
  const pillContent = () => (musicOn
    ? musicWidth() + (statuses.length > 0 ? ST_SEP + contentWidth() : 0)
    : contentWidth());

  function pillHalf(): number {
    return (2 * PILL_PAD + pillContent() + (missed ? PILL_DOT : 0)) / 2;
  }

  // How far the music's hit area reaches: the tabs beside a notch, with the
  // dot's room so it does not shrink under the pointer; the pill on a lens.
  function beside(): Beside | null {
    if (!musicOn) return null;
    if (notch) return { left: leftWidth(missed), right: rightWidth() };
    return { left: pillHalf(), right: pillHalf() };
  }

  // The cover at (x, y), and the bars in a box from x2, centred on cy.
  function placeMusic(x: number, y: number, x2: number, cy: number): void {
    const size = coverSize();
    const box = { x, y, width: size, height: size, rx: size >= 20 ? 5 : 4 };
    for (const el of [muBg, muClipRect, muArt]) {
      for (const [k, v] of Object.entries(box)) el.setAttribute(k, String(v));
    }
    muArt.removeAttribute('rx');
    const h = waveHeight();
    [...muWaves.children].forEach((bar, i) => {
      bar.setAttribute('x', String(x2 + i * (BAR_W + BAR_GAP)));
      bar.setAttribute('y', String(cy - h / 2));
      bar.setAttribute('height', String(h));
    });
  }

  function drawArt(): void {
    if (art) {
      setAttr(muArt, 'href', art);
      setAttr(muArt, 'display', 'inline');
    } else {
      muArt.removeAttribute('href');
      setAttr(muArt, 'display', 'none');
    }
    muWaves.classList.toggle('paused', !playing);
  }

  // An empty status is the icon alone (Keyboard Cleaning Mode): no gap after it.
  const iconRoom = (s: StatusView) => (s.icon ? ST_ICON + (s.text ? ST_GAP : 0) : 0);
  const itemWidth = (s: StatusView) => PILL_CHAR * s.text.length + iconRoom(s);
  const contentWidth = () =>
    statuses.reduce((w, s) => w + itemWidth(s), 0) + ST_SEP * Math.max(0, statuses.length - 1);

  function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
    const e = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  }

  // One status at x (its left edge): the icon, then the text (Inter with tabular
  // digits, set in notch.css: PILL_CHAR a character at most). Text is set as text, never markup.
  function drawItem(s: StatusView, x: number, cy: number): SVGElement[] {
    const out: SVGElement[] = [];
    if (s.icon) {
      const icon = svgEl('image', {
        class: 'st-icon', x, y: cy - ST_ICON / 2, width: ST_ICON, height: ST_ICON, filter: `url(#${white.id})`,
      });
      icon.setAttribute('href', s.icon);
      out.push(icon);
    }
    const text = svgEl('text', {
      class: 'st-text', x: x + iconRoom(s), y: cy + 4, 'text-anchor': 'start', fill: '#F3F5F0',
    });
    text.textContent = s.text;
    out.push(text);
    return out;
  }

  // A thin vertical line, 12 px tall, centred in the gap at x.
  function drawSep(x: number, cy: number): SVGElement {
    const g = svgEl('g', { class: 'st-sep' });
    g.append(svgEl('line', { x1: x, x2: x, y1: cy - 6, y2: cy + 6, stroke: 'rgba(255,255,255,.2)', 'stroke-width': 1 }));
    return g;
  }

  // Lays the statuses out left to right from x: beside a notch they end 8 px
  // inside the tab, which grows past STATUS_TAB only when they need it; on a lens
  // the pill fits the dot, the icons and the texts. With music they follow the
  // waves, after a separator.
  function layoutStatus(): void {
    stItems.replaceChildren();
    if (statuses.length === 0 && !musicOn) return;
    let x: number;
    let cy: number;
    if (notch && musicOn) {
      const size = coverSize();
      cy = notch.height / 2;
      const bars = notch.width / 2 + MU_IN + (size - WAVE_W) / 2;
      placeMusic(-notch.width / 2 - MU_IN - size, (notch.height - size) / 2, bars, cy);
      stShape.setAttribute('d', notchTabPath(notch, rightWidth(), 'right'));
      x = bars + WAVE_W;
    } else if (notch) {
      const width = Math.max(STATUS_TAB, contentWidth() + 16);
      stShape.setAttribute('d', notchTabPath(notch, width, 'right'));
      x = notch.width / 2 + width - 8 - contentWidth();
      cy = notch.height / 2;
    } else {
      const half = pillHalf();
      stShape.setAttribute('d', topPillPath(half, PILL_H));
      x = -half + PILL_PAD + (missed ? PILL_DOT : 0);
      cy = PILL_H / 2;
      if (musicOn) {
        placeMusic(x, (PILL_H - coverSize()) / 2, x + coverSize() + MU_GAP, cy);
        x += musicWidth();
      }
    }
    statuses.forEach((s, i) => {
      if (i > 0 || musicOn) {
        stItems.append(drawSep(x + ST_SEP / 2, cy));
        x += ST_SEP;
      }
      stItems.append(...drawItem(s, x, cy));
      x += itemWidth(s);
    });
  }

  function setPill(items: PillItem[], active: string | null, moreLabel: string): void {
    const icons = items.map(item => {
      const ic = doc.createElement('span');
      ic.className = ['ic', item.id === active ? 'on' : '', item.missed ? 'missed' : ''].filter(Boolean).join(' ');
      ic.dataset.id = item.id;
      ic.setAttribute('role', 'button');
      ic.setAttribute('aria-label', item.label);
      ic.innerHTML = item.svg;
      return ic;
    });
    const more = doc.createElement('span');
    more.className = 'ic more';
    more.setAttribute('role', 'button');
    more.setAttribute('aria-label', moreLabel);
    more.innerHTML = MORE_ICON;
    icons.push(more);
    icons.forEach((ic, i) => { ic.style.animationDelay = `${0.06 + i * 0.045}s`; });
    pill.replaceChildren(...icons);
  }

  function setNotice(n: NoticeView | null): void {
    noticeGlow = n?.glow ?? false;
    if (!n) {
      earL.replaceChildren();
      earR.replaceChildren();
      return;
    }
    if (n.icon) {
      const glyph = doc.createElement('i');
      glyph.className = 'glyph';
      glyph.style.setProperty('--icon', `url("${n.icon}")`);
      earL.replaceChildren(glyph);
    } else {
      earL.innerHTML = BELL_ICON;
    }
    const t1 = doc.createElement('span');
    t1.className = 't1';
    t1.textContent = n.title;
    const t2 = doc.createElement('span');
    t2.className = 't2';
    t2.textContent = n.detail;
    earR.replaceChildren(t1, t2);
  }

  function setMissed(on: boolean): void {
    missed = on;
    layoutStatus();
    drawDot();
  }

  function showMusic(on: boolean): void {
    musicOn = on;
    layoutStatus();
    drawArt();
    drawDot();
    kick();
  }

  // Shows the music at once while it plays; a pause hides it MUSIC_LINGER_MS
  // later, nothing left to play (the package off) at once.
  function setMedia(m: MediaView | null): void {
    playing = m?.playing ?? false;
    const something = m !== null && (m.playing || m.title !== null || m.art !== null);
    if (playing || !something) {
      cancelLinger?.();
      cancelLinger = null;
    }
    if (playing) {
      art = m!.art;
      if (musicOn) {
        drawArt();
      } else {
        showMusic(true);
      }
    } else if (!something) {
      if (musicOn) showMusic(false);
    } else if (musicOn) {
      art = m!.art;
      drawArt();
      cancelLinger ??= setTimer(() => {
        cancelLinger = null;
        showMusic(false);
      }, MUSIC_LINGER_MS);
    }
  }

  // Changes the SVG and asks for one frame; nothing runs while the status rests.
  function setStatus(items: StatusView[]): void {
    statuses = items;
    layoutStatus();
    drawDot();
    kick();
  }

  function onPillClick(e: MouseEvent): void {
    const ic = (e.target as Element | null)?.closest<HTMLElement>('.ic');
    if (ic?.dataset.id) deps.onSelect(ic.dataset.id);
    else if (ic?.classList.contains('more')) deps.onMore();
  }

  function report(): void {
    const rects = hitRects(c, c.pillVisible ? pillRect() : null, beside()).map(r => ({
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h),
    }));
    const key = JSON.stringify(rects);
    if (key !== lastRects) {
      lastRects = key;
      deps.onHitRects(rects);
    }
    if (c.phase !== lastPhase) {
      lastPhase = c.phase;
      deps.onPhase(c.phase);
    }
  }

  function tick(now: number): void {
    const dt = last === null ? 1 / 60 : (now - last) / 1000;
    last = now;
    c.frame(dt);
    const want = c.phase === 'notify' && noticeGlow ? 1 : 0;
    glowA += (want - glowA) * Math.min(1, dt * 6);
    gradient.setAttribute('gradientTransform', `translate(${((now / 1000) * 110) % 440} 0)`);
    draw();
    report();
    // The glow fades on after the notch has come to rest.
    if (c.needsFrames() || glowA > 0.02) {
      rafId = deps.raf(tick);
    } else {
      rafId = null;
      last = null;
    }
  }

  function kick(): void {
    if (rafId === null) rafId = deps.raf(tick);
  }

  function onClick(e: MouseEvent): void {
    if (c.phase === 'open') return;
    const box = root.getBoundingClientRect();
    if (containsPoint(hitRects(c, null, beside()), e.clientX - box.left, e.clientY - box.top)) {
      c.click();
      kick();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      c.escape();
      kick();
    } else if (e.metaKey && e.key.toLowerCase() === 'q' && c.phase === 'open') {
      e.preventDefault();
      deps.onQuit();
    }
  }

  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);
  pill.addEventListener('click', onPillClick);
  draw();

  return {
    kick,
    content,
    setPill,
    setNotice,
    setMissed,
    setStatus,
    setLamp,
    setMedia,
    destroy(): void {
      cancelLinger?.();
      cancelLinger = null;
      if (rafId !== null) deps.caf(rafId);
      rafId = null;
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKey);
      svg.remove();
      content.remove();
      pill.remove();
      notice.remove();
    },
  };
}

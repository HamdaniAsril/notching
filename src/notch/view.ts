import { EAR_W, NOTICE_PILL, type NotchController, type Phase } from './controller';
import { containsPoint, OVERLAY_SIZE, type Rect, hitRects } from './hit';
import { lensPath, notchPath, notchTabPath, panelFade, panelPath, topPillPath } from './shape';

export interface ViewDeps {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void; // only when the rects change (rounded to 1 px)
  onPhase: (p: Phase) => void; // only when the phase changes
  onQuit: () => void; // Cmd+Q while the panel is open
  onSelect: (id: string) => void; // a page icon in the pill was clicked
  onMore: () => void; // the ⋯ icon was clicked
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

export interface NotchView {
  kick(): void;
  destroy(): void;
  readonly content: HTMLElement; // holds the card
  setPill(items: PillItem[], active: string | null, moreLabel: string): void;
  setNotice(n: NoticeView | null): void;
  setMissed(on: boolean): void; // the dot under the notch while idle
  setStatus(text: string | null, icon?: string | null): void; // beside the notch, or in a pill on a lens; icon: the module's icon URL
  setLamp(lamp: LampView | null): void; // Cermin's lamp; null: the usual panel
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
  defs.append(fade, gradient, blur, white, lampFill, lampGlow);
  const glow = doc.createElementNS(SVG_NS, 'g');
  glow.setAttribute('class', 'notice-glow');
  // A missed notice: the accent red dot (spec 5), inside the notch widened to the
  // left, or under the lens on a screen without a notch.
  const dot = doc.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'missed-dot');
  dot.setAttribute('r', '3');
  dot.setAttribute('cx', String(notch ? -notch.width / 2 - MISSED_TAB / 2 + 2 : 0));
  dot.setAttribute('fill', '#E8262E');
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
  const stText = doc.createElementNS(SVG_NS, 'text');
  stText.setAttribute('class', 'st-text');
  stText.setAttribute('display', 'none');
  for (const [k, v] of Object.entries({
    fill: '#fff', 'font-family': '"Space Mono", ui-monospace, monospace', 'font-size': '11', 'letter-spacing': '0.6',
  })) stText.setAttribute(k, v);
  // Module icons are black line drawings: drawn white through the filter above.
  const stIcon = doc.createElementNS(SVG_NS, 'image');
  stIcon.setAttribute('class', 'st-icon');
  stIcon.setAttribute('display', 'none');
  stIcon.setAttribute('width', String(ST_ICON));
  stIcon.setAttribute('height', String(ST_ICON));
  stIcon.setAttribute('filter', `url(#${white.id})`);
  if (notch) {
    stText.setAttribute('text-anchor', 'end');
    stText.setAttribute('x', String(notch.width / 2 + STATUS_TAB - 8));
    stText.setAttribute('y', String(notch.height / 2 + 4));
  } else {
    stText.setAttribute('text-anchor', 'middle');
    stText.setAttribute('y', '15');
  }
  // Same stacking as the mockups: the lens under the panel, the physical notch over
  // it; the glow just under the panel, so only its rim shows.
  if (notch) svg.append(defs, glow, panel, liquid, tab, dot, stShape, stText, stIcon);
  else svg.append(defs, liquid, glow, panel, stShape, stText, stIcon, dot);

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
  let status: string | null = null;
  let statusIcon: string | null = null;

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

  // The status shows while the notch rests: beside a notch also under the
  // pointer, on a lens only while idle, as the lens grows under the pointer.
  function statusShown(): boolean {
    return status !== null && (c.phase === 'idle' || (notch !== null && c.phase === 'hover'));
  }

  function drawDot(): void {
    const show = missed && c.phase === 'idle' ? 'inline' : 'none';
    const st = statusShown() ? 'inline' : 'none';
    dot.setAttribute('display', show);
    tab.setAttribute('display', show);
    stShape.setAttribute('display', st);
    stText.setAttribute('display', st);
    stIcon.setAttribute('display', statusIcon ? st : 'none');
    if (notch) {
      dot.setAttribute('cy', String(notch.height / 2));
    } else if (st === 'inline') {
      // In the pill, left of the text.
      dot.setAttribute('cx', String(-pillHalf() + PILL_PAD + 3));
      dot.setAttribute('cy', String(PILL_H / 2));
    } else {
      dot.setAttribute('cx', '0');
      dot.setAttribute('cy', String(c.config.thickness + 5));
    }
  }

  function pillHalf(): number {
    return (2 * PILL_PAD + PILL_CHAR * (status ?? '').length + (missed ? PILL_DOT : 0) + iconRoom()) / 2;
  }

  // An empty status is the icon alone (Keyboard Cleaning Mode): no gap after it.
  function iconRoom(): number {
    return statusIcon ? ST_ICON + (status ? ST_GAP : 0) : 0;
  }

  // Lays the lens pill out for the dot, the icon and the text; the notch tab never
  // changes, and the icon follows the right-aligned text (monospace: PILL_CHAR a character).
  function layoutStatus(): void {
    stText.textContent = status ?? '';
    if (statusIcon) stIcon.setAttribute('href', statusIcon);
    if (status === null) return;
    if (notch) {
      const end = notch.width / 2 + STATUS_TAB - 8;
      stIcon.setAttribute('x', String(end - PILL_CHAR * status.length - iconRoom()));
      stIcon.setAttribute('y', String(notch.height / 2 - ST_ICON / 2));
      return;
    }
    const half = pillHalf();
    stShape.setAttribute('d', topPillPath(half, PILL_H));
    const left = -half + PILL_PAD + (missed ? PILL_DOT : 0);
    stIcon.setAttribute('x', String(left));
    stIcon.setAttribute('y', String((PILL_H - ST_ICON) / 2));
    stText.setAttribute('x', String((left + iconRoom() + half - PILL_PAD) / 2));
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

  // Changes the SVG and asks for one frame; nothing runs while the status rests.
  function setStatus(text: string | null, icon: string | null = null): void {
    status = text;
    statusIcon = text === null ? null : icon;
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
    const rects = hitRects(c, c.pillVisible ? pillRect() : null).map(r => ({
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
    if (containsPoint(hitRects(c, null), e.clientX - box.left, e.clientY - box.top)) {
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
    destroy(): void {
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

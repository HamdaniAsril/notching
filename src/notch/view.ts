import type { NotchController, Phase } from './controller';
import { containsPoint, OVERLAY_SIZE, type Rect, hitRects } from './hit';
import { lensPath, notchPath, panelPath } from './shape';

export interface ViewDeps {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void; // only when the rects change (rounded to 1 px)
  onPhase: (p: Phase) => void; // only when the phase changes
  onQuit: () => void; // Cmd+Q while the panel is open
  onSelect: (id: string) => void; // a module icon in the pill was clicked
}

// One module icon in the pill; `icon` is the URL of its SVG, drawn as a mask.
export interface PillItem {
  id: string;
  label: string;
  icon: string;
}

export interface NotchView {
  kick(): void;
  destroy(): void;
  readonly content: HTMLElement; // holds the card
  setPill(items: PillItem[], active: string | null, moreLabel: string): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Line icons from beranda-nothing.html.
const ICON = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const MORE_ICON = ICON('<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>');

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
  // Same stacking as the mockups: the lens under the panel, the physical notch over it.
  if (notch) svg.append(panel, liquid);
  else svg.append(liquid, panel);

  // Styles are set through CSSOM only, never as style="" markup, so the page's CSP
  // needs no inline styles.
  const content = doc.createElement('div');
  content.className = 'notch-content';
  content.style.paddingTop = `${notch ? notch.height + 10 : 18}px`;

  const pill = doc.createElement('div');
  pill.className = 'notch-pill';

  root.append(svg, content, pill);

  let rafId: number | null = null;
  let last: number | null = null;
  let lastRects = '';
  let lastPhase = c.phase;

  // Layout box, not getBoundingClientRect(): the entrance animation scales the pill.
  // offsetLeft ignores the translateX(-50%) that centres it, so subtract half the width.
  function pillRect(): Rect {
    return { x: pill.offsetLeft - pill.offsetWidth / 2, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight };
  }

  // Writes a style only when it changes.
  function setStyle(el: HTMLElement, prop: 'width' | 'top', value: string): void {
    if (el.style[prop] !== value) el.style[prop] = value;
  }

  function draw(): void {
    const s = c.motion.springs;
    const m = { W: s.W.x, H: s.H.x, s: s.s.x, bx: s.bx.x };
    liquid.setAttribute('d', notch ? notchPath(notch, m) : lensPath(m));
    panel.setAttribute('d', c.panelVisible ? panelPath(s.pw.x, s.ph.x) : '');
    setStyle(content, 'width', `${c.panelSize().w}px`);
    // The pill rides the panel's live height, so it follows a card change.
    if (c.panelVisible) setStyle(pill, 'top', `${Math.round(s.ph.x) + 10}px`);
    content.classList.toggle('show', c.contentVisible);
    pill.classList.toggle('show', c.pillVisible);
  }

  function setPill(items: PillItem[], active: string | null, moreLabel: string): void {
    const icons = items.map(item => {
      const ic = doc.createElement('span');
      ic.className = item.id === active ? 'ic on' : 'ic';
      ic.dataset.id = item.id;
      ic.setAttribute('role', 'button');
      ic.setAttribute('aria-label', item.label);
      const glyph = doc.createElement('i');
      glyph.className = 'glyph';
      glyph.style.setProperty('--icon', `url("${item.icon}")`);
      ic.append(glyph);
      return ic;
    });
    const more = doc.createElement('span');
    more.className = 'ic';
    more.setAttribute('role', 'button');
    more.setAttribute('aria-label', moreLabel);
    more.innerHTML = MORE_ICON;
    icons.push(more);
    icons.forEach((ic, i) => { ic.style.animationDelay = `${0.06 + i * 0.045}s`; });
    pill.replaceChildren(...icons);
  }

  function onPillClick(e: MouseEvent): void {
    const ic = (e.target as Element | null)?.closest<HTMLElement>('.ic[data-id]');
    if (ic?.dataset.id) deps.onSelect(ic.dataset.id);
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
    draw();
    report();
    if (c.needsFrames()) {
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
    destroy(): void {
      if (rafId !== null) deps.caf(rafId);
      rafId = null;
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKey);
      svg.remove();
      content.remove();
      pill.remove();
    },
  };
}

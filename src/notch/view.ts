import type { NotchController, Phase } from './controller';
import { OVERLAY_SIZE, type Rect, hitRects } from './hit';
import { lensPath, notchPath, panelPath } from './shape';

export interface ViewDeps {
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  onHitRects: (rects: Rect[]) => void; // only when the rects change (rounded to 1 px)
  onPhase: (p: Phase) => void; // only when the phase changes
  onQuit: () => void; // Cmd+Q while the panel is open
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Line icons from beranda-nothing.html.
const ICON = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const PILL_ICONS = [
  { key: 'home', d: '<path d="M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>' },
  { key: 'more', d: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>' },
];

export function mountNotch(root: HTMLElement, c: NotchController, deps: ViewDeps): { kick(): void; destroy(): void } {
  const doc = root.ownerDocument;
  const { w: OW, h: OH } = OVERLAY_SIZE;
  const notch = c.notch;
  const panelSize = c.panelSize();

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

  const content = doc.createElement('div');
  content.className = 'notch-content';
  content.style.width = `${panelSize.w}px`;
  content.style.paddingTop = `${notch ? notch.height + 10 : 18}px`;
  content.innerHTML = '<div class="card"><div class="big">Notching</div><div class="m">Kartu Beranda menyusul.</div></div>';

  const pill = doc.createElement('div');
  pill.className = 'notch-pill';
  pill.style.top = `${panelSize.h + 10}px`;
  pill.innerHTML = PILL_ICONS.map(({ key, d }, i) =>
    `<span class="ic${key === 'home' ? ' on' : ''}" style="animation-delay:${0.06 + i * 0.045}s">${ICON(d)}</span>`).join('');

  root.append(svg, content, pill);

  let rafId: number | null = null;
  let last: number | null = null;
  let lastRects = '';
  let lastPhase = c.phase;

  function pillRect(): Rect {
    return { x: pill.offsetLeft, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight };
  }

  function draw(): void {
    const s = c.motion.springs;
    const m = { W: s.W.x, H: s.H.x, s: s.s.x, bx: s.bx.x };
    liquid.setAttribute('d', notch ? notchPath(notch, m) : lensPath(m));
    panel.setAttribute('d', c.panelVisible ? panelPath(s.pw.x, s.ph.x) : '');
    content.classList.toggle('show', c.contentVisible);
    pill.classList.toggle('show', c.pillVisible);
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

  function inside(rects: Rect[], x: number, y: number): boolean {
    return rects.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  function onClick(e: MouseEvent): void {
    if (c.phase === 'open') return;
    const box = root.getBoundingClientRect();
    if (inside(hitRects(c, null), e.clientX - box.left, e.clientY - box.top)) {
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
  draw();

  return {
    kick,
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

import type { NotchConfig } from './config';
import { NotchMotion, type Targets, timeScale } from './motion';
import type { NotchSize } from './shape';

export type Phase = 'idle' | 'hover' | 'open' | 'closing';

export interface CardSize {
  width: number;
  height: number;
}

export const PLACEHOLDER_CARD: CardSize = { width: 400, height: 90 };

export interface ControllerDeps {
  notch: NotchSize | null;
  config: NotchConfig;
  card: CardSize;
  setTimer: (fn: () => void, ms: number) => () => void;
}

// Pill delay at speed 100 (spec 4.2); divided by the time scale.
const PILL_DELAY_MS = 320;

// Notch state machine. Targets follow setTargets() in full-flow-v3.html (no notch)
// and full-flow-notch.html (notch, idle "tak terlihat").
export class NotchController {
  readonly motion: NotchMotion;
  private readonly deps: ControllerDeps;
  private _phase: Phase = 'idle';
  private hover = false;
  private cursorX = 0;
  private _panelVisible = false;
  private _contentVisible = false;
  private _pillVisible = false;
  private cancelPill: (() => void) | null = null;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.motion = new NotchMotion(this.targets());
  }

  get phase(): Phase { return this._phase; }
  get pillVisible(): boolean { return this._pillVisible; }
  get contentVisible(): boolean { return this._contentVisible; }
  get panelVisible(): boolean { return this._panelVisible; }
  get notch(): NotchSize | null { return this.deps.notch; }
  get config(): NotchConfig { return this.deps.config; }

  pointer(inside: boolean, cursorX: number): void {
    this.hover = inside;
    this.cursorX = cursorX;
    if (this._phase === 'idle' || this._phase === 'hover') this._phase = inside ? 'hover' : 'idle';
  }

  click(): void {
    if (this._phase === 'open') return;
    // Reopening a panel that is still closing keeps its current size instead of
    // snapping back to the notch.
    if (!this._panelVisible) {
      const { pw, ph, W, H } = this.motion.springs;
      const notch = this.deps.notch;
      if (notch) {
        pw.x = notch.width;
        ph.x = notch.height + Math.max(0, H.x);
      } else {
        pw.x = Math.max(16, W.x * 0.9);
        ph.x = Math.max(8, H.x);
      }
      pw.v = 0;
      ph.v = 60;
    }
    this._panelVisible = true;
    this._phase = 'open';
  }

  escape(): void {
    if (this._phase === 'open') this.close();
  }

  resignKey(): void {
    if (this._phase === 'open') this.close();
  }

  frame(frameSeconds: number): void {
    this.motion.setTargets(this.targets());
    this.motion.advance(frameSeconds, this.deps.config);

    const { pw, ph } = this.motion.springs;
    const notch = this.deps.notch;
    if (this._phase === 'closing') {
      const done = notch
        ? pw.x < notch.width + 4 && ph.x < notch.height + 4
        : pw.x < 8 && ph.x < 8;
      if (done) {
        this._panelVisible = false;
        this._phase = this.hover ? 'hover' : 'idle';
      }
    }

    const size = this.panelSize();
    const near = this._phase === 'open' && Math.abs(pw.x - size.w) < 40 && Math.abs(ph.x - size.h) < 20;
    this._contentVisible = near;
    if (near && !this._pillVisible && !this.cancelPill) {
      this.cancelPill = this.deps.setTimer(() => {
        this.cancelPill = null;
        if (this._phase === 'open') this._pillVisible = true;
      }, PILL_DELAY_MS / timeScale(this.deps.config.speed));
    }
  }

  targets(): Targets {
    const { notch, config } = this.deps;
    const d = config.dropDepth;
    const breathe = 1 + 0.035 * Math.sin(this.motion ? this.motion.t * 2.2 : 0);
    const bias = (limit: number) => Math.max(-limit, Math.min(limit, this.cursorX * 0.08));
    const open = this._phase === 'open';

    if (notch) {
      if (open) {
        const size = this.panelSize();
        return { W: 70, H: 0, s: 0, bx: 0, pw: size.w, ph: size.h };
      }
      // NW * 4 / 5 rather than NW * 0.8 keeps the value exact in floating point.
      const panel = { pw: (notch.width * 4) / 5, ph: (notch.height * 4) / 5 };
      if (this.hover) return { W: 44 - Math.min(16, d * 0.6), H: d * breathe, s: 1, bx: bias(8), ...panel };
      return { W: 70, H: 0, s: 0, bx: 0, ...panel };
    }

    const T = config.thickness;
    if (open) {
      const size = this.panelSize();
      return { W: 42, H: T, s: 0, bx: 0, pw: size.w, ph: size.h };
    }
    if (this.hover) return { W: 42 - Math.min(16, d * 0.6), H: (T + d) * breathe, s: 1, bx: bias(6), pw: 0, ph: 0 };
    return { W: 42, H: T, s: 0, bx: 0, pw: 0, ph: 0 };
  }

  panelSize(): { w: number; h: number } {
    const { notch, card } = this.deps;
    const top = notch ? notch.height + 10 : 18;
    return { w: card.width, h: top + card.height + 16 };
  }

  // The frame loop may stop only when nothing moves: idle at rest, or open at rest
  // with the pill already shown. Hover keeps running for the breathing droplet.
  needsFrames(): boolean {
    if (this._phase === 'hover' || this._phase === 'closing') return true;
    if (this.cancelPill) return true;
    return !this.motion.atRest();
  }

  private close(): void {
    this.cancelPill?.();
    this.cancelPill = null;
    this._pillVisible = false;
    this._contentVisible = false;
    this.hover = false;
    this._phase = 'closing';
  }
}

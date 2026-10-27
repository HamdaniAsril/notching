// Shapes ported unchanged from the mockups:
// - liquidDepth/lensPath/panelPath: full-flow-v3.html lines 152–175
// - notchPath: full-flow-notch.html lines 171–186

export interface Liquid {
  W: number;
  H: number;
  s: number;
  bx: number;
}

export interface NotchSize {
  width: number;
  height: number;
}

const q = (v: number) => v.toFixed(2);

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

// Depth of the liquid below the top edge at x: a blend of the lens profile (s = 0)
// and the bead profile (s = 1), with its deepest point pulled toward bx.
export function liquidDepth(x: number, m: Liquid, minH: number): number {
  const W = m.W;
  const c = Math.max(-W * 0.5, Math.min(W * 0.5, m.bx));
  const u = x < c ? (c - x) / (W + c) : (x - c) / (W - c);
  if (u >= 1) return 0;
  const lens = 1 - smooth(0.24, 1, u);
  const bead = Math.pow(1 - u * u, 2.4);
  const s = Math.min(1, Math.max(0, m.s));
  return Math.max(minH, m.H) * ((1 - s) * lens + s * bead);
}

export function lensPath(m: Liquid): string {
  const W = m.W;
  const N = 90;
  let d = `M ${q(-W)} 0`;
  for (let i = 1; i < N; i++) {
    const x = -W + (2 * W * i) / N;
    d += ` L ${q(x)} ${q(liquidDepth(x, m, 0.5))}`;
  }
  return d + ` L ${q(W)} 0 Z`;
}

// Physical notch plus the liquid hanging below it, as one shape.
export function notchPath(notch: NotchSize, m: Liquid): string {
  const hw = notch.width / 2;
  const NH = notch.height;
  const fl = 6;
  const NR = 10;
  let d = `M ${q(-hw - fl)} 0 Q ${q(-hw)} 0 ${q(-hw)} ${q(fl)} L ${q(-hw)} ${q(NH - NR)} Q ${q(-hw)} ${q(NH)} ${q(-hw + NR)} ${q(NH)}`;
  const x0 = -hw + NR;
  const x1 = hw - NR;
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    d += ` L ${q(x)} ${q(NH + liquidDepth(x, m, 0))}`;
  }
  return d + ` Q ${q(hw)} ${q(NH)} ${q(hw)} ${q(NH - NR)} L ${q(hw)} ${q(fl)} Q ${q(hw)} 0 ${q(hw + fl)} 0 Z`;
}

// Symmetric panel with rounded bottom corners and top corners flaring outward.
export function panelPath(pw: number, ph: number): string {
  const w = Math.max(0, pw) / 2;
  const h = Math.max(0, ph);
  const R = Math.min(28, w, h * 0.5);
  const fl = Math.min(12, w * 0.3);
  return `M ${q(-w - fl)} 0 Q ${q(-w)} 0 ${q(-w)} ${q(fl)} L ${q(-w)} ${q(h - R)} Q ${q(-w)} ${q(h)} ${q(-w + R)} ${q(h)} ` +
    `L ${q(w - R)} ${q(h)} Q ${q(w)} ${q(h)} ${q(w)} ${q(h - R)} L ${q(w)} ${q(fl)} Q ${q(w)} 0 ${q(w + fl)} 0 Z`;
}

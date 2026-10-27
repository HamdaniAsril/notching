export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
}

export function spring(x: number, k: number, c: number): Spring {
  return { x, v: 0, t: x, k, c };
}

// Semi-implicit Euler, as in the mockups.
export function stepSpring(s: Spring, dt: number, dampingScale: number): void {
  s.v += (s.k * (s.t - s.x) - s.c * dampingScale * s.v) * dt;
  s.x += s.v * dt;
}

export function springAtRest(s: Spring): boolean {
  return Math.abs(s.t - s.x) < 0.05 && Math.abs(s.v) < 0.05;
}

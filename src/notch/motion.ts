import type { NotchConfig } from './config';
import { type Spring, spring, springAtRest, stepSpring } from './spring';

export type SpringKey = 'W' | 'H' | 's' | 'bx' | 'pw' | 'ph';
export type Targets = Record<SpringKey, number>;

// Stiffness and damping from spec 4.3, tuned with the user in the mockups.
export const SPRING_CONSTANTS: Record<SpringKey, { k: number; c: number }> = {
  W: { k: 110, c: 13 },
  H: { k: 80, c: 6 },
  s: { k: 90, c: 14 },
  bx: { k: 60, c: 9 },
  pw: { k: 170, c: 18.5 },
  ph: { k: 150, c: 17.5 },
};

export const SUBSTEPS = 6;
export const MAX_FRAME_DT = 0.05;

const KEYS = Object.keys(SPRING_CONSTANTS) as SpringKey[];
const PANEL_KEYS: ReadonlySet<SpringKey> = new Set(['pw', 'ph']);

export function dropletDamping(bounce: number): number {
  return 1.7 - (bounce / 100) * 1.3;
}

export function timeScale(speed: number): number {
  return speed / 100;
}

export class NotchMotion {
  springs: Record<SpringKey, Spring>;
  t = 0;

  constructor(start: Targets) {
    this.springs = {} as Record<SpringKey, Spring>;
    for (const key of KEYS) {
      const { k, c } = SPRING_CONSTANTS[key];
      this.springs[key] = spring(start[key], k, c);
    }
  }

  setTargets(t: Targets): void {
    for (const key of KEYS) this.springs[key].t = t[key];
  }

  advance(frameSeconds: number, config: NotchConfig): number {
    const dt = Math.min(MAX_FRAME_DT, frameSeconds) * timeScale(config.speed);
    this.t += dt;
    const droplet = dropletDamping(config.bounce);
    for (let i = 0; i < SUBSTEPS; i++) {
      for (const key of KEYS) {
        stepSpring(this.springs[key], dt / SUBSTEPS, PANEL_KEYS.has(key) ? 1 : droplet);
      }
    }
    return dt;
  }

  atRest(): boolean {
    return KEYS.every(key => springAtRest(this.springs[key]));
  }
}

import { expect, test } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { NotchMotion, type Targets, dropletDamping, timeScale } from './motion';

const rest = (): Targets => ({ W: 42, H: 4, s: 0, bx: 0, pw: 0, ph: 0 });

// Panel opens from 0 to 400 × 124 at speed 100; returns the panel size after each frame.
function simulateOpen(bounce: number): { pw: number; ph: number }[] {
  const m = new NotchMotion(rest());
  m.setTargets({ ...rest(), pw: 400, ph: 124 });
  const out: { pw: number; ph: number }[] = [];
  for (let i = 0; i < 120; i++) {
    m.advance(1 / 60, { ...DEFAULT_CONFIG, bounce, speed: 100 });
    out.push({ pw: m.springs.pw.x, ph: m.springs.ph.x });
  }
  return out;
}

test('droplet damping follows 1.7 − bounce/100 × 1.3', () => {
  expect(dropletDamping(100)).toBeCloseTo(0.4);
  expect(dropletDamping(0)).toBeCloseTo(1.7);
});

test('time scale is speed / 100', () => expect(timeScale(200)).toBe(2));

test('frame dt is capped at 0.05 s before scaling', () => {
  const m = new NotchMotion(rest());
  expect(m.advance(1.0, { ...DEFAULT_CONFIG, speed: 100 })).toBeCloseTo(0.05);
});

test('panel springs ignore the bounce slider', () => {
  expect(simulateOpen(0)).toEqual(simulateOpen(100));
});

test('panel overshoot stays small, like the mockup', () => {
  const peak = Math.max(...simulateOpen(100).map(f => f.pw));
  expect(peak / 400).toBeGreaterThan(1.02);
  expect(peak / 400).toBeLessThan(1.06);
});

test('motion comes to rest', () => {
  const m = new NotchMotion(rest());
  m.setTargets({ ...rest(), pw: 400, ph: 124 });
  for (let i = 0; i < 300; i++) m.advance(1 / 60, DEFAULT_CONFIG);
  expect(m.atRest()).toBe(true);
});

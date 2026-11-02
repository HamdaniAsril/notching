// The moon from the mean synodic month, counted from a known new moon. Good to about a day,
// which is all a whole percent and "in n days" need.
export const SYNODIC_DAYS = 29.530588853;
// New moon on 2000-01-06 18:14 UTC.
const REFERENCE_NEW_MOON = 947182440000;
const DAY_MS = 86_400_000;

export type MoonPhase = 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full';

export interface MoonInfo {
  age: number;
  lit: number; // whole percent of the disk that is lit
  waxing: boolean;
  phase: MoonPhase;
  toFull: number; // whole days, 0 while the moon is full
  toNew: number; // whole days, 0 while the moon is new
}

// Days since the last new moon, in [0, 29.53).
export function moonAge(ms: number): number {
  const d = (ms - REFERENCE_NEW_MOON) / DAY_MS;
  return ((d % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

function phaseOf(lit: number): MoonPhase {
  if (lit < 3) return 'new';
  if (lit < 40) return 'crescent';
  if (lit <= 60) return 'quarter';
  if (lit < 97) return 'gibbous';
  return 'full';
}

export function moonInfo(ms: number): MoonInfo {
  const age = moonAge(ms);
  const lit = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC_DAYS)) / 2) * 100);
  const phase = phaseOf(lit);
  const half = SYNODIC_DAYS / 2;
  const toFull = phase === 'full' ? 0 : Math.ceil(age < half ? half - age : half - age + SYNODIC_DAYS);
  const toNew = phase === 'new' ? 0 : Math.ceil(SYNODIC_DAYS - age);
  return { age, lit, waxing: age < half, phase, toFull, toNew };
}

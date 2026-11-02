// The moon from the Sun–Moon elongation, with the main periodic terms of Meeus, Astronomical
// Algorithms ch. 47–48. Good to a few hours around new and full moon, which is all a whole
// percent and "in n days" need.
export const SYNODIC_DAYS = 29.530588853;
const DAY_MS = 86_400_000;
// The mean rate of the elongation, degrees a day.
const MEAN_RATE = 360 / SYNODIC_DAYS;

export type MoonPhase = 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full';

export interface MoonInfo {
  age: number;
  lit: number; // whole percent of the disk that is lit
  waxing: boolean;
  phase: MoonPhase;
  toFull: number; // whole days to the full moon, 0 from then until the moon is no longer full
  toNew: number; // the same for the new moon
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const wrap = (deg: number): number => ((deg % 360) + 360) % 360;

// The Moon's elongation east of the Sun in degrees [0, 360): 0 new, 180 full.
function elongation(ms: number): number {
  const t = (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
  const d = 297.8501921 + 445267.1114034 * t;
  const m = 357.5291092 + 35999.0502909 * t; // the Sun's mean anomaly
  const mm = 134.9633964 + 477198.8675055 * t; // the Moon's
  const s = (deg: number): number => Math.sin(rad(deg));
  return wrap(
    d + 6.289 * s(mm) - 2.1 * s(m) + 1.274 * s(2 * d - mm) + 0.658 * s(2 * d) + 0.214 * s(2 * mm) + 0.11 * s(d),
  );
}

// Days since the last new moon, in [0, 29.53).
export function moonAge(ms: number): number {
  return (elongation(ms) / 360) * SYNODIC_DAYS;
}

function phaseOf(lit: number): MoonPhase {
  if (lit < 3) return 'new';
  if (lit < 40) return 'crescent';
  if (lit <= 60) return 'quarter';
  if (lit < 97) return 'gibbous';
  return 'full';
}

// Whole days until the elongation reaches `target`, at the mean rate and to the nearest day:
// a day out reads 1 even though the band around the phase has begun. Once past the target
// it is 0 while still `inBand`, then the count to the next one.
function daysTo(e: number, target: number, inBand: boolean): number {
  const ahead = wrap(target - e);
  const passed = ahead > 180;
  return passed && inBand ? 0 : Math.round(ahead / MEAN_RATE);
}

export function moonInfo(ms: number): MoonInfo {
  const e = elongation(ms);
  const lit = Math.round(((1 - Math.cos(rad(e))) / 2) * 100);
  const phase = phaseOf(lit);
  const toFull = daysTo(e, 180, phase === 'full');
  const toNew = daysTo(e, 360, phase === 'new');
  return { age: (e / 360) * SYNODIC_DAYS, lit, waxing: e < 180, phase, toFull, toNew };
}

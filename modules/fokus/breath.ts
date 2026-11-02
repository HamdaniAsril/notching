// Box breathing: in, hold, out, hold, four seconds each, five rounds.
export const PHASE_S = 4;
export const CYCLES = 5;

export type Phase = 'in' | 'hold' | 'out';
const ORDER: readonly Phase[] = ['in', 'hold', 'out', 'hold'];

export interface Breath {
  phase: Phase;
  left: number; // whole seconds left in the phase, 1 to PHASE_S
  cycle: number; // 1-based
  scale: number; // 0 empty, 1 full
}

// Where the breath is `elapsedMs` after the start, or null once the last cycle is over.
// A frame stamped just before the click that started the session counts as the start.
export function breathAt(elapsedMs: number): Breath | null {
  elapsedMs = Math.max(0, elapsedMs);
  const phaseMs = PHASE_S * 1000;
  const cycleMs = ORDER.length * phaseMs;
  if (elapsedMs >= CYCLES * cycleMs) return null;
  const inCycle = elapsedMs % cycleMs;
  const step = Math.floor(inCycle / phaseMs);
  const within = inCycle - step * phaseMs;
  const phase = ORDER[step];
  const scale = phase === 'in' ? within / phaseMs : phase === 'out' ? 1 - within / phaseMs : step === 1 ? 1 : 0;
  return {
    phase,
    left: Math.ceil((phaseMs - within) / 1000),
    cycle: Math.floor(elapsedMs / cycleMs) + 1,
    scale,
  };
}

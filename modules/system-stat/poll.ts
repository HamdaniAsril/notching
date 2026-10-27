import type { Kit } from '../../src/kit/client';
import type { Stats } from './card';

export const POLL_MS = 1500;

// Reads at once, then POLL_MS after each answer, so requests never overlap. It
// stops on its own: the notch removes this frame when the card closes.
export function startPolling(
  kit: Pick<Kit, 'call'>,
  onStats: (s: Stats) => void,
  setTimer: (fn: () => void, ms: number) => void,
): void {
  const read = (): void => {
    kit.call<Stats>('system.stats', 'read').then(onStats, () => {}).finally(() => setTimer(read, POLL_MS));
  };
  read();
}

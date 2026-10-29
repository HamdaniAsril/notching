import type { Kit } from '../../src/kit/client';
import type { HomeSnapshot } from './types';

export const WEATHER_EVERY_MS = 30 * 60_000;

// Reads at once and on every minute boundary, and asks for fresh weather at once
// and every half hour; Rust fetches only when its copy is stale. It stops on its
// own: the notch removes this frame when the panel closes. A failed call leaves
// the card showing what it had.
export function startTicks(
  kit: Pick<Kit, 'call'>,
  onSnapshot: (s: HomeSnapshot) => void,
  setTimer: (fn: () => void, ms: number) => void,
  now: () => Date,
): { refresh(): Promise<void> } {
  const ask = (method: 'read' | 'refreshWeather') =>
    kit.call<HomeSnapshot>('home.data', method).then(onSnapshot, () => {});
  let lastWeather = now().getTime();

  const tick = (): void => {
    void ask('read');
    if (now().getTime() - lastWeather >= WEATHER_EVERY_MS) {
      lastWeather = now().getTime();
      void ask('refreshWeather');
    }
    schedule();
  };
  const schedule = (): void => {
    const t = now();
    setTimer(tick, 60_000 - (t.getSeconds() * 1000 + t.getMilliseconds()));
  };

  void ask('read');
  void ask('refreshWeather');
  schedule();
  return { refresh: () => ask('read') };
}

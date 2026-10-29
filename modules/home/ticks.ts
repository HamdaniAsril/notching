import type { Kit } from '../../src/kit/client';
import type { HomeSnapshot } from './types';

export const WEATHER_EVERY_MS = 30 * 60_000;

// Calls cb on every minute boundary. It stops on its own: the notch removes the
// frame when the panel closes.
export function everyMinute(setTimer: (fn: () => void, ms: number) => void, now: () => Date, cb: () => void): void {
  const schedule = (): void => {
    const t = now();
    setTimer(() => { cb(); schedule(); }, 60_000 - (t.getSeconds() * 1000 + t.getMilliseconds()));
  };
  schedule();
}

// Reads at once and on every minute boundary. The weather widget also asks for
// fresh weather at once and every half hour; Rust fetches only when its copy is
// stale. A failed call leaves the widget showing what it had.
export function startTicks(
  kit: Pick<Kit, 'call'>,
  onSnapshot: (s: HomeSnapshot) => void,
  setTimer: (fn: () => void, ms: number) => void,
  now: () => Date,
  opts: { weather: boolean },
): { refresh(): Promise<void> } {
  const ask = (method: 'read' | 'refreshWeather') =>
    kit.call<HomeSnapshot>('home.data', method).then(onSnapshot, () => {});
  let lastWeather = now().getTime();

  void ask('read');
  if (opts.weather) void ask('refreshWeather');
  everyMinute(setTimer, now, () => {
    void ask('read');
    if (opts.weather && now().getTime() - lastWeather >= WEATHER_EVERY_MS) {
      lastWeather = now().getTime();
      void ask('refreshWeather');
    }
  });
  return { refresh: () => ask('read') };
}

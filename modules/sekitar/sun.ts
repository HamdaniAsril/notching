// What the sun is doing at a moment, from today's sunrise and sunset and tomorrow's sunrise.
import type { Lang } from '../../src/kit/protocol';
import type { SunDay } from '../home/types';

export interface SunState {
  day: boolean;
  progress: number; // 0 to 1 along the daylight; 0 before sunrise, 1 after sunset
  untilMs: number; // to the sunset by day, to the next sunrise by night
}

export function sunState(sun: SunDay, nowMs: number): SunState {
  if (nowMs >= sun.rise && nowMs < sun.set) {
    return { day: true, progress: (nowMs - sun.rise) / (sun.set - sun.rise), untilMs: sun.set - nowMs };
  }
  if (nowMs >= sun.set) return { day: false, progress: 1, untilMs: sun.nextRise - nowMs };
  return { day: false, progress: 0, untilMs: sun.rise - nowMs };
}

// "8J 22M" / "8H 22M", or "22M" under an hour; the minute rounds up.
export function remainingShort(ms: number, lang: Lang): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}${lang === 'id' ? 'J' : 'H'} ${m}M` : `${m}M`;
}

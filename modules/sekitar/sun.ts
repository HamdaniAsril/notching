// What the sun is doing at a moment, from today's sunrise and sunset and tomorrow's sunrise.
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

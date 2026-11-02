// The forecast hours the strip shows, from the snapshot's hourly list.
import type { Hour, SunDay } from '../home/types';
import { sunState } from './sun';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RAIN_AT = 50;
const RAIN_WITHIN_MS = 12 * HOUR_MS;

// The hour that began last first (at 10:18 the 10:00 one), then the following, `n` in all.
export function upcoming(hours: Hour[], nowMs: number, n = 8): Hour[] {
  return hours.filter(h => h.at > nowMs - HOUR_MS).slice(0, n);
}

// The start of the first hour in the next 12 hours with a 50 percent chance of rain or more,
// the current one included; null when there is none.
export function rainAt(hours: Hour[], nowMs: number): number | null {
  const wet = hours.find(h => h.at > nowMs - HOUR_MS && h.at <= nowMs + RAIN_WITHIN_MS && h.rain >= RAIN_AT);
  return wet ? wet.at : null;
}

// Whether the sun is down at `atMs`. The sun times are today's: an hour of another day is judged
// by them shifted by whole days. Without sun times it is never night.
export function isNight(sun: SunDay | null, atMs: number): boolean {
  if (!sun) return false;
  const shift = Math.floor((atMs - sun.rise) / DAY_MS) * DAY_MS;
  return !sunState({ rise: sun.rise + shift, set: sun.set + shift, nextRise: sun.nextRise + shift }, atMs).day;
}

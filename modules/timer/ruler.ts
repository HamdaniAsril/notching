import type { TimerView } from './view';

// The ruler (2026-10-31-timer-mockups/strip-ruler.html, choice A): one tick a
// minute from 1 to 60, slid under a fixed mark.
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;
export const PX_PER_MINUTE = 8;
// A drag shorter than one tick is a click, and a click starts nothing: a
// trackpad click wobbles a few pixels, and must not restart a running timer.
export const DRAG_PX = 8;
export const PRESETS = [3, 5, 10, 25];

// Dragging left brings later minutes under the mark, as when turning a knob.
export function dragMinutes(start: number, dx: number): number {
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(start - dx / PX_PER_MINUTE)));
}

// "6:42": minutes and seconds left, seconds rounded up, never below "0:01";
// the same as status_text in src-tauri/src/timer.rs.
export function formatLeft(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The minutes under the mark: the ones set while idle, those left while running
// (by this frame's clock), and those left when it was paused.
export function shownMinutes(v: TimerView, now: number): number {
  if (v.state === 'running') return Math.max(0, ((v.until ?? now) - now) / 60_000);
  if (v.state === 'paused') return (v.left ?? 0) / 60_000;
  return v.minutes;
}

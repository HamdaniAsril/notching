import type { Lang } from '../../src/kit/protocol';

// What `media.now` returns (src-tauri/src/media_service.rs). Every track field is null when
// nothing plays; `elapsed` and `duration` are seconds, `at` is the epoch ms the position was read.
export interface NowState {
  on: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  elapsed: number | null;
  rate: number; // 0 when paused
  at: number;
  app: string | null;
  art: string | null; // a data: URL
}

export type Command = 'toggle' | 'prev' | 'next';

// A read that agrees with the button within this long after a click is believed; one that
// still shows the old state is the helper catching up, and is skipped.
const GRACE_MS = 1200;
// The helper restamps `at` about every 2 s when the source gives no timestamp, which can put a
// fresh reading a little behind the bar; behind by less than this, the bar waits.
const BACK_JUMP_S = 2;

export function isEmpty(s: NowState): boolean {
  return !s.on || (s.title ?? '').trim() === '';
}

export function firstWord(title: string | null): string {
  return (title ?? '').trim().split(/\s+/)[0];
}

// Seconds into the track at `nowMs`: the reading advanced by rate x the time since it was read,
// never below 0 or past the duration.
export function position(s: NowState, nowMs: number): number {
  if (s.elapsed === null) return 0;
  const base = s.elapsed;
  const moved = s.rate > 0 ? base + (s.rate * Math.max(0, nowMs - s.at)) / 1000 : base;
  const top = s.duration !== null && s.duration > 0 ? s.duration : Infinity;
  return Math.min(top, Math.max(0, moved));
}

// 2.14 in Indonesian, 2:14 in English; with hours 1.02.05 or 1:02:05.
export function clockText(seconds: number, lang: Lang): string {
  const total = Math.max(0, Math.floor(seconds));
  const sep = lang === 'en' ? ':' : '.';
  const two = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}${sep}${two(m)}${sep}${two(sec)}` : `${m}${sep}${two(sec)}`;
}

// What a widget draws at one moment.
export interface NowView {
  empty: boolean;
  playing: boolean;
  title: string;
  artist: string;
  art: string | null;
  position: number;
  duration: number | null;
}

export interface Now {
  read(state: NowState, nowMs: number): void; // a fresh reading from the core
  press(nowMs: number): void; // the play/pause button: flips the picture before the core answers
  view(nowMs: number): NowView;
}

// What a widget holds before the first reading, and when the core does not answer.
export const NO_MEDIA: NowState = { on: false, title: null, artist: null, album: null, duration: null, elapsed: null, rate: 0, at: 0, app: null, art: null };
const trackKey = (s: NowState) => `${s.title}\n${s.artist}\n${s.duration}`;

// The state behind a widget. The position is worked out here from the last reading, so the bar
// runs smoothly between reads and keeps going forward while the same track plays.
export function createNow(): Now {
  let state = NO_MEDIA;
  let pending: { playing: boolean; until: number } | null = null;
  let shown: { key: string; position: number } | null = null;

  const playing = (s: NowState) => !isEmpty(s) && s.rate > 0;

  function view(nowMs: number): NowView {
    const empty = isEmpty(state);
    let pos = empty ? 0 : position(state, nowMs);
    if (!empty && playing(state) && shown && shown.key === trackKey(state) && pos < shown.position && shown.position - pos < BACK_JUMP_S) {
      pos = shown.position;
    }
    shown = { key: trackKey(state), position: pos };
    return {
      empty,
      playing: playing(state),
      title: empty ? '' : (state.title ?? '').trim(),
      artist: empty ? '' : (state.artist ?? '').trim(),
      art: empty ? null : state.art,
      position: pos,
      duration: empty ? null : state.duration,
    };
  }

  return {
    read(s, nowMs) {
      if (pending) {
        if (nowMs < pending.until && playing(s) !== pending.playing) return;
        pending = null;
      }
      state = s;
    },
    press(nowMs) {
      if (isEmpty(state)) return;
      const v = view(nowMs);
      const next = !v.playing;
      state = { ...state, elapsed: v.position, at: nowMs, rate: next ? 1 : 0 };
      pending = { playing: next, until: nowMs + GRACE_MS };
    },
    view,
  };
}

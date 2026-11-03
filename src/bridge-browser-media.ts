import type { MediaSummary } from './bridge';
import type { NowState } from '../modules/musik/now';

const DURATION = 228;
const START = 214;

// A music player with one track in a normal browser (`npm run dev`), answering what
// src-tauri/src/media_service.rs does: `now` and `command`. The track is "Jalan Braga" with no
// artwork, 214 of 228 s in, playing; it starts over when it ends. `?media=off` is a Mac with
// nothing playing, `?media=art` gives the track a picture and `?media=long` very long names.
// `summary` and `onSummary` are the notch's view of the same track (bridge.media, bridge.onMedia):
// a command that plays or pauses it is heard there, as notching://media is.
export interface FakeMedia {
  (method: string, args: unknown): NowState | { ok: true };
  summary(): MediaSummary;
  onSummary(cb: (m: MediaSummary) => void): () => void;
}

export function fakeMedia(mode: string | null = null, now: () => number = Date.now): FakeMedia {
  let elapsed = START;
  let at = now();
  let rate = 1;
  const where = () => Math.min(DURATION, elapsed + (rate * (now() - at)) / 1000);
  const settle = () => {
    if (where() >= DURATION) {
      elapsed = 0;
      at = now();
    }
  };
  const art = mode === 'art'
    ? `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e86a4a"/><stop offset="1" stop-color="#2b3a67"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="64" cy="64" r="26" fill="#f3f5f0" opacity="0.85"/></svg>')}`
    : null;
  const title = mode === 'long' ? 'Jalan Braga di Malam Hari Ketika Hujan Turun Perlahan dan Lampu Kota Menyala' : 'Jalan Braga';
  const artist = mode === 'long' ? 'Kolektif Senja bersama Orkes Pantai Selatan dan Teman-teman' : 'Kolektif Senja';
  const subs = new Set<(m: MediaSummary) => void>();
  const summary = (): MediaSummary => (mode === 'off'
    ? { playing: false, title: null, art: null }
    : { playing: rate > 0, title, art });
  const call = (method: string, args: unknown): NowState | { ok: true } => {
    if (method === 'now') {
      if (mode === 'off') {
        return { on: false, title: null, artist: null, album: null, duration: null, elapsed: null, rate: 0, at: now(), app: null, art: null };
      }
      settle();
      return { on: true, title, artist, album: null, duration: DURATION, elapsed, rate, at, app: 'com.apple.Music', art };
    }
    if (method === 'command') {
      if (mode === 'off') throw new Error('nothing is playing');
      settle();
      if (args === 'toggle') {
        elapsed = where();
        at = now();
        rate = rate > 0 ? 0 : 1;
      } else if (args === 'next' || args === 'prev') {
        elapsed = 0;
        at = now();
      } else if (args !== 'play' && args !== 'pause') {
        throw new Error(`unknown command ${String(args)}`);
      } else {
        elapsed = where();
        at = now();
        rate = args === 'play' ? 1 : 0;
      }
      if (summary().playing !== sent.playing) {
        sent = summary();
        subs.forEach(cb => cb(sent));
      }
      return { ok: true };
    }
    throw new Error(`unknown method ${method}`);
  };
  let sent = summary();
  return Object.assign(call, {
    summary: () => sent,
    onSummary: (cb: (m: MediaSummary) => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
  });
}

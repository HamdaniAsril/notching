import type { Kit } from '../../src/kit/client';
import { readPrefs, writePrefs } from '../../src/kit/prefs';

// The tik the ruler makes under a hand (Ari's idea, owner 3 Nov): sound B of the sample page,
// one short high tone a minute passed, lower and fuller at every fifth minute. Made by Web
// Audio, so there is no sound file; it goes out at the Mac's own volume.
export type Tik = 'minute' | 'five';

// A fast drag skips tiks rather than run them into a buzz.
export const TIK_GAP_MS = 28;

// The tik for the ruler going from `from` to `to` whole minutes: the minutes passed are
// (from, to] going up and [to, from) going down; any fifth among them makes it the fuller one.
export function tikFor(from: number, to: number): Tik | null {
  if (from === to) return null;
  const lo = to > from ? from + 1 : to;
  const hi = to > from ? to : from - 1;
  for (let m = lo; m <= hi; m++) if (m % 5 === 0) return 'five';
  return 'minute';
}

export function makeTicker(play: (t: Tik) => void, now: () => number): { step(from: number, to: number): void } {
  let last = -Infinity;
  return {
    step(from, to) {
      const t = tikFor(from, to);
      if (!t || now() - last < TIK_GAP_MS) return;
      last = now();
      play(t);
    },
  };
}

// Timer's own settings (the `prefs` capability): the sound is on unless turned off on the page.
export interface TimerPrefs {
  sound: boolean;
}

export const DEFAULT_PREFS: TimerPrefs = { sound: true };

export function checkPrefs(raw: unknown): TimerPrefs {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_PREFS.sound };
}

// The tones. WebKit lets audio start only from a click, so `prime` runs on pointerdown.
export function tikSound(): { prime(): void; play(t: Tik): void } {
  let ctx: AudioContext | null = null;
  const prime = (): AudioContext | null => {
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    prime: () => void prime(),
    play(t) {
      const c = prime();
      if (!c) return;
      const [freq, peak, decay] = t === 'five' ? [1250, 0.22, 0.05] : [1900, 0.14, 0.025];
      const at = c.currentTime;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      gain.connect(c.destination);
      const tone = c.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(freq, at);
      tone.connect(gain);
      tone.start(at);
      tone.stop(at + decay + 0.01);
    },
  };
}

// A ruler's tik as a page uses it. `on` and `set` are a page's sound button; the Timer strip
// and tile only play. Cermin's two rulers tik the same way, with a button of their own.
export interface Sound {
  prime(): void;
  step(from: number, to: number): void;
  on?(): boolean;
  set?(on: boolean): void;
}

export const QUIET: Sound = { prime() {}, step() {} };

// The tik kept in this package's prefs: on unless its sound button turned it off. Read again at
// each press, so a frame follows a change made on another (Timer's strip and tile follow the page).
export async function kitSound(kit: Pick<Kit, 'call'>): Promise<Sound> {
  let prefs = await readPrefs(kit, DEFAULT_PREFS, checkPrefs);
  const tik = tikSound();
  const ticker = makeTicker(t => tik.play(t), () => performance.now());
  return {
    prime() {
      if (prefs.sound) tik.prime();
      void readPrefs(kit, prefs, checkPrefs).then(p => { prefs = p; });
    },
    step: (from, to) => { if (prefs.sound) ticker.step(from, to); },
    on: () => prefs.sound,
    set(on) {
      prefs = { ...prefs, sound: on };
      void writePrefs(kit, prefs);
      if (on) tik.play('minute');
    },
  };
}

// A speaker, with waves while the sound is on and a cross while it is off.
export const SPEAKER = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5z"/>'
  + '<path class="tik-waves" d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4"/>'
  + '<path class="tik-cross" d="M11 6l4 4M15 6l-4 4"/></svg>';

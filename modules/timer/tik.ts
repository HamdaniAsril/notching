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

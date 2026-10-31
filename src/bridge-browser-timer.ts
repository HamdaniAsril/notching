import { formatLeft } from '../modules/timer/ruler';
import type { TimerView } from '../modules/timer/view';

const MINUTE = 60_000;
const MAX_MINUTES = 60;

type Phase = { kind: 'idle' } | { kind: 'running'; until: number } | { kind: 'paused'; left: number };

// Timer in a normal browser (`npm run dev`), with the rules of src-tauri/src/timer.rs.
export function fakeTimer(now: () => number = Date.now): (method: string, args: unknown) => TimerView {
  let phase: Phase = { kind: 'idle' };
  let minutes = 30; // DEFAULT_MINUTES in src-tauri/src/timer.rs
  const settle = () => {
    if (phase.kind === 'running' && now() >= phase.until) phase = { kind: 'idle' };
  };
  const view = (): TimerView => {
    if (phase.kind === 'idle') return { state: 'idle', minutes, until: null, left: null, text: null };
    const left = phase.kind === 'running' ? phase.until - now() : phase.left;
    return { state: phase.kind, minutes, until: phase.kind === 'running' ? phase.until : null, left, text: formatLeft(left) };
  };
  return (method, args) => {
    settle();
    if (method === 'start') {
      const m = (args as { minutes?: number } | undefined)?.minutes ?? 0;
      if (!Number.isInteger(m) || m < 1 || m > MAX_MINUTES) throw new Error(`minutes must be 1–${MAX_MINUTES}`);
      minutes = m;
      phase = { kind: 'running', until: now() + m * MINUTE };
    } else if (method === 'pause') {
      if (phase.kind !== 'running') throw new Error('the timer is not running');
      phase = { kind: 'paused', left: phase.until - now() };
    } else if (method === 'resume') {
      if (phase.kind !== 'paused') throw new Error('the timer is not paused');
      phase = { kind: 'running', until: now() + phase.left };
    } else if (method === 'stop') {
      phase = { kind: 'idle' };
    } else if (method !== 'read') {
      throw new Error(`unknown method ${method}`);
    }
    return view();
  };
}

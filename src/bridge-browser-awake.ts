import type { AwakeView } from '../modules/keep-awake/view';

const MINUTE = 60_000;
const MAX = 1440 * MINUTE;

// Same text rules as status_text in src-tauri/src/awake.rs.
function text(left: number): string {
  const m = Math.max(1, Math.ceil(left / MINUTE));
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}m`;
}

// Keep awake in a normal browser (`npm run dev`): the timing only, nothing is held.
export function fakeAwake(): (method: string, args: unknown) => AwakeView {
  let until: number | 'forever' | null = null;
  const view = (): AwakeView => {
    if (until === null) return { on: false, until: null, forever: false, text: null };
    if (until === 'forever') return { on: true, until: null, forever: true, text: '∞' };
    if (until <= Date.now()) {
      until = null;
      return view();
    }
    return { on: true, until, forever: false, text: text(until - Date.now()) };
  };
  return (method, args) => {
    const minutes = (args as { minutes?: number | null } | undefined)?.minutes;
    if (method === 'start') until = minutes == null ? 'forever' : Date.now() + minutes * MINUTE;
    else if (method === 'add' && typeof until === 'number') until = Math.min(until + (minutes ?? 0) * MINUTE, Date.now() + MAX);
    else if (method === 'stop') until = null;
    else if (method !== 'read' && method !== 'add') throw new Error(`unknown method ${method}`);
    return view();
  };
}

import { COLUMNS } from '../pages/layout';

// Dragging in the settings window with pointer events: Tauri takes the HTML5
// drag and drop events for files dropped on the window.

const START_PX = 4;

// Where an item goes among others whose middles are at `mids`: before the first
// middle past the pointer.
export function dropIndex(mids: number[], pos: number): number {
  const i = mids.findIndex(m => pos < m);
  return i === -1 ? mids.length : i;
}

// The column of a 4-column row under x, kept inside the row.
export function columnAt(left: number, width: number, x: number): number {
  return Math.min(COLUMNS - 1, Math.max(0, Math.floor(((x - left) / width) * COLUMNS)));
}

// Follows the pointer from a pointerdown until it is let go. A press that never
// moves is left to the click handler; after a real drag the click is swallowed.
export function dragWith(
  e: PointerEvent,
  opts: { onMove(x: number, y: number): void; onDrop(x: number, y: number): void; onCancel(): void },
): void {
  const from = e.currentTarget as HTMLElement;
  const [sx, sy] = [e.clientX, e.clientY];
  let moved = false;
  from.setPointerCapture?.(e.pointerId);

  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < START_PX) return;
    moved = true;
    opts.onMove(ev.clientX, ev.clientY);
  };
  const swallow = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  const done = () => {
    from.removeEventListener('pointermove', move);
    from.removeEventListener('pointerup', up);
    from.removeEventListener('pointercancel', cancel);
    if (from.hasPointerCapture?.(e.pointerId)) from.releasePointerCapture(e.pointerId);
  };
  const up = (ev: PointerEvent) => {
    done();
    if (!moved) {
      opts.onCancel();
      return;
    }
    from.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => from.removeEventListener('click', swallow, { capture: true }), 0);
    opts.onDrop(ev.clientX, ev.clientY);
  };
  const cancel = () => {
    done();
    opts.onCancel();
  };
  from.addEventListener('pointermove', move);
  from.addEventListener('pointerup', up);
  from.addEventListener('pointercancel', cancel);
}

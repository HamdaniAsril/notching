// Past this many pixels with the button down, a press becomes a drag.
export const DRAG_SLOP = 4;

// Presses on things the notch draws itself that can be dragged out (Titipan's
// tiles, Screenshot's pictures): past DRAG_SLOP with the left button down a press
// starts a drag, once; otherwise its click is a click. The click that ends a
// drag is swallowed.
export interface Presses {
  // `canDrag`: false makes every press a plain click.
  watch(target: HTMLElement, id: number, onClick: (e: MouseEvent) => void, canDrag?: () => boolean): void;
  destroy(): void;
}

export function presses(doc: Document, startDrag: (id: number) => void): Presses {
  let press: { id: number; x: number; y: number; dragged: boolean } | null = null;

  function onMove(e: MouseEvent): void {
    if (!press || press.dragged || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_SLOP) return;
    press.dragged = true;
    startDrag(press.id);
  }

  function onUp(): void {
    // Cleared after the click that follows, so that click knows it was a drag.
    setTimeout(() => { if (press && !press.dragged) press = null; }, 0);
  }

  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('mouseup', onUp);

  return {
    watch(target, id, onClick, canDrag = () => true) {
      target.addEventListener('dragstart', e => e.preventDefault());
      target.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        press = canDrag() ? { id, x: e.clientX, y: e.clientY, dragged: false } : null;
      });
      target.addEventListener('click', e => {
        const wasDrag = press?.dragged === true && press.id === id;
        press = null;
        if (!wasDrag) onClick(e);
      });
    },
    destroy() {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
    },
  };
}

import type { Bridge, PointerUpdate } from '../bridge';
import { containsPoint, type Rect } from './hit';

// Pointer tracking inside a page, standing in for the native pointer router: the
// browser preview and the settings window's notch preview. A click outside the
// hit rects plays the part of the panel losing key status; with `area`, only a
// click inside it does (the settings preview's frame: picking a colour beside it
// leaves the panel open, owner 4 Nov).
export function localPointer(root: HTMLElement, area?: HTMLElement): Pick<Bridge, 'setHitRects' | 'onPointer' | 'onResignKey'> & { dispose(): void } {
  const doc = root.ownerDocument;
  let rects: Rect[] = [];
  let inside = false;
  const pointerSubs = new Set<(p: PointerUpdate) => void>();
  const resignSubs = new Set<() => void>();

  // In the root's own pixels, also when it is drawn scaled (the settings preview
  // shrinks to fit a narrow window).
  const local = (e: MouseEvent) => {
    const box = root.getBoundingClientRect();
    const k = root.offsetWidth > 0 && box.width > 0 ? box.width / root.offsetWidth : 1;
    return { x: (e.clientX - box.left) / k, y: (e.clientY - box.top) / k };
  };
  const onMove = (e: MouseEvent) => {
    const { x, y } = local(e);
    const now = containsPoint(rects, x, y);
    if (!now && !inside) return;
    inside = now;
    pointerSubs.forEach(cb => cb({ inside: now, x, y }));
  };
  const onLeave = () => {
    if (!inside) return;
    inside = false;
    pointerSubs.forEach(cb => cb({ inside: false, x: 0, y: 0 }));
  };
  const onClick = (e: MouseEvent) => {
    if (area && !(e.target instanceof Node && area.contains(e.target))) return;
    const { x, y } = local(e);
    if (!containsPoint(rects, x, y)) resignSubs.forEach(cb => cb());
  };

  doc.addEventListener('mousemove', onMove);
  doc.documentElement.addEventListener('mouseleave', onLeave);
  doc.addEventListener('click', onClick);

  return {
    setHitRects: async r => { rects = r; },
    onPointer: cb => { pointerSubs.add(cb); return () => pointerSubs.delete(cb); },
    onResignKey: cb => { resignSubs.add(cb); return () => resignSubs.delete(cb); },
    dispose(): void {
      doc.removeEventListener('mousemove', onMove);
      doc.documentElement.removeEventListener('mouseleave', onLeave);
      doc.removeEventListener('click', onClick);
      pointerSubs.clear();
      resignSubs.clear();
    },
  };
}

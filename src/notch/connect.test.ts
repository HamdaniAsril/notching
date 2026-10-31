import { expect, test, vi } from 'vitest';
import { connect } from './connect';
import { ctl, fakeBridge } from './test-helpers';

test('pointer events drive hover with a centred cursor x', () => {
  const b = fakeBridge();
  const kick = vi.fn();
  const c = ctl(null);
  connect(c, b, kick);
  b.emitPointer({ inside: true, x: 580, y: 10 });
  expect(c.phase).toBe('hover');
  expect(c.targets().bx).toBe(6);
  expect(kick).toHaveBeenCalled();
});

test('closing hands key status back', () => {
  const b = fakeBridge();
  const h = connect(ctl(null), b, vi.fn());
  h.onPhase('open');
  expect(b.setPanelKey).toHaveBeenLastCalledWith(true);
  h.onPhase('closing');
  expect(b.setPanelKey).toHaveBeenLastCalledWith(false);
});

test('hover-only phases never take key status', () => {
  const b = fakeBridge();
  const h = connect(ctl(null), b, vi.fn());
  h.onPhase('hover');
  h.onPhase('idle');
  expect(b.setPanelKey).not.toHaveBeenCalled();
});

test('resign key closes the panel', () => {
  const b = fakeBridge();
  const c = ctl(null);
  connect(c, b, vi.fn());
  c.click();
  b.emitResignKey();
  expect(c.phase).toBe('closing');
});

test('hit rects and quit are forwarded', () => {
  const b = fakeBridge();
  const h = connect(ctl(null), b, vi.fn());
  const r = [{ x: 260, y: 0, w: 120, h: 34 }];
  h.onHitRects(r);
  h.onQuit();
  expect(b.setHitRects).toHaveBeenCalledWith(r);
  expect(b.quit).toHaveBeenCalled();
});

test('any phase after open hands key status back, even if closing was never reported', () => {
  const b = fakeBridge();
  const h = connect(ctl(null), b, vi.fn());
  h.onPhase('open');
  h.onPhase('idle');
  expect(b.setPanelKey).toHaveBeenLastCalledWith(false);
});

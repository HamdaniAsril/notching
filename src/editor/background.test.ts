import { afterEach, expect, test, vi } from 'vitest';
import { fitSize, toJpeg } from './background';

afterEach(() => vi.unstubAllGlobals());

test('fitSize holds the longest side to the limit and never enlarges', () => {
  expect(fitSize(8000, 4000, 4000)).toEqual({ w: 4000, h: 2000 });
  expect(fitSize(3000, 6000, 3000)).toEqual({ w: 1500, h: 3000 });
  expect(fitSize(1000, 500, 4000)).toEqual({ w: 1000, h: 500 });
  expect(fitSize(1, 5000, 100)).toEqual({ w: 1, h: 100 }); // never to nothing
});

test('toJpeg draws on white at the fitted size and returns a JPEG data URL', () => {
  const calls: unknown[][] = [];
  const ctx = new Proxy({}, { get: (_t, n) => (...a: unknown[]) => calls.push([n, ...a]), set: () => true });
  const made = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'data:image/jpeg;base64,AA') };
  vi.stubGlobal('document', { createElement: () => made });
  const img = { naturalWidth: 6000, naturalHeight: 3000 } as HTMLImageElement;
  expect(toJpeg(img, 3000)).toBe('data:image/jpeg;base64,AA');
  expect([made.width, made.height]).toEqual([3000, 1500]);
  expect(made.toDataURL).toHaveBeenCalledWith('image/jpeg', expect.any(Number));
  expect(calls).toContainEqual(['drawImage', img, 0, 0, 3000, 1500]);
});

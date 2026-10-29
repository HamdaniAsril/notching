import { expect, test } from 'vitest';
import { dotBar, dotText, dotWidth, fitPitch } from './dots';

test('a digit is 5 × 7 dots at the given pitch', () => {
  const svg = dotText('1', 6);
  expect(svg).toContain('width="30" height="42"');
  expect(svg.match(/<circle/g)).toHaveLength(10);
});

test('glyphs sit one dot apart', () => expect(dotText('11', 6)).toContain('width="66"'));

test('percent has its own glyph', () => expect(dotText('%', 5).match(/<circle/g)).toHaveLength(13));

test('unknown characters are a programming error', () => expect(() => dotText('a', 6)).toThrow());

test('the dot bar lights the first n dots', () => expect(dotBar(18, 9).match(/fill="#fff"/g)).toHaveLength(9));

test('minus has its own glyph', () => expect(dotText('-3°', 5).match(/<circle/g)!.length).toBeGreaterThan(3));

test('a number too wide for its column drops a dot size', () => {
  expect(dotWidth('-12°', 6)).toBe(114);
  expect(fitPitch('31°', 109)).toBe(6);
  expect(fitPitch('-12°', 109)).toBe(5);
});

test('dotWidth matches the drawn svg', () => expect(dotText('10', 6)).toContain(`width="${dotWidth('10', 6)}"`));

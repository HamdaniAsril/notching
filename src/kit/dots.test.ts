import { expect, test } from 'vitest';
import { dotBar, dotText } from './dots';

test('a digit is 5 × 7 dots at the given pitch', () => {
  const svg = dotText('1', 6);
  expect(svg).toContain('width="30" height="42"');
  expect(svg.match(/<circle/g)).toHaveLength(10);
});

test('glyphs sit one dot apart', () => expect(dotText('11', 6)).toContain('width="66"'));

test('percent has its own glyph', () => expect(dotText('%', 5).match(/<circle/g)).toHaveLength(13));

test('unknown characters are a programming error', () => expect(() => dotText('a', 6)).toThrow());

test('the dot bar lights the first n dots', () => expect(dotBar(18, 9).match(/fill="#fff"/g)).toHaveLength(9));

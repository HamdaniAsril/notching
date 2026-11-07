import { expect, test } from 'vitest';

// Read from disk: vitest blanks a stylesheet imported as text.
async function css(): Promise<string> {
  // @ts-expect-error: the app has no Node types; vitest runs in Node.
  const { readFileSync } = await import('node:fs');
  return readFileSync('src/peek/peek.css', 'utf8');
}

// The rule body for a selector list, as written in peek.css.
const rule = (text: string, selectors: string): string => {
  const at = text.indexOf(selectors + ' {');
  expect(at, selectors).toBeGreaterThanOrEqual(0);
  return text.slice(at, text.indexOf('}', at));
};

test("Notching's own glass takes the card colour at its tint, 40% unless tuned", async () => {
  const text = await css();
  expect(rule(text, '#peek.mat-glass.own.card-light, #sw.mat-glass.own.card-light')).toContain('rgba(255, 255, 255, var(--own-tint, .4))');
  expect(rule(text, '#peek.mat-glass.own.card-dark, #sw.mat-glass.own.card-dark')).toContain('rgba(16, 17, 15, var(--own-tint, .4))');
});

test("macOS's glass keeps today's colour, 10% light and 12% dark", async () => {
  const text = await css();
  expect(rule(text, '#peek.mat-glass.card-light, #sw.mat-glass.card-light')).toContain('rgba(255, 255, 255, .1)');
  expect(rule(text, '#peek.mat-glass.card-dark, #sw.mat-glass.card-dark')).toContain('rgba(16, 17, 15, .12)');
});

test('the card colour fades as the glass changes', async () => {
  const text = await css();
  expect(text).toMatch(/@property --c-bg \{\s*syntax: '<color>';/);
  expect(rule(text, '#peek.mat-glass, #sw.mat-glass')).toContain('transition: --c-bg .15s');
});

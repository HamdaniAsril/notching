import { expect, test } from 'vitest';

// Read from disk: vitest blanks a stylesheet imported as text.
async function css(): Promise<string> {
  // @ts-expect-error: the app has no Node types; vitest runs in Node.
  const { readFileSync } = await import('node:fs');
  return readFileSync('src/settings/settings.css', 'utf8');
}

test('Settings takes its accent from the Volt variables', async () => {
  const text = await css();
  expect(text).not.toMatch(/c8f04a|d6f56e|1d260b|0f1404|4c6b12|5a7d17|200,\s*240,\s*74/i);
  expect(text).toMatch(/--acc:\s*var\(--v-acc\);/);
});

test('light mode uses the deep shade', async () => {
  const text = await css();
  const light = text.slice(text.indexOf('prefers-color-scheme: light'));
  expect(light).toMatch(/--acc:\s*var\(--v-acc-deep\);/);
  expect(light).toMatch(/--acc-hi:\s*var\(--v-acc-deep-hi\);/);
  expect(light).toMatch(/--acc-soft:\s*var\(--v-acc-deep-soft\);/);
});

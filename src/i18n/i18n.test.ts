import { expect, test } from 'vitest';
import en from './en.json';
import id from './id.json';
import { hostStrings } from './index';

test('host strings have the same keys in both languages', () =>
  expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort()));

test('every module has the same keys in both languages', () => {
  const files = import.meta.glob<Record<string, string>>('../../modules/*/locales/*.json', { eager: true, import: 'default' });
  const byModule = new Map<string, Record<string, string[]>>();
  for (const [path, strings] of Object.entries(files)) {
    const [, mod, lang] = path.match(/modules\/([^/]+)\/locales\/(\w+)\.json$/)!;
    byModule.set(mod, { ...byModule.get(mod), [lang]: Object.keys(strings).sort() });
  }
  expect(byModule.size).toBeGreaterThan(0);
  for (const [mod, langs] of byModule) expect(langs.en, mod).toEqual(langs.id);
});

test('hostStrings picks the language', () => {
  expect(hostStrings('en').settings).toBe('Settings');
  expect(hostStrings('id').settings).toBe('Pengaturan');
});

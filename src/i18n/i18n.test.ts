import { expect, test } from 'vitest';
import en from './en.json';
import id from './id.json';
import { fill, hostStrings, systemNames } from './index';

const keysDeep = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' ? keysDeep(v, `${p}${k}.`) : [`${p}${k}`]).sort();

test('both languages have the same keys at every depth', () => expect(keysDeep(en)).toEqual(keysDeep(id)));

test('fill puts values into a template', () =>
  expect(fill('{n} terpasang · {size}', { n: 2, size: '276 KB' })).toBe('2 terpasang · 276 KB'));

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

test('permission names follow the macOS in use', () => {
  // System Settings' own words (macOS 27.0.1, SecurityPrivacyExtension's Localizable.loctable).
  expect(systemNames('id', 27)).toEqual({
    accessibility: 'Kontrol Perangkat dan Akses Data', screenRecording: 'Rekaman Layar & Audio Sistem',
    fullDiskAccess: 'Akses Disk Penuh', camera: 'Kamera',
  });
  expect(systemNames('en', 27)).toEqual({
    accessibility: 'Device Control and Data Access', screenRecording: 'Screen & System Audio Recording',
    fullDiskAccess: 'Full Disk Access', camera: 'Camera',
  });
  // macOS 15 to 26: Screen Recording already renamed, Accessibility not yet.
  expect(systemNames('id', 26)).toMatchObject({ accessibility: 'Aksesibilitas', screenRecording: 'Rekaman Layar & Audio Sistem' });
  expect(systemNames('en', 15)).toMatchObject({ accessibility: 'Accessibility', screenRecording: 'Screen & System Audio Recording' });
  // macOS 13 and 14: the old names.
  expect(systemNames('id', 14)).toMatchObject({ accessibility: 'Aksesibilitas', screenRecording: 'Perekaman Layar' });
  expect(systemNames('en', 13)).toMatchObject({ accessibility: 'Accessibility', screenRecording: 'Screen Recording' });
});

test('an unknown macOS gets the old names', () =>
  expect(systemNames('en', Number.NaN)).toMatchObject({ accessibility: 'Accessibility', screenRecording: 'Screen Recording' }));

test('the names macOS changed are written only as placeholders', () => {
  // {accessibility} and {screenRecording}, so a text reads right on every macOS.
  const files = import.meta.glob<object>(['./*.json', '../../modules/*/locales/*.json', '!./macos-names.json'], { eager: true, import: 'default' });
  const texts = (o: object): string[] => Object.values(o).flatMap(v => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? texts(v) : []));
  const names = [27, 13].flatMap(v => (['id', 'en'] as const).flatMap(l => [systemNames(l, v).accessibility, systemNames(l, v).screenRecording]));
  const named = Object.entries(files).flatMap(([path, o]) => texts(o).filter(t => names.some(n => t.includes(n))).map(t => `${path}: ${t}`));
  expect(named).toEqual([]);
});

test('hostStrings picks the language', () => {
  expect(hostStrings('en').settings).toBe('Settings');
  expect(hostStrings('id').settings).toBe('Pengaturan');
});

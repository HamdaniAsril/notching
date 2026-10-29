import { expect, test } from 'vitest';
import { settingsStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { moduleInfo } from '../notch/test-helpers';
import { search, searchIndex } from './search';

const mods = [
  moduleInfo('home', { name: 'Beranda', description: 'Tanggal, cuaca, sholat, reminder' }),
  moduleInfo('system-stat', { name: 'System stat', description: 'CPU, memori, jaringan' }),
];
const idx = (m = mods, lang: Lang = 'id') => searchIndex(settingsStrings(lang), m);

test('finds a setting by its label', () => expect(search(idx(), 'bahasa')[0].key).toBe('general.language'));

test('finds a setting by a keyword', () => expect(search(idx(), 'monitor')[0].key).toBe('general.screen'));

test('finds a module by name or description and opens its page', () => {
  expect(search(idx(), 'system')[0].route).toEqual({ page: 'module', id: 'system-stat' });
  expect(search(idx(), 'cuaca')[0].route).toEqual({ page: 'module', id: 'home' });
});

test('an uninstalled module leads to Add module', () =>
  expect(search(idx([moduleInfo('home', { name: 'Beranda', installed: false, enabled: false })]), 'beranda')[0].route)
    .toEqual({ page: 'add' }));

test('ignores case and accents', () => expect(search(idx(), 'KÉNYAL')[0].key).toBe('look.bounce'));

test('every word must match', () => {
  expect(search(idx(), 'tebal notch')[0].key).toBe('look.thickness');
  expect(search(idx(), 'bahasa zzz')).toEqual([]);
});

test('labels that start with the query come first', () =>
  expect(search(idx(), 'ke').slice(0, 2).map(e => e.key)).toEqual(['look.bounce', 'look.speed']));

test('follows the language', () => expect(search(idx(mods, 'en'), 'language')[0].key).toBe('general.language'));

test('a blank query finds nothing', () => expect(search(idx(), '   ')).toEqual([]));

test('finds the city setting on the Beranda page', () => {
  const e = search(idx(), 'kota')[0];
  expect(e.key).toBe('home.place');
  expect(e.where).toBe('Beranda');
  expect(e.route).toEqual({ page: 'module', id: 'home' });
  expect(search(idx(), 'jam')[0].key).toBe('home.showClock');
});

test('Beranda settings are not offered while Beranda is uninstalled', () => {
  const gone = [moduleInfo('home', { name: 'Beranda', installed: false, enabled: false })];
  expect(search(idx(gone), 'kota')).toEqual([]);
});

test('finds the glow and the notice kinds', () => {
  const withKinds = [
    moduleInfo('home', { name: 'Beranda', channels: [{ id: 'prayer', name: 'Waktu sholat', on: false, sound: false }] }),
    mods[1],
  ];
  expect(search(idx(withKinds), 'cahaya')[0].key).toBe('notifications.glow');
  expect(search(idx(withKinds), 'waktu sholat').map(e => e.key)).toContain('channel.home.prayer');
  expect(search(idx(withKinds), 'notifikasi waktu sholat').map(e => e.key)).toContain('home.prayerNotice');
});


import { expect, test } from 'vitest';
import { settingsStrings } from '../i18n';
import type { Lang } from '../kit/protocol';
import { homeWidgets, moduleInfo } from '../notch/test-helpers';
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
  expect(search(idx(), 'tanggal')[0].route).toEqual({ page: 'module', id: 'home' });
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

test('the city is found under Halaman', () => {
  const e = search(idx([homeWidgets(), mods[1]]), 'kota')[0];
  expect(e.key).toBe('home.place');
  expect(e.where).toBe('Halaman');
  expect(e.route).toEqual({ page: 'pages' });
  expect(search(idx([homeWidgets(), mods[1]]), 'tampilkan jam')).toEqual([]);
});

test('the widget package is not offered as a module', () => {
  expect(search(idx([homeWidgets(), mods[1]]), 'widget bawaan').map(e => e.key)).not.toContain('module.home');
});

test('custom pages are found by name', () => {
  const pages = [{ id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [] }];
  const e = search(searchIndex(settingsStrings('id'), [homeWidgets()], pages), 'kerja')[0];
  expect(e).toMatchObject({ key: 'page.p1', where: 'Halaman', route: { page: 'pages' } });
});

test('finds the glow and the notice kinds', () => {
  const withKinds = [
    moduleInfo('home', { name: 'Beranda', channels: [{ id: 'prayer', name: 'Waktu sholat', on: false, sound: false, widget: null }] }),
    mods[1],
  ];
  expect(search(idx(withKinds), 'cahaya')[0].key).toBe('notifications.glow');
  expect(search(idx(withKinds), 'waktu sholat').map(e => e.key)).toContain('channel.home.prayer');
  expect(search(idx(withKinds), 'notifikasi waktu sholat').map(e => e.key)).toContain('home.prayerNotice');
});


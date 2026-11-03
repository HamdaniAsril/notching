import { expect, test } from 'vitest';
import { hostStrings } from '../i18n';
import type { ModuleState, Page } from '../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE, timerInfo } from '../notch/test-helpers';
import { shot } from '../shot/test-helpers';
import {
  CLEANER, CLEANER_KEY, type PageView, missedTargets, noticeTarget, pageHead, pageModules, pageName, pickPage, resolvePage, SHELF, SHOT, viewSize,
} from './route';

const P1: Page = { id: 'p1', name: 'Kerja', icon: 'briefcase', widgets: [{ widget: 'home/reminders', col: 0, width: 2 }] };
const state = (over: Partial<ModuleState> = {}): ModuleState => ({ ...TEST_STATE, ...over });

test('the last page opens; a module page that went away gives the Modul page', () => {
  expect(pickPage(state({ lastPage: 'module:system-stat' }), null, false).key).toBe('module:system-stat');
  expect(pickPage(state({ lastPage: 'modules' }), null, false).kind).toBe('modules');
  const gone = state({ lastPage: 'module:system-stat', modules: [homeWidgets(), moduleInfo('system-stat', { enabled: false })] });
  expect(pickPage(gone, null, false).key).toBe('modules');
  expect(pickPage(state(), null, false).key).toBe('home');
});

test('an open panel keeps its page', () => {
  const s = state({ pages: [BERANDA, P1], lastPage: 'home' });
  expect(pickPage(s, 'p1', true).key).toBe('p1');
  expect(pickPage(s, 'p1', false).key).toBe('home');
});

test('a deleted page gives way to Beranda', () => {
  expect(pickPage(state({ lastPage: 'p3' }), 'p3', true).key).toBe('home');
});

test('resolvePage knows pages, the Modul page and module pages', () => {
  const s = state({ pages: [BERANDA, P1] });
  expect(resolvePage(s, 'p1')).toMatchObject({ kind: 'custom', key: 'p1' });
  expect(resolvePage(s, 'module:home')).toBeNull();
  expect(resolvePage(s, 'module:zzz')).toBeNull();
  expect(resolvePage(s, null)).toBeNull();
});

test('sizes follow the kind of page', () => {
  expect(viewSize(pickPage(state(), null, false))).toEqual({ width: 520, height: 104 });
  const mods = (n: number) => viewSize({ kind: 'modules', key: 'modules', modules: Array.from({ length: n }, (_, i) => moduleInfo(`m${i}`)) });
  // The Modul page: 4 tiles of 76 a row, 6 apart, inside 18 on each side.
  expect(mods(1)).toEqual({ width: 358, height: 64 });
  expect(mods(4)).toEqual({ width: 358, height: 64 });
  expect(mods(7)).toEqual({ width: 358, height: 134 });
  expect(mods(8)).toEqual({ width: 358, height: 134 });
  expect(mods(9)).toEqual({ width: 358, height: 204 });
  expect(mods(0)).toEqual({ width: 358, height: 56 });
  expect(viewSize(resolvePage(state(), 'module:system-stat')!)).toEqual({ width: 400, height: 104 });
});

test('a full view may ask for a taller page, within limits', () => {
  const home = pickPage(state(), null, false);
  expect(viewSize(home, 193)).toEqual({ width: 520, height: 193 });
  expect(viewSize(home, 999)).toEqual({ width: 520, height: 240 });
  expect(viewSize(home, 40)).toEqual({ width: 520, height: 104 });
  expect(viewSize(resolvePage(state(), 'module:system-stat')!, 193)).toEqual({ width: 400, height: 104 });
});

test('the Modul page holds modules with an action, which have no page of their own', () => {
  const clean = moduleInfo('keyboard-clean', { entry: null, card: null, action: { capability: 'keyclean', method: 'toggle' } });
  const s = state({ modules: [homeWidgets(), moduleInfo('system-stat'), clean] });
  expect(pageModules(s).map(m => m.id)).toEqual(['system-stat', 'keyboard-clean']);
  expect(viewSize(resolvePage(s, 'modules')!)).toEqual({ width: 358, height: 64 });
  expect(resolvePage(s, 'module:keyboard-clean')).toBeNull();
});

test('a page with a strip is taller, unless the strip is away', () => {
  const page: Page = { ...BERANDA, strip: 'timer/strip' };
  const on = state({ pages: [page], modules: [homeWidgets(), timerInfo()] });
  // The row, 8 px, then the 52 px strip (design 2 Nov, Volt §3; owner 3 Nov: 8 px gaps).
  expect(viewSize(pickPage(on, null, false))).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 120)).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 200)).toEqual({ width: 520, height: 200 });
  const off = state({ pages: [page], modules: [homeWidgets(), timerInfo({ enabled: false })] });
  expect(viewSize(pickPage(off, null, false))).toEqual({ width: 520, height: 104 });
  expect(viewSize(resolvePage(on, 'home')!)).toEqual({ width: 520, height: 164 });
});

test('without a notch, a widget page is taller by its head row: 16 px and a 10 px gap', () => {
  const home = pickPage(state(), null, false);
  expect(viewSize(home, undefined, true)).toEqual({ width: 520, height: 130 });
  expect(viewSize(home, 193, true)).toEqual({ width: 520, height: 219 });
  expect(viewSize(home, 999, true)).toEqual({ width: 520, height: 266 });
  const on = state({ pages: [{ ...BERANDA, strip: 'timer/strip' }], modules: [homeWidgets(), timerInfo()] });
  expect(viewSize(pickPage(on, null, false), undefined, true)).toEqual({ width: 520, height: 190 });
  // Other pages have no head.
  expect(viewSize(resolvePage(state(), 'module:system-stat')!, undefined, true)).toEqual({ width: 400, height: 104 });
  expect(viewSize(resolvePage(state(), 'modules')!, undefined, true)).toEqual({ width: 358, height: 64 });
});

test('the page head names the page and counts it among the widget pages', () => {
  const unnamed: Page = { id: 'p2', name: null, icon: 'dot', widgets: [] };
  const s = state({ pages: [BERANDA, unnamed, P1] });
  const strs = hostStrings('id');
  expect(pageHead(s, unnamed, strs)).toEqual({ name: 'Halaman 2', count: '2 / 3' });
  expect(pageHead(s, unnamed, hostStrings('en'))).toEqual({ name: 'Page 2', count: '2 / 3' });
  expect(pageHead(s, P1, strs)).toEqual({ name: 'Kerja', count: '3 / 3' });
  // Beranda's name is its own, as in the pill.
  expect(pageHead(s, BERANDA, strs)).toEqual({ name: 'Beranda', count: '1 / 3' });
});

test('a notice from a strip widget opens the page holding the strip', () => {
  const timer = timerInfo({ channels: [{ id: 'done', name: 'Done', on: true, sound: true, widget: 'strip' }] });
  const s = state({ pages: [BERANDA, { ...P1, strip: 'timer/strip' }], modules: [homeWidgets(), timer] });
  expect(noticeTarget(s, 'timer', 'done')).toBe('p1');
});

test('Beranda is named after the language', () => {
  expect(pageName(BERANDA, hostStrings('id'))).toBe('Beranda');
  expect(pageName(BERANDA, hostStrings('en'))).toBe('Home');
  expect(pageName(P1, hostStrings('en'))).toBe('Kerja');
});

test('a notice opens the first page with its widget', () => {
  const s = state({ pages: [{ ...BERANDA, widgets: [] }, P1],
    modules: [homeWidgets(), moduleInfo('timer', { channels: [{ id: 'done', name: 'Done', on: true, sound: true, widget: null }] })] });
  expect(noticeTarget(s, 'home', 'reminder')).toBe('p1');
  expect(noticeTarget(s, 'home', 'prayer')).toBe('home');
  expect(noticeTarget(s, 'timer', 'done')).toBe('module:timer');
  expect(noticeTarget(s, 'zzz', 'x')).toBe('home');
  expect(noticeTarget(s, null, null)).toBeNull();
});

test('screenshot notices open the screenshot list', () => {
  const channels = ['keys', 'access'].map(id => ({ id, name: id, on: true, sound: false, widget: null }));
  const s = state({ pages: [BERANDA], modules: [homeWidgets(), moduleInfo('screenshot', { channels })] });
  expect(noticeTarget(s, 'screenshot', 'keys')).toEqual({ kind: 'shot', mode: 'list' });
  expect(noticeTarget(s, 'screenshot', 'access')).toEqual({ kind: 'shot', mode: 'list' });
  // It has no pill icon to carry a missed dot.
  expect(missedTargets({ ...s, missed: ['screenshot.keys'] })).toEqual(new Set());
});

test('missed dots land on page icons', () => {
  const s = state({ pages: [BERANDA, P1], missed: ['home.reminder', 'timer.done', 'home.prayer'],
    modules: [homeWidgets(), moduleInfo('timer')] });
  expect(missedTargets(s)).toEqual(new Set(['home', 'modules']));
  expect(missedTargets(state({ pages: [{ ...BERANDA, widgets: [] }, P1], missed: ['home.reminder'] })))
    .toEqual(new Set(['p1']));
});

test('shelf size by rows', () => {
  const v = (n: number) => ({ kind: 'shelf' as const, key: 'shelf' as const, shelf: { items: Array.from({ length: n }, (_, i) => ({ id: i, name: 'a', folder: false, state: 'ready' as const, thumb: null })) }, dropping: false });
  const { head, tile, gap, empty } = SHELF;
  expect(viewSize(v(1))).toEqual({ width: 520, height: head + tile });
  expect(viewSize(v(7))).toEqual({ width: 520, height: head + 2 * tile + gap });
  expect(viewSize(v(30))).toEqual({ width: 520, height: head + 3 * tile + 2 * gap });
  // Empty, as tall as one row (owner, on the Mac, 1 Nov: too thin before).
  expect(viewSize(v(0))).toEqual({ width: 520, height: head + tile });
  expect(empty).toBe(tile);
});

test('dropping size is 104', () => {
  expect(viewSize({ kind: 'shelf', key: 'shelf', shelf: { items: [] }, dropping: true })).toEqual({ width: 520, height: 104 });
});

// Screenshot (design 1 Nov §5, §6).
const shots = (n: number) => Array.from({ length: n }, (_, i) => shot(i + 1));

test('the screenshot result is 420 × 172, however many shots there are', () => {
  for (const n of [0, 6, 15]) {
    expect(viewSize({ kind: 'shot', mode: 'result', id: 1, key: 'screenshot', shots: shots(n) })).toEqual({ width: 420, height: 172 });
  }
});

test('the screenshot first-use notice is 420 × 132', () => {
  const setup = { holder: 'mac' as const, keys: '⌘⇧3' };
  expect(viewSize({ kind: 'shot', mode: 'setup', setup, key: 'screenshot', shots: shots(3) })).toEqual({ width: 420, height: 132 });
});

test('the screenshot list grows by rows of 5, up to 3', () => {
  const list = (n: number, notes?: number) => viewSize({ kind: 'shot', mode: 'list', key: 'screenshot', shots: shots(n), notes });
  const { head, tileH, label, gap, buttons, emptyH } = SHOT;
  expect(SHOT).toEqual({
    resultWidth: 420, resultHeight: 172, setupWidth: 420, setupHeight: 132, listWidth: 560, columns: 5, gap: 8, tileH: 62,
    label: 14, head: 22, buttons: 40, emptyH: 72, note: 24,
  });
  expect(list(0)).toEqual({ width: 560, height: head + emptyH + 12 + buttons });
  expect(list(6)).toEqual({ width: 560, height: head + 2 * (tileH + label) + gap + 12 + buttons });
  expect(list(15)).toEqual({ width: 560, height: head + 3 * (tileH + label) + 2 * gap + 12 + buttons });
  expect(list(5)).toEqual(list(1));
  expect(list(15).height).toBe(318);
  // Each notice line under the head adds its own height.
  expect(list(6, 2).height).toBe(list(6).height + 2 * SHOT.note);
});

test('screenshot pages are not pages to remember', () => {
  expect(resolvePage(state(), 'screenshot')).toBeNull();
});

test('Cleaner: the start view, taller with its note, and the lists', () => {
  const home: Extract<PageView, { kind: 'cleaner' }> = { kind: 'cleaner', key: CLEANER_KEY, screen: 'home', note: false };
  expect(viewSize(home)).toEqual({ width: 520, height: CLEANER.home });
  expect(viewSize({ ...home, note: true })).toEqual({ width: 520, height: CLEANER.home + CLEANER.homeNote });
  expect(viewSize({ ...home, screen: 'list' })).toEqual({ width: 520, height: CLEANER.list });
  // The start view as drawn: a legend on two lines makes it taller, never shorter.
  expect(viewSize({ ...home, height: 199 })).toEqual({ width: 520, height: 199 });
  expect(viewSize({ ...home, height: 150 })).toEqual({ width: 520, height: CLEANER.home });
  expect(viewSize({ ...home, note: true, height: 199 })).toEqual({ width: 520, height: CLEANER.home + CLEANER.homeNote });
  expect(viewSize({ ...home, screen: 'list', height: 199 })).toEqual({ width: 520, height: CLEANER.list });
  expect([CLEANER.home, CLEANER.homeNote, CLEANER.list]).toEqual([188, 28, 440]);
});

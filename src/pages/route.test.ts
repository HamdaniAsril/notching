import { expect, test } from 'vitest';
import { hostStrings } from '../i18n';
import type { ModuleState, Page } from '../modules/types';
import { BERANDA, homeWidgets, moduleInfo, TEST_STATE, timerInfo } from '../notch/test-helpers';
import { missedTargets, noticeTarget, pageName, pickPage, resolvePage, viewSize } from './route';

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
  expect(mods(1)).toEqual({ width: 520, height: 64 });
  expect(mods(7)).toEqual({ width: 520, height: 134 });
  expect(mods(0)).toEqual({ width: 520, height: 56 });
  expect(viewSize(resolvePage(state(), 'module:system-stat')!)).toEqual({ width: 400, height: 104 });
});

test('a full view may ask for a taller page, within limits', () => {
  const home = pickPage(state(), null, false);
  expect(viewSize(home, 193)).toEqual({ width: 520, height: 193 });
  expect(viewSize(home, 999)).toEqual({ width: 520, height: 240 });
  expect(viewSize(home, 40)).toEqual({ width: 520, height: 104 });
  expect(viewSize(resolvePage(state(), 'module:system-stat')!, 193)).toEqual({ width: 400, height: 104 });
});

test('a page with a strip is taller, unless the strip is away', () => {
  const page: Page = { ...BERANDA, strip: 'timer/strip' };
  const on = state({ pages: [page], modules: [homeWidgets(), timerInfo()] });
  expect(viewSize(pickPage(on, null, false))).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 120)).toEqual({ width: 520, height: 164 });
  expect(viewSize(pickPage(on, null, false), 200)).toEqual({ width: 520, height: 200 });
  const off = state({ pages: [page], modules: [homeWidgets(), timerInfo({ enabled: false })] });
  expect(viewSize(pickPage(off, null, false))).toEqual({ width: 520, height: 104 });
  expect(viewSize(resolvePage(on, 'home')!)).toEqual({ width: 520, height: 164 });
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

test('missed dots land on page icons', () => {
  const s = state({ pages: [BERANDA, P1], missed: ['home.reminder', 'timer.done', 'home.prayer'],
    modules: [homeWidgets(), moduleInfo('timer')] });
  expect(missedTargets(s)).toEqual(new Set(['home', 'modules']));
  expect(missedTargets(state({ pages: [{ ...BERANDA, widgets: [] }, P1], missed: ['home.reminder'] })))
    .toEqual(new Set(['p1']));
});

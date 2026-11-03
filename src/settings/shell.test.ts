// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { moduleInfo, TEST_STATE } from '../notch/test-helpers';
import { h1, mountForTest, settle, TEST_INFO } from './test-helpers';

const navLabels = (root: HTMLElement) => [...root.querySelectorAll('.nav .label')].map(n => n.textContent);
const searchBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input.search')!;
const type = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event('input'));
};

test('opens on Umum, with seven sections, Halaman before Modul, and the module count', async () => {
  const { root } = await mountForTest();
  expect(navLabels(root)).toEqual(['Umum', 'Tampilan notch', 'Notifikasi', 'Halaman', 'Modul', 'Izin', 'Tentang']);
  expect(root.querySelector('.nav.on .label')!.textContent).toBe('Umum');
  expect(h1(root)).toBe('Umum');
  // The widget package is not a module.
  expect(root.querySelector('[data-key="nav.modules"] .n')!.textContent).toBe('1');
});

test('a module whose tile runs an action counts as a module', async () => {
  const clean = moduleInfo('keyboard-clean', { entry: null, card: null, action: { capability: 'keyclean', method: 'toggle' } });
  const { root } = await mountForTest({ ...TEST_STATE, modules: [...TEST_STATE.modules, clean] });
  expect(root.querySelector('[data-key="nav.modules"] .n')!.textContent).toBe('2');
});

test('the sidebar opens each section', async () => {
  const { root } = await mountForTest();
  root.querySelector<HTMLElement>('[data-key="nav.about"]')!.click();
  expect(h1(root)).toBe('Tentang');
  expect(root.querySelector('.pane')!.textContent).toContain('Versi');
  expect(root.querySelector('.pane')!.textContent).toContain('0.1.0');
  expect(root.querySelector('.nav.on')!.getAttribute('aria-current')).toBe('page');
});

test('choosing a language saves it, and the window follows the new language', async () => {
  const { root, bridge } = await mountForTest();
  root.querySelector<HTMLElement>('[data-key="general.language.en"]')!.click();
  expect(bridge.setLanguage).toHaveBeenCalledWith('en');
  bridge.emitSettings({ ...TEST_INFO, language: 'en' });
  bridge.emitModuleState({ ...TEST_STATE, lang: 'en' });
  expect(navLabels(root)[0]).toBe('General');
  expect(document.documentElement.lang).toBe('en');
  expect(root.querySelector('[data-key="general.language.en"]')!.getAttribute('aria-checked')).toBe('true');
});

test('search shows matches and opens the setting', async () => {
  const { root } = await mountForTest();
  type(searchBox(root), 'monitor');
  const results = root.querySelectorAll<HTMLElement>('.result');
  expect(results).toHaveLength(1);
  expect(results[0].textContent).toContain('Notch muncul di');
  expect(results[0].textContent).toContain('Umum');
  results[0].click();
  expect(h1(root)).toBe('Umum');
  expect(root.querySelector('[data-row="general.screen"]')!.classList.contains('found')).toBe(true);
  expect(searchBox(root).value).toBe('');
});

test('a search with no match says so', async () => {
  const { root } = await mountForTest();
  type(searchBox(root), 'zzz');
  expect(root.querySelector('.pane')!.textContent).toContain('Tidak ada yang cocok.');
});

test('Escape clears the search', async () => {
  const { root } = await mountForTest();
  type(searchBox(root), 'bahasa');
  searchBox(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(searchBox(root).value).toBe('');
  expect(h1(root)).toBe('Umum');
});

test('Cmd+F focuses the search', async () => {
  const { root } = await mountForTest();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }));
  expect(document.activeElement).toBe(searchBox(root));
});

test('Cmd+Q quits', async () => {
  const { bridge } = await mountForTest();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true }));
  expect(bridge.quit).toHaveBeenCalledTimes(1);
});

test('focus stays on a control after a re-render', async () => {
  const { root, bridge } = await mountForTest();
  root.querySelector<HTMLElement>('[data-key="general.language.id"]')!.focus();
  bridge.emitSettings(TEST_INFO);
  expect((document.activeElement as HTMLElement).dataset.key).toBe('general.language.id');
});

test('a failed save says so next to the setting', async () => {
  const { root, bridge } = await mountForTest();
  bridge.setLanguage.mockRejectedValueOnce(new Error('disk full'));
  root.querySelector<HTMLElement>('[data-key="general.language.en"]')!.click();
  await settle();
  expect(root.querySelector('[data-row="general.language"]')!.textContent).toContain('Gagal menyimpan. Coba lagi.');
});

test('the window follows the accent', async () => {
  const { bridge } = await mountForTest({ ...TEST_STATE, accent: '#b18cff' });
  const root = document.documentElement;
  expect(root.style.getPropertyValue('--v-acc')).toBe('#b18cff');
  bridge.emitModuleState({ ...TEST_STATE, accent: '#3ee6c4' });
  expect(root.style.getPropertyValue('--v-acc')).toBe('#3ee6c4');
});

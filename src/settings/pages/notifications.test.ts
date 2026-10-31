// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { ModuleState } from '../../modules/types';
import { moduleInfo, TEST_STATE } from '../../notch/test-helpers';
import { mountForTest } from '../test-helpers';

const CHANNELS = [
  { id: 'reminder', name: 'Reminder', on: true, sound: true, widget: null },
  { id: 'prayer', name: 'Waktu sholat', on: false, sound: false, widget: null },
];
const STATE: ModuleState = {
  ...TEST_STATE,
  modules: [moduleInfo('home', { name: 'Beranda', channels: CHANNELS }), moduleInfo('system-stat', { name: 'System stat' })],
};
const key = (root: HTMLElement, k: string) => root.querySelector<HTMLElement>(`[data-key="${k}"]`)!;

async function open(state: ModuleState = STATE) {
  const t = await mountForTest(state);
  t.app.go({ page: 'notifications' });
  return { ...t, text: () => t.root.querySelector('.pane')!.textContent! };
}

test('glow, duration and the sample', async () => {
  const { root, bridge, text } = await open();
  expect(text()).toContain('Hanya dari modul Notching. Tidak dari app lain.');
  key(root, 'notifications.glow').click();
  expect(bridge.setNoticeGlow).toHaveBeenCalledWith(false);
  expect(text()).toContain('3,5 dtk');
  const seconds = key(root, 'notifications.seconds') as HTMLInputElement;
  expect([seconds.min, seconds.max, seconds.step]).toEqual(['2', '8', '0.5']);
  seconds.value = '5';
  seconds.dispatchEvent(new Event('change'));
  expect(bridge.setNoticeSeconds).toHaveBeenCalledWith(5);
  key(root, 'notifications.sample').click();
  expect(bridge.sendSampleNotice).toHaveBeenCalledWith('Contoh notifikasi', 'Begini tampilnya.');
});

test('each kind has a show and a sound switch', async () => {
  const { root, bridge } = await open();
  const rows = [...root.querySelectorAll<HTMLElement>('[data-row^="channel."]')];
  expect(rows.map(r => r.querySelector('.label')!.textContent)).toEqual(['Reminder', 'Waktu sholat']);
  expect(rows.map(r => r.querySelector('.hint')!.textContent)).toEqual(['Beranda', 'Beranda']);
  expect(key(root, 'channel.home.prayer.on').getAttribute('aria-label')).toBe('Tampil');
  expect(key(root, 'channel.home.prayer.sound').getAttribute('aria-label')).toBe('Suara');
  expect(root.querySelector('.kinds-head')!.textContent).toBe('TampilSuara');
  key(root, 'channel.home.prayer.on').click();
  expect(bridge.setChannel).toHaveBeenCalledWith('home', 'prayer', { on: true, sound: false });
  key(root, 'channel.home.reminder.sound').click();
  expect(bridge.setChannel).toHaveBeenCalledWith('home', 'reminder', { on: true, sound: false });
});

test('sound waits for the kind to be on', async () => {
  const { root } = await open();
  expect((key(root, 'channel.home.prayer.sound') as HTMLButtonElement).disabled).toBe(true);
  expect((key(root, 'channel.home.reminder.sound') as HTMLButtonElement).disabled).toBe(false);
});

test('a module that is not installed shows no kinds', async () => {
  const gone = { ...STATE, modules: STATE.modules.map(m => ({ ...m, installed: false, enabled: false })) };
  const { text } = await open(gone);
  expect(text()).toContain('Belum ada modul yang memberi notifikasi.');
});

test('without kinds it says so', async () => {
  const { text } = await open({ ...TEST_STATE, modules: [moduleInfo('system-stat')] });
  expect(text()).toContain('Belum ada modul yang memberi notifikasi.');
});

test('English seconds', async () => {
  const { text } = await open({ ...STATE, lang: 'en' });
  expect(text()).toContain('3.5 s');
});

test('the sample status switch follows the state', async () => {
  const { root, bridge, text } = await open();
  expect(text()).toContain('Contoh status di samping notch');
  expect(text()).toContain('Untuk mencoba tampilannya. Tidak disimpan.');
  const sw = key(root, 'notifications.sampleStatus');
  expect(sw.getAttribute('aria-checked')).toBe('false');
  sw.click();
  expect(bridge.setSampleStatus).toHaveBeenCalledWith(true);
  bridge.emitModuleState({ ...STATE, sampleStatus: true });
  expect(key(root, 'notifications.sampleStatus').getAttribute('aria-checked')).toBe('true');
});

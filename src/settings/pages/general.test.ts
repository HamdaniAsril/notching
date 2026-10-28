// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { mountForTest, TEST_INFO } from '../test-helpers';

const screenSelect = (root: HTMLElement) => root.querySelector<HTMLSelectElement>('select[data-key="general.screen"]')!;

test('the screen list offers every screen first', async () => {
  const { root } = await mountForTest();
  const sel = screenSelect(root);
  expect([...sel.options].map(o => o.textContent)).toEqual(['Semua layar', 'Built-in Retina Display', 'DELL U2723QE']);
  expect(sel.value).toBe('');
});

test('picking a screen saves it; every screen saves null', async () => {
  const { root, bridge } = await mountForTest();
  const sel = screenSelect(root);
  sel.value = 'DELL U2723QE';
  sel.dispatchEvent(new Event('change'));
  expect(bridge.setScreen).toHaveBeenLastCalledWith('DELL U2723QE');
  sel.value = '';
  sel.dispatchEvent(new Event('change'));
  expect(bridge.setScreen).toHaveBeenLastCalledWith(null);
});

test('a chosen screen that is not connected stays listed and says so', async () => {
  const { root } = await mountForTest(undefined, { ...TEST_INFO, screen: 'LG UltraFine', screens: ['Built-in Retina Display'] });
  expect(screenSelect(root).selectedOptions[0].textContent).toBe('LG UltraFine (tidak tersambung)');
  expect(root.querySelector('[data-row="general.screen"]')!.textContent)
    .toContain('Sampai tersambung lagi, notch muncul di semua layar.');
});

test('open at login follows the system state', async () => {
  const on = await mountForTest(undefined, { ...TEST_INFO, login: 'on' });
  const sw = on.root.querySelector<HTMLButtonElement>('[data-key="general.login"]')!;
  expect(sw.getAttribute('aria-checked')).toBe('true');
  sw.click();
  expect(on.bridge.setLaunchAtLogin).toHaveBeenCalledWith(false);

  const off = await mountForTest(undefined, { ...TEST_INFO, login: 'unavailable' });
  const sw2 = off.root.querySelector<HTMLButtonElement>('[data-key="general.login"]')!;
  expect(sw2.disabled).toBe(true);
  expect(off.root.querySelector('[data-row="general.login"]')!.textContent)
    .toContain('Hanya bisa diatur dari Notching.app yang terpasang.');

  const ask = await mountForTest(undefined, { ...TEST_INFO, login: 'needsApproval' });
  ask.root.querySelector<HTMLElement>('[data-key="general.loginOpen"]')!.click();
  expect(ask.bridge.openLoginItems).toHaveBeenCalledTimes(1);
});

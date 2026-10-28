// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { CONFIG_RANGES, DEFAULT_CONFIG } from '../../notch/config';
import { TEST_STATE } from '../../notch/test-helpers';
import { mountForTest } from '../test-helpers';

const sliders = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('input[data-key^="look."]')];
const slide = (input: HTMLInputElement, value: string, event: 'input' | 'change') => {
  input.value = value;
  input.dispatchEvent(new Event(event));
};

test('the sliders start at the saved look', async () => {
  const { root, app } = await mountForTest();
  app.go({ page: 'look' });
  const inputs = sliders(root);
  expect(inputs.map(i => i.value)).toEqual(['100', '200', '9', '4']);
  expect(inputs.map(i => [Number(i.min), Number(i.max)])).toEqual([
    CONFIG_RANGES.bounce, CONFIG_RANGES.speed, CONFIG_RANGES.dropDepth, CONFIG_RANGES.thickness,
  ]);
  expect(root.querySelector('[data-row="look.dropDepth"] .val')!.textContent).toBe('9 px');
});

test('moving a slider waits for release before saving', async () => {
  const { root, app, bridge } = await mountForTest();
  app.go({ page: 'look' });
  const bounce = root.querySelector<HTMLInputElement>('input[data-key="look.bounce"]')!;
  slide(bounce, '50', 'input');
  expect(bridge.setNotchConfig).not.toHaveBeenCalled();
  bounce.dispatchEvent(new Event('change'));
  expect(bridge.setNotchConfig).toHaveBeenCalledWith({ ...DEFAULT_CONFIG, bounce: 50 });
});

test('arrow keys keep working after each save', async () => {
  const { root, app, bridge } = await mountForTest();
  app.go({ page: 'look' });
  const speed = root.querySelector<HTMLInputElement>('input[data-key="look.speed"]')!;
  speed.focus();
  slide(speed, '199', 'change');
  bridge.emitModuleState({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, speed: 199 } });
  const now = document.activeElement as HTMLInputElement;
  expect(now.dataset.key).toBe('look.speed');
  expect(now.value).toBe('199');
});

test('reset puts the defaults back', async () => {
  const { root, app, bridge } = await mountForTest({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, bounce: 20 } });
  app.go({ page: 'look' });
  root.querySelector<HTMLElement>('[data-key="look.reset"]')!.click();
  expect(bridge.setNotchConfig).toHaveBeenCalledWith(DEFAULT_CONFIG);
});

test('thickness says it only shows without a notch', async () => {
  const { root, app } = await mountForTest();
  app.go({ page: 'look' });
  expect(root.querySelector('[data-row="look.thickness"]')!.textContent).toContain('Hanya terlihat di layar tanpa notch.');
});

test('holding an arrow key never jumps back or drops a step', async () => {
  const { root, app, bridge } = await mountForTest({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, bounce: 50 } });
  app.go({ page: 'look' });
  const bounce = () => root.querySelector<HTMLInputElement>('input[data-key="look.bounce"]')!;
  slide(bounce(), '51', 'change');
  slide(bounce(), '52', 'change');
  bridge.emitModuleState({ ...TEST_STATE, notch: { ...DEFAULT_CONFIG, bounce: 51 } });
  expect(bounce().value).toBe('52');
  slide(bounce(), '53', 'change');
  expect(bridge.setNotchConfig).toHaveBeenLastCalledWith({ ...DEFAULT_CONFIG, bounce: 53 });
});

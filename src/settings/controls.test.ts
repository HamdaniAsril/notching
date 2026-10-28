// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { choice, slider, toggle } from './controls';

test('a switch reports the flipped value', () => {
  const f = vi.fn();
  const t = toggle('k', 'Beranda', false, f);
  expect(t.getAttribute('role')).toBe('switch');
  expect(t.getAttribute('aria-checked')).toBe('false');
  expect(t.getAttribute('aria-label')).toBe('Beranda');
  t.click();
  expect(f).toHaveBeenCalledWith(true);
});

test('a slider reports while moving and on release', () => {
  const onInput = vi.fn();
  const onChange = vi.fn();
  const row = slider({ key: 'look.bounce', label: 'Kenyal', min: 0, max: 100, step: 1, value: 100,
    format: v => `${v} px`, onInput, onChange });
  const input = row.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(row.dataset.row).toBe('look.bounce');
  expect(input.dataset.key).toBe('look.bounce');
  expect(row.querySelector('.val')!.textContent).toBe('100 px');
  input.value = '50';
  input.dispatchEvent(new Event('input'));
  expect(onInput).toHaveBeenCalledWith(50);
  expect(row.querySelector('.val')!.textContent).toBe('50 px');
  expect(onChange).not.toHaveBeenCalled();
  input.dispatchEvent(new Event('change'));
  expect(onChange).toHaveBeenCalledWith(50);
});

test('a choice marks one option', () => {
  const f = vi.fn();
  const c = choice('k', [{ value: 'auto', label: 'Otomatis' }, { value: 'en', label: 'English' }], 'auto', f);
  expect(c.getAttribute('role')).toBe('radiogroup');
  expect(c.querySelector('[data-key="k.auto"]')!.getAttribute('aria-checked')).toBe('true');
  expect(c.querySelector('[data-key="k.en"]')!.getAttribute('aria-checked')).toBe('false');
  c.querySelector<HTMLElement>('[data-key="k.en"]')!.click();
  expect(f).toHaveBeenCalledWith('en');
});

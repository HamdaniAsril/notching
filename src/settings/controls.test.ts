// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { choice, slider, swatches, toggle } from './controls';

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

const SW = [
  { value: '#c8f04a', name: 'Lime', color: '#c8f04a' },
  { value: '#ffd23f', name: 'Citrus', color: '#ffd23f' },
];
function sw(value: string | null) {
  const f = { onPick: vi.fn(), onInput: vi.fn(), onChange: vi.fn() };
  const r = swatches({ key: 'look.accent', label: 'Warna aksen', options: SW, value,
    custom: { name: 'Warna sendiri', color: '#123456', onInput: f.onInput, onChange: f.onChange }, onPick: f.onPick });
  document.body.append(r);
  const radios = [...r.querySelectorAll<HTMLElement>('[role="radio"]')];
  return { r, f, radios, input: r.querySelector<HTMLInputElement>('input[type="color"]')! };
}

test('swatches are a radio group, named but not labelled', () => {
  const { r, radios } = sw('#ffd23f');
  expect(r.querySelector('[role="radiogroup"]')).not.toBeNull();
  expect(radios).toHaveLength(3);
  expect(radios.map(b => b.getAttribute('aria-label'))).toEqual(['Lime', 'Citrus', 'Warna sendiri']);
  expect(radios.map(b => b.title)).toEqual(['Lime', 'Citrus', 'Warna sendiri']);
  expect(radios.map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  expect(radios.map(b => b.tabIndex)).toEqual([-1, 0, -1]);
  expect(radios.every(b => b.textContent === '')).toBe(true);
});

test('a click picks and marks a swatch', () => {
  const { f, radios } = sw('#c8f04a');
  radios[1].click();
  expect(f.onPick).toHaveBeenCalledWith('#ffd23f');
  expect(radios.map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
});

test('arrow keys move along the swatches and pick', () => {
  const { f, radios } = sw('#c8f04a');
  radios[0].focus();
  radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(f.onPick).toHaveBeenCalledWith('#ffd23f');
  expect(document.activeElement).toBe(radios[1]);
  radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(f.onPick).toHaveBeenLastCalledWith('#c8f04a');
});

test('the custom swatch shows its colour and reports while moving and on release', () => {
  const { f, radios, input } = sw('#123456');
  expect(radios[2].getAttribute('aria-checked')).toBe('true');
  expect(radios[2].style.getPropertyValue('--sw')).toBe('#123456');
  expect(input.value).toBe('#123456');
  input.value = '#224466';
  input.dispatchEvent(new Event('input'));
  expect(f.onInput).toHaveBeenCalledWith('#224466');
  input.dispatchEvent(new Event('change'));
  expect(f.onChange).toHaveBeenCalledWith('#224466');
  expect(radios[2].getAttribute('aria-checked')).toBe('true');
});

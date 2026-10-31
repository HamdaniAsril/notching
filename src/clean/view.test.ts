// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { cleanStrings } from '../i18n';
import { renderClean } from './view';

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  return { root, view: renderClean(root, cleanStrings('id')) };
}

test('the dim page shows the title, five esc keys and the hint', () => {
  const { root } = mount();
  expect(root.querySelector('.kc-title')!.textContent).toBe('Keyboard sedang dibersihkan');
  const keys = [...root.querySelectorAll('.kc-keys .kc-key')];
  expect(keys.map(k => k.textContent)).toEqual(['esc', 'esc', 'esc', 'esc', 'esc']);
  expect(root.querySelector('.kc-hint')!.textContent).toBe('Tekan Esc 5× untuk keluar');
  expect(cleanStrings('en').title).toBe('Cleaning the keyboard');
});

test('keys light up with the presses and go dark on a reset', () => {
  const { root, view } = mount();
  const lit = () => root.querySelectorAll('.kc-key.kc-on').length;
  expect(lit()).toBe(0);
  view.update(2);
  expect(lit()).toBe(2);
  expect(root.querySelectorAll('.kc-key')[1].classList.contains('kc-on')).toBe(true);
  view.update(0);
  expect(lit()).toBe(0);
});

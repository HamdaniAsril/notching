// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest';
import { fakeShotDeps } from './test-helpers';
import { mountShotSetup } from './setup';

let box: HTMLElement;
let deps: ReturnType<typeof fakeShotDeps>;

beforeEach(() => {
  document.body.replaceChildren();
  box = document.createElement('div');
  document.body.append(box);
  deps = fakeShotDeps();
});

const flush = () => new Promise(r => setTimeout(r, 0));
const buttons = () => [...box.querySelectorAll<HTMLButtonElement>('button')];
const button = (text: string) => buttons().find(b => b.textContent === text)!;

test('keys the Mac holds: the title, the line and both ways out', () => {
  mountShotSetup(box, deps).render({ holder: 'mac', keys: '⌘⇧3 dan ⌘⇧4' });
  expect(box.querySelector('.shot-lab')!.textContent).toBe('Screenshot');
  expect(box.querySelector('.shot-setup-title')!.textContent).toBe('⌘⇧3 dan ⌘⇧4 masih dipakai Mac');
  expect(box.querySelector('.shot-setup-text')!.textContent).toBe('Matikan screenshot bawaan Mac, atau pakai tombol sendiri untuk Notching.');
  expect(buttons().map(b => b.textContent)).toEqual(['Matikan bawaan Mac', 'Pakai tombol sendiri']);
  expect(button('Matikan bawaan Mac').classList.contains('primary')).toBe(true);
  expect(button('Pakai tombol sendiri').classList.contains('primary')).toBe(false);
});

test('"Matikan bawaan Mac" opens System Settings, then the panel closes', async () => {
  mountShotSetup(box, deps).render({ holder: 'mac', keys: '⌘⇧3' });
  button('Matikan bawaan Mac').click();
  await flush();
  expect(deps.shotTurnOffMac).toHaveBeenCalledTimes(1);
  expect(deps.openShotKeySettings).not.toHaveBeenCalled();
  expect(deps.close).toHaveBeenCalledTimes(1);
});

test('"Pakai tombol sendiri" opens Settings at Screenshot, then the panel closes', async () => {
  mountShotSetup(box, deps).render({ holder: 'mac', keys: '⌘⇧3' });
  button('Pakai tombol sendiri').click();
  await flush();
  expect(deps.openShotKeySettings).toHaveBeenCalledTimes(1);
  expect(deps.shotTurnOffMac).not.toHaveBeenCalled();
  expect(deps.close).toHaveBeenCalledTimes(1);
});

test('keys another app holds: only one way out, as the main button', () => {
  mountShotSetup(box, deps).render({ holder: 'other', keys: '⌘⇧4' });
  expect(box.querySelector('.shot-setup-title')!.textContent).toBe('⌘⇧4 dipakai app lain');
  expect(box.querySelector('.shot-setup-text')!.textContent).toBe('Pilih tombol lain untuk Notching.');
  expect(buttons().map(b => b.textContent)).toEqual(['Pakai tombol sendiri']);
  expect(button('Pakai tombol sendiri').classList.contains('primary')).toBe(true);
});

test('in English', () => {
  deps = fakeShotDeps({ lang: 'en' });
  mountShotSetup(box, deps).render({ holder: 'mac', keys: '⌘⇧3 and ⌘⇧4' });
  expect(box.querySelector('.shot-setup-title')!.textContent).toBe('⌘⇧3 and ⌘⇧4 still taken by the Mac');
  expect(buttons().map(b => b.textContent)).toEqual(["Turn off the Mac's", 'Use my own keys']);
});

test('keys are text, not markup', () => {
  mountShotSetup(box, deps).render({ holder: 'mac', keys: '<b>x</b>' });
  expect(box.querySelector('b')).toBeNull();
});

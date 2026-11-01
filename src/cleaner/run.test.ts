// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { hostStrings } from '../i18n';
import { mountRun } from './run';

function setup() {
  const box = document.createElement('div');
  document.body.replaceChildren(box);
  const run = mountRun(box, { lang: 'id', strings: hostStrings('id').cleaner, onStop: () => {}, onDone: () => {} });
  return { box, run };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const text = (box: HTMLElement) => box.textContent ?? '';

test('confirm shows what goes for good and what goes to the Trash', async () => {
  const { box, run } = setup();
  const answer = run.confirm({ permanent: 18e9, trash: 7.9e9, count: 40 }, 'clean');
  expect(text(box)).toContain('18 GB dihapus permanen');
  expect(text(box)).toContain('7,9 GB dipindah ke Tempat Sampah');
  expect(text(box)).toContain('40 item');
  box.querySelector<HTMLElement>('.cl-yes')!.click();
  expect(await answer).toBe(true);
});

test('a line at 0 is left out; uninstall says Ya, hapus', () => {
  const { box, run } = setup();
  void run.confirm({ permanent: 0, trash: 1.2e9, count: 3 }, 'uninstall', 'Spotify');
  expect(text(box)).not.toContain('permanen');
  expect(box.querySelector('.cl-yes')!.textContent).toBe('Ya, hapus');
});

test('Batal and Esc answer no', async () => {
  const { box, run } = setup();
  const a = run.confirm({ permanent: 1, trash: 0, count: 1 }, 'clean');
  box.querySelector<HTMLElement>('.cl-no')!.click();
  expect(await a).toBe(false);
  const b = run.confirm({ permanent: 1, trash: 0, count: 1 }, 'clean');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(await b).toBe(false);
  const c = run.confirm({ permanent: 1, trash: 0, count: 1 }, 'clean');
  run.cancel();
  expect(await c).toBe(false);
});

test('progress and the result with its skips', async () => {
  const { box, run } = setup();
  run.progress(12, 40);
  expect(text(box)).toContain('12 dari 40');
  run.result(25.9e9, [{ label: 'com.x', reason: 'changed', admin: false }, { label: 'Coba.app', reason: 'failed', admin: true }]);
  await tick();
  expect(text(box)).toContain('+25,9 GB');
  expect(text(box)).toContain('com.x · berubah sejak dipindai');
  expect(text(box)).toContain('Butuh izin admin. Hapus lewat Finder');
});

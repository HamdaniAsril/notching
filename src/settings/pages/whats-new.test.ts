// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { TEST_STATE } from '../../notch/test-helpers';
import { CHANGELOG } from '../changelog';
import { mountForTest, TEST_INFO } from '../test-helpers';

test('every version has its changes in both languages, newest first, dated once released', () => {
  const versions = CHANGELOG.map(e => e.version.split('.').map(Number));
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  for (let i = 1; i < versions.length; i++) expect(cmp(versions[i - 1], versions[i])).toBeGreaterThan(0);
  for (const e of CHANGELOG) {
    expect(e.items.id.length).toBeGreaterThan(0);
    expect(e.items.en).toHaveLength(e.items.id.length);
    if (e.date !== null) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  // Only the newest may wait for its release.
  expect(CHANGELOG.slice(1).every(e => e.date !== null)).toBe(true);
});

test('Yang baru lists each version, marks this one and the one coming', async () => {
  const { root, app } = await mountForTest(TEST_STATE, { ...TEST_INFO, version: '0.1.2' });
  app.go({ page: 'whatsnew' });
  expect(root.querySelector('.pane h1')!.textContent).toBe('Yang baru');
  expect(root.querySelector('.nav.on .label')!.textContent).toBe('Yang baru');
  const cards = [...root.querySelectorAll('.news')];
  expect(cards.map(c => c.querySelector('.news-version')!.textContent)).toEqual(CHANGELOG.map(e => e.version));
  expect(cards[0].querySelector('.news-tag')!.textContent).toBe('Akan datang');
  expect(cards[1].querySelector('.news-tag.on')!.textContent).toBe('Versi ini');
  expect(cards[1].querySelector('.news-date')!.textContent).toBe('3 November 2026');
  expect(cards[1].querySelectorAll('li')).toHaveLength(CHANGELOG[1].items.id.length);
});

test('in English the changes are English', async () => {
  const { root, app } = await mountForTest({ ...TEST_STATE, lang: 'en' }, { ...TEST_INFO, version: '0.1.3' });
  app.go({ page: 'whatsnew' });
  const first = root.querySelector('.news')!;
  expect(first.querySelector('.news-tag.on')!.textContent).toBe('This version');
  expect(first.querySelector('li')!.textContent).toBe(CHANGELOG[0].items.en[0]);
});

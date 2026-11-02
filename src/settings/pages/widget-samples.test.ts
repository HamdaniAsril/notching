// @vitest-environment jsdom
import { expect, test } from 'vitest';
import type { CatalogWidget } from '../../pages/layout';
import { packSample } from './widget-samples';

const widget = (ref: string, width = 1): CatalogWidget =>
  ({ ref, moduleId: ref.split('/')[0], id: ref.split('/')[1], name: ref, width, kind: 'time' }) as CatalogWidget;

test('the waktu widgets have samples', () => {
  const clock = packSample(widget('waktu/clockdate', 2), 'id')!;
  expect(clock).not.toBeNull();
  expect(clock[0].textContent).toContain('JAKARTA');
  expect(clock[0].textContent).toContain('JUM 30.10');
  expect(clock.some(e => e.querySelector('svg.dm'))).toBe(true);
  const analog = packSample(widget('waktu/analog'), 'en')!;
  expect(analog).not.toBeNull();
  expect(analog[0].querySelectorAll('circle.tk')).toHaveLength(12);
});

test('other widgets are not a pack sample', () => {
  expect(packSample(widget('home/date'), 'id')).toBeNull();
});

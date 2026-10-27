import { expect, test } from 'vitest';
import { moduleInfo } from '../notch/test-helpers';
import { pickCard } from './cards';
import type { ModuleState } from './types';

const S = (over: Partial<ModuleState> = {}): ModuleState =>
  ({ lang: 'id', lastCard: null, modules: [moduleInfo('home'), moduleInfo('system-stat')], ...over });

test('opens the last card', () => expect(pickCard(S({ lastCard: 'system-stat' }), null, false)?.id).toBe('system-stat'));

test('falls back to the first module that is on', () =>
  expect(pickCard(S({ lastCard: 'system-stat',
    modules: [moduleInfo('home'), moduleInfo('system-stat', { enabled: false })] }), null, false)?.id).toBe('home'));

test('an uninstalled last card is skipped', () =>
  expect(pickCard(S({ lastCard: 'home',
    modules: [moduleInfo('home', { installed: false, enabled: false }), moduleInfo('system-stat')] }), null, false)?.id)
    .toBe('system-stat'));

test('an open card stays while it is on', () =>
  expect(pickCard(S({ lastCard: 'home' }), 'system-stat', true)?.id).toBe('system-stat'));

test('a closed panel follows the last card', () =>
  expect(pickCard(S({ lastCard: 'home' }), 'system-stat', false)?.id).toBe('home'));

test('nothing on gives no card', () =>
  expect(pickCard(S({ modules: [moduleInfo('home', { enabled: false })] }), null, false)).toBeNull());

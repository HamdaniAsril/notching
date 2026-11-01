import type { KeyState, ShotKeys } from '../bridge';
import { fill, type HostStrings } from '../i18n';

const KEYS = { screen: '⌘⇧3', pick: '⌘⇧4' } as const;

// The keys a state applies to.
function keysIn(keys: ShotKeys, state: KeyState): string[] {
  return (['screen', 'pick'] as const).filter(k => keys[k] === state).map(k => KEYS[k]);
}

// The notices about keys that do not reach Notching (design 1 Nov §4): the keys the
// Mac's own screenshots still hold, and the keys another app holds. Null when none.
export function keyNotices(keys: ShotKeys, s: HostStrings['shot']): { mac: string | null; other: string | null } {
  const mac = keysIn(keys, 'mac');
  const other = keysIn(keys, 'other');
  return {
    mac: mac.length ? fill(s.macKeys, { keys: mac.join(s.and) }) : null,
    other: other.length ? fill(other.length > 1 ? s.otherKeysMany : s.otherKeys, { key: other.join(s.and) }) : null,
  };
}

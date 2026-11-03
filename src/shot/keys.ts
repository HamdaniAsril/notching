import type { KeyState, ShotKeys } from '../bridge';
import { fill, type HostStrings } from '../i18n';

// ⌘⇧3 and ⌘⇧4, until the keys come or when they never do.
export const DEFAULT_LABELS: ShotKeys['labels'] = { screen: '⌘⇧3', pick: '⌘⇧4' };

// The keys a state applies to, by their labels.
function keysIn(keys: ShotKeys, state: KeyState): string[] {
  return (['screen', 'pick'] as const).filter(k => keys[k] === state).map(k => keys.labels[k]);
}

// The notices about keys that do not reach Notching (design 1 Nov §4, design 3 Nov
// tombol §6): the keys the Mac's own screenshots still hold, the keys another Mac
// shortcut holds, and the keys another app holds. Null when none.
export function keyNotices(keys: ShotKeys, s: HostStrings['shot']): { mac: string | null; shortcut: string | null; other: string | null } {
  const mac = keysIn(keys, 'mac');
  const shortcut = keysIn(keys, 'shortcut');
  const other = keysIn(keys, 'other');
  return {
    mac: mac.length ? fill(s.macKeys, { keys: mac.join(s.and) }) : null,
    shortcut: shortcut.length ? fill(s.shortcutKeys, { keys: shortcut.join(s.and) }) : null,
    other: other.length ? fill(other.length > 1 ? s.otherKeysMany : s.otherKeys, { key: other.join(s.and) }) : null,
  };
}

import type { Kit } from './client';

// A package's own settings, kept by the notch under its id (the `prefs`
// capability). `check` turns whatever was stored into a full, valid object.
export async function readPrefs<T>(kit: Pick<Kit, 'call'>, defaults: T, check: (raw: unknown) => T): Promise<T> {
  try {
    return check(await kit.call<unknown>('prefs', 'read'));
  } catch {
    return defaults;
  }
}

export async function writePrefs(kit: Pick<Kit, 'call'>, value: object): Promise<void> {
  await kit.call('prefs', 'write', { value });
}

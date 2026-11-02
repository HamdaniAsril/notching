const PREFS_MAX = 16 * 1024; // PREFS_MAX in src-tauri/src/prefs.rs

// Package prefs in a normal browser (`npm run dev`): kept in memory per module id.
export function fakePrefs(): (moduleId: string, method: string, args: unknown) => unknown {
  const store = new Map<string, Record<string, unknown>>();
  return (moduleId, method, args) => {
    if (method === 'read') return structuredClone(store.get(moduleId) ?? {});
    if (method === 'write') {
      const value = (args as { value?: unknown } | undefined)?.value;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('prefs must be an object');
      const text = JSON.stringify(value);
      if (new TextEncoder().encode(text).length > PREFS_MAX) throw new Error('prefs too large');
      store.set(moduleId, JSON.parse(text));
      return null;
    }
    throw new Error(`unknown method ${method}`);
  };
}

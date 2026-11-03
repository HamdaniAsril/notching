import type { Bridge, CleanerEvent, CleanerItem } from './bridge';

type CleanerFake = Pick<Bridge,
  | 'cleanerOverview' | 'cleanerParts' | 'cleanerDeepScan' | 'cleanerApps' | 'cleanerAppDetail' | 'cleanerBreakdown'
  | 'cleanerRun' | 'cleanerStop' | 'cleanerCancelScans' | 'cleanerRunning' | 'cleanerReveal' | 'cleanerRevealPath'
  | 'cleanerExclude' | 'cleanerSeen' | 'openFullDiskAccessSettings' | 'onCleaner'>;

const GB = 1e9;
const MB = 1e6;

// Cleaner in a normal browser (`npm run dev`): made-up numbers, nothing removed.
// ?fda=0 shows the start view without Full Disk Access; ?test=1 shows the test-mode pill;
// ?apps=<n> adds n made-up apps to Clean uninstall's list.
export function fakeCleaner(params: URLSearchParams): CleanerFake {
  const subs = new Set<(e: CleanerEvent) => void>();
  const fda = params.get('fda') !== '0';
  const item = (id: number, category: CleanerItem['category'], label: string, bytes: number, over: Partial<CleanerItem> = {}): CleanerItem => ({
    id, category, label, detail: null, bytes, method: ['orphan', 'installer', 'backup', 'app', 'leftover', 'personal'].includes(category) ? 'trash' : 'permanent',
    ticked: ['appCache', 'browserCache', 'devCache', 'log', 'app', 'leftover'].includes(category), inUse: false, confidence: null, ...over,
  });
  const deep: CleanerItem[] = [
    item(1, 'appCache', 'com.spotify.client', 2.4 * GB), item(2, 'appCache', 'com.tinyspeck.slackmacgap', 640 * MB),
    item(3, 'browserCache', 'Google', 1.2 * GB, { inUse: true, ticked: false }), item(4, 'browserCache', 'com.apple.Safari', 640 * MB),
    item(5, 'devCache', 'DerivedData', 9.8 * GB, { detail: 'Xcode' }), item(6, 'devCache', 'npm', 1.1 * GB),
    item(7, 'log', 'DiagnosticReports', 120 * MB), item(8, 'orphan', 'com.lama.app', 2.2 * GB),
    item(9, 'trash', 'Trash', 2.9 * GB), item(10, 'build', 'notch', 14 * GB, { detail: '~/dev/notch' }),
    item(11, 'installer', 'Figma.dmg', 210 * MB), item(12, 'backup', 'iPhone Coba', 18 * GB, { detail: '2026-03-02' }),
  ];
  const apps = [
    { id: 100, name: 'Xcode', bundleId: 'com.apple.dt.Xcode', bytes: 12 * GB, refused: false, running: false },
    { id: 101, name: 'Spotify', bundleId: 'com.spotify.client', bytes: 1.2 * GB, refused: false, running: params.get('running') === '1' },
    { id: 102, name: 'GlobalProtect', bundleId: 'com.paloaltonetworks.GlobalProtect', bytes: 90 * MB, refused: true, running: false },
    ...Array.from({ length: Number(params.get('apps') ?? 0) }, (_, i) => (
      { id: 110 + i, name: `Coba ${i + 1}`, bundleId: `id.coba.app${i + 1}`, bytes: (60 - i) * MB, refused: false, running: false })),
  ];
  const emit = (e: CleanerEvent) => subs.forEach(cb => cb(e));
  return {
    cleanerOverview: async () => ({ testMode: params.get('test') === '1', fda, volume: 'Macintosh HD', total: 256 * GB, free: 44 * GB }),
    cleanerParts: async () => ({ apps: 51 * GB, documents: fda ? 36 * GB : null, photos: fda ? 26 * GB : null, cleanable: 31 * GB, appCount: apps.length }),
    cleanerDeepScan: async () => ({ scanId: 1, items: deep }),
    cleanerApps: async () => ({ scanId: 2, items: apps }),
    cleanerAppDetail: async appId => {
      const app = apps.find(a => a.id === appId)!;
      return {
        scanId: 3,
        items: [
          item(200, 'app', app.name, app.bytes, { inUse: app.running, confidence: 'sure' }),
          item(201, 'leftover', `${app.bundleId}.plist`, 12_000, { detail: 'Preferences', confidence: 'sure' }),
          item(202, 'leftover', app.bundleId, 300 * MB, { detail: 'Caches', confidence: 'sure' }),
          item(203, 'leftover', app.name, 80 * MB, { detail: 'Application Support', confidence: 'maybe', ticked: false }),
          item(204, 'personal', app.bundleId, 1.4 * GB, { detail: 'Containers', confidence: 'sure', ticked: false }),
        ],
      };
    },
    cleanerBreakdown: async () => ({
      name: '~', bytes: 160 * GB, dir: true, readable: true, rest: 0,
      children: [
        { name: 'Library', bytes: 70 * GB, dir: true, readable: true, rest: 0, children: [
          { name: 'Developer', bytes: 30 * GB, dir: true, readable: true, rest: 0, children: [] },
          { name: '', bytes: 2 * GB, dir: false, readable: true, rest: 412, children: [] },
        ] },
        { name: 'App', bytes: 51 * GB, dir: true, readable: true, rest: 0, children: [] },
        { name: 'Movies', bytes: 22 * GB, dir: true, readable: fda, rest: 0, children: [] },
        { name: 'dev', bytes: 15 * GB, dir: true, readable: true, rest: 0, children: [] },
      ],
    }),
    cleanerRun: async (_scanId, ids) => {
      ids.forEach((_, i) => setTimeout(() => emit({ phase: 'progress', done: i + 1, total: ids.length }), 150 * (i + 1)));
      setTimeout(() => emit({
        phase: 'done', freed: 25.9 * GB,
        outcomes: ids.map(id => ({ id, freed: GB, skip: id === 2 ? 'changed' : null, detail: null })),
      }), 150 * (ids.length + 1));
    },
    cleanerStop: async () => console.info('cleanerStop'),
    cleanerCancelScans: async () => {},
    cleanerRunning: async () => apps.filter(a => a.running).map(a => a.id),
    cleanerReveal: async id => console.info('cleanerReveal', id),
    cleanerRevealPath: async names => console.info('cleanerRevealPath', names),
    cleanerExclude: async id => console.info('cleanerExclude', id),
    cleanerSeen: async () => {},
    openFullDiskAccessSettings: async () => console.info('openFullDiskAccessSettings'),
    onCleaner: cb => { subs.add(cb); return () => subs.delete(cb); },
  };
}

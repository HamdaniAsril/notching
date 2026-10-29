import type { SettingsStrings } from '../i18n';
import type { ModuleInfo } from '../modules/types';
import type { Route, SectionId } from './types';

export interface SearchEntry {
  key: string; // data-row of the setting it leads to
  label: string;
  where: string; // the section's title; '' for a section itself
  route: Route;
  text: string; // normalized label, section and keywords
}

// Lower case, accents dropped, spaces tidied.
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const SECTIONS: SectionId[] = ['general', 'look', 'notifications', 'modules', 'permissions', 'about'];

// Every searchable setting, in sidebar order; modules follow their section.
export function searchIndex(s: SettingsStrings, modules: ModuleInfo[]): SearchEntry[] {
  const k = s.keywords;
  const rows: Record<SectionId, [key: string, label: string, keywords: string][]> = {
    general: [
      ['general.language', s.general.language, k.language],
      ['general.screen', s.general.screen, k.screen],
      ['general.login', s.general.login, k.login],
    ],
    look: [
      ['look.bounce', s.look.bounce, k.bounce],
      ['look.speed', s.look.speed, k.speed],
      ['look.dropDepth', s.look.dropDepth, k.dropDepth],
      ['look.thickness', s.look.thickness, k.thickness],
    ],
    notifications: [],
    modules: [],
    permissions: [],
    about: [['about.version', s.about.version, k.version]],
  };
  const entry = (key: string, label: string, where: string, route: Route, extra = ''): SearchEntry =>
    ({ key, label, where, route, text: normalize(`${label} ${where} ${extra}`) });
  // A module's own settings, found under the module's name.
  const moduleRows = (m: ModuleInfo): SearchEntry[] => {
    const own: Record<string, [key: string, label: string, keywords: string][]> = {
      home: [
        ['home.place', s.home.place, k.place],
        ['home.prayerMethod', s.home.prayerMethod, k.prayerMethod],
        ['home.showClock', s.home.showClock, k.showClock],
      ],
    };
    return (own[m.id] ?? []).map(([key, label, keywords]) => entry(key, label, m.name, { page: 'module', id: m.id }, keywords));
  };

  return SECTIONS.flatMap(page => {
    const where = s.sections[page];
    const own = rows[page].map(([key, label, keywords]) => entry(key, label, where, { page }, keywords));
    const mods = page === 'modules'
      ? modules.flatMap(m => [
        entry(`module.${m.id}`, m.name, where, m.installed ? { page: 'module', id: m.id } : { page: 'add' }, m.description),
        ...(m.installed ? moduleRows(m) : []),
      ])
      : [];
    return [entry(`section.${page}`, where, '', { page }), ...own, ...mods];
  });
}

// Entries holding every word of the query; labels that start with its first
// word come first, the rest keep index order.
export function search(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const hits = entries.filter(e => words.every(w => e.text.includes(w)));
  const leads = (e: SearchEntry) => normalize(e.label).startsWith(words[0]);
  return [...hits.filter(leads), ...hits.filter(e => !leads(e))];
}

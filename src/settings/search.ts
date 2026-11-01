import type { SettingsStrings } from '../i18n';
import { isModule, type ModuleInfo, type Page } from '../modules/types';
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

const SECTIONS: SectionId[] = ['general', 'look', 'notifications', 'pages', 'modules', 'permissions', 'about'];

// Every searchable setting, in sidebar order; modules and pages follow their section.
export function searchIndex(s: SettingsStrings, modules: ModuleInfo[], pages: Page[] = []): SearchEntry[] {
  const k = s.keywords;
  const rows: Record<SectionId, [key: string, label: string, keywords: string][]> = {
    general: [
      ['general.language', s.general.language, k.language],
      ['general.screen', s.general.screen, k.screen],
      ['general.login', s.general.login, k.login],
      ['home.place', s.home.place, k.place],
      ['home.prayerMethod', s.home.prayerMethod, k.prayerMethod],
      ['home.prayerNotice', s.home.prayerNotice, k.channels],
    ],
    look: [
      ['look.bounce', s.look.bounce, k.bounce],
      ['look.speed', s.look.speed, k.speed],
      ['look.dropDepth', s.look.dropDepth, k.dropDepth],
      ['look.thickness', s.look.thickness, k.thickness],
    ],
    notifications: [
      ['notifications.glow', s.notifications.glow, k.glow],
      ['notifications.seconds', s.notifications.seconds, k.seconds],
    ],
    pages: [],
    modules: [],
    permissions: [],
    about: [['about.version', s.about.version, k.version]],
  };
  const entry = (key: string, label: string, where: string, route: Route, extra = ''): SearchEntry =>
    ({ key, label, where, route, text: normalize(`${label} ${where} ${extra}`) });

  return SECTIONS.flatMap(page => {
    const where = s.sections[page];
    const own = rows[page].map(([key, label, keywords]) => entry(key, label, where, { page }, keywords));
    // Each kind of notice an installed module sends, on the Notifikasi page.
    const kinds = page === 'notifications'
      ? modules.filter(m => m.installed).flatMap(m =>
        m.channels.map(c => entry(`channel.${m.id}.${c.id}`, c.name, where, { page }, `${m.name} ${k.channels}`)))
      : [];
    const mods = page === 'modules'
      ? modules.filter(isModule).map(m =>
        entry(`module.${m.id}`, m.name, where, m.installed ? { page: 'module', id: m.id } : { page: 'add' }, m.description))
      : [];
    const named = page === 'pages'
      ? pages.filter(p => p.name !== null).map(p => entry(`page.${p.id}`, p.name!, where, { page: 'pages' }, k.pages))
      : [];
    return [entry(`section.${page}`, where, '', { page }), ...own, ...kinds, ...named, ...mods];
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

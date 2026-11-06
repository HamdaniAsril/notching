import type { SettingsStrings } from '../i18n';
import { inCatalog, isModule, isTool, type ModuleInfo, type Page } from '../modules/types';
import { CHANGELOG } from './changelog';
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

const SECTIONS: SectionId[] = ['general', 'look', 'pages', 'modules', 'shortcuts', 'notifications', 'permissions', 'uninstall', 'about', 'whatsnew'];

// Every searchable setting, in sidebar order; modules and pages follow their section.
export function searchIndex(s: SettingsStrings, modules: ModuleInfo[], pages: Page[] = []): SearchEntry[] {
  const k = s.keywords;
  const rows: Record<SectionId, [key: string, label: string, keywords: string][]> = {
    general: [
      ['general.language', s.general.language, k.language],
      ['general.theme', s.general.theme, k.theme],
      ['home.place', s.home.place, k.place],
      ['general.screen', s.general.screen, k.screen],
      ['general.login', s.general.login, k.login],
      ['home.prayerNotice', s.home.prayerNotice, k.channels],
      ['home.prayerMethod', s.home.prayerMethod, k.prayerMethod],
    ],
    look: [
      ['look.accent', s.look.accent, k.accent],
      ['look.glass', s.look.glass, k.glass],
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
    shortcuts: [
      ['shortcuts.awake', s.shortcuts.awake, k.shortcuts],
      ['shortcuts.shelf', s.shortcuts.shelf, k.shortcuts],
    ],
    permissions: [],
    uninstall: [
      ['uninstall.permissions', s.uninstall.permissions, k.uninstall],
      ['uninstall.app', s.uninstall.uninstall, k.uninstall],
    ],
    // The newest version's card.
    whatsnew: [[`whatsnew.${CHANGELOG[0].version}`, s.whatsNew.title, k.whatsNew]],
    about: [
      ['about.update', s.about.update, `${k.update} ${k.version}`],
      ['about.auto', s.about.auto, k.update],
    ],
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
    // An installed module opens its page; anything else in the Katalog, its card there.
    // Background tools are found under Pintasan, where they are listed.
    const listed = (m: ModuleInfo) => (isTool(m) && m.installed ? page === 'shortcuts' : page === 'modules');
    const mods = page === 'modules' || page === 'shortcuts'
      ? modules.filter(m => (isModule(m) || inCatalog(m)) && listed(m)).map(m => (isModule(m) && m.installed
        ? entry(`module.${m.id}`, m.name, where, { page: 'module', id: m.id }, m.description)
        : entry(`catalog.${m.id}`, m.name, where, { page: 'catalog', id: m.id }, m.description)))
      : [];
    // Screenshot's keys, on its own page (design 3 Nov tombol §6).
    if (page === 'modules' && modules.some(m => m.id === 'screenshot' && m.installed)) {
      mods.push(entry('module.screenshot.keys', s.shotKeys.title, where, { page: 'module', id: 'screenshot' }, k.shotKeys));
    }
    if (page === 'modules' && modules.some(m => m.id === 'shelf' && m.installed)) {
      mods.push(entry('module.shelf.drag', s.modules.shelfDrag, where, { page: 'module', id: 'shelf' }, k.shelfDrag));
    }
    if (page === 'shortcuts' && modules.some(m => m.id === 'window-peek' && m.installed)) {
      const p = s.peek;
      for (const [key, label] of [['peek.dock', p.dock], ['peek.dockClick', p.dockClick], ['peek.switcher', p.switcher],
        ['peek.layout', p.layout], ['peek.place', p.place], ['peek.card', p.card],
        ['peek.material', p.material], ['peek.minimized', p.minimized]] as const) {
        mods.push(entry(key, label, where, { page: 'shortcuts' }, k.peek));
      }
    }
    if (page === 'shortcuts' && modules.some(m => m.id === 'screenshot' && m.installed)) {
      mods.push(entry('module.screenshot.key.screen', s.shotKeys.screen, where, { page: 'shortcuts' }, `${s.shortcuts.screenshot} ${k.shotKeys}`));
      mods.push(entry('module.screenshot.key.pick', s.shotKeys.pick, where, { page: 'shortcuts' }, `${s.shortcuts.screenshot} ${k.shotKeys}`));
    }
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

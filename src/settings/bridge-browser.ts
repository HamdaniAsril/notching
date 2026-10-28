import { catalog } from '../bridge-browser';
import type { Lang } from '../kit/protocol';
import type { ModuleInfo, ModuleState } from '../modules/types';
import { DEFAULT_CONFIG } from '../notch/config';
import type { LanguageChoice, SettingsBridge, SettingsInfo } from './types';

// Stand-in for the native side in a normal browser (`npm run dev`, /settings.html).
// Everything lives in memory; `?lang=en` starts in English. Screens are made up.
export function browserSettingsBridge(params: URLSearchParams): SettingsBridge {
  const deviceLang: Lang = params.get('lang') === 'en' ? 'en' : 'id';
  let info: SettingsInfo = {
    language: 'auto',
    screen: null,
    screens: ['Built-in Retina Display', 'DELL U2723QE'],
    login: 'off',
    version: '0.1.0',
  };
  let state: ModuleState = { lang: deviceLang, modules: catalog(deviceLang, []), lastCard: null, notch: DEFAULT_CONFIG };
  const stateSubs = new Set<(s: ModuleState) => void>();
  const infoSubs = new Set<(s: SettingsInfo) => void>();

  const setState = (next: ModuleState) => { state = next; stateSubs.forEach(cb => cb(state)); };
  const setInfo = (next: SettingsInfo) => { info = next; infoSubs.forEach(cb => cb(info)); };
  const setModule = (id: string, over: Partial<ModuleInfo>) =>
    setState({ ...state, modules: state.modules.map(m => (m.id === id ? { ...m, ...over } : m)) });

  return {
    moduleState: async () => state,
    onModuleState: cb => { stateSubs.add(cb); return () => stateSubs.delete(cb); },
    settings: async () => info,
    onSettings: cb => { infoSubs.add(cb); return () => infoSubs.delete(cb); },
    setLanguage: async (language: LanguageChoice) => {
      const lang: Lang = language === 'auto' ? deviceLang : language;
      // Names follow the language; on/off and installed stay as they were.
      const names = new Map(catalog(lang, []).map(m => [m.id, m]));
      setInfo({ ...info, language });
      setState({
        ...state,
        lang,
        modules: state.modules.map(m => ({ ...m, name: names.get(m.id)!.name, description: names.get(m.id)!.description })),
      });
    },
    setNotchConfig: async notch => setState({ ...state, notch }),
    setScreen: async screen => setInfo({ ...info, screen }),
    setLaunchAtLogin: async on => setInfo({ ...info, login: on ? 'on' : 'off' }),
    openLoginItems: async () => console.info('openLoginItems'),
    setModuleEnabled: async (id, enabled) => setModule(id, { enabled }),
    uninstallModule: async id => setModule(id, { installed: false, enabled: false }),
    reinstallModule: async id => setModule(id, { installed: true, enabled: true }),
    quit: async () => console.info('quit'),
  };
}

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { syncUnlisten } from '../bridge';
import type { ModuleState } from '../modules/types';
import type { Place, SettingsBridge, SettingsInfo } from './types';

// The native side: commands in src-tauri/src/settings_window.rs and
// module_commands.rs; both broadcasts reach every window.
export function tauriSettingsBridge(): SettingsBridge {
  return {
    moduleState: () => invoke<ModuleState>('get_module_state'),
    onModuleState: cb => syncUnlisten(listen<ModuleState>('notching://module-state', e => cb(e.payload))),
    settings: () => invoke<SettingsInfo>('get_settings'),
    onSettings: cb => syncUnlisten(listen<SettingsInfo>('notching://settings', e => cb(e.payload))),
    setLanguage: language => invoke('set_language', { language }),
    setNotchConfig: config => invoke('set_notch_config', { config }),
    setScreen: name => invoke('set_screen', { name }),
    setLaunchAtLogin: on => invoke('set_launch_at_login', { on }),
    openLoginItems: () => invoke('open_login_items'),
    setModuleEnabled: (id, enabled) => invoke('set_module_enabled', { id, enabled }),
    uninstallModule: id => invoke('uninstall_module', { id }),
    reinstallModule: id => invoke('reinstall_module', { id }),
    quit: () => invoke('quit_app'),
    searchPlaces: query => invoke<Place[]>('search_places', { query }),
    setPlace: place => invoke('set_place', { place }),
    setPrayerMethod: method => invoke('set_prayer_method', { method }),
    setShowClock: on => invoke('set_show_clock', { on }),
    setNoticeGlow: on => invoke('set_notice_glow', { on }),
    setNoticeSeconds: seconds => invoke('set_notice_seconds', { seconds }),
    setChannel: (module, channel, { on, sound }) => invoke('set_channel', { module, channel, on, sound }),
    sendSampleNotice: (title, detail) => invoke('send_sample_notice', { title, detail }),
  };
}

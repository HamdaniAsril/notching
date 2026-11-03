import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { syncUnlisten, type ShotKeys } from '../bridge';
import type { ModuleState } from '../modules/types';
import type { Place, SettingsBridge, SettingsInfo } from './types';

// The native side: commands in src-tauri/src/settings_window.rs,
// module_commands.rs and page_commands.rs; both broadcasts reach every window.
export function tauriSettingsBridge(): SettingsBridge {
  return {
    moduleState: () => invoke<ModuleState>('get_module_state'),
    onModuleState: cb => syncUnlisten(listen<ModuleState>('notching://module-state', e => cb(e.payload))),
    settings: () => invoke<SettingsInfo>('get_settings'),
    onSettings: cb => syncUnlisten(listen<SettingsInfo>('notching://settings', e => cb(e.payload))),
    setLanguage: language => invoke('set_language', { language }),
    setNotchConfig: config => invoke('set_notch_config', { config }),
    setAccent: (accent, custom) => invoke('set_accent', { accent, custom }),
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
    setNoticeGlow: on => invoke('set_notice_glow', { on }),
    setNoticeSeconds: seconds => invoke('set_notice_seconds', { seconds }),
    setChannel: (module, channel, { on, sound }) => invoke('set_channel', { module, channel, on, sound }),
    sendSampleNotice: (title, detail) => invoke('send_sample_notice', { title, detail }),
    addPage: (name, icon) => invoke<string>('add_page', { name, icon }),
    setPage: (id, name, icon, widgets, strip) => invoke('set_page', { id, name, icon, widgets, strip }),
    deletePage: id => invoke('delete_page', { id }),
    movePage: (id, to) => invoke('move_page', { id, to }),
    setSampleStatus: on => invoke('set_sample_status', { on }),
    setStatusShown: (module, on) => invoke('set_status_shown', { module, on }),
    openAccessibility: () => invoke('open_accessibility_settings'),
    openScreenRecordingSettings: () => invoke('open_screen_recording_settings'),
    shotKeys: () => invoke<ShotKeys>('shot_keys'),
    openKeyboardShortcuts: () => invoke('open_keyboard_shortcuts'),
    openFullDiskAccessSettings: () => invoke('open_full_disk_access_settings'),
    cleanerExclusions: () => invoke<{ home: string; paths: string[] }>('cleaner_exclusions'),
    cleanerUnexclude: path => invoke('cleaner_unexclude', { path }),
    cleanerOpenLog: () => invoke('cleaner_open_log'),
  };
}

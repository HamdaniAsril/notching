//! Settings, the module store and the module list, behind one lock.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::locale::{resolve_lang, Lang};
use crate::modules::manifest::{CardSize, Permission, TileAction, WidgetKind};
use crate::modules::store::{ChannelEntry, ModuleEntry, ModuleStore, StoreError};
use crate::pages::{self, is_route, Page, PageError, Placement, MODULE_PAGE_PREFIX};
use crate::modules::manifest::Capability;
use crate::status::{Activity, LiveStatus, StatusDto, StatusItemDto, SAMPLE_TEXT};
use crate::settings::{
    clamp_seconds, load_settings, save_settings, ChannelPref, HomeSettings, LanguageSetting, NotchConfig, Place,
    PrayerMethod, Settings,
};
use crate::system_stats::SystemStats;

/// A module's notification channel with the person's switches applied.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelDto {
    pub id: String,
    pub name: String,
    pub on: bool,
    pub sound: bool,
    pub widget: Option<String>,
}

/// A widget a package offers, named in the current language.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetDto {
    pub id: String,
    pub name: String,
    pub entry: String,
    pub width: u8,
    pub kind: WidgetKind,
}

/// How notices look, shared by every overlay.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticeLook {
    pub glow: bool,
    pub seconds: f64,
}

/// Same shape as ModuleInfo in src/modules/types.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfoDto {
    pub id: String,
    pub name: String,
    pub short_name: String,
    pub description: String,
    pub version: String,
    pub entry: Option<String>,
    pub icon: String,
    pub card: Option<CardSize>,
    pub installed: bool,
    pub enabled: bool,
    pub size: u64,
    pub icon_svg: String,
    pub channels: Vec<ChannelDto>,
    /// Empty for a module without widgets; `entry` and `card` are None for a
    /// package of widgets only.
    pub widgets: Vec<WidgetDto>,
    pub activity: Option<Activity>,
    /// Declares the "status" capability, so it may show a status beside the notch.
    pub status: bool,
    pub status_shown: bool,
    /// What its Modul tile runs instead of opening a page.
    pub action: Option<TileAction>,
    pub permissions: Vec<Permission>,
}

/// Broadcast to every window: the notch overlays and the settings window.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStateDto {
    pub lang: Lang,
    pub modules: Vec<ModuleInfoDto>,
    pub pages: Vec<Page>,
    pub last_page: Option<String>,
    pub notch: NotchConfig,
    pub notifications: NoticeLook,
    /// "<module>.<channel>" of notices the person did not see, in the order they came.
    pub missed: Vec<String>,
    /// The sample status from Notifikasi is showing.
    pub sample_status: bool,
    /// The Volt accent and the last custom colour, "#rrggbb".
    pub accent: String,
    pub accent_custom: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum CoreError {
    Store(StoreError),
    Save(String),
    Invalid(String),
    Page(PageError),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Store(e) => write!(f, "{e}"),
            CoreError::Save(e) => write!(f, "saving settings failed: {e}"),
            CoreError::Invalid(what) => write!(f, "invalid value: {what}"),
            CoreError::Page(e) => write!(f, "{e}"),
        }
    }
}

pub struct AppCore {
    settings_path: PathBuf,
    settings: Settings,
    store: ModuleStore,
    device_locale: Option<String>,
    modules: Vec<ModuleEntry>,
    // Kept in memory only: a restart forgets missed notices and statuses.
    missed: Vec<String>,
    live: LiveStatus,
    // The status last sent beside the notch, to send only changes.
    shown_status: Option<StatusDto>,
}

pub struct CoreState(pub Mutex<AppCore>);
pub struct StatsState(pub Mutex<SystemStats>);

impl AppCore {
    /// Loads the settings, refreshes the installed modules from the bundle and
    /// lists them.
    pub fn open(settings_path: PathBuf, store: ModuleStore, device_locale: Option<String>) -> AppCore {
        let settings = load_settings(&settings_path);
        store.sync(&settings);
        let mut core =
            AppCore {
            settings_path,
            settings,
            store,
            device_locale,
            modules: Vec::new(),
            missed: Vec::new(),
            live: LiveStatus::default(),
            shown_status: None,
        };
        core.relist();
        core
    }

    pub fn lang(&self) -> Lang {
        resolve_lang(self.settings.language, self.device_locale.as_deref())
    }

    fn relist(&mut self) {
        self.modules = self.store.list(&self.settings, self.lang());
    }

    pub fn state(&self) -> ModuleStateDto {
        ModuleStateDto {
            lang: self.lang(),
            modules: self
                .modules
                .iter()
                .map(|e| ModuleInfoDto {
                    id: e.manifest.id.clone(),
                    name: e.name.clone(),
                    short_name: e.short_name.clone(),
                    description: e.description.clone(),
                    version: e.manifest.version.clone(),
                    entry: e.manifest.entry.clone(),
                    icon: e.manifest.icon.clone(),
                    card: e.manifest.card,
                    installed: e.installed,
                    enabled: e.enabled,
                    size: e.size,
                    icon_svg: e.icon_svg.clone(),
                    channels: e
                        .channels
                        .iter()
                        .map(|c| {
                            let pref = self.pref(&e.manifest.id, c);
                            let widget =
                                e.manifest.notifications.iter().find(|s| s.id == c.id).and_then(|s| s.widget.clone());
                            ChannelDto { id: c.id.clone(), name: c.name.clone(), on: pref.on, sound: pref.sound, widget }
                        })
                        .collect(),
                    widgets: e
                        .widgets
                        .iter()
                        .map(|w| WidgetDto {
                            id: w.id.clone(),
                            name: w.name.clone(),
                            entry: w.entry.clone(),
                            width: w.width,
                            kind: w.kind,
                        })
                        .collect(),
                    activity: self.live.activity(&e.manifest.id),
                    status: e.manifest.capabilities.contains(&Capability::Status),
                    status_shown: !self.settings.status_off.contains(&e.manifest.id),
                    action: e.manifest.action.clone(),
                    permissions: e.manifest.permissions.clone(),
                })
                .collect(),
            pages: self.settings.pages.clone(),
            last_page: self.settings.last_page.clone(),
            notch: self.settings.notch,
            notifications: self.notice_look(),
            missed: self.missed.clone(),
            sample_status: self.live.has_sample(),
            accent: self.settings.accent.clone(),
            accent_custom: self.settings.accent_custom.clone(),
        }
    }

    /// A module's status (it must declare "status"), or the sample's when `module`
    /// is None. True when its activity changed.
    pub fn set_status(&mut self, module: Option<&str>, activity: Activity, text: Option<&str>) -> Result<bool, CoreError> {
        if let Some(id) = module {
            if !self.module(id).is_some_and(|e| e.manifest.capabilities.contains(&Capability::Status)) {
                return Err(CoreError::Invalid("status".into()));
            }
        }
        Ok(self.live.set(module, activity, text))
    }

    pub fn set_status_icon(&mut self, module: &str, activity: Activity) -> Result<bool, CoreError> {
        if !self.module(module).is_some_and(|e| e.manifest.capabilities.contains(&Capability::Status)) {
            return Err(CoreError::Invalid("status".into()));
        }
        Ok(self.live.set_icon(module, activity))
    }

    pub fn clear_status(&mut self, module: Option<&str>) -> bool {
        self.live.clear(module)
    }

    pub fn set_sample_status(&mut self, on: bool) {
        if on {
            self.live.set(None, Activity::Running, Some(SAMPLE_TEXT));
        } else {
            self.live.clear(None);
        }
    }

    pub fn set_status_shown(&mut self, id: &str, on: bool) -> Result<(), CoreError> {
        if self.module(id).is_none() {
            return Err(CoreError::Store(StoreError::UnknownModule(id.into())));
        }
        self.settings.status_off.retain(|m| m != id);
        if !on {
            self.settings.status_off.push(id.to_string());
        }
        self.save()
    }

    /// The status beside the notch on `screen`, when it differs from the one last
    /// sent. Switched-off statuses and modules that are off or gone do not show.
    pub fn status_change(&mut self, screen: &str) -> Option<Option<StatusDto>> {
        let off: Vec<String> = self
            .modules
            .iter()
            .filter(|e| !e.installed || !e.enabled || self.settings.status_off.contains(&e.manifest.id))
            .map(|e| e.manifest.id.clone())
            .collect();
        let items: Vec<StatusItemDto> =
            self.live.shown(&off).into_iter().map(|(module_id, text)| StatusItemDto { module_id, text }).collect();
        let next = (!items.is_empty()).then(|| StatusDto { screen: screen.into(), items });
        if next == self.shown_status {
            return None;
        }
        self.shown_status = next.clone();
        Some(next)
    }

    pub fn status(&self) -> Option<StatusDto> {
        self.shown_status.clone()
    }

    fn pref(&self, module: &str, c: &ChannelEntry) -> ChannelPref {
        let defaults = ChannelPref { on: c.on, sound: c.sound };
        self.settings.notifications.channels.get(&format!("{module}.{}", c.id)).copied().unwrap_or(defaults)
    }

    /// The person's switches for a channel of a module that is switched on.
    /// None: the module is off or gone, or has no such channel.
    pub fn channel(&self, module: &str, channel: &str) -> Option<ChannelPref> {
        let e = self.module(module).filter(|e| e.enabled)?;
        let c = e.channels.iter().find(|c| c.id == channel)?;
        Some(self.pref(module, c))
    }

    pub fn notice_look(&self) -> NoticeLook {
        NoticeLook { glow: self.settings.notifications.glow, seconds: self.settings.notifications.seconds }
    }

    pub fn set_glow(&mut self, on: bool) -> Result<(), CoreError> {
        self.settings.notifications.glow = on;
        self.save()
    }

    pub fn set_notice_seconds(&mut self, seconds: f64) -> Result<(), CoreError> {
        self.settings.notifications.seconds = clamp_seconds(seconds);
        self.save()
    }

    pub fn set_channel(&mut self, module: &str, channel: &str, pref: ChannelPref) -> Result<(), CoreError> {
        let e = self.module(module).ok_or_else(|| CoreError::Store(StoreError::UnknownModule(module.to_string())))?;
        if !e.channels.iter().any(|c| c.id == channel) {
            return Err(CoreError::Invalid(format!("channel {module}.{channel}")));
        }
        self.settings.notifications.channels.insert(format!("{module}.{channel}"), pref);
        self.save()
    }

    /// Once per channel, in the order the notices came.
    pub fn mark_missed(&mut self, module: &str, channel: &str) {
        let key = format!("{module}.{channel}");
        if !self.missed.contains(&key) {
            self.missed.push(key);
        }
    }

    /// True if there was something to clear.
    pub fn clear_missed(&mut self) -> bool {
        let had = !self.missed.is_empty();
        self.missed.clear();
        had
    }

    /// A module's text in the language in use, by dotted key.
    pub fn module_text(&self, id: &str, key: &str) -> Option<String> {
        self.store.module_text(id, self.lang(), key)
    }

    pub fn module(&self, id: &str) -> Option<&ModuleEntry> {
        self.modules.iter().find(|e| e.manifest.id == id)
    }

    /// Installed and switched on: only then are its files served.
    pub fn servable(&self, id: &str) -> bool {
        self.module(id).is_some_and(|e| e.enabled)
    }

    pub fn active_dir(&self) -> &Path {
        self.store.active_dir()
    }

    pub fn language(&self) -> LanguageSetting {
        self.settings.language
    }

    pub fn screen(&self) -> Option<&str> {
        self.settings.screen.as_deref()
    }

    /// Module names and descriptions follow the new language at once.
    pub fn set_language(&mut self, language: LanguageSetting) -> Result<(), CoreError> {
        self.settings.language = language;
        self.changed()
    }

    pub fn set_notch(&mut self, config: NotchConfig) -> Result<(), CoreError> {
        self.settings.notch = config.clamped();
        self.save()
    }

    /// `custom` None keeps the last custom colour.
    pub fn set_accent(&mut self, accent: String, custom: Option<String>) -> Result<(), CoreError> {
        let bad = || CoreError::Invalid("accent".into());
        let accent = crate::settings::normalize_accent(&accent).ok_or_else(bad)?;
        let custom = match custom {
            Some(c) => Some(crate::settings::normalize_accent(&c).ok_or_else(bad)?),
            None => self.settings.accent_custom.clone(),
        };
        self.settings.accent = accent;
        self.settings.accent_custom = custom;
        self.save()
    }

    pub fn shot_keys(&self) -> crate::shot_keys::ShotKeys {
        self.settings.shot_keys
    }

    pub fn set_shot_keys(&mut self, keys: crate::shot_keys::ShotKeys) -> Result<(), CoreError> {
        self.settings.shot_keys = keys;
        self.save()
    }

    pub fn shot_notice(&self) -> bool {
        self.settings.shot_notice
    }

    pub fn set_shot_notice(&mut self) -> Result<(), CoreError> {
        self.settings.shot_notice = true;
        self.save()
    }

    /// An empty name means every screen, like None.
    pub fn set_screen(&mut self, name: Option<String>) -> Result<(), CoreError> {
        self.settings.screen = name.filter(|n| !n.is_empty());
        self.save()
    }

    pub fn home(&self) -> &HomeSettings {
        &self.settings.home
    }

    pub fn set_place(&mut self, place: Option<Place>) -> Result<(), CoreError> {
        if place.as_ref().is_some_and(|p| !p.is_valid()) {
            return Err(CoreError::Invalid("place".into()));
        }
        self.settings.home.place = place;
        self.save()
    }

    pub fn set_prayer_method(&mut self, method: PrayerMethod) -> Result<(), CoreError> {
        self.settings.home.prayer_method = method;
        self.save()
    }

    /// A page, the Modul page, or the page of an installed module.
    pub fn set_last_page(&mut self, route: &str) -> Result<(), CoreError> {
        let module_ok = route
            .strip_prefix(MODULE_PAGE_PREFIX)
            .is_none_or(|id| self.module(id).is_some_and(|e| e.installed && e.manifest.has_page()));
        if !is_route(&self.settings.pages, route) || !module_ok {
            return Err(CoreError::Invalid("page".into()));
        }
        self.settings.last_page = Some(route.to_string());
        self.save()
    }

    /// The width of "<package>/<widget>" when its package is installed and on.
    pub fn widget_width(&self, r: &str) -> Option<u8> {
        let (package, widget) = r.split_once('/')?;
        let e = self.module(package).filter(|e| e.installed && e.enabled)?;
        e.widgets.iter().find(|w| w.id == widget).map(|w| w.width)
    }

    pub fn add_page(&mut self, name: &str, icon: &str) -> Result<String, CoreError> {
        let id = pages::add_page(&mut self.settings.pages, name, icon).map_err(CoreError::Page)?;
        self.save()?;
        Ok(id)
    }

    pub fn set_page(
        &mut self,
        id: &str,
        name: Option<&str>,
        icon: &str,
        widgets: Vec<Placement>,
        strip: Option<String>,
    ) -> Result<(), CoreError> {
        let mut next = self.settings.pages.clone();
        pages::set_page(&mut next, id, name, icon, widgets, strip, &|r| self.widget_width(r)).map_err(CoreError::Page)?;
        self.settings.pages = next;
        self.save()
    }

    /// A last page that pointed at it is forgotten, so the panel opens on Beranda.
    pub fn delete_page(&mut self, id: &str) -> Result<(), CoreError> {
        pages::delete_page(&mut self.settings.pages, id).map_err(CoreError::Page)?;
        if self.settings.last_page.as_deref() == Some(id) {
            self.settings.last_page = None;
        }
        self.save()
    }

    pub fn move_page(&mut self, id: &str, to: usize) -> Result<(), CoreError> {
        pages::move_page(&mut self.settings.pages, id, to).map_err(CoreError::Page)?;
        self.save()
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<(), CoreError> {
        self.store.set_enabled(id, enabled, &mut self.settings).map_err(CoreError::Store)?;
        self.changed()
    }

    /// Uninstalling Screenshot also puts its keys back (design 3 Nov tombol §6).
    pub fn uninstall(&mut self, id: &str) -> Result<(), CoreError> {
        self.store.uninstall(id, &mut self.settings).map_err(CoreError::Store)?;
        if id == crate::shot::MODULE_ID {
            self.settings.shot_keys = crate::shot_keys::ShotKeys::default();
        }
        self.changed()
    }

    pub fn reinstall(&mut self, id: &str) -> Result<(), CoreError> {
        self.store.reinstall(id, &mut self.settings).map_err(CoreError::Store)?;
        self.changed()
    }

    fn changed(&mut self) -> Result<(), CoreError> {
        self.relist();
        self.save()
    }

    fn save(&self) -> Result<(), CoreError> {
        save_settings(&self.settings_path, &self.settings).map_err(|e| CoreError::Save(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::store::fake_bundle;
    use crate::settings::SETTINGS_FILE;

    fn open(d: &tempfile::TempDir, locale: Option<&str>) -> AppCore {
        let store = ModuleStore::new(d.path().join("bundle"), d.path().join("active"));
        AppCore::open(d.path().join(SETTINGS_FILE), store, locale.map(String::from))
    }

    fn setup() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fake_bundle(&d.path().join("bundle"));
        d
    }

    #[test]
    fn state_lists_the_modules_in_the_device_language() {
        let d = setup();
        let s = open(&d, Some("en-US")).state();
        assert_eq!(s.lang, Lang::En);
        assert_eq!(s.modules.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["Module A", "Module B", "Widget W"]);
        assert_eq!(s.last_page, None);
        assert_eq!(s.modules[0].card, Some(CardSize { width: 400, height: 90 }));
        assert!(d.path().join("active/a/index.html").exists());
    }

    #[test]
    fn state_carries_pages_widgets_and_short_names() {
        let d = setup();
        let s = open(&d, Some("en-US")).state();
        assert_eq!(s.pages, [crate::pages::beranda()]);
        assert_eq!(s.last_page, None);
        assert_eq!((s.modules[2].entry.as_deref(), s.modules[2].card), (None, None));
        assert_eq!(s.modules[2].widgets[0].name, "One");
        assert_eq!(s.modules[2].widgets[0].width, 1);
        assert_eq!(s.modules[0].short_name, "Module A");
        assert!(s.modules.iter().all(|m| m.activity.is_none()));
    }

    // The fake bundle with the real Screenshot module beside it.
    fn setup_with_screenshot() -> tempfile::TempDir {
        let d = setup();
        let bundle = d.path().join("bundle");
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../modules/screenshot");
        let dst = bundle.join("screenshot");
        std::fs::create_dir_all(dst.join("locales")).unwrap();
        for f in ["manifest.json", "icon.svg", "locales/id.json", "locales/en.json"] {
            std::fs::copy(src.join(f), dst.join(f)).unwrap();
        }
        std::fs::write(bundle.join("index.json"), r#"["a","b","w","screenshot"]"#).unwrap();
        d
    }

    #[test]
    fn shot_keys_save_and_uninstall_resets_them() {
        use crate::shot_keys::{Combo, ShotKeys, CONTROL, SHIFT};
        let d = setup_with_screenshot();
        let mine = ShotKeys { screen: Combo { code: 1, mods: CONTROL | SHIFT }, ..ShotKeys::default() };
        open(&d, None).set_shot_keys(mine).unwrap();
        assert_eq!(open(&d, None).shot_keys(), mine);
        let mut core = open(&d, None);
        core.set_enabled("screenshot", false).unwrap();
        assert_eq!(core.shot_keys(), mine);
        core.uninstall("a").unwrap();
        assert_eq!(core.shot_keys(), mine);
        core.uninstall("screenshot").unwrap();
        assert_eq!(core.shot_keys(), ShotKeys::default());
        assert_eq!(open(&d, None).shot_keys(), ShotKeys::default());
    }

    #[test]
    fn shot_notice_is_saved() {
        let d = setup();
        assert!(!open(&d, None).shot_notice());
        open(&d, None).set_shot_notice().unwrap();
        assert!(open(&d, None).shot_notice());
    }

    #[test]
    fn set_accent_saves_and_shows_in_the_state() {
        let d = setup();
        open(&d, None).set_accent("#FF8A3D".into(), None).unwrap();
        let s = open(&d, None).state();
        assert_eq!((s.accent.as_str(), s.accent_custom), ("#ff8a3d", None));
    }

    #[test]
    fn set_accent_keeps_the_custom_colour_when_none_comes() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_accent("#123456".into(), Some("#123456".into())).unwrap();
        core.set_accent("#c8f04a".into(), None).unwrap();
        let s = core.state();
        assert_eq!((s.accent.as_str(), s.accent_custom.as_deref()), ("#c8f04a", Some("#123456")));
    }

    #[test]
    fn set_accent_rejects_a_bad_hex() {
        let d = setup();
        let mut core = open(&d, None);
        assert_eq!(core.set_accent("nope".into(), None), Err(CoreError::Invalid("accent".into())));
        assert_eq!(core.set_accent("#c8f04a".into(), Some("x".into())), Err(CoreError::Invalid("accent".into())));
        assert_eq!(core.state().accent, "#c8f04a");
    }

    #[test]
    fn the_last_page_survives_a_restart() {
        let d = setup();
        open(&d, None).set_last_page("module:b").unwrap();
        assert_eq!(open(&d, None).state().last_page, Some("module:b".into()));
        open(&d, None).set_last_page("modules").unwrap();
        assert_eq!(open(&d, None).state().last_page, Some("modules".into()));
    }

    fn at(widget: &str, col: u8, width: u8) -> Placement {
        Placement { widget: widget.into(), col, width }
    }

    #[test]
    fn status_switches_are_saved() {
        let d = setup();
        let mut core = open(&d, None);
        assert!(core.state().modules[0].status_shown);
        core.set_status_shown("a", false).unwrap();
        assert_eq!(core.settings.status_off, ["a"]);
        assert!(!open(&d, None).state().modules[0].status_shown);
        core.set_status_shown("a", true).unwrap();
        assert!(open(&d, None).state().modules[0].status_shown);
        assert!(matches!(core.set_status_shown("zzz", false), Err(CoreError::Store(_))));
    }

    #[test]
    fn only_declared_modules_may_show_a_status() {
        let d = setup();
        let mut core = open(&d, None);
        let s = core.state();
        assert_eq!((s.modules[0].status, s.modules[1].status), (true, false));
        assert!(core.set_status(Some("a"), Activity::Running, Some("18:42")).is_ok());
        assert_eq!(core.set_status(Some("b"), Activity::Running, Some("1")), Err(CoreError::Invalid("status".into())));
        assert_eq!(core.state().modules[0].activity, Some(Activity::Running));
        assert_eq!(core.state().modules[1].activity, None);
    }

    #[test]
    fn the_status_shown_is_sent_only_when_it_changes() {
        let d = setup();
        let mut core = open(&d, None);
        assert_eq!(core.status_change("Built-in"), None);
        core.set_status(Some("a"), Activity::Running, Some("18:42")).unwrap();
        let item = StatusItemDto { module_id: Some("a".into()), text: "18:42".into() };
        let dto = StatusDto { screen: "Built-in".into(), items: vec![item.clone()] };
        assert_eq!(core.status_change("Built-in"), Some(Some(dto.clone())));
        assert_eq!(core.status_change("Built-in"), None);
        assert_eq!(core.status(), Some(dto.clone()));
        assert_eq!(core.status_change("DELL"), Some(Some(StatusDto { screen: "DELL".into(), ..dto })));
        // Switched off, uninstalled or turned off, the module's status is not shown.
        core.set_status_shown("a", false).unwrap();
        assert_eq!(core.status_change("DELL"), Some(None));
        core.set_status_shown("a", true).unwrap();
        core.set_enabled("a", false).unwrap();
        assert_eq!(core.status_change("DELL"), None);
    }

    #[test]
    fn status_change_sends_the_whole_list_once() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_status(Some("a"), Activity::Running, Some("18:42")).unwrap();
        core.set_sample_status(true);
        let sent = core.status_change("Built-in").unwrap().unwrap();
        assert_eq!(sent.items.iter().map(|i| i.text.as_str()).collect::<Vec<_>>(), ["18:42", "18:42"]);
        assert_eq!(sent.items[1].module_id, None);
        assert_eq!(core.status_change("Built-in"), None);
    }

    #[test]
    fn the_sample_status_shows_until_turned_off() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_sample_status(true);
        assert!(core.state().sample_status);
        assert_eq!(core.status_change("Built-in").unwrap().unwrap().items[0].text, "18:42");
        core.set_sample_status(false);
        assert!(!core.state().sample_status);
        assert_eq!(core.status_change("Built-in"), Some(None));
    }

    #[test]
    fn pages_are_added_changed_and_saved() {
        let d = setup();
        let mut core = open(&d, None);
        let id = core.add_page("Kerja", "briefcase").unwrap();
        assert_eq!(id, "p1");
        core.set_page("p1", Some("Kerja"), "briefcase", vec![at("w/one", 0, 1), at("b/big", 2, 1)], None).unwrap();
        let pages = open(&d, None).state().pages;
        assert_eq!(pages[1].widgets, [at("w/one", 0, 1), at("b/big", 2, 2)]);
        core.move_page("p1", 0).unwrap();
        assert!(matches!(core.set_page("home", Some("X"), "home", vec![], None), Err(CoreError::Page(PageError::Fixed))));
        assert_eq!(CoreError::Page(PageError::BadIcon).to_string(), "unknown icon");
    }

    #[test]
    fn deleting_the_last_page_forgets_it() {
        let d = setup();
        let mut core = open(&d, None);
        core.add_page("Kerja", "briefcase").unwrap();
        core.set_last_page("p1").unwrap();
        core.delete_page("p1").unwrap();
        assert_eq!(core.state().last_page, None);
        let again = open(&d, None).state();
        assert_eq!((again.pages.len(), again.last_page), (1, None));
    }

    #[test]
    fn a_switched_off_module_widget_cannot_be_added() {
        let d = setup();
        let mut core = open(&d, None);
        core.add_page("Kerja", "briefcase").unwrap();
        assert_eq!(core.widget_width("b/big"), Some(2));
        core.set_enabled("b", false).unwrap();
        assert_eq!(core.widget_width("b/big"), None);
        assert!(matches!(
            core.set_page("p1", Some("Kerja"), "dot", vec![at("b/big", 0, 2)], None),
            Err(CoreError::Page(PageError::UnknownWidget(_)))
        ));
        assert_eq!(core.widget_width("w/one"), Some(1));
        assert_eq!(core.widget_width("w/zzz"), None);
    }

    #[test]
    fn unknown_last_pages_are_refused() {
        let d = setup();
        let mut core = open(&d, None);
        for bad in ["p9", "module:w", "module:zzz", ""] {
            assert!(matches!(core.set_last_page(bad), Err(CoreError::Invalid(_))), "{bad}");
        }
        assert!(!d.path().join(SETTINGS_FILE).exists());
    }

    #[test]
    fn an_uninstalled_module_page_is_refused() {
        let d = setup();
        let mut core = open(&d, None);
        core.uninstall("a").unwrap();
        assert!(core.set_last_page("module:a").is_err());
    }

    #[test]
    fn a_switched_off_module_is_not_served() {
        let d = setup();
        let mut core = open(&d, None);
        assert!(core.servable("a"));
        core.set_enabled("a", false).unwrap();
        assert!(!core.servable("a"));
        assert!(!core.state().modules[0].enabled);
        assert!(!open(&d, None).servable("a"));
    }

    #[test]
    fn uninstall_and_reinstall_round_trip() {
        let d = setup();
        let mut core = open(&d, None);
        core.uninstall("a").unwrap();
        assert!(!d.path().join("active/a").exists());
        assert!(!core.state().modules[0].installed);
        assert!(!core.servable("a"));
        let mut core = open(&d, None);
        assert!(!d.path().join("active/a").exists());
        core.reinstall("a").unwrap();
        assert!(d.path().join("active/a/index.html").exists());
        assert!(core.servable("a"));
    }

    #[test]
    fn a_language_choice_renames_the_modules_and_survives_a_restart() {
        let d = setup();
        let mut core = open(&d, Some("en-US"));
        core.set_language(LanguageSetting::Id).unwrap();
        let s = core.state();
        assert_eq!(s.lang, Lang::Id);
        assert_eq!(s.modules.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["Modul A", "Modul B", "Widget W"]);
        assert_eq!(open(&d, Some("en-US")).language(), LanguageSetting::Id);
    }

    #[test]
    fn notch_config_is_clamped_saved_and_shared() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_notch(NotchConfig { bounce: 150.0, thickness: 1.0, ..Default::default() }).unwrap();
        let want = NotchConfig { bounce: 100.0, speed: 200.0, drop_depth: 9.0, thickness: 2.0 };
        assert_eq!(core.state().notch, want);
        assert_eq!(open(&d, None).state().notch, want);
    }

    #[test]
    fn an_empty_screen_name_means_every_screen() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_screen(Some("".into())).unwrap();
        assert_eq!(core.screen(), None);
        core.set_screen(Some("DELL".into())).unwrap();
        assert_eq!(open(&d, None).screen(), Some("DELL"));
    }

    fn jakarta() -> Place {
        Place {
            name: "Jakarta".into(),
            region: "Jakarta".into(),
            country: "Indonesia".into(),
            latitude: -6.21462,
            longitude: 106.84513,
        }
    }

    #[test]
    fn beranda_settings_are_saved() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_place(Some(jakarta())).unwrap();
        core.set_prayer_method(PrayerMethod::Karachi).unwrap();
        let want = HomeSettings { place: Some(jakarta()), prayer_method: PrayerMethod::Karachi };
        assert_eq!(core.home(), &want);
        assert_eq!(open(&d, None).home(), &want);
    }

    #[test]
    fn an_invalid_place_is_refused() {
        let d = setup();
        let mut core = open(&d, None);
        let bad = Place { latitude: f64::NAN, ..jakarta() };
        assert!(matches!(core.set_place(Some(bad)), Err(CoreError::Invalid(_))));
        assert_eq!(core.home().place, None);
        assert!(!d.path().join(SETTINGS_FILE).exists());
    }

    #[test]
    fn state_carries_icons_and_sizes() {
        let d = setup();
        let s = open(&d, None).state();
        assert_eq!(s.modules[0].icon_svg, "<svg/>");
        assert!(s.modules[0].size > 0);
    }

    #[test]
    fn channels_resolve_defaults_and_choices() {
        let d = setup();
        let mut core = open(&d, None);
        let ping = |on, sound| ChannelDto { id: "ping".into(), name: "Ping".into(), on, sound, widget: None };
        assert_eq!(core.state().modules[0].channels, [ping(true, false)]);
        core.set_channel("a", "ping", ChannelPref { on: false, sound: true }).unwrap();
        assert_eq!(core.state().modules[0].channels, [ping(false, true)]);
        assert_eq!(open(&d, None).state().modules[0].channels, [ping(false, true)]);
        assert_eq!(core.channel("a", "ping"), Some(ChannelPref { on: false, sound: true }));
    }

    #[test]
    fn a_switched_off_module_has_no_live_channels() {
        let d = setup();
        let mut core = open(&d, None);
        assert!(core.channel("a", "ping").is_some());
        core.set_enabled("a", false).unwrap();
        assert_eq!(core.channel("a", "ping"), None);
    }

    #[test]
    fn unknown_channels_are_refused() {
        let d = setup();
        let mut core = open(&d, None);
        let pref = ChannelPref { on: true, sound: true };
        assert!(core.set_channel("a", "zzz", pref).is_err());
        assert!(core.set_channel("zzz", "ping", pref).is_err());
        assert!(!d.path().join(SETTINGS_FILE).exists());
    }

    #[test]
    fn channels_name_their_widget() {
        let d = setup();
        let s = open(&d, None).state();
        assert_eq!(s.modules[2].channels[0].widget.as_deref(), Some("one"));
        assert_eq!(s.modules[0].channels[0].widget, None);
    }

    #[test]
    fn missed_marks_are_kept_once_and_cleared() {
        let d = setup();
        let mut core = open(&d, None);
        core.mark_missed("a", "ping");
        core.mark_missed("a", "ping");
        assert_eq!(core.state().missed, ["a.ping"]);
        assert!(core.clear_missed());
        assert!(core.state().missed.is_empty());
        assert!(!core.clear_missed());
    }

    #[test]
    fn the_notice_look_is_shared() {
        let d = setup();
        let mut core = open(&d, None);
        core.set_glow(false).unwrap();
        core.set_notice_seconds(6.0).unwrap();
        let want = NoticeLook { glow: false, seconds: 6.0 };
        assert_eq!(core.state().notifications, want);
        assert_eq!(core.notice_look(), want);
        assert_eq!(open(&d, None).notice_look(), want);
    }
}

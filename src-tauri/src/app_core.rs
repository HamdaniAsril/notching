//! Settings, the module store and the module list, behind one lock.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::locale::{resolve_lang, Lang};
use crate::modules::manifest::CardSize;
use crate::modules::store::{ModuleEntry, ModuleStore, StoreError};
use crate::settings::{load_settings, save_settings, HomeSettings, LanguageSetting, NotchConfig, Place, PrayerMethod, Settings};
use crate::system_stats::SystemStats;

/// Same shape as ModuleInfo in src/modules/types.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfoDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub entry: String,
    pub icon: String,
    pub card: CardSize,
    pub installed: bool,
    pub enabled: bool,
    pub size: u64,
    pub icon_svg: String,
}

/// Broadcast to every window: the notch overlays and the settings window.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStateDto {
    pub lang: Lang,
    pub modules: Vec<ModuleInfoDto>,
    pub last_card: Option<String>,
    pub notch: NotchConfig,
}

#[derive(Debug, PartialEq)]
pub enum CoreError {
    Store(StoreError),
    Save(String),
    Invalid(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Store(e) => write!(f, "{e}"),
            CoreError::Save(e) => write!(f, "saving settings failed: {e}"),
            CoreError::Invalid(what) => write!(f, "invalid value: {what}"),
        }
    }
}

pub struct AppCore {
    settings_path: PathBuf,
    settings: Settings,
    store: ModuleStore,
    device_locale: Option<String>,
    modules: Vec<ModuleEntry>,
}

pub struct CoreState(pub Mutex<AppCore>);
pub struct StatsState(pub Mutex<SystemStats>);

impl AppCore {
    /// Loads the settings, refreshes the installed modules from the bundle and
    /// lists them.
    pub fn open(settings_path: PathBuf, store: ModuleStore, device_locale: Option<String>) -> AppCore {
        let settings = load_settings(&settings_path);
        store.sync(&settings);
        let mut core = AppCore { settings_path, settings, store, device_locale, modules: Vec::new() };
        core.relist();
        core
    }

    fn lang(&self) -> Lang {
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
                    description: e.description.clone(),
                    version: e.manifest.version.clone(),
                    entry: e.manifest.entry.clone(),
                    icon: e.manifest.icon.clone(),
                    card: e.manifest.card,
                    installed: e.installed,
                    enabled: e.enabled,
                    size: e.size,
                    icon_svg: e.icon_svg.clone(),
                })
                .collect(),
            last_card: self.settings.last_card.clone(),
            notch: self.settings.notch,
        }
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

    pub fn set_show_clock(&mut self, on: bool) -> Result<(), CoreError> {
        self.settings.home.show_clock = on;
        self.save()
    }

    pub fn set_last_card(&mut self, id: &str) -> Result<(), CoreError> {
        if self.module(id).is_none() {
            return Err(CoreError::Store(StoreError::UnknownModule(id.to_string())));
        }
        self.settings.last_card = Some(id.to_string());
        self.save()
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<(), CoreError> {
        self.store.set_enabled(id, enabled, &mut self.settings).map_err(CoreError::Store)?;
        self.changed()
    }

    pub fn uninstall(&mut self, id: &str) -> Result<(), CoreError> {
        self.store.uninstall(id, &mut self.settings).map_err(CoreError::Store)?;
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
        assert_eq!(s.modules.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["Module A", "Module B"]);
        assert_eq!(s.last_card, None);
        assert_eq!(s.modules[0].card, CardSize { width: 400, height: 90 });
        assert!(d.path().join("active/a/index.html").exists());
    }

    #[test]
    fn the_last_card_survives_a_restart() {
        let d = setup();
        open(&d, None).set_last_card("b").unwrap();
        assert_eq!(open(&d, None).state().last_card, Some("b".into()));
    }

    #[test]
    fn an_unknown_last_card_is_refused() {
        let d = setup();
        let mut core = open(&d, None);
        assert!(core.set_last_card("zzz").is_err());
        assert!(!d.path().join(SETTINGS_FILE).exists());
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
        assert_eq!(s.modules.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), ["Modul A", "Modul B"]);
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
        core.set_show_clock(false).unwrap();
        let want = HomeSettings { place: Some(jakarta()), prayer_method: PrayerMethod::Karachi, show_clock: false };
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
}

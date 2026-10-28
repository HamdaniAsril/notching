//! Settings, the module store and the module list, behind one lock.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::locale::{resolve_lang, Lang};
use crate::modules::manifest::CardSize;
use crate::modules::store::{ModuleEntry, ModuleStore, StoreError};
use crate::settings::{load_settings, save_settings, Settings};
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
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleStateDto {
    pub lang: Lang,
    pub modules: Vec<ModuleInfoDto>,
    pub last_card: Option<String>,
}

#[derive(Debug, PartialEq)]
pub enum CoreError {
    Store(StoreError),
    Save(String),
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::Store(e) => write!(f, "{e}"),
            CoreError::Save(e) => write!(f, "saving settings failed: {e}"),
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
                })
                .collect(),
            last_card: self.settings.last_card.clone(),
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
}

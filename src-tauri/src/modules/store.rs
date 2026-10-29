//! The module catalog: original packages in the app bundle, installed copies in
//! the active folder.

use std::path::{Path, PathBuf};

use super::manifest::{parse_manifest, Manifest, WidgetKind};
use crate::locale::Lang;
use crate::settings::Settings;

/// A notification channel with its name in the current language and its
/// defaults from the manifest.
#[derive(Clone, Debug, PartialEq)]
pub struct ChannelEntry {
    pub id: String,
    pub name: String,
    pub on: bool,
    pub sound: bool,
}

/// A widget with its name in the current language.
#[derive(Clone, Debug, PartialEq)]
pub struct WidgetEntry {
    pub id: String,
    pub name: String,
    pub entry: String,
    pub width: u8,
    pub kind: WidgetKind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ModuleEntry {
    pub manifest: Manifest,
    pub name: String,
    /// For the Modul page's small tiles; the name when the locale has none.
    pub short_name: String,
    pub description: String,
    pub installed: bool,
    pub enabled: bool,
    /// Bytes of the original package, so uninstalled modules have one too.
    pub size: u64,
    /// The icon file's SVG text, read from the original package.
    pub icon_svg: String,
    pub channels: Vec<ChannelEntry>,
    pub widgets: Vec<WidgetEntry>,
}

#[derive(Debug, PartialEq)]
pub enum StoreError {
    UnknownModule(String),
    /// A widget package: it cannot be switched off, uninstalled or reinstalled.
    NotAModule(String),
    Io(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::UnknownModule(id) => write!(f, "unknown module {id}"),
            StoreError::NotAModule(id) => write!(f, "{id} is not a module"),
            StoreError::Io(e) => write!(f, "{e}"),
        }
    }
}

fn io(e: std::io::Error) -> StoreError {
    StoreError::Io(e.to_string())
}

pub struct ModuleStore {
    bundle_dir: PathBuf,
    active_dir: PathBuf,
}

impl ModuleStore {
    pub fn new(bundle_dir: PathBuf, active_dir: PathBuf) -> Self {
        ModuleStore { bundle_dir, active_dir }
    }

    pub fn active_dir(&self) -> &Path {
        &self.active_dir
    }

    /// Module ids in catalog order (index.json in the bundle). Missing or broken: none.
    pub fn catalog(&self) -> Vec<String> {
        std::fs::read_to_string(self.bundle_dir.join("index.json"))
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    /// Replaces the active copy of every installed module with the bundle's, so
    /// modules update with the app (spec 6), and removes uninstalled ones. Widget
    /// packages are always installed.
    pub fn sync(&self, settings: &Settings) -> Vec<StoreError> {
        let mut errors = Vec::new();
        for id in self.catalog() {
            let result = if settings.uninstalled_modules.contains(&id) && self.is_module(&id) {
                remove_dir(&self.active_dir.join(&id))
            } else {
                self.copy_in(&id)
            };
            if let Err(e) = result {
                eprintln!("notching: syncing module {id} failed: {e}");
                errors.push(e);
            }
        }
        errors
    }

    /// Every catalog module whose bundled manifest is valid, in catalog order.
    /// Uninstalled modules are listed too, so they can be installed again.
    pub fn list(&self, settings: &Settings, lang: Lang) -> Vec<ModuleEntry> {
        self.catalog()
            .into_iter()
            .filter_map(|id| {
                let dir = self.bundle_dir.join(&id);
                let json = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
                let manifest = match parse_manifest(&json, &id) {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("notching: module {id} left out: {e:?}");
                        return None;
                    }
                };
                let text = locale_text(&dir, lang).unwrap_or_default();
                let name = text["name"].as_str().unwrap_or(&id).to_string();
                let short_name = text["shortName"].as_str().unwrap_or(&name).to_string();
                let description = text["description"].as_str().unwrap_or("").to_string();
                let page = manifest.has_page();
                let installed = !page || !settings.uninstalled_modules.contains(&id);
                let enabled = !page || (installed && !settings.disabled_modules.contains(&id));
                let icon_svg = std::fs::read_to_string(dir.join(&manifest.icon)).unwrap_or_default();
                let size = package_size(&dir);
                let channels = manifest
                    .notifications
                    .iter()
                    .map(|c| ChannelEntry {
                        id: c.id.clone(),
                        name: text["channels"][&c.id].as_str().unwrap_or(&c.id).to_string(),
                        on: c.on,
                        sound: c.sound,
                    })
                    .collect();
                let widgets = manifest
                    .widgets
                    .iter()
                    .map(|w| WidgetEntry {
                        id: w.id.clone(),
                        name: text["widgets"][&w.id].as_str().unwrap_or(&w.id).to_string(),
                        entry: w.entry.clone(),
                        width: w.width,
                        kind: w.kind,
                    })
                    .collect();
                Some(ModuleEntry {
                    manifest,
                    name,
                    short_name,
                    description,
                    installed,
                    enabled,
                    size,
                    icon_svg,
                    channels,
                    widgets,
                })
            })
            .collect()
    }

    /// A text from a module's language file in the bundle, by dotted key
    /// ("notice.prayer"). None for an unknown module, key or non-text value.
    pub fn module_text(&self, id: &str, lang: Lang, key: &str) -> Option<String> {
        self.known(id).ok()?;
        let text = locale_text(&self.bundle_dir.join(id), lang)?;
        key.split('.').try_fold(&text, |v, k| v.get(k))?.as_str().map(String::from)
    }

    pub fn set_enabled(&self, id: &str, enabled: bool, settings: &mut Settings) -> Result<(), StoreError> {
        self.module_only(id)?;
        settings.disabled_modules.retain(|m| m != id);
        if !enabled {
            settings.disabled_modules.push(id.to_string());
        }
        Ok(())
    }

    /// Deletes the active copy; the original stays in the bundle.
    pub fn uninstall(&self, id: &str, settings: &mut Settings) -> Result<(), StoreError> {
        self.module_only(id)?;
        remove_dir(&self.active_dir.join(id))?;
        if !settings.uninstalled_modules.iter().any(|m| m == id) {
            settings.uninstalled_modules.push(id.to_string());
        }
        Ok(())
    }

    /// Copies the module back from the bundle and switches it on.
    pub fn reinstall(&self, id: &str, settings: &mut Settings) -> Result<(), StoreError> {
        self.module_only(id)?;
        self.copy_in(id)?;
        settings.uninstalled_modules.retain(|m| m != id);
        settings.disabled_modules.retain(|m| m != id);
        Ok(())
    }

    // A catalog package with a module page.
    fn module_only(&self, id: &str) -> Result<(), StoreError> {
        self.known(id)?;
        if self.is_module(id) {
            Ok(())
        } else {
            Err(StoreError::NotAModule(id.to_string()))
        }
    }

    // Read from the bundled manifest; a broken one counts as a module, so it can
    // still be uninstalled.
    fn is_module(&self, id: &str) -> bool {
        std::fs::read_to_string(self.bundle_dir.join(id).join("manifest.json"))
            .ok()
            .and_then(|json| parse_manifest(&json, id).ok())
            .is_none_or(|m| m.has_page())
    }

    fn known(&self, id: &str) -> Result<(), StoreError> {
        if self.catalog().iter().any(|m| m == id) {
            Ok(())
        } else {
            Err(StoreError::UnknownModule(id.to_string()))
        }
    }

    // Copies to a temporary folder first, then swaps it in.
    fn copy_in(&self, id: &str) -> Result<(), StoreError> {
        let tmp = self.active_dir.join(format!(".{id}.tmp"));
        let target = self.active_dir.join(id);
        remove_dir(&tmp)?;
        copy_dir(&self.bundle_dir.join(id), &tmp).map_err(io)?;
        remove_dir(&target)?;
        std::fs::rename(&tmp, &target).map_err(io)
    }
}

fn locale_text(dir: &Path, lang: Lang) -> Option<serde_json::Value> {
    let file = match lang {
        Lang::Id => "locales/id.json",
        Lang::En => "locales/en.json",
    };
    serde_json::from_str(&std::fs::read_to_string(dir.join(file)).ok()?).ok()
}

fn remove_dir(dir: &Path) -> Result<(), StoreError> {
    match std::fs::remove_dir_all(dir) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(io(e)),
        _ => Ok(()),
    }
}

/// Total bytes of the files in a folder and its subfolders; symlinks are not
/// followed, and a missing folder is 0.
pub fn package_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(t) if t.is_dir() => package_size(&entry.path()),
            Ok(t) if t.is_file() => entry.metadata().map_or(0, |m| m.len()),
            _ => 0,
        })
        .sum()
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn fake_bundle(dir: &std::path::Path) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join("index.json"), r#"["a","b","w"]"#).unwrap();
    for (id, upper) in [("a", "A"), ("b", "B")] {
        let m = dir.join(id);
        std::fs::create_dir_all(m.join("locales")).unwrap();
        std::fs::write(
            m.join("manifest.json"),
            format!(
                r#"{{"id":"{id}","version":"1.0.0","entry":"index.html","icon":"icon.svg",
                   "card":{{"width":400,"height":90}},"permissions":[],"capabilities":[],
                   "notifications":[{{"id":"ping","on":true,"sound":false}}]}}"#
            ),
        )
        .unwrap();
        std::fs::write(m.join("index.html"), "v1").unwrap();
        std::fs::write(m.join("icon.svg"), "<svg/>").unwrap();
        std::fs::write(
            m.join("locales/id.json"),
            format!(
                r#"{{"name":"Modul {upper}","description":"Isi {upper}","channels":{{"ping":"Ping"}},
                    "notice":{{"ping":"Ping {{name}}"}}}}"#
            ),
        )
        .unwrap();
        std::fs::write(
            m.join("locales/en.json"),
            format!(r#"{{"name":"Module {upper}","description":"About {upper}","channels":{{"ping":"Ping"}}}}"#),
        )
        .unwrap();
    }
    // A widget package: no module page.
    let w = dir.join("w");
    std::fs::create_dir_all(w.join("locales")).unwrap();
    std::fs::write(
        w.join("manifest.json"),
        r#"{"id":"w","version":"1.0.0","icon":"icon.svg","permissions":[],"capabilities":[],
           "widgets":[{"id":"one","entry":"index.html","width":1,"kind":"time"}]}"#,
    )
    .unwrap();
    std::fs::write(w.join("index.html"), "w1").unwrap();
    std::fs::write(w.join("icon.svg"), "<svg/>").unwrap();
    std::fs::write(
        w.join("locales/id.json"),
        r#"{"name":"Widget W","shortName":"Pendek W","description":"Isi W","widgets":{"one":"Satu"}}"#,
    )
    .unwrap();
    std::fs::write(
        w.join("locales/en.json"),
        r#"{"name":"Widget W","description":"About W","widgets":{"one":"One"}}"#,
    )
    .unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locale::Lang;
    use crate::settings::Settings;

    fn setup() -> (tempfile::TempDir, ModuleStore) {
        let d = tempfile::tempdir().unwrap();
        fake_bundle(&d.path().join("bundle"));
        let store = ModuleStore::new(d.path().join("bundle"), d.path().join("active"));
        (d, store)
    }

    fn names(store: &ModuleStore, s: &Settings, lang: Lang) -> Vec<String> {
        store.list(s, lang).into_iter().map(|e| e.name).collect()
    }

    #[test]
    fn sync_copies_installed_modules_and_skips_uninstalled() {
        let (d, store) = setup();
        let s = Settings { uninstalled_modules: vec!["b".into()], ..Default::default() };
        assert!(store.sync(&s).is_empty());
        assert!(d.path().join("active/a/index.html").exists());
        assert!(!d.path().join("active/b").exists());
    }

    #[test]
    fn sync_replaces_old_copies() {
        let (d, store) = setup();
        let a = d.path().join("active/a");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("index.html"), "old").unwrap();
        std::fs::write(a.join("stale.js"), "x").unwrap();
        store.sync(&Settings::default());
        assert_eq!(std::fs::read_to_string(a.join("index.html")).unwrap(), "v1");
        assert!(!a.join("stale.js").exists());
    }

    #[test]
    fn uninstall_removes_the_active_copy_but_not_the_original() {
        let (d, store) = setup();
        let mut s = Settings::default();
        store.sync(&s);
        store.uninstall("a", &mut s).unwrap();
        assert!(!d.path().join("active/a").exists());
        assert!(d.path().join("bundle/a/index.html").exists());
        assert_eq!(s.uninstalled_modules, vec!["a".to_string()]);
        // Synced again later (next launch): stays uninstalled.
        store.sync(&s);
        assert!(!d.path().join("active/a").exists());
    }

    #[test]
    fn reinstall_brings_it_back_switched_on() {
        let (d, store) = setup();
        let mut s = Settings::default();
        store.sync(&s);
        store.set_enabled("a", false, &mut s).unwrap();
        store.uninstall("a", &mut s).unwrap();
        store.reinstall("a", &mut s).unwrap();
        assert!(s.uninstalled_modules.is_empty() && s.disabled_modules.is_empty());
        assert!(d.path().join("active/a/index.html").exists());
    }

    #[test]
    fn switching_off_keeps_the_files() {
        let (d, store) = setup();
        let mut s = Settings::default();
        store.sync(&s);
        store.set_enabled("a", false, &mut s).unwrap();
        assert!(d.path().join("active/a/index.html").exists());
        let a = &store.list(&s, Lang::Id)[0];
        assert!(a.installed && !a.enabled);
    }

    #[test]
    fn unknown_ids_are_refused() {
        let (_d, store) = setup();
        let mut s = Settings::default();
        assert_eq!(store.set_enabled("zzz", false, &mut s), Err(StoreError::UnknownModule("zzz".into())));
        assert_eq!(store.uninstall("zzz", &mut s), Err(StoreError::UnknownModule("zzz".into())));
        assert_eq!(store.reinstall("zzz", &mut s), Err(StoreError::UnknownModule("zzz".into())));
    }

    #[test]
    fn list_follows_the_catalog_in_the_chosen_language() {
        let (_d, store) = setup();
        let s = Settings::default();
        assert_eq!(names(&store, &s, Lang::Id), ["Modul A", "Modul B", "Widget W"]);
        assert_eq!(names(&store, &s, Lang::En), ["Module A", "Module B", "Widget W"]);
        let s = Settings { uninstalled_modules: vec!["b".into()], ..Default::default() };
        let b = &store.list(&s, Lang::En)[1];
        assert!(!b.installed && !b.enabled);
        assert_eq!(b.description, "About B");
    }

    #[test]
    fn a_module_with_a_broken_manifest_is_left_out() {
        let (d, store) = setup();
        std::fs::write(d.path().join("bundle/b/manifest.json"), "{").unwrap();
        assert_eq!(names(&store, &Settings::default(), Lang::Id), ["Modul A", "Widget W"]);
    }

    #[test]
    fn list_reports_the_icon_and_package_size() {
        let (d, store) = setup();
        let a = &store.list(&Settings::default(), Lang::En)[0];
        assert_eq!(a.icon_svg, "<svg/>");
        assert_eq!(a.size, package_size(&d.path().join("bundle/a")));
        assert!(a.size > 0);
    }

    #[test]
    fn package_size_counts_nested_files() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("x"), "abc").unwrap();
        std::fs::create_dir_all(d.path().join("sub")).unwrap();
        std::fs::write(d.path().join("sub/y"), "12345").unwrap();
        assert_eq!(package_size(d.path()), 8);
        assert_eq!(package_size(&d.path().join("missing")), 0);
    }

    #[test]
    fn widget_packages_are_always_on() {
        let (d, store) = setup();
        let s = Settings { disabled_modules: vec!["w".into()], uninstalled_modules: vec!["w".into()], ..Default::default() };
        let w = store.list(&s, Lang::Id).into_iter().find(|e| e.manifest.id == "w").unwrap();
        assert!(w.installed && w.enabled);
        store.sync(&s);
        assert!(d.path().join("active/w/index.html").exists());
    }

    #[test]
    fn widget_packages_cannot_be_switched_off() {
        let (_d, store) = setup();
        let mut s = Settings::default();
        assert_eq!(store.set_enabled("w", false, &mut s), Err(StoreError::NotAModule("w".into())));
        assert_eq!(store.uninstall("w", &mut s), Err(StoreError::NotAModule("w".into())));
        assert_eq!(store.reinstall("w", &mut s), Err(StoreError::NotAModule("w".into())));
        assert!(s.disabled_modules.is_empty() && s.uninstalled_modules.is_empty());
    }

    #[test]
    fn widgets_and_short_names_come_from_the_locale() {
        let (_d, store) = setup();
        let list = store.list(&Settings::default(), Lang::Id);
        let w = list.iter().find(|e| e.manifest.id == "w").unwrap();
        assert_eq!(
            w.widgets,
            [WidgetEntry { id: "one".into(), name: "Satu".into(), entry: "index.html".into(), width: 1, kind: WidgetKind::Time }]
        );
        assert_eq!(list[0].short_name, "Modul A");
        assert_eq!(w.short_name, "Pendek W");
    }

    #[test]
    fn module_text_reads_nested_keys() {
        let (_d, store) = setup();
        assert_eq!(store.module_text("a", Lang::Id, "notice.ping"), Some("Ping {name}".into()));
        assert_eq!(store.module_text("a", Lang::Id, "name"), Some("Modul A".into()));
        assert_eq!(store.module_text("a", Lang::Id, "notice.zzz"), None);
        assert_eq!(store.module_text("zzz", Lang::Id, "name"), None);
    }
}

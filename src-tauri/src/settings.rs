//! App settings on disk (settings.json).

use std::path::Path;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSetting {
    #[default]
    Auto,
    Id,
    En,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub language: LanguageSetting,
    pub last_card: Option<String>,
    pub disabled_modules: Vec<String>,
    pub uninstalled_modules: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            language: LanguageSetting::Auto,
            last_card: None,
            disabled_modules: Vec::new(),
            uninstalled_modules: Vec::new(),
        }
    }
}

pub const SETTINGS_FILE: &str = "settings.json";

/// Missing file: defaults. Unreadable or broken file: kept aside as
/// settings.json.broken, then defaults, so a bad file never stops the app.
pub fn load_settings(path: &Path) -> Settings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
        Err(e) => return keep_aside(path, &e.to_string()),
    };
    match serde_json::from_str(&text) {
        Ok(settings) => settings,
        Err(e) => keep_aside(path, &e.to_string()),
    }
}

fn keep_aside(path: &Path, why: &str) -> Settings {
    let broken = path.with_extension("json.broken");
    eprintln!("notching: settings unreadable ({why}); kept aside as {}", broken.display());
    let _ = std::fs::rename(path, broken);
    Settings::default()
}

/// Writes a temporary file and renames it over the old one, so a crash mid-write
/// never leaves half a file.
pub fn save_settings(path: &Path, settings: &Settings) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_gives_the_defaults() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(&d.path().join(SETTINGS_FILE)), Settings::default());
        assert_eq!(Settings::default().version, 1);
    }

    #[test]
    fn settings_survive_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let s = Settings {
            language: LanguageSetting::En,
            last_card: Some("system-stat".into()),
            disabled_modules: vec!["home".into()],
            ..Default::default()
        };
        save_settings(&p, &s).unwrap();
        assert_eq!(load_settings(&p), s);
        assert!(!d.path().join("settings.json.tmp").exists());
    }

    #[test]
    fn save_creates_the_folder() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a/b").join(SETTINGS_FILE);
        save_settings(&p, &Settings::default()).unwrap();
        assert!(p.exists());
    }

    #[test]
    fn a_corrupt_file_is_kept_aside_and_defaults_are_used() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, "{not json").unwrap();
        assert_eq!(load_settings(&p), Settings::default());
        assert_eq!(std::fs::read_to_string(d.path().join("settings.json.broken")).unwrap(), "{not json");
    }

    #[test]
    fn unknown_and_missing_fields_are_tolerated() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, r#"{"language":"en","future":1}"#).unwrap();
        assert_eq!(load_settings(&p), Settings { language: LanguageSetting::En, ..Default::default() });
    }
}

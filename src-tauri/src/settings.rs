//! App settings on disk (settings.json).

use std::path::Path;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LanguageSetting {
    Id,
    En,
    // A value this version does not know (a newer app, a hand edit) reads as Auto,
    // so it never costs the rest of the file. serde wants it last.
    #[default]
    #[serde(other)]
    Auto,
}

/// The four "Tampilan notch" sliders (spec 4.3). Same keys and ranges as
/// NotchConfig and CONFIG_RANGES in src/notch/config.ts.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotchConfig {
    pub bounce: f64,
    pub speed: f64,
    pub drop_depth: f64,
    pub thickness: f64,
}

// By hand, so a missing value or one that is not a number falls back to its own
// default rather than to 0.
impl<'de> serde::Deserialize<'de> for NotchConfig {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let value = <serde_json::Value as serde::Deserialize>::deserialize(d)?;
        let base = NotchConfig::default();
        let num = |key: &str, default: f64| value.get(key).and_then(serde_json::Value::as_f64).unwrap_or(default);
        Ok(NotchConfig {
            bounce: num("bounce", base.bounce),
            speed: num("speed", base.speed),
            drop_depth: num("dropDepth", base.drop_depth),
            thickness: num("thickness", base.thickness),
        })
    }
}

impl Default for NotchConfig {
    fn default() -> Self {
        NotchConfig { bounce: 100.0, speed: 200.0, drop_depth: 9.0, thickness: 4.0 }
    }
}

impl NotchConfig {
    /// Each value cut to its slider's range; a value that is not a finite number
    /// becomes its default.
    pub fn clamped(self) -> NotchConfig {
        let d = NotchConfig::default();
        let clamp = |v: f64, default: f64, min: f64, max: f64| if v.is_finite() { v.clamp(min, max) } else { default };
        NotchConfig {
            bounce: clamp(self.bounce, d.bounce, 0.0, 100.0),
            speed: clamp(self.speed, d.speed, 40.0, 200.0),
            drop_depth: clamp(self.drop_depth, d.drop_depth, 2.0, 28.0),
            thickness: clamp(self.thickness, d.thickness, 2.0, 14.0),
        }
    }
}

/// The Beranda city, typed once (spec 7). Weather and prayer times both use it.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub name: String,
    pub region: String,
    pub country: String,
    pub latitude: f64,
    pub longitude: f64,
}

impl Place {
    pub fn is_valid(&self) -> bool {
        let name = self.name.trim().chars().count();
        (1..=100).contains(&name)
            && self.latitude.is_finite()
            && self.longitude.is_finite()
            && (-90.0..=90.0).contains(&self.latitude)
            && (-180.0..=180.0).contains(&self.longitude)
    }
}

/// How prayer times are computed; Kemenag RI unless chosen otherwise.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PrayerMethod {
    Singapore,
    MuslimWorldLeague,
    Egyptian,
    Karachi,
    UmmAlQura,
    NorthAmerica,
    // A method this version does not know reads as Kemenag. serde wants it last.
    #[default]
    #[serde(other)]
    Kemenag,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HomeSettings {
    #[serde(deserialize_with = "lenient")]
    pub place: Option<Place>,
    #[serde(deserialize_with = "lenient")]
    pub prayer_method: PrayerMethod,
    #[serde(deserialize_with = "lenient_true")]
    pub show_clock: bool,
}

impl Default for HomeSettings {
    fn default() -> Self {
        HomeSettings { place: None, prayer_method: PrayerMethod::Kemenag, show_clock: true }
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    #[serde(deserialize_with = "lenient_version")]
    pub version: u32,
    #[serde(deserialize_with = "lenient")]
    pub language: LanguageSetting,
    #[serde(deserialize_with = "lenient")]
    pub last_card: Option<String>,
    #[serde(deserialize_with = "lenient")]
    pub disabled_modules: Vec<String>,
    #[serde(deserialize_with = "lenient")]
    pub uninstalled_modules: Vec<String>,
    #[serde(deserialize_with = "lenient")]
    pub notch: NotchConfig,
    /// The one screen the notch shows on, by name; None is every screen.
    #[serde(deserialize_with = "lenient")]
    pub screen: Option<String>,
    #[serde(deserialize_with = "lenient")]
    pub home: HomeSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1,
            language: LanguageSetting::Auto,
            last_card: None,
            disabled_modules: Vec::new(),
            uninstalled_modules: Vec::new(),
            notch: NotchConfig::default(),
            screen: None,
            home: HomeSettings::default(),
        }
    }
}

// A value of the wrong type (a hand edit, an older or newer app) resets only its
// own field, never the whole file.
fn lenient_or<'de, D, T>(d: D, fallback: T) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::de::DeserializeOwned,
{
    let value = <serde_json::Value as serde::Deserialize>::deserialize(d)?;
    Ok(serde_json::from_value(value).unwrap_or(fallback))
}

fn lenient<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::de::DeserializeOwned + Default,
{
    lenient_or(d, T::default())
}

// Switches that are on unless turned off.
fn lenient_true<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    lenient_or(d, true)
}

// The version's default is not its type's default either.
fn lenient_version<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    lenient_or(d, Settings::default().version)
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
    match serde_json::from_str::<Settings>(&text) {
        Ok(mut settings) => {
            settings.notch = settings.notch.clamped();
            settings.home.place = settings.home.place.filter(Place::is_valid);
            settings
        }
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

    #[test]
    fn an_unknown_value_keeps_the_rest() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, r#"{"language":"ja","lastCard":"system-stat","disabledModules":["home"]}"#).unwrap();
        let s = load_settings(&p);
        assert_eq!(s.language, LanguageSetting::Auto);
        assert_eq!(s.last_card, Some("system-stat".into()));
        assert_eq!(s.disabled_modules, vec!["home".to_string()]);
        assert!(!d.path().join("settings.json.broken").exists());
    }

    #[test]
    fn the_new_defaults() {
        let s = Settings::default();
        assert_eq!(s.notch, NotchConfig { bounce: 100.0, speed: 200.0, drop_depth: 9.0, thickness: 4.0 });
        assert_eq!(s.screen, None);
    }

    #[test]
    fn notch_values_are_clamped_to_the_slider_ranges() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, r#"{"notch":{"bounce":500,"speed":10,"dropDepth":9.5,"thickness":-3}}"#).unwrap();
        assert_eq!(
            load_settings(&p).notch,
            NotchConfig { bounce: 100.0, speed: 40.0, drop_depth: 9.5, thickness: 2.0 }
        );
    }

    #[test]
    fn a_value_of_the_wrong_type_resets_only_that_field() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(
            &p,
            r#"{"language":"en","lastCard":"system-stat","notch":{"bounce":"x","speed":150},
                "disabledModules":"home","screen":5}"#,
        )
        .unwrap();
        let s = load_settings(&p);
        assert_eq!(s.language, LanguageSetting::En);
        assert_eq!(s.last_card, Some("system-stat".into()));
        assert_eq!((s.notch.bounce, s.notch.speed), (100.0, 150.0));
        assert!(s.disabled_modules.is_empty());
        assert_eq!(s.screen, None);
        assert!(!d.path().join("settings.json.broken").exists());
    }

    #[test]
    fn the_screen_choice_survives_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let s = Settings { screen: Some("DELL U2723QE".into()), ..Default::default() };
        save_settings(&p, &s).unwrap();
        assert_eq!(load_settings(&p), s);
    }

    #[test]
    fn clamped_replaces_values_that_are_not_numbers() {
        let c = NotchConfig { bounce: f64::NAN, speed: f64::INFINITY, ..Default::default() }.clamped();
        assert_eq!((c.bounce, c.speed), (100.0, 200.0));
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
    fn home_defaults() {
        assert_eq!(
            Settings::default().home,
            HomeSettings { place: None, prayer_method: PrayerMethod::Kemenag, show_clock: true }
        );
    }

    #[test]
    fn home_settings_survive_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let s = Settings {
            home: HomeSettings { place: Some(jakarta()), prayer_method: PrayerMethod::Karachi, show_clock: false },
            ..Default::default()
        };
        save_settings(&p, &s).unwrap();
        assert_eq!(load_settings(&p), s);
    }

    #[test]
    fn an_unknown_method_or_a_bad_place_falls_back() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(
            &p,
            r#"{"home":{"prayerMethod":"jafari",
                "place":{"name":"X","region":"","country":"","latitude":200,"longitude":0},"showClock":"no"}}"#,
        )
        .unwrap();
        assert_eq!(load_settings(&p).home, HomeSettings::default());
        assert!(!d.path().join("settings.json.broken").exists());
    }
}

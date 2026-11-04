//! App settings on disk (settings.json).

use std::path::Path;

use crate::modules::manifest::is_module_id;
use crate::pages::{beranda, is_route, repair, Page, Placement, HOME_PAGE, MODULE_PAGE_PREFIX};

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
}

impl Default for HomeSettings {
    fn default() -> Self {
        HomeSettings { place: None, prayer_method: PrayerMethod::Kemenag }
    }
}

/// The person's choice for one notification channel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ChannelPref {
    pub on: bool,
    pub sound: bool,
}

/// The Notifikasi page (spec 4.4): the glow, how long a notice stays, and each
/// channel's switches, keyed "<module>.<channel>". A channel without an entry
/// uses its manifest defaults.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    #[serde(deserialize_with = "lenient_true")]
    pub glow: bool,
    #[serde(deserialize_with = "lenient_seconds")]
    pub seconds: f64,
    #[serde(deserialize_with = "lenient")]
    pub channels: std::collections::BTreeMap<String, ChannelPref>,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        NotificationSettings { glow: true, seconds: NOTICE_SECONDS, channels: Default::default() }
    }
}

const NOTICE_SECONDS: f64 = 3.5;

/// 2 to 8 seconds in steps of half a second; anything else that is not a number
/// is the default.
pub fn clamp_seconds(s: f64) -> f64 {
    if s.is_finite() { ((s * 2.0).round() / 2.0).clamp(2.0, 8.0) } else { NOTICE_SECONDS }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    #[serde(deserialize_with = "lenient_version")]
    pub version: u32,
    #[serde(deserialize_with = "lenient")]
    pub language: LanguageSetting,
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
    #[serde(deserialize_with = "lenient")]
    pub notifications: NotificationSettings,
    /// Beranda first, then the custom pages, in pill order.
    #[serde(deserialize_with = "lenient_pages")]
    pub pages: Vec<Page>,
    /// What the panel opens: a page id, "modules", or "module:<id>".
    #[serde(deserialize_with = "lenient")]
    pub last_page: Option<String>,
    /// Modules whose status is not shown beside the notch.
    #[serde(deserialize_with = "lenient")]
    pub status_off: Vec<String>,
    /// The Volt accent, "#rrggbb" (Tampilan, design 3 Nov warna aksen).
    #[serde(deserialize_with = "lenient_accent")]
    pub accent: String,
    /// The last custom colour, kept while a preset is chosen.
    #[serde(deserialize_with = "lenient_accent_custom")]
    pub accent_custom: Option<String>,
    /// Screenshot's two keys (design 3 Nov tombol §6).
    #[serde(deserialize_with = "lenient")]
    pub shot_keys: crate::shot_keys::ShotKeys,
    /// Screenshot's first-use notice has shown, or was not needed (§3).
    #[serde(deserialize_with = "lenient")]
    pub shot_notice: bool,
    /// Atur jendela's nine keys (design 4 Nov tombol atur jendela).
    #[serde(deserialize_with = "lenient")]
    pub window_keys: crate::win_rules::WindowKeys,
    /// The open panel fades toward its bottom; off, it is solid black (Umum, 4 Nov).
    #[serde(deserialize_with = "lenient_true")]
    pub panel_glass: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: SETTINGS_VERSION,
            language: LanguageSetting::Auto,
            disabled_modules: Vec::new(),
            uninstalled_modules: Vec::new(),
            notch: NotchConfig::default(),
            screen: None,
            home: HomeSettings::default(),
            notifications: NotificationSettings::default(),
            pages: vec![beranda()],
            last_page: None,
            status_off: Vec::new(),
            accent: DEFAULT_ACCENT.into(),
            accent_custom: None,
            shot_keys: crate::shot_keys::ShotKeys::default(),
            shot_notice: false,
            window_keys: crate::win_rules::WindowKeys::default(),
            panel_glass: true,
        }
    }
}

/// Lime, Volt's accent before it could change.
pub const DEFAULT_ACCENT: &str = "#c8f04a";

/// "#rgb" or "#rrggbb" in any case, as lowercase "#rrggbb"; anything else is None.
pub fn normalize_accent(s: &str) -> Option<String> {
    let hex = s.strip_prefix('#')?;
    if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let full = match hex.len() {
        3 => hex.chars().flat_map(|c| [c, c]).collect(),
        6 => hex.to_string(),
        _ => return None,
    };
    Some(format!("#{}", full.to_ascii_lowercase()))
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

fn lenient_seconds<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    lenient_or(d, NOTICE_SECONDS).map(clamp_seconds)
}

// Page by page, and inside a page widget by widget: one bad entry in a
// hand-edited file goes alone instead of taking every page with it.
fn lenient_pages<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<Page>, D::Error> {
    let value = <serde_json::Value as serde::Deserialize>::deserialize(d)?;
    Ok(match value.as_array() {
        Some(items) => items.iter().filter_map(page_from).collect(),
        None => vec![beranda()],
    })
}

fn page_from(value: &serde_json::Value) -> Option<Page> {
    let mut value = value.clone();
    let widgets = value.get_mut("widgets")?.take();
    let widgets: Vec<Placement> =
        widgets.as_array()?.iter().filter_map(|w| serde_json::from_value(w.clone()).ok()).collect();
    value["widgets"] = serde_json::Value::Array(Vec::new());
    let strip = value.get_mut("strip").map(serde_json::Value::take).and_then(|s| s.as_str().map(String::from));
    let page: Page = serde_json::from_value(value).ok()?;
    Some(Page { widgets, strip, ..page })
}

fn lenient_accent<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let s: Option<String> = lenient(d)?;
    Ok(s.as_deref().and_then(normalize_accent).unwrap_or_else(|| DEFAULT_ACCENT.into()))
}

fn lenient_accent_custom<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    let s: Option<String> = lenient(d)?;
    Ok(s.as_deref().and_then(normalize_accent))
}

// The version's default is not its type's default either.
fn lenient_version<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    lenient_or(d, Settings::default().version)
}

pub const SETTINGS_FILE: &str = "settings.json";
/// 2: pages and the last page (plan 5) replace the last card and the clock switch.
pub const SETTINGS_VERSION: u32 = 2;

/// Missing file: defaults. Unreadable or broken file: kept aside as
/// settings.json.broken, then defaults, so a bad file never stops the app. A
/// version 1 file is moved over once, its text kept as settings.json.v1.
pub fn load_settings(path: &Path) -> Settings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
        Err(e) => return keep_aside(path, &e.to_string()),
    };
    let parsed = serde_json::from_str::<serde_json::Value>(&text)
        .and_then(|raw| serde_json::from_value::<Settings>(raw.clone()).map(|s| (raw, s)));
    let (raw, mut settings) = match parsed {
        Ok(both) => both,
        Err(e) => return keep_aside(path, &e.to_string()),
    };
    settings.notch = settings.notch.clamped();
    settings.home.place = settings.home.place.filter(Place::is_valid);
    // A file that already has pages is never moved again, whatever its version says.
    let has_pages = raw.get("pages").is_some_and(serde_json::Value::is_array);
    let old = !has_pages && raw.get("version").and_then(serde_json::Value::as_u64).unwrap_or(1) < u64::from(SETTINGS_VERSION);
    if has_pages {
        settings.version = SETTINGS_VERSION;
    }
    if old {
        migrate_v1(&raw, &mut settings);
    }
    settings.pages = repair(std::mem::take(&mut settings.pages));
    settings.last_page = settings.last_page.filter(|r| is_route(&settings.pages, r));
    if old {
        let v1 = path.with_extension("json.v1");
        if !v1.exists() {
            if let Err(e) = std::fs::write(&v1, &text) {
                eprintln!("notching: keeping the old settings failed: {e}");
            }
        }
        if let Err(e) = save_settings(path, &settings) {
            eprintln!("notching: saving the moved settings failed: {e}");
        }
    }
    settings
}

/// Plan 4's settings to plan 5's: Beranda becomes a page of widgets (empty if
/// the old Beranda module was off), the last card becomes the last page, and the
/// widget package can no longer be off.
pub fn migrate_v1(raw: &serde_json::Value, settings: &mut Settings) {
    let listed = |key: &str| {
        raw.get(key).and_then(serde_json::Value::as_array).is_some_and(|a| a.iter().any(|v| v == HOME_PAGE))
    };
    let mut home = beranda();
    if listed("disabledModules") || listed("uninstalledModules") {
        home.widgets.clear();
    }
    settings.pages = vec![home];
    settings.last_page = match raw.get("lastCard").and_then(serde_json::Value::as_str) {
        Some(HOME_PAGE) => Some(HOME_PAGE.into()),
        Some(id) if is_module_id(id) => Some(format!("{MODULE_PAGE_PREFIX}{id}")),
        _ => None,
    };
    settings.disabled_modules.retain(|m| m != HOME_PAGE);
    settings.uninstalled_modules.retain(|m| m != HOME_PAGE);
    settings.version = SETTINGS_VERSION;
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
    fn shot_keys_default_and_read_leniently() {
        use crate::shot_keys::{Combo, ShotKeys, CONTROL, SHIFT};
        let (_d, s) = load(r#"{"version":2,"language":"en"}"#);
        assert_eq!((s.shot_keys, s.shot_notice), (ShotKeys::default(), false));
        let (_d, s) = load(r#"{"shotKeys":{"screen":{"code":1,"mods":4608},"pick":{"code":21,"mods":768}},"shotNotice":true}"#);
        assert_eq!(s.shot_keys.screen, Combo { code: 1, mods: CONTROL | SHIFT });
        assert_eq!(s.shot_keys.pick, ShotKeys::default().pick);
        assert!(s.shot_notice);
        let (_d, s) = load(r#"{"shotKeys":"x","shotNotice":3,"language":"en"}"#);
        assert_eq!((s.shot_keys, s.shot_notice, s.language), (ShotKeys::default(), false, LanguageSetting::En));
    }

    #[test]
    fn window_keys_default_and_read_leniently() {
        use crate::shot_keys::{Combo, CONTROL, SHIFT};
        use crate::win_rules::{Cell, WindowKeys};
        let (_d, s) = load(r#"{"version":2,"language":"en"}"#);
        assert_eq!(s.window_keys, WindowKeys::default());
        let (_d, s) = load(r#"{"windowKeys":{"center":{"code":1,"mods":4608}}}"#);
        assert_eq!(s.window_keys.get(Cell::Center), Combo { code: 1, mods: CONTROL | SHIFT });
        assert_eq!(s.window_keys.get(Cell::Left), WindowKeys::default().get(Cell::Left));
        let (_d, s) = load(r#"{"windowKeys":[1,2],"language":"en"}"#);
        assert_eq!((s.window_keys, s.language), (WindowKeys::default(), LanguageSetting::En));
    }

    #[test]
    fn accent_defaults_to_lime() {
        assert_eq!(Settings::default().accent, "#c8f04a");
        assert_eq!(Settings::default().accent_custom, None);
    }

    #[test]
    fn an_old_file_reads_lime() {
        let (_d, s) = load(r#"{"version":2,"language":"en"}"#);
        assert_eq!(s.accent, "#c8f04a");
        assert_eq!(s.accent_custom, None);
    }

    #[test]
    fn a_bad_accent_reads_lime_and_keeps_the_rest() {
        let (_d, s) = load(r##"{"accent":"red","accentCustom":"#12","language":"en"}"##);
        assert_eq!((s.accent.as_str(), s.accent_custom.as_deref()), ("#c8f04a", None));
        assert_eq!(s.language, LanguageSetting::En);
        let (_d, s) = load(r#"{"accent":5}"#);
        assert_eq!(s.accent, "#c8f04a");
    }

    #[test]
    fn the_accent_is_normalised_on_read() {
        let (_d, s) = load(r##"{"accent":"#ABCDEF","accentCustom":"#123"}"##);
        assert_eq!(s.accent, "#abcdef");
        assert_eq!(s.accent_custom.as_deref(), Some("#112233"));
    }

    #[test]
    fn a_missing_file_gives_the_defaults() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(&d.path().join(SETTINGS_FILE)), Settings::default());
        assert!(!d.path().join("settings.json.v1").exists());
    }

    #[test]
    fn settings_survive_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let s = Settings {
            language: LanguageSetting::En,
            last_page: Some("module:system-stat".into()),
            disabled_modules: vec!["system-stat".into()],
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

    fn load(text: &str) -> (tempfile::TempDir, Settings) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, text).unwrap();
        let s = load_settings(&p);
        (d, s)
    }

    fn page_ids(s: &Settings) -> Vec<&str> {
        s.pages.iter().map(|p| p.id.as_str()).collect()
    }

    const KERJA: &str = r#"{"id":"p1","name":"Kerja","icon":"briefcase","widgets":[{"widget":"home/clock","col":3,"width":1}]}"#;

    #[test]
    fn one_broken_page_does_not_take_the_others_with_it() {
        for broken in [
            r#"{"id":"p2","name":5,"icon":"star","widgets":[]}"#,
            r#"{"id":"p2","name":"X","icon":null,"widgets":[]}"#,
            r#"{"id":"p2","name":"X","icon":"star"}"#,
            r#""not a page""#,
        ] {
            let (_d, s) = load(&format!(r#"{{"version":2,"pages":[{KERJA},{broken}]}}"#));
            assert_eq!(page_ids(&s), ["home", "p1"], "{broken}");
            assert_eq!(s.pages[1].widgets.len(), 1);
        }
    }

    #[test]
    fn one_broken_widget_does_not_take_its_page_with_it() {
        let page = r#"{"id":"p1","name":"Kerja","icon":"briefcase","widgets":[
            {"widget":"home/clock","col":-1,"width":1},{"widget":"home/date","col":"2","width":1},
            {"widget":"home/prayer","col":1,"width":1}]}"#;
        let (_d, s) = load(&format!(r#"{{"version":2,"pages":[{page}]}}"#));
        assert_eq!(page_ids(&s), ["home", "p1"]);
        assert_eq!(s.pages[1].widgets.iter().map(|w| w.widget.as_str()).collect::<Vec<_>>(), ["home/prayer"]);
    }

    #[test]
    fn pages_without_a_strip_still_load() {
        let (_d, s) = load(&format!(r#"{{"version":2,"pages":[{KERJA}]}}"#));
        assert!(s.pages.iter().all(|p| p.strip.is_none()));
        let with = r#"{"id":"p1","name":"Kerja","icon":"briefcase","widgets":[],"strip":"timer/strip"}"#;
        let (_d, s) = load(&format!(r#"{{"version":2,"pages":[{with}]}}"#));
        assert_eq!(s.pages[1].strip.as_deref(), Some("timer/strip"));
        // A broken strip goes alone, not with its page.
        let bad = r#"{"id":"p1","name":"Kerja","icon":"briefcase","widgets":[],"strip":5}"#;
        let (_d, s) = load(&format!(r#"{{"version":2,"pages":[{bad}]}}"#));
        assert_eq!((page_ids(&s), s.pages[1].strip.clone()), (vec!["home", "p1"], None));
    }

    #[test]
    fn a_file_with_pages_is_never_moved_again() {
        for version in [r#""2""#, "null", "1.5"] {
            let (d, s) = load(&format!(r#"{{"version":{version},"pages":[{KERJA}],"lastPage":"p1"}}"#));
            assert_eq!(page_ids(&s), ["home", "p1"], "{version}");
            assert_eq!(s.last_page.as_deref(), Some("p1"));
            assert!(!d.path().join("settings.json.v1").exists());
        }
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
        std::fs::write(&p, r#"{"version":2,"language":"ja","lastPage":"modules","disabledModules":["system-stat"]}"#)
            .unwrap();
        let s = load_settings(&p);
        assert_eq!(s.language, LanguageSetting::Auto);
        assert_eq!(s.last_page, Some("modules".into()));
        assert_eq!(s.disabled_modules, vec!["system-stat".to_string()]);
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
            r#"{"version":2,"language":"en","lastPage":"modules","notch":{"bounce":"x","speed":150},
                "disabledModules":"home","screen":5,"pages":"x"}"#,
        )
        .unwrap();
        let s = load_settings(&p);
        assert_eq!(s.language, LanguageSetting::En);
        assert_eq!(s.last_page, Some("modules".into()));
        assert_eq!(s.pages, [beranda()]);
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
        assert_eq!(Settings::default().home, HomeSettings { place: None, prayer_method: PrayerMethod::Kemenag });
        assert_eq!(Settings::default().pages, [beranda()]);
        assert_eq!(Settings::default().version, 2);
    }

    #[test]
    fn home_settings_survive_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let s = Settings {
            home: HomeSettings { place: Some(jakarta()), prayer_method: PrayerMethod::Karachi },
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
            r#"{"version":2,"home":{"prayerMethod":"jafari",
                "place":{"name":"X","region":"","country":"","latitude":200,"longitude":0},"showClock":"no"}}"#,
        )
        .unwrap();
        assert_eq!(load_settings(&p).home, HomeSettings::default());
        assert!(!d.path().join("settings.json.broken").exists());
    }

    fn plan_4_file(d: &tempfile::TempDir, json: &str) -> Settings {
        let p = d.path().join(SETTINGS_FILE);
        std::fs::write(&p, json).unwrap();
        load_settings(&p)
    }

    const PLAN_4: &str = r#"{"version":1,"language":"en","lastCard":"system-stat","disabledModules":[],
      "uninstalledModules":[],"screen":"DELL","notch":{"bounce":80,"speed":150,"dropDepth":9,"thickness":4},
      "home":{"place":{"name":"Bandung","region":"Jawa Barat","country":"Indonesia","latitude":-6.9,"longitude":107.6},
              "prayerMethod":"karachi","showClock":false},
      "notifications":{"glow":false,"seconds":5,"channels":{"home.prayer":{"on":true,"sound":false}}}}"#;

    #[test]
    fn a_plan_4_file_moves_to_pages_and_keeps_everything() {
        let d = tempfile::tempdir().unwrap();
        let s = plan_4_file(&d, PLAN_4);
        assert_eq!(s.version, 2);
        assert_eq!(s.pages, [beranda()]);
        assert_eq!(s.last_page, Some("module:system-stat".into()));
        assert_eq!((s.language, s.screen.as_deref()), (LanguageSetting::En, Some("DELL")));
        assert_eq!(s.notch.bounce, 80.0);
        assert_eq!(s.home.place.as_ref().map(|p| p.name.as_str()), Some("Bandung"));
        assert_eq!(s.home.prayer_method, PrayerMethod::Karachi);
        assert!(s.notifications.channels["home.prayer"].on);
        assert!(!s.notifications.glow);
        assert_eq!(s.notifications.seconds, 5.0);
    }

    #[test]
    fn a_switched_off_beranda_starts_empty() {
        let d = tempfile::tempdir().unwrap();
        let s = plan_4_file(&d, r#"{"version":1,"disabledModules":["home","system-stat"]}"#);
        assert!(s.pages[0].widgets.is_empty());
        assert_eq!(s.pages[0].id, "home");
        assert_eq!(s.disabled_modules, ["system-stat"]);
    }

    #[test]
    fn an_uninstalled_beranda_starts_empty_too() {
        let d = tempfile::tempdir().unwrap();
        let s = plan_4_file(&d, r#"{"version":1,"uninstalledModules":["home"]}"#);
        assert!(s.pages[0].widgets.is_empty());
        assert!(s.uninstalled_modules.is_empty());
    }

    #[test]
    fn last_card_home_becomes_beranda() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(plan_4_file(&d, r#"{"version":1,"lastCard":"home"}"#).last_page, Some("home".into()));
        let d = tempfile::tempdir().unwrap();
        assert_eq!(plan_4_file(&d, r#"{"version":1,"lastCard":5}"#).last_page, None);
    }

    #[test]
    fn migration_runs_once_and_keeps_the_old_file() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let v1 = d.path().join("settings.json.v1");
        let mut s = plan_4_file(&d, PLAN_4);
        assert_eq!(std::fs::read_to_string(&v1).unwrap(), PLAN_4);
        assert!(std::fs::read_to_string(&p).unwrap().contains("\"version\": 2"));
        s.pages[0].widgets.clear();
        save_settings(&p, &s).unwrap();
        let again = load_settings(&p);
        assert!(again.pages[0].widgets.is_empty());
        assert_eq!(std::fs::read_to_string(&v1).unwrap(), PLAN_4);
    }

    #[test]
    fn a_file_without_a_version_is_version_1() {
        let d = tempfile::tempdir().unwrap();
        let s = plan_4_file(&d, r#"{"lastCard":"home"}"#);
        assert_eq!(s.last_page, Some("home".into()));
        assert!(d.path().join("settings.json.v1").exists());
    }

    #[test]
    fn a_bad_last_page_is_dropped() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(plan_4_file(&d, r#"{"version":2,"lastPage":"p7"}"#).last_page, None);
    }

    #[test]
    fn notification_defaults() {
        let n = Settings::default().notifications;
        assert_eq!((n.glow, n.seconds, n.channels.len()), (true, 3.5, 0));
    }

    #[test]
    fn notice_seconds_are_clamped() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(SETTINGS_FILE);
        let read = |json: &str| {
            std::fs::write(&p, json).unwrap();
            load_settings(&p).notifications
        };
        assert_eq!(read(r#"{"notifications":{"seconds":100}}"#).seconds, 8.0);
        assert_eq!(read(r#"{"notifications":{"seconds":"x"}}"#).seconds, 3.5);
        assert_eq!(read(r#"{"notifications":{"seconds":2.2}}"#).seconds, 2.0);
        assert_eq!(read(r#"{"notifications":{"seconds":3.74}}"#).seconds, 3.5);
        assert!(read(r#"{"notifications":{"glow":"ya"}}"#).glow);
        assert_eq!((clamp_seconds(f64::NAN), clamp_seconds(1.0), clamp_seconds(5.3)), (3.5, 2.0, 5.5));
    }
}

//! manifest.json of a module package.

use std::ops::RangeInclusive;

/// System capabilities a module may ask for. A module may use only the ones its
/// manifest lists (spec 6).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum Capability {
    #[serde(rename = "system.stats")]
    SystemStats,
    /// Beranda's snapshot: city, weather, prayer times, reminders, clock.
    #[serde(rename = "home.data")]
    HomeData,
    #[serde(rename = "reminders")]
    Reminders,
    /// Notices from the module's own channels (plan 5 modules; spec 4.4).
    #[serde(rename = "notify")]
    Notify,
    /// A short status beside the notch while the panel is closed (design 30 Oct, §8).
    #[serde(rename = "status")]
    Status,
    /// Keeps the screen on and the Mac awake (Keep awake, design 31 Oct).
    #[serde(rename = "awake")]
    Awake,
    /// A countdown of 1–60 minutes run by the core (Timer, design 31 Oct).
    #[serde(rename = "timer")]
    Timer,
}

/// System permissions a module needs (shown on the Permissions page, plan 3).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    Accessibility,
    Camera,
    Location,
}

/// `width` is the panel width; `height` is the module's area inside the panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct CardSize {
    pub width: u32,
    pub height: u32,
}

/// What a widget is about; the page editor filters by it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WidgetKind {
    Time,
    Weather,
    Worship,
    Work,
    Media,
}

/// A widget a package offers for custom pages: 1 or 2 of the row's 4 columns.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WidgetSpec {
    pub id: String,
    pub entry: String,
    pub width: u8,
    pub kind: WidgetKind,
}

/// A kind of notification a module can send, with its default switches (spec 4.4).
/// The person can change both on the Notifikasi page.
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChannelSpec {
    pub id: String,
    pub on: bool,
    pub sound: bool,
    /// The widget that sent it, so a click opens the page holding that widget.
    #[serde(default)]
    pub widget: Option<String>,
}

/// A package has a module page (`entry` and `card`), widgets, or both.
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub id: String,
    pub version: String,
    pub icon: String,
    #[serde(default)]
    pub entry: Option<String>,
    #[serde(default)]
    pub card: Option<CardSize>,
    pub permissions: Vec<Permission>,
    pub capabilities: Vec<Capability>,
    #[serde(default)]
    pub notifications: Vec<ChannelSpec>,
    #[serde(default)]
    pub widgets: Vec<WidgetSpec>,
}

impl Manifest {
    /// A package without a page is not a module: it only offers widgets.
    pub fn has_page(&self) -> bool {
        self.entry.is_some() && self.card.is_some()
    }
}

#[derive(Debug, PartialEq)]
pub enum ManifestError {
    Json(String),
    BadId,
    IdMismatch,
    BadVersion,
    BadPath(String),
    CardSize,
    BadChannel,
    HalfPage,
    Empty,
    BadWidget,
}

// The panel and the pill must fit the 640 × 360 notch overlay.
pub const CARD_WIDTH: RangeInclusive<u32> = 280..=600;
pub const CARD_HEIGHT: RangeInclusive<u32> = 40..=240;
pub const CHANNELS_MAX: usize = 8;
pub const WIDGETS_MAX: usize = 8;

/// 1–32 characters: a lowercase letter, then lowercase letters, digits or dashes.
pub fn is_module_id(s: &str) -> bool {
    let mut chars = s.chars();
    (1..=32).contains(&s.len())
        && chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A relative path inside the package: segments of [A-Za-z0-9._-], none empty,
/// "." or "..".
pub fn is_package_path(p: &str) -> bool {
    !p.is_empty()
        && p.split('/').all(|seg| {
            !seg.is_empty()
                && seg != "."
                && seg != ".."
                && seg.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        })
}

fn unique(ids: &[&str]) -> bool {
    ids.iter().enumerate().all(|(i, id)| !ids[..i].contains(id))
}

fn is_version(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| p.parse::<u32>().is_ok())
}

pub fn parse_manifest(json: &str, folder: &str) -> Result<Manifest, ManifestError> {
    let m: Manifest = serde_json::from_str(json).map_err(|e| ManifestError::Json(e.to_string()))?;
    if !is_module_id(&m.id) {
        return Err(ManifestError::BadId);
    }
    if m.id != folder {
        return Err(ManifestError::IdMismatch);
    }
    if !is_version(&m.version) {
        return Err(ManifestError::BadVersion);
    }
    if m.entry.is_some() != m.card.is_some() {
        return Err(ManifestError::HalfPage);
    }
    if !m.has_page() && m.widgets.is_empty() {
        return Err(ManifestError::Empty);
    }
    for path in m.entry.iter().chain([&m.icon]) {
        if !is_package_path(path) {
            return Err(ManifestError::BadPath(path.clone()));
        }
    }
    if m.card.is_some_and(|c| !CARD_WIDTH.contains(&c.width) || !CARD_HEIGHT.contains(&c.height)) {
        return Err(ManifestError::CardSize);
    }
    let widgets: Vec<&str> = m.widgets.iter().map(|w| w.id.as_str()).collect();
    let good_widgets = widgets.len() <= WIDGETS_MAX
        && unique(&widgets)
        && m.widgets
            .iter()
            .all(|w| is_module_id(&w.id) && (1..=2).contains(&w.width) && is_package_path(&w.entry));
    if !good_widgets {
        return Err(ManifestError::BadWidget);
    }
    let ids: Vec<&str> = m.notifications.iter().map(|c| c.id.as_str()).collect();
    let own_widget = |c: &ChannelSpec| c.widget.as_ref().is_none_or(|w| widgets.contains(&w.as_str()));
    if ids.len() > CHANNELS_MAX
        || !unique(&ids)
        || !ids.iter().all(|id| is_module_id(id))
        || !m.notifications.iter().all(own_widget)
    {
        return Err(ManifestError::BadChannel);
    }
    Ok(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOOD: &str = r#"{"id":"system-stat","version":"1.0.0","entry":"index.html","icon":"icon.svg",
      "card":{"width":400,"height":80},"permissions":[],"capabilities":["system.stats"]}"#;

    #[test]
    fn a_good_manifest_parses() {
        let m = parse_manifest(GOOD, "system-stat").unwrap();
        assert_eq!(m.capabilities, vec![Capability::SystemStats]);
        assert_eq!(m.card, Some(CardSize { width: 400, height: 80 }));
    }

    #[test]
    fn the_id_must_match_its_folder() {
        assert_eq!(parse_manifest(GOOD, "home"), Err(ManifestError::IdMismatch));
    }

    #[test]
    fn unknown_capabilities_and_fields_are_refused() {
        assert!(matches!(
            parse_manifest(&GOOD.replace("system.stats", "keyboard.lock"), "system-stat"),
            Err(ManifestError::Json(_))
        ));
        assert!(matches!(
            parse_manifest(&GOOD.replace("\"entry\"", "\"extra\":1,\"entry\""), "system-stat"),
            Err(ManifestError::Json(_))
        ));
    }

    #[test]
    fn card_size_must_fit_the_notch_overlay() {
        assert_eq!(parse_manifest(&GOOD.replace("400", "700"), "system-stat"), Err(ManifestError::CardSize));
        assert_eq!(
            parse_manifest(&GOOD.replace("\"height\":80", "\"height\":300"), "system-stat"),
            Err(ManifestError::CardSize)
        );
    }

    #[test]
    fn package_paths_stay_inside_the_package() {
        for ok in ["index.html", "assets/index-1a.js"] {
            assert!(is_package_path(ok), "{ok}");
        }
        for bad in ["", "/x", "../x", "a/../b", "a/./b", "a//b", "a\\b", "%2e%2e/x"] {
            assert!(!is_package_path(bad), "{bad}");
        }
    }

    #[test]
    fn notification_channels_parse() {
        let with = GOOD.replace(
            "\"capabilities\"",
            r#""notifications":[{"id":"done","on":true,"sound":true}],"capabilities""#,
        );
        let m = parse_manifest(&with, "system-stat").unwrap();
        assert_eq!(m.notifications, vec![ChannelSpec { id: "done".into(), on: true, sound: true, widget: None }]);
        assert!(parse_manifest(GOOD, "system-stat").unwrap().notifications.is_empty());
    }

    #[test]
    fn bad_channels_are_refused() {
        let with = |list: &str| GOOD.replace("\"capabilities\"", &format!(r#""notifications":[{list}],"capabilities""#));
        let ch = |id: &str| format!(r#"{{"id":"{id}","on":true,"sound":false}}"#);
        let nine = (0..9).map(|i| ch(&format!("c{i}"))).collect::<Vec<_>>().join(",");
        for bad in [ch("Done!"), format!("{},{}", ch("done"), ch("done")), nine] {
            assert_eq!(parse_manifest(&with(&bad), "system-stat"), Err(ManifestError::BadChannel), "{bad}");
        }
    }

    const WIDGETS: &str = r#"{"id":"home","version":"2.0.0","icon":"icon.svg","permissions":[],"capabilities":[],
      "widgets":[{"id":"date","entry":"index.html","width":1,"kind":"time"},
                 {"id":"reminders","entry":"index.html","width":2,"kind":"work"}],
      "notifications":[{"id":"reminder","on":true,"sound":true,"widget":"reminders"}]}"#;

    #[test]
    fn a_widget_package_needs_no_page() {
        let m = parse_manifest(WIDGETS, "home").unwrap();
        assert!(!m.has_page());
        assert_eq!(m.widgets[1].width, 2);
        assert_eq!(m.widgets[1].kind, WidgetKind::Work);
        assert_eq!(m.notifications[0].widget.as_deref(), Some("reminders"));
        assert!(parse_manifest(GOOD, "system-stat").unwrap().has_page());
    }

    #[test]
    fn a_page_needs_both_entry_and_card() {
        let no_card = GOOD.replace(r#""card":{"width":400,"height":80},"#, "");
        assert_eq!(parse_manifest(&no_card, "system-stat"), Err(ManifestError::HalfPage));
        let no_entry = GOOD.replace(r#""entry":"index.html","#, "");
        assert_eq!(parse_manifest(&no_entry, "system-stat"), Err(ManifestError::HalfPage));
    }

    #[test]
    fn a_package_with_nothing_is_refused() {
        let bare = r#"{"id":"home","version":"1.0.0","icon":"icon.svg","permissions":[],"capabilities":[]}"#;
        assert_eq!(parse_manifest(bare, "home"), Err(ManifestError::Empty));
    }

    #[test]
    fn bad_widgets_are_refused() {
        let w = |list: &str| format!(
            r#"{{"id":"home","version":"1.0.0","icon":"icon.svg","permissions":[],"capabilities":[],"widgets":[{list}]}}"#
        );
        let one = |id: &str, entry: &str, width: u8| format!(r#"{{"id":"{id}","entry":"{entry}","width":{width},"kind":"time"}}"#);
        let nine = (0..9).map(|i| one(&format!("w{i}"), "index.html", 1)).collect::<Vec<_>>().join(",");
        for bad in [
            one("date", "index.html", 3),
            one("date", "index.html", 0),
            one("Date!", "index.html", 1),
            format!("{},{}", one("date", "index.html", 1), one("date", "index.html", 1)),
            one("date", "../x", 1),
            nine,
        ] {
            assert_eq!(parse_manifest(&w(&bad), "home"), Err(ManifestError::BadWidget), "{bad}");
        }
    }

    #[test]
    fn a_channel_can_only_point_at_its_own_widget() {
        let bad = WIDGETS.replace(r#""widget":"reminders""#, r#""widget":"clock""#);
        assert_eq!(parse_manifest(&bad, "home"), Err(ManifestError::BadChannel));
    }

    #[test]
    fn the_status_capability_parses() {
        let m = parse_manifest(&GOOD.replace("system.stats", "status"), "system-stat").unwrap();
        assert_eq!(m.capabilities, vec![Capability::Status]);
    }

    #[test]
    fn repo_modules_are_valid() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../modules");
        let index: Vec<String> =
            serde_json::from_str(&std::fs::read_to_string(root.join("index.json")).unwrap()).unwrap();
        assert!(!index.is_empty());
        for id in index {
            let dir = root.join(&id);
            let json = std::fs::read_to_string(dir.join("manifest.json")).unwrap();
            let m = parse_manifest(&json, &id).unwrap_or_else(|e| panic!("{id}: {e:?}"));
            for lang in ["id", "en"] {
                let text = std::fs::read_to_string(dir.join(format!("locales/{lang}.json"))).unwrap();
                let v: serde_json::Value = serde_json::from_str(&text).unwrap();
                assert!(v["name"].is_string() && v["description"].is_string(), "{id}/{lang}");
                for c in &m.notifications {
                    assert!(v["channels"][&c.id].is_string(), "{id}/{lang}: channel {}", c.id);
                }
                for w in &m.widgets {
                    assert!(v["widgets"][&w.id].is_string(), "{id}/{lang}: widget {}", w.id);
                }
            }
        }
    }
}

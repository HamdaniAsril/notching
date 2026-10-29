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

#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub id: String,
    pub version: String,
    pub entry: String,
    pub icon: String,
    pub card: CardSize,
    pub permissions: Vec<Permission>,
    pub capabilities: Vec<Capability>,
}

#[derive(Debug, PartialEq)]
pub enum ManifestError {
    Json(String),
    BadId,
    IdMismatch,
    BadVersion,
    BadPath(String),
    CardSize,
}

// The panel and the pill must fit the 640 × 360 notch overlay.
pub const CARD_WIDTH: RangeInclusive<u32> = 280..=600;
pub const CARD_HEIGHT: RangeInclusive<u32> = 40..=240;

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
    for path in [&m.entry, &m.icon] {
        if !is_package_path(path) {
            return Err(ManifestError::BadPath(path.clone()));
        }
    }
    if !CARD_WIDTH.contains(&m.card.width) || !CARD_HEIGHT.contains(&m.card.height) {
        return Err(ManifestError::CardSize);
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
        assert_eq!(m.card, CardSize { width: 400, height: 80 });
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
    fn repo_modules_are_valid() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../modules");
        let index: Vec<String> =
            serde_json::from_str(&std::fs::read_to_string(root.join("index.json")).unwrap()).unwrap();
        assert!(!index.is_empty());
        for id in index {
            let dir = root.join(&id);
            let json = std::fs::read_to_string(dir.join("manifest.json")).unwrap();
            parse_manifest(&json, &id).unwrap_or_else(|e| panic!("{id}: {e:?}"));
            for lang in ["id", "en"] {
                let text = std::fs::read_to_string(dir.join(format!("locales/{lang}.json"))).unwrap();
                let v: serde_json::Value = serde_json::from_str(&text).unwrap();
                assert!(v["name"].is_string() && v["description"].is_string(), "{id}/{lang}");
            }
        }
    }
}

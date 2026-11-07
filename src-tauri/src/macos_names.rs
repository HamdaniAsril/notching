//! What System Settings › Privacy & Security calls the permissions Notching asks
//! for, by macOS version: macOS 27 renamed Accessibility, macOS 15 Screen Recording.
//! The table is the windows' own (src/i18n/macos-names.json), so both say the same.

use crate::locale::Lang;
use std::collections::BTreeMap;
use std::sync::LazyLock;

#[derive(serde::Deserialize)]
struct Name {
    from: u32,
    id: String,
    en: String,
}

// Per permission, newest name first; the last one is from macOS 0.
static NAMES: LazyLock<BTreeMap<String, Vec<Name>>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/i18n/macos-names.json")).expect("macos-names.json is valid")
});

/// Puts System Settings' names into `{accessibility}`, `{screenRecording}`,
/// `{fullDiskAccess}` and `{camera}`; other `{names}` stay for their caller.
pub fn fill(text: &str, lang: Lang, macos: u32) -> String {
    NAMES.iter().fold(text.to_string(), |text, (key, names)| {
        let Some(name) = names.iter().find(|n| macos >= n.from) else { return text };
        let name = match lang {
            Lang::Id => &name.id,
            Lang::En => &name.en,
        };
        text.replace(&format!("{{{key}}}"), name)
    })
}

/// This Mac's macOS major version (27 for macOS 27.0.1).
#[cfg(target_os = "macos")]
pub fn major() -> u32 {
    let v = objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion().majorVersion;
    u32::try_from(v).unwrap_or(0)
}

#[cfg(not(target_os = "macos"))]
pub fn major() -> u32 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_27_has_the_new_names() {
        // System Settings' own words on macOS 27.0.1.
        assert_eq!(fill("Intip jendela butuh izin {accessibility}", Lang::Id, 27), "Intip jendela butuh izin Kontrol Perangkat dan Akses Data");
        assert_eq!(fill("Screenshot butuh izin {screenRecording}", Lang::Id, 27), "Screenshot butuh izin Rekaman Layar & Audio Sistem");
        assert_eq!(fill("Allow {accessibility}", Lang::En, 27), "Allow Device Control and Data Access");
        assert_eq!(fill("Screenshot needs {screenRecording}", Lang::En, 27), "Screenshot needs Screen & System Audio Recording");
    }

    #[test]
    fn older_macos_has_the_old_names() {
        assert_eq!(fill("Izinkan {accessibility}", Lang::Id, 26), "Izinkan Aksesibilitas");
        assert_eq!(fill("{screenRecording}", Lang::Id, 15), "Rekaman Layar & Audio Sistem");
        assert_eq!(fill("{screenRecording}", Lang::Id, 14), "Perekaman Layar");
        assert_eq!(fill("{accessibility} · {screenRecording}", Lang::En, 13), "Accessibility · Screen Recording");
        assert_eq!(fill("{accessibility}", Lang::En, 0), "Accessibility");
    }

    #[test]
    fn other_placeholders_stay() {
        assert_eq!(fill("{keys} · {fullDiskAccess} · {camera} · {n}", Lang::Id, 27), "{keys} · Akses Disk Penuh · Kamera · {n}");
    }
}

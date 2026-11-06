//! Copot Notching in Settings (owner, 4 Nov): letting go of every permission
//! Notching was given, and taking Notching off this Mac. Everything goes to the
//! Trash, never deleted, so Put Back undoes it.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use tauri::AppHandle;

// Folders of ~/Library where Notching keeps files, all named by its bundle id.
const PLACES: &[&str] = &[
    "Application Support",
    "Caches",
    "Preferences",
    "Preferences/ByHost",
    "Saved Application State",
    "HTTPStorages",
    "WebKit",
    "Cookies",
    "Logs",
];

/// Notching's own files under `home`/Library: entries named exactly `bid`, or
/// `bid` and a dot ("id.web.notching.plist"). Nothing else matches, so another
/// app's files are never touched.
pub fn own_files(home: &Path, bid: &str) -> Vec<PathBuf> {
    let lib = home.join("Library");
    let dotted = format!("{bid}.");
    let mut out = Vec::new();
    for place in PLACES {
        let Ok(entries) = std::fs::read_dir(lib.join(place)) else { continue };
        let mut found: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .filter(|e| {
                let name = e.file_name();
                let name = name.to_string_lossy();
                name == bid || name.starts_with(&dotted)
            })
            .map(|e| e.path())
            .collect();
        found.sort();
        out.extend(found);
    }
    out
}

/// The installed app around `exe` (…/Notching.app/Contents/MacOS/notching);
/// None for a dev build, which must never trash itself.
pub fn bundle_of(exe: &Path) -> Option<PathBuf> {
    crate::login_item::is_bundled(exe).then(|| exe.ancestors().nth(3).map(Path::to_path_buf)).flatten()
}

fn bundle_id(app: &AppHandle) -> String {
    app.config().identifier.clone()
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// "~/Library/…" for showing.
fn shown(home: &Path, p: &Path) -> String {
    match p.strip_prefix(home) {
        Ok(rest) => format!("~/{}", rest.display()),
        Err(_) => p.display().to_string(),
    }
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UninstallDto {
    /// The installed app, shown; None in a dev build, where uninstalling is off.
    pub app: Option<String>,
    /// What else goes to the Trash, shown.
    pub files: Vec<String>,
}

/// What Copot Notching would take, for its page.
#[tauri::command]
pub fn uninstall_preview(app: AppHandle) -> UninstallDto {
    let home = home().unwrap_or_default();
    let bundle = std::env::current_exe().ok().and_then(|e| bundle_of(&e));
    UninstallDto {
        app: bundle.map(|b| shown(&home, &b)),
        files: own_files(&home, &bundle_id(&app)).iter().map(|p| shown(&home, p)).collect(),
    }
}

// macOS forgets every permission it gave this bundle id; each asks again next time.
fn reset_permissions(bid: &str) -> Result<(), String> {
    let out = Command::new("/usr/bin/tccutil").args(["reset", "All", bid]).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Lets go of every permission Notching was given: Accessibility, Screen
/// Recording, Full Disk Access, Camera and the rest. The Izin page then shows
/// them not allowed.
#[tauri::command]
pub fn release_permissions(app: AppHandle) -> Result<(), String> {
    let bid = bundle_id(&app);
    let result = reset_permissions(&bid);
    match &result {
        Ok(()) => eprintln!("notching: every permission for {bid} let go"),
        Err(e) => eprintln!("notching: permissions for {bid} not let go: {e}"),
    }
    crate::settings_window::emit_settings(&app);
    result
}

/// To the Trash the way Finder does, so Put Back works.
pub fn trash(p: &Path) -> Result<(), String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()));
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, None)
        .map_err(|e| e.localizedDescription().to_string())
}

/// Takes Notching off this Mac: off at login, every permission let go, its
/// files and then the app itself to the Trash, then it quits. Refused in a dev
/// build. A file that won't move is told and the rest goes on; the app staying
/// put stops before quitting, so nothing is left half done without a word.
#[tauri::command]
pub fn uninstall_notching(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bundle = bundle_of(&exe).ok_or("dev")?;
    let bid = bundle_id(&app);
    if let Err(e) = crate::login_item::set(false) {
        eprintln!("notching: login item not removed while uninstalling: {e}");
    }
    if let Err(e) = reset_permissions(&bid) {
        eprintln!("notching: permissions not let go while uninstalling: {e}");
    }
    let home = home().ok_or("no home folder")?;
    for p in own_files(&home, &bid) {
        if let Err(e) = trash(&p) {
            eprintln!("notching: {} not moved to the Trash: {e}", p.display());
        }
    }
    trash(&bundle).map_err(|e| {
        eprintln!("notching: {} not moved to the Trash: {e}", bundle.display());
        e
    })?;
    eprintln!("notching: uninstalled; quitting");
    // process::exit skips RunEvent::Exit: macOS's ⌘Tab back on here, or it stays
    // off with Notching already in the Trash.
    crate::switch_symbolic::restore();
    // A moment for the page to hear the answer, then out without saving anything
    // again: the settings and caches just went to the Trash.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(400));
        std::process::exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(p: &Path) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, b"x").unwrap();
    }

    #[test]
    fn own_files_are_named_by_the_bundle_id_only() {
        let t = tempfile::tempdir().unwrap();
        let home = t.path();
        let lib = home.join("Library");
        std::fs::create_dir_all(lib.join("Application Support/id.web.notching/modules")).unwrap();
        touch(&lib.join("Preferences/id.web.notching.plist"));
        touch(&lib.join("Caches/id.web.notching/x"));
        std::fs::create_dir_all(lib.join("WebKit/id.web.notching")).unwrap();
        // Not Notching's: a longer id, a prefix without the dot, another app.
        touch(&lib.join("Preferences/id.web.notchingx.plist"));
        touch(&lib.join("Preferences/id.web.notch.plist"));
        std::fs::create_dir_all(lib.join("Application Support/com.other.app")).unwrap();
        let found: Vec<String> =
            own_files(home, "id.web.notching").iter().map(|p| p.strip_prefix(&lib).unwrap().display().to_string()).collect();
        assert_eq!(
            found,
            [
                "Application Support/id.web.notching",
                "Caches/id.web.notching",
                "Preferences/id.web.notching.plist",
                "WebKit/id.web.notching",
            ]
        );
    }

    #[test]
    fn nothing_found_without_a_library() {
        let t = tempfile::tempdir().unwrap();
        assert!(own_files(t.path(), "id.web.notching").is_empty());
    }

    #[test]
    fn only_an_installed_app_is_ever_taken() {
        assert_eq!(
            bundle_of(Path::new("/Applications/Notching.app/Contents/MacOS/notching")),
            Some(PathBuf::from("/Applications/Notching.app"))
        );
        assert_eq!(bundle_of(Path::new("/Users/me/dev/notch/src-tauri/target/debug/notching")), None);
    }

    #[test]
    fn paths_show_from_home() {
        assert_eq!(
            shown(Path::new("/Users/me"), Path::new("/Users/me/Library/Caches/id.web.notching")),
            "~/Library/Caches/id.web.notching"
        );
        assert_eq!(shown(Path::new("/Users/me"), Path::new("/Applications/Notching.app")), "/Applications/Notching.app");
    }
}

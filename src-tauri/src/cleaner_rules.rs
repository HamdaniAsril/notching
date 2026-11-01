// Cleaner's safety rules (design 1 Nov §7): where each kind of item may live,
// what is never touched, how leftovers are matched, and the log and exclusion
// formats. Pure: nothing here reads the disk, so every rule has a test.
// Mole (GPL-3.0) gave the ideas only; the locations are standard macOS folders.

use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Where Cleaner may look. In test mode (`NOTCHING_CLEANER_ROOT`) both roots sit
/// inside the sample folder, so nothing outside it is ever scanned or removed.
#[derive(Clone, Debug, PartialEq)]
pub struct Roots {
    pub home: PathBuf,
    pub apps: Vec<PathBuf>,
    pub test_mode: bool,
}

impl Roots {
    pub fn real(home: PathBuf) -> Roots {
        let apps = vec![PathBuf::from("/Applications"), home.join("Applications")];
        Roots { home, apps, test_mode: false }
    }

    pub fn test(root: &Path) -> Roots {
        Roots { home: root.join("home"), apps: vec![root.join("Applications")], test_mode: true }
    }

    /// Test mode only for a non-empty absolute path; anything else is the real Mac.
    pub fn from_env(home: PathBuf, var: Option<OsString>) -> Roots {
        match var.map(PathBuf::from) {
            Some(root) if root.is_absolute() && root.parent().is_some() => Roots::test(&root),
            _ => Roots::real(home),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    AppCache,
    BrowserCache,
    DevCache,
    Log,
    Orphan,
    Trash,
    Build,
    Installer,
    Backup,
    App,
    Leftover,
    Personal,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Method {
    Permanent,
    Trash,
}

/// What comes back by itself goes for good; what does not goes to the Trash (§5.1).
pub fn method(c: Category) -> Method {
    match c {
        Category::AppCache | Category::BrowserCache | Category::DevCache | Category::Log | Category::Trash | Category::Build => {
            Method::Permanent
        }
        Category::Orphan | Category::Installer | Category::Backup | Category::App | Category::Leftover | Category::Personal => {
            Method::Trash
        }
    }
}

/// Ticked when the list opens. A leftover's tick comes from its confidence.
pub fn ticked_by_default(c: Category) -> bool {
    matches!(c, Category::AppCache | Category::BrowserCache | Category::DevCache | Category::Log | Category::App)
}

pub enum Purpose<'a> {
    Clean,
    Uninstall { bundle_id: &'a str, app: &'a Path },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Skip {
    InUse,
    Protected,
    Changed,
    Failed,
    Excluded,
    Stopped,
}

impl Skip {
    pub fn key(self) -> &'static str {
        match self {
            Skip::InUse => "inUse",
            Skip::Protected => "protected",
            Skip::Changed => "changed",
            Skip::Failed => "failed",
            Skip::Excluded => "excluded",
            Skip::Stopped => "stopped",
        }
    }
}

impl Category {
    pub fn key(self) -> &'static str {
        match self {
            Category::AppCache => "appCache",
            Category::BrowserCache => "browserCache",
            Category::DevCache => "devCache",
            Category::Log => "log",
            Category::Orphan => "orphan",
            Category::Trash => "trash",
            Category::Build => "build",
            Category::Installer => "installer",
            Category::Backup => "backup",
            Category::App => "app",
            Category::Leftover => "leftover",
            Category::Personal => "personal",
        }
    }
}

// Folders that are never an item themselves: removing one would take far more
// than any one thing in it.
const ROOT_FOLDERS: &[&str] = &[
    "",
    "Library",
    "Library/Caches",
    "Library/Logs",
    "Library/Application Support",
    "Library/Containers",
    "Library/Group Containers",
    "Library/Preferences",
    "Library/Saved Application State",
    "Library/LaunchAgents",
    "Library/Developer",
    "Applications",
];

// The user's own folders (§7). Only an installer directly in Downloads is offered.
const PERSONAL_FOLDERS: &[&str] = &["Desktop", "Documents", "Downloads", "Pictures", "Movies", "Music", "Public"];

const PROTECTED_LIBRARY: &[&str] = &[
    "Mobile Documents",
    "Mail",
    "Keychains",
    "Safari",
    "Cookies",
    "Accounts",
    "Messages",
    "Calendars",
    "Photos",
    "PersonalizationPortrait",
];

// Hidden folders under home are never touched, except these caches and the Trash.
const HIDDEN_ALLOWED: &[&str] = &[".Trash", ".npm/_cacache", ".cargo/registry/cache"];

/// Names whose data is passwords, VPNs, virtual machines or AI tools' memory.
/// Matched as a part of any path component under home, lowercased.
pub const PROTECTED_VENDORS: &[&str] = &[
    "1password", "agilebits", "bitwarden", "keepass", "lastpass", "dashlane", "vpn", "wireguard", "tunnelblick", "docker",
    "utm", "parallels", "vmware", "virtualbox", "orbstack", "claude", "anthropic", "openai", "cursor", "ollama",
];

const OWN_ID: &str = "id.web.notching";

/// Every removal asks this, at scan time and again just before removing (§7).
/// It judges the path as given and never follows a link.
pub fn check(path: &Path, cat: Category, purpose: &Purpose, roots: &Roots, excluded: &Exclusions) -> Result<(), Skip> {
    if !sane(path) {
        return Err(Skip::Protected);
    }
    if excluded.covers(path) {
        return Err(Skip::Excluded);
    }
    let home = &roots.home;
    if path == Path::new("/") || ROOT_FOLDERS.iter().any(|r| path == home.join(r)) || roots.apps.iter().any(|a| path == a) {
        return Err(Skip::Protected);
    }
    if !located(path, cat, roots) {
        return Err(Skip::Protected);
    }
    let Ok(rel) = path.strip_prefix(home) else {
        // Only apps live outside home, and `located` has placed them.
        return Ok(());
    };
    if hidden(rel) {
        return Err(Skip::Protected);
    }
    let personal = cat == Category::Personal && matches!(purpose, Purpose::Uninstall { .. });
    if personal {
        return Ok(());
    }
    let mut parts = rel.components().filter_map(|c| c.as_os_str().to_str());
    let first = parts.next().unwrap_or("");
    if PERSONAL_FOLDERS.contains(&first) {
        let installer = cat == Category::Installer && first == "Downloads" && rel.components().count() == 2;
        if !installer {
            return Err(Skip::Protected);
        }
    }
    if first == "Library" {
        if let Some(second) = parts.next() {
            if PROTECTED_LIBRARY.contains(&second) {
                return Err(Skip::Protected);
            }
        }
    }
    for c in rel.components() {
        let name = c.as_os_str().to_string_lossy().to_lowercase();
        if name.contains(OWN_ID) || PROTECTED_VENDORS.iter().any(|v| name.contains(v)) {
            return Err(Skip::Protected);
        }
    }
    Ok(())
}

fn sane(path: &Path) -> bool {
    let Some(text) = path.to_str() else { return false };
    if !path.is_absolute() || text.contains("//") || text.chars().any(char::is_control) {
        return false;
    }
    path.components().all(|c| matches!(c, Component::RootDir | Component::Normal(_)))
}

fn hidden(rel: &Path) -> bool {
    let starts_hidden = rel.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
    starts_hidden && !HIDDEN_ALLOWED.iter().any(|a| rel.starts_with(a))
}

/// Strictly inside one of these, for an item of `cat`.
pub fn allowed_parent(cat: Category, roots: &Roots) -> Vec<PathBuf> {
    let h = &roots.home;
    let lib = h.join("Library");
    match cat {
        Category::AppCache => vec![lib.join("Caches"), lib.join("Containers")],
        Category::BrowserCache => vec![lib.join("Caches")],
        Category::DevCache => vec![lib.join("Caches"), lib.join("Developer"), h.join(".npm"), h.join(".cargo/registry")],
        Category::Log => vec![lib.join("Logs")],
        Category::Orphan => vec![lib.join("Caches"), lib.join("Logs"), lib.join("Saved Application State")],
        Category::Trash | Category::Build => vec![h.clone()],
        Category::Installer => vec![h.join("Downloads")],
        Category::Backup => vec![lib.join("Application Support/MobileSync/Backup")],
        Category::App => roots.apps.clone(),
        Category::Leftover | Category::Personal => vec![lib],
    }
}

fn located(path: &Path, cat: Category, roots: &Roots) -> bool {
    let inside = allowed_parent(cat, roots).iter().any(|p| path.starts_with(p) && path != p);
    if !inside {
        return false;
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let parent = path.parent().unwrap_or(path);
    match cat {
        Category::Trash => path == roots.home.join(".Trash"),
        Category::Build => name == "node_modules" || name == "target",
        Category::Installer => {
            let lower = name.to_lowercase();
            parent == roots.home.join("Downloads") && [".dmg", ".pkg", ".xip"].iter().any(|e| lower.ends_with(e))
        }
        Category::Backup => allowed_parent(cat, roots).iter().any(|p| p == parent),
        Category::App => name.ends_with(".app"),
        _ => true,
    }
}

/// A child of `~/Library/Caches`, by its name.
pub fn classify_cache(name: &str) -> Category {
    const BROWSERS: &[&str] = &[
        "com.apple.Safari",
        "Google",
        "Firefox",
        "Mozilla",
        "Microsoft Edge",
        "BraveSoftware",
        "company.thebrowser.Browser",
        "com.operasoftware.Opera",
        "com.vivaldi.Vivaldi",
    ];
    const DEV: &[&str] = &["Homebrew", "pip", "Yarn", "go-build", "com.apple.dt.Xcode", "node-gyp", "ms-playwright"];
    if BROWSERS.contains(&name) {
        Category::BrowserCache
    } else if DEV.contains(&name) {
        Category::DevCache
    } else {
        Category::AppCache
    }
}

/// Reverse-DNS, like `com.spotify.client`: at least three parts.
pub fn is_bundle_id(name: &str) -> bool {
    let parts: Vec<&str> = name.split('.').collect();
    parts.len() >= 3
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        && parts[0].chars().next().is_some_and(|c| c.is_ascii_lowercase())
}

pub fn name_key(s: &str) -> String {
    s.chars().filter(|c| !matches!(c, ' ' | '-' | '_' | '.')).flat_map(char::to_lowercase).collect()
}

/// Too common to say which app a folder belongs to.
pub const GENERIC: &[&str] = &[
    "helper", "update", "updater", "data", "cache", "caches", "logs", "support", "app", "service", "agent", "plugin", "plugins",
    "settings", "config", "default", "shared", "common", "tmp",
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Confidence {
    Sure,
    Maybe,
}

/// Whether a folder entry belongs to the app (§5.2). `vendor_path` is a
/// `Vendor/Name` pair found one level down, as Chrome's `Google/Chrome`.
pub fn leftover_match(entry: &str, bundle_id: &str, app_name: &str, vendor_path: Option<(&str, &str)>) -> Option<Confidence> {
    let e = entry.to_lowercase();
    let bid = bundle_id.to_lowercase();
    if e == bid || e.starts_with(&format!("{bid}.")) || e == format!("group.{bid}") {
        return Some(Confidence::Sure);
    }
    let key = name_key(app_name);
    if let Some((vendor, name)) = vendor_path {
        let bid_vendor = bid.split('.').nth(1).unwrap_or("");
        if !bid_vendor.is_empty() && vendor.to_lowercase() == bid_vendor && name_key(name) == key {
            return Some(Confidence::Sure);
        }
        return None;
    }
    if key.len() >= 4 && !GENERIC.contains(&key.as_str()) && name_key(entry) == key {
        return Some(Confidence::Maybe);
    }
    None
}

/// An entry named for another installed app whose bundle id is longer and also
/// fits (Chrome's `com.google.Chrome` against Canary's `com.google.Chrome.canary`).
pub fn owned_by_longer(entry: &str, bundle_id: &str, others: &[String]) -> bool {
    let e = entry.to_lowercase();
    others.iter().any(|o| {
        let o = o.to_lowercase();
        o.len() > bundle_id.len() && (e == o || e.starts_with(&format!("{o}.")) || e == format!("group.{o}"))
    })
}

pub const ORPHAN_AGE_MS: i64 = 2_592_000_000;

/// A leftover of an app that is gone (§7): a bundle id, untouched 30 days, and
/// known absent. Unknown is not absent.
pub fn orphan_ok(name: &str, newest_mtime_ms: i64, now_ms: i64, installed: impl Fn(&str) -> Option<bool>) -> bool {
    is_bundle_id(name) && now_ms - newest_mtime_ms >= ORPHAN_AGE_MS && installed(name) == Some(false)
}

/// The owner's "Jangan pernah bersihkan" list.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Exclusions {
    pub paths: Vec<PathBuf>,
}

impl Exclusions {
    pub fn covers(&self, path: &Path) -> bool {
        self.paths.iter().any(|e| path.starts_with(e))
    }
}

#[derive(serde::Deserialize, serde::Serialize)]
struct ExclusionsFile {
    v: u32,
    paths: Vec<PathBuf>,
}

/// No file is an empty list; a file that can't be understood is an error, and
/// then nothing is cleaned.
pub fn parse_exclusions(text: Option<&str>) -> Result<Exclusions, ()> {
    let Some(text) = text else { return Ok(Exclusions::default()) };
    let file: ExclusionsFile = serde_json::from_str(text).map_err(|_| ())?;
    if file.v != 1 {
        return Err(());
    }
    Ok(Exclusions { paths: file.paths })
}

pub fn exclusions_json(e: &Exclusions) -> String {
    serde_json::to_string_pretty(&ExclusionsFile { v: 1, paths: e.paths.clone() }).unwrap_or_default()
}

/// One line of `cleaner.log` (§8), tab-separated.
pub fn log_line(at: &str, test_mode: bool, cat: Category, m: Method, outcome: Result<(), Skip>, bytes: u64, path: &Path) -> String {
    let mode = if test_mode { "coba" } else { "asli" };
    let how = match m {
        Method::Permanent => "permanent",
        Method::Trash => "trash",
    };
    let result = match outcome {
        Ok(()) => "ok".to_string(),
        Err(s) => format!("skip:{}", s.key()),
    };
    format!("{at}\t{mode}\t{}\t{how}\t{result}\t{bytes}\t{}", cat.key(), path.display())
}

/// Decimal units, as Finder: "25,9 GB" (id), "25.9 GB" (en); `spaced` false for
/// the status beside the notch.
pub fn size_text(bytes: u64, lang: &str, spaced: bool) -> String {
    let b = bytes as f64;
    let (value, unit, decimals) = if b >= 1e12 {
        (b / 1e12, "TB", 1)
    } else if b >= 1e9 {
        (b / 1e9, "GB", if b >= 1e11 { 0 } else { 1 })
    } else if b >= 1e6 {
        (b / 1e6, "MB", 0)
    } else if b >= 1e3 {
        (b / 1e3, "KB", 0)
    } else {
        (b, "B", 0)
    };
    let mut number = format!("{value:.decimals$}");
    if number.ends_with(".0") {
        number.truncate(number.len() - 2);
    }
    if lang == "id" {
        number = number.replace('.', ",");
    }
    let gap = if spaced { " " } else { "" };
    format!("{number}{gap}{unit}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> Roots {
        Roots::real(PathBuf::from("/Users/a"))
    }
    fn none() -> Exclusions {
        Exclusions::default()
    }
    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }
    fn clean(path: &str, cat: Category) -> Result<(), Skip> {
        check(&p(path), cat, &Purpose::Clean, &roots(), &none())
    }

    #[test]
    fn check_refuses_roots_and_odd_paths() {
        for path in ["/Users/a", "/Users/a/Library/Caches", "/", "/Users/a/Library/Caches/x/../../Documents", "/Users/a/Library/Caches/x\ny"] {
            assert_eq!(clean(path, Category::AppCache), Err(Skip::Protected), "{path:?}");
        }
        assert_eq!(check(&p("Library/Caches/x"), Category::AppCache, &Purpose::Clean, &roots(), &none()), Err(Skip::Protected));
        assert_eq!(clean("/Applications", Category::App), Err(Skip::Protected));
    }

    #[test]
    fn cache_child_is_allowed_cache_root_is_not() {
        assert_eq!(clean("/Users/a/Library/Caches/com.spotify.client", Category::AppCache), Ok(()));
        assert_eq!(clean("/Users/a/Library/Caches", Category::AppCache), Err(Skip::Protected));
        // The right place for its kind only.
        assert_eq!(clean("/Users/a/Library/Logs/x", Category::AppCache), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Library/Logs/x", Category::Log), Ok(()));
    }

    #[test]
    fn hidden_folders_are_protected_but_npm_cargo_trash() {
        assert_eq!(clean("/Users/a/.claude/x", Category::Build), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/.config/x/node_modules", Category::Build), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/.ssh/x", Category::Trash), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/.npm/_cacache", Category::DevCache), Ok(()));
        assert_eq!(clean("/Users/a/.cargo/registry/cache", Category::DevCache), Ok(()));
        assert_eq!(clean("/Users/a/.Trash", Category::Trash), Ok(()));
        assert_eq!(clean("/Users/a/.npm", Category::DevCache), Err(Skip::Protected));
        // The Trash item is only the Trash.
        assert_eq!(clean("/Users/a/dev", Category::Trash), Err(Skip::Protected));
    }

    #[test]
    fn personal_folders_are_protected_except_installers_in_downloads() {
        assert_eq!(clean("/Users/a/Downloads/a.dmg", Category::Installer), Ok(()));
        assert_eq!(clean("/Users/a/Downloads/a.dmg", Category::Build), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Downloads/sub/a.dmg", Category::Installer), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Downloads/notes.txt", Category::Installer), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Documents/x/node_modules", Category::Build), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/dev/x/node_modules", Category::Build), Ok(()));
        assert_eq!(clean("/Users/a/Library/Cookies/x.binarycookies", Category::Leftover), Err(Skip::Protected));
    }

    #[test]
    fn protected_vendors_lifted_only_for_personal_uninstall() {
        let path = p("/Users/a/Library/Containers/com.docker.docker");
        let un = Purpose::Uninstall { bundle_id: "com.docker.docker", app: Path::new("/Applications/Docker.app") };
        assert_eq!(check(&path, Category::AppCache, &Purpose::Clean, &roots(), &none()), Err(Skip::Protected));
        assert_eq!(check(&path, Category::Leftover, &un, &roots(), &none()), Err(Skip::Protected));
        assert_eq!(check(&path, Category::Personal, &un, &roots(), &none()), Ok(()));
        assert_eq!(check(&path, Category::Personal, &Purpose::Clean, &roots(), &none()), Err(Skip::Protected));
        // The app itself can go.
        assert_eq!(check(&p("/Applications/Docker.app"), Category::App, &un, &roots(), &none()), Ok(()));
        // Personal never lifts the hidden rule.
        assert_eq!(check(&p("/Users/a/Library/.x/com.docker.docker"), Category::Personal, &un, &roots(), &none()), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Library/Caches/com.anthropic.claudefordesktop", Category::AppCache), Err(Skip::Protected));
        assert_eq!(clean("/Users/a/Library/Caches/id.web.notching", Category::AppCache), Err(Skip::Protected));
    }

    #[test]
    fn symlink_into_documents_is_never_followed() {
        // `check` judges the path given: a link inside Caches is a cache item
        // (removed as a link); its target in Documents never is.
        assert_eq!(clean("/Users/a/Library/Caches/x/link", Category::AppCache), Ok(()));
        assert_eq!(clean("/Users/a/Documents/penting.txt", Category::AppCache), Err(Skip::Protected));
    }

    #[test]
    fn exclusion_covers_children() {
        let ex = Exclusions { paths: vec![p("/Users/a/Library/Caches/com.x.y")] };
        let c = |s: &str| check(&p(s), Category::AppCache, &Purpose::Clean, &roots(), &ex);
        assert_eq!(c("/Users/a/Library/Caches/com.x.y"), Err(Skip::Excluded));
        assert_eq!(c("/Users/a/Library/Caches/com.x.y/inner"), Err(Skip::Excluded));
        assert_eq!(c("/Users/a/Library/Caches/com.x.yz"), Ok(()));
    }

    #[test]
    fn corrupt_exclusions_refuse_everything() {
        assert_eq!(parse_exclusions(Some("{")), Err(()));
        assert_eq!(parse_exclusions(Some(r#"{"v":2,"paths":[]}"#)), Err(()));
        assert_eq!(parse_exclusions(None), Ok(Exclusions::default()));
        let e = Exclusions { paths: vec![p("/Users/a/Library/Caches/A b")] };
        assert_eq!(parse_exclusions(Some(&exclusions_json(&e))), Ok(e));
    }

    #[test]
    fn classify_cache_buckets() {
        assert_eq!(classify_cache("Google"), Category::BrowserCache);
        assert_eq!(classify_cache("com.apple.Safari"), Category::BrowserCache);
        assert_eq!(classify_cache("Homebrew"), Category::DevCache);
        assert_eq!(classify_cache("com.spotify.client"), Category::AppCache);
    }

    #[test]
    fn leftover_match_sure_maybe_none() {
        let m = |e: &str| leftover_match(e, "com.spotify.client", "Spotify", None);
        assert_eq!(m("com.spotify.client"), Some(Confidence::Sure));
        assert_eq!(m("com.spotify.client.savedState"), Some(Confidence::Sure));
        assert_eq!(m("com.spotify.client.plist"), Some(Confidence::Sure));
        assert_eq!(m("Spotify"), Some(Confidence::Maybe));
        assert_eq!(m("spot"), None);
        assert_eq!(m("com.spotify.clientele"), None);
        assert_eq!(leftover_match("Data", "com.x.data", "Data", None), None);
        assert_eq!(leftover_match("Box", "com.x.box", "Box", None), None);
        assert_eq!(leftover_match("Google/Chrome", "com.google.Chrome", "Google Chrome", Some(("Google", "Chrome"))), None);
        assert_eq!(leftover_match("Google/Chrome", "com.google.Chrome", "Chrome", Some(("Google", "Chrome"))), Some(Confidence::Sure));
        assert_eq!(leftover_match("group.com.spotify.client", "com.spotify.client", "Spotify", None), Some(Confidence::Sure));
    }

    #[test]
    fn longer_bundle_id_owns_its_entries() {
        let others = vec!["com.google.Chrome.canary".to_string()];
        assert!(owned_by_longer("com.google.Chrome.canary.plist", "com.google.Chrome", &others));
        assert!(!owned_by_longer("com.google.Chrome.plist", "com.google.Chrome", &others));
    }

    #[test]
    fn orphan_needs_bundle_id_age_and_known_absence() {
        let now = 100 * 86_400_000;
        let old = now - 31 * 86_400_000;
        assert!(orphan_ok("com.gone.app", old, now, |_| Some(false)));
        assert!(!orphan_ok("com.gone.app", old, now, |_| None));
        assert!(!orphan_ok("com.gone.app", now - 29 * 86_400_000, now, |_| Some(false)));
        assert!(!orphan_ok("com.here.app", old, now, |_| Some(true)));
        assert!(!orphan_ok("Spotify", old, now, |_| Some(false)));
    }

    #[test]
    fn log_line_has_every_field() {
        let line = log_line("2026-11-01T14:02:05+07:00", true, Category::AppCache, Method::Permanent, Ok(()), 42, &p("/x/y z"));
        assert_eq!(line, "2026-11-01T14:02:05+07:00\tcoba\tappCache\tpermanent\tok\t42\t/x/y z");
        let skip = log_line("t", false, Category::App, Method::Trash, Err(Skip::Changed), 0, &p("/A.app"));
        assert_eq!(skip, "t\tasli\tapp\ttrash\tskip:changed\t0\t/A.app");
    }

    #[test]
    fn size_text_by_language() {
        assert_eq!(size_text(25_900_000_000, "id", true), "25,9 GB");
        assert_eq!(size_text(25_900_000_000, "en", true), "25.9 GB");
        assert_eq!(size_text(25_900_000_000, "id", false), "25,9GB");
        assert_eq!(size_text(212_000_000_000, "id", true), "212 GB");
        assert_eq!(size_text(44_000_000_000, "en", true), "44 GB");
        assert_eq!(size_text(980_000_000, "id", true), "980 MB");
        assert_eq!(size_text(0, "en", true), "0 B");
    }

    #[test]
    fn test_mode_roots_from_env() {
        let r = Roots::from_env(p("/Users/a"), Some(OsString::from("/Users/a/cleaner-cek")));
        assert!(r.test_mode);
        assert_eq!(r.home, p("/Users/a/cleaner-cek/home"));
        assert_eq!(r.apps, vec![p("/Users/a/cleaner-cek/Applications")]);
        assert!(!Roots::from_env(p("/Users/a"), Some(OsString::from("rel"))).test_mode);
        assert!(!Roots::from_env(p("/Users/a"), Some(OsString::from(""))).test_mode);
        assert!(!Roots::from_env(p("/Users/a"), None).test_mode);
    }
}

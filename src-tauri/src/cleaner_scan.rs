// Cleaner's scans (design 1 Nov §4–§6): what Deep clean offers, the disk bar's
// parts and the breakdown. Plain `std::fs`, so the tests run on temp folders.
// Nothing is offered that `cleaner_rules::check` refuses.

use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use crate::cleaner_rules::{
    check, classify_cache, is_bundle_id, method, orphan_ok, ticked_by_default, Category, Exclusions, Method, Purpose, Roots,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Ident {
    pub dev: u64,
    pub ino: u64,
    pub mtime_ms: i64,
}

pub fn ident(p: &Path) -> Option<Ident> {
    let m = fs::symlink_metadata(p).ok()?;
    Some(Ident { dev: m.dev(), ino: m.ino(), mtime_ms: m.mtime() * 1000 + m.mtime_nsec() / 1_000_000 })
}

fn cancelled(cancel: &AtomicBool) -> bool {
    cancel.load(Ordering::Relaxed)
}

/// Bytes on disk (blocks), never following a link and never leaving `p`'s volume.
/// What can't be read counts 0.
pub fn du(p: &Path, cancel: &AtomicBool) -> u64 {
    let Ok(top) = fs::symlink_metadata(p) else { return 0 };
    let dev = top.dev();
    let mut total = top.blocks() * 512;
    if !top.is_dir() {
        return total;
    }
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if cancelled(cancel) {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let Ok(m) = e.metadata() else { continue };
            if m.dev() != dev {
                continue;
            }
            total += m.blocks() * 512;
            if m.is_dir() {
                stack.push(e.path());
            }
        }
    }
    total
}

/// The newest modification time anywhere inside, in ms.
pub fn newest_mtime(p: &Path, cancel: &AtomicBool) -> i64 {
    let mut newest = ident(p).map_or(0, |i| i.mtime_ms);
    let mut stack = vec![p.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if cancelled(cancel) {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let Ok(m) = e.metadata() else { continue };
            newest = newest.max(m.mtime() * 1000 + m.mtime_nsec() / 1_000_000);
            if m.is_dir() {
                stack.push(e.path());
            }
        }
    }
    newest
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: u64,
    pub category: Category,
    pub label: String,
    pub detail: Option<String>,
    #[serde(skip)]
    pub path: PathBuf,
    pub bytes: u64,
    pub method: Method,
    pub ticked: bool,
    pub in_use: bool,
    pub confidence: Option<&'static str>,
    #[serde(skip)]
    pub ident: Option<Ident>,
    /// The bundle id, app or tool whose running makes the item "in use".
    #[serde(skip)]
    pub owner: Option<String>,
}

pub struct Env<'a> {
    pub roots: &'a Roots,
    pub fda: bool,
    pub running: &'a dyn Fn(&str) -> bool,
    pub installed: &'a dyn Fn(&str) -> Option<bool>,
    pub mounted: &'a dyn Fn(&Path) -> bool,
    pub busy_tool: &'a dyn Fn(&str) -> bool,
    pub excluded: &'a Exclusions,
    pub now_ms: i64,
    pub cancel: &'a AtomicBool,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Parts {
    pub apps: Option<u64>,
    pub documents: Option<u64>,
    pub photos: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub bytes: u64,
    pub dir: bool,
    pub readable: bool,
    /// For the summed "rest" node only: how many small items it holds.
    pub rest: u32,
    pub children: Vec<Node>,
}

pub const NODE_MIN: u64 = 50_000_000;

pub fn breakdown(env: &Env) -> Node {
    breakdown_with(env, NODE_MIN)
}

// Opening these without Full Disk Access makes macOS ask, and its question
// closes the panel; without it they are not opened at all (§4).
const NEEDS_FDA: &[&str] = &[
    "Desktop",
    "Documents",
    "Downloads",
    "Pictures",
    "Movies",
    "Music",
    "Library/Containers",
    "Library/Group Containers",
    ".Trash",
    "Library/Application Support/MobileSync",
];

// iCloud Drive and other cloud folders may ask even with Full Disk Access.
const NEVER_OPEN: &[&str] = &["Library/Mobile Documents", "Library/CloudStorage"];

pub fn may_open(path: &Path, roots: &Roots, fda: bool) -> bool {
    let under = |names: &[&str]| names.iter().any(|n| path.starts_with(roots.home.join(n)));
    !under(NEVER_OPEN) && (fda || !under(NEEDS_FDA))
}

/// Every folder from home (or the app folder) down to the item's parent is a
/// real folder, not a link that leads somewhere else (§7).
pub fn real_dirs(path: &Path, roots: &Roots) -> bool {
    let base = if path.starts_with(&roots.home) {
        &roots.home
    } else if let Some(apps) = roots.apps.iter().find(|a| path.starts_with(a)) {
        apps
    } else {
        return false;
    };
    let mut at = path.parent();
    while let Some(dir) = at {
        if dir == base.as_path() {
            return true;
        }
        match fs::symlink_metadata(dir) {
            Ok(m) if m.is_dir() => {}
            _ => return false,
        }
        at = dir.parent();
    }
    false
}

fn children(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    out.sort();
    out
}

fn name_of(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

struct Maker<'e, 'a> {
    env: &'e Env<'a>,
    next_id: &'e mut u64,
    items: Vec<Item>,
}

impl Maker<'_, '_> {
    /// Adds the item when the rules allow it; an excluded or protected one is dropped.
    fn add(&mut self, path: PathBuf, cat: Category, label: String, detail: Option<String>, owner: Option<String>, in_use: bool) {
        if !may_open(&path, self.env.roots, self.env.fda) || !real_dirs(&path, self.env.roots) {
            return;
        }
        if check(&path, cat, &Purpose::Clean, self.env.roots, self.env.excluded).is_err() {
            return;
        }
        let id = *self.next_id;
        *self.next_id += 1;
        let bytes = du(&path, self.env.cancel);
        self.items.push(Item {
            id,
            category: cat,
            label,
            detail,
            ident: ident(&path),
            path,
            bytes,
            method: method(cat),
            ticked: ticked_by_default(cat) && !in_use,
            in_use,
            confidence: None,
            owner,
        });
    }

    fn orphan(&self, name: &str, path: &Path) -> bool {
        is_bundle_id(name)
            && (self.env.installed)(name) == Some(false)
            && orphan_ok(name, newest_mtime(path, self.env.cancel), self.env.now_ms, |_| Some(false))
    }
}

// A browser's cache folder and the bundle id that uses it.
const BROWSER_APPS: &[(&str, &str)] = &[
    ("com.apple.Safari", "com.apple.Safari"),
    ("Google", "com.google.Chrome"),
    ("Firefox", "org.mozilla.firefox"),
    ("Mozilla", "org.mozilla.firefox"),
    ("Microsoft Edge", "com.microsoft.edgemac"),
    ("BraveSoftware", "com.brave.Browser"),
    ("company.thebrowser.Browser", "company.thebrowser.Browser"),
    ("com.operasoftware.Opera", "com.operasoftware.Opera"),
    ("com.vivaldi.Vivaldi", "com.vivaldi.Vivaldi"),
];

// A developer cache folder and the tool whose running makes it busy.
const DEV_TOOLS: &[(&str, &str)] = &[
    ("Homebrew", "brew"),
    ("pip", "pip"),
    ("Yarn", "yarn"),
    ("go-build", "go"),
    ("com.apple.dt.Xcode", "Xcode"),
    ("node-gyp", "node"),
    ("ms-playwright", "node"),
    ("DerivedData", "xcodebuild"),
    ("_cacache", "npm"),
    ("cache", "cargo"),
];

fn tool_for(name: &str) -> &'static str {
    DEV_TOOLS.iter().find(|(n, _)| *n == name).map_or("", |(_, t)| t)
}

fn scan_caches(m: &mut Maker) {
    let env = m.env;
    let lib = env.roots.home.join("Library");
    for path in children(&lib.join("Caches")) {
        let name = name_of(&path);
        let cat = classify_cache(&name);
        match cat {
            Category::BrowserCache => {
                let app = BROWSER_APPS.iter().find(|(n, _)| *n == name).map_or(name.as_str(), |(_, a)| a).to_string();
                let busy = (env.running)(&app);
                m.add(path, cat, name, None, Some(app), busy);
            }
            Category::DevCache => {
                let tool = tool_for(&name);
                let busy = (env.busy_tool)(tool);
                m.add(path, cat, name, None, Some(tool.to_string()), busy);
            }
            _ => {
                let busy = (env.running)(&name);
                let cat = if !busy && m.orphan(&name, &path) { Category::Orphan } else { Category::AppCache };
                m.add(path, cat, name.clone(), None, Some(name), busy);
            }
        }
    }
    if env.fda {
        for container in children(&lib.join("Containers")) {
            let owner = name_of(&container);
            let busy = (env.running)(&owner);
            for path in children(&container.join("Data/Library/Caches")) {
                let label = format!("{owner} · {}", name_of(&path));
                m.add(path, Category::AppCache, label, None, Some(owner.clone()), busy);
            }
        }
    }
}

fn scan_dev(m: &mut Maker) {
    let env = m.env;
    let h = &env.roots.home;
    let xcode_busy = (env.busy_tool)("xcodebuild") || (env.busy_tool)("Xcode");
    for path in children(&h.join("Library/Developer/Xcode/DerivedData")) {
        let name = name_of(&path);
        m.add(path, Category::DevCache, name, Some("Xcode".into()), Some("xcodebuild".into()), xcode_busy);
    }
    let sim_busy = (env.busy_tool)("Simulator");
    for path in children(&h.join("Library/Developer/CoreSimulator/Caches")) {
        let name = name_of(&path);
        m.add(path, Category::DevCache, name, Some("Simulator".into()), Some("Simulator".into()), sim_busy);
    }
    for (rel, tool, label) in [(".npm/_cacache", "npm", "npm"), (".cargo/registry/cache", "cargo", "Cargo")] {
        let path = h.join(rel);
        if path.is_dir() {
            let busy = (env.busy_tool)(tool);
            m.add(path, Category::DevCache, label.into(), None, Some(tool.into()), busy);
        }
    }
}

fn scan_logs(m: &mut Maker) {
    let env = m.env;
    let lib = env.roots.home.join("Library");
    for path in children(&lib.join("Logs")) {
        let name = name_of(&path);
        let busy = (env.running)(&name);
        let cat = if !busy && m.orphan(&name, &path) { Category::Orphan } else { Category::Log };
        m.add(path, cat, name.clone(), None, Some(name), busy);
    }
    for path in children(&lib.join("Saved Application State")) {
        let name = name_of(&path);
        let Some(bid) = name.strip_suffix(".savedState") else { continue };
        if !(env.running)(bid) && m.orphan(bid, &path) {
            m.add(path, Category::Orphan, bid.to_string(), None, Some(bid.to_string()), false);
        }
    }
}

pub const BUILD_DEPTH: usize = 6;
const BUILD_SKIP: &[&str] = &["Library", "Desktop", "Documents", "Downloads", "Pictures", "Movies", "Music", "Public", "Applications"];

fn scan_builds(m: &mut Maker) {
    let env = m.env;
    let home = env.roots.home.clone();
    let mut stack = vec![(home.clone(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if cancelled(env.cancel) {
            return;
        }
        for path in children(&dir) {
            let name = name_of(&path);
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            if !meta.is_dir() || name.starts_with('.') || (dir == home && BUILD_SKIP.contains(&name.as_str())) {
                continue;
            }
            let manifest = match name.as_str() {
                "node_modules" => Some("package.json"),
                "target" => Some("Cargo.toml"),
                _ => None,
            };
            if let Some(manifest) = manifest {
                if dir.join(manifest).is_file() {
                    let project = name_of(&dir);
                    let detail = dir.strip_prefix(&home).ok().map(|r| format!("~/{}", r.display()));
                    m.add(path, Category::Build, project, detail, None, false);
                    continue;
                }
            }
            if depth + 1 < BUILD_DEPTH {
                stack.push((path, depth + 1));
            }
        }
    }
}

fn scan_fda_only(m: &mut Maker) {
    let env = m.env;
    if !env.fda {
        return;
    }
    let h = &env.roots.home;
    let trash = h.join(".Trash");
    if !children(&trash).is_empty() {
        m.add(trash, Category::Trash, "Trash".into(), None, None, false);
    }
    for path in children(&h.join("Downloads")) {
        let name = name_of(&path);
        let lower = name.to_lowercase();
        if path.is_file() && [".dmg", ".pkg", ".xip"].iter().any(|e| lower.ends_with(e)) {
            let busy = (env.mounted)(&path);
            m.add(path, Category::Installer, name, None, None, busy);
        }
    }
    for path in children(&h.join("Library/Application Support/MobileSync/Backup")) {
        if !path.is_dir() {
            continue;
        }
        let info = plist::Value::from_file(path.join("Info.plist")).ok();
        let dict = info.as_ref().and_then(|v| v.as_dictionary());
        let label = dict.and_then(|d| d.get("Device Name")).and_then(|v| v.as_string()).map_or_else(|| name_of(&path), str::to_string);
        let detail = dict
            .and_then(|d| d.get("Last Backup Date"))
            .and_then(|v| v.as_date())
            .map(|d| chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::from(d)).format("%Y-%m-%d").to_string());
        m.add(path, Category::Backup, label, detail, None, false);
    }
}

/// "Bisa dibersihkan" (§4): what Bersihkan frees with the ticks as they open.
/// Skips the slower build-folder walk, which only adds unticked items.
pub fn quick_cleanable(env: &Env) -> u64 {
    let mut id = 0;
    let mut m = Maker { env, next_id: &mut id, items: Vec::new() };
    scan_caches(&mut m);
    scan_dev(&mut m);
    scan_logs(&mut m);
    m.items.iter().filter(|i| i.ticked).map(|i| i.bytes).sum()
}

pub fn deep_scan(env: &Env, next_id: &mut u64) -> Vec<Item> {
    let mut m = Maker { env, next_id, items: Vec::new() };
    scan_caches(&mut m);
    scan_dev(&mut m);
    scan_logs(&mut m);
    scan_fda_only(&mut m);
    scan_builds(&mut m);
    m.items
}

fn sum(paths: &[&str], env: &Env) -> Option<u64> {
    let h = &env.roots.home;
    if paths.iter().any(|p| !may_open(&h.join(p), env.roots, env.fda)) {
        return None;
    }
    Some(paths.iter().map(|p| du(&h.join(p), env.cancel)).sum())
}

pub fn parts(env: &Env) -> Parts {
    let (documents, photos) = personal_parts(env);
    Parts { apps: Some(env.roots.apps.iter().map(|a| du(a, env.cancel)).sum()), documents, photos }
}

/// Dokumen and Foto alone, for when the apps are sized elsewhere.
pub fn personal_parts(env: &Env) -> (Option<u64>, Option<u64>) {
    (sum(&["Desktop", "Documents", "Downloads"], env), sum(&["Pictures"], env))
}

fn node(path: &Path, name: String, env: &Env, min: u64, dev: u64) -> Node {
    let unreadable = || Node { name: name.clone(), bytes: 0, dir: true, readable: false, rest: 0, children: Vec::new() };
    if !may_open(path, env.roots, env.fda) {
        return unreadable();
    }
    let Ok(meta) = fs::symlink_metadata(path) else { return unreadable() };
    if !meta.is_dir() || meta.dev() != dev {
        let bytes = if meta.dev() == dev { meta.blocks() * 512 } else { 0 };
        return Node { name, bytes, dir: false, readable: true, rest: 0, children: Vec::new() };
    }
    let Ok(entries) = fs::read_dir(path) else { return unreadable() };
    let mut kids: Vec<Node> = Vec::new();
    for e in entries.flatten() {
        if cancelled(env.cancel) {
            break;
        }
        kids.push(node(&e.path(), e.file_name().to_string_lossy().into_owned(), env, min, dev));
    }
    let bytes = meta.blocks() * 512 + kids.iter().map(|k| k.bytes).sum::<u64>();
    Node { name, bytes, dir: true, readable: true, rest: 0, children: prune(kids, min) }
}

// Keeps the big ones (and unreadable folders, so they can say so), biggest
// first; the rest become one summed node at the end.
fn prune(kids: Vec<Node>, min: u64) -> Vec<Node> {
    let (mut keep, small): (Vec<Node>, Vec<Node>) = kids.into_iter().partition(|k| k.bytes >= min || !k.readable);
    keep.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    if !small.is_empty() {
        let bytes = small.iter().map(|k| k.bytes).sum();
        keep.push(Node { name: String::new(), bytes, dir: false, readable: true, rest: small.len() as u32, children: Vec::new() });
    }
    keep
}

fn breakdown_with(env: &Env, min: u64) -> Node {
    let home = &env.roots.home;
    let dev = fs::symlink_metadata(home).map(|m| m.dev()).unwrap_or(0);
    let mut root = node(home, "~".into(), env, min, dev);
    let mut apps = Node { name: "App".into(), bytes: 0, dir: true, readable: true, rest: 0, children: Vec::new() };
    let mut app_kids = Vec::new();
    for a in &env.roots.apps {
        let d = fs::symlink_metadata(a).map(|m| m.dev()).unwrap_or(dev);
        let n = node(a, name_of(a), env, min, d);
        app_kids.extend(n.children.into_iter().filter(|k| k.rest == 0));
        apps.bytes += n.bytes;
    }
    apps.children = prune(app_kids, min);
    // Home's own Applications folder is already inside "App".
    root.children.retain(|k| k.name != "Applications");
    let mut kids = std::mem::take(&mut root.children);
    kids.push(apps);
    let rest: Vec<Node> = kids.iter().filter(|k| k.rest > 0).cloned().collect();
    kids.retain(|k| k.rest == 0);
    kids.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    kids.extend(rest);
    root.children = kids;
    root
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{Duration, SystemTime};

    const DAY: i64 = 86_400_000;

    struct T {
        _d: tempfile::TempDir,
        roots: Roots,
    }

    fn sample() -> T {
        let d = tempfile::tempdir().unwrap();
        let roots = Roots::test(d.path());
        fs::create_dir_all(&roots.home).unwrap();
        fs::create_dir_all(&roots.apps[0]).unwrap();
        T { _d: d, roots }
    }

    fn file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![7u8; bytes]).unwrap();
    }

    fn age(path: &Path, days: i64) {
        let t = SystemTime::now() - Duration::from_millis((days * DAY) as u64);
        // A folder's date counts too, so it is aged with the file.
        for p in [path, path.parent().unwrap()] {
            fs::File::open(p).unwrap().set_modified(t).unwrap();
        }
    }

    fn now() -> i64 {
        SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_millis() as i64
    }

    struct Fake {
        running: Vec<&'static str>,
        installed: Vec<&'static str>,
        busy: Vec<&'static str>,
    }

    fn env<'a>(t: &'a T, fda: bool, f: &'a Fake, ex: &'a Exclusions, cancel: &'a AtomicBool,
               running: &'a dyn Fn(&str) -> bool, installed: &'a dyn Fn(&str) -> Option<bool>, busy: &'a dyn Fn(&str) -> bool) -> Env<'a> {
        let _ = f;
        Env { roots: &t.roots, fda, running, installed, mounted: &|_| false, busy_tool: busy, excluded: ex, now_ms: now(), cancel }
    }

    fn build(t: &T) {
        let h = &t.roots.home;
        file(&h.join("Library/Caches/com.contoh.editor/a.bin"), 50_000);
        file(&h.join("Library/Caches/Google/Chrome/Default/Cache/x"), 40_000);
        file(&h.join("Library/Caches/Homebrew/x.tar"), 30_000);
        file(&h.join("Library/Logs/com.contoh.editor/a.log"), 10_000);
        file(&h.join("Library/Developer/Xcode/DerivedData/Proj-abc/x"), 20_000);
        file(&h.join(".npm/_cacache/x"), 20_000);
        file(&h.join(".Trash/old.txt"), 5_000);
        file(&h.join("dev/proyek/package.json"), 10);
        file(&h.join("dev/proyek/node_modules/x/index.js"), 8_000);
        file(&h.join("Downloads/Installer.dmg"), 9_000);
        file(&h.join("Library/Application Support/MobileSync/Backup/0000-COBA/Info.plist"), 0);
        let mut d = plist::Dictionary::new();
        d.insert("Device Name".into(), plist::Value::String("iPhone Coba".into()));
        plist::Value::Dictionary(d).to_file_xml(h.join("Library/Application Support/MobileSync/Backup/0000-COBA/Info.plist")).unwrap();
        file(&h.join("Library/Containers/com.contoh.box/Data/Library/Caches/c/x"), 7_000);
    }

    fn cats(items: &[Item]) -> Vec<Category> {
        let mut c: Vec<Category> = items.iter().map(|i| i.category).collect();
        c.dedup();
        c
    }

    fn std_fake() -> Fake {
        Fake { running: vec![], installed: vec![], busy: vec![] }
    }

    #[test]
    fn deep_scan_finds_each_category() {
        let t = sample();
        build(&t);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let mut id = 1;
        let items = deep_scan(&e, &mut id);
        let all = cats(&items);
        for want in [Category::AppCache, Category::BrowserCache, Category::DevCache, Category::Log, Category::Trash,
                     Category::Build, Category::Installer, Category::Backup] {
            assert!(all.contains(&want), "missing {want:?} in {all:?}");
        }
        let backup = items.iter().find(|i| i.category == Category::Backup).unwrap();
        assert_eq!(backup.label, "iPhone Coba");
        let build = items.iter().find(|i| i.category == Category::Build).unwrap();
        assert_eq!(build.label, "proyek");
        assert!(!build.ticked);
        assert!(items.iter().any(|i| i.path.ends_with("Containers/com.contoh.box/Data/Library/Caches/c")));
        // Ids are unique.
        let mut ids: Vec<u64> = items.iter().map(|i| i.id).collect();
        ids.dedup();
        assert_eq!(ids.len(), items.len());
    }

    #[test]
    fn no_fda_never_opens_protected_roots() {
        let t = sample();
        build(&t);
        let h = &t.roots.home;
        for p in ["Desktop", "Documents/x", "Downloads", "Pictures", "Movies", "Music", "Library/Containers/x",
                  "Library/Group Containers", ".Trash", "Library/Application Support/MobileSync/Backup"] {
            assert!(!may_open(&h.join(p), &t.roots, false), "{p}");
            assert!(may_open(&h.join(p), &t.roots, true), "{p}");
        }
        assert!(may_open(&h.join("Library/Caches"), &t.roots, false));
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, false, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let items = deep_scan(&e, &mut 1);
        for no in [Category::Trash, Category::Installer, Category::Backup] {
            assert!(!cats(&items).contains(&no), "{no:?}");
        }
        assert!(!items.iter().any(|i| i.path.starts_with(h.join("Library/Containers"))));
        let p = parts(&e);
        assert_eq!((p.documents, p.photos), (None, None));
        assert!(p.apps.is_some());
    }

    #[test]
    fn cloud_folders_are_never_opened() {
        let t = sample();
        for p in ["Library/Mobile Documents", "Library/Mobile Documents/x", "Library/CloudStorage/GoogleDrive"] {
            assert!(!may_open(&t.roots.home.join(p), &t.roots, true), "{p}");
        }
    }

    #[test]
    fn an_item_reached_through_a_linked_folder_is_not_offered() {
        let t = sample();
        let h = &t.roots.home;
        let outside = t.roots.home.parent().unwrap().join("outside");
        file(&outside.join("Proj-abc/x"), 100);
        fs::create_dir_all(h.join("Library/Developer/Xcode")).unwrap();
        std::os::unix::fs::symlink(&outside, h.join("Library/Developer/Xcode/DerivedData")).unwrap();
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        assert!(!deep_scan(&e, &mut 1).iter().any(|i| i.path.ends_with("Proj-abc")));
        assert!(!real_dirs(&h.join("Library/Developer/Xcode/DerivedData/Proj-abc"), &t.roots));
        assert!(real_dirs(&h.join("Library/Developer/Xcode"), &t.roots));
    }

    #[test]
    fn orphan_needs_30_days_and_absence() {
        let t = sample();
        let h = &t.roots.home;
        file(&h.join("Library/Caches/com.gone.app/x"), 1000);
        age(&h.join("Library/Caches/com.gone.app/x"), 31);
        file(&h.join("Library/Caches/com.fresh.app/x"), 1000);
        age(&h.join("Library/Caches/com.fresh.app/x"), 2);
        file(&h.join("Library/Saved Application State/com.gone.app.savedState/data.data"), 100);
        age(&h.join("Library/Saved Application State/com.gone.app.savedState/data.data"), 40);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(false), &|_| false);
        let items = deep_scan(&e, &mut 1);
        let cat_of = |name: &str| items.iter().find(|i| i.path.file_name().unwrap() == name).map(|i| i.category);
        assert_eq!(cat_of("com.gone.app"), Some(Category::Orphan));
        assert_eq!(cat_of("com.fresh.app"), Some(Category::AppCache));
        assert_eq!(cat_of("com.gone.app.savedState"), Some(Category::Orphan));
        // Unknown is not absent.
        let e2 = env(&t, true, &f, &ex, &c, &|_| false, &|_| None, &|_| false);
        let items2 = deep_scan(&e2, &mut 1);
        assert!(!items2.iter().any(|i| i.category == Category::Orphan));
        let orphan = items.iter().find(|i| i.category == Category::Orphan).unwrap();
        assert!(!orphan.ticked);
        assert_eq!(orphan.method, Method::Trash);
    }

    #[test]
    fn in_use_is_unticked() {
        let t = sample();
        build(&t);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|n| n == "com.contoh.editor" || n == "com.google.Chrome", &|_| Some(true), &|n| n == "npm");
        let items = deep_scan(&e, &mut 1);
        for name in ["com.contoh.editor", "Google", "_cacache"] {
            let i = items.iter().find(|i| i.path.file_name().unwrap() == name).unwrap();
            assert!(i.in_use && !i.ticked, "{name}");
        }
        let brew = items.iter().find(|i| i.path.file_name().unwrap() == "Homebrew").unwrap();
        assert!(brew.ticked && !brew.in_use);
    }

    #[test]
    fn excluded_items_vanish() {
        let t = sample();
        build(&t);
        let ex = Exclusions { paths: vec![t.roots.home.join("Library/Caches/Homebrew")] };
        let (f, c) = (std_fake(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        assert!(!deep_scan(&e, &mut 1).iter().any(|i| i.path.ends_with("Homebrew")));
    }

    #[test]
    fn build_folders_need_their_manifest_and_skip_documents() {
        let t = sample();
        let h = &t.roots.home;
        file(&h.join("dev/a/package.json"), 1);
        file(&h.join("dev/a/node_modules/x.js"), 100);
        file(&h.join("dev/b/node_modules/x.js"), 100);
        file(&h.join("dev/r/Cargo.toml"), 1);
        file(&h.join("dev/r/target/debug/x"), 100);
        file(&h.join("Documents/p/package.json"), 1);
        file(&h.join("Documents/p/node_modules/x.js"), 100);
        file(&h.join(".hidden/p/package.json"), 1);
        file(&h.join(".hidden/p/node_modules/x.js"), 100);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let mut found: Vec<PathBuf> = deep_scan(&e, &mut 1).into_iter().filter(|i| i.category == Category::Build).map(|i| i.path).collect();
        found.sort();
        assert_eq!(found, vec![h.join("dev/a/node_modules"), h.join("dev/r/target")]);
    }

    #[test]
    fn installers_only_top_level_downloads() {
        let t = sample();
        let h = &t.roots.home;
        file(&h.join("Downloads/a.dmg"), 10);
        file(&h.join("Downloads/b.PKG"), 10);
        file(&h.join("Downloads/sub/c.dmg"), 10);
        file(&h.join("Downloads/notes.txt"), 10);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let mounted = |p: &Path| p.ends_with("a.dmg");
        let mut e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        e.mounted = &mounted;
        let items: Vec<Item> = deep_scan(&e, &mut 1).into_iter().filter(|i| i.category == Category::Installer).collect();
        let mut names: Vec<String> = items.iter().map(|i| i.label.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["a.dmg", "b.PKG"]);
        assert!(items.iter().find(|i| i.label == "a.dmg").unwrap().in_use);
    }

    #[test]
    fn du_does_not_follow_links() {
        let t = sample();
        let h = &t.roots.home;
        file(&h.join("big.bin"), 10_000_000);
        fs::create_dir_all(h.join("c")).unwrap();
        std::os::unix::fs::symlink(h.join("big.bin"), h.join("c/link")).unwrap();
        let c = AtomicBool::new(false);
        assert!(du(&h.join("c"), &c) < 100_000);
        assert!(du(&h.join("big.bin"), &c) >= 10_000_000);
    }

    #[test]
    fn quick_cleanable_sums_ticked_only() {
        let t = sample();
        build(&t);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let want: u64 = deep_scan(&e, &mut 1).iter().filter(|i| i.ticked).map(|i| i.bytes).sum();
        assert_eq!(quick_cleanable(&e), want);
        assert!(want > 0);
    }

    #[test]
    fn breakdown_keeps_big_nodes_and_sums_the_rest() {
        let t = sample();
        let h = &t.roots.home;
        file(&h.join("dev/big/a.bin"), 300_000);
        for i in 0..5 {
            file(&h.join(format!("dev/small{i}.txt")), 100);
        }
        file(&t.roots.apps[0].join("Big.app/Contents/x"), 200_000);
        let (f, ex, c) = (std_fake(), Exclusions::default(), AtomicBool::new(false));
        let e = env(&t, true, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let root = breakdown_with(&e, 100_000);
        let dev = root.children.iter().find(|n| n.name == "dev").unwrap();
        assert_eq!(dev.children[0].name, "big");
        let rest = dev.children.iter().find(|n| n.rest > 0).unwrap();
        assert_eq!(rest.rest, 5);
        assert!(root.children.iter().any(|n| n.name == "App" && n.bytes >= 200_000));
        // Biggest first.
        assert!(root.children.windows(2).all(|w| w[0].bytes >= w[1].bytes || w[1].rest > 0));
        // Without FDA, Documents shows but is not readable.
        file(&h.join("Documents/x.txt"), 200_000);
        let e2 = env(&t, false, &f, &ex, &c, &|_| false, &|_| Some(true), &|_| false);
        let r2 = breakdown_with(&e2, 100_000);
        let docs = r2.children.iter().find(|n| n.name == "Documents").unwrap();
        assert!(!docs.readable);
    }
}

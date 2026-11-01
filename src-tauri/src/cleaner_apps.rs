// Clean uninstall (design 1 Nov §5.2, §7): the apps that can go, which ones
// must use their own uninstaller, and the files each one leaves in ~/Library,
// sorted into sure, maybe and personal.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use serde::Serialize;

use crate::cleaner_rules::{check, leftover_match, method, owned_by_longer, Category, Confidence, Exclusions, Purpose, Roots, Skip};
use crate::cleaner_scan::{du, ident, Item};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub id: u64,
    pub name: String,
    pub bundle_id: String,
    #[serde(skip)]
    pub path: PathBuf,
    pub bytes: u64,
    pub refused: bool,
    pub running: bool,
    /// `CFBundleName`, also matched against folder names ("Code" for VS Code).
    #[serde(skip)]
    pub short_name: String,
}

pub const REFUSED_PREFIXES: &[&str] = &[
    "com.crowdstrike", "com.paloaltonetworks", "com.cisco", "com.jamf", "com.kandji", "com.microsoft.wdav", "com.sentinelone",
    "com.sophos", "com.eset", "com.malwarebytes", "com.mosyle", "com.addigy", "com.zscaler", "com.netskope",
];

/// `(bundle id, CFBundleName)` from the app's Info.plist (binary or XML).
pub fn read_info(app: &Path) -> Option<(String, String)> {
    let v = plist::Value::from_file(app.join("Contents/Info.plist")).ok()?;
    let d = v.as_dictionary()?;
    let bid = d.get("CFBundleIdentifier")?.as_string()?.to_string();
    let name = d.get("CFBundleName").and_then(|n| n.as_string()).map(str::to_string).unwrap_or_else(|| stem(app));
    Some((bid, name))
}

fn stem(app: &Path) -> String {
    app.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
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

fn is_app(p: &Path) -> bool {
    p.extension().is_some_and(|e| e == "app") && fs::symlink_metadata(p).is_ok_and(|m| m.is_dir())
}

/// Every app in the app folders and one folder level down (Utilities and the
/// like), biggest first. macOS's own apps live in /System/Applications, which is
/// never a root.
pub fn list_apps(roots: &Roots, cancel: &AtomicBool, next_id: &mut u64) -> Vec<AppInfo> {
    listed(app_paths(roots), cancel, next_id)
}

fn app_paths(roots: &Roots) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for root in &roots.apps {
        for p in children(root) {
            if is_app(&p) {
                paths.push(p);
            } else if fs::symlink_metadata(&p).is_ok_and(|m| m.is_dir()) {
                paths.extend(children(&p).into_iter().filter(|c| is_app(c)));
            }
        }
    }
    paths
}

/// The apps' bundle ids alone: cheap, for "is it installed".
pub fn bundle_ids(roots: &Roots) -> Vec<String> {
    app_paths(roots).iter().filter_map(|p| read_info(p).map(|(bid, _)| bid)).collect()
}

fn listed(paths: Vec<PathBuf>, cancel: &AtomicBool, next_id: &mut u64) -> Vec<AppInfo> {
    let mut apps: Vec<AppInfo> = paths
        .into_iter()
        .filter_map(|path| {
            let (bundle_id, short_name) = read_info(&path)?;
            let id = *next_id;
            *next_id += 1;
            Some(AppInfo {
                id,
                name: stem(&path),
                refused: official_uninstaller(&path, &bundle_id),
                bytes: du(&path, cancel),
                bundle_id,
                path,
                running: false,
                short_name,
            })
        })
        .collect();
    apps.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    apps
}

/// Security, device-management and VPN apps that install system parts come with
/// their own uninstaller (§5.2). In doubt, they do.
pub fn official_uninstaller(app: &Path, bundle_id: &str) -> bool {
    if read_info(app).is_none() || REFUSED_PREFIXES.iter().any(|p| bundle_id.starts_with(p)) {
        return true;
    }
    if !children(&app.join("Contents/Library/SystemExtensions")).is_empty() {
        return true;
    }
    children(&app.join("Contents/PlugIns")).iter().any(|ext| {
        plist::Value::from_file(ext.join("Contents/Info.plist")).ok().is_some_and(|v| {
            v.as_dictionary()
                .and_then(|d| d.get("NSExtension"))
                .and_then(|e| e.as_dictionary())
                .and_then(|e| e.get("NSExtensionPointIdentifier"))
                .and_then(|p| p.as_string())
                .is_some_and(|p| p.starts_with("com.apple.networkextension"))
        })
    })
}

/// `TeamIdentifier=` from `codesign -dv` output (it writes to stderr).
pub fn parse_team(codesign_output: &str) -> Option<String> {
    let team = codesign_output.lines().find_map(|l| l.strip_prefix("TeamIdentifier="))?.trim();
    (!team.is_empty() && team != "not set").then(|| team.to_string())
}

/// The app itself: always ticked, always to the Trash (§5.2).
pub fn app_item(app: &AppInfo, next_id: &mut u64) -> Item {
    let id = *next_id;
    *next_id += 1;
    Item {
        id,
        category: Category::App,
        label: app.name.clone(),
        detail: None,
        ident: ident(&app.path),
        path: app.path.clone(),
        bytes: app.bytes,
        method: method(Category::App),
        ticked: true,
        in_use: app.running,
        confidence: Some("sure"),
        owner: Some(app.bundle_id.clone()),
    }
}

pub struct Leftovers<'a> {
    pub roots: &'a Roots,
    pub fda: bool,
    pub other_copy: bool,
    pub team: Option<&'a str>,
    pub team_shared: &'a dyn Fn(&str) -> bool,
    pub others: &'a [String],
    pub excluded: &'a Exclusions,
}

// Folders of ~/Library where an app leaves files, matched by name. Containers
// and Group Containers need Full Disk Access (§4).
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
    "Application Scripts",
];
const FDA_PLACES: &[&str] = &["Containers", "Group Containers"];
// Where an app may keep its folder under its vendor's: `Google/Chrome`.
const VENDOR_PLACES: &[&str] = &["Application Support", "Caches"];

/// Sure leftovers are ticked; maybe ones are not; a sure one the rules protect
/// becomes personal data, unticked; a protected maybe is dropped (§5.2).
pub fn leftovers(app: &AppInfo, ctx: &Leftovers, next_id: &mut u64) -> Vec<Item> {
    if ctx.other_copy {
        return Vec::new();
    }
    let lib = ctx.roots.home.join("Library");
    let bid = app.bundle_id.as_str();
    let names: Vec<&str> = if app.short_name == app.name { vec![&app.name] } else { vec![&app.name, &app.short_name] };
    let mut found: Vec<(PathBuf, Confidence, String)> = Vec::new();
    let mut places: Vec<&str> = PLACES.to_vec();
    if ctx.fda {
        places.extend(FDA_PLACES);
    }
    for place in places {
        let dir = lib.join(place);
        let detail = place.split('/').next().unwrap_or(place).to_string();
        for path in children(&dir) {
            let entry = name_of(&path);
            let mut hit = names.iter().filter_map(|n| leftover_match(&entry, bid, n, None)).min_by_key(|c| *c != Confidence::Sure);
            if place == "Group Containers" {
                if let Some(team) = ctx.team {
                    if entry.starts_with(&format!("{team}.")) {
                        hit = if (ctx.team_shared)(team) { None } else { Some(Confidence::Sure) };
                    }
                }
            }
            if hit.is_some() && owned_by_longer(&entry, bid, ctx.others) {
                hit = None;
            }
            if let Some(c) = hit {
                found.push((path, c, detail.clone()));
                continue;
            }
            if VENDOR_PLACES.contains(&place) && fs::symlink_metadata(&path).is_ok_and(|m| m.is_dir()) {
                for inner in children(&path) {
                    let name = name_of(&inner);
                    let sure = names.iter().any(|n| leftover_match("", bid, n, Some((&entry, &name))) == Some(Confidence::Sure));
                    if sure {
                        found.push((inner, Confidence::Sure, detail.clone()));
                    }
                }
            }
        }
    }
    for path in children(&lib.join("LaunchAgents")) {
        if launch_agent_of(&path, bid, &app.path) {
            found.push((path, Confidence::Sure, "LaunchAgents".into()));
        }
    }
    let uninstall = Purpose::Uninstall { bundle_id: bid, app: &app.path };
    let mut items = Vec::new();
    for (path, confidence, detail) in found {
        let category = match check(&path, Category::Leftover, &uninstall, ctx.roots, ctx.excluded) {
            Ok(()) => Category::Leftover,
            Err(Skip::Protected)
                if confidence == Confidence::Sure
                    && check(&path, Category::Personal, &uninstall, ctx.roots, ctx.excluded).is_ok() =>
            {
                Category::Personal
            }
            Err(_) => continue,
        };
        let id = *next_id;
        *next_id += 1;
        let sure = confidence == Confidence::Sure;
        items.push(Item {
            id,
            category,
            label: name_of(&path),
            detail: Some(detail),
            ident: ident(&path),
            bytes: du(&path, &AtomicBool::new(false)),
            path,
            method: method(category),
            ticked: sure && category == Category::Leftover,
            in_use: false,
            confidence: Some(if sure { "sure" } else { "maybe" }),
            owner: None,
        });
    }
    items
}

// A LaunchAgent is the app's when its label starts with the bundle id or its
// program lives inside the app; never by a name guess.
fn launch_agent_of(plist_path: &Path, bid: &str, app: &Path) -> bool {
    let Ok(v) = plist::Value::from_file(plist_path) else { return false };
    let Some(d) = v.as_dictionary() else { return false };
    let label = d.get("Label").and_then(|l| l.as_string()).unwrap_or("");
    if label == bid || label.starts_with(&format!("{bid}.")) {
        return true;
    }
    let program = d
        .get("Program")
        .and_then(|p| p.as_string())
        .or_else(|| d.get("ProgramArguments").and_then(|a| a.as_array()).and_then(|a| a.first()).and_then(|p| p.as_string()));
    program.is_some_and(|p| Path::new(p).starts_with(app))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cleaner_rules::Category;
    use std::fs;

    struct T {
        _d: tempfile::TempDir,
        roots: Roots,
    }

    fn sample() -> T {
        let d = tempfile::tempdir().unwrap();
        let roots = Roots::test(d.path());
        fs::create_dir_all(roots.home.join("Library")).unwrap();
        fs::create_dir_all(&roots.apps[0]).unwrap();
        T { _d: d, roots }
    }

    fn file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; bytes]).unwrap();
    }

    fn bundle(dir: &Path, name: &str, bid: &str, bytes: usize) -> PathBuf {
        let app = dir.join(format!("{name}.app"));
        let mut d = plist::Dictionary::new();
        d.insert("CFBundleIdentifier".into(), plist::Value::String(bid.into()));
        d.insert("CFBundleName".into(), plist::Value::String(name.into()));
        fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        plist::Value::Dictionary(d).to_file_binary(app.join("Contents/Info.plist")).unwrap();
        file(&app.join("Contents/MacOS/bin"), bytes);
        app
    }

    fn info(t: &T, name: &str, bid: &str) -> AppInfo {
        let path = bundle(&t.roots.apps[0], name, bid, 10);
        AppInfo { id: 1, name: name.into(), bundle_id: bid.into(), path, bytes: 0, refused: false, running: false, short_name: name.into() }
    }

    fn ctx<'a>(t: &'a T, ex: &'a Exclusions, others: &'a [String], team: Option<&'a str>, shared: &'a dyn Fn(&str) -> bool, other_copy: bool) -> Leftovers<'a> {
        Leftovers { roots: &t.roots, fda: true, other_copy, team, team_shared: shared, others, excluded: ex }
    }

    fn names(items: &[Item]) -> Vec<String> {
        let mut n: Vec<String> = items.iter().map(|i| i.path.file_name().unwrap().to_string_lossy().into_owned()).collect();
        n.sort();
        n
    }

    #[test]
    fn lists_apps_by_size_and_skips_system() {
        let t = sample();
        bundle(&t.roots.apps[0], "Small", "com.a.small", 10);
        bundle(&t.roots.apps[0], "Big", "com.a.big", 100_000);
        bundle(&t.roots.apps[0].join("Utilities"), "Deep", "com.a.deep", 50_000);
        let apps = list_apps(&t.roots, &AtomicBool::new(false), &mut 1);
        let order: Vec<&str> = apps.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(order, ["Big", "Deep", "Small"]);
        assert_eq!(apps[0].bundle_id, "com.a.big");
        assert!(!Roots::real("/Users/a".into()).apps.iter().any(|a| a.starts_with("/System")));
    }

    #[test]
    fn leftovers_sure_and_maybe() {
        let t = sample();
        let app = info(&t, "Spotify", "com.spotify.client");
        let lib = t.roots.home.join("Library");
        file(&lib.join("Preferences/com.spotify.client.plist"), 10);
        file(&lib.join("Preferences/ByHost/com.spotify.client.ABC.plist"), 10);
        file(&lib.join("Application Support/Spotify/x"), 10);
        file(&lib.join("Caches/com.spotify.client/x"), 10);
        file(&lib.join("Saved Application State/com.spotify.client.savedState/x"), 10);
        file(&lib.join("Containers/com.spotify.client/x"), 10);
        file(&lib.join("Application Support/Other/x"), 10);
        let ex = Exclusions::default();
        let items = leftovers(&app, &ctx(&t, &ex, &[], None, &|_| false, false), &mut 1);
        let sure: Vec<&Item> = items.iter().filter(|i| i.confidence == Some("sure")).collect();
        assert!(sure.iter().all(|i| i.ticked && i.category == Category::Leftover));
        assert_eq!(sure.len(), 5);
        let maybe = items.iter().find(|i| i.confidence == Some("maybe")).unwrap();
        assert!(maybe.path.ends_with("Application Support/Spotify"));
        assert!(!maybe.ticked);
        assert!(!items.iter().any(|i| i.path.ends_with("Other")));
    }

    #[test]
    fn second_copy_offers_no_leftovers() {
        let t = sample();
        let app = info(&t, "Spotify", "com.spotify.client");
        file(&t.roots.home.join("Library/Preferences/com.spotify.client.plist"), 10);
        let ex = Exclusions::default();
        assert!(leftovers(&app, &ctx(&t, &ex, &[], None, &|_| false, true), &mut 1).is_empty());
    }

    #[test]
    fn team_group_container_shared_is_not_offered() {
        let t = sample();
        let app = info(&t, "Word", "com.microsoft.Word");
        let lib = t.roots.home.join("Library");
        file(&lib.join("Group Containers/UBF8T346G9.Office/x"), 10);
        file(&lib.join("Group Containers/UBF8T346G9.ms/x"), 10);
        file(&lib.join("Group Containers/group.com.microsoft.Word/x"), 10);
        let ex = Exclusions::default();
        let shared = |team: &str| team == "UBF8T346G9";
        let items = leftovers(&app, &ctx(&t, &ex, &[], Some("UBF8T346G9"), &shared, false), &mut 1);
        assert_eq!(names(&items), ["group.com.microsoft.Word"]);
        let alone = leftovers(&app, &ctx(&t, &ex, &[], Some("UBF8T346G9"), &|_| false, false), &mut 1);
        assert_eq!(names(&alone), ["UBF8T346G9.Office", "UBF8T346G9.ms", "group.com.microsoft.Word"]);
    }

    #[test]
    fn longer_bundle_ids_keep_their_files() {
        let t = sample();
        let app = info(&t, "Chrome", "com.google.Chrome");
        let lib = t.roots.home.join("Library");
        file(&lib.join("Preferences/com.google.Chrome.plist"), 10);
        file(&lib.join("Preferences/com.google.Chrome.canary.plist"), 10);
        let ex = Exclusions::default();
        let others = vec!["com.google.Chrome.canary".to_string()];
        let items = leftovers(&app, &ctx(&t, &ex, &others, None, &|_| false, false), &mut 1);
        assert_eq!(names(&items), ["com.google.Chrome.plist"]);
    }

    #[test]
    fn personal_data_only_when_sure() {
        let t = sample();
        let app = info(&t, "Docker", "com.docker.docker");
        let lib = t.roots.home.join("Library");
        file(&lib.join("Containers/com.docker.docker/Data/vms/disk.raw"), 1000);
        file(&lib.join("Application Support/Docker Desktop/x"), 10);
        file(&lib.join("Application Support/Docker/x"), 10);
        let ex = Exclusions::default();
        let items = leftovers(&app, &ctx(&t, &ex, &[], None, &|_| false, false), &mut 1);
        let personal = items.iter().find(|i| i.path.ends_with("com.docker.docker")).unwrap();
        assert_eq!(personal.category, Category::Personal);
        assert!(!personal.ticked);
        // "Docker" is only a maybe, and it is protected: dropped.
        assert!(!items.iter().any(|i| i.path.ends_with("Application Support/Docker")));
        assert!(!items.iter().any(|i| i.path.ends_with("Docker Desktop")));
    }

    #[test]
    fn launch_agent_by_program_path() {
        let t = sample();
        let app = info(&t, "Coba", "id.coba.app");
        let agents = t.roots.home.join("Library/LaunchAgents");
        fs::create_dir_all(&agents).unwrap();
        let write = |file: &str, label: &str, program: &str| {
            let mut d = plist::Dictionary::new();
            d.insert("Label".into(), plist::Value::String(label.into()));
            d.insert("ProgramArguments".into(), plist::Value::Array(vec![plist::Value::String(program.into())]));
            plist::Value::Dictionary(d).to_file_xml(agents.join(file)).unwrap();
        };
        write("helper.plist", "net.other.helper", &app.path.join("Contents/MacOS/helper").to_string_lossy());
        write("label.plist", "id.coba.app.agent", "/usr/bin/true");
        write("coba.plist", "net.coba", "/usr/bin/true");
        let ex = Exclusions::default();
        let items = leftovers(&app, &ctx(&t, &ex, &[], None, &|_| false, false), &mut 1);
        assert_eq!(names(&items), ["helper.plist", "label.plist"]);
    }

    #[test]
    fn official_uninstaller_detection() {
        let t = sample();
        let plain = bundle(&t.roots.apps[0], "Plain", "com.a.plain", 10);
        assert!(!official_uninstaller(&plain, "com.a.plain"));
        let ext = bundle(&t.roots.apps[0], "Ext", "com.a.ext", 10);
        file(&ext.join("Contents/Library/SystemExtensions/x.systemextension/y"), 10);
        assert!(official_uninstaller(&ext, "com.a.ext"));
        let edr = bundle(&t.roots.apps[0], "Falcon", "com.crowdstrike.falcon.App", 10);
        assert!(official_uninstaller(&edr, "com.crowdstrike.falcon.App"));
        let broken = t.roots.apps[0].join("Broken.app");
        file(&broken.join("Contents/Info.plist"), 3);
        assert!(official_uninstaller(&broken, "com.a.broken"));
        let vpn = bundle(&t.roots.apps[0], "Tunnel", "com.a.tunnel", 10);
        let mut ext_d = plist::Dictionary::new();
        ext_d.insert("NSExtensionPointIdentifier".into(), plist::Value::String("com.apple.networkextension.packet-tunnel".into()));
        let mut d = plist::Dictionary::new();
        d.insert("NSExtension".into(), plist::Value::Dictionary(ext_d));
        fs::create_dir_all(vpn.join("Contents/PlugIns/T.appex/Contents")).unwrap();
        plist::Value::Dictionary(d).to_file_xml(vpn.join("Contents/PlugIns/T.appex/Contents/Info.plist")).unwrap();
        assert!(official_uninstaller(&vpn, "com.a.tunnel"));
    }

    #[test]
    fn hidden_dot_folders_never_offered() {
        let t = sample();
        let app = info(&t, "Spotify", "com.spotify.client");
        file(&t.roots.home.join(".spotify/x"), 10);
        file(&t.roots.home.join(".config/spotify/x"), 10);
        let ex = Exclusions::default();
        let items = leftovers(&app, &ctx(&t, &ex, &[], None, &|_| false, false), &mut 1);
        assert!(items.iter().all(|i| i.path.starts_with(t.roots.home.join("Library"))));
    }

    #[test]
    fn team_is_read_from_codesign() {
        assert_eq!(parse_team("Identifier=x\nTeamIdentifier=UBF8T346G9\n"), Some("UBF8T346G9".into()));
        assert_eq!(parse_team("TeamIdentifier=not set\n"), None);
        assert_eq!(parse_team("garbage"), None);
    }

    #[test]
    fn the_app_item_is_ticked_and_goes_to_the_trash() {
        let t = sample();
        let app = info(&t, "Coba", "id.coba.app");
        let it = app_item(&app, &mut 7);
        assert_eq!((it.id, it.category, it.ticked), (7, Category::App, true));
        assert_eq!(it.owner.as_deref(), Some("id.coba.app"));
        assert!(it.ident.is_some());
    }
}

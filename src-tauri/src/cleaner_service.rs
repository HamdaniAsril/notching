//! Cleaner's native side (design 1 Nov): the scans the notch page asks for, kept
//! 10 minutes under ids so the page never sends a path; the runs, with their
//! progress, status and log; Full Disk Access, the volume, running apps, Launch
//! Services and the Trash.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSArray, NSFileManager, NSNumber, NSString, NSURL};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::app_core::CoreState;
use crate::cleaner_apps::{app_item, bundle_ids, leftovers, list_apps, parse_team, AppInfo, Leftovers};
use crate::cleaner_rules::{exclusions_json, parse_exclusions, size_text, Category, Exclusions, Purpose, Roots, Skip};
use crate::cleaner_run::{run, Outcome, RunCtx, Trash};
use crate::cleaner_scan::{breakdown, deep_scan, personal_parts, quick_cleanable, Env, Item, Node};
use crate::locale::Lang;
use crate::status::{self, Activity};

pub const MODULE_ID: &str = "cleaner";
/// To every window: `{ phase: "progress", done, total }` or `{ phase: "done", freed, outcomes }`.
pub const CLEANER_EVENT: &str = "notching://cleaner";
/// Scan results, and the page's place, last this long (§4).
pub const SCAN_TTL_MS: i64 = 600_000;
/// The result beside the notch goes after this, or when Cleaner is opened (§10).
const RESULT_STATUS_MS: u64 = 600_000;
const FDA_PANE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
const EXCLUDE_FILE: &str = "cleaner-exclude.json";
const LOG_FILE: &str = "cleaner.log";
const QUIT_WAIT: Duration = Duration::from_secs(2);

struct Scan {
    made_ms: i64,
    items: HashMap<u64, Item>,
}

/// Every scan the page may still act on, by id. Item and app ids are unique
/// across scans.
#[derive(Default)]
pub struct Store {
    next_id: u64,
    scans: HashMap<u64, Scan>,
    apps: Option<(u64, i64, Vec<AppInfo>)>,
}

impl Store {
    pub fn ids(&mut self) -> &mut u64 {
        if self.next_id == 0 {
            self.next_id = 1;
        }
        &mut self.next_id
    }

    /// Keeps a scan's items; drops scans past their time.
    pub fn put(&mut self, items: Vec<Item>, now_ms: i64) -> u64 {
        self.scans.retain(|_, s| now_ms - s.made_ms < SCAN_TTL_MS);
        let id = *self.ids();
        self.next_id += 1;
        self.scans.insert(id, Scan { made_ms: now_ms, items: items.into_iter().map(|i| (i.id, i)).collect() });
        id
    }

    pub fn take(&self, scan_id: u64, ids: &[u64], now_ms: i64) -> Result<Vec<Item>, &'static str> {
        let scan = self.scans.get(&scan_id).ok_or("unknown")?;
        if now_ms - scan.made_ms >= SCAN_TTL_MS {
            return Err("stale");
        }
        ids.iter().map(|id| scan.items.get(id).cloned().ok_or("unknown")).collect()
    }

    fn item(&self, id: u64) -> Option<&Item> {
        self.scans.values().find_map(|s| s.items.get(&id))
    }

    fn app(&self, id: u64) -> Option<&AppInfo> {
        self.apps.as_ref().and_then(|(_, _, apps)| apps.iter().find(|a| a.id == id))
    }
}

pub struct CleanerState {
    store: Mutex<Store>,
    stop: AtomicBool,
    cancel: AtomicBool,
    busy: AtomicBool,
    result_gen: AtomicU64,
    roots: Roots,
    real_home: PathBuf,
    data_dir: PathBuf,
    log_dir: PathBuf,
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let paths = app.path();
    let home = paths.home_dir()?;
    let roots = Roots::from_env(home.clone(), std::env::var_os("NOTCHING_CLEANER_ROOT"));
    if roots.test_mode {
        eprintln!("notching: Cleaner in test mode, inside {}", roots.home.display());
    }
    app.manage(CleanerState {
        store: Mutex::new(Store::default()),
        stop: AtomicBool::new(false),
        cancel: AtomicBool::new(false),
        busy: AtomicBool::new(false),
        result_gen: AtomicU64::new(0),
        roots,
        real_home: home,
        data_dir: paths.app_data_dir()?,
        log_dir: paths.app_log_dir()?,
    });
    Ok(())
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// macOS gives no call for this; reading the TCC folder fails without it, and
/// never prompts. Inside the sample folder it counts as granted (§11).
pub fn fda(state: &CleanerState) -> bool {
    state.roots.test_mode || fs::read_dir(state.real_home.join("Library/Application Support/com.apple.TCC")).is_ok()
}

pub fn full_disk_access(app: &AppHandle) -> bool {
    app.try_state::<CleanerState>().is_some_and(|s| fda(&s))
}

fn lang(app: &AppHandle) -> &'static str {
    match app.state::<CoreState>().0.lock().unwrap().lang() {
        Lang::Id => "id",
        Lang::En => "en",
    }
}

// What the Mac says now, read once per scan or run.
struct Snapshot {
    running: HashSet<String>,
    running_paths: Vec<PathBuf>,
    processes: HashSet<String>,
}

fn snapshot() -> Snapshot {
    let mut running = HashSet::new();
    let mut running_paths = Vec::new();
    for a in NSWorkspace::sharedWorkspace().runningApplications().iter() {
        if let Some(id) = a.bundleIdentifier() {
            running.insert(id.to_string());
        }
        if let Some(p) = a.bundleURL().and_then(|u| u.path()) {
            running_paths.push(PathBuf::from(p.to_string()));
        }
    }
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let processes = sys.processes().values().map(|p| p.name().to_string_lossy().into_owned()).collect();
    Snapshot { running, running_paths, processes }
}

impl Snapshot {
    fn running(&self, name: &str) -> bool {
        self.running.contains(name)
    }
    fn app_running(&self, app: &AppInfo) -> bool {
        self.running.contains(&app.bundle_id) || self.running_paths.iter().any(|p| p == &app.path)
    }
}

/// Launch Services: every copy of an app macOS knows, outside the Trash.
fn copies(bundle_id: &str, home: &Path) -> Option<Vec<PathBuf>> {
    let ws = NSWorkspace::sharedWorkspace();
    let urls = ws.URLsForApplicationsWithBundleIdentifier(&NSString::from_str(bundle_id));
    let trash = home.join(".Trash");
    Some(
        urls.iter()
            .filter_map(|u| u.path().map(|p| PathBuf::from(p.to_string())))
            .filter(|p| !p.starts_with(&trash))
            .collect(),
    )
}

fn mounted_images() -> Vec<PathBuf> {
    let Ok(out) = Command::new("/usr/bin/hdiutil").args(["info", "-plist"]).output() else { return Vec::new() };
    let Ok(v) = plist::Value::from_reader_xml(&out.stdout[..]) else { return Vec::new() };
    v.as_dictionary()
        .and_then(|d| d.get("images"))
        .and_then(|i| i.as_array())
        .map(|images| {
            images
                .iter()
                .filter_map(|i| i.as_dictionary()?.get("image-path")?.as_string().map(PathBuf::from))
                .collect()
        })
        .unwrap_or_default()
}

fn exclude_path(state: &CleanerState) -> PathBuf {
    state.data_dir.join(EXCLUDE_FILE)
}

/// No file is an empty list; a file that can't be read or understood is an error.
fn load_exclusions(state: &CleanerState) -> Result<Exclusions, ()> {
    match fs::read_to_string(exclude_path(state)) {
        Ok(text) => parse_exclusions(Some(&text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => parse_exclusions(None),
        Err(_) => Err(()),
    }
}

fn save_exclusions(state: &CleanerState, e: &Exclusions) -> Result<(), String> {
    let path = exclude_path(state);
    fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, exclusions_json(e)).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

// Runs a scan with the Mac's state read once. `installed` checks Launch Services
// and the app folders; a failed lookup is "unknown".
fn with_env<R>(state: &CleanerState, excluded: &Exclusions, f: impl FnOnce(&Env, &Snapshot) -> R) -> R {
    let snap = snapshot();
    let mounted = mounted_images();
    let listed: HashSet<String> = bundle_ids(&state.roots).into_iter().collect();
    let home = state.roots.home.clone();
    let installed = move |bid: &str| -> Option<bool> {
        if listed.contains(bid) {
            return Some(true);
        }
        copies(bid, &home).map(|c| !c.is_empty())
    };
    let running = |n: &str| snap.running(n);
    let busy = |t: &str| !t.is_empty() && snap.processes.contains(t);
    let is_mounted = |p: &Path| mounted.iter().any(|m| m == p);
    let env = Env {
        roots: &state.roots,
        fda: fda(state),
        running: &running,
        installed: &installed,
        mounted: &is_mounted,
        busy_tool: &busy,
        excluded,
        now_ms: now_ms(),
        cancel: &state.cancel,
    };
    f(&env, &snap)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub test_mode: bool,
    pub fda: bool,
    pub volume: String,
    pub total: u64,
    pub free: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartsDto {
    pub apps: Option<u64>,
    pub documents: Option<u64>,
    pub photos: Option<u64>,
    pub cleanable: Option<u64>,
    pub app_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanDto<T> {
    pub scan_id: u64,
    pub items: Vec<T>,
}

// The volume's name, size and space free for important use, as Finder counts it.
fn volume() -> (String, u64, u64) {
    let url = NSURL::fileURLWithPath(&NSString::from_str("/"));
    let number = |key: &NSString| -> u64 {
        url.resourceValuesForKeys_error(&NSArray::from_slice(&[key]))
            .ok()
            .and_then(|d| d.objectForKey(key))
            .and_then(|v| v.downcast::<NSNumber>().ok())
            .map_or(0, |n| n.unsignedLongLongValue())
    };
    let name_key = unsafe { objc2_foundation::NSURLVolumeLocalizedNameKey };
    let name = url
        .resourceValuesForKeys_error(&NSArray::from_slice(&[name_key]))
        .ok()
        .and_then(|d| d.objectForKey(name_key))
        .and_then(|v| v.downcast::<NSString>().ok())
        .map_or_else(|| "Macintosh HD".to_string(), |s| s.to_string());
    let total = number(unsafe { objc2_foundation::NSURLVolumeTotalCapacityKey });
    let free = number(unsafe { objc2_foundation::NSURLVolumeAvailableCapacityForImportantUsageKey });
    (name, total, free)
}

fn blocking<R: Send + 'static>(app: AppHandle, f: impl FnOnce(&CleanerState) -> R + Send + 'static) -> tauri::async_runtime::JoinHandle<R> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CleanerState>();
        f(&state)
    })
}

#[tauri::command]
pub async fn cleaner_overview(app: AppHandle) -> Result<Overview, String> {
    blocking(app, |state| {
        let (volume, total, free) = volume();
        Overview { test_mode: state.roots.test_mode, fda: fda(state), volume, total, free }
    })
    .await
    .map_err(|e| e.to_string())
}

/// The bar's parts and the tiles' summaries. Keeps the app list for Clean uninstall.
#[tauri::command]
pub async fn cleaner_parts(app: AppHandle) -> Result<PartsDto, String> {
    blocking(app, |state| {
        state.cancel.store(false, Ordering::Relaxed);
        let excluded = load_exclusions(state).unwrap_or_default();
        let ((documents, photos), cleanable) = with_env(state, &excluded, |env, _| (personal_parts(env), quick_cleanable(env)));
        let apps = fresh_apps(state);
        let bytes: u64 = apps.items.iter().map(|a| a.bytes).sum();
        PartsDto { apps: Some(bytes), documents, photos, cleanable: Some(cleanable), app_count: apps.items.len() }
    })
    .await
    .map_err(|e| e.to_string())
}

// Lists the apps (slow: each is sized) without holding the store, then keeps them.
fn fresh_apps(state: &CleanerState) -> ScanDto<AppInfo> {
    let snap = snapshot();
    let mut ids = { *state.store.lock().unwrap().ids() };
    let mut apps = list_apps(&state.roots, &state.cancel, &mut ids);
    for a in &mut apps {
        a.running = snap.app_running(a);
    }
    let mut store = state.store.lock().unwrap();
    let scan = store.next_id.max(ids);
    store.next_id = scan + 1;
    store.apps = Some((scan, now_ms(), apps.clone()));
    ScanDto { scan_id: scan, items: apps }
}

#[tauri::command]
pub async fn cleaner_deep_scan(app: AppHandle) -> Result<ScanDto<Item>, String> {
    blocking(app, |state| {
        state.cancel.store(false, Ordering::Relaxed);
        let excluded = load_exclusions(state).unwrap_or_default();
        let mut ids = { *state.store.lock().unwrap().ids() };
        let items = with_env(state, &excluded, |env, _| deep_scan(env, &mut ids));
        let mut store = state.store.lock().unwrap();
        store.next_id = store.next_id.max(ids);
        let scan_id = store.put(items.clone(), now_ms());
        ScanDto { scan_id, items }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleaner_apps(app: AppHandle) -> Result<ScanDto<AppInfo>, String> {
    blocking(app, |state| {
        {
            let store = state.store.lock().unwrap();
            if let Some((scan, made, apps)) = &store.apps {
                if now_ms() - made < SCAN_TTL_MS {
                    return ScanDto { scan_id: *scan, items: apps.clone() };
                }
            }
        }
        state.cancel.store(false, Ordering::Relaxed);
        fresh_apps(state)
    })
    .await
    .map_err(|e| e.to_string())
}

fn team(app: &Path) -> Option<String> {
    let out = Command::new("/usr/bin/codesign").arg("-dv").arg("--verbose=2").arg(app).output().ok()?;
    parse_team(&String::from_utf8_lossy(&out.stderr))
}

fn vendor(bid: &str) -> String {
    bid.split('.').take(2).collect::<Vec<_>>().join(".").to_lowercase()
}

/// The app and what it leaves (§5.2), as a new scan.
#[tauri::command]
pub async fn cleaner_app_detail(app: AppHandle, app_id: u64) -> Result<ScanDto<Item>, String> {
    blocking(app, move |state| {
        let (target, others) = {
            let store = state.store.lock().unwrap();
            let target = store.app(app_id).cloned().ok_or("unknown")?;
            let others: Vec<AppInfo> =
                store.apps.as_ref().map(|(_, _, a)| a.iter().filter(|o| o.id != app_id).cloned().collect()).unwrap_or_default();
            (target, others)
        };
        let excluded = load_exclusions(state).unwrap_or_default();
        let snap = snapshot();
        let mut target = target;
        target.running = snap.app_running(&target);
        let other_copy = others.iter().any(|o| o.bundle_id == target.bundle_id)
            || copies(&target.bundle_id, &state.roots.home).is_none_or(|c| c.iter().any(|p| p != &target.path));
        let team_id = team(&target.path);
        let same_vendor: Vec<&AppInfo> = others.iter().filter(|o| vendor(&o.bundle_id) == vendor(&target.bundle_id)).collect();
        let team_shared = |t: &str| same_vendor.iter().any(|o| team(&o.path).is_none_or(|ot| ot == t));
        let other_ids: Vec<String> = others.iter().map(|o| o.bundle_id.clone()).collect();
        let ctx = Leftovers {
            roots: &state.roots,
            fda: fda(state),
            other_copy,
            team: team_id.as_deref(),
            team_shared: &team_shared,
            others: &other_ids,
            excluded: &excluded,
        };
        let mut ids = { *state.store.lock().unwrap().ids() };
        let mut items = vec![app_item(&target, &mut ids)];
        items.extend(leftovers(&target, &ctx, &mut ids));
        let mut store = state.store.lock().unwrap();
        store.next_id = store.next_id.max(ids);
        let scan_id = store.put(items.clone(), now_ms());
        Ok(ScanDto { scan_id, items })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cleaner_breakdown(app: AppHandle) -> Result<Node, String> {
    blocking(app, |state| {
        state.cancel.store(false, Ordering::Relaxed);
        let excluded = Exclusions::default();
        with_env(state, &excluded, |env, _| breakdown(env))
    })
    .await
    .map_err(|e| e.to_string())
}

/// Moves to the Trash the way Finder does, so "Put Back" works.
struct MacTrash;

impl Trash for MacTrash {
    fn trash(&self, p: &Path) -> Result<(), String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()));
        NSFileManager::defaultManager().trashItemAtURL_resultingItemURL_error(&url, None).map_err(|e| {
            // NSFileWriteNoPermissionError: an app owned by the system (§7).
            if e.code() == 513 { "admin".to_string() } else { e.localizedDescription().to_string() }
        })
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OutcomeDto {
    id: u64,
    freed: u64,
    skip: Option<Skip>,
    detail: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "camelCase")]
enum CleanerEvent {
    Progress { done: usize, total: usize },
    Done { freed: u64, outcomes: Vec<OutcomeDto> },
}

fn append_log(dir: &Path, line: &str) {
    let _ = fs::create_dir_all(dir);
    match fs::OpenOptions::new().create(true).append(true).open(dir.join(LOG_FILE)) {
        Ok(mut f) => {
            let _ = writeln!(f, "{line}");
        }
        Err(e) => eprintln!("notching: cleaner log not written: {e}"),
    }
    eprintln!("notching: cleaner {line}");
}

/// Starts removing the chosen items (§5.3–§5.4). `uninstall` is the app's id.
#[tauri::command]
pub fn cleaner_run(app: AppHandle, scan_id: u64, ids: Vec<u64>, uninstall: Option<u64>) -> Result<(), String> {
    let state = app.state::<CleanerState>();
    let excluded = load_exclusions(&state).map_err(|_| "exclusions".to_string())?;
    let items = state.store.lock().unwrap().take(scan_id, &ids, now_ms()).map_err(str::to_string)?;
    if uninstall.is_some() && !items.iter().any(|i| i.category == Category::App) {
        return Err("unknown".into());
    }
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err("busy".into());
    }
    state.stop.store(false, Ordering::SeqCst);
    let handle = app.clone();
    std::thread::spawn(move || {
        let state = handle.state::<CleanerState>();
        let snap = snapshot();
        let app_item = items.iter().find(|i| i.category == Category::App).cloned();
        let bid = app_item.as_ref().and_then(|i| i.owner.clone()).unwrap_or_default();
        let app_path = app_item.as_ref().map(|i| i.path.clone()).unwrap_or_default();
        let purpose = if app_item.is_some() { Purpose::Uninstall { bundle_id: &bid, app: &app_path } } else { Purpose::Clean };
        let running = |n: &str| snap.running(n);
        let home = state.roots.home.clone();
        let other_copy = || copies(&bid, &home).is_none_or(|c| !c.is_empty());
        let log_dir = state.log_dir.clone();
        let mut log = |line: String| append_log(&log_dir, &line);
        let now = || chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false);
        let total = items.len();
        let mut last_pct = u64::MAX;
        let lang = lang(&handle);
        let ctx = RunCtx {
            roots: &state.roots,
            excluded: &excluded,
            running: &running,
            trash: &MacTrash,
            other_copy: &other_copy,
            stop: &state.stop,
            log: &mut log,
            now: &now,
        };
        let outcomes: Vec<Outcome> = run(&items, &purpose, ctx, |index, _| {
            let done = index + 1;
            let _ = handle.emit(CLEANER_EVENT, CleanerEvent::Progress { done, total });
            let pct = (done * 100 / total.max(1)) as u64;
            if pct != last_pct {
                last_pct = pct;
                let _ = status::set(&handle, MODULE_ID, Activity::Running, Some(&format!("{pct}%")));
            }
        });
        let freed: u64 = outcomes.iter().filter_map(|o| o.result.ok()).sum();
        let dto = outcomes
            .iter()
            .map(|o| OutcomeDto { id: o.id, freed: *o.result.as_ref().unwrap_or(&0), skip: o.result.err(), detail: o.detail.clone() })
            .collect();
        let _ = handle.emit(CLEANER_EVENT, CleanerEvent::Done { freed, outcomes: dto });
        let _ = status::set(&handle, MODULE_ID, Activity::On, Some(&size_text(freed, lang, false)));
        state.busy.store(false, Ordering::SeqCst);
        let generation = state.result_gen.fetch_add(1, Ordering::SeqCst) + 1;
        let later = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(RESULT_STATUS_MS));
            clear_result(&later, generation);
        });
    });
    Ok(())
}

// Clears the result status unless a newer run owns it, or a run is going.
fn clear_result(app: &AppHandle, generation: u64) {
    let state = app.state::<CleanerState>();
    if state.busy.load(Ordering::SeqCst) || state.result_gen.load(Ordering::SeqCst) != generation {
        return;
    }
    status::clear(app, MODULE_ID);
}

#[tauri::command]
pub fn cleaner_stop(app: AppHandle) {
    app.state::<CleanerState>().stop.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn cleaner_cancel_scans(app: AppHandle) {
    app.state::<CleanerState>().cancel.store(true, Ordering::Relaxed);
}

/// Ids, from the scan and the app list, whose app is running now.
#[tauri::command]
pub fn cleaner_running(app: AppHandle, scan_id: u64) -> Vec<u64> {
    let state = app.state::<CleanerState>();
    let snap = snapshot();
    let store = state.store.lock().unwrap();
    let mut ids: Vec<u64> = store
        .scans
        .get(&scan_id)
        .map(|s| s.items.values().filter(|i| i.owner.as_deref().is_some_and(|o| snap.running(o))).map(|i| i.id).collect())
        .unwrap_or_default();
    if let Some((_, _, apps)) = &store.apps {
        ids.extend(apps.iter().filter(|a| snap.app_running(a)).map(|a| a.id));
    }
    ids
}

fn reveal(path: &Path) {
    let url: Retained<NSURL> = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    NSWorkspace::sharedWorkspace().activateFileViewerSelectingURLs(&NSArray::from_retained_slice(&[url]));
}

#[tauri::command]
pub fn cleaner_reveal(app: AppHandle, id: u64) -> Result<(), String> {
    let state = app.state::<CleanerState>();
    let path = {
        let store = state.store.lock().unwrap();
        store.item(id).map(|i| i.path.clone()).or_else(|| store.app(id).map(|a| a.path.clone())).ok_or("unknown")?
    };
    reveal(&path);
    Ok(())
}

/// A breakdown row: names from home, or `["App", "<name>.app", …]`.
#[tauri::command]
pub fn cleaner_reveal_path(app: AppHandle, names: Vec<String>) -> Result<(), String> {
    let state = app.state::<CleanerState>();
    if names.iter().any(|n| n.is_empty() || n.contains('/') || n == ".." || n == ".") {
        return Err("bad path".into());
    }
    let path = match names.split_first() {
        Some((first, rest)) if first == "App" && !rest.is_empty() => {
            let base = state.roots.apps.iter().find(|a| a.join(&rest[0]).exists()).ok_or("unknown")?;
            rest.iter().fold(base.clone(), |p, n| p.join(n))
        }
        _ => names.iter().fold(state.roots.home.clone(), |p, n| p.join(n)),
    };
    if !path.exists() {
        return Err("unknown".into());
    }
    reveal(&path);
    Ok(())
}

#[tauri::command]
pub fn cleaner_exclude(app: AppHandle, id: u64) -> Result<(), String> {
    let state = app.state::<CleanerState>();
    let path = state.store.lock().unwrap().item(id).map(|i| i.path.clone()).ok_or("unknown")?;
    let mut e = load_exclusions(&state).map_err(|_| "exclusions".to_string())?;
    if !e.paths.contains(&path) {
        e.paths.push(path);
    }
    save_exclusions(&state, &e)
}

#[tauri::command]
pub fn cleaner_exclusions(app: AppHandle) -> Result<Vec<String>, String> {
    let state = app.state::<CleanerState>();
    let e = load_exclusions(&state).map_err(|_| "exclusions".to_string())?;
    Ok(e.paths.iter().map(|p| p.to_string_lossy().into_owned()).collect())
}

#[tauri::command]
pub fn cleaner_unexclude(app: AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<CleanerState>();
    let mut e = load_exclusions(&state).map_err(|_| "exclusions".to_string())?;
    e.paths.retain(|p| p != Path::new(&path));
    save_exclusions(&state, &e)
}

/// Cleaner was opened: the result beside the notch has been seen.
#[tauri::command]
pub fn cleaner_seen(app: AppHandle) {
    let state = app.state::<CleanerState>();
    if !state.busy.load(Ordering::SeqCst) {
        state.result_gen.fetch_add(1, Ordering::SeqCst);
        status::clear(&app, MODULE_ID);
    }
}

#[tauri::command]
pub fn cleaner_open_log(app: AppHandle) {
    let state = app.state::<CleanerState>();
    let log = state.log_dir.join(LOG_FILE);
    reveal(if log.exists() { &log } else { &state.log_dir });
}

/// System Settings › Privacy & Security › Full Disk Access.
#[tauri::command]
pub fn open_full_disk_access_settings() {
    if let Err(e) = Command::new("/usr/bin/open").arg(FDA_PANE).spawn() {
        eprintln!("notching: System Settings did not open: {e}");
    }
}

/// Switched off or removed: a run stops after its current item; scans stop.
pub fn module_gone(app: &AppHandle, id: &str) {
    if id != MODULE_ID {
        return;
    }
    let state = app.state::<CleanerState>();
    state.stop.store(true, Ordering::SeqCst);
    state.cancel.store(true, Ordering::Relaxed);
    status::clear(app, MODULE_ID);
}

/// Quitting: the run stops after its current item, which is logged (§5.4).
pub fn quitting(app: &AppHandle) {
    let Some(state) = app.try_state::<CleanerState>() else { return };
    state.stop.store(true, Ordering::SeqCst);
    state.cancel.store(true, Ordering::Relaxed);
    let start = Instant::now();
    while state.busy.load(Ordering::SeqCst) && start.elapsed() < QUIT_WAIT {
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cleaner_rules::{Category, Method};
    use std::path::PathBuf;

    fn item(id: u64) -> Item {
        Item {
            id,
            category: Category::AppCache,
            label: String::new(),
            detail: None,
            path: PathBuf::from("/x"),
            bytes: 0,
            method: Method::Permanent,
            ticked: true,
            in_use: false,
            confidence: None,
            ident: None,
            owner: None,
        }
    }

    #[test]
    fn stale_scan_is_refused() {
        let mut s = Store::default();
        let a = *s.ids();
        let scan = s.put(vec![item(a)], 1_000);
        assert_eq!(s.take(scan, &[a], 1_000 + SCAN_TTL_MS - 1).unwrap().len(), 1);
        assert_eq!(s.take(scan, &[a], 1_000 + SCAN_TTL_MS + 1).unwrap_err(), "stale");
    }

    #[test]
    fn unknown_ids_are_refused() {
        let mut s = Store::default();
        let first = s.put(vec![item(1)], 0);
        let second = s.put(vec![item(2)], 0);
        assert_ne!(first, second);
        assert_eq!(s.take(second, &[1], 0).unwrap_err(), "unknown");
        assert_eq!(s.take(99, &[1], 0).unwrap_err(), "unknown");
        assert_eq!(s.take(first, &[1], 0).unwrap()[0].id, 1);
    }
}

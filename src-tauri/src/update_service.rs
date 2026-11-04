//! Updates in the core (Tentang, owner 4 Nov): the latest version asked of
//! GitHub, once a day while the switch is on or when the person asks; and on
//! "Update & install", its DMG downloaded, the app inside checked to be signed by
//! the same team and accepted by Gatekeeper, put in place of this one, and
//! opened again. Nothing runs between checks but a sleeping thread.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::app_core::CoreState;
use crate::update_rules::{due, newer, parse_release, Release, LATEST_URL};

const UPDATE_EVENT: &str = "notching://update";

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}
// After launch, before the first daily check: out of launch's way.
const FIRST_CHECK: Duration = Duration::from_secs(60);
const WAKE_EVERY: Duration = Duration::from_secs(60 * 60);
const TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);
const ANSWER_LIMIT: u64 = 1 << 20;
const DMG_LIMIT: u64 = 300 << 20;

/// Where an update stands, for Tentang.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    #[default]
    Idle,
    Checking,
    Downloading,
    Verifying,
    Installing,
    Restarting,
}

#[derive(Default)]
struct State {
    phase: Phase,
    latest: Option<Release>,
    progress: Option<f64>,
    error: Option<String>,
}

pub struct UpdateState(Mutex<State>);

impl UpdateState {
    pub fn new() -> Self {
        UpdateState(Mutex::new(State::default()))
    }
}

/// Same shape as UpdateInfo in src/settings/types.ts.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDto {
    pub current: String,
    /// The latest published version, once asked for.
    pub latest: Option<String>,
    /// It is newer than this one.
    pub available: bool,
    pub page: Option<String>,
    pub size: Option<u64>,
    pub checked_at: Option<i64>,
    pub auto: bool,
    /// This is the installed Notching.app, so it can replace itself.
    pub installable: bool,
    pub phase: Phase,
    /// 0 to 1 while downloading.
    pub progress: Option<f64>,
    /// What went wrong last: "network", "notFound", "signature", "copy", "dev", "busy".
    pub error: Option<String>,
}

fn current(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn bundle() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|e| crate::self_uninstall::bundle_of(&e))
}

fn dto(app: &AppHandle) -> UpdateDto {
    let (auto, checked_at) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.auto_update(), core.update_checked_at())
    };
    let cur = current(app);
    let s = app.state::<UpdateState>();
    let s = s.0.lock().unwrap();
    UpdateDto {
        latest: s.latest.as_ref().map(|r| r.version.clone()),
        available: s.latest.as_ref().is_some_and(|r| newer(&r.version, &cur)),
        page: s.latest.as_ref().map(|r| r.page.clone()),
        size: s.latest.as_ref().map(|r| r.size),
        current: cur,
        checked_at,
        auto,
        installable: bundle().is_some(),
        phase: s.phase,
        progress: s.progress,
        error: s.error.clone(),
    }
}

fn emit(app: &AppHandle) {
    let _ = app.emit(UPDATE_EVENT, dto(app));
}

fn set(app: &AppHandle, f: impl FnOnce(&mut State)) {
    f(&mut app.state::<UpdateState>().0.lock().unwrap());
    emit(app);
}

fn agent(timeout: Duration) -> ureq::Agent {
    use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
    ureq::Agent::config_builder()
        .tls_config(TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build())
        .timeout_global(Some(timeout))
        .user_agent("Notching")
        .build()
        .into()
}

// Blocking. Err is a code for Tentang.
fn fetch_latest() -> Result<Release, String> {
    let mut response = agent(TIMEOUT)
        .get(LATEST_URL)
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| {
            eprintln!("notching: update check failed: {e}");
            "network".to_string()
        })?;
    let body = response.body_mut().with_config().limit(ANSWER_LIMIT).read_to_string().map_err(|e| {
        eprintln!("notching: update answer unreadable: {e}");
        "network".to_string()
    })?;
    parse_release(&body).ok_or_else(|| "notFound".to_string())
}

/// Asks for the latest version now. Blocking.
fn check(app: &AppHandle) -> UpdateDto {
    {
        let s = app.state::<UpdateState>();
        let mut s = s.0.lock().unwrap();
        if s.phase != Phase::Idle {
            drop(s);
            return dto(app);
        }
        s.phase = Phase::Checking;
        s.error = None;
    }
    emit(app);
    let result = fetch_latest();
    let _ = app.state::<CoreState>().0.lock().unwrap().set_update_checked(now_ms());
    set(app, |s| {
        s.phase = Phase::Idle;
        match result {
            Ok(r) => s.latest = Some(r),
            Err(e) => s.error = Some(e),
        }
    });
    dto(app)
}

// A newer version, told once in the notch.
fn tell(app: &AppHandle) {
    let d = dto(app);
    let (Some(version), true) = (d.latest, d.available) else { return };
    let (first, lang) = {
        let core = app.state::<CoreState>();
        let mut core = core.0.lock().unwrap();
        (core.notice_update(&version).unwrap_or(false), core.lang())
    };
    if !first {
        return;
    }
    let (title, detail) = match lang {
        crate::locale::Lang::En => (format!("Notching {version} is available"), "Install it from Settings → About".to_string()),
        _ => (format!("Notching {version} tersedia"), "Pasang dari Pengaturan → Tentang".to_string()),
    };
    crate::notify::post_core(app, &title, &detail);
}

/// The daily check, on a thread of its own that sleeps between looks.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            let (auto, last) = {
                let core = app.state::<CoreState>();
                let core = core.0.lock().unwrap();
                (core.auto_update(), core.update_checked_at())
            };
            if auto && due(last, now_ms()) {
                check(&app);
                tell(&app);
            }
            std::thread::sleep(WAKE_EVERY);
        }
    });
}

#[tauri::command]
pub fn update_state(app: AppHandle) -> UpdateDto {
    dto(&app)
}

/// "Cek versi".
#[tauri::command]
pub async fn update_check(app: AppHandle) -> UpdateDto {
    tauri::async_runtime::spawn_blocking(move || check(&app)).await.unwrap_or_else(|_| UpdateDto {
        current: String::new(),
        latest: None,
        available: false,
        page: None,
        size: None,
        checked_at: None,
        auto: true,
        installable: false,
        phase: Phase::Idle,
        progress: None,
        error: Some("network".into()),
    })
}

#[tauri::command]
pub fn set_auto_update(app: AppHandle, on: bool) -> Result<(), String> {
    app.state::<CoreState>().0.lock().unwrap().set_auto_update(on).map_err(|e| e.to_string())?;
    emit(&app);
    Ok(())
}

/// "Apa yang baru": the release page, only ever this repository's.
#[tauri::command]
pub fn update_open_notes(app: AppHandle) {
    let page = app.state::<UpdateState>().0.lock().unwrap().latest.as_ref().map(|r| r.page.clone());
    if let Some(page) = page {
        if let Err(e) = Command::new("/usr/bin/open").arg(&page).spawn() {
            eprintln!("notching: release page not opened: {e}");
        }
    }
}

/// The fixed pages Tentang links to; nothing else can be opened from here.
#[derive(serde::Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Link {
    Repo,
    License,
    Privacy,
}

pub fn link_url(link: Link) -> &'static str {
    match link {
        Link::Repo => "https://github.com/HamdaniAsril/notching",
        Link::License => "https://github.com/HamdaniAsril/notching/blob/main/LICENSE",
        Link::Privacy => "https://github.com/HamdaniAsril/notching#private-by-default",
    }
}

#[tauri::command]
pub fn open_link(link: Link) {
    if let Err(e) = Command::new("/usr/bin/open").arg(link_url(link)).spawn() {
        eprintln!("notching: {link:?} not opened: {e}");
    }
}

fn run(cmd: &str, args: &[&std::ffi::OsStr]) -> Result<String, String> {
    let out = Command::new(cmd).args(args).output().map_err(|e| e.to_string())?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    if out.status.success() { Ok(text) } else { Err(text.trim().to_string()) }
}

fn download(app: &AppHandle, url: &str, to: &Path) -> Result<(), String> {
    let mut response = agent(DOWNLOAD_TIMEOUT).get(url).call().map_err(|e| e.to_string())?;
    let total = response.body().content_length();
    let mut reader = response.body_mut().with_config().limit(DMG_LIMIT).reader();
    let mut file = std::fs::File::create(to).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut done: u64 = 0;
    let mut shown = 0.0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if let Some(total) = total.filter(|t| *t > 0) {
            let p = (done as f64 / total as f64).min(1.0);
            if p - shown >= 0.02 {
                shown = p;
                set(app, |s| s.progress = Some(p));
            }
        }
    }
    file.sync_all().map_err(|e| e.to_string())
}

// The app is Notching at `version`, signed by the team that signed this one,
// sealed whole, and accepted by Gatekeeper (notarized).
fn verify(new_app: &Path, this_app: &Path, version: &str, bid: &str) -> Result<(), String> {
    let os = |p: &Path| p.as_os_str().to_owned();
    run("/usr/bin/codesign", &["--verify".as_ref(), "--deep".as_ref(), "--strict".as_ref(), &os(new_app)])?;
    run("/usr/sbin/spctl", &["--assess".as_ref(), "--type".as_ref(), "execute".as_ref(), &os(new_app)])?;
    let team = |p: &Path| {
        run("/usr/bin/codesign", &["-dv".as_ref(), "--verbose=4".as_ref(), &os(p)])
            .ok()
            .and_then(|out| crate::cleaner_apps::parse_team(&out))
    };
    let (new_team, this_team) = (team(new_app), team(this_app));
    if new_team.is_none() || new_team != this_team {
        return Err(format!("team {new_team:?} is not {this_team:?}"));
    }
    let info = plist::Value::from_file(new_app.join("Contents/Info.plist")).map_err(|e| e.to_string())?;
    let field = |k: &str| info.as_dictionary().and_then(|d| d.get(k)).and_then(|v| v.as_string()).map(str::to_string);
    if field("CFBundleIdentifier").as_deref() != Some(bid) || field("CFBundleShortVersionString").as_deref() != Some(version) {
        return Err("not the expected app or version".into());
    }
    Ok(())
}

// The new app where this one is: the old one moved aside first and put back if
// the new one does not land, then sent to the Trash.
fn swap(staged: &Path, bundle: &Path) -> Result<(), String> {
    let parent = bundle.parent().ok_or("no folder")?;
    let aside = parent.join(".Notching-old.app");
    if aside.exists() {
        crate::self_uninstall::trash(&aside)?;
    }
    std::fs::rename(bundle, &aside).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(staged, bundle) {
        let _ = std::fs::rename(&aside, bundle);
        return Err(e.to_string());
    }
    if let Err(e) = crate::self_uninstall::trash(&aside) {
        eprintln!("notching: the old app stays at {}: {e}", aside.display());
    }
    Ok(())
}

fn install(app: &AppHandle, release: &Release) -> Result<(), String> {
    let bundle = bundle().ok_or("dev")?;
    let bid = app.config().identifier.clone();
    let work = std::env::temp_dir().join(format!("notching-update-{}", release.version));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|_| "copy")?;
    let dmg = work.join("Notching.dmg");
    set(app, |s| {
        s.phase = Phase::Downloading;
        s.progress = Some(0.0);
    });
    download(app, &release.dmg, &dmg).map_err(|e| {
        eprintln!("notching: update download failed: {e}");
        "network"
    })?;
    set(app, |s| {
        s.phase = Phase::Verifying;
        s.progress = None;
    });
    let mount = work.join("mnt");
    std::fs::create_dir_all(&mount).map_err(|_| "copy")?;
    run(
        "/usr/bin/hdiutil",
        &["attach".as_ref(), "-nobrowse".as_ref(), "-readonly".as_ref(), "-noautoopen".as_ref(), "-mountpoint".as_ref(), mount.as_os_str(), dmg.as_os_str()],
    )
    .map_err(|e| {
        eprintln!("notching: update DMG not opened: {e}");
        "signature"
    })?;
    let detach = || {
        let _ = run("/usr/bin/hdiutil", &["detach".as_ref(), mount.as_os_str(), "-quiet".as_ref()]);
    };
    let new_app = mount.join("Notching.app");
    if let Err(e) = verify(&new_app, &bundle, &release.version, &bid) {
        eprintln!("notching: update refused: {e}");
        detach();
        return Err("signature".into());
    }
    set(app, |s| s.phase = Phase::Installing);
    let staged = bundle.parent().ok_or("copy")?.join(".Notching-update.app");
    let _ = std::fs::remove_dir_all(&staged);
    let copied = run("/usr/bin/ditto", &[new_app.as_os_str(), staged.as_os_str()]);
    detach();
    copied.map_err(|e| {
        eprintln!("notching: update not copied: {e}");
        "copy"
    })?;
    swap(&staged, &bundle).map_err(|e| {
        eprintln!("notching: update not put in place: {e}");
        let _ = std::fs::remove_dir_all(&staged);
        "copy"
    })?;
    let _ = std::fs::remove_dir_all(&work);
    eprintln!("notching: updated to {}; opening it again", release.version);
    Ok(())
}

/// "Update & install": the latest release in place of this app, then the new
/// one opens as this one quits.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let release = {
        let s = app.state::<UpdateState>();
        let mut s = s.0.lock().unwrap();
        if s.phase != Phase::Idle {
            return Err("busy".into());
        }
        let Some(r) = s.latest.clone().filter(|r| newer(&r.version, &current(&app))) else { return Err("notFound".into()) };
        s.phase = Phase::Downloading;
        s.error = None;
        r
    };
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || install(&handle, &release))
        .await
        .unwrap_or_else(|_| Err("copy".into()));
    match result {
        Ok(()) => {
            set(&app, |s| s.phase = Phase::Restarting);
            relaunch(&app);
            Ok(())
        }
        Err(e) => {
            set(&app, |s| {
                s.phase = Phase::Idle;
                s.progress = None;
                s.error = Some(e.clone());
            });
            Err(e)
        }
    }
}

// Opens the app again once this process is gone, then quits.
fn relaunch(app: &AppHandle) {
    let Some(bundle) = bundle() else { return };
    let pid = std::process::id().to_string();
    let spawned = Command::new("/bin/sh")
        .args(["-c", "while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; /usr/bin/open \"$2\"", "sh", &pid])
        .arg(&bundle)
        .spawn();
    if let Err(e) = spawned {
        eprintln!("notching: the new version will not open by itself: {e}");
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        handle.exit(0);
    });
}

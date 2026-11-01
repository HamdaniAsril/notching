//! Screenshot's native side (design 1 Nov): capture through `screencapture`, the
//! `screenshots/` folder with its index, the clipboard, the Desktop, and the
//! `notchshot:` scheme that hands the pictures to the webviews.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSPasteboard, NSPasteboardTypePNG};
use objc2_foundation::NSData;
use serde::Serialize;
use tauri::http::Response;
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow};

use crate::app_core::CoreState;
use crate::geometry::{to_cg, Rect};
use crate::overlay::Overlays;
use crate::screens::current_screens;
use crate::shelf_drag::DragOwner;
use crate::shelf_service::DRAG_OUT;
use crate::shot::{capture_args, desktop_name, png_size, History, Kind, ShotItem, Target};

pub const MODULE_ID: &str = "screenshot";
pub const SCHEME: &str = "notchshot";
/// To one overlay: `{ phase: "taken", id }`; to every window: `{ phase: "gone", id }`.
pub const SHOT_EVENT: &str = "notching://shot";
/// To every window, with the whole list as `ShotDto[]`, after any change.
pub const SHOTS_EVENT: &str = "notching://shots";
/// Thumbnails for the list are this wide in pixels.
const THUMB_W: u32 = 320;
pub const ORIGINAL: &str = "original.png";
pub const EDITED: &str = "edited.png";
pub const THUMB: &str = "thumb.png";
/// The editor's shapes, as its page wrote them, to go on with later.
pub const EDITS: &str = "edits.json";
const INDEX: &str = "index.json";
// Under the app's cache folder: the copies drags out carry, one folder per drag.
const DRAG_DIR: &str = "shot-drag";
// A capture is written here first, and moved into its folder once it is accepted.
// No leading dot: screencapture refuses such a name, yet still exits 0.
const TMP_PREFIX: &str = "take-";
const SCREENCAPTURE: &str = "/usr/sbin/screencapture";
const SCREEN_RECORDING_PANE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

pub struct ShotState(pub Mutex<History>);

static DIR: OnceLock<PathBuf> = OnceLock::new();
static NEXT_TMP: AtomicU64 = AtomicU64::new(0);
static NEXT_DRAG: AtomicU64 = AtomicU64::new(0);

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum ShotEvent {
    Taken { id: u64 },
    Gone { id: u64 },
}

/// One screenshot for the pages, with its pictures as `notchshot:` URLs. `?v=` is
/// the item's rev, so an edit gives new URLs and no view keeps a stale picture.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShotDto {
    pub id: u64,
    pub kind: Kind,
    pub taken_ms: i64,
    pub width: u32,
    pub height: u32,
    pub saved: bool,
    pub image: String,
    pub thumb: String,
}

impl From<&ShotItem> for ShotDto {
    fn from(item: &ShotItem) -> Self {
        let url = |name: &str| format!("{SCHEME}://localhost/{}/{name}?v={}", item.id, item.rev);
        ShotDto {
            id: item.id,
            kind: item.kind,
            taken_ms: item.taken_ms,
            width: item.width,
            height: item.height,
            saved: item.saved,
            image: url("current.png"),
            thumb: url(THUMB),
        }
    }
}

/// `<app data>/screenshots`.
pub fn shots_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("screenshots")
}

/// The screenshots folder, once `start` has run.
pub fn dir() -> Option<&'static Path> {
    DIR.get().map(PathBuf::as_path)
}

pub fn folder(dir: &Path, id: u64) -> PathBuf {
    dir.join(id.to_string())
}

// The edit when there is one, else the original.
fn current_file(folder: &Path) -> PathBuf {
    let edited = folder.join(EDITED);
    if edited.is_file() { edited } else { folder.join(ORIGINAL) }
}

/// The current image: `edited.png` if it exists, otherwise `original.png`.
pub fn current_path(dir: &Path, item: &ShotItem) -> PathBuf {
    current_file(&folder(dir, item.id))
}

/// The original as the editor draws on it; it never changes, so it has no rev.
pub fn original_url(id: u64) -> String {
    format!("{SCHEME}://localhost/{id}/{ORIGINAL}")
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(404).body(Vec::new()).unwrap()
}

/// `/<id>/current.png`, `/<id>/thumb.png` or `/<id>/original.png` (the editor's),
/// nothing else. A thumbnail that could not be made falls back to the current
/// image. Webviews draw these into canvases and drag them, hence
/// Access-Control-Allow-Origin.
pub fn respond(dir: &Path, path: &str) -> Response<Vec<u8>> {
    let Some((id, name)) = path.strip_prefix('/').and_then(|p| p.split_once('/')) else {
        return not_found();
    };
    // Digits only, no leading zero: one id has one path.
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) || (id.len() > 1 && id.starts_with('0')) {
        return not_found();
    }
    let folder = dir.join(id);
    let file = match name {
        "current.png" => current_file(&folder),
        ORIGINAL => folder.join(ORIGINAL),
        THUMB if folder.join(THUMB).is_file() => folder.join(THUMB),
        THUMB => current_file(&folder),
        _ => return not_found(),
    };
    serve(&file, "image/png")
}

fn serve(file: &Path, kind: &str) -> Response<Vec<u8>> {
    match fs::read(file) {
        Ok(body) => Response::builder()
            .status(200)
            .header("Content-Type", kind)
            .header("Access-Control-Allow-Origin", "*")
            .body(body)
            .unwrap(),
        Err(_) => not_found(),
    }
}

/// `/wallpaper`: the desktop picture of the editor's screen, when it has one it can draw.
pub const WALLPAPER_PATH: &str = "/wallpaper";

pub fn respond_wallpaper(file: Option<&Path>) -> Response<Vec<u8>> {
    let Some(file) = file else { return not_found() };
    let ext = file.extension().map(|e| e.to_string_lossy().to_ascii_lowercase());
    let kind = match ext.as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("heic") => "image/heic",
        _ => return not_found(),
    };
    serve(file, kind)
}

/// The screen whose notch shows the result: the capture's, else the cursor's,
/// else the first that has one. Screens left out in Settings have no notch.
pub fn result_screen(capture: usize, has_notch: &[bool], cursor: usize) -> usize {
    let has = |i: usize| has_notch.get(i).copied().unwrap_or(false);
    [capture, cursor].into_iter().find(|&i| has(i)).or_else(|| has_notch.iter().position(|&n| n)).unwrap_or(capture)
}

/// A capture counts only when `screencapture` exited 0 and left a PNG with a size.
pub fn accept_capture(exit_ok: bool, bytes: Option<&[u8]>) -> Option<(u32, u32)> {
    if !exit_ok {
        return None;
    }
    png_size(bytes?).filter(|&(w, h)| w > 0 && h > 0)
}

/// What a change tells the views: `gone` for each removed id, then `taken`.
pub fn events(evicted: &[u64], taken: Option<u64>) -> Vec<ShotEvent> {
    let gone = evicted.iter().map(|&id| ShotEvent::Gone { id });
    gone.chain(taken.map(|id| ShotEvent::Taken { id })).collect()
}

fn remove_folder(dir: &Path, id: u64) {
    match fs::remove_dir_all(folder(dir, id)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => eprintln!("notching: screenshot {id} not removed: {e}"),
        _ => {}
    }
}

/// Written whole or not at all.
fn save_index(dir: &Path, history: &History) -> io::Result<()> {
    let tmp = dir.join(format!("{INDEX}.tmp"));
    fs::write(&tmp, history.to_index())?;
    fs::rename(&tmp, dir.join(INDEX))
}

pub fn save_index_logged(dir: &Path, history: &History) {
    if let Err(e) = save_index(dir, history) {
        eprintln!("notching: screenshot index not saved: {e}");
    }
}

/// Pushes an accepted capture and moves its file into `<id>/original.png`; the
/// folders pushed out go. Returns the new id and the evicted ids. When the file
/// cannot be moved nothing changes: the history (evictions included) is put back,
/// no folder is deleted, and the temp file is removed.
fn store(dir: &Path, history: &mut History, tmp: &Path, taken_ms: i64, kind: Kind, size: (u32, u32)) -> (Option<u64>, Vec<u64>) {
    let before = history.to_index();
    let (id, evicted) = history.push(taken_ms, kind, size.0, size.1);
    let target = folder(dir, id);
    // A run that stopped before saving its index may have left this id's folder.
    remove_folder(dir, id);
    if let Err(e) = fs::create_dir_all(&target).and_then(|_| fs::rename(tmp, target.join(ORIGINAL))) {
        eprintln!("notching: screenshot not stored: {e}");
        *history = History::from_index(&before);
        remove_folder(dir, id);
        let _ = fs::remove_file(tmp);
        return (None, Vec::new());
    }
    for old in &evicted {
        remove_folder(dir, *old);
    }
    save_index_logged(dir, history);
    (Some(id), evicted)
}

/// The history at start: the folder is made, items whose `original.png` is gone
/// are dropped, and captures a run left half done are removed.
fn tmp_path(dir: &Path, n: u64) -> PathBuf {
    dir.join(format!("{TMP_PREFIX}{n}.png"))
}

fn load(dir: &Path) -> History {
    if let Err(e) = fs::create_dir_all(dir) {
        eprintln!("notching: screenshots folder: {e}");
    }
    let json = fs::read_to_string(dir.join(INDEX)).unwrap_or_default();
    let mut history = History::from_index(&json);
    if history.retain_existing(|id| folder(dir, id).join(ORIGINAL).is_file()) {
        save_index_logged(dir, &history);
    }
    for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
        if entry.file_name().to_string_lossy().starts_with(TMP_PREFIX) {
            let _ = fs::remove_file(entry.path());
        }
    }
    history
}

/// Copies `src` into `folder` under the Desktop name for `local`, numbering
/// clashes. Never overwrites a file, even one that appears meanwhile.
fn save_copy(src: &Path, folder: &Path, local: chrono::NaiveDateTime) -> io::Result<PathBuf> {
    let bytes = fs::read(src)?;
    loop {
        let path = folder.join(desktop_name(local, |name| folder.join(name).exists()));
        match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(&bytes)?;
                return Ok(path);
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
}

/// Copies `src` into `cache/<n>/` under the Desktop name for `local` (no number:
/// the folder is this drag's alone), for drag `n` to carry. Earlier drags' files
/// stay, since where they were dropped (Titipan, a Mail draft) may read them
/// later; the whole folder goes at start and quit (`clear_drags`).
fn drag_copy(src: &Path, cache: &Path, n: u64, local: chrono::NaiveDateTime) -> io::Result<PathBuf> {
    let folder = cache.join(n.to_string());
    fs::create_dir_all(&folder)?;
    let path = folder.join(desktop_name(local, |_| false));
    fs::copy(src, &path)?;
    Ok(path)
}

/// Every drag's copy goes.
fn clear_drags(cache: &Path) {
    match fs::remove_dir_all(cache) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => eprintln!("notching: screenshot drag copies not removed: {e}"),
        _ => {}
    }
}

fn drag_cache(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_cache_dir().map(|c| c.join(DRAG_DIR)).map_err(|e| e.to_string())
}

/// A thumbnail `THUMB_W` px wide (or the picture itself when it is narrower), by `sips`.
pub fn write_thumb(src: &Path, dst: &Path, width: u32) -> io::Result<()> {
    if width <= THUMB_W {
        return fs::copy(src, dst).map(|_| ());
    }
    let status = Command::new("/usr/bin/sips")
        .args(["--resampleWidth", &THUMB_W.to_string()])
        .arg(src)
        .arg("--out")
        .arg(dst)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    if status.success() { Ok(()) } else { Err(io::Error::other(format!("sips exited with {status}"))) }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn local_time(ms: i64) -> chrono::NaiveDateTime {
    use chrono::TimeZone;
    chrono::Local.timestamp_millis_opt(ms).single().unwrap_or_else(chrono::Local::now).naive_local()
}

// Main thread only.
fn write_clipboard(png: &[u8]) -> bool {
    let pb = NSPasteboard::generalPasteboard();
    pb.clearContents();
    pb.setData_forType(Some(&NSData::with_bytes(png)), unsafe { NSPasteboardTypePNG })
}

/// Puts a PNG on the clipboard from any thread, and waits until it is there.
pub fn clipboard(app: &AppHandle, png: Vec<u8>) -> Result<(), String> {
    let written = if MainThreadMarker::new().is_some() {
        write_clipboard(&png)
    } else {
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(write_clipboard(&png));
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    };
    if written { Ok(()) } else { Err("the clipboard did not take the picture".into()) }
}

/// Every screen's frame in CG global points (origin top-left of the main screen),
/// in NSScreen order, as `capture_args` and `pick_screen` want them.
pub fn cg_frames(mtm: MainThreadMarker) -> Vec<Rect> {
    let screens = current_screens(mtm);
    let primary = screens.first().map_or(0.0, |s| s.frame.h);
    screens.iter().map(|s| to_cg(s.frame, primary)).collect()
}

fn list(app: &AppHandle) -> Vec<ShotDto> {
    app.state::<ShotState>().0.lock().unwrap().items().iter().map(ShotDto::from).collect()
}

/// The whole list to every window.
pub fn emit_shots(app: &AppHandle) {
    let _ = app.emit(SHOTS_EVENT, list(app));
}

/// Tells the views: `gone` to every window, `taken` to the one overlay, then the list.
fn announce(app: &AppHandle, evicted: &[u64], taken: Option<(u64, String)>) {
    let label = taken.as_ref().map(|(_, l)| l.clone());
    for event in events(evicted, taken.map(|(id, _)| id)) {
        let _ = match (event, &label) {
            (ShotEvent::Taken { .. }, Some(label)) => app.emit_to(EventTarget::webview_window(label), SHOT_EVENT, event),
            _ => app.emit(SHOT_EVENT, event),
        };
    }
    emit_shots(app);
}

// The overlay that shows a result captured on `screen`.
fn result_label(app: &AppHandle, mtm: MainThreadMarker, screen: usize) -> String {
    let screens = current_screens(mtm);
    let p = NSEvent::mouseLocation();
    let cursor = screens.iter().position(|s| s.frame.contains(p.x, p.y)).unwrap_or(0);
    let has_notch: Vec<bool> = {
        let overlays = app.state::<Overlays>();
        let overlays = overlays.0.lock().unwrap();
        (0..screens.len()).map(|i| overlays.contains_key(&format!("notch-{i}"))).collect()
    };
    format!("notch-{}", result_screen(screen, &has_notch, cursor))
}

/// The module is installed and switched on.
pub fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

/// Takes a screenshot on a thread of its own; `screen` is the NSScreen index the
/// capture belongs to, whose notch shows the result.
pub fn take(app: &AppHandle, target: Target, kind: Kind, screen: usize) {
    take_after(app, target, kind, screen, Duration::ZERO);
}

/// `take` once `delay` has passed, for a picker that must be off the screen first.
pub fn take_after(app: &AppHandle, target: Target, kind: Kind, screen: usize, delay: Duration) {
    let app = app.clone();
    std::thread::spawn(move || {
        if !delay.is_zero() {
            std::thread::sleep(delay);
        }
        take_now(&app, target, kind, screen);
    });
}

fn take_now(app: &AppHandle, target: Target, kind: Kind, screen: usize) {
    let Some(dir) = dir() else { return };
    if !enabled(app) {
        return;
    }
    if !screen_access() {
        refused(app);
        return;
    }
    let tmp = tmp_path(dir, NEXT_TMP.fetch_add(1, Ordering::Relaxed));
    let exit_ok = match Command::new(SCREENCAPTURE).args(capture_args(&target, &tmp)).status() {
        Ok(status) => status.success(),
        Err(e) => {
            eprintln!("notching: screencapture did not run: {e}");
            false
        }
    };
    let bytes = fs::read(&tmp).ok();
    let Some(size) = accept_capture(exit_ok, bytes.as_deref()) else {
        let _ = fs::remove_file(&tmp);
        eprintln!("notching: screenshot not taken (screencapture ok: {exit_ok})");
        return;
    };
    let (id, evicted) = {
        let state = app.state::<ShotState>();
        let mut history = state.0.lock().unwrap();
        store(dir, &mut history, &tmp, now_ms(), kind, size)
    };
    // Not stored: store() put everything back, so there is nothing to tell.
    let Some(id) = id else { return };
    let folder = folder(dir, id);
    if let Err(e) = write_thumb(&folder.join(ORIGINAL), &folder.join(THUMB), size.0) {
        eprintln!("notching: screenshot thumbnail: {e}");
    }
    let png = bytes.unwrap_or_default();
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let label = result_label(&handle, mtm, screen);
        if !write_clipboard(&png) {
            eprintln!("notching: the screenshot did not reach the clipboard");
        }
        announce(&handle, &evicted, Some((id, label)));
        // One line per capture, so a check on the Mac can be matched against the log.
        eprintln!("notching: screenshot {id} taken, {}×{}", size.0, size.1);
    });
}

/// No Screen Recording access: macOS is asked (it prompts once), and the notch says why.
pub fn refused(app: &AppHandle) {
    let _ = app.run_on_main_thread(|| {
        unsafe { CGRequestScreenCaptureAccess() };
    });
    let (title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.module_text(MODULE_ID, "notice.access.title"), core.module_text(MODULE_ID, "notice.access.detail"))
    };
    let title = title.unwrap_or_else(|| "Screenshot".into());
    if let Err(e) = crate::notify::post(app, MODULE_ID, "access", &title, &detail.unwrap_or_default()) {
        eprintln!("notching: the screen recording notice was not sent: {e}");
    }
}

/// Copies the current image to the Desktop and marks the item saved. Returns the path.
pub fn save(app: &AppHandle, id: u64) -> Result<String, String> {
    let dir = dir().ok_or("no screenshots folder")?;
    let item = app.state::<ShotState>().0.lock().unwrap().get(id).cloned().ok_or("gone")?;
    let desktop = app.path().desktop_dir().map_err(|e| e.to_string())?;
    let path = save_copy(&current_path(dir, &item), &desktop, local_time(item.taken_ms)).map_err(|e| e.to_string())?;
    {
        let state = app.state::<ShotState>();
        let mut history = state.0.lock().unwrap();
        if history.mark_saved(id) {
            save_index_logged(dir, &history);
        }
    }
    emit_shots(app);
    Ok(path.to_string_lossy().into_owned())
}

/// Switched off or uninstalled: the keys and the picker go, and the editor
/// closes once it has committed its edits.
pub fn module_gone(app: &AppHandle, id: &str) {
    if id == MODULE_ID {
        crate::shot_hotkey::unregister();
        crate::shot_pick::hide(app);
        crate::editor_window::module_gone(app);
    }
}

/// The app is quitting: drags' copies go.
pub fn quitting(app: &AppHandle) {
    if let Ok(cache) = drag_cache(app) {
        clear_drags(&cache);
    }
}

/// Uninstalling the module takes the history and its folder with it.
pub fn uninstalled(app: &AppHandle, id: &str) {
    let Some(dir) = dir().filter(|_| id == MODULE_ID) else { return };
    let ids: Vec<u64> = {
        let state = app.state::<ShotState>();
        let mut history = state.0.lock().unwrap();
        let ids = history.items().iter().map(|i| i.id).collect();
        history.retain_existing(|_| false);
        ids
    };
    if let Err(e) = fs::remove_dir_all(dir).and_then(|_| fs::create_dir_all(dir)) {
        eprintln!("notching: screenshots folder not emptied: {e}");
    }
    announce(app, &ids, None);
}

/// Loads the history and makes it the app's state, then takes the keys when the
/// module is on.
pub fn start(app: &AppHandle) {
    let history = match app.path().app_data_dir() {
        Ok(data) => {
            let dir = shots_dir(&data);
            let history = load(&dir);
            let _ = DIR.set(dir);
            history
        }
        Err(e) => {
            eprintln!("notching: no app data folder for screenshots: {e}");
            History::default()
        }
    };
    app.manage(ShotState(Mutex::new(history)));
    // Drags of an earlier run that ended without quitting.
    if let Ok(cache) = drag_cache(app) {
        clear_drags(&cache);
    }
    crate::shot_hotkey::start(app);
}

#[tauri::command]
pub fn shot_list(app: AppHandle) -> Vec<ShotDto> {
    list(&app)
}

/// "Layar" on the list page: the screen of the panel it was pressed in.
#[tauri::command]
pub fn shot_take_screen(app: AppHandle, window: WebviewWindow) {
    let index = app.state::<Overlays>().0.lock().unwrap().get(window.label()).map(|e| e.screen.index);
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let frames = cg_frames(mtm);
        let index = index.filter(|&i| i < frames.len()).unwrap_or(0);
        if let Some(&rect) = frames.get(index) {
            take(&handle, Target::Screen { rect }, Kind::Screen, index);
        }
    });
}

// Copy, Simpan, Hapus and a drag read and write pictures of several MB: async
// commands, off the main thread; the clipboard and the drag session still go to it.
#[tauri::command]
pub async fn shot_copy(app: AppHandle, id: u64) -> Result<(), String> {
    let dir = dir().ok_or("no screenshots folder")?;
    let item = app.state::<ShotState>().0.lock().unwrap().get(id).cloned().ok_or("gone")?;
    let png = fs::read(current_path(dir, &item)).map_err(|e| e.to_string())?;
    clipboard(&app, png)
}

#[tauri::command]
pub async fn shot_save(app: AppHandle, id: u64) -> Result<String, String> {
    save(&app, id)
}

/// Removes the screenshot from the history with its folder. A Desktop copy and
/// the clipboard stay as they are.
#[tauri::command]
pub async fn shot_delete(app: AppHandle, id: u64) -> Result<(), String> {
    let dir = dir().ok_or("no screenshots folder")?;
    {
        let state = app.state::<ShotState>();
        let mut history = state.0.lock().unwrap();
        if !history.remove(id) {
            return Err("gone".into());
        }
        save_index_logged(dir, &history);
    }
    remove_folder(dir, id);
    announce(&app, &[id], None);
    Ok(())
}

/// Drags the current image out of this overlay's panel as a PNG with the name
/// Simpan would give it (§5). The history keeps the screenshot.
#[tauri::command]
pub async fn shot_start_drag(app: AppHandle, window: WebviewWindow, id: u64) -> Result<(), String> {
    if DRAG_OUT.load(Ordering::SeqCst) {
        return Err("a drag is already running".into());
    }
    let dir = dir().ok_or("no screenshots folder")?;
    let item = app.state::<ShotState>().0.lock().unwrap().get(id).cloned().ok_or("gone")?;
    let n = NEXT_DRAG.fetch_add(1, Ordering::Relaxed);
    let file = drag_copy(&current_path(dir, &item), &drag_cache(&app)?, n, local_time(item.taken_ms)).map_err(|e| e.to_string())?;
    let preview = fs::read(folder(dir, id).join(THUMB)).ok();
    crate::shelf_drag::begin_on_main(&app, window.label(), vec![(file, preview)], DragOwner::Shot)
}

/// macOS lets Notching capture the screen right now. Never prompts.
pub fn screen_access() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[tauri::command]
pub fn shot_permission() -> bool {
    screen_access()
}

/// System Settings › Privacy & Security › Screen Recording.
#[tauri::command]
pub fn open_screen_recording_settings() {
    if let Err(e) = Command::new("/usr/bin/open").arg(SCREEN_RECORDING_PANE).spawn() {
        eprintln!("notching: System Settings did not open: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    // A 1 × 1 PNG; `wide` rewrites its IHDR size.
    const PNG: [u8; 67] = [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    fn wide(w: u32, h: u32) -> Vec<u8> {
        let mut png = PNG.to_vec();
        png[16..20].copy_from_slice(&w.to_be_bytes());
        png[20..24].copy_from_slice(&h.to_be_bytes());
        png
    }

    fn capture(dir: &Path, n: u32) -> PathBuf {
        let tmp = tmp_path(dir, n.into());
        std::fs::write(&tmp, wide(n, 10)).unwrap();
        tmp
    }

    #[test]
    fn capture_file_name_has_no_leading_dot() {
        // screencapture refuses a name that starts with a dot and still exits 0.
        let name = tmp_path(Path::new("/x"), 3).file_name().unwrap().to_string_lossy().into_owned();
        assert!(!name.starts_with('.'), "{name}");
        assert!(name.ends_with(".png"));
    }

    #[test]
    fn load_clears_leftover_capture_files_only() {
        let d = tempfile::tempdir().unwrap();
        let left = capture(d.path(), 7);
        std::fs::write(d.path().join("keep.txt"), b"x").unwrap();
        load(d.path());
        assert!(!left.exists());
        assert!(d.path().join("keep.txt").exists());
    }

    #[test]
    fn respond_serves_current_and_thumb_only() {
        let d = tempfile::tempdir().unwrap();
        let folder = d.path().join("3");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join(ORIGINAL), b"orig").unwrap();
        std::fs::write(folder.join(THUMB), b"thumb").unwrap();
        std::fs::write(d.path().join(INDEX), b"{}").unwrap();

        let cur = respond(d.path(), "/3/current.png");
        assert_eq!(cur.status(), 200);
        assert_eq!(cur.body(), b"orig");
        assert_eq!(cur.headers()["content-type"], "image/png");
        assert_eq!(cur.headers()["access-control-allow-origin"], "*");
        assert_eq!(respond(d.path(), "/3/thumb.png").body(), b"thumb");

        // An edit becomes the current image; the editor still gets the original.
        std::fs::write(folder.join(EDITED), b"edit").unwrap();
        assert_eq!(respond(d.path(), "/3/current.png").body(), b"edit");
        assert_eq!(respond(d.path(), "/3/original.png").body(), b"orig");
        assert_eq!(original_url(3), "notchshot://localhost/3/original.png");

        for p in [
            "/3/edited.png", "/3/edits.json", "/3/edited.new.png", "/3/../index.json", "/../3/current.png", "/9/current.png", "/x/current.png",
            "/3", "/", "/3/current.png/x", "/03/current.png", "/%33/current.png", "/index.json",
        ] {
            assert_eq!(respond(d.path(), p).status(), 404, "{p}");
        }
    }

    #[test]
    fn wallpaper_is_served_by_its_kind() {
        let d = tempfile::tempdir().unwrap();
        for (name, kind) in [("a.png", "image/png"), ("b.JPG", "image/jpeg"), ("c.jpeg", "image/jpeg"), ("d.heic", "image/heic")] {
            let file = d.path().join(name);
            std::fs::write(&file, name).unwrap();
            let r = respond_wallpaper(Some(&file));
            assert_eq!(r.status(), 200, "{name}");
            assert_eq!(r.headers()["content-type"], kind);
            assert_eq!(r.headers()["access-control-allow-origin"], "*");
            assert_eq!(r.body(), name.as_bytes());
        }
        std::fs::write(d.path().join("e.mov"), b"x").unwrap();
        assert_eq!(respond_wallpaper(Some(&d.path().join("e.mov"))).status(), 404);
        assert_eq!(respond_wallpaper(Some(&d.path().join("gone.png"))).status(), 404);
        assert_eq!(respond_wallpaper(None).status(), 404);
    }

    #[test]
    fn result_goes_to_capture_screen_or_cursor() {
        // The capture's screen has a notch: there.
        assert_eq!(result_screen(1, &[true, true], 0), 1);
        // It has none (not chosen in Settings): the cursor's screen.
        assert_eq!(result_screen(1, &[true, false, true], 2), 2);
        // Neither has one: the first screen that does.
        assert_eq!(result_screen(1, &[false, false, true], 1), 2);
        // A screen index past the list counts as having none.
        assert_eq!(result_screen(5, &[true, true], 1), 1);
    }

    #[test]
    fn failed_capture_changes_nothing() {
        // A non-zero exit, even with a picture written.
        assert_eq!(accept_capture(false, Some(&wide(10, 10))), None);
        // No file, an empty file, or something else than a PNG.
        assert_eq!(accept_capture(true, None), None);
        assert_eq!(accept_capture(true, Some(&[])), None);
        assert_eq!(accept_capture(true, Some(b"GIF89a not a png at all, long enough")), None);
        // A PNG of no size.
        assert_eq!(accept_capture(true, Some(&wide(0, 10))), None);
        assert_eq!(accept_capture(true, Some(&wide(2940, 1912))), Some((2940, 1912)));
    }

    #[test]
    fn refused_capture_stores_nothing() {
        // Without the permission there is no file; the history and the folder stay as they were.
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        let before = h.to_index();
        if let Some(size) = accept_capture(true, None) {
            store(d.path(), &mut h, &d.path().join("none.png"), 1, Kind::Screen, size);
        }
        assert_eq!(h.to_index(), before);
        assert!(!d.path().join(INDEX).exists());
    }

    #[test]
    fn evicted_item_closes_views() {
        assert_eq!(
            events(&[1, 2], Some(17)),
            [ShotEvent::Gone { id: 1 }, ShotEvent::Gone { id: 2 }, ShotEvent::Taken { id: 17 }]
        );
        assert_eq!(events(&[4], None), [ShotEvent::Gone { id: 4 }]);
        assert_eq!(events(&[], Some(3)), [ShotEvent::Taken { id: 3 }]);
        assert_eq!(serde_json::to_value(ShotEvent::Gone { id: 4 }).unwrap(), serde_json::json!({ "phase": "gone", "id": 4 }));
    }

    #[test]
    fn store_moves_the_capture_and_drops_evicted_folders() {
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        let mut ids = Vec::new();
        let mut gone = Vec::new();
        for n in 1..=16 {
            let tmp = capture(d.path(), n);
            let (id, evicted) = store(d.path(), &mut h, &tmp, n as i64, Kind::Area, (n, 10));
            let id = id.unwrap();
            assert!(!tmp.exists());
            assert_eq!(std::fs::read(d.path().join(id.to_string()).join(ORIGINAL)).unwrap(), wide(n, 10));
            ids.push(id);
            gone.extend(evicted);
        }
        assert_eq!(gone, vec![ids[0]]);
        assert!(!d.path().join(ids[0].to_string()).exists());
        // The index on disk is the history.
        let back = load(d.path());
        assert_eq!(back.items(), h.items());
        assert_eq!(back.items()[0].id, ids[15]);
    }

    #[test]
    fn store_clears_a_folder_left_by_a_run_that_stopped() {
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        // The id the next push gets, with an edit from before the crash still in it.
        let stale = d.path().join("1");
        std::fs::create_dir_all(&stale).unwrap();
        std::fs::write(stale.join(EDITED), b"old").unwrap();
        let (id, _) = store(d.path(), &mut h, &capture(d.path(), 5), 1, Kind::Screen, (5, 10));
        assert_eq!(id, Some(1));
        assert!(!stale.join(EDITED).exists());
        assert_eq!(current_path(d.path(), h.get(1).unwrap()), stale.join(ORIGINAL));
    }

    #[test]
    fn store_without_the_file_keeps_no_item() {
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        let (id, evicted) = store(d.path(), &mut h, &d.path().join("missing.png"), 1, Kind::Screen, (5, 10));
        assert_eq!((id, evicted), (None, vec![]));
        assert!(h.items().is_empty());
    }

    #[test]
    fn failed_store_on_a_full_history_evicts_nothing() {
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        for n in 1..=15 {
            store(d.path(), &mut h, &capture(d.path(), n), n as i64, Kind::Screen, (n, 10));
        }
        let before = h.to_index();
        let folders = |h: &History| h.items().iter().all(|i| d.path().join(i.id.to_string()).join(ORIGINAL).is_file());
        assert!(folders(&h));

        // No file at all.
        let (id, evicted) = store(d.path(), &mut h, &d.path().join("missing.png"), 99, Kind::Screen, (5, 10));
        assert_eq!((id, evicted), (None, vec![]));
        assert_eq!(h.to_index(), before);
        assert!(folders(&h));

        // A file that cannot be moved: the next id's folder is blocked by a plain file.
        std::fs::write(d.path().join("16"), b"in the way").unwrap();
        let tmp = capture(d.path(), 30);
        let (id, evicted) = store(d.path(), &mut h, &tmp, 99, Kind::Screen, (30, 10));
        assert_eq!((id, evicted), (None, vec![]));
        assert_eq!(h.to_index(), before);
        assert!(folders(&h));
        assert!(!tmp.exists(), "the failed capture's temp file stays behind");
        // The index on disk is untouched too.
        assert_eq!(load(d.path()).to_index(), before);
    }

    #[test]
    fn load_drops_items_without_original_and_temp_files() {
        let d = tempfile::tempdir().unwrap();
        let mut h = load(d.path());
        let (a, _) = store(d.path(), &mut h, &capture(d.path(), 1), 1, Kind::Screen, (1, 10));
        let (b, _) = store(d.path(), &mut h, &capture(d.path(), 2), 2, Kind::Window, (2, 10));
        std::fs::remove_file(d.path().join(a.unwrap().to_string()).join(ORIGINAL)).unwrap();
        let left = capture(d.path(), 9);
        let back = load(d.path());
        let ids: Vec<u64> = back.items().iter().map(|i| i.id).collect();
        assert_eq!(ids, vec![b.unwrap()]);
        assert!(!left.exists());
        // The cleaned index is written back.
        assert_eq!(load(d.path()).items().len(), 1);
    }

    #[test]
    fn load_makes_the_folder() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("screenshots");
        assert!(load(&dir).items().is_empty());
        assert!(dir.is_dir());
    }

    #[test]
    fn save_copy_never_overwrites() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("cur.png");
        std::fs::write(&src, b"new").unwrap();
        let desk = d.path().join("Desktop");
        std::fs::create_dir_all(&desk).unwrap();
        let t = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap().and_hms_opt(14, 2, 5).unwrap();
        let first = desk.join("Screenshot 2026-11-01 14.02.05.png");
        std::fs::write(&first, b"mine").unwrap();
        let saved = save_copy(&src, &desk, t).unwrap();
        assert_eq!(saved, desk.join("Screenshot 2026-11-01 14.02.05 (2).png"));
        assert_eq!(std::fs::read(&saved).unwrap(), b"new");
        assert_eq!(std::fs::read(&first).unwrap(), b"mine");
        assert_eq!(save_copy(&src, &desk, t).unwrap(), desk.join("Screenshot 2026-11-01 14.02.05 (3).png"));
    }

    #[test]
    fn each_drag_has_its_own_file_with_the_desktop_name() {
        let d = tempfile::tempdir().unwrap();
        let src = d.path().join("edited.png");
        std::fs::write(&src, b"edit").unwrap();
        let cache = d.path().join("shot-drag");
        let t = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap().and_hms_opt(14, 2, 5).unwrap();
        let first = cache.join("0").join("Screenshot 2026-11-01 14.02.05.png");
        assert_eq!(drag_copy(&src, &cache, 0, t).unwrap(), first);
        assert_eq!(std::fs::read(&first).unwrap(), b"edit");
        // The same screenshot dragged again after an edit: a new file, the first
        // one (dropped somewhere that may read it later) untouched.
        std::fs::write(&src, b"edit 2").unwrap();
        let second = drag_copy(&src, &cache, 1, t).unwrap();
        assert_eq!(second, cache.join("1").join("Screenshot 2026-11-01 14.02.05.png"));
        assert_eq!(std::fs::read(&second).unwrap(), b"edit 2");
        assert_eq!(std::fs::read(&first).unwrap(), b"edit");
        // Start and quit take them all; an absent folder is fine.
        clear_drags(&cache);
        assert!(!cache.exists());
        clear_drags(&cache);
    }

    #[test]
    fn dto_points_at_notchshot_with_the_rev() {
        let mut h = History::default();
        let (id, _) = h.push(7, Kind::Window, 300, 200);
        h.mark_edited(id, 320, 210);
        let v = serde_json::to_value(ShotDto::from(h.get(id).unwrap())).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "id": id, "kind": "window", "takenMs": 7, "width": 320, "height": 210, "saved": false,
                "image": format!("notchshot://localhost/{id}/current.png?v=1"),
                "thumb": format!("notchshot://localhost/{id}/thumb.png?v=1"),
            })
        );
    }
}

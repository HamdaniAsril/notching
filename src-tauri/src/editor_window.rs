//! Screenshot's editor (design 1 Nov §7): one normal window, not a panel, opened
//! by a click on a screenshot in the notch. The page draws; the PNG it makes and
//! its edits come back here for the folder, the clipboard and the Desktop.

use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSScreen, NSWindow, NSWorkspace};
use objc2_foundation::{NSPoint, NSRect, NSSize};
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::webview::PageLoadEvent;
use tauri::window::Color;
use tauri::{
    ActivationPolicy, AppHandle, Emitter, EventTarget, Manager, TitleBarStyle, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::geometry::{centered_origin, Rect};
use crate::overlay::Overlays;
use crate::settings_window::SETTINGS_LABEL;
use crate::shot::{png_size, History, ShotItem};
use crate::shot_service::{self, ShotState, EDITED, EDITS, ORIGINAL, THUMB};

pub const EDITOR_LABEL: &str = "editor";
/// To the editor: commit as `keep`, then call `editor_close`.
pub const CLOSE_EVENT: &str = "notching://editor-close";
/// Served by `notchshot:` while the editor shows a screen whose wallpaper is a picture.
pub const WALLPAPER_URL: &str = "notchshot://localhost/wallpaper";
const BACKGROUND: Color = Color(0x0b, 0x0b, 0x0c, 0xff);
const MIN_SIZE: (f64, f64) = (640.0, 480.0);
/// Around the picture: the title bar, the bottom bar and the tools on the left.
const CHROME_TOP: f64 = 64.0;
const CHROME_BOTTOM: f64 = 56.0;
const CHROME_LEFT: f64 = 64.0;
/// Of the screen's visible frame, at most.
const MAX_SHARE: f64 = 0.8;
/// A page that has not committed and closed by then is closed without its edits.
const CLOSE_WAIT: Duration = Duration::from_secs(5);
/// `editor_commit` takes the edits (UTF-8) and then the PNG as its raw body; these say the rest.
const ID_HEADER: &str = "notching-id";
const ACTION_HEADER: &str = "notching-action";
const EDITS_HEADER: &str = "notching-edits-length";
// Written beside their place first, then moved in. Names a `notchshot:` request never matches.
const NEW_EDITED: &str = "edited.new.png";
const NEW_THUMB: &str = "thumb.new.png";
const NEW_EDITS: &str = "edits.new.json";
const WALLPAPER_KINDS: [&str; 4] = ["png", "jpg", "jpeg", "heic"];

// Two clicks close together must not both build the window. The main thread never takes it.
static OPENING: Mutex<()> = Mutex::new(());
static EDITOR: Mutex<Editor> = Mutex::new(Editor::new());
// The picture `notchshot://localhost/wallpaper` serves, set by `editor_doc`.
static WALLPAPER: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Where a screenshot opens: its screen and the window's frame (Cocoa points).
#[derive(Clone, Copy, Debug, PartialEq)]
struct Open {
    id: u64,
    screen: usize,
    frame: Rect,
    size: (u32, u32),
}

struct Editor {
    /// The screenshot shown, and the screen it opened on.
    id: Option<u64>,
    screen: usize,
    /// Opened while another was shown: it replaces that one once its edits are committed.
    next: Option<Open>,
    /// A close was asked under this number and the page has not answered yet.
    waiting: Option<u64>,
    asked: u64,
    /// The app quits once the window is gone.
    quitting: bool,
}

impl Editor {
    const fn new() -> Editor {
        Editor { id: None, screen: 0, next: None, waiting: None, asked: 0, quitting: false }
    }
}

fn editor() -> std::sync::MutexGuard<'static, Editor> {
    EDITOR.lock().unwrap_or_else(|e| e.into_inner())
}

/// Same shape as EditorDoc in src/editor/view.ts. `width` × `height` is the original's size.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EditorDoc {
    pub id: u64,
    pub width: u32,
    pub height: u32,
    pub original: String,
    pub edits: Option<String>,
    pub wallpaper: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Action {
    Copy,
    Save,
    Keep,
}

impl Action {
    fn parse(s: &str) -> Option<Action> {
        match s {
            "copy" => Some(Action::Copy),
            "save" => Some(Action::Save),
            "keep" => Some(Action::Keep),
            _ => None,
        }
    }
}

/// The window for an `image` of pixels shown at `scale` on a screen whose visible
/// frame is `visible` points: the picture at 1:1 plus the chrome, shrunk with its
/// aspect kept to at most 80% of the screen, and never under 640 × 480.
pub fn fit_size(image: (u32, u32), scale: f64, visible: (f64, f64)) -> (f64, f64) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let (w, h) = ((image.0 as f64 / scale).max(1.0), (image.1 as f64 / scale).max(1.0));
    let (chrome_w, chrome_h) = (CHROME_LEFT, CHROME_TOP + CHROME_BOTTOM);
    let room = ((visible.0 * MAX_SHARE - chrome_w).max(1.0), (visible.1 * MAX_SHARE - chrome_h).max(1.0));
    let k = (room.0 / w).min(room.1 / h).min(1.0);
    ((w * k + chrome_w).max(MIN_SIZE.0), (h * k + chrome_h).max(MIN_SIZE.1))
}

/// The app keeps its Dock icon while the settings window or the editor exists.
pub fn keep_regular(settings_open: bool, editor_open: bool) -> bool {
    settings_open || editor_open
}

/// The screenshot a commit writes into; one that left the history gets nothing.
pub fn commit_target(history: &History, id: u64) -> Result<ShotItem, String> {
    history.get(id).cloned().ok_or_else(|| "gone".into())
}

/// A commit's raw body: `edits_len` bytes of edits, then the PNG (none when the body ends there).
fn split_body(body: &[u8], edits_len: usize) -> Result<(String, Option<&[u8]>), String> {
    if edits_len > body.len() {
        return Err("the edits run past the body".into());
    }
    let (edits, png) = body.split_at(edits_len);
    let edits = std::str::from_utf8(edits).map_err(|e| e.to_string())?;
    Ok((edits.to_owned(), (!png.is_empty()).then_some(png)))
}

/// A wallpaper the page can draw: a regular file of a picture kind. Not a moving one.
fn is_wallpaper_file(path: &Path) -> bool {
    let kind = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase());
    kind.is_some_and(|k| WALLPAPER_KINDS.contains(&k.as_str())) && path.is_file()
}

fn title(size: (u32, u32)) -> String {
    format!("Screenshot · {} × {}", size.0, size.1)
}

// Width and height from the PNG's header, without reading the rest.
fn file_size(path: &Path) -> Option<(u32, u32)> {
    let mut head = [0u8; 24];
    fs::File::open(path).and_then(|mut f| f.read_exact(&mut head)).ok()?;
    png_size(&head)
}

// The original's size: the item's own is the edit's once it has one.
fn original_size(dir: &Path, item: &ShotItem) -> (u32, u32) {
    file_size(&shot_service::folder(dir, item.id).join(ORIGINAL)).unwrap_or((item.width, item.height))
}

/// What a commit made ready, before it is moved in.
enum Staged {
    Edited { size: (u32, u32), thumb: bool },
    Unedited { size: (u32, u32), thumb: bool },
    Same,
}

fn stage(folder: &Path, item: &ShotItem, edits: &str, png: Option<&[u8]>) -> Result<(Staged, bool), String> {
    let thumb = |src: &Path, width: u32| match shot_service::write_thumb(src, &folder.join(NEW_THUMB), width) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("notching: screenshot {} thumbnail: {e}", item.id);
            false
        }
    };
    let staged = match png {
        Some(png) => {
            let size = png_size(png).filter(|&(w, h)| w > 0 && h > 0).ok_or("not a png")?;
            fs::write(folder.join(NEW_EDITED), png).map_err(|e| e.to_string())?;
            Staged::Edited { size, thumb: thumb(&folder.join(NEW_EDITED), size.0) }
        }
        None if item.edited || folder.join(EDITED).exists() => {
            let original = folder.join(ORIGINAL);
            let size = file_size(&original).ok_or("no original")?;
            Staged::Unedited { size, thumb: thumb(&original, size.0) }
        }
        None => Staged::Same,
    };
    let has_edits = !edits.is_empty();
    if has_edits {
        fs::write(folder.join(NEW_EDITS), edits).map_err(|e| e.to_string())?;
    }
    Ok((staged, has_edits))
}

fn discard(folder: &Path) {
    for name in [NEW_EDITED, NEW_THUMB, NEW_EDITS] {
        let _ = fs::remove_file(folder.join(name));
    }
}

fn remove(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Writes what the editor hands back into the screenshot's folder. A `png` makes
/// `edited.png` and a new thumbnail and marks the item edited; none takes it back
/// to its original. The files are written beside their place outside the lock (a
/// picture of several MB and a `sips` run), then moved in under it, so a
/// screenshot deleted meanwhile gets nothing. Ok(true) when the views must hear.
fn write_commit(dir: &Path, history: &Mutex<History>, id: u64, edits: &str, png: Option<&[u8]>) -> Result<bool, String> {
    let item = commit_target(&history.lock().unwrap(), id)?;
    let folder = shot_service::folder(dir, id);
    let (staged, has_edits) = match stage(&folder, &item, edits, png) {
        Ok(staged) => staged,
        Err(e) => {
            discard(&folder);
            // Its folder went with it while the files were being written.
            commit_target(&history.lock().unwrap(), id)?;
            return Err(e);
        }
    };
    let mut history = history.lock().unwrap();
    if commit_target(&history, id).is_err() {
        discard(&folder);
        return Err("gone".into());
    }
    let placed = (|| -> io::Result<bool> {
        let changed = match staged {
            Staged::Edited { size, thumb } => {
                fs::rename(folder.join(NEW_EDITED), folder.join(EDITED))?;
                place_thumb(&folder, thumb)?;
                history.mark_edited(id, size.0, size.1)
            }
            Staged::Unedited { size, thumb } => {
                place_thumb(&folder, thumb)?;
                remove(&folder.join(EDITED))?;
                history.mark_unedited(id, size.0, size.1);
                true
            }
            Staged::Same => false,
        };
        if has_edits {
            fs::rename(folder.join(NEW_EDITS), folder.join(EDITS))?;
        } else {
            remove(&folder.join(EDITS))?;
        }
        Ok(changed)
    })();
    match placed {
        Ok(changed) => {
            if changed {
                shot_service::save_index_logged(dir, &history);
            }
            Ok(changed)
        }
        Err(e) => {
            discard(&folder);
            Err(e.to_string())
        }
    }
}

// A thumbnail that could not be made goes, so `notchshot:` falls back to the current image.
fn place_thumb(folder: &Path, made: bool) -> io::Result<()> {
    if made { fs::rename(folder.join(NEW_THUMB), folder.join(THUMB)) } else { remove(&folder.join(THUMB)) }
}

/// Runs `f` on the main thread and waits for it.
fn on_main<T: Send + 'static>(app: &AppHandle, f: impl FnOnce(MainThreadMarker) -> T + Send + 'static) -> Result<T, String> {
    if let Some(mtm) = MainThreadMarker::new() {
        return Ok(f(mtm));
    }
    let (tx, rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        if let Some(mtm) = MainThreadMarker::new() {
            let _ = tx.send(f(mtm));
        }
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())
}

/// The screen (`index`, else the cursor's) and the window frame that fits `size` on it.
fn placement(mtm: MainThreadMarker, index: Option<usize>, id: u64, size: (u32, u32)) -> Option<Open> {
    let screens = NSScreen::screens(mtm);
    let p = NSEvent::mouseLocation();
    let at_cursor = screens.iter().position(|s| {
        let f = s.frame();
        Rect { x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height }.contains(p.x, p.y)
    });
    let screen = index.filter(|&i| i < screens.len()).or(at_cursor).unwrap_or(0);
    let ns = screens.iter().nth(screen)?;
    let v = ns.visibleFrame();
    let visible = Rect { x: v.origin.x, y: v.origin.y, w: v.size.width, h: v.size.height };
    let (w, h) = fit_size(size, ns.backingScaleFactor(), (visible.w, visible.h));
    let (x, y) = centered_origin(visible, w, h);
    Some(Open { id, screen, frame: Rect { x, y, w, h }, size })
}

// The whole frame at once; the title bar lies over the page, so it is the page's size too.
fn set_frame(app: &AppHandle, window: &WebviewWindow, frame: Rect) {
    let target = window.clone();
    let _ = app.run_on_main_thread(move || {
        let Ok(ptr) = target.ns_window() else { return };
        // SAFETY: Tauri hands out its own live NSWindow, and this runs on the main thread.
        let ns_window = unsafe { &*(ptr as *const NSWindow) };
        let rect = NSRect::new(NSPoint::new(frame.x, frame.y), NSSize::new(frame.w, frame.h));
        ns_window.setFrame_display(rect, true);
    });
}

/// The desktop picture of the editor's screen, when it is one the page can draw.
fn wallpaper(mtm: MainThreadMarker, screen: usize) -> Option<PathBuf> {
    let screens = NSScreen::screens(mtm);
    let ns = screens.iter().nth(screen)?;
    let url = NSWorkspace::sharedWorkspace().desktopImageURLForScreen(&ns)?;
    let path = PathBuf::from(url.path()?.to_string());
    is_wallpaper_file(&path).then_some(path)
}

/// The file behind `WALLPAPER_URL`, for the `notchshot:` responder.
pub fn wallpaper_file() -> Option<PathBuf> {
    WALLPAPER.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Asks the page to commit its edits (`keep`) and close: the red button, the
/// module switched off, another screenshot opened, the app quitting. A page that
/// has not answered after CLOSE_WAIT is closed without them.
pub fn request_close(app: &AppHandle) {
    if app.get_webview_window(EDITOR_LABEL).is_none() {
        return;
    }
    let asked = {
        let mut e = editor();
        e.asked += 1;
        e.waiting = Some(e.asked);
        e.asked
    };
    let _ = app.emit_to(EventTarget::webview_window(EDITOR_LABEL), CLOSE_EVENT, ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(CLOSE_WAIT);
        if editor().waiting == Some(asked) {
            eprintln!("notching: the editor did not answer its close in time; closed without its edits");
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || finish(&handle));
        }
    });
}

/// The app quits once the editor has committed and gone. False when there is no
/// editor, so the caller quits right away.
pub fn quit(app: &AppHandle) -> bool {
    if app.get_webview_window(EDITOR_LABEL).is_none() {
        return false;
    }
    editor().quitting = true;
    request_close(app);
    true
}

// The page committed (or never will): the screenshot opened meanwhile takes its
// place, else the window goes.
fn finish(app: &AppHandle) {
    let Some(window) = app.get_webview_window(EDITOR_LABEL) else { return };
    let next = {
        let mut e = editor();
        e.waiting = None;
        let next = if e.quitting { None } else { e.next.take() };
        if let Some(open) = next {
            e.id = Some(open.id);
            e.screen = open.screen;
        }
        next
    };
    match next {
        Some(open) => {
            let _ = window.set_title(&title(open.size));
            set_frame(app, &window, open.frame);
            if let Err(e) = window.reload() {
                eprintln!("notching: the editor did not reload: {e}");
            }
        }
        None => {
            let _ = window.destroy();
        }
    }
}

/// Opens screenshot `id` in the editor, on the screen of the panel it was clicked
/// in. With the editor open on another one, that one commits its edits first and
/// this one takes its place. Async: creating a window from a synchronous command
/// can deadlock.
#[tauri::command]
pub async fn open_editor(app: AppHandle, window: WebviewWindow, id: u64) -> Result<(), String> {
    let _opening = OPENING.lock().unwrap_or_else(|e| e.into_inner());
    let dir = shot_service::dir().ok_or("no screenshots folder")?;
    let item = commit_target(&app.state::<ShotState>().0.lock().unwrap(), id)?;
    let size = original_size(dir, &item);
    let index = app.state::<Overlays>().0.lock().unwrap().get(window.label()).map(|e| e.screen.index);
    let open = on_main(&app, move |mtm| placement(mtm, index, id, size))?.ok_or("no screen")?;
    let _ = app.set_activation_policy(ActivationPolicy::Regular);

    if let Some(existing) = app.get_webview_window(EDITOR_LABEL) {
        let shown = {
            let mut e = editor();
            // Shown and staying: no other one waits, and no close is under way.
            let shown = e.id == Some(id) && e.next.is_none() && e.waiting.is_none();
            if !shown {
                e.next = Some(open);
            }
            shown
        };
        if !shown {
            request_close(&app);
        }
        let _ = existing.unminimize();
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }

    *editor() = Editor { id: Some(id), screen: open.screen, ..Editor::new() };
    let builder = WebviewWindowBuilder::new(&app, EDITOR_LABEL, WebviewUrl::App("editor.html".into()))
        .title(title(size))
        .inner_size(open.frame.w, open.frame.h)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .background_color(BACKGROUND)
        .visible(false)
        .on_page_load(|w, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = w.show();
                let _ = w.set_focus();
            }
        });
    let editor_window = match builder.build() {
        Ok(win) => win,
        Err(e) => {
            let editor_open = app.get_webview_window(EDITOR_LABEL).is_some();
            if !editor_open {
                *editor() = Editor::new();
            }
            if !keep_regular(app.get_webview_window(SETTINGS_LABEL).is_some(), editor_open) {
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }
            return Err(e.to_string());
        }
    };

    let handle = app.clone();
    editor_window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            request_close(&handle);
        }
        WindowEvent::Destroyed => {
            let quitting = std::mem::replace(&mut *editor(), Editor::new()).quitting;
            *WALLPAPER.lock().unwrap_or_else(|e| e.into_inner()) = None;
            if quitting {
                handle.exit(0);
            } else if !keep_regular(handle.get_webview_window(SETTINGS_LABEL).is_some(), false) {
                let _ = handle.set_activation_policy(ActivationPolicy::Accessory);
            }
        }
        _ => {}
    });
    set_frame(&app, &editor_window, open.frame);
    Ok(())
}

/// What the page shows: the screenshot's original, its edits so far and the
/// screen's wallpaper. None once the screenshot has left the history.
#[tauri::command]
pub fn editor_doc(app: AppHandle) -> Option<EditorDoc> {
    let (id, screen) = {
        let e = editor();
        (e.id?, e.screen)
    };
    let dir = shot_service::dir()?;
    let item = app.state::<ShotState>().0.lock().unwrap().get(id).cloned()?;
    let (width, height) = original_size(dir, &item);
    let wallpaper = on_main(&app, move |mtm| wallpaper(mtm, screen)).ok().flatten();
    let url = wallpaper.as_ref().map(|_| WALLPAPER_URL.to_string());
    *WALLPAPER.lock().unwrap_or_else(|e| e.into_inner()) = wallpaper;
    Some(EditorDoc {
        id,
        width,
        height,
        original: shot_service::original_url(id),
        edits: fs::read_to_string(shot_service::folder(dir, id).join(EDITS)).ok(),
        wallpaper: url,
    })
}

/// Takes the page's PNG and edits as the raw body (edits first, then the PNG; an
/// empty PNG part means unedited) with the id, the action and the edits' length in
/// headers, so a picture of several MB never goes through JSON. Writes them, then
/// copies (`copy`), saves to the Desktop and returns the path (`save`), or only
/// keeps them (`keep`). Async, off the main thread: the files are large.
#[tauri::command]
pub async fn editor_commit(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok());
    let id = header(ID_HEADER).and_then(|v| v.parse::<u64>().ok()).ok_or("no id")?;
    let action = header(ACTION_HEADER).and_then(Action::parse).ok_or("no action")?;
    let edits_len = header(EDITS_HEADER).and_then(|v| v.parse::<usize>().ok()).ok_or("no edits length")?;
    let InvokeBody::Raw(body) = request.body() else {
        return Err("the commit comes as raw bytes".into());
    };
    let (edits, png) = split_body(body, edits_len)?;
    let dir = shot_service::dir().ok_or("no screenshots folder")?;
    if write_commit(dir, &app.state::<ShotState>().0, id, &edits, png)? {
        shot_service::emit_shots(&app);
    }
    match action {
        Action::Keep => Ok(None),
        Action::Copy => {
            let png = match png {
                Some(png) => png.to_vec(),
                None => {
                    let item = commit_target(&app.state::<ShotState>().0.lock().unwrap(), id)?;
                    fs::read(shot_service::current_path(dir, &item)).map_err(|e| e.to_string())?
                }
            };
            shot_service::clipboard(&app, png).map(|_| None)
        }
        Action::Save => shot_service::save(&app, id).map(Some),
    }
}

/// The page has committed: the window goes, or shows the screenshot opened meanwhile.
#[tauri::command]
pub fn editor_close(app: AppHandle) {
    finish(&app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shot::Kind;

    // A 1 × 1 PNG; `png(w, h)` rewrites its IHDR size.
    const PNG: [u8; 67] = [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
        0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut png = PNG.to_vec();
        png[16..20].copy_from_slice(&w.to_be_bytes());
        png[20..24].copy_from_slice(&h.to_be_bytes());
        png
    }

    // One screenshot of 100 × 50 in a folder of its own. Narrower than a thumbnail,
    // so thumbnails are plain copies and no `sips` runs.
    fn shot(dir: &Path) -> (Mutex<History>, u64) {
        let mut h = History::default();
        let (id, _) = h.push(1, Kind::Area, 100, 50);
        let folder = shot_service::folder(dir, id);
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join(ORIGINAL), png(100, 50)).unwrap();
        fs::write(folder.join(THUMB), png(100, 50)).unwrap();
        (Mutex::new(h), id)
    }

    fn names(folder: &Path) -> Vec<String> {
        let mut n: Vec<String> = fs::read_dir(folder).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into()).collect();
        n.sort();
        n
    }

    #[test]
    fn fit_size_caps_at_80_percent_and_keeps_aspect() {
        // 5880 × 3436 px at 2× is 2940 × 1718 pt: too big for 1512 × 949, so the
        // picture shrinks into 80% of it with the chrome counted.
        let (w, h) = fit_size((5880, 3436), 2.0, (1512.0, 949.0));
        assert!(w <= 1512.0 * 0.8 + 1e-9 && h <= 949.0 * 0.8 + 1e-9, "{w} × {h}");
        let (pw, ph) = (w - CHROME_LEFT, h - CHROME_TOP - CHROME_BOTTOM);
        assert!((pw / ph - 5880.0 / 3436.0).abs() < 1e-9, "aspect {}", pw / ph);
        // The tighter side reaches its cap.
        assert!((h - 949.0 * 0.8).abs() < 1e-9 || (w - 1512.0 * 0.8).abs() < 1e-9);
        // A tall one is held by the height.
        let (w, h) = fit_size((4000, 4400), 2.0, (1512.0, 949.0));
        assert!((h - 949.0 * 0.8).abs() < 1e-9);
        assert!(w > MIN_SIZE.0 && w < 1512.0 * 0.8, "{w}");
        assert!(((w - CHROME_LEFT) / (h - CHROME_TOP - CHROME_BOTTOM) - 4000.0 / 4400.0).abs() < 1e-9);
        // One that fits stays at 1:1 in points, plus the chrome.
        assert_eq!(fit_size((1600, 1000), 2.0, (1512.0, 949.0)), (800.0 + 64.0, 500.0 + 120.0));
        assert_eq!(fit_size((900, 700), 1.0, (1920.0, 1055.0)), (964.0, 820.0));
    }

    #[test]
    fn fit_size_has_a_minimum() {
        assert_eq!(fit_size((200, 100), 2.0, (1512.0, 949.0)), (640.0, 480.0));
        // Each side on its own.
        assert_eq!(fit_size((1400, 100), 1.0, (1920.0, 1055.0)), (1400.0 + 64.0, 480.0));
        assert_eq!(fit_size((100, 700), 1.0, (1920.0, 1055.0)), (640.0, 820.0));
    }

    #[test]
    fn dock_icon_goes_only_when_no_window_left() {
        assert!(keep_regular(true, true));
        assert!(keep_regular(true, false));
        assert!(keep_regular(false, true));
        assert!(!keep_regular(false, false));
    }

    #[test]
    fn commit_for_missing_item_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let (h, id) = shot(d.path());
        assert_eq!(commit_target(&h.lock().unwrap(), id).unwrap().id, id);
        assert_eq!(commit_target(&h.lock().unwrap(), 99), Err("gone".to_string()));

        // Deleted (or pushed out) while the editor showed it: nothing is written,
        // not even a folder for it.
        let before = names(&shot_service::folder(d.path(), id));
        assert_eq!(write_commit(d.path(), &h, 99, "{}", Some(&png(120, 60))), Err("gone".into()));
        assert!(!shot_service::folder(d.path(), 99).exists());
        assert!(h.lock().unwrap().remove(id));
        assert_eq!(write_commit(d.path(), &h, id, "{}", Some(&png(120, 60))), Err("gone".into()));
        assert_eq!(names(&shot_service::folder(d.path(), id)), before);
        assert!(!d.path().join("index.json").exists());
    }

    #[test]
    fn commit_with_png_writes_the_edit_and_bumps_rev() {
        let d = tempfile::tempdir().unwrap();
        let (h, id) = shot(d.path());
        let folder = shot_service::folder(d.path(), id);
        h.lock().unwrap().mark_saved(id);
        assert_eq!(write_commit(d.path(), &h, id, r#"{"shapes":[]}"#, Some(&png(140, 90))), Ok(true));
        assert_eq!(fs::read(folder.join(EDITED)).unwrap(), png(140, 90));
        assert_eq!(fs::read(folder.join(THUMB)).unwrap(), png(140, 90));
        assert_eq!(fs::read_to_string(folder.join(EDITS)).unwrap(), r#"{"shapes":[]}"#);
        assert_eq!(names(&folder), [EDITED, EDITS, ORIGINAL, THUMB]);
        {
            let h = h.lock().unwrap();
            let it = h.get(id).unwrap();
            assert!(it.edited && !it.saved);
            assert_eq!((it.width, it.height, it.rev), (140, 90, 1));
            // The index on disk is the history.
            assert_eq!(fs::read_to_string(d.path().join("index.json")).unwrap(), h.to_index());
        }
        // Every commit with a picture is a new rev.
        assert_eq!(write_commit(d.path(), &h, id, r#"{"shapes":[1]}"#, Some(&png(140, 90))), Ok(true));
        assert_eq!(h.lock().unwrap().get(id).unwrap().rev, 2);
        assert_eq!(fs::read_to_string(folder.join(EDITS)).unwrap(), r#"{"shapes":[1]}"#);
    }

    #[test]
    fn commit_without_png_goes_back_to_the_original() {
        let d = tempfile::tempdir().unwrap();
        let (h, id) = shot(d.path());
        let folder = shot_service::folder(d.path(), id);
        // Unedited and still unedited: nothing changes, nothing to announce.
        assert_eq!(write_commit(d.path(), &h, id, "", None), Ok(false));
        assert_eq!(names(&folder), [ORIGINAL, THUMB]);
        assert_eq!(h.lock().unwrap().get(id).unwrap().rev, 0);

        write_commit(d.path(), &h, id, "{}", Some(&png(140, 90))).unwrap();
        assert_eq!(write_commit(d.path(), &h, id, "", None), Ok(true));
        assert_eq!(names(&folder), [ORIGINAL, THUMB]);
        assert_eq!(fs::read(folder.join(THUMB)).unwrap(), png(100, 50));
        let h = h.lock().unwrap();
        let it = h.get(id).unwrap();
        assert!(!it.edited);
        assert_eq!((it.width, it.height, it.rev), (100, 50, 2));
        assert_eq!(fs::read_to_string(d.path().join("index.json")).unwrap(), h.to_index());
    }

    #[test]
    fn commit_of_something_else_than_a_png_writes_nothing() {
        let d = tempfile::tempdir().unwrap();
        let (h, id) = shot(d.path());
        let folder = shot_service::folder(d.path(), id);
        assert_eq!(write_commit(d.path(), &h, id, "{}", Some(b"GIF89a, long enough to have a header")), Err("not a png".into()));
        assert_eq!(names(&folder), [ORIGINAL, THUMB]);
        assert_eq!(h.lock().unwrap().get(id).unwrap().rev, 0);
    }

    #[test]
    fn body_is_edits_then_png() {
        assert_eq!(split_body(b"{\"a\":1}\x89PNG", 7), Ok(("{\"a\":1}".to_string(), Some(&b"\x89PNG"[..]))));
        // Nothing after the edits: unedited.
        assert_eq!(split_body(b"{}", 2), Ok(("{}".to_string(), None)));
        assert_eq!(split_body(b"", 0), Ok((String::new(), None)));
        assert_eq!(split_body(b"\x89PNG", 0), Ok((String::new(), Some(&b"\x89PNG"[..]))));
        assert!(split_body(b"{}", 3).is_err());
        assert!(split_body(b"\xff\xfe", 2).is_err());
    }

    #[test]
    fn actions_are_copy_save_and_keep() {
        assert_eq!(Action::parse("copy"), Some(Action::Copy));
        assert_eq!(Action::parse("save"), Some(Action::Save));
        assert_eq!(Action::parse("keep"), Some(Action::Keep));
        assert_eq!(Action::parse("Copy"), None);
    }

    #[test]
    fn wallpaper_must_be_a_picture_file() {
        let d = tempfile::tempdir().unwrap();
        for name in ["a.png", "b.jpg", "c.JPEG", "d.heic"] {
            fs::write(d.path().join(name), b"x").unwrap();
            assert!(is_wallpaper_file(&d.path().join(name)), "{name}");
        }
        // A moving wallpaper, a folder, a file with no kind, one that is not there.
        fs::write(d.path().join("e.madesktop"), b"x").unwrap();
        fs::write(d.path().join("f"), b"x").unwrap();
        fs::create_dir(d.path().join("g.png")).unwrap();
        for name in ["e.madesktop", "f", "g.png", "missing.png"] {
            assert!(!is_wallpaper_file(&d.path().join(name)), "{name}");
        }
    }

    #[test]
    fn title_is_the_original_size() {
        assert_eq!(title((2940, 1718)), "Screenshot · 2940 × 1718");
    }
}

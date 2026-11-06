//! Atur jendela in the core (design 4 Nov, alat latar §5): nine Carbon hot keys,
//! ⌃⌥ with arrows, ; ' . / \\ and Return until changed in Settings (design 4 Nov tombol atur jendela), while
//! the tool is on, and the focused window placed through the Accessibility API.
//! Nothing runs until a key is pressed.

use std::ffi::c_void;
use std::sync::{Mutex, Once, OnceLock};
use std::time::{Duration, Instant};

use objc2::MainThreadMarker;
use objc2_app_kit::{NSScreen, NSWorkspace};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::carbon_keys::{self, EVENT_NOT_HANDLED, NO_ERR};
use crate::geometry::Rect;
use crate::shot::KeyState;
use crate::shot_keys::{from_web, label, mac_holds, Combo, MacHold};
use crate::win_rules::{flip, place, screen_for, set_key, Cell, WinKeyError, WindowKeys};

pub const MODULE_ID: &str = "window-keys";
// Marks Atur jendela's hot keys among the others on the app target.
const SIGNATURE: u32 = u32::from_be_bytes(*b"ncwa");
// The no-permission notice, at most once a minute (§5).
const NOTICE_EVERY: Duration = Duration::from_secs(60);
const N: usize = Cell::ALL.len();

struct HotKeys([*mut c_void; N]);
// SAFETY: the refs are only used on the main thread; the Mutex just holds them.
unsafe impl Send for HotKeys {}

static HOT_KEYS: Mutex<HotKeys> = Mutex::new(HotKeys([std::ptr::null_mut(); N]));
static REGISTERED: Mutex<[KeyState; N]> = Mutex::new([KeyState::Off; N]);
static APP: OnceLock<AppHandle> = OnceLock::new();
static HANDLER: Once = Once::new();
static LAST_NOTICE: Mutex<Option<Instant>> = Mutex::new(None);

fn saved_keys(app: &AppHandle) -> WindowKeys {
    app.state::<CoreState>().0.lock().unwrap().window_keys()
}

pub fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

extern "C" fn on_hot_key(_next: *mut c_void, event: *mut c_void, _data: *mut c_void) -> i32 {
    let Some(id) = carbon_keys::hot_key_id(event) else { return EVENT_NOT_HANDLED };
    if id.signature != SIGNATURE {
        return EVENT_NOT_HANDLED;
    }
    let (Some(app), Some(cell)) = (APP.get(), Cell::from_id(id.id)) else { return EVENT_NOT_HANDLED };
    pressed(app, cell);
    NO_ERR
}

/// The screens' full and visible frames in screen coordinates, main screen first.
pub(crate) fn screens(mtm: MainThreadMarker) -> Vec<(Rect, Rect)> {
    let all = NSScreen::screens(mtm);
    let rect = |r: objc2_foundation::NSRect| Rect { x: r.origin.x, y: r.origin.y, w: r.size.width, h: r.size.height };
    let primary = all.iter().next().map_or(0.0, |s| s.frame().size.height);
    all.iter().map(|s| (flip(rect(s.frame()), primary), flip(rect(s.visibleFrame()), primary))).collect()
}

/// On the main thread: who is in front and where the screens are; the window
/// itself is asked for on a thread of its own, since an app may answer slowly.
fn pressed(app: &AppHandle, cell: Cell) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let Some(pid) = NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| a.processIdentifier()) else { return };
    let screens = screens(mtm);
    let handle = app.clone();
    std::thread::spawn(move || arrange(&handle, cell, pid, &screens));
}

fn arrange(app: &AppHandle, cell: Cell, pid: i32, screens: &[(Rect, Rect)]) {
    if !crate::keyclean_tap::trusted(false) {
        no_access(app);
        return;
    }
    let Some(window) = crate::ax::app(pid).and_then(|a| crate::ax::focused_window(&a)) else { return };
    let Some(now) = crate::ax::frame(&window) else { return };
    let full: Vec<Rect> = screens.iter().map(|s| s.0).collect();
    let Some(&(_, visible)) = screens.get(screen_for(now, &full)) else { return };
    let to = place(cell, now, visible);
    if !crate::ax::set_frame(&window, to, cell != Cell::Center) {
        eprintln!("notching: window not moved ({cell:?})");
    }
}

fn no_access(app: &AppHandle) {
    {
        let mut last = LAST_NOTICE.lock().unwrap();
        if last.is_some_and(|t| t.elapsed() < NOTICE_EVERY) {
            return;
        }
        *last = Some(Instant::now());
    }
    let text = |key: &str| app.state::<CoreState>().0.lock().unwrap().module_text(MODULE_ID, key).unwrap_or_default();
    if let Err(e) = crate::notify::post(app, MODULE_ID, "access", &text("notice.access.title"), &text("notice.access.detail")) {
        eprintln!("notching: the arrange-windows access notice was not sent: {e}");
    }
}

/// Registers the nine keys, replacing any earlier registration. Main thread.
fn register(app: &AppHandle) {
    let _ = APP.set(app.clone());
    HANDLER.call_once(|| {
        let status = carbon_keys::install_handler(on_hot_key);
        if status != NO_ERR {
            eprintln!("notching: arrange-windows key handler not installed ({status})");
        }
    });
    unregister();
    let keys = saved_keys(app);
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    let states = Cell::ALL.map(|cell| {
        let c = keys.get(cell);
        match carbon_keys::register(c.code, c.mods, SIGNATURE, cell.id()) {
            Some(hot_key) => {
                hot_keys.0[cell.id() as usize - 1] = hot_key;
                KeyState::Ok
            }
            None => {
                eprintln!("notching: {} not registered", label(c));
                KeyState::Other
            }
        }
    });
    *REGISTERED.lock().unwrap() = states;
}

/// Lets go of every key. Main thread.
fn unregister() {
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    for hot_key in hot_keys.0.iter_mut().filter(|k| !k.is_null()) {
        carbon_keys::unregister(*hot_key);
        *hot_key = std::ptr::null_mut();
    }
    *REGISTERED.lock().unwrap() = [KeyState::Off; N];
}

// `run` on the main thread; off it, waits until that is done.
fn on_main(app: &AppHandle, run: impl FnOnce() + Send + 'static) {
    if MainThreadMarker::new().is_some() {
        run();
        return;
    }
    let (done, wait) = std::sync::mpsc::sync_channel(1);
    let sent = app.run_on_main_thread(move || {
        run();
        let _ = done.send(());
    });
    if sent.is_ok() {
        let _ = wait.recv();
    }
}

// The keys as the tool's state says.
fn sync(app: &AppHandle) {
    let handle = app.clone();
    on_main(app, move || {
        if enabled(&handle) {
            register(&handle);
        } else {
            unregister();
        }
    });
}

/// At launch, on the main thread.
pub fn start(app: &AppHandle) {
    sync(app);
}

/// Any module was switched, installed or uninstalled.
pub fn module_changed(app: &AppHandle, id: &str) {
    if id == MODULE_ID {
        sync(app);
    }
}

/// One of the nine keys while the tool is on: Screenshot may not take it.
pub fn holds(app: &AppHandle, c: Combo) -> bool {
    enabled(app) && saved_keys(app).cell_of(c).is_some()
}

/// While Settings records a key, the nine keys let go; then they come back.
pub fn hold(app: &AppHandle, hold: bool) {
    if hold {
        let _ = app.run_on_main_thread(unregister);
    } else {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if enabled(&handle) {
                register(&handle);
            }
        });
    }
}

/// The settings window closed: keys a recording there let go of come back.
pub fn settings_closed(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if enabled(&handle) && *REGISTERED.lock().unwrap() == [KeyState::Off; N] {
            register(&handle);
        }
    });
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WindowKeyDto {
    pub cell: Cell,
    pub label: String,
    pub state: KeyState,
}

/// Off while the tool is off; a Mac shortcut that is on wins over what Carbon
/// gave, since macOS gets the key first.
pub fn key_state(enabled: bool, registered: KeyState, mac: MacHold) -> KeyState {
    match (enabled, mac) {
        (false, _) => KeyState::Off,
        (true, MacHold::Free) => registered,
        (true, _) => KeyState::Shortcut,
    }
}

/// The nine keys for the tool's page in Settings. Reads the Mac's shortcuts, so
/// it runs off the main thread.
#[tauri::command]
pub async fn window_keys(app: AppHandle) -> Vec<WindowKeyDto> {
    keys(&app)
}

fn keys(app: &AppHandle) -> Vec<WindowKeyDto> {
    let on = enabled(app);
    let saved = saved_keys(app);
    let registered = *REGISTERED.lock().unwrap();
    let mac = crate::shot_hotkey::read_symbolic_hotkeys().unwrap_or_else(|_| serde_json::json!({}));
    Cell::ALL
        .iter()
        .zip(registered)
        .map(|(&cell, reg)| WindowKeyDto {
            cell,
            label: label(saved.get(cell)),
            state: key_state(on, reg, mac_holds(&mac, saved.get(cell))),
        })
        .collect()
}

/// A key recorded in Settings for one cell: the key's place (`KeyboardEvent.code`)
/// and its modifiers. Refuses another cell's key and, while Screenshot is on, its two.
#[tauri::command]
pub async fn window_set_key(
    app: AppHandle,
    cell: Cell,
    code: String,
    cmd: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
) -> Result<Vec<WindowKeyDto>, WinKeyError> {
    let combo = from_web(&code, cmd, ctrl, alt, shift);
    if combo.is_some_and(|c| crate::app_keys_service::holds(&app, c)) {
        return Err(WinKeyError::App);
    }
    if combo.is_some_and(|c| crate::switch_service::holds(&app, c)) {
        return Err(WinKeyError::Peek);
    }
    let shot = crate::shot_service::enabled(&app).then(|| app.state::<CoreState>().0.lock().unwrap().shot_keys());
    let next = set_key(saved_keys(&app), cell, combo, shot)?;
    save_keys(&app, next);
    Ok(keys(&app))
}

/// Back to the keys until changed.
#[tauri::command]
pub async fn window_reset_keys(app: AppHandle) -> Vec<WindowKeyDto> {
    save_keys(&app, WindowKeys::default());
    keys(&app)
}

fn save_keys(app: &AppHandle, next: WindowKeys) {
    if let Err(e) = app.state::<CoreState>().0.lock().unwrap().set_window_keys(next) {
        eprintln!("notching: arrange-windows keys not saved: {e:?}");
    }
    let labels: Vec<String> = Cell::ALL.iter().map(|&c| label(next.get(c))).collect();
    eprintln!("notching: arrange-windows keys set to {}", labels.join(" "));
    sync(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_is_off_with_the_tool_and_the_macs_shortcut_wins() {
        assert_eq!(key_state(false, KeyState::Ok, MacHold::Free), KeyState::Off);
        assert_eq!(key_state(true, KeyState::Ok, MacHold::Free), KeyState::Ok);
        assert_eq!(key_state(true, KeyState::Other, MacHold::Free), KeyState::Other);
        assert_eq!(key_state(true, KeyState::Ok, MacHold::Shortcut), KeyState::Shortcut);
    }

    #[test]
    fn labels_read_like_the_mac() {
        assert_eq!(label(WindowKeys::default().get(Cell::TopLeft)), "⌃⌥;");
        assert_eq!(label(WindowKeys::default().get(Cell::Left)), "⌃⌥←");
        assert_eq!(label(WindowKeys::default().get(Cell::Fill)), "⌃⌥↩");
    }

    #[test]
    fn json_is_camel_case() {
        let dto = WindowKeyDto { cell: Cell::BottomLeft, label: "⌃⌥Z".into(), state: KeyState::Ok };
        assert_eq!(serde_json::to_value(dto).unwrap(), serde_json::json!({"cell":"bottomLeft","label":"⌃⌥Z","state":"ok"}));
    }
}

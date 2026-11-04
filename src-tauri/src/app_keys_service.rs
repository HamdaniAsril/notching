//! The app keys in the core (owner, 4 Nov): a Carbon hot key per action while its
//! module is on. Keep awake's turns it on with no end, or off; Shelf's opens the
//! shelf on the notch under the cursor, or closes it. Nothing runs until pressed.

use std::ffi::c_void;
use std::sync::{Mutex, Once, OnceLock};

use objc2::MainThreadMarker;
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager};

use crate::app_core::CoreState;
use crate::app_keys::{set_key, Action, AppKeyError, AppKeys};
use crate::carbon_keys::{self, EVENT_NOT_HANDLED, NO_ERR};
use crate::shot::KeyState;
use crate::shot_keys::{from_web, label, mac_holds, Combo};

// Marks the app keys among the others on the app target.
const SIGNATURE: u32 = u32::from_be_bytes(*b"ncak");
const SHELF_EVENT: &str = "notching://shelf-key";
const N: usize = Action::ALL.len();

struct HotKeys([*mut c_void; N]);
// SAFETY: the refs are only used on the main thread; the Mutex just holds them.
unsafe impl Send for HotKeys {}

static HOT_KEYS: Mutex<HotKeys> = Mutex::new(HotKeys([std::ptr::null_mut(); N]));
static REGISTERED: Mutex<[KeyState; N]> = Mutex::new([KeyState::Off; N]);
static APP: OnceLock<AppHandle> = OnceLock::new();
static HANDLER: Once = Once::new();

fn saved_keys(app: &AppHandle) -> AppKeys {
    app.state::<CoreState>().0.lock().unwrap().app_keys()
}

/// The action's module is installed and on.
pub fn enabled(app: &AppHandle, action: Action) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(action.module()).is_some_and(|e| e.installed && e.enabled)
}

extern "C" fn on_hot_key(_next: *mut c_void, event: *mut c_void, _data: *mut c_void) -> i32 {
    let Some(id) = carbon_keys::hot_key_id(event) else { return EVENT_NOT_HANDLED };
    if id.signature != SIGNATURE {
        return EVENT_NOT_HANDLED;
    }
    let (Some(app), Some(action)) = (APP.get(), Action::from_id(id.id)) else { return EVENT_NOT_HANDLED };
    pressed(app, action);
    NO_ERR
}

// On the main thread.
fn pressed(app: &AppHandle, action: Action) {
    match action {
        Action::Awake => {
            let on = crate::awake_service::read(app).on;
            if on {
                crate::awake_service::turn_off(app);
                eprintln!("notching: keep awake turned off by its key");
            } else {
                match crate::awake_service::turn_on(app, action.module(), None) {
                    Ok(_) => eprintln!("notching: keep awake turned on by its key"),
                    Err(e) => eprintln!("notching: keep awake not turned on by its key: {e}"),
                }
            }
        }
        Action::Shelf => {
            let Some(mtm) = MainThreadMarker::new() else { return };
            let label = crate::shot_service::cursor_label(app, mtm);
            if let Err(e) = app.emit_to(EventTarget::webview_window(&label), SHELF_EVENT, ()) {
                eprintln!("notching: the shelf key was not sent: {e}");
            }
        }
    }
}

/// Registers the keys whose module is on, replacing any earlier registration. Main thread.
fn register(app: &AppHandle) {
    let _ = APP.set(app.clone());
    HANDLER.call_once(|| {
        let status = carbon_keys::install_handler(on_hot_key);
        if status != NO_ERR {
            eprintln!("notching: app key handler not installed ({status})");
        }
    });
    unregister();
    let keys = saved_keys(app);
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    let states = Action::ALL.map(|action| {
        if !enabled(app, action) {
            return KeyState::Off;
        }
        let c = keys.get(action);
        match carbon_keys::register(c.code, c.mods, SIGNATURE, action.id()) {
            Some(hot_key) => {
                hot_keys.0[action.id() as usize - 1] = hot_key;
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

fn sync(app: &AppHandle) {
    let handle = app.clone();
    on_main(app, move || register(&handle));
}

/// At launch, on the main thread.
pub fn start(app: &AppHandle) {
    sync(app);
}

/// Any module was switched, installed or uninstalled.
pub fn module_changed(app: &AppHandle, id: &str) {
    if Action::ALL.iter().any(|a| a.module() == id) {
        sync(app);
    }
}

/// An app key whose module is on: Screenshot and Atur jendela may not take it.
pub fn holds(app: &AppHandle, c: Combo) -> bool {
    saved_keys(app).action_of(c).is_some_and(|a| enabled(app, a))
}

/// While Settings records a key, the app keys let go; then they come back.
pub fn hold(app: &AppHandle, hold: bool) {
    if hold {
        let _ = app.run_on_main_thread(unregister);
    } else {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || register(&handle));
    }
}

/// The settings window closed: keys a recording there let go of come back.
pub fn settings_closed(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if *REGISTERED.lock().unwrap() == [KeyState::Off; N] {
            register(&handle);
        }
    });
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppKeyDto {
    pub action: Action,
    pub label: String,
    pub state: KeyState,
}

/// The keys for the Pintasan page. Reads the Mac's shortcuts, so it runs off the
/// main thread.
#[tauri::command]
pub async fn app_keys(app: AppHandle) -> Vec<AppKeyDto> {
    keys(&app)
}

fn keys(app: &AppHandle) -> Vec<AppKeyDto> {
    let saved = saved_keys(app);
    let registered = *REGISTERED.lock().unwrap();
    let mac = crate::shot_hotkey::read_symbolic_hotkeys().unwrap_or_else(|_| serde_json::json!({}));
    Action::ALL
        .iter()
        .zip(registered)
        .map(|(&action, reg)| AppKeyDto {
            action,
            label: label(saved.get(action)),
            state: crate::win_service::key_state(enabled(app, action), reg, mac_holds(&mac, saved.get(action))),
        })
        .collect()
}

/// A key recorded on the Pintasan page for one action. Refuses the other action's
/// key and, while they are on, Screenshot's and Atur jendela's.
#[tauri::command]
pub async fn app_set_key(
    app: AppHandle,
    action: Action,
    code: String,
    cmd: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
) -> Result<Vec<AppKeyDto>, AppKeyError> {
    let combo = from_web(&code, cmd, ctrl, alt, shift);
    let shot = combo.is_some_and(|c| {
        crate::shot_service::enabled(&app) && {
            let s = app.state::<CoreState>().0.lock().unwrap().shot_keys();
            s.screen == c || s.pick == c
        }
    });
    let window = combo.is_some_and(|c| crate::win_service::holds(&app, c));
    let next = set_key(saved_keys(&app), action, combo, shot, window)?;
    save_keys(&app, next);
    Ok(keys(&app))
}

/// Back to ⌃⌥K and ⌃⌥V.
#[tauri::command]
pub async fn app_reset_keys(app: AppHandle) -> Vec<AppKeyDto> {
    save_keys(&app, AppKeys::default());
    keys(&app)
}

fn save_keys(app: &AppHandle, next: AppKeys) {
    if let Err(e) = app.state::<CoreState>().0.lock().unwrap().set_app_keys(next) {
        eprintln!("notching: app keys not saved: {e:?}");
    }
    eprintln!("notching: app keys set to {} and {}", label(next.awake), label(next.shelf));
    sync(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_is_camel_case() {
        let dto = AppKeyDto { action: Action::Shelf, label: "⌃⌥V".into(), state: KeyState::Ok };
        assert_eq!(serde_json::to_value(dto).unwrap(), serde_json::json!({"action":"shelf","label":"⌃⌥V","state":"ok"}));
    }
}

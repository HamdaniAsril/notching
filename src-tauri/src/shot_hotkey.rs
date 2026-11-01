//! Screenshot's keys (design 1 Nov §4): Cmd+Shift+3 and Cmd+Shift+4 as Carbon hot
//! keys while the module is on, whether the Mac's own screenshot shortcuts still
//! hold them, and one notice per launch when they do.

use std::ffi::c_void;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once, OnceLock};

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSWorkspace};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::geometry::Rect;
use crate::locale::Lang;
use crate::notify::{window_list, WindowBox};
use crate::shot::{parse_key_conflicts, pick_screen, KeyState, Kind, Target};
use crate::shot_service::{self, MODULE_ID};

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn GetApplicationEventTarget() -> *mut c_void;
    fn InstallEventHandler(
        target: *mut c_void,
        handler: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i32,
        num_types: usize,
        types: *const EventTypeSpec,
        user_data: *mut c_void,
        out_ref: *mut *mut c_void,
    ) -> i32;
    fn RegisterEventHotKey(
        key_code: u32,
        modifiers: u32,
        id: EventHotKeyID,
        target: *mut c_void,
        options: u32,
        out_ref: *mut *mut c_void,
    ) -> i32;
    fn UnregisterEventHotKey(hot_key: *mut c_void) -> i32;
    fn GetEventParameter(
        event: *mut c_void,
        name: u32,
        desired_type: u32,
        actual_type: *mut u32,
        size: usize,
        actual_size: *mut usize,
        data: *mut c_void,
    ) -> i32;
}

#[repr(C)]
#[derive(Clone, Copy)]
struct EventHotKeyID {
    signature: u32,
    id: u32,
}

#[repr(C)]
struct EventTypeSpec {
    event_class: u32,
    event_kind: u32,
}

const EVENT_CLASS_KEYBOARD: u32 = u32::from_be_bytes(*b"keyb"); // kEventClassKeyboard
const EVENT_HOT_KEY_PRESSED: u32 = 5; // kEventHotKeyPressed
const PARAM_DIRECT_OBJECT: u32 = u32::from_be_bytes(*b"----"); // kEventParamDirectObject
const TYPE_HOT_KEY_ID: u32 = u32::from_be_bytes(*b"hkid"); // typeEventHotKeyID
const NO_ERR: i32 = 0;
const EVENT_NOT_HANDLED: i32 = -9874; // eventNotHandledErr
const CMD_SHIFT: u32 = 0x0100 | 0x0200; // cmdKey | shiftKey
// Marks Notching's hot keys among any others the app target sees.
const SIGNATURE: u32 = u32::from_be_bytes(*b"ncsh");
const KEYBOARD_SHORTCUTS_PANE: &str = "x-apple.systempreferences:com.apple.Keyboard-Settings.extension?Shortcuts";
// At launch the notch pages are still loading; a notice sent sooner is lost.
const LAUNCH_NOTICE_DELAY: std::time::Duration = std::time::Duration::from_secs(3);

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Key {
    /// ⌘⇧3: the whole screen.
    Screen,
    /// ⌘⇧4: a window or an area.
    Pick,
}

impl Key {
    const ALL: [Key; 2] = [Key::Screen, Key::Pick];

    fn code(self) -> u32 {
        match self {
            Key::Screen => 20, // kVK_ANSI_3
            Key::Pick => 21,   // kVK_ANSI_4
        }
    }

    // The hot key id: the index in ALL plus one.
    fn id(self) -> u32 {
        self as u32 + 1
    }

    fn from_id(id: u32) -> Option<Key> {
        Key::ALL.into_iter().find(|k| k.id() == id)
    }

    fn label(self) -> &'static str {
        match self {
            Key::Screen => "⌘⇧3",
            Key::Pick => "⌘⇧4",
        }
    }
}

/// How each key stands, for the Screenshot page and Settings.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeysDto {
    pub screen: KeyState,
    pub pick: KeyState,
}

/// Off while the module is off. Otherwise Mac when the Mac's own shortcut is on
/// (it gets the key first, whatever Notching registered), Other when Notching
/// could not register the key, else what `register` gave.
pub fn combine(enabled: bool, registered: [KeyState; 2], mac_taken: (bool, bool)) -> KeysDto {
    let state = |registered: KeyState, mac: bool| match (enabled, mac) {
        (false, _) => KeyState::Off,
        (true, true) => KeyState::Mac,
        (true, false) => registered,
    };
    KeysDto { screen: state(registered[0], mac_taken.0), pick: state(registered[1], mac_taken.1) }
}

/// The keys for the once-per-launch notice ("⌘⇧3", "⌘⇧4", or both joined in `lang`),
/// when one is not sent yet and a key does not reach Notching.
pub fn conflict_notice_due(already_sent: bool, keys: &KeysDto, lang: Lang) -> Option<String> {
    if already_sent {
        return None;
    }
    let blocked = |s: KeyState| matches!(s, KeyState::Mac | KeyState::Other);
    let names: Vec<&str> = [(Key::Screen, keys.screen), (Key::Pick, keys.pick)]
        .into_iter()
        .filter(|&(_, s)| blocked(s))
        .map(|(k, _)| k.label())
        .collect();
    let and = match lang {
        Lang::Id => " dan ",
        Lang::En => " and ",
    };
    (!names.is_empty()).then(|| names.join(and))
}

/// The frontmost window of `pid`: its first normal (layer 0) window, front to back.
fn front_window(windows: &[WindowBox], pid: i32) -> Option<Rect> {
    windows.iter().find(|w| w.pid == pid && w.layer == 0).map(|w| w.bounds)
}

// The live hot keys, by Key index; null when not registered.
struct HotKeys([*mut c_void; 2]);
// SAFETY: the refs are only used on the main thread; the Mutex just holds them.
unsafe impl Send for HotKeys {}

static HOT_KEYS: Mutex<HotKeys> = Mutex::new(HotKeys([std::ptr::null_mut(); 2]));
static REGISTERED: Mutex<[KeyState; 2]> = Mutex::new([KeyState::Off; 2]);
static APP: OnceLock<AppHandle> = OnceLock::new();
static HANDLER: Once = Once::new();
static NOTICE_SENT: AtomicBool = AtomicBool::new(false);

// Called by the app's event target, on the main thread.
extern "C" fn on_hot_key(_next: *mut c_void, event: *mut c_void, _data: *mut c_void) -> i32 {
    let mut id = EventHotKeyID { signature: 0, id: 0 };
    // SAFETY: `id` is an EventHotKeyID, as large as the size passed.
    let status = unsafe {
        GetEventParameter(
            event,
            PARAM_DIRECT_OBJECT,
            TYPE_HOT_KEY_ID,
            std::ptr::null_mut(),
            std::mem::size_of::<EventHotKeyID>(),
            std::ptr::null_mut(),
            &mut id as *mut EventHotKeyID as *mut c_void,
        )
    };
    if status != NO_ERR || id.signature != SIGNATURE {
        return EVENT_NOT_HANDLED;
    }
    let (Some(app), Some(key)) = (APP.get(), Key::from_id(id.id)) else { return EVENT_NOT_HANDLED };
    match key {
        Key::Screen => screen(app),
        Key::Pick => pick(app),
    }
    NO_ERR
}

/// ⌘⇧3: the screen of the frontmost window, or the cursor's. Only the frames are
/// read here; `take` captures on a thread of its own.
fn screen(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let frames = shot_service::cg_frames(mtm);
    let front = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|a| front_window(&window_list(), a.processIdentifier()));
    // The main screen's CG frame starts at 0, 0 and is as tall as AppKit's flip.
    let primary = frames.first().map_or(0.0, |f| f.h);
    let p = NSEvent::mouseLocation();
    let index = pick_screen(&frames, front, (p.x, primary - p.y));
    if let Some(&rect) = frames.get(index) {
        shot_service::take(app, Target::Screen { rect }, Kind::Screen, index);
    }
}

/// ⌘⇧4. Task 5 opens the picker here.
fn pick(_app: &AppHandle) {
    eprintln!("notching: ⌘⇧4 pressed (the picker comes with Task 5)");
}

/// Registers ⌘⇧3 and ⌘⇧4 for the module, replacing any earlier registration.
/// Main thread only. A key another app holds comes back Other.
pub fn register(app: &AppHandle) -> [KeyState; 2] {
    let _ = APP.set(app.clone());
    HANDLER.call_once(|| {
        let types = [EventTypeSpec { event_class: EVENT_CLASS_KEYBOARD, event_kind: EVENT_HOT_KEY_PRESSED }];
        // SAFETY: the handler is a plain function and `types` outlives the call.
        let status = unsafe {
            InstallEventHandler(
                GetApplicationEventTarget(),
                on_hot_key,
                types.len(),
                types.as_ptr(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if status != NO_ERR {
            eprintln!("notching: screenshot key handler not installed ({status})");
        }
    });
    unregister();
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    let states = Key::ALL.map(|key| {
        let mut hot_key = std::ptr::null_mut();
        let id = EventHotKeyID { signature: SIGNATURE, id: key.id() };
        // SAFETY: `hot_key` receives the ref, which stays valid until unregistered.
        let status = unsafe { RegisterEventHotKey(key.code(), CMD_SHIFT, id, GetApplicationEventTarget(), 0, &mut hot_key) };
        if status != NO_ERR || hot_key.is_null() {
            eprintln!("notching: {} not registered ({status})", key.label());
            return KeyState::Other;
        }
        hot_keys.0[key as usize] = hot_key;
        KeyState::Ok
    });
    *REGISTERED.lock().unwrap() = states;
    states
}

/// Lets go of both keys. Main thread only.
pub fn unregister() {
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    for hot_key in hot_keys.0.iter_mut().filter(|k| !k.is_null()) {
        // SAFETY: a ref RegisterEventHotKey gave, unregistered once (it is nulled).
        unsafe { UnregisterEventHotKey(*hot_key) };
        *hot_key = std::ptr::null_mut();
    }
    *REGISTERED.lock().unwrap() = [KeyState::Off; 2];
}

/// Which of ⌘⇧3 and ⌘⇧4 the Mac's own screenshot shortcuts hold. Read only;
/// when the setting cannot be read, neither counts as taken.
fn mac_taken() -> (bool, bool) {
    match read_symbolic_hotkeys() {
        Ok(json) => parse_key_conflicts(&json),
        Err(e) => {
            eprintln!("notching: the Mac's screenshot shortcuts not read: {e}");
            (false, false)
        }
    }
}

// `defaults export com.apple.symbolichotkeys -` piped through `plutil -convert json`.
fn read_symbolic_hotkeys() -> Result<serde_json::Value, String> {
    let mut defaults = Command::new("/usr/bin/defaults")
        .args(["export", "com.apple.symbolichotkeys", "-"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("defaults: {e}"))?;
    let plist = defaults.stdout.take().ok_or("defaults gave no output")?;
    let plutil = Command::new("/usr/bin/plutil")
        .args(["-convert", "json", "-o", "-", "-"])
        .stdin(Stdio::from(plist))
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let exported = defaults.wait().map_err(|e| format!("defaults: {e}"))?;
    let out = plutil.and_then(|p| p.wait_with_output()).map_err(|e| format!("plutil: {e}"))?;
    if !exported.success() || !out.status.success() {
        return Err(format!("defaults {exported}, plutil {}", out.status));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())
}

/// The keys as they stand now. Reads the Mac's setting, so keep it off the main thread.
fn keys(app: &AppHandle) -> KeysDto {
    let enabled = shot_service::enabled(app);
    let mac = if enabled { mac_taken() } else { (false, false) };
    combine(enabled, *REGISTERED.lock().unwrap(), mac)
}

// The notice for keys that do not reach Notching, once per launch.
fn notice_if_due(app: &AppHandle) {
    let keys = keys(app);
    let (lang, title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.lang(), core.module_text(MODULE_ID, "notice.keys.title"), core.module_text(MODULE_ID, "notice.keys.detail"))
    };
    let Some(names) = conflict_notice_due(NOTICE_SENT.load(Ordering::SeqCst), &keys, lang) else { return };
    if NOTICE_SENT.swap(true, Ordering::SeqCst) {
        return;
    }
    let title = title.map_or_else(|| names.clone(), |t| t.replace("{keys}", &names));
    if let Err(e) = crate::notify::post(app, MODULE_ID, "keys", &title, &detail.unwrap_or_default()) {
        eprintln!("notching: the screenshot keys notice was not sent: {e}");
    }
}

/// At launch, on the main thread: the keys when the module is on, then the notice
/// once the notch pages are up.
pub fn start(app: &AppHandle) {
    if !shot_service::enabled(app) {
        return;
    }
    register(app);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(LAUNCH_NOTICE_DELAY);
        notice_if_due(&app);
    });
}

/// The module was switched back on or reinstalled: the keys again, and the notice
/// if it was not sent this launch.
pub fn module_on(app: &AppHandle, id: &str) {
    if id != MODULE_ID || !shot_service::enabled(app) {
        return;
    }
    let handle = app.clone();
    let on_main = move || {
        register(&handle);
        std::thread::spawn(move || notice_if_due(&handle));
    };
    if MainThreadMarker::new().is_some() {
        on_main();
    } else {
        let _ = app.run_on_main_thread(on_main);
    }
}

#[tauri::command]
pub async fn shot_keys(app: AppHandle) -> KeysDto {
    keys(&app)
}

/// System Settings › Keyboard › Keyboard Shortcuts. Notching only shows the way;
/// it never changes the Mac's shortcuts itself.
#[tauri::command]
pub fn open_keyboard_shortcuts() {
    if let Err(e) = Command::new("/usr/bin/open").arg(KEYBOARD_SHORTCUTS_PANE).spawn() {
        eprintln!("notching: System Settings did not open: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dto(screen: KeyState, pick: KeyState) -> KeysDto {
        KeysDto { screen, pick }
    }

    #[test]
    fn conflict_notice_once_per_launch() {
        use KeyState::*;
        assert_eq!(conflict_notice_due(true, &dto(Mac, Mac), Lang::Id), None);
        assert_eq!(conflict_notice_due(false, &dto(Mac, Mac), Lang::Id).as_deref(), Some("⌘⇧3 dan ⌘⇧4"));
        assert_eq!(conflict_notice_due(false, &dto(Mac, Mac), Lang::En).as_deref(), Some("⌘⇧3 and ⌘⇧4"));
        assert_eq!(conflict_notice_due(false, &dto(Ok, Other), Lang::Id).as_deref(), Some("⌘⇧4"));
        assert_eq!(conflict_notice_due(false, &dto(Mac, Ok), Lang::En).as_deref(), Some("⌘⇧3"));
        assert_eq!(conflict_notice_due(false, &dto(Ok, Ok), Lang::Id), None);
        assert_eq!(conflict_notice_due(false, &dto(Off, Off), Lang::Id), None);
    }

    #[test]
    fn mac_conflict_wins_over_registered() {
        use KeyState::*;
        assert_eq!(combine(true, [Ok, Ok], (true, false)), dto(Mac, Ok));
        assert_eq!(combine(true, [Other, Ok], (true, true)), dto(Mac, Mac));
        assert_eq!(combine(true, [Ok, Other], (false, false)), dto(Ok, Other));
        assert_eq!(combine(false, [Ok, Ok], (true, true)), dto(Off, Off));
        // Switched on but never registered (as before `register` runs).
        assert_eq!(combine(true, [Off, Off], (false, false)), dto(Off, Off));
    }

    #[test]
    fn front_window_is_the_first_normal_window_of_the_app() {
        let rect = |x| Rect { x, y: 0.0, w: 100.0, h: 100.0 };
        let windows = [
            WindowBox { pid: 7, layer: 25, bounds: rect(1.0) },
            WindowBox { pid: 9, layer: 0, bounds: rect(2.0) },
            WindowBox { pid: 7, layer: 0, bounds: rect(3.0) },
            WindowBox { pid: 7, layer: 0, bounds: rect(4.0) },
        ];
        assert_eq!(front_window(&windows, 7), Some(rect(3.0)));
        assert_eq!(front_window(&windows, 5), None);
    }

    #[test]
    fn json_is_camel_case_lowercase() {
        let json = serde_json::to_value(dto(KeyState::Mac, KeyState::Other)).unwrap();
        assert_eq!(json, serde_json::json!({ "screen": "mac", "pick": "other" }));
    }
}

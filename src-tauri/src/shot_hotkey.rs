//! Screenshot's keys (design 1 Nov §4): Cmd+Shift+3 and Cmd+Shift+4 as Carbon hot
//! keys while the module is on, whether the Mac's own screenshot shortcuts still
//! hold them, and one notice per launch when they do.

use std::ffi::c_void;
use std::process::{Command, Stdio};
use std::sync::{Mutex, Once, OnceLock};

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSWorkspace};
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::app_core::CoreState;
use crate::geometry::Rect;
use crate::locale::Lang;
use crate::notify::{window_list, WindowBox};
use crate::overlay::Overlays;
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

/// Who holds the keys a launch notice names; each has its own title.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Holder {
    /// The Mac's own screenshot shortcuts: `notice.keys.title`.
    Mac,
    /// Another app, one key: `notice.other.title`.
    Other,
    /// Another app, both keys: `notice.otherMany.title` ("are taken" in English).
    OtherMany,
}

impl Holder {
    fn title_key(self) -> &'static str {
        match self {
            Holder::Mac => "notice.keys.title",
            Holder::Other => "notice.other.title",
            Holder::OtherMany => "notice.otherMany.title",
        }
    }
}

/// The once-per-launch notice, when it is not sent yet and a key does not reach
/// Notching: who holds the keys, and which ("⌘⇧3", "⌘⇧4", or both joined in
/// `lang`). Keys the Mac holds come first, since System Settings can free them;
/// only then keys another app holds. One notice names only one holder.
pub fn conflict_notice_due(already_sent: bool, keys: &KeysDto, lang: Lang) -> Option<(Holder, String)> {
    if already_sent {
        return None;
    }
    let held_by = |state: KeyState| {
        let names: Vec<&str> = [(Key::Screen, keys.screen), (Key::Pick, keys.pick)]
            .into_iter()
            .filter(|&(_, s)| s == state)
            .map(|(k, _)| k.label())
            .collect();
        (!names.is_empty()).then_some(names)
    };
    let (holder, names) = held_by(KeyState::Mac).map(|n| (Holder::Mac, n)).or_else(|| {
        held_by(KeyState::Other).map(|n| (if n.len() > 1 { Holder::OtherMany } else { Holder::Other }, n))
    })?;
    let and = match lang {
        Lang::Id => " dan ",
        Lang::En => " and ",
    };
    Some((holder, names.join(and)))
}

/// The launch notice goes to the overlay under the cursor, so it waits until
/// every overlay shown has said its page hears notices (`shot_ready`).
pub fn overlays_ready(shown: &[String], ready: &[String]) -> bool {
    !shown.is_empty() && shown.iter().all(|label| ready.contains(label))
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
// Overlays whose page listens for notices, by label (`shot_ready`).
static READY: Mutex<Vec<String>> = Mutex::new(Vec::new());
// True once the launch notice went out; held while it is decided and sent, so
// two overlays getting ready at once cannot both send it.
static NOTICE_SENT: Mutex<bool> = Mutex::new(false);

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
/// read here; `take` captures on a thread of its own, after the picker, if it was
/// up, has left the screen.
fn screen(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let settle = crate::shot_pick::hide_for_capture(app);
    let frames = shot_service::cg_frames(mtm);
    let front = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|a| front_window(&window_list(), a.processIdentifier()));
    // The main screen's CG frame starts at 0, 0 and is as tall as AppKit's flip.
    let primary = frames.first().map_or(0.0, |f| f.h);
    let p = NSEvent::mouseLocation();
    let index = pick_screen(&frames, front, (p.x, primary - p.y));
    if let Some(&rect) = frames.get(index) {
        shot_service::take_after(app, Target::Screen { rect }, Kind::Screen, index, settle);
    }
}

/// ⌘⇧4: the picker for a window or an area.
fn pick(app: &AppHandle) {
    crate::shot_pick::show(app, crate::shot_pick::PickMode::Both);
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
/// when the setting cannot be read, both count as taken, as the Mac's default has them.
fn mac_taken() -> (bool, bool) {
    match read_symbolic_hotkeys() {
        Ok(json) => parse_key_conflicts(&json),
        Err(e) => {
            eprintln!("notching: the Mac's screenshot shortcuts not read, so taken as the Mac's: {e}");
            (true, true)
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

// The notice for keys that do not reach Notching, once per launch, once every
// overlay hears notices. It counts as sent only when it was posted.
fn notice_if_due(app: &AppHandle) {
    let mut sent = NOTICE_SENT.lock().unwrap_or_else(|e| e.into_inner());
    if *sent {
        return;
    }
    let shown: Vec<String> = app.state::<Overlays>().0.lock().unwrap().keys().cloned().collect();
    if !overlays_ready(&shown, &READY.lock().unwrap()) {
        return;
    }
    let keys = keys(app);
    let lang = app.state::<CoreState>().0.lock().unwrap().lang();
    let Some((holder, names)) = conflict_notice_due(*sent, &keys, lang) else { return };
    let (title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.module_text(MODULE_ID, holder.title_key()), core.module_text(MODULE_ID, "notice.keys.detail"))
    };
    let title = title.map_or_else(|| names.clone(), |t| t.replace("{keys}", &names));
    match crate::notify::post(app, MODULE_ID, "keys", &title, &detail.unwrap_or_default()) {
        Ok(()) => *sent = true,
        Err(e) => eprintln!("notching: the screenshot keys notice was not sent: {e}"),
    }
}

/// At launch, on the main thread: the keys when the module is on. The notice
/// follows once the overlays' pages are up (`shot_ready`).
pub fn start(app: &AppHandle) {
    if shot_service::enabled(app) {
        register(app);
    }
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

/// An overlay's page listens for notices now: the launch notice goes once all have.
#[tauri::command]
pub fn shot_ready(app: AppHandle, window: WebviewWindow) {
    let label = window.label();
    if !label.starts_with("notch-") {
        return;
    }
    {
        let mut ready = READY.lock().unwrap();
        if !ready.iter().any(|l| l == label) {
            ready.push(label.to_string());
        }
    }
    std::thread::spawn(move || notice_if_due(&app));
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

    fn due(sent: bool, screen: KeyState, pick: KeyState, lang: Lang) -> Option<(Holder, String)> {
        conflict_notice_due(sent, &dto(screen, pick), lang)
    }

    fn some(holder: Holder, keys: &str) -> Option<(Holder, String)> {
        Some((holder, keys.to_string()))
    }

    #[test]
    fn conflict_notice_once_per_launch() {
        use KeyState::*;
        assert_eq!(due(true, Mac, Mac, Lang::Id), None);
        assert_eq!(due(true, Other, Other, Lang::Id), None);
        assert_eq!(due(false, Ok, Ok, Lang::Id), None);
        assert_eq!(due(false, Off, Off, Lang::Id), None);
    }

    #[test]
    fn conflict_notice_names_the_mac_keys() {
        use KeyState::*;
        assert_eq!(due(false, Mac, Mac, Lang::Id), some(Holder::Mac, "⌘⇧3 dan ⌘⇧4"));
        assert_eq!(due(false, Mac, Mac, Lang::En), some(Holder::Mac, "⌘⇧3 and ⌘⇧4"));
        assert_eq!(due(false, Mac, Ok, Lang::En), some(Holder::Mac, "⌘⇧3"));
    }

    #[test]
    fn conflict_notice_names_keys_of_another_app() {
        use KeyState::*;
        assert_eq!(due(false, Ok, Other, Lang::Id), some(Holder::Other, "⌘⇧4"));
        assert_eq!(due(false, Other, Ok, Lang::En), some(Holder::Other, "⌘⇧3"));
        // Both: the plural title.
        assert_eq!(due(false, Other, Other, Lang::En), some(Holder::OtherMany, "⌘⇧3 and ⌘⇧4"));
        assert_eq!(due(false, Other, Other, Lang::Id), some(Holder::OtherMany, "⌘⇧3 dan ⌘⇧4"));
    }

    // Mixed: the Mac's keys win, and only they are named.
    #[test]
    fn conflict_notice_mixed_names_only_the_mac_keys() {
        use KeyState::*;
        assert_eq!(due(false, Mac, Other, Lang::Id), some(Holder::Mac, "⌘⇧3"));
        assert_eq!(due(false, Other, Mac, Lang::En), some(Holder::Mac, "⌘⇧4"));
    }

    // Every title exists in the bundled module, in both languages, with a {keys} slot.
    #[test]
    fn notice_titles_are_in_the_module_locales() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../modules/screenshot/locales");
        for lang in ["id", "en"] {
            let text = std::fs::read_to_string(dir.join(format!("{lang}.json"))).unwrap();
            let json: serde_json::Value = serde_json::from_str(&text).unwrap();
            for holder in [Holder::Mac, Holder::Other, Holder::OtherMany] {
                let pointer = format!("/{}", holder.title_key().replace('.', "/"));
                let title = json.pointer(&pointer).and_then(|v| v.as_str()).unwrap_or_default();
                assert!(title.contains("{keys}"), "{lang} {pointer}: {title:?}");
            }
            assert!(json.pointer("/notice/keys/detail").is_some_and(|v| v.is_string()), "{lang} detail");
        }
    }

    #[test]
    fn launch_notice_waits_for_every_shown_overlay() {
        let labels = |l: &[&str]| l.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(overlays_ready(&labels(&["notch-0", "notch-1"]), &labels(&["notch-1", "notch-0"])));
        assert!(!overlays_ready(&labels(&["notch-0", "notch-1"]), &labels(&["notch-0"])));
        // A parked overlay that got ready earlier does not stand in for a shown one.
        assert!(!overlays_ready(&labels(&["notch-0"]), &labels(&["notch-2"])));
        assert!(overlays_ready(&labels(&["notch-0"]), &labels(&["notch-0", "notch-2"])));
        // No overlay yet: nowhere to show it.
        assert!(!overlays_ready(&[], &labels(&["notch-0"])));
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
            WindowBox { number: 1, pid: 7, layer: 25, bounds: rect(1.0) },
            WindowBox { number: 2, pid: 9, layer: 0, bounds: rect(2.0) },
            WindowBox { number: 3, pid: 7, layer: 0, bounds: rect(3.0) },
            WindowBox { number: 4, pid: 7, layer: 0, bounds: rect(4.0) },
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

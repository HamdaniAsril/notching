//! Screenshot's keys (design 1 Nov §4, design 3 Nov tombol): the two keys from the
//! settings (⌘⇧3 and ⌘⇧4 until changed) as Carbon hot keys while the module is on,
//! whether the Mac's own shortcuts still hold them, the first-use notice once
//! ever, then one small notice per launch while they do.

use std::ffi::c_void;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use std::time::Duration;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSWorkspace};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow};

use crate::app_core::CoreState;
use crate::geometry::Rect;
use crate::locale::Lang;
use crate::notify::{window_list, WindowBox};
use crate::overlay::Overlays;
use crate::shot::{pick_screen, KeyState, Kind, Target};
use crate::shot_keys::{from_web, label, mac_holds, set_key, Combo, MacHold, SetKeyError, ShotKeys, Which};
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
// Marks Notching's hot keys among any others the app target sees.
const SIGNATURE: u32 = u32::from_be_bytes(*b"ncsh");
const KEYBOARD_SHORTCUTS_PANE: &str = "x-apple.systempreferences:com.apple.Keyboard-Settings.extension?Shortcuts";

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Key {
    /// The whole screen (⌘⇧3 until changed).
    Screen,
    /// A window or an area (⌘⇧4 until changed).
    Pick,
}

impl Key {
    const ALL: [Key; 2] = [Key::Screen, Key::Pick];

    // The hot key id: the index in ALL plus one.
    fn id(self) -> u32 {
        self as u32 + 1
    }

    fn from_id(id: u32) -> Option<Key> {
        Key::ALL.into_iter().find(|k| k.id() == id)
    }

    fn combo(self, keys: &ShotKeys) -> Combo {
        match self {
            Key::Screen => keys.screen,
            Key::Pick => keys.pick,
        }
    }
}

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyLabels {
    pub screen: String,
    pub pick: String,
}

/// How each key stands, for the Screenshot page and Settings, with the keys' labels
/// and whether they were changed.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeysDto {
    pub screen: KeyState,
    pub pick: KeyState,
    pub labels: KeyLabels,
    pub custom: bool,
}

/// Off while the module is off. Otherwise what the Mac's own shortcuts hold (they
/// get the key first, whatever Notching registered), else what `register` gave.
pub fn combine(enabled: bool, registered: [KeyState; 2], mac: [MacHold; 2]) -> [KeyState; 2] {
    let state = |registered: KeyState, mac: MacHold| match (enabled, mac) {
        (false, _) => KeyState::Off,
        (true, MacHold::Screenshot) => KeyState::Mac,
        (true, MacHold::Shortcut) => KeyState::Shortcut,
        (true, MacHold::Free) => registered,
    };
    [state(registered[0], mac[0]), state(registered[1], mac[1])]
}

/// Who holds the keys a notice names; each has its own title.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Holder {
    /// One of the Mac's own shortcuts: `notice.keys.title`.
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

    /// For the notch's first-use notice: the Mac's keys can be freed in System Settings.
    fn page(self) -> &'static str {
        match self {
            Holder::Mac => "mac",
            Holder::Other | Holder::OtherMany => "other",
        }
    }
}

/// What the launch check does (design 3 Nov tombol §3).
#[derive(Clone, PartialEq, Debug)]
pub enum Launch {
    Nothing,
    /// Nothing is taken at the first check: the first-use notice is never needed.
    Settle,
    /// The first-use notice in the notch: who holds the keys, and which.
    First(Holder, String),
    /// The small notice, once per launch.
    Small(Holder, String),
}

const FREED_TITLE: &str = "notice.freed.title";

fn join(names: &[&str], lang: Lang) -> String {
    names.join(match lang {
        Lang::Id => " dan ",
        Lang::En => " and ",
    })
}

/// The launch check, once a launch, when the module is on. Keys a Mac shortcut
/// holds come first, since System Settings can free them; only then keys another
/// app holds. One notice names only one holder.
pub fn launch_notice(notice_shown: bool, sent: bool, states: [KeyState; 2], labels: [&str; 2], lang: Lang) -> Launch {
    if sent || states == [KeyState::Off; 2] {
        return Launch::Nothing;
    }
    let held_by = |wanted: &[KeyState]| {
        let names: Vec<&str> = states.iter().zip(labels).filter(|(s, _)| wanted.contains(s)).map(|(_, l)| l).collect();
        (!names.is_empty()).then_some(names)
    };
    let held = held_by(&[KeyState::Mac, KeyState::Shortcut]).map(|n| (Holder::Mac, n)).or_else(|| {
        held_by(&[KeyState::Other]).map(|n| (if n.len() > 1 { Holder::OtherMany } else { Holder::Other }, n))
    });
    match (held, notice_shown) {
        (None, false) => Launch::Settle,
        (None, true) => Launch::Nothing,
        (Some((holder, names)), false) => Launch::First(holder, join(&names, lang)),
        (Some((holder, names)), true) => Launch::Small(holder, join(&names, lang)),
    }
}

/// Every key that was watched no longer goes to one of the Mac's shortcuts.
pub fn freed(watched: [bool; 2], now: [KeyState; 2]) -> bool {
    watched.iter().zip(now).all(|(&w, s)| !w || !matches!(s, KeyState::Mac | KeyState::Shortcut))
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

/// The first-use notice, to the overlay under the cursor.
#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct SetupDto {
    pub holder: &'static str,
    pub keys: String,
}

const SETUP_EVENT: &str = "notching://shot-setup";
// The watch after "turn off the Mac's" (§5): every 2 s for at most 10 minutes.
const WATCH_EVERY: Duration = Duration::from_secs(2);
const WATCH_READS: u32 = 300;

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
// True once the launch check is done; held while it is decided and sent, so two
// overlays getting ready at once cannot both send it.
static NOTICE_SENT: Mutex<bool> = Mutex::new(false);
// A watch after "turn off the Mac's" is running.
static WATCHING: AtomicBool = AtomicBool::new(false);

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

/// The screen key: the screen of the frontmost window, or the cursor's. Only the
/// frames are read here; `take` captures on a thread of its own, after the picker,
/// if it was up, has left the screen.
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

/// The pick key: the picker for a window or an area.
fn pick(app: &AppHandle) {
    crate::shot_pick::show(app, crate::shot_pick::PickMode::Both);
}

fn saved_keys(app: &AppHandle) -> ShotKeys {
    app.state::<CoreState>().0.lock().unwrap().shot_keys()
}

/// Registers the two keys from the settings, replacing any earlier registration.
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
    let keys = saved_keys(app);
    let mut hot_keys = HOT_KEYS.lock().unwrap();
    let states = Key::ALL.map(|key| {
        let combo = key.combo(&keys);
        let mut hot_key = std::ptr::null_mut();
        let id = EventHotKeyID { signature: SIGNATURE, id: key.id() };
        // SAFETY: `hot_key` receives the ref, which stays valid until unregistered.
        let status =
            unsafe { RegisterEventHotKey(combo.code, combo.mods, id, GetApplicationEventTarget(), 0, &mut hot_key) };
        if status != NO_ERR || hot_key.is_null() {
            eprintln!("notching: {} not registered ({status})", label(combo));
            return KeyState::Other;
        }
        hot_keys.0[key as usize] = hot_key;
        KeyState::Ok
    });
    *REGISTERED.lock().unwrap() = states;
    eprintln!("notching: screenshot keys {} and {} registered: {states:?}", label(keys.screen), label(keys.pick));
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

/// The keys again from the settings when the module is on, else none, on the main
/// thread. Off it, waits until that is done.
fn reregister(app: &AppHandle) {
    let handle = app.clone();
    let run = move || {
        if shot_service::enabled(&handle) {
            register(&handle);
        } else {
            unregister();
        }
    };
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

/// Which of the two keys the Mac's own shortcuts hold. Read only; when the setting
/// cannot be read, the Mac's defaults count, so ⌘⇧3 and ⌘⇧4 are taken.
fn mac_held(keys: &ShotKeys) -> [MacHold; 2] {
    let json = read_symbolic_hotkeys().unwrap_or_else(|e| {
        eprintln!("notching: the Mac's shortcuts not read, so taken as the Mac's defaults: {e}");
        serde_json::json!({})
    });
    [mac_holds(&json, keys.screen), mac_holds(&json, keys.pick)]
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
    let combos = saved_keys(app);
    let mac = if enabled { mac_held(&combos) } else { [MacHold::Free; 2] };
    let [screen, pick] = combine(enabled, *REGISTERED.lock().unwrap(), mac);
    KeysDto {
        screen,
        pick,
        labels: KeyLabels { screen: label(combos.screen), pick: label(combos.pick) },
        custom: !combos.is_default(),
    }
}

fn module_text(app: &AppHandle, key: &str) -> Option<String> {
    app.state::<CoreState>().0.lock().unwrap().module_text(MODULE_ID, key)
}

// The launch check: once per launch, once every overlay hears notices. The
// first-use notice opens the notch under the cursor, once ever; after that, a
// small notice. The small one counts as sent only when it was posted.
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
    let (lang, notice_shown) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.lang(), core.shot_notice())
    };
    let labels = [keys.labels.screen.as_str(), keys.labels.pick.as_str()];
    match launch_notice(notice_shown, *sent, [keys.screen, keys.pick], labels, lang) {
        Launch::Nothing => {}
        Launch::Settle => {
            eprintln!("notching: screenshot keys free at the first check, so no first-use notice");
            mark_notice(app);
            *sent = true;
        }
        Launch::First(holder, names) => {
            let handle = app.clone();
            let setup = SetupDto { holder: holder.page(), keys: names };
            let _ = app.run_on_main_thread(move || {
                let Some(mtm) = MainThreadMarker::new() else { return };
                let label = shot_service::cursor_label(&handle, mtm);
                match handle.emit_to(EventTarget::webview_window(&label), SETUP_EVENT, &setup) {
                    Ok(()) => eprintln!("notching: screenshot first-use notice on {label} ({}: {})", setup.holder, setup.keys),
                    Err(e) => eprintln!("notching: the screenshot first-use notice was not sent: {e}"),
                }
            });
            mark_notice(app);
            *sent = true;
        }
        Launch::Small(holder, names) => {
            let title = module_text(app, holder.title_key());
            let title = title.map_or_else(|| names.clone(), |t| t.replace("{keys}", &names));
            let detail = module_text(app, "notice.keys.detail").unwrap_or_default();
            match crate::notify::post(app, MODULE_ID, "keys", &title, &detail) {
                Ok(()) => *sent = true,
                Err(e) => eprintln!("notching: the screenshot keys notice was not sent: {e}"),
            }
        }
    }
}

fn mark_notice(app: &AppHandle) {
    if let Err(e) = app.state::<CoreState>().0.lock().unwrap().set_shot_notice() {
        eprintln!("notching: the screenshot first-use notice not saved as shown: {e:?}");
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

/// The settings window closed: keys a recording there let go of come back (§6).
pub fn settings_closed(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if shot_service::enabled(&handle) && *REGISTERED.lock().unwrap() == [KeyState::Off; 2] {
            register(&handle);
        }
    });
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

/// "Turn off the Mac's" (§5): System Settings opens, and the keys the Mac holds are
/// watched until they are free, for at most 10 minutes; then a notice says so.
#[tauri::command]
pub fn shot_turn_off_mac(app: AppHandle) {
    open_keyboard_shortcuts();
    if WATCHING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        watch(&app);
        WATCHING.store(false, Ordering::SeqCst);
    });
}

fn watch(app: &AppHandle) {
    let held = |s: KeyState| matches!(s, KeyState::Mac | KeyState::Shortcut);
    let start = keys(app);
    let watched = [held(start.screen), held(start.pick)];
    eprintln!("notching: watching the Mac's shortcuts for screenshot keys {watched:?}");
    if !watched.contains(&true) {
        return;
    }
    for _ in 0..WATCH_READS {
        std::thread::sleep(WATCH_EVERY);
        let now = keys(app);
        if !freed(watched, [now.screen, now.pick]) {
            continue;
        }
        let names: Vec<&str> =
            [&now.labels.screen, &now.labels.pick].into_iter().zip(watched).filter(|&(_, w)| w).map(|(l, _)| l.as_str()).collect();
        let names = join(&names, app.state::<CoreState>().0.lock().unwrap().lang());
        let title = module_text(app, FREED_TITLE).map_or_else(|| names.clone(), |t| t.replace("{keys}", &names));
        eprintln!("notching: the Mac let go of screenshot keys {names}");
        if let Err(e) = crate::notify::post(app, MODULE_ID, "keys", &title, "") {
            eprintln!("notching: the screenshot keys freed notice was not sent: {e}");
        }
        return;
    }
    eprintln!("notching: the Mac kept screenshot keys for 10 minutes; watch over");
}

/// While Settings records a key, Notching's own keys let go, so pressing ⌘⇧4 there
/// does not open the picker (§6).
#[tauri::command]
pub fn shot_keys_hold(app: AppHandle, hold: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if hold {
            unregister();
        } else if shot_service::enabled(&handle) {
            register(&handle);
        }
    });
}

/// A key recorded in Settings: the key's place (`KeyboardEvent.code`) and its modifiers.
#[tauri::command]
pub async fn shot_set_key(
    app: AppHandle,
    which: Which,
    code: String,
    cmd: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
) -> Result<KeysDto, SetKeyError> {
    let next = set_key(saved_keys(&app), which, from_web(&code, cmd, ctrl, alt, shift))?;
    save_keys(&app, next);
    Ok(keys(&app))
}

/// Back to ⌘⇧3 and ⌘⇧4.
#[tauri::command]
pub async fn shot_reset_keys(app: AppHandle) -> KeysDto {
    save_keys(&app, ShotKeys::default());
    keys(&app)
}

fn save_keys(app: &AppHandle, next: ShotKeys) {
    if let Err(e) = app.state::<CoreState>().0.lock().unwrap().set_shot_keys(next) {
        eprintln!("notching: screenshot keys not saved: {e:?}");
    }
    eprintln!("notching: screenshot keys set to {} and {}", label(next.screen), label(next.pick));
    reregister(app);
}

#[cfg(test)]
mod tests {
    use super::*;
    use KeyState::*;

    const DEFAULT: [&str; 2] = ["⌘⇧3", "⌘⇧4"];

    fn first(holder: Holder, keys: &str) -> Launch {
        Launch::First(holder, keys.to_string())
    }

    fn small(holder: Holder, keys: &str) -> Launch {
        Launch::Small(holder, keys.to_string())
    }

    #[test]
    fn launch_notice_first_then_small() {
        assert_eq!(launch_notice(false, false, [Mac, Mac], DEFAULT, Lang::Id), first(Holder::Mac, "⌘⇧3 dan ⌘⇧4"));
        assert_eq!(launch_notice(true, false, [Mac, Ok], DEFAULT, Lang::Id), small(Holder::Mac, "⌘⇧3"));
        assert_eq!(launch_notice(true, false, [Mac, Mac], DEFAULT, Lang::En), small(Holder::Mac, "⌘⇧3 and ⌘⇧4"));
        assert_eq!(launch_notice(false, false, [Ok, Other], DEFAULT, Lang::Id), first(Holder::Other, "⌘⇧4"));
    }

    #[test]
    fn launch_notice_once_per_launch() {
        assert_eq!(launch_notice(true, true, [Mac, Mac], DEFAULT, Lang::Id), Launch::Nothing);
        assert_eq!(launch_notice(false, true, [Mac, Mac], DEFAULT, Lang::Id), Launch::Nothing);
        assert_eq!(launch_notice(true, false, [Ok, Ok], DEFAULT, Lang::Id), Launch::Nothing);
    }

    // Nothing taken at the first check: the notice is never needed (§3).
    #[test]
    fn launch_notice_settles_when_nothing_is_taken() {
        assert_eq!(launch_notice(false, false, [Ok, Ok], DEFAULT, Lang::Id), Launch::Settle);
        // The module is off: nothing to decide yet.
        assert_eq!(launch_notice(false, false, [Off, Off], DEFAULT, Lang::Id), Launch::Nothing);
    }

    #[test]
    fn launch_notice_names_keys_of_another_app() {
        assert_eq!(launch_notice(true, false, [Other, Ok], DEFAULT, Lang::En), small(Holder::Other, "⌘⇧3"));
        assert_eq!(launch_notice(true, false, [Other, Other], DEFAULT, Lang::En), small(Holder::OtherMany, "⌘⇧3 and ⌘⇧4"));
        assert_eq!(launch_notice(false, false, [Other, Other], DEFAULT, Lang::Id), first(Holder::OtherMany, "⌘⇧3 dan ⌘⇧4"));
    }

    // Mixed: the Mac's keys win, and only they are named. A Mac shortcut is the Mac's.
    #[test]
    fn launch_notice_mixed_names_only_the_mac_keys() {
        assert_eq!(launch_notice(true, false, [Mac, Other], DEFAULT, Lang::Id), small(Holder::Mac, "⌘⇧3"));
        assert_eq!(launch_notice(true, false, [Other, Mac], DEFAULT, Lang::En), small(Holder::Mac, "⌘⇧4"));
        assert_eq!(launch_notice(false, false, [Shortcut, Ok], ["⌃⇧S", "⌃⇧A"], Lang::Id), first(Holder::Mac, "⌃⇧S"));
    }

    #[test]
    fn holders_go_to_the_notch_as_mac_or_other() {
        assert_eq!(Holder::Mac.page(), "mac");
        assert_eq!(Holder::Other.page(), "other");
        assert_eq!(Holder::OtherMany.page(), "other");
    }

    #[test]
    fn freed_waits_for_every_watched_key() {
        assert!(!freed([true, true], [Ok, Mac]));
        assert!(freed([true, false], [Ok, Mac]));
        assert!(freed([true, true], [Ok, Other]));
        assert!(!freed([false, true], [Ok, Shortcut]));
    }

    // Every title exists in the bundled module, in both languages, with a {keys} slot.
    #[test]
    fn notice_titles_are_in_the_module_locales() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../modules/screenshot/locales");
        for lang in ["id", "en"] {
            let text = std::fs::read_to_string(dir.join(format!("{lang}.json"))).unwrap();
            let json: serde_json::Value = serde_json::from_str(&text).unwrap();
            for key in [Holder::Mac.title_key(), Holder::Other.title_key(), Holder::OtherMany.title_key(), FREED_TITLE] {
                let pointer = format!("/{}", key.replace('.', "/"));
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
        use MacHold::*;
        assert_eq!(combine(true, [Ok, Ok], [Screenshot, Free]), [Mac, Ok]);
        assert_eq!(combine(true, [Other, Ok], [Screenshot, Screenshot]), [Mac, Mac]);
        assert_eq!(combine(true, [Ok, Ok], [Free, MacHold::Shortcut]), [Ok, KeyState::Shortcut]);
        assert_eq!(combine(true, [Ok, Other], [Free, Free]), [Ok, Other]);
        assert_eq!(combine(false, [Ok, Ok], [Screenshot, Screenshot]), [Off, Off]);
        // Switched on but never registered (as before `register` runs).
        assert_eq!(combine(true, [Off, Off], [Free, Free]), [Off, Off]);
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
        let dto = KeysDto {
            screen: Mac,
            pick: KeyState::Shortcut,
            labels: KeyLabels { screen: "⌘⇧3".into(), pick: "⌃⇧A".into() },
            custom: true,
        };
        assert_eq!(
            serde_json::to_value(dto).unwrap(),
            serde_json::json!({ "screen": "mac", "pick": "shortcut", "labels": { "screen": "⌘⇧3", "pick": "⌃⇧A" }, "custom": true })
        );
        assert_eq!(serde_json::to_value(SetupDto { holder: "mac", keys: "⌘⇧3".into() }).unwrap(), serde_json::json!({ "holder": "mac", "keys": "⌘⇧3" }));
    }
}

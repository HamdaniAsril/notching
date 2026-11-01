//! Runs Keyboard Cleaning Mode in the core: the keyboard lock, the dim layer, the
//! screen held on, the icon beside the notch, and every way it ends (design 31
//! Oct, Keyboard Cleaning Mode §6).

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{NSWorkspace, NSWorkspaceScreensDidSleepNotification, NSWorkspaceWillSleepNotification};
use objc2_foundation::{
    NSDistributedNotificationCenter, NSNotification, NSNotificationCenter, NSObjectProtocol, NSOperationQueue, NSString,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_core::CoreState;
use crate::awake_hold::Hold;
use crate::keyclean::{blocked, Blocked, KeyClean, Press, Step, Toggle, WAIT_MAX_MS};
use crate::keyclean_tap::{Key, Tap};
use crate::locale::Lang;
use crate::status::{self, Activity};

/// Sent to every window with a CleanStateDto whenever the mode changes.
pub const CLEAN_EVENT: &str = "notching://clean";
/// What `pmset -g assertions` shows next to the process while the mode is on.
const HOLD_NAME: &str = "Notching keyboard cleaning";
const SCREEN_LOCKED: &str = "com.apple.screenIsLocked";

/// Same shape as CleanState in src/clean/main.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanStateDto {
    pub on: bool,
    pub presses: u8,
    pub lang: Lang,
}

struct Mode {
    rules: KeyClean,
    tap: Option<Tap>,
    hold: Option<Hold>,
}

pub struct KeyCleanState {
    mode: Mutex<Mode>,
    // Held through a whole toggle or stop, so two clicks can never install two
    // taps, and a show and a hide reach the main thread in the order they were made.
    switching: Mutex<()>,
    poked: Arc<(Mutex<bool>, Condvar)>,
}

// The tap's key handler is a plain fn, so it finds the app here.
static APP: OnceLock<AppHandle> = OnceLock::new();

thread_local! {
    static OBSERVERS: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>> = const { RefCell::new(Vec::new()) };
}

fn now() -> i64 {
    chrono::Local::now().timestamp_millis()
}

fn poke(state: &KeyCleanState) {
    let (lock, cvar) = &*state.poked;
    *lock.lock().unwrap() = true;
    cvar.notify_one();
}

/// On the main thread, at launch: the state, the thread for the safety and the
/// count's reset, and the sleep and lock observers.
pub fn start(app: AppHandle) {
    let _ = APP.set(app.clone());
    let poked = Arc::new((Mutex::new(false), Condvar::new()));
    app.manage(KeyCleanState {
        mode: Mutex::new(Mode { rules: KeyClean::default(), tap: None, hold: None }),
        switching: Mutex::new(()),
        poked: poked.clone(),
    });
    watch_sleep_and_lock(&app);
    let handle = app.clone();
    let spawned = std::thread::Builder::new().name("notching-keyclean".into()).spawn(move || loop {
        let ms = tick(&handle);
        let (lock, cvar) = &*poked;
        let mut was_poked = lock.lock().unwrap();
        if !*was_poked {
            was_poked = cvar.wait_timeout(was_poked, Duration::from_millis(ms as u64)).unwrap().0;
        }
        *was_poked = false;
    });
    if let Err(e) = spawned {
        eprintln!("notching: keyboard cleaning did not start: {e}");
    }
}

fn tick(app: &AppHandle) -> i64 {
    let step = app.state::<KeyCleanState>().mode.lock().unwrap().rules.step(now());
    match step {
        Step::Off => WAIT_MAX_MS,
        Step::Ended(_) => {
            stop(app);
            WAIT_MAX_MS
        }
        Step::Reset => {
            emit(app);
            0
        }
        Step::Wait(ms) => ms.max(1),
    }
}

pub fn state(app: &AppHandle) -> CleanStateDto {
    let (on, presses) = {
        let state = app.state::<KeyCleanState>();
        let mode = state.mode.lock().unwrap();
        (mode.rules.owner().is_some(), mode.rules.presses(now()))
    };
    let lang = app.state::<CoreState>().0.lock().unwrap().lang();
    CleanStateDto { on, presses, lang }
}

fn emit(app: &AppHandle) {
    let _ = app.emit(CLEAN_EVENT, state(app));
}

#[tauri::command]
pub fn get_clean_state(app: AppHandle) -> CleanStateDto {
    state(&app)
}

/// The tile's action: on when off, off when on. Nothing dims without the
/// keyboard lock, which needs Accessibility.
pub fn toggle(app: &AppHandle, owner: &str) -> Result<(), String> {
    let state = app.state::<KeyCleanState>();
    let _switching = state.switching.lock().unwrap();
    let on = state.mode.lock().unwrap().rules.owner().is_some();
    if on {
        stop_now(app);
        return Ok(());
    }
    // Ask macOS (and show its own request) only when the rest is fine.
    let secure = crate::keyclean_tap::secure_input();
    if let Some(why) = blocked(crate::keyclean_tap::trusted(true), secure) {
        tell(app, owner, &why);
        return Err(match why {
            Blocked::Permission => "accessibility is not allowed",
            Blocked::SecureInput => "secure input is on",
        }
        .into());
    }
    let tap = Tap::install(on_key).ok_or_else(|| {
        tell(app, owner, &Blocked::Permission);
        "the keyboard could not be locked".to_string()
    })?;
    {
        let mut mode = state.mode.lock().unwrap();
        // Under `switching`, nothing else turned it on meanwhile.
        if mode.rules.toggle(owner, now()) != Toggle::On {
            return Ok(());
        }
        mode.tap = Some(tap);
        mode.hold = Hold::take_named(HOLD_NAME);
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        crate::keyclean_dim::show(&handle);
        crate::overlay::set_raised(&handle, true);
    });
    if let Err(e) = status::set_icon(app, owner, Activity::On) {
        eprintln!("notching: keyboard cleaning status: {e}");
    }
    emit(app);
    poke(&app.state::<KeyCleanState>());
    Ok(())
}

// Every way the mode ends: the lock, the hold and the dim layer go, then the icon.
pub fn stop(app: &AppHandle) {
    let state = app.state::<KeyCleanState>();
    let _switching = state.switching.lock().unwrap();
    stop_now(app);
}

// With `switching` held.
fn stop_now(app: &AppHandle) {
    let owner = {
        let state = app.state::<KeyCleanState>();
        let mut mode = state.mode.lock().unwrap();
        mode.tap = None;
        mode.hold = None;
        mode.rules.stop()
    };
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        crate::keyclean_dim::hide(&handle);
        crate::overlay::set_raised(&handle, false);
    });
    if let Some(owner) = owner {
        status::clear(app, &owner);
    }
    emit(app);
    poke(&app.state::<KeyCleanState>());
}

/// The module was switched off or uninstalled: the mode ends with it.
pub fn module_gone(app: &AppHandle, id: &str) {
    let owns = app.state::<KeyCleanState>().mode.lock().unwrap().rules.owner() == Some(id);
    if owns {
        stop(app);
    }
}

// From the tap, on the main thread: Esc counts, the fifth ends the mode; Cmd+Q quits.
fn on_key(key: Key) {
    let Some(app) = APP.get() else { return };
    match key {
        Key::Escape => {
            let press = app.state::<KeyCleanState>().mode.lock().unwrap().rules.esc(now());
            match press {
                Press::Done(_) => stop(app),
                Press::Count(_) => {
                    emit(app);
                    poke(&app.state::<KeyCleanState>());
                }
                Press::Ignored => {}
            }
        }
        // Through the editor, so its edits are committed first.
        Key::Quit => crate::editor_window::quit(app),
        Key::Other => {}
    }
}

// Why nothing dimmed, on the module's "blocked" channel.
fn tell(app: &AppHandle, owner: &str, why: &Blocked) {
    let key = match why {
        Blocked::Permission => "permission",
        Blocked::SecureInput => "secure",
    };
    let (title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.module_text(owner, &format!("notice.{key}.title")), core.module_text(owner, &format!("notice.{key}.detail")))
    };
    let title = title.unwrap_or_else(|| "Keyboard".into());
    if let Err(e) = crate::notify::post(app, owner, "blocked", &title, detail.as_deref().unwrap_or("")) {
        eprintln!("notching: the keyboard cleaning notice was not sent: {e}");
    }
}

// Sleep, the screens sleeping and the screen locking all end the mode, so the
// password can be typed.
fn watch_sleep_and_lock(app: &AppHandle) {
    let observe = |center: &NSNotificationCenter, name: &NSString| {
        let app = app.clone();
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            let on = app.state::<KeyCleanState>().mode.lock().unwrap().rules.owner().is_some();
            if on {
                stop(&app);
            }
        });
        // SAFETY: the block lives as long as its observer, kept below for the app's life.
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(Some(name), None, Some(&NSOperationQueue::mainQueue()), &block)
        };
        OBSERVERS.with(|o| o.borrow_mut().push(observer));
    };
    let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: AppKit's notification names are static strings.
    unsafe {
        observe(&workspace, NSWorkspaceWillSleepNotification);
        observe(&workspace, NSWorkspaceScreensDidSleepNotification);
    }
    observe(&NSDistributedNotificationCenter::defaultCenter(), &NSString::from_str(SCREEN_LOCKED));
}

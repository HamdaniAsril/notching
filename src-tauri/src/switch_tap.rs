//! The window switcher's keys (Intip jendela, design 5 Nov §6): a session event
//! tap for key downs, key ups and modifier changes, on a thread of its own.
//! With the switcher closed only its trigger (⌘Tab unless changed) is taken;
//! every other key goes straight on. While it is open, its keys are held back
//! and sent to the switcher (switch_service.rs) on the main thread, and letting
//! go of the trigger's modifier opens the selection.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;

use crate::shot_keys::{Combo, CMD, CONTROL, OPTION, SHIFT};
use crate::switch_rules::{SwitchAction, SwitchKey, SwitchKeys};

// Marks the keys Notching posts, so the tap lets them through: "ncsw".
const MARK: i64 = 0x6e63_7377;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events: u64,
        callback: extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
        user_info: *mut c_void,
    ) -> *mut c_void;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
    fn CGEventGetFlags(event: *mut c_void) -> u64;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortCreateRunLoopSource(allocator: *const c_void, port: *mut c_void, order: isize) -> *mut c_void;
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRunLoopGetCurrent() -> *mut c_void;
    fn CFRunLoopRun();
    fn CFRunLoopStop(rl: *mut c_void);
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRetain(cf: *const c_void) -> *const c_void;
    fn CFRelease(cf: *const c_void);
    static kCFRunLoopDefaultMode: *const c_void;
}

const SESSION_TAP: u32 = 1; // kCGSessionEventTap
const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
const FILTER: u32 = 0; // kCGEventTapOptionDefault: may drop events
const KEY_DOWN: u32 = 10;
const KEY_UP: u32 = 11;
const FLAGS_CHANGED: u32 = 12;
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
const FIELD_AUTOREPEAT: u32 = 8; // kCGKeyboardEventAutorepeat
const FIELD_KEYCODE: u32 = 9; // kCGKeyboardEventKeycode
const FIELD_USER_DATA: u32 = 42; // kCGEventSourceUserData

// CGEventFlags' device-independent modifiers.
const CG_SHIFT: u64 = 0x2_0000;
const CG_CONTROL: u64 = 0x4_0000;
const CG_OPTION: u64 = 0x8_0000;
const CG_COMMAND: u64 = 0x10_0000;

static APP: OnceLock<AppHandle> = OnceLock::new();
static TAP: Mutex<Option<Tap>> = Mutex::new(None);
static PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
static KEYS: Mutex<SwitchKeys> = Mutex::new(SwitchKeys::new());
static TRIGGER: Mutex<Combo> = Mutex::new(crate::peek_rules::SWITCHER_KEY);
// While a key is being recorded in Settings: every key passes.
static HELD: AtomicBool = AtomicBool::new(false);

/// CGEventFlags as Carbon modifiers, the way combos are kept.
fn carbon(flags: u64) -> u32 {
    [(CG_COMMAND, CMD), (CG_SHIFT, SHIFT), (CG_OPTION, OPTION), (CG_CONTROL, CONTROL)]
        .into_iter()
        .filter(|&(cg, _)| flags & cg != 0)
        .fold(0, |m, (_, c)| m | c)
}

fn send(action: SwitchAction) {
    let Some(app) = APP.get().cloned() else { return };
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || crate::switch_service::key(&handle, action));
}

extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
        let port = PORT.load(Ordering::SeqCst);
        if !port.is_null() {
            // SAFETY: the port is released only on this same thread, after its run loop ends.
            unsafe { CGEventTapEnable(port, true) };
        }
        return event;
    }
    if HELD.load(Ordering::SeqCst) {
        return event;
    }
    // SAFETY: `event` is the CGEventRef the tap was handed.
    let (mark, flags) = unsafe { (CGEventGetIntegerValueField(event, FIELD_USER_DATA), CGEventGetFlags(event)) };
    if mark == MARK {
        return event;
    }
    let key = match kind {
        KEY_DOWN => {
            // SAFETY: as above.
            let (code, repeat) =
                unsafe { (CGEventGetIntegerValueField(event, FIELD_KEYCODE), CGEventGetIntegerValueField(event, FIELD_AUTOREPEAT) != 0) };
            SwitchKey::Down { code: code as u16, mods: carbon(flags), repeat }
        }
        FLAGS_CHANGED => SwitchKey::Flags { mods: carbon(flags) },
        // A key let go while the switcher is open is its own.
        KEY_UP => return if KEYS.lock().unwrap().is_open() { std::ptr::null_mut() } else { event },
        _ => return event,
    };
    let trigger = *TRIGGER.lock().unwrap();
    let action = KEYS.lock().unwrap().on(key, trigger);
    match action {
        SwitchAction::Pass => event,
        SwitchAction::Swallow => std::ptr::null_mut(),
        // Letting go of the modifier opens the selection; the change itself goes on.
        SwitchAction::Commit if kind == FLAGS_CHANGED => {
            send(action);
            event
        }
        _ => {
            send(action);
            std::ptr::null_mut()
        }
    }
}

/// A window button was used: letting go of the trigger no longer opens.
pub fn acted() {
    KEYS.lock().unwrap().acted();
}

/// The switcher closed (a click, or its list ran empty).
pub fn closed() {
    KEYS.lock().unwrap().closed();
}

/// While a key is being recorded in Settings, the tap lets every key through.
pub fn hold(on: bool) {
    HELD.store(on, Ordering::SeqCst);
    if on {
        closed();
    }
}

/// The event tap, on a run loop of its own thread. Dropping it stops that run
/// loop; the thread then takes the tap down itself.
struct Tap {
    run_loop: *mut c_void,
    thread: Option<std::thread::JoinHandle<()>>,
}

// SAFETY: the run loop ref is retained and only used to stop it, which
// CoreFoundation allows from any thread.
unsafe impl Send for Tap {}

struct Ptr(*mut c_void);
// SAFETY: only carried from the tap's thread back to the one that started it.
unsafe impl Send for Ptr {}

impl Tap {
    /// None when macOS refuses it (no Accessibility permission).
    fn install() -> Option<Tap> {
        let (sent, got) = std::sync::mpsc::sync_channel::<Option<Ptr>>(1);
        let mask = (1u64 << KEY_DOWN) | (1u64 << KEY_UP) | (1u64 << FLAGS_CHANGED);
        let thread = std::thread::Builder::new()
            .name("notching-switch-tap".into())
            .spawn(move || {
                // SAFETY: plain CoreGraphics and CoreFoundation calls with checked
                // results; everything made here is released here, once.
                unsafe {
                    let port = CGEventTapCreate(SESSION_TAP, HEAD_INSERT, FILTER, mask, on_event, std::ptr::null_mut());
                    if port.is_null() {
                        let _ = sent.send(None);
                        return;
                    }
                    let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
                    if source.is_null() {
                        CFMachPortInvalidate(port);
                        CFRelease(port);
                        let _ = sent.send(None);
                        return;
                    }
                    let rl = CFRunLoopGetCurrent();
                    CFRunLoopAddSource(rl, source, kCFRunLoopDefaultMode);
                    PORT.store(port, Ordering::SeqCst);
                    CGEventTapEnable(port, true);
                    let _ = sent.send(Some(Ptr(CFRetain(rl) as *mut c_void)));
                    CFRunLoopRun();
                    PORT.store(std::ptr::null_mut(), Ordering::SeqCst);
                    CGEventTapEnable(port, false);
                    CFRunLoopRemoveSource(rl, source, kCFRunLoopDefaultMode);
                    CFMachPortInvalidate(port);
                    CFRelease(source);
                    CFRelease(port);
                }
            })
            .ok()?;
        match got.recv() {
            Ok(Some(rl)) => Some(Tap { run_loop: rl.0, thread: Some(thread) }),
            _ => {
                let _ = thread.join();
                None
            }
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        // SAFETY: the run loop was retained by `install` and is released once, here.
        unsafe { CFRunLoopStop(self.run_loop) };
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // SAFETY: as above.
        unsafe { CFRelease(self.run_loop) };
    }
}

/// The tap in while `want`, listening for `trigger`; out otherwise (the
/// switcher then also counts as closed). True when the tap is in. Safe from any
/// thread.
pub fn sync(app: &AppHandle, want: bool, trigger: Combo) -> bool {
    let _ = APP.set(app.clone());
    *TRIGGER.lock().unwrap() = trigger;
    let mut tap = TAP.lock().unwrap();
    if !want {
        if tap.take().is_some() {
            eprintln!("notching: switcher key tap removed");
        }
        closed();
        return false;
    }
    if tap.is_none() {
        *tap = Tap::install();
        eprintln!("notching: switcher key tap installed: {}", tap.is_some());
    }
    tap.is_some()
}

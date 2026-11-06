//! Keeps Notching's key and mouse taps from holding the Mac up (tap_rules.rs).
//! Every tap asks here before turning itself back on after macOS turned it
//! off, and a watch reads the Accessibility permission each second, so a
//! permission taken away takes every tap out within a second, whether or not
//! macOS says the list changed.

use std::ffi::c_void;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::tap_rules::{AccessWatch, Revive};

const READ_EVERY: Duration = Duration::from_secs(1);
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;

// kCGSessionEventTap, kCGTailAppendEventTap, kCGEventTapOptionDefault, and
// kCGEventOtherMouseDragged: the test tap the CekIzin probe made.
const SESSION_TAP: u32 = 1;
const TAIL_APPEND: u32 = 1;
const FILTER: u32 = 0;
const OTHER_MOUSE_DRAGGED: u64 = 27;

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
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRelease(cf: *const c_void);
}

extern "C" fn pass(_proxy: *mut c_void, _kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    event
}

/// Whether macOS still lets Notching make a tap: a test tap for a rare event
/// (a middle-button drag) is made and taken down at once, never put on a run
/// loop. macOS answers this fresh. Safe from any thread.
pub fn can_tap() -> bool {
    // SAFETY: a tap made here and released here, once; a null result means refused.
    unsafe {
        let port = CGEventTapCreate(SESSION_TAP, TAIL_APPEND, FILTER, 1 << OTHER_MOUSE_DRAGGED, pass, std::ptr::null_mut());
        if port.is_null() {
            return false;
        }
        CGEventTapEnable(port, false);
        CFMachPortInvalidate(port);
        CFRelease(port);
        true
    }
}

/// macOS turned the tap `name` off (`kind`): true when it may come back on.
/// Said in the log either way. On the tap's own thread.
pub fn revive(r: &Mutex<Revive>, name: &str, kind: u32) -> bool {
    let trusted = crate::keyclean_tap::trusted(false);
    let again = r.lock().unwrap_or_else(|e| e.into_inner()).after_off(Instant::now(), trusted);
    eprintln!(
        "notching: {name} tap turned off by macOS ({}), permission {}: {}",
        if kind == DISABLED_BY_TIMEOUT { "too slow" } else { "user input" },
        if trusted { "there" } else { "gone" },
        if again { "back on" } else { "left off" },
    );
    again
}

/// Left off: the next sync takes it out and, if wanted, puts a new one in.
pub fn dead(r: &Mutex<Revive>) -> bool {
    r.lock().unwrap_or_else(|e| e.into_inner()).dead()
}

/// A new tap goes in: its record starts fresh.
pub fn fresh(r: &Mutex<Revive>) {
    r.lock().unwrap_or_else(|e| e.into_inner()).reset();
}

/// Each second, the permission; a change brings every tap in line. At launch.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("notching-access-watch".into()).spawn(move || {
        let mut watch = AccessWatch::default();
        let mut first = true;
        loop {
            let now = crate::keyclean_tap::trusted(false);
            let told = watch.changed(now);
            if first || told {
                eprintln!(
                    "notching: Accessibility {} (AXIsProcessTrusted {}, test tap {})",
                    if first { "at launch" } else if now { "given; the taps follow" } else { "taken away; the taps follow" },
                    crate::keyclean_tap::ax_says(),
                    can_tap(),
                );
                first = false;
            }
            if told {
                crate::cut_service::sync(&app);
                crate::peek_service::sync(&app);
                crate::switch_service::sync(&app);
            }
            std::thread::sleep(READ_EVERY);
        }
    });
    if let Err(e) = spawned {
        eprintln!("notching: the Accessibility watch did not start: {e}");
    }
}

//! Keeps Notching's key and mouse taps from holding the Mac up (tap_rules.rs).
//! Every tap asks here before turning itself back on after macOS turned it
//! off, and a watch reads the Accessibility permission each second, so a
//! permission taken away takes every tap out within a second, whether or not
//! macOS says the list changed.

use std::ffi::c_void;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2_foundation::NSString;
use tauri::AppHandle;

use crate::tap_rules::{AccessWatch, Revive};

const READ_EVERY: Duration = Duration::from_secs(1);
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;

type PreflightFn = unsafe extern "C" fn(service: *const c_void, options: *const c_void) -> i32;

struct Tcc {
    preflight: PreflightFn,
    service: Retained<NSString>,
}

// SAFETY: a function pointer and an immutable NSString, read from any thread.
unsafe impl Send for Tcc {}
unsafe impl Sync for Tcc {}

static TCC: OnceLock<Option<Tcc>> = OnceLock::new();

fn load_tcc() -> Option<Tcc> {
    // SAFETY: dlopen and dlsym with C strings; TCCAccessPreflight has this
    // type in every macOS that has it (private, as Notching's other system calls).
    unsafe {
        let lib = libc::dlopen(c"/System/Library/PrivateFrameworks/TCC.framework/TCC".as_ptr(), libc::RTLD_LAZY);
        if lib.is_null() {
            return None;
        }
        let f = libc::dlsym(lib, c"TCCAccessPreflight".as_ptr());
        if f.is_null() {
            return None;
        }
        Some(Tcc {
            preflight: std::mem::transmute::<*mut c_void, PreflightFn>(f),
            service: NSString::from_str("kTCCServiceAccessibility"),
        })
    }
}

/// TCC's own answer for Notching's Accessibility, asked fresh each time; None
/// when this macOS has no such call. Safe from any thread.
pub fn tcc_answer() -> Option<i32> {
    let tcc = TCC.get_or_init(load_tcc).as_ref()?;
    // SAFETY: an NSString is a CFStringRef; no options.
    Some(unsafe { (tcc.preflight)(Retained::as_ptr(&tcc.service).cast(), std::ptr::null()) })
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
                    "notching: Accessibility {} (AXIsProcessTrusted {}, TCC {:?})",
                    if first { "at launch" } else if now { "given; the taps follow" } else { "taken away; the taps follow" },
                    crate::keyclean_tap::ax_says(),
                    tcc_answer(),
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

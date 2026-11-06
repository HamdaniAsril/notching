//! Keeps Notching's key and mouse taps from holding the Mac up (tap_rules.rs).
//! Every tap asks here before turning itself back on after macOS turned it
//! off, and a watch reads the Accessibility permission each second, so a
//! permission taken away takes every tap out within a second, whether or not
//! macOS says the list changed.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::tap_rules::{AccessWatch, Revive};

const READ_EVERY: Duration = Duration::from_secs(1);
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;

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
        loop {
            let now = crate::keyclean_tap::trusted(false);
            if watch.changed(now) {
                eprintln!("notching: Accessibility {}; the taps follow", if now { "given" } else { "taken away" });
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

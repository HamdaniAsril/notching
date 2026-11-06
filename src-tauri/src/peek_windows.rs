//! Intip jendela's windows (design 5 Nov §6, §8): an app's standard windows
//! through Accessibility, in the window server's order, and what the peek does
//! to them. Each call finds the window again by its number; one that is gone
//! is left alone. Accessibility calls wait at most half a second (ax.rs).

use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};

use crate::ax::{self, Cf};
use crate::geometry::Rect;
use crate::peek_rules::{merge, AxWin, WinInfo};

// The app's standard windows that have a number, with their elements.
fn ax_windows(pid: i32) -> Vec<(AxWin, Cf)> {
    let Some(app) = ax::app(pid) else { return Vec::new() };
    ax::windows(&app)
        .into_iter()
        .filter(ax::is_standard)
        .filter_map(|w| {
            let id = ax::window_id(&w)?;
            let info = AxWin {
                id,
                title: ax::title(&w).unwrap_or_default(),
                minimized: ax::minimized(&w).unwrap_or(false),
                frame: ax::frame(&w).unwrap_or(Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }),
            };
            Some((info, w))
        })
        .collect()
}

fn element(pid: i32, id: u32) -> Option<Cf> {
    ax_windows(pid).into_iter().find(|(w, _)| w.id == id).map(|(_, e)| e)
}

/// The app's windows, newest first, minimized ones last; other Spaces left out.
pub fn app_windows(pid: i32) -> Vec<WinInfo> {
    let z: Vec<u32> = crate::notify::window_list().iter().filter(|w| w.pid == pid && w.layer == 0).map(|w| w.number).collect();
    merge(pid, ax_windows(pid).into_iter().map(|(w, _)| w).collect(), &z)
}

/// The app has a real window, minimized ones too, from the window server alone:
/// the click tap asks the app nothing, so a hung app never keeps a click waiting.
pub fn has_windows(pid: i32) -> bool {
    let list: Vec<(i32, i64, f64, f64)> =
        crate::notify::all_windows().iter().map(|w| (w.pid, w.layer, w.bounds.w, w.bounds.h)).collect();
    crate::peek_rules::has_app_window(&list, pid)
}

/// The owner of the front shown window, other than Notching (design §6).
pub fn front_pid() -> Option<i32> {
    let own = std::process::id() as i32;
    crate::notify::window_list().into_iter().find(|w| w.layer == 0 && w.pid != own).map(|w| w.pid)
}

pub fn minimize(pid: i32, id: u32) -> bool {
    element(pid, id).is_some_and(|w| ax::set_minimized(&w, true))
}

pub fn restore(pid: i32, id: u32) -> bool {
    element(pid, id).is_some_and(|w| ax::set_minimized(&w, false))
}

// Brings the app forward. The old activation option is ignored from macOS 14,
// so Accessibility's AXFrontmost is set as well.
fn activate(pid: i32) {
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        #[allow(deprecated)]
        app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
    if let Some(app) = ax::app(pid) {
        ax::set_frontmost(&app);
    }
}

/// Restores the window if needed, brings its app forward and the window to its front.
pub fn raise(pid: i32, id: u32) -> bool {
    let Some(w) = element(pid, id) else { return false };
    if ax::minimized(&w) == Some(true) {
        ax::set_minimized(&w, false);
    }
    activate(pid);
    ax::raise(&w)
}

/// Every window of `ids` back and in front, keeping their order: the last is
/// raised first, so the first ends on top.
pub fn show_all(pid: i32, ids: &[u32]) {
    let windows = ax_windows(pid);
    let mut restored = 0;
    for id in ids {
        if let Some((_, w)) = windows.iter().find(|(w, _)| w.id == *id && w.minimized) {
            restored += usize::from(ax::set_minimized(w, false));
        }
    }
    eprintln!("notching: show all of pid {pid}: {} windows, {restored} restored", ids.len());
    activate(pid);
    for id in ids.iter().rev() {
        if let Some((_, w)) = windows.iter().find(|(w, _)| w.id == *id) {
            ax::raise(w);
        }
    }
}

/// Presses the window's close button: the app may ask to save first.
pub fn close(pid: i32, id: u32) -> bool {
    element(pid, id).is_some_and(|w| ax::press_close(&w))
}

/// Asks the app to quit, as ⌘Q does; never forced.
pub fn quit(pid: i32) -> bool {
    NSRunningApplication::runningApplicationWithProcessIdentifier(pid).is_some_and(|app| app.terminate())
}

//! Intip jendela's windows (design 5 Nov §6, §8): an app's standard windows
//! through Accessibility, in the window server's order, and what the peek does
//! to them. Each call finds the window again by its number; one that is gone
//! is left alone. Accessibility calls wait at most half a second (ax.rs).

use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};

use crate::ax::{self, Cf};
use crate::geometry::Rect;
use std::time::Duration;

use crate::peek_rules::{keep_window, made_up_number, merge, number_by_frame, still_to_do, AxWin, WinInfo};

// An app busy with one minimize animation can miss the next request: a short
// step between windows, a check once they settle, and up to three rounds.
const STEP: Duration = Duration::from_millis(60);
const SETTLE: Duration = Duration::from_millis(400);
const ROUNDS: usize = 3;

// The app's standard windows that have a number, with their elements: its
// windows list, plus any window among its children the list leaves out (some
// apps drop minimized windows from AXWindows).
fn ax_windows(pid: i32) -> Vec<(AxWin, Cf)> {
    let Some(app) = ax::app(pid) else { return Vec::new() };
    let mut all = ax::windows(&app);
    all.extend(ax::children(&app).into_iter().filter(|c| ax::role(c).as_deref() == Some("AXWindow")));
    // The app's windows as the window server has them, for windows that give no
    // number, and those on screen.
    let server: Vec<(u32, Rect)> =
        crate::notify::all_windows().iter().filter(|w| w.pid == pid && w.layer == 0).map(|w| (w.number, w.bounds)).collect();
    let on_screen: Vec<u32> =
        crate::notify::window_list().iter().filter(|w| w.pid == pid && w.layer == 0).map(|w| w.number).collect();
    let mut out: Vec<(AxWin, Cf)> = Vec::new();
    for w in all {
        let subrole = ax::subrole(&w);
        let minimized = ax::minimized(&w);
        let frame = ax::frame(&w).unwrap_or(Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 });
        let number = ax::window_id(&w);
        let shown = number.is_some_and(|n| on_screen.contains(&n))
            || number_by_frame(frame, &server).is_some_and(|n| on_screen.contains(&n));
        if !keep_window(subrole.as_deref(), minimized, frame.w, frame.h, shown) {
            continue;
        }
        let title = ax::title(&w).unwrap_or_default();
        let id = match number {
            Some(id) => id,
            None => {
                let id = number_by_frame(frame, &server).unwrap_or_else(|| made_up_number(&title, frame));
                eprintln!("notching: a window of pid {pid} gave no number (subrole {subrole:?}, minimized {minimized:?}); using {id}");
                id
            }
        };
        if out.iter().any(|(o, _)| o.id == id) {
            continue;
        }
        let info = AxWin { id, title, minimized, frame };
        out.push((info, w));
    }
    out
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

/// Brings the app forward. The old activation option is ignored from macOS 14,
/// so Accessibility's AXFrontmost is set as well.
pub fn activate(pid: i32) {
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        #[allow(deprecated)]
        app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
    if let Some(app) = ax::app(pid) {
        ax::set_frontmost(&app);
    }
}

/// Minimizes (`on`) or brings back every window of `ids`, checking afterwards
/// and asking again for the ones the app skipped. Returns how many are done.
pub fn set_all_minimized(pid: i32, ids: &[u32], on: bool) -> usize {
    let mut todo = ids.to_vec();
    for round in 0..ROUNDS {
        let windows = ax_windows(pid);
        for id in &todo {
            if let Some((_, w)) = windows.iter().find(|(w, _)| w.id == *id) {
                ax::set_minimized(w, on);
                std::thread::sleep(STEP);
            }
        }
        std::thread::sleep(SETTLE);
        let now: Vec<(u32, Option<bool>)> = ax_windows(pid).iter().map(|(w, e)| (w.id, ax::minimized(e))).collect();
        todo = still_to_do(on, &todo, &now);
        if todo.is_empty() {
            break;
        }
        eprintln!("notching: pid {pid}: {} window(s) skipped in round {}; asking again", todo.len(), round + 1);
    }
    ids.len() - todo.len()
}

/// Restores the window if needed, brings its app forward and the window to its front.
pub fn raise(pid: i32, id: u32) -> bool {
    let Some(w) = element(pid, id) else { return false };
    // Not minimized, this changes nothing; some apps do not say whether it is.
    ax::set_minimized(&w, false);
    activate(pid);
    ax::raise(&w)
}

/// Every window of `ids` back and in front, keeping their order: the last is
/// raised first, so the first ends on top.
pub fn show_all(pid: i32, ids: &[u32]) {
    let minimized: Vec<u32> = app_windows(pid).into_iter().filter(|w| w.minimized && ids.contains(&w.id)).map(|w| w.id).collect();
    let restored = set_all_minimized(pid, &minimized, false);
    eprintln!("notching: show all of pid {pid}: {} windows, {restored} of {} restored", ids.len(), minimized.len());
    let windows = ax_windows(pid);
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

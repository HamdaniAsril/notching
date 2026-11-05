//! Opening the shelf when a file drag starts anywhere (owner, 5 Nov), main
//! thread only.
//!
//! While Shelf and its "open while dragging" are on, a global monitor hears
//! only the left button going down and the mouse moving with it held. Plain
//! mouse moves never reach it, so the app still does nothing at rest. On a
//! press it notes the drag pasteboard's change count; during that gesture it
//! looks again at most every CHECK_MS, and for GIVE_UP_MS at most. A changed
//! count means a drag session began: if it carries files, drop mode starts on
//! the notch of the screen under the cursor (shelf_drop.rs). Window moves and
//! text selections start no session, so they cost a few reads and nothing more.

use std::cell::RefCell;
use std::ptr::NonNull;
use std::time::Instant;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType, NSPasteboard, NSPasteboardNameDrag};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;

/// How often a gesture looks at the drag pasteboard, at most.
const CHECK_MS: u64 = 50;
/// How long after it starts moving a gesture is watched: a drag session begins
/// within the first few points, so a longer one is a window move or a selection.
const GIVE_UP_MS: u64 = 1500;

/// One left-button gesture at a time: should the drag pasteboard be read now,
/// and did it change since the press?
#[derive(Debug, Default)]
pub struct Watch {
    seen: isize,
    pressed: bool,
    moving_since: Option<u64>,
    checked: Option<u64>,
    done: bool,
}

impl Watch {
    /// The left button went down; `count`: the drag pasteboard's change count now.
    pub fn pressed(&mut self, count: isize) {
        *self = Watch { seen: count, pressed: true, ..Watch::default() };
    }

    /// The mouse moved with the button down, at `now` ms. `count` reads the
    /// change count, only when it is time to look. True once per gesture: a drag
    /// session began, so its types are worth a look.
    pub fn dragged(&mut self, now: u64, count: impl FnOnce() -> isize) -> bool {
        if self.done || !self.pressed {
            return false;
        }
        let since = *self.moving_since.get_or_insert(now);
        if now.saturating_sub(since) > GIVE_UP_MS {
            self.done = true;
            return false;
        }
        if self.checked.is_some_and(|t| now.saturating_sub(t) < CHECK_MS) {
            return false;
        }
        self.checked = Some(now);
        if count() == self.seen {
            return false;
        }
        self.done = true;
        true
    }
}

thread_local! {
    static WATCH: RefCell<Watch> = RefCell::new(Watch::default());
    static MONITOR: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    static CLOCK: Instant = Instant::now();
}

fn now_ms() -> u64 {
    CLOCK.with(|c| c.elapsed().as_millis() as u64)
}

fn drag_pasteboard() -> Retained<NSPasteboard> {
    NSPasteboard::pasteboardWithName(unsafe { NSPasteboardNameDrag })
}

/// Shelf is installed and on, and opens while dragging.
fn wanted(app: &AppHandle) -> bool {
    crate::shelf_service::enabled(app) && app.state::<CoreState>().0.lock().unwrap().shelf_open_on_drag()
}

fn on_event(app: &AppHandle, event: &NSEvent) {
    match event.r#type() {
        NSEventType::LeftMouseDown => {
            let count = drag_pasteboard().changeCount();
            WATCH.with(|w| w.borrow_mut().pressed(count));
        }
        NSEventType::LeftMouseDragged => {
            let began = WATCH.with(|w| w.borrow_mut().dragged(now_ms(), || drag_pasteboard().changeCount()));
            if !began {
                return;
            }
            let pb = drag_pasteboard();
            if pb.availableTypeFromArray(&crate::shelf_drop::dragged_types()).is_none() {
                return;
            }
            let Some(mtm) = MainThreadMarker::new() else { return };
            let label = crate::shot_service::cursor_label(app, mtm);
            eprintln!("notching: a file drag started; shelf opens on {label}");
            crate::shelf_drop::started(app, &label);
        }
        _ => {}
    }
}

// Installs or removes the monitor to match the settings. Main thread.
fn apply(app: &AppHandle) {
    let want = wanted(app);
    MONITOR.with(|m| {
        let mut m = m.borrow_mut();
        match (want, m.is_some()) {
            (true, false) => {
                let handle = app.clone();
                let block = RcBlock::new(move |event: NonNull<NSEvent>| {
                    // SAFETY: AppKit passes a valid event for the call.
                    on_event(&handle, unsafe { event.as_ref() });
                });
                *m = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
                    NSEventMask::LeftMouseDown | NSEventMask::LeftMouseDragged,
                    &block,
                );
                WATCH.with(|w| *w.borrow_mut() = Watch::default());
                eprintln!("notching: shelf drag watch on");
            }
            (false, true) => {
                if let Some(token) = m.take() {
                    unsafe { NSEvent::removeMonitor(&token) };
                }
                eprintln!("notching: shelf drag watch off");
            }
            _ => {}
        }
    });
}

/// Brings the monitor in line with Shelf and its setting, from any thread.
pub fn sync(app: &AppHandle) {
    let handle = app.clone();
    if MainThreadMarker::new().is_some() {
        apply(&handle);
    } else {
        let _ = app.run_on_main_thread(move || apply(&handle));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pressed(count: isize) -> Watch {
        let mut w = Watch::default();
        w.pressed(count);
        w
    }

    #[test]
    fn a_new_drag_session_is_seen_once() {
        let mut w = pressed(7);
        assert!(!w.dragged(0, || 7)); // not begun yet
        assert!(w.dragged(60, || 8));
        // Done for this gesture: the pasteboard is not read again.
        assert!(!w.dragged(200, || panic!("read again")));
    }

    #[test]
    fn reads_are_spaced_out() {
        let mut w = pressed(1);
        assert!(!w.dragged(0, || 1));
        assert!(!w.dragged(20, || panic!("read too soon")));
        assert!(w.dragged(50, || 2));
    }

    #[test]
    fn a_long_move_without_a_drag_session_stops_being_watched() {
        let mut w = pressed(3);
        assert!(!w.dragged(0, || 3));
        assert!(!w.dragged(1000, || 3));
        assert!(!w.dragged(1600, || panic!("read after giving up")));
    }

    #[test]
    fn the_give_up_clock_starts_when_the_mouse_moves() {
        // Held still for a while on a file, then dragged.
        let mut w = pressed(3);
        assert!(w.dragged(10_000, || 4));
    }

    #[test]
    fn a_change_from_before_the_press_does_not_count() {
        // Our own drag out of the shelf changed the count; the next press takes it as the start.
        let mut w = pressed(9);
        assert!(!w.dragged(0, || 9));
        assert!(!w.dragged(100, || 9));
    }

    #[test]
    fn a_drag_with_no_press_seen_is_ignored() {
        // The monitor came on halfway through a gesture.
        let mut w = Watch::default();
        assert!(!w.dragged(0, || panic!("read without a press")));
    }

    #[test]
    fn each_press_starts_afresh() {
        let mut w = pressed(1);
        assert!(w.dragged(0, || 2));
        w.pressed(2);
        assert!(!w.dragged(5000, || 2));
        assert!(w.dragged(5050, || 3));
    }
}

//! Screens and their notches, read from AppKit (main thread only).

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplicationDidChangeScreenParametersNotification, NSScreen};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol, NSOperationQueue, NSRect};

use crate::geometry::{notch_from_screen, NotchGeom, Rect};

#[derive(Clone, Debug, PartialEq)]
pub struct ScreenInfo {
    pub index: usize,
    pub frame: Rect,
    pub notch: Option<NotchGeom>,
    /// NSScreen.localizedName, e.g. "Built-in Retina Display".
    pub name: String,
}

fn to_rect(r: NSRect) -> Rect {
    Rect { x: r.origin.x, y: r.origin.y, w: r.size.width, h: r.size.height }
}

pub fn current_screens(mtm: MainThreadMarker) -> Vec<ScreenInfo> {
    NSScreen::screens(mtm)
        .iter()
        .enumerate()
        .map(|(index, screen)| {
            let frame = to_rect(screen.frame());
            let notch = notch_from_screen(
                frame,
                screen.safeAreaInsets().top,
                to_rect(screen.auxiliaryTopLeftArea()),
                to_rect(screen.auxiliaryTopRightArea()),
            );
            ScreenInfo { index, frame, notch, name: screen.localizedName().to_string() }
        })
        .collect()
}

thread_local! {
    // Keeps the notification observer registered for the life of the app.
    static SCREEN_OBSERVER: RefCell<Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>> =
        const { RefCell::new(None) };
}

// Bumped on every screen change; only the last change of a burst rebuilds.
static SCREEN_CHANGES: AtomicU64 = AtomicU64::new(0);
const DEBOUNCE: Duration = Duration::from_millis(300);

/// Rebuilds the overlays 300 ms after the screen configuration settles
/// (monitor plugged in or out, resolution changed).
pub fn watch_screen_changes(app: tauri::AppHandle) {
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        let generation = SCREEN_CHANGES.fetch_add(1, Ordering::SeqCst) + 1;
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(DEBOUNCE);
            if SCREEN_CHANGES.load(Ordering::SeqCst) != generation {
                return;
            }
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                if let Err(e) = crate::overlay::rebuild_overlays(&handle) {
                    eprintln!("notching: rebuilding overlays failed: {e}");
                }
            });
        });
    });
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidChangeScreenParametersNotification),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    SCREEN_OBSERVER.with(|o| *o.borrow_mut() = Some(observer));
}

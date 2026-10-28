//! Sensors: one plain, all but invisible panel under each hit area of each
//! overlay (main thread only). Their tracking areas tell us when the cursor
//! arrives, so the app needs no global mouse monitor while the cursor is far
//! from every notch, and AppKit stops waking it for every mouse move.
//!
//! Like the overlays, sensors are never closed: unused ones are only ordered out.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::{define_class, msg_send, AllocAnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSBackingStoreType, NSColor, NSEvent, NSPanel, NSResponder, NSTrackingArea, NSTrackingAreaOptions, NSView,
    NSWindowCollectionBehavior, NSWindowOrderingMode, NSWindowStyleMask,
};
use objc2_foundation::{NSObject, NSPoint, NSRect, NSSize};
use tauri::{AppHandle, Manager};
use tauri_nspanel::ManagerExt;

use crate::geometry::{css_rect_to_global, Rect};
use crate::overlay::Overlays;

// NSStatusWindowLevel, the overlays' level.
const STATUS_LEVEL: isize = 25;

static APP: OnceLock<AppHandle> = OnceLock::new();

define_class!(
    #[unsafe(super(NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NotchingSensorView"]
    struct SensorView;

    impl SensorView {
        #[unsafe(method(mouseEntered:))]
        fn mouse_entered(&self, _event: &NSEvent) {
            if let Some(app) = APP.get() {
                crate::pointer::reroute_now(app);
            }
        }
    }
);

thread_local! {
    // Sensor panels by overlay label, one per hit rect.
    static SENSORS: RefCell<HashMap<String, Vec<Retained<NSPanel>>>> = RefCell::new(HashMap::new());
}

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

fn ns_rect(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

fn new_sensor(mtm: MainThreadMarker) -> Retained<NSPanel> {
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        NSRect::ZERO,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType::Buffered,
        false,
    );
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setLevel(STATUS_LEVEL);
    // Every Space, full-screen ones too: the notch stays usable over full-screen
    // apps (owner's decision, 2026-10-28), and there the sensor must catch the cursor.
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    panel.setHidesOnDeactivate(false);
    panel.setHasShadow(false);
    panel.setOpaque(false);
    // A fully clear window lets the mouse through; 1% black still catches it and
    // cannot be seen.
    panel.setBackgroundColor(Some(&NSColor::colorWithWhite_alpha(0.0, 0.01)));
    panel.setIgnoresMouseEvents(false);

    let view: Retained<SensorView> = unsafe { msg_send![SensorView::alloc(mtm), init] };
    let area = unsafe {
        NSTrackingArea::initWithRect_options_owner_userInfo(
            NSTrackingArea::alloc(),
            NSRect::ZERO,
            NSTrackingAreaOptions::MouseEnteredAndExited
                | NSTrackingAreaOptions::ActiveAlways
                | NSTrackingAreaOptions::InVisibleRect,
            Some(&view),
            None,
        )
    };
    view.addTrackingArea(&area);
    panel.setContentView(Some(&view));
    panel
}

/// Puts one sensor under each of the overlay's current hit rects, just below the
/// overlay itself, and orders the rest out.
pub fn sync(app: &AppHandle, label: &str) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    let (frame, rects) = {
        let overlays = app.state::<Overlays>();
        let map = overlays.0.lock().unwrap();
        match map.get(label) {
            Some(e) => (e.frame, e.css_rects.clone()),
            None => (Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }, Vec::new()),
        }
    };
    let overlay_number = app.get_webview_panel(label).ok().map(|p| p.as_panel().windowNumber());
    SENSORS.with(|s| {
        let mut sensors = s.borrow_mut();
        let pool = sensors.entry(label.to_string()).or_default();
        while pool.len() < rects.len() {
            pool.push(new_sensor(mtm));
        }
        for (i, sensor) in pool.iter().enumerate() {
            match (rects.get(i), overlay_number) {
                (Some(&css), Some(number)) => {
                    sensor.setFrame_display(ns_rect(css_rect_to_global(frame, css)), false);
                    sensor.orderWindow_relativeTo(NSWindowOrderingMode::Below, number);
                }
                _ => sensor.orderOut(None),
            }
        }
    });
}

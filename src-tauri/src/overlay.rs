//! One transparent notch panel per screen (main thread only).

use std::cell::RefCell;
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::Mutex;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::MainThreadMarker;
use objc2_app_kit::{NSWindowAnimationBehavior, NSWindowDidResignKeyNotification};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol, NSOperationQueue, NSPoint, NSRect, NSSize};
use tauri::{AppHandle, Emitter, EventTarget, LogicalSize, Manager, Size, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use crate::geometry::{overlay_frame, pick_screens, Rect, OVERLAY_H, OVERLAY_W};
use crate::screens::{current_screens, ScreenInfo};

// The macro brings its own AppKit imports, so it lives in a module of its own.
mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(NotchPanel {
            config: {
                can_become_key_window: true,
                is_floating_panel: true
            }
        })
    }
}
use panel::NotchPanel;

pub struct OverlayEntry {
    pub screen: ScreenInfo,
    pub frame: Rect,
    pub css_rects: Vec<Rect>,
}

/// Live overlays by window label.
#[derive(Default)]
pub struct Overlays(pub Mutex<HashMap<String, OverlayEntry>>);

/// Names of the connected screens, each once, in NSScreen order: the choices in
/// the settings window, whether or not a screen has a notch now.
#[derive(Default)]
pub struct ConnectedScreens(pub Mutex<Vec<String>>);

thread_local! {
    // One resign-key observer per panel; panels live as long as the app.
    static RESIGN_OBSERVERS: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>> =
        const { RefCell::new(Vec::new()) };
}

/// What to do with the panel "notch-{index}" for a screen.
#[derive(Debug, PartialEq)]
enum SlotAction {
    /// No panel for this index yet.
    Create,
    /// Same screen as before: leave the panel alone (no flicker).
    Keep,
    /// The screen changed, or a parked panel is reused: move it and reload its page.
    Refresh,
}

fn slot_action(panel_exists: bool, previous: Option<&ScreenInfo>, now: &ScreenInfo) -> SlotAction {
    match (panel_exists, previous) {
        (false, _) => SlotAction::Create,
        (true, Some(prev)) if prev == now => SlotAction::Keep,
        (true, _) => SlotAction::Refresh,
    }
}

/// Matches panels to the current screens.
///
/// Panels are never closed. Closing a tauri-nspanel panel makes AppKit throw an
/// uncaught NSRangeException (the Touch Bar finder's KVO observer on the window no
/// longer matches its swizzled class), which aborts the app. So a screen that goes
/// away only hides its panel, and the panel is reused when a screen takes its index again.
pub fn rebuild_overlays(app: &AppHandle) -> tauri::Result<()> {
    let mtm = MainThreadMarker::new().expect("rebuild_overlays must run on the main thread");
    apply_screens(app, current_screens(mtm))
}

fn apply_screens(app: &AppHandle, screens: Vec<ScreenInfo>) -> tauri::Result<()> {
    let mut names: Vec<String> = Vec::new();
    for s in &screens {
        if !names.contains(&s.name) {
            names.push(s.name.clone());
        }
    }
    *app.state::<ConnectedScreens>().0.lock().unwrap() = names;

    // One lock at a time: the choice first, then the overlays.
    let choice = app.state::<crate::app_core::CoreState>().0.lock().unwrap().screen().map(String::from);
    let all: Vec<&str> = screens.iter().map(|s| s.name.as_str()).collect();
    let keep = pick_screens(&all, choice.as_deref());

    let overlays = app.state::<Overlays>();
    let mut previous = std::mem::take(&mut *overlays.0.lock().unwrap());

    // Screens left out are parked below, like screens that went away.
    for screen in screens.into_iter().enumerate().filter(|(i, _)| keep.contains(i)).map(|(_, s)| s) {
        let label = format!("notch-{}", screen.index);
        // A screen that fails is skipped, not the rest after it.
        if let Err(e) = place_screen(app, &label, screen, previous.remove(&label)) {
            eprintln!("notching: overlay {label} failed: {e}");
        }
        crate::sensor::sync(app, &label);
    }

    // Screens that went away or are not chosen: park their panels and sensors.
    for label in previous.into_keys() {
        if let Ok(panel) = app.get_webview_panel(&label) {
            panel.hide();
        }
        crate::sensor::sync(app, &label);
    }
    crate::settings_window::emit_settings(app);
    Ok(())
}

fn place_screen(app: &AppHandle, label: &str, screen: ScreenInfo, before: Option<OverlayEntry>) -> tauri::Result<()> {
    let overlays = app.state::<Overlays>();
    let frame = overlay_frame(screen.frame);
    let panel = app.get_webview_panel(label).ok();
    let mut css_rects = Vec::new();
    match slot_action(panel.is_some(), before.as_ref().map(|e| &e.screen), &screen) {
        SlotAction::Create => create_panel(app, label, frame)?,
        SlotAction::Keep => css_rects = before.map(|e| e.css_rects).unwrap_or_default(),
        SlotAction::Refresh => {
            let panel = panel.expect("Refresh implies an existing panel");
            // Ordering out and in again also hands key status back if the panel had it.
            panel.hide();
            place(&*panel, frame);
            if let Some(window) = app.get_webview_window(label) {
                window.reload()?;
            }
        }
    }
    overlays
        .0
        .lock()
        .unwrap()
        .insert(label.to_string(), OverlayEntry { screen, frame, css_rects });
    Ok(())
}

// AppKit coordinates, so the overlay lands exactly on screens with any scale.
fn place<R: tauri::Runtime>(panel: &dyn tauri_nspanel::Panel<R>, frame: Rect) {
    let rect = NSRect::new(NSPoint::new(frame.x, frame.y), NSSize::new(frame.w, frame.h));
    panel.as_panel().setFrame_display(rect, true);
    panel.set_ignores_mouse_events(true);
    panel.show();
}

fn create_panel(app: &AppHandle, label: &str, frame: Rect) -> tauri::Result<()> {
    let panel = PanelBuilder::<_, NotchPanel>::new(app, label)
        .url(WebviewUrl::App("index.html".into()))
        .size(Size::Logical(LogicalSize::new(OVERLAY_W, OVERLAY_H)))
        .level(PanelLevel::Status)
        .collection_behavior(
            // No full_screen_auxiliary: the notch stays off full-screen Spaces.
            CollectionBehavior::new().can_join_all_spaces().stationary().ignores_cycle(),
        )
        .style_mask(StyleMask::empty().borderless().nonactivating_panel())
        .transparent(true)
        .has_shadow(false)
        .no_activate(true)
        .hides_on_deactivate(false)
        // Off until the cursor reaches a notch (pointer.rs), or AppKit hands
        // this window every mouse move on the screen.
        .accepts_mouse_moved_events(false)
        .with_window(|w| {
            w.accept_first_mouse(true)
                .transparent(true)
                .decorations(false)
                .visible(false)
                .focused(false)
                .skip_taskbar(true)
        })
        .build()?;

    // Closing the panel orders it out and in again to hand key status back; without
    // this, AppKit animates that re-show and the panel's top edge visibly dips.
    panel.as_panel().setAnimationBehavior(NSWindowAnimationBehavior::None);
    place(&*panel, frame);
    watch_resign_key(app, label, panel.as_panel());
    Ok(())
}

// Tells the panel's page when it loses key status (a click outside it), so the
// panel closes. A notification observer rather than tauri-nspanel's panel_event!
// handler, which would replace Tauri's own window delegate.
fn watch_resign_key(app: &AppHandle, label: &str, window: &objc2_app_kit::NSPanel) {
    let app = app.clone();
    let label = label.to_string();
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        let _ = app.emit_to(EventTarget::webview_window(&label), "notch://resign-key", ());
    });
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSWindowDidResignKeyNotification),
            Some(window as &AnyObject),
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    RESIGN_OBSERVERS.with(|o| o.borrow_mut().push(observer));
}

/// Lets the overlays receive mouse moves, only while the cursor is inside a notch.
pub fn set_mouse_moved_events(app: &AppHandle, on: bool) {
    for label in app.state::<Overlays>().0.lock().unwrap().keys() {
        if let Ok(panel) = app.get_webview_panel(label) {
            panel.set_accepts_mouse_moved_events(on);
        }
    }
}

pub fn set_mouse_passthrough(app: &AppHandle, label: &str, passthrough: bool) {
    if let Ok(panel) = app.get_webview_panel(label) {
        panel.set_ignores_mouse_events(passthrough);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::NotchGeom;

    fn screen(index: usize, w: f64, notch: Option<NotchGeom>) -> ScreenInfo {
        ScreenInfo { index, frame: Rect { x: 0.0, y: 0.0, w, h: 900.0 }, notch, name: "A".into() }
    }

    #[test]
    fn a_new_screen_gets_a_new_panel() {
        assert_eq!(slot_action(false, None, &screen(0, 1470.0, None)), SlotAction::Create);
    }

    #[test]
    fn an_unchanged_screen_keeps_its_panel_as_is() {
        let s = screen(0, 1470.0, None);
        assert_eq!(slot_action(true, Some(&s), &s), SlotAction::Keep);
    }

    #[test]
    fn a_changed_or_returning_screen_reuses_its_panel() {
        let now = screen(0, 1470.0, Some(NotchGeom { width: 164.0, height: 32.0 }));
        assert_eq!(slot_action(true, Some(&screen(0, 1512.0, None)), &now), SlotAction::Refresh);
        assert_eq!(slot_action(true, None, &now), SlotAction::Refresh); // parked, screen came back
    }
}

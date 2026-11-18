//! Fokus jendela's blur (design 18 Nov §5): one plain panel per screen at the
//! normal window level, holding macOS's own behind-window blur and a thin dark
//! layer, ordered right below that screen's focused window. It catches clicks,
//! which move the focus, and nothing else. Main thread only. Like the sensors,
//! the panels are never closed, only ordered out.

use std::cell::RefCell;
use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions, NSBackingStoreType, NSColor,
    NSEvent, NSEventModifierFlags, NSPanel, NSResponder, NSView, NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindowCollectionBehavior, NSWindowOrderingMode,
    NSWindowStyleMask,
};
use objc2_core_graphics::CGColor;
use objc2_foundation::{NSObject, NSPoint, NSRect, NSSize};
use objc2_quartz_core::CATransaction;

use crate::geometry::{to_cg, Rect};
use crate::screens::current_screens;

/// NSNormalWindowLevel: the layer sits among the apps' windows.
const NORMAL_LEVEL: isize = 0;

/// What the layer tells the service, in CG points (top-left of the main screen).
pub struct Hooks {
    pub clicked: fn(f64, f64, bool),
}

static HOOKS: OnceLock<Hooks> = OnceLock::new();

pub fn init(hooks: Hooks) {
    let _ = HOOKS.set(hooks);
}

/// The pointer in CG points.
pub fn pointer() -> (f64, f64) {
    let p = NSEvent::mouseLocation();
    (p.x, PRIMARY_H.with(|h| h.get()) - p.y)
}

define_class!(
    #[unsafe(super(NSView, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "NotchingFocusView"]
    struct FocusView;

    impl FocusView {
        // The first click on the blur counts, though Notching is not active.
        #[unsafe(method(acceptsFirstMouse:))]
        fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool {
            true
        }

        // A click moves focus and goes no further (design §4.5).
        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                let (x, y) = pointer();
                (h.clicked)(x, y, event.modifierFlags().contains(NSEventModifierFlags::Shift));
            }
        }

        // Scrolling and the other buttons do nothing on the blur (design §4.5).
        #[unsafe(method(rightMouseDown:))]
        fn right_mouse_down(&self, _event: &NSEvent) {}

        #[unsafe(method(otherMouseDown:))]
        fn other_mouse_down(&self, _event: &NSEvent) {}

        #[unsafe(method(scrollWheel:))]
        fn scroll_wheel(&self, _event: &NSEvent) {}
    }
);

/// One screen's panel.
struct Slot {
    panel: Retained<NSPanel>,
    blur: Retained<NSVisualEffectView>,
    dark: Retained<NSView>,
    shown: bool,
}

thread_local! {
    static SLOTS: RefCell<Vec<Slot>> = const { RefCell::new(Vec::new()) };
    /// The main screen's height, to turn Cocoa points into CG ones.
    static PRIMARY_H: std::cell::Cell<f64> = const { std::cell::Cell::new(0.0) };
}

fn ns_rect(r: Rect) -> NSRect {
    NSRect::new(NSPoint::new(r.x, r.y), NSSize::new(r.w, r.h))
}

fn new_slot(mtm: MainThreadMarker) -> Slot {
    let panel = NSPanel::initWithContentRect_styleMask_backing_defer(
        NSPanel::alloc(mtm),
        NSRect::ZERO,
        NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel,
        NSBackingStoreType::Buffered,
        false,
    );
    unsafe { panel.setReleasedWhenClosed(false) };
    panel.setLevel(NORMAL_LEVEL);
    // Every Space, out of Mission Control and the window cycle (design §4.6).
    panel.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Transient | NSWindowCollectionBehavior::IgnoresCycle,
    );
    panel.setHidesOnDeactivate(false);
    panel.setHasShadow(false);
    panel.setOpaque(false);
    // 1% black: every click is caught, none reaches the window below (design
    // §4.5), and it cannot be seen.
    panel.setBackgroundColor(Some(&NSColor::colorWithWhite_alpha(0.0, 0.01)));
    panel.setIgnoresMouseEvents(false);

    let view: Retained<FocusView> = unsafe { msg_send![FocusView::alloc(mtm), init] };
    view.setWantsLayer(true);

    let fill = NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable;
    let blur = NSVisualEffectView::new(mtm);
    blur.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    blur.setMaterial(NSVisualEffectMaterial::FullScreenUI);
    blur.setState(NSVisualEffectState::Active);
    // SAFETY: a constant AppKit defines.
    if let Some(dark) = NSAppearance::appearanceNamed(unsafe { NSAppearanceNameDarkAqua }) {
        blur.setAppearance(Some(&dark));
    }
    blur.setWantsLayer(true);
    blur.setAutoresizingMask(fill);
    view.addSubview(&blur);

    let dark = NSView::new(mtm);
    dark.setWantsLayer(true);
    if let Some(layer) = dark.layer() {
        layer.setBackgroundColor(Some(&CGColor::new_generic_gray(0.0, 1.0)));
        layer.setOpacity(0.0);
    }
    dark.setAutoresizingMask(fill);
    view.addSubview(&dark);

    panel.setContentView(Some(&view));
    Slot { panel, blur, dark, shown: false }
}

/// The screens now, in CG points, in the order `show` takes them.
pub fn screens_cg(mtm: MainThreadMarker) -> Vec<Rect> {
    let screens = current_screens(mtm);
    let h = screens.first().map_or(0.0, |s| s.frame.h);
    screens.iter().map(|s| to_cg(s.frame, h)).collect()
}

/// A panel on `screen` (an index of screens_cg), ordered right below `window`.
/// Every screen has its own (owner, 18 Nov). `dim` is Dim::alpha().
pub fn show_screen(mtm: MainThreadMarker, screen: usize, window: u32, dim: f64) {
    let screens = current_screens(mtm);
    if let Some(main) = screens.first() {
        PRIMARY_H.with(|h| h.set(main.frame.h));
    }
    let Some(info) = screens.get(screen) else { return };
    SLOTS.with(|slots| {
        let mut slots = slots.borrow_mut();
        while slots.len() < screens.len() {
            slots.push(new_slot(mtm));
        }
        let slot = &mut slots[screen];
        let size = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(info.frame.w, info.frame.h));
        slot.panel.setFrame_display(ns_rect(info.frame), false);
        if let Some(content) = slot.panel.contentView() {
            content.setFrame(size);
        }
        slot.blur.setFrame(size);
        slot.dark.setFrame(size);
        if let Some(layer) = slot.dark.layer() {
            CATransaction::begin();
            CATransaction::setDisableActions(true);
            layer.setOpacity(dim as f32);
            CATransaction::commit();
        }
        slot.panel.orderWindow_relativeTo(NSWindowOrderingMode::Below, window as isize);
        slot.shown = true;
    });
}

/// One screen's panel goes; that screen is as it was.
pub fn hide_screen(_mtm: MainThreadMarker, screen: usize) {
    SLOTS.with(|slots| {
        if let Some(slot) = slots.borrow_mut().get_mut(screen) {
            slot.panel.orderOut(None);
            slot.shown = false;
        }
    });
}

/// Every panel goes.
pub fn hide(_mtm: MainThreadMarker) {
    SLOTS.with(|slots| {
        for slot in slots.borrow_mut().iter_mut() {
            slot.panel.orderOut(None);
            slot.shown = false;
        }
    });
}

/// While a drag runs, every mouse event goes through to the windows below.
pub fn pass_through(_mtm: MainThreadMarker, on: bool) {
    SLOTS.with(|slots| {
        for slot in slots.borrow().iter() {
            slot.panel.setIgnoresMouseEvents(on);
        }
    });
}

/// The layer's own window numbers, to skip in the window list.
pub fn own_windows(_mtm: MainThreadMarker) -> Vec<u32> {
    SLOTS.with(|slots| slots.borrow().iter().filter(|s| s.shown).map(|s| s.panel.windowNumber() as u32).collect())
}

/// One screen's panel's window number, while it shows.
pub fn own_window(_mtm: MainThreadMarker, screen: usize) -> Option<u32> {
    SLOTS.with(|slots| slots.borrow().get(screen).filter(|s| s.shown).map(|s| s.panel.windowNumber() as u32))
}

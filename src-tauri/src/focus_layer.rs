//! Fokus jendela's blur (design 18 Nov §5): one plain panel per screen at the
//! normal window level, holding macOS's own behind-window blur and a thin dark
//! layer, ordered right below that screen's focused window. Over them, a picture
//! of the window under the pointer: the peek (design §4.4). It catches every
//! click: a click moves the focus, a ⇧-click adds a window. Main thread only. Like the sensors, the
//! panels are never closed, only ordered out.

use std::cell::RefCell;
use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{define_class, msg_send, AllocAnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions, NSBackingStoreType, NSColor,
    NSEvent, NSEventModifierFlags, NSImage, NSPanel, NSResponder, NSTrackingArea, NSTrackingAreaOptions, NSView,
    NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindowCollectionBehavior, NSWindowOrderingMode,
    NSWindowStyleMask,
};
use objc2_core_graphics::CGColor;
use objc2_foundation::{NSArray, NSData, NSNumber, NSObject, NSPoint, NSRect, NSSize};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_quartz_core::{CAGradientLayer, CATransaction};

use crate::focus_rules::{top_peek_stops, PEEK_IN_MS, PEEK_OUT_MS};
use crate::geometry::{to_cg, Rect};
use crate::screens::current_screens;

/// NSNormalWindowLevel: the layer sits among the apps' windows.
const NORMAL_LEVEL: isize = 0;

/// What the layer tells the service, in CG points (top-left of the main screen).
pub struct Hooks {
    pub moved: fn(f64, f64),
    pub left: fn(),
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

        #[unsafe(method(mouseMoved:))]
        fn mouse_moved(&self, _event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                let (x, y) = pointer();
                (h.moved)(x, y);
            }
        }

        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) {
            if let Some(h) = HOOKS.get() {
                (h.left)();
            }
        }

        // No click goes further (design §4.5): the service moves or adds the focus.
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
    /// The peek: a picture of one window, over the blur.
    picture: Retained<NSView>,
    /// The screen in Cocoa points.
    screen: Rect,
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
    let area = unsafe {
        NSTrackingArea::initWithRect_options_owner_userInfo(
            NSTrackingArea::alloc(),
            NSRect::ZERO,
            NSTrackingAreaOptions::MouseMoved
                | NSTrackingAreaOptions::MouseEnteredAndExited
                | NSTrackingAreaOptions::ActiveAlways
                | NSTrackingAreaOptions::InVisibleRect,
            Some(&view),
            None,
        )
    };
    view.addTrackingArea(&area);

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

    let picture = NSView::new(mtm);
    picture.setWantsLayer(true);
    if let Some(layer) = picture.layer() {
        layer.setOpacity(0.0);
    }
    view.addSubview(&picture);

    panel.setContentView(Some(&view));
    Slot { panel, blur, dark, picture, screen: Rect { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }, shown: false }
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
        slot.screen = info.frame;
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

/// A CGColor as the object CAGradientLayer's colours are.
fn as_object(c: &CGColor) -> &AnyObject {
    // SAFETY: CGColor is a Core Foundation type that is also an Objective-C object.
    unsafe { &*(c as *const CGColor as *const AnyObject) }
}

/// The mask of a top peek, `w` × `h` points: the picture shows at the top and
/// fades out by the middle (focus_rules::top_peek_stops). Only the picture is
/// masked, never the blur.
fn top_mask(w: f64, h: f64) -> objc2::rc::Retained<CAGradientLayer> {
    let stops = top_peek_stops();
    let mask = CAGradientLayer::new();
    mask.setFrame(CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(w, h)));
    let colors: Vec<_> = stops.iter().map(|&(_, shows)| CGColor::new_generic_gray(0.0, shows)).collect();
    let objects: Vec<&AnyObject> = colors.iter().map(|c| as_object(c)).collect();
    // SAFETY: an array of CGColors, as CAGradientLayer takes.
    unsafe { mask.setColors(Some(&NSArray::from_slice(&objects))) };
    let places: Vec<_> = stops.iter().map(|&(at, _)| NSNumber::new_f64(at)).collect();
    mask.setLocations(Some(&NSArray::from_retained_slice(&places)));
    // The layer is not flipped: 0 is the window's bottom, 1 its top.
    mask.setStartPoint(CGPoint::new(0.5, 0.0));
    mask.setEndPoint(CGPoint::new(0.5, 1.0));
    mask
}

/// The peek: `png`, a picture of a window at `frame` (CG points), over the blur
/// of the screen it is on; `top`: only its top, fading out. `fade`: from
/// nothing, over PEEK_IN_MS; else at once.
pub fn show_picture(mtm: MainThreadMarker, frame: Rect, png: &[u8], top: bool, fade: bool) {
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(png)) else { return };
    let h = PRIMARY_H.with(|h| h.get());
    let cocoa = to_cg(frame, h);
    hide_picture(mtm, false);
    SLOTS.with(|slots| {
        let slots = slots.borrow();
        let center = (cocoa.x + cocoa.w / 2.0, cocoa.y + cocoa.h / 2.0);
        let Some(slot) = slots.iter().find(|s| s.shown && s.screen.contains(center.0, center.1)) else { return };
        let local = Rect { x: cocoa.x - slot.screen.x, y: cocoa.y - slot.screen.y, ..cocoa };
        slot.picture.setFrame(ns_rect(local));
        let Some(layer) = slot.picture.layer() else { return };
        CATransaction::begin();
        CATransaction::setDisableActions(true);
        // SAFETY: an NSImage, which a layer on macOS takes as its contents.
        unsafe { layer.setContents(Some(&*(Retained::as_ptr(&image) as *const AnyObject))) };
        let mask = top.then(|| top_mask(local.w, local.h));
        // SAFETY: the picture's own layer takes a fresh mask, or none.
        unsafe { layer.setMask(mask.as_deref().map(|m| &**m)) };
        if !fade {
            layer.setOpacity(1.0);
        }
        CATransaction::commit();
        if fade {
            CATransaction::begin();
            CATransaction::setAnimationDuration(PEEK_IN_MS as f64 / 1000.0);
            layer.setOpacity(1.0);
            CATransaction::commit();
        }
    });
}

/// The peek goes. `fade`: over PEEK_OUT_MS; else at once.
pub fn hide_picture(_mtm: MainThreadMarker, fade: bool) {
    SLOTS.with(|slots| {
        for slot in slots.borrow().iter() {
            let Some(layer) = slot.picture.layer() else { continue };
            CATransaction::begin();
            if fade {
                CATransaction::setAnimationDuration(PEEK_OUT_MS as f64 / 1000.0);
            } else {
                CATransaction::setDisableActions(true);
            }
            layer.setOpacity(0.0);
            CATransaction::commit();
        }
    });
}

/// One screen's panel goes; that screen is as it was.
pub fn hide_screen(_mtm: MainThreadMarker, screen: usize) {
    SLOTS.with(|slots| {
        if let Some(slot) = slots.borrow_mut().get_mut(screen) {
            if let Some(layer) = slot.picture.layer() {
                layer.setOpacity(0.0);
            }
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

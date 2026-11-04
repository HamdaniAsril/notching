//! The Accessibility calls both tools use (design 4 Nov, alat latar): an app's
//! focused window and focused element, a window's frame and title. Safe to call
//! off the main thread; every call waits at most the messaging timeout.

use std::ffi::c_void;

use objc2_foundation::NSString;

use crate::geometry::Rect;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> *const c_void;
    fn AXUIElementCreateSystemWide() -> *const c_void;
    fn AXUIElementCopyAttributeValue(element: *const c_void, attribute: *const c_void, value: *mut *const c_void) -> i32;
    fn AXUIElementSetAttributeValue(element: *const c_void, attribute: *const c_void, value: *const c_void) -> i32;
    fn AXUIElementIsAttributeSettable(element: *const c_void, attribute: *const c_void, settable: *mut u8) -> i32;
    fn AXUIElementSetMessagingTimeout(element: *const c_void, seconds: f32) -> i32;
    fn AXValueCreate(kind: u32, value: *const c_void) -> *const c_void;
    fn AXValueGetValue(value: *const c_void, kind: u32, out: *mut c_void) -> u8;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(cf: *const c_void);
    fn CFGetTypeID(cf: *const c_void) -> usize;
    fn CFStringGetTypeID() -> usize;
}

const AX_OK: i32 = 0;
const AX_NO_VALUE: i32 = -25212; // kAXErrorNoValue: the attribute is empty
// Every Accessibility call waits at most this long (set on the system-wide
// element, it holds for every element, not only the app's).
const TIMEOUT: f32 = 0.5;
const VALUE_POINT: u32 = 1; // kAXValueCGPointType
const VALUE_SIZE: u32 = 2; // kAXValueCGSizeType

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Pair {
    a: f64,
    b: f64,
}

/// A CoreFoundation object this side owns, released once when dropped.
pub struct Cf(*const c_void);

// SAFETY: AXUIElements and AXValues are immutable CF objects, usable from any thread.
unsafe impl Send for Cf {}

impl Drop for Cf {
    fn drop(&mut self) {
        // SAFETY: created or copied by this module, released once.
        unsafe { CFRelease(self.0) };
    }
}

fn owned(p: *const c_void) -> Option<Cf> {
    (!p.is_null()).then_some(Cf(p))
}

fn attr(name: &str) -> objc2::rc::Retained<NSString> {
    NSString::from_str(name)
}

fn name_ptr(s: &NSString) -> *const c_void {
    s as *const NSString as *const c_void
}

// The AXError when the value can't be read.
fn try_copy(element: &Cf, name: &str) -> Result<Cf, i32> {
    let name = attr(name);
    let mut out = std::ptr::null();
    // SAFETY: an element and a CFString name; `out` gets a +1 value or stays null.
    let status = unsafe { AXUIElementCopyAttributeValue(element.0, name_ptr(&name), &mut out) };
    if status != AX_OK {
        return Err(status);
    }
    owned(out).ok_or(AX_NO_VALUE)
}

fn copy(element: &Cf, name: &str) -> Option<Cf> {
    try_copy(element, name).ok()
}

fn string(element: &Cf, name: &str) -> Option<String> {
    let value = copy(element, name)?;
    // SAFETY: the type check makes the cast to NSString (toll-free bridged) sound.
    unsafe {
        if CFGetTypeID(value.0) != CFStringGetTypeID() {
            return None;
        }
        Some((*(value.0 as *const NSString)).to_string())
    }
}

fn pair(element: &Cf, name: &str, kind: u32) -> Option<Pair> {
    let value = copy(element, name)?;
    let mut p = Pair::default();
    // SAFETY: AXValueGetValue checks the kind and writes a CGPoint or CGSize.
    let ok = unsafe { AXValueGetValue(value.0, kind, &mut p as *mut Pair as *mut c_void) };
    (ok != 0).then_some(p)
}

fn set_pair(element: &Cf, name: &str, kind: u32, p: Pair) -> bool {
    // SAFETY: a CGPoint or CGSize matching `kind`.
    let Some(value) = owned(unsafe { AXValueCreate(kind, &p as *const Pair as *const c_void) }) else { return false };
    let name = attr(name);
    // SAFETY: an element, a CFString name and an AXValue.
    unsafe { AXUIElementSetAttributeValue(element.0, name_ptr(&name), value.0) == AX_OK }
}

static TIMEOUT_SET: std::sync::Once = std::sync::Once::new();

/// The app with this process id. Every call waits at most half a second.
pub fn app(pid: i32) -> Option<Cf> {
    TIMEOUT_SET.call_once(|| {
        // SAFETY: the system-wide element, kept for the app's life on purpose.
        unsafe {
            let all = AXUIElementCreateSystemWide();
            if !all.is_null() {
                AXUIElementSetMessagingTimeout(all, TIMEOUT);
            }
        }
    });
    // SAFETY: any pid; a null result means none.
    owned(unsafe { AXUIElementCreateApplication(pid) })
}

/// The app's focused window, else its main window.
pub fn focused_window(app: &Cf) -> Option<Cf> {
    copy(app, "AXFocusedWindow").or_else(|| copy(app, "AXMainWindow"))
}

/// The app's focused window only: none when, in Finder, the desktop has the focus.
pub fn focused_window_only(app: &Cf) -> Option<Cf> {
    copy(app, "AXFocusedWindow")
}

/// The role of the app's focused element ("AXTextField", "AXOutline", …):
/// Ok(None) when nothing is focused, Err when the app did not answer.
pub fn focused_role(app: &Cf) -> Result<Option<String>, ()> {
    match try_copy(app, "AXFocusedUIElement") {
        Ok(el) => string(&el, "AXRole").map(Some).ok_or(()),
        Err(AX_NO_VALUE) => Ok(None),
        Err(_) => Err(()),
    }
}

pub fn title(element: &Cf) -> Option<String> {
    string(element, "AXTitle").filter(|t| !t.is_empty())
}

/// A window's frame in screen coordinates (top left of the main screen).
pub fn frame(window: &Cf) -> Option<Rect> {
    let p = pair(window, "AXPosition", VALUE_POINT)?;
    let s = pair(window, "AXSize", VALUE_SIZE)?;
    Some(Rect { x: p.a, y: p.b, w: s.a, h: s.b })
}

fn settable(element: &Cf, name: &str) -> bool {
    let name = attr(name);
    let mut out = 0u8;
    // SAFETY: an element, a CFString name and a Boolean out.
    let status = unsafe { AXUIElementIsAttributeSettable(element.0, name_ptr(&name), &mut out) };
    status == AX_OK && out != 0
}

/// Moves and sizes a window: position, size, then position again, so a window
/// whose app limits its size still lands where it should. A window whose size
/// can't change only moves. False when it could not even be moved.
pub fn set_frame(window: &Cf, to: Rect, resize: bool) -> bool {
    let at = Pair { a: to.x, b: to.y };
    if !set_pair(window, "AXPosition", VALUE_POINT, at) {
        return false;
    }
    if resize && settable(window, "AXSize") {
        set_pair(window, "AXSize", VALUE_SIZE, Pair { a: to.w, b: to.h });
        set_pair(window, "AXPosition", VALUE_POINT, at);
    }
    true
}

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
    fn AXUIElementPerformAction(element: *const c_void, action: *const c_void) -> i32;
    fn AXUIElementCopyElementAtPosition(app: *const c_void, x: f32, y: f32, out: *mut *const c_void) -> i32;
    fn AXUIElementGetPid(element: *const c_void, pid: *mut i32) -> i32;
    // Not documented by Apple, but stable for years and used by window tools
    // such as AltTab: the window server's number for a window element.
    fn _AXUIElementGetWindow(element: *const c_void, id: *mut u32) -> i32;
    fn AXObserverCreate(pid: i32, callback: ObserverCallback, out: *mut *const c_void) -> i32;
    fn AXObserverAddNotification(observer: *const c_void, element: *const c_void, name: *const c_void, refcon: *mut c_void) -> i32;
    fn AXObserverGetRunLoopSource(observer: *const c_void) -> *mut c_void;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(cf: *const c_void);
    fn CFGetTypeID(cf: *const c_void) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(array: *const c_void) -> isize;
    fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
    fn CFBooleanGetTypeID() -> usize;
    fn CFBooleanGetValue(boolean: *const c_void) -> u8;
    fn CFURLGetTypeID() -> usize;
    fn CFRetain(cf: *const c_void) -> *const c_void;
    static kCFBooleanTrue: *const c_void;
    static kCFBooleanFalse: *const c_void;
    fn CFRunLoopGetMain() -> *mut c_void;
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    static kCFRunLoopDefaultMode: *const c_void;
}

/// An AX observer's callback: observer, element, notification name, refcon.
pub type ObserverCallback = unsafe extern "C" fn(*const c_void, *const c_void, *const c_void, *mut c_void);

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

// An attribute holding an array of elements, each retained on its own.
fn array(element: &Cf, name: &str) -> Vec<Cf> {
    let Some(value) = copy(element, name) else { return Vec::new() };
    // SAFETY: the type check makes the CFArray calls sound; each item is retained
    // before it outlives the array.
    unsafe {
        if CFGetTypeID(value.0) != CFArrayGetTypeID() {
            return Vec::new();
        }
        (0..CFArrayGetCount(value.0))
            .filter_map(|i| owned(CFRetain(CFArrayGetValueAtIndex(value.0, i))))
            .collect()
    }
}

fn boolean(element: &Cf, name: &str) -> Option<bool> {
    let value = copy(element, name)?;
    // SAFETY: the type check makes CFBooleanGetValue sound.
    unsafe { (CFGetTypeID(value.0) == CFBooleanGetTypeID()).then(|| CFBooleanGetValue(value.0) != 0) }
}

fn set_boolean(element: &Cf, name: &str, on: bool) -> bool {
    let name = attr(name);
    // SAFETY: an element, a CFString name and one of the two static CFBooleans.
    unsafe {
        let value = if on { kCFBooleanTrue } else { kCFBooleanFalse };
        AXUIElementSetAttributeValue(element.0, name_ptr(&name), value) == AX_OK
    }
}

fn perform(element: &Cf, action: &str) -> bool {
    let action = attr(action);
    // SAFETY: an element and a CFString action name.
    unsafe { AXUIElementPerformAction(element.0, name_ptr(&action)) == AX_OK }
}

/// An app's windows, every kind (Intip jendela).
pub fn windows(app: &Cf) -> Vec<Cf> {
    array(app, "AXWindows")
}

pub fn children(element: &Cf) -> Vec<Cf> {
    array(element, "AXChildren")
}

/// What a list holds selected: in the Dock's list, the icon under the pointer.
pub fn selected_children(element: &Cf) -> Vec<Cf> {
    array(element, "AXSelectedChildren")
}

pub fn role(element: &Cf) -> Option<String> {
    string(element, "AXRole")
}

pub fn subrole(element: &Cf) -> Option<String> {
    string(element, "AXSubrole")
}

/// A document or app window, not a panel, sheet or menu.
pub fn is_standard(window: &Cf) -> bool {
    subrole(window).as_deref() == Some("AXStandardWindow")
}

pub fn minimized(window: &Cf) -> Option<bool> {
    boolean(window, "AXMinimized")
}

pub fn set_minimized(window: &Cf, on: bool) -> bool {
    set_boolean(window, "AXMinimized", on)
}

/// Brings the window to the front of its app and makes it the app's main window.
pub fn raise(window: &Cf) -> bool {
    let raised = perform(window, "AXRaise");
    set_boolean(window, "AXMain", true);
    raised
}

/// Presses the window's own close button, so the app asks about unsaved work.
pub fn press_close(window: &Cf) -> bool {
    copy(window, "AXCloseButton").is_some_and(|b| perform(&b, "AXPress"))
}

/// The window server's number for this window (kCGWindowNumber).
pub fn window_id(window: &Cf) -> Option<u32> {
    let mut id = 0u32;
    // SAFETY: an element and a u32 out.
    let status = unsafe { _AXUIElementGetWindow(window.0, &mut id) };
    (status == AX_OK && id != 0).then_some(id)
}

/// A file URL attribute ("AXURL", a Dock item's app) as a path.
pub fn url(element: &Cf) -> Option<String> {
    let value = copy(element, "AXURL")?;
    // SAFETY: the type check makes the cast to NSURL (toll-free bridged) sound.
    unsafe {
        if CFGetTypeID(value.0) != CFURLGetTypeID() {
            return None;
        }
        (*(value.0 as *const objc2_foundation::NSURL)).path().map(|p| p.to_string())
    }
}

/// The element of `app` at a point in screen coordinates (top left of the main screen).
pub fn element_at(app: &Cf, x: f64, y: f64) -> Option<Cf> {
    let mut out = std::ptr::null();
    // SAFETY: an element and an out pointer for a +1 element.
    let status = unsafe { AXUIElementCopyElementAtPosition(app.0, x as f32, y as f32, &mut out) };
    if status != AX_OK {
        return None;
    }
    owned(out)
}

/// The process an element belongs to.
pub fn pid(element: &Cf) -> Option<i32> {
    let mut pid = 0;
    // SAFETY: an element and an i32 out.
    (unsafe { AXUIElementGetPid(element.0, &mut pid) } == AX_OK).then_some(pid)
}

/// Accessibility notifications from one app, heard on the main run loop until
/// dropped (Intip jendela's Dock watch). Main thread only.
pub struct Observer {
    observer: Cf,
    source: *mut c_void,
}

impl Observer {
    pub fn new(pid: i32, callback: ObserverCallback) -> Option<Observer> {
        let mut out = std::ptr::null();
        // SAFETY: a pid, a callback with AX's signature and an out pointer for a +1 observer.
        let observer = owned(unsafe { if AXObserverCreate(pid, callback, &mut out) == AX_OK { out } else { std::ptr::null() } })?;
        // SAFETY: the observer's own source (not retained by us), added to the main run loop.
        let source = unsafe { AXObserverGetRunLoopSource(observer.0) };
        if source.is_null() {
            return None;
        }
        unsafe { CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopDefaultMode) };
        Some(Observer { observer, source })
    }

    /// Hears `notification` ("AXSelectedChildrenChanged", …) on `element`.
    pub fn watch(&self, element: &Cf, notification: &str) -> bool {
        let name = attr(notification);
        // SAFETY: the observer, an element of its app and a CFString name.
        unsafe { AXObserverAddNotification(self.observer.0, element.0, name_ptr(&name), std::ptr::null_mut()) == AX_OK }
    }
}

impl Drop for Observer {
    fn drop(&mut self) {
        // SAFETY: the source added in `new`, removed once; the observer is released by Cf.
        unsafe { CFRunLoopRemoveSource(CFRunLoopGetMain(), self.source, kCFRunLoopDefaultMode) };
    }
}

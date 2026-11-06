//! macOS side of Keyboard Cleaning Mode: whether Notching may lock the keyboard
//! (Accessibility), and the way to the setting that allows it.

use std::ffi::c_void;

use objc2::rc::Retained;
use objc2_foundation::{NSDictionary, NSNumber, NSString};

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    static kAXTrustedCheckOptionPrompt: *const c_void;
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn IsSecureEventInputEnabled() -> bool;
}

/// Some app has secure input on, so an event tap would get no keys.
pub fn secure_input() -> bool {
    // SAFETY: no arguments; safe from any thread.
    unsafe { IsSecureEventInputEnabled() }
}

const ACCESSIBILITY_PANE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

/// Whether macOS lets Notching filter keys. `prompt` also shows macOS's own
/// request when it does not.
pub fn trusted(prompt: bool) -> bool {
    if !prompt {
        // SAFETY: no arguments; safe from any thread.
        return unsafe { AXIsProcessTrusted() };
    }
    // SAFETY: the key is a CFStringRef constant, toll-free bridged to NSString.
    let key: &NSString = unsafe { &*(kAXTrustedCheckOptionPrompt as *const NSString) };
    let yes = NSNumber::new_bool(true);
    let options: Retained<NSDictionary<NSString, NSNumber>> = NSDictionary::from_slices(&[key], &[&*yes]);
    // SAFETY: an NSDictionary is a CFDictionaryRef.
    unsafe { AXIsProcessTrustedWithOptions(Retained::as_ptr(&options) as *const c_void) }
}

/// System Settings › Privacy & Security › Accessibility.
#[tauri::command]
pub fn open_accessibility_settings() {
    if let Err(e) = std::process::Command::new("/usr/bin/open").arg(ACCESSIBILITY_PANE).spawn() {
        eprintln!("notching: System Settings did not open: {e}");
    }
}

// CoreGraphics and CoreFoundation, called directly as Keep awake calls IOKit.
#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events: u64,
        callback: extern "C" fn(*mut c_void, u32, *mut c_void, *mut c_void) -> *mut c_void,
        user_info: *mut c_void,
    ) -> *mut c_void;
    fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    fn CGEventGetIntegerValueField(event: *mut c_void, field: u32) -> i64;
    fn CGEventGetFlags(event: *mut c_void) -> u64;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFMachPortCreateRunLoopSource(allocator: *const c_void, port: *mut c_void, order: isize) -> *mut c_void;
    fn CFMachPortInvalidate(port: *mut c_void);
    fn CFRunLoopGetMain() -> *mut c_void;
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
    fn CFRelease(cf: *const c_void);
    static kCFRunLoopCommonModes: *const c_void;
}

const SESSION_TAP: u32 = 1; // kCGSessionEventTap
const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
const FILTER: u32 = 0; // kCGEventTapOptionDefault: may drop events
const KEY_DOWN: u32 = 10;
const KEY_UP: u32 = 11;
const FLAGS_CHANGED: u32 = 12;
const SYSTEM_DEFINED: u32 = 14; // brightness, volume and media keys
const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
const DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
const FIELD_AUTOREPEAT: u32 = 8; // kCGKeyboardEventAutorepeat
const FIELD_KEYCODE: u32 = 9; // kCGKeyboardEventKeycode
const FLAG_COMMAND: u64 = 0x0010_0000; // kCGEventFlagMaskCommand
const KEY_ESCAPE: i64 = 53;
const KEY_Q: i64 = 12;

/// What a key the tap swallows means to the mode.
#[derive(Debug, PartialEq, Eq)]
pub enum Key {
    Escape,
    Quit,
    Other,
}

/// Esc (not held down) and Cmd+Q matter; every other event is only swallowed.
pub fn classify(kind: u32, keycode: i64, flags: u64, autorepeat: bool) -> Key {
    match (kind, keycode) {
        (KEY_DOWN, KEY_ESCAPE) if !autorepeat => Key::Escape,
        (KEY_DOWN, KEY_Q) if flags & FLAG_COMMAND != 0 => Key::Quit,
        _ => Key::Other,
    }
}

// Where swallowed keys go; set by the one live tap.
static ON_KEY: std::sync::Mutex<Option<fn(Key)>> = std::sync::Mutex::new(None);
static PORT: std::sync::atomic::AtomicPtr<c_void> = std::sync::atomic::AtomicPtr::new(std::ptr::null_mut());
static REVIVE: std::sync::Mutex<crate::tap_rules::Revive> = std::sync::Mutex::new(crate::tap_rules::Revive::new());

extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: *mut c_void, _info: *mut c_void) -> *mut c_void {
    if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
        let port = PORT.load(std::sync::atomic::Ordering::SeqCst);
        // Left off, the lock simply stops holding keys: the Mac stays usable.
        if !port.is_null() && crate::tap_guard::revive(&REVIVE, "keyboard lock", kind) {
            // SAFETY: the port lives until the tap is dropped, which clears PORT first.
            unsafe { CGEventTapEnable(port, true) };
        }
        return event;
    }
    // SAFETY: `event` is the CGEventRef the tap was handed.
    let (keycode, flags, autorepeat) = unsafe {
        (
            CGEventGetIntegerValueField(event, FIELD_KEYCODE),
            CGEventGetFlags(event),
            CGEventGetIntegerValueField(event, FIELD_AUTOREPEAT) != 0,
        )
    };
    let key = classify(kind, keycode, flags, autorepeat);
    if key != Key::Other {
        // Copied out first: the fifth Esc drops the tap, whose Drop takes this lock.
        let handler = *ON_KEY.lock().unwrap();
        if let Some(f) = handler {
            f(key);
        }
    }
    std::ptr::null_mut()
}

/// The keyboard lock: an event tap on the main run loop that drops every key,
/// brightness, volume and media event while it lives.
pub struct Tap {
    port: *mut c_void,
    source: *mut c_void,
}

// SAFETY: the port and source are only added to and removed from the main run
// loop, which CoreFoundation allows from any thread.
unsafe impl Send for Tap {}

impl Tap {
    /// None when macOS refuses it (no Accessibility permission).
    pub fn install(on_key: fn(Key)) -> Option<Tap> {
        let mask = [KEY_DOWN, KEY_UP, FLAGS_CHANGED, SYSTEM_DEFINED].iter().fold(0u64, |m, k| m | (1 << k));
        // SAFETY: plain CoreGraphics and CoreFoundation calls with checked results.
        unsafe {
            let port = CGEventTapCreate(SESSION_TAP, HEAD_INSERT, FILTER, mask, on_event, std::ptr::null_mut());
            if port.is_null() {
                return None;
            }
            let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
            if source.is_null() {
                CFMachPortInvalidate(port);
                CFRelease(port);
                return None;
            }
            *ON_KEY.lock().unwrap() = Some(on_key);
            crate::tap_guard::fresh(&REVIVE);
            PORT.store(port, std::sync::atomic::Ordering::SeqCst);
            CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
            CGEventTapEnable(port, true);
            Some(Tap { port, source })
        }
    }
}

impl Drop for Tap {
    fn drop(&mut self) {
        // Only while this tap is the live one: a newer tap keeps its handler.
        let ours = PORT
            .compare_exchange(self.port, std::ptr::null_mut(), std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst)
            .is_ok();
        if ours {
            *ON_KEY.lock().unwrap() = None;
        }
        // SAFETY: both were created by `install` and are released once, here.
        unsafe {
            CGEventTapEnable(self.port, false);
            CFRunLoopRemoveSource(CFRunLoopGetMain(), self.source, kCFRunLoopCommonModes);
            CFMachPortInvalidate(self.port);
            CFRelease(self.source);
            CFRelease(self.port);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn esc_and_cmd_q_are_the_keys_that_matter() {
        assert_eq!(classify(KEY_DOWN, KEY_ESCAPE, 0, false), Key::Escape);
        // Held down, Esc counts once.
        assert_eq!(classify(KEY_DOWN, KEY_ESCAPE, 0, true), Key::Other);
        assert_eq!(classify(KEY_UP, KEY_ESCAPE, 0, false), Key::Other);
        assert_eq!(classify(KEY_DOWN, KEY_Q, FLAG_COMMAND, false), Key::Quit);
        assert_eq!(classify(KEY_DOWN, KEY_Q, 0, false), Key::Other);
        assert_eq!(classify(SYSTEM_DEFINED, 0, 0, false), Key::Other);
    }
}

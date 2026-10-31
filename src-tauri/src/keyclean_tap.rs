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

// Camera access for Cermin, shown on the settings window's Izin page beside the other three.
// WebKit asks macOS the first time a page opens the camera; this only reads the answer.
use std::process::Command;

use objc2::{class, msg_send};
use objc2_foundation::NSString;

const CAMERA_PANE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera";

// AVAuthorizationStatusAuthorized.
const AUTHORIZED: isize = 3;

#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {}

/// macOS lets Notching use the camera right now. Never prompts.
pub fn camera_access() -> bool {
    // AVMediaTypeVideo is the string "vide".
    let video = NSString::from_str("vide");
    let status: isize = unsafe { msg_send![class!(AVCaptureDevice), authorizationStatusForMediaType: &*video] };
    status == AUTHORIZED
}

/// System Settings › Privacy & Security › Camera.
#[tauri::command]
pub fn open_camera_settings() {
    if let Err(e) = Command::new("/usr/bin/open").arg(CAMERA_PANE).spawn() {
        eprintln!("notching: System Settings did not open: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // AVCaptureDevice is found and answers without a prompt, whatever the answer is.
    #[test]
    fn reads_the_camera_answer_without_asking() {
        let _ = camera_access();
    }
}

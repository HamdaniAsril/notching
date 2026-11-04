//! The background tools together (design 4 Nov, alat latar): what happens when
//! one is switched, installed or uninstalled.

use tauri::AppHandle;

/// A module changed. A tool switched on without Accessibility asks macOS to
/// show its own request (§4).
pub fn module_changed(app: &AppHandle, id: &str, on: bool) {
    let tool = id == crate::win_service::MODULE_ID;
    if !tool {
        return;
    }
    crate::win_service::module_changed(app, id);
    if on && !crate::keyclean_tap::trusted(false) {
        crate::keyclean_tap::trusted(true);
    }
}

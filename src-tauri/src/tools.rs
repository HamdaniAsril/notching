//! The background tools together (design 4 Nov, alat latar): what happens when
//! one is switched, installed or uninstalled, or when Settings opens.

use tauri::AppHandle;

const TOOLS: [&str; 2] = [crate::cut_service::MODULE_ID, crate::win_service::MODULE_ID];

/// A module changed. A tool switched on without Accessibility asks macOS to
/// show its own request (§4).
pub fn module_changed(app: &AppHandle, id: &str, on: bool) {
    // Keep awake's and Shelf's keys follow their modules too, and so does
    // Shelf's drag watcher.
    crate::app_keys_service::module_changed(app, id);
    if id == crate::shelf_service::MODULE_ID {
        crate::shelf_watch::sync(app);
    }
    if id == crate::peek_service::MODULE_ID {
        crate::peek_service::sync(app);
        if on && !crate::keyclean_tap::trusted(false) {
            crate::keyclean_tap::trusted(true);
            crate::peek_service::no_access(app);
        }
    }
    if !TOOLS.contains(&id) {
        return;
    }
    crate::win_service::module_changed(app, id);
    if id == crate::cut_service::MODULE_ID {
        crate::cut_service::sync(app);
    }
    if on && !crate::keyclean_tap::trusted(false) {
        crate::keyclean_tap::trusted(true);
    }
}

/// Settings opened, often right after the permission was given: the tap again.
pub fn settings_opened(app: &AppHandle) {
    crate::cut_service::sync(app);
    crate::peek_service::sync(app);
}

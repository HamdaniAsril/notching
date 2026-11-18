//! Fokus jendela's native side (design 18 Nov): the blur layer, its keys, and
//! following the window in use. Filled in by Task 8 of the plan.

use tauri::AppHandle;

pub const MODULE_ID: &str = "window-focus";

/// ⌃⌥F (`add` false) or ⌃⌥⇧F (`add` true) was pressed.
pub fn pressed(_app: &AppHandle, _add: bool) {}

/// Brings the blur in line with the tool and its settings.
pub fn sync(_app: &AppHandle) {}
